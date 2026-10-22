/**
 * WelcomeCableScene — light-premium 3D cinematic gallery for the PWI welcome.
 *
 * Replaces the old dark cable close-up with an edge-to-edge WebGL "showroom":
 *   - 16 volumetric floating panels arranged in a circular gallery, each one
 *     textured with a division photo (the same sequence track the 2D slideshow
 *     and the showcase caption use — one source of truth);
 *   - the camera executes a continuous 16-step loop: every ~6 s the host hands
 *     the next index via setActive(), and the camera smoothly rotates / dollies
 *     / cranes to bring that panel into full view (2.6 s eased glide + idle sway)
 *     with a per-step motion style so it pans, glides and arcs in turn;
 *   - independent ambient machine motion on the deck between the panels:
 *     rotating wire-drawing roller pairs, turning spoke wheels, sliding inner
 *     wire bundles with scrolling braid texture and slow-turning conduit drums;
 *   - subtle golden particles (fine dust + soft sparkles) drifting in depth;
 *   - a light studio look: PMREM soft-box environment, hemisphere + key light,
 *     a roaming warm-gold light and a dedicated "active panel" light that
 *     eases toward the current panel and makes its frame glow as it arrives.
 *
 * Design notes:
 *   - The canvas is OPAQUE (clear #e9eef4). It visually replaces the 2D
 *     slideshow underneath (z0) while that slideshow keeps running, so the
 *     shared 6-second cadence and the arrows/dots stay in sync — and if WebGL
 *     is unavailable or reduced-motion is on, the component never mounts the
 *     canvas and the 2D slideshow remains the automatic fallback.
 *   - No post-processing chain. One render pass, DPR capped at 1.5, a 2.3 Mpx
 *     budget, no shadows: photo textures are downscaled to 1280 px on load, so
 *     sixteen 2560x1440 JPEGs never sit in VRAM at full size.
 *   - Self-contained: no DOM lookups beyond image loading, no global listeners.
 *     The caller gets a handle back and drives resize/start/stop/setActive.
 *
 * QA hook: window.__pwiWgl3d = { ready, panelCount, texturesLoaded, step, cam,
 * particles, disposed } — read by scratch/cable-3d/qa-welcome2.mjs.
 */

import * as THREE from 'three';

export interface CableSceneOptions {
  /** Render a single static frame instead of starting the rAF loop. */
  reducedMotion?: boolean;
  /** Accent colour (from `--theme-accent`) used for panel LED strips. */
  accent?: string;
  /**
   * The 16 division photos, in sequence order. Panel i receives source i as
   * its texture. Falls back to a frosted-silver placeholder when omitted.
   */
  panelSources?: string[];
}

export interface CableSceneHandle {
  /** (Re)size the renderer + camera; safe to call every frame if needed. */
  resize(width: number, height: number): void;
  /** Start (or resume) the rAF loop. */
  start(): void;
  /** Stop the rAF loop (tab hidden / unmount). */
  stop(): void;
  /** Render one frame at `seconds` without starting the loop (still shots). */
  renderOnce(seconds?: number): void;
  /** Glide the camera to panel `index` (wraps modulo panel count). */
  setActive(index: number): void;
  /** Release every GPU resource and the QA debug handle. */
  dispose(): void;
}

/* ----------------------------------------------------------------- tuning */
const TAU = Math.PI * 2;
const FOV = 40;
const RING_RADIUS = 26; // panels sit on this circle, camera lives inside it
const PANEL_W = 9.2; // 16:9 volumetric panel
const PANEL_H = 5.175;
const PANEL_D = 0.34;
const PANEL_Y = 0.55;
const CAM_RADIUS = 15;
const CAM_Y = 0.55;
const PROP_RADIUS = 23.5; // machine deck slightly in front of the panel ring
const PROP_Y = -2.4;
const FLOOR_Y = -3.35;
const TRANSITION_S = 2.6; // camera glide length (cadence itself = 6 s, host-driven)
const TEXTURE_MAX_W = 1280; // downscale panel photos before they hit the GPU
const DUST_COUNT = 150;
const SPARK_COUNT = 26;

const COL_CLEAR = 0xe9eef4;
const COL_GOLD = 0xd4af37;

const easeInOutCubic = (k: number) =>
  k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------- canvas texture helpers */
const makePlaceholderTexture = (): THREE.CanvasTexture | null => {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 288;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 512, 288);
  g.addColorStop(0, '#eef2f7');
  g.addColorStop(0.55, '#cdd6e0');
  g.addColorStop(1, '#adb8c4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 288);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(60, 288);
  ctx.lineTo(280, 0);
  ctx.lineTo(370, 0);
  ctx.lineTo(150, 288);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  return new THREE.CanvasTexture(c);
};

/** Soft round sprite for particles / contact shadows. */
const makeDotTexture = (): THREE.CanvasTexture | null => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
};

/** Diagonal silver braid stripes for the sliding inner wires (scrollable). */
const makeStripeTexture = (): THREE.CanvasTexture | null => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#cfd7e0';
  ctx.fillRect(0, 0, 128, 16);
  for (let i = -2; i < 12; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#eef2f7' : '#8d99a5';
    ctx.beginPath();
    ctx.moveTo(i * 14, 0);
    ctx.lineTo(i * 14 + 7, 0);
    ctx.lineTo(i * 14 + 22, 16);
    ctx.lineTo(i * 14 + 15, 16);
    ctx.closePath();
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
};

/** Dark dashed drum skin for the conduit coiling drums. */
const makeDrumTexture = (): THREE.CanvasTexture | null => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#232a33';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#454e59';
  for (let i = 0; i < 8; i += 1) ctx.fillRect(i * 8, 0, 4, 64);
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(0, 30, 64, 2);
  return new THREE.CanvasTexture(c);
};

/* =========================================================== scene factory */
export const createCableScene = (
  canvas: HTMLCanvasElement,
  options: CableSceneOptions = {},
): CableSceneHandle | null => {
  const { reducedMotion = false, panelSources = [] } = options;
  const accent = new THREE.Color(options.accent || '#d4af37');
  const N = Math.max(1, panelSources.length || 16);

  /* ---------------------------------------------------------- renderer */
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch {
    return null; // no WebGL: host removes the canvas, 2D slideshow stays
  }
  renderer.setClearColor(COL_CLEAR, 1);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL_CLEAR);
  scene.fog = new THREE.FogExp2(COL_CLEAR, 0.006);

  const camera = new THREE.PerspectiveCamera(FOV, 1.78, 0.3, 160);
  const lookTarget = new THREE.Vector3();

  /* ------------------------------------------------- light studio env */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomScene = new THREE.Scene();
  roomScene.background = new THREE.Color(0.6, 0.63, 0.68);
  const lightPlane = (color: [number, number, number], y: number, up: boolean) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    m.material.color.setRGB(color[0], color[1], color[2]);
    m.rotation.x = up ? Math.PI / 2 : -Math.PI / 2;
    m.position.y = y;
    roomScene.add(m);
  };
  lightPlane([3.0, 3.0, 3.15], 4, false); // big white soft-box above
  lightPlane([1.15, 1.15, 1.2], -2, true); // floor bounce
  const sideStrip = (color: [number, number, number], x: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 8),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    m.material.color.setRGB(color[0], color[1], color[2]);
    m.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    m.position.set(x, 1, 0);
    roomScene.add(m);
  };
  sideStrip([2.5, 1.95, 1.05], 4.5); // warm gold strip
  sideStrip([1.5, 1.75, 2.15], -4.5); // cool silver fill
  const env = pmrem.fromScene(roomScene, 0.04).texture;
  scene.environment = env;
  pmrem.dispose();
  roomScene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    if (m.material) (m.material as THREE.Material).dispose();
  });

  /* ----------------------------------------------------------- lights */
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa8b6c6, 1.05));
  const key = new THREE.DirectionalLight(0xfff3e2, 1.7);
  key.position.set(16, 22, 9);
  scene.add(key);
  const goldLight = new THREE.PointLight(COL_GOLD, 70, 60, 2);
  scene.add(goldLight);
  const panelLight = new THREE.PointLight(0xfff3dc, 85, 30, 2);
  panelLight.position.set(0, PANEL_Y + 1.4, RING_RADIUS - 5.5);
  scene.add(panelLight);

  /* --------------------------------------------------- shared resources */
  const placeholderTex = makePlaceholderTexture();
  const dotTex = makeDotTexture();
  const stripeTex = makeStripeTexture();
  const drumTex = makeDrumTexture();
  const managedTextures: THREE.Texture[] = [placeholderTex, dotTex, stripeTex, drumTex].filter(
    (t): t is THREE.CanvasTexture => t !== null,
  );

  const sideMat = new THREE.MeshStandardMaterial({
    color: 0xc9cfd8,
    metalness: 0.85,
    roughness: 0.38,
    envMapIntensity: 0.9,
  });
  const backMat = new THREE.MeshStandardMaterial({
    color: 0x9aa4b0,
    metalness: 0.8,
    roughness: 0.5,
    envMapIntensity: 0.8,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xc3ccd6,
    metalness: 0.9,
    roughness: 0.32,
    envMapIntensity: 1,
  });
  const steelDarkMat = new THREE.MeshStandardMaterial({
    color: 0x5f6a76,
    metalness: 0.75,
    roughness: 0.45,
    envMapIntensity: 0.9,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x46515e,
    metalness: 0.55,
    roughness: 0.6,
    envMapIntensity: 0.7,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x232a33,
    metalness: 0.2,
    roughness: 0.85,
    envMapIntensity: 0.4,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: COL_GOLD,
    metalness: 1,
    roughness: 0.28,
    emissive: accent.clone().multiplyScalar(0.35),
    emissiveIntensity: 0.5,
    envMapIntensity: 1,
  });
  const brightMat = new THREE.MeshStandardMaterial({
    color: 0xe9eff5,
    metalness: 0.92,
    roughness: 0.22,
    envMapIntensity: 1.1,
  });

  /* ------------------------------------------------------- 16 panels */
  interface PanelEntry {
    group: THREE.Group;
    frontMat: THREE.MeshStandardMaterial;
    phase: number;
    freq: number;
  }
  const panels: PanelEntry[] = [];
  const panelGeo = new THREE.BoxGeometry(PANEL_W, PANEL_H, PANEL_D);
  const stripGeo = new THREE.BoxGeometry(PANEL_W * 0.88, 0.07, 0.07);
  const shadowGeo = new THREE.PlaneGeometry(7.2, 2.6);

  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * TAU;
    const frontMat = new THREE.MeshStandardMaterial({
      color: 0xb9c2cc,
      map: placeholderTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: placeholderTex,
      emissiveIntensity: 0.1,
      roughness: 0.55,
      metalness: 0,
      envMapIntensity: 0.55,
    });
    const group = new THREE.Group();
    group.position.set(Math.sin(a) * RING_RADIUS, PANEL_Y, Math.cos(a) * RING_RADIUS);
    group.rotation.y = a + Math.PI; // front face points at the camera hub

    const box = new THREE.Mesh(panelGeo, [
      sideMat,
      sideMat,
      sideMat,
      sideMat,
      frontMat, // +z = front (photo)
      backMat,
    ]);
    group.add(box);

    const strip = new THREE.Mesh(stripGeo, goldMat);
    strip.position.set(0, -PANEL_H / 2 - 0.06, PANEL_D / 2 + 0.02);
    group.add(strip);

    scene.add(group);

    // contact shadow pooled on the deck below the panel
    if (dotTex) {
      const shadow = new THREE.Mesh(
        shadowGeo,
        new THREE.MeshBasicMaterial({
          map: dotTex,
          color: 0x22303f,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(
        Math.sin(a) * (RING_RADIUS - 0.4),
        FLOOR_Y + 0.012,
        Math.cos(a) * (RING_RADIUS - 0.4),
      );
      scene.add(shadow);
    }

    panels.push({ group, frontMat, phase: i * 1.71, freq: 0.42 + (i % 5) * 0.05 });
  }

  /* -------------------------------------------- panel photo loading */
  let texturesLoaded = 0;
  let texturesSettled = 0;
  let renderedOnce = false;
  let ready = false;

  const loadPanelTexture = (index: number, url: string) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const scale = Math.min(1, TEXTURE_MAX_W / (img.naturalWidth || TEXTURE_MAX_W));
        const c = document.createElement('canvas');
        c.width = Math.max(2, Math.round((img.naturalWidth || 2) * scale));
        c.height = Math.max(2, Math.round((img.naturalHeight || 2) * scale));
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const tex = new THREE.CanvasTexture(c);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          managedTextures.push(tex);
          const front = panels[index].frontMat;
          front.map = tex;
          front.emissiveMap = tex;
          front.color.set(0xffffff);
          front.needsUpdate = true;
          texturesLoaded += 1;
        }
      } catch {
        /* keep the frosted placeholder */
      }
      texturesSettled += 1;
    };
    img.onerror = () => {
      texturesSettled += 1;
    };
    img.src = url;
  };

  panelSources.slice(0, N).forEach((src, i) => loadPanelTexture(i, src));

  /* -------------------------------------- ambient machine components */
  const spinners: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }[] = [];
  const sliders: {
    obj: THREE.Mesh;
    baseX: number;
    phase: number;
    tex: THREE.Texture | null;
  }[] = [];

  /** Pair of grooved drawing rollers (capstans) with a wire running through. */
  const makeRollerPair = (): THREE.Group => {
    const g = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 0.5), deckMat);
    stand.position.set(0, -1.0, -0.32);
    g.add(stand);
    [-0.62, 0.62].forEach((x, idx) => {
      const wheel = new THREE.Group();
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.17, 10, 28), steelMat);
      wheel.add(rim);
      for (let s = 0; s < 6; s += 1) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.94, 0.07), steelDarkMat);
        spoke.rotation.z = (s / 6) * Math.PI;
        wheel.add(spoke);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.26, 14), goldMat);
      hub.rotation.x = Math.PI / 2;
      wheel.add(hub);
      wheel.position.set(x, 0.12, 0);
      g.add(wheel);
      spinners.push({ obj: wheel, axis: 'z', speed: idx ? -1.15 : 1.45 });
    });
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.7, 8), brightMat);
    wire.rotation.z = Math.PI / 2;
    wire.position.set(0, 0.12, 0.22);
    g.add(wire);
    return g;
  };

  /** Turning motorcycle spoke wheel (rim + laced spokes + hub). */
  const makeSpokeWheel = (): THREE.Group => {
    const g = new THREE.Group();
    const spinner = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.06, 8, 36), steelMat);
    spinner.add(rim);
    for (let s = 0; s < 14; s += 1) {
      const a = (s / 14) * TAU;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 6), brightMat);
      spoke.position.set(Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0);
      spoke.rotation.z = a + Math.PI / 2 + (s % 2 ? 0.22 : -0.22);
      spinner.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.16, 14), goldMat);
    hub.rotation.x = Math.PI / 2;
    spinner.add(hub);
    g.add(spinner);
    spinners.push({ obj: spinner, axis: 'z', speed: 0.42 });
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.24), deckMat);
    fork.position.set(0, -0.9, -0.18);
    g.add(fork);
    return g;
  };

  /** Inner wire bundle: five braided strands sliding through an eyelet. */
  const makeWireBundle = (): THREE.Group => {
    const g = new THREE.Group();
    const eyelet = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.95, 0.95), deckMat);
    eyelet.position.x = -1.2;
    g.add(eyelet);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 8, 18), steelMat);
    eye.position.x = -1.05;
    g.add(eye);
    for (let i = 0; i < 5; i += 1) {
      const tex = stripeTex ? stripeTex.clone() : null;
      if (tex) {
        tex.needsUpdate = true;
        tex.wrapS = THREE.RepeatWrapping;
        tex.repeat.set(3, 1);
        managedTextures.push(tex);
      }
      const wire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 2.3, 10),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: tex,
          metalness: 0.88,
          roughness: 0.3,
          envMapIntensity: 1,
        }),
      );
      wire.rotation.z = Math.PI / 2;
      const baseX = 0.15;
      wire.position.set(baseX, -0.3 + i * 0.15, (i % 2) * 0.12);
      g.add(wire);
      sliders.push({ obj: wire, baseX, phase: i * 1.27, tex });
    }
    return g;
  };

  /** Slow-turning conduit coiling drum with a black tube tail. */
  const makeConduitDrum = (): THREE.Group => {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 0.5), deckMat);
    frame.position.set(0, -1.0, -0.3);
    g.add(frame);
    const axle = new THREE.Group();
    axle.rotation.z = Math.PI / 2; // cylinder axis now runs along local X
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.82, 1.5, 26),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: drumTex,
        metalness: 0.4,
        roughness: 0.7,
        envMapIntensity: 0.6,
      }),
    );
    axle.add(drum);
    [0.78, -0.78].forEach((y) => {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.94, 0.94, 0.09, 26), steelDarkMat);
      cap.position.y = y;
      axle.add(cap);
    });
    g.add(axle);
    spinners.push({ obj: axle, axis: 'y', speed: 0.5 });
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.13, 10, 22, Math.PI * 1.2), rubberMat);
    tail.position.set(1.05, -0.42, 0.1);
    tail.rotation.y = Math.PI / 2;
    g.add(tail);
    return g;
  };

  const propBuilders = [makeRollerPair, makeSpokeWheel, makeWireBundle, makeConduitDrum];
  for (let k = 0; k < N; k += 1) {
    const a = (k + 0.5) * (TAU / N); // between the panels, never blocking one
    const prop = propBuilders[k % propBuilders.length]();
    prop.position.set(Math.sin(a) * PROP_RADIUS, PROP_Y, Math.cos(a) * PROP_RADIUS);
    prop.rotation.y = a + Math.PI;
    scene.add(prop);
    if (dotTex) {
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 1.4),
        new THREE.MeshBasicMaterial({
          map: dotTex,
          color: 0x22303f,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(
        Math.sin(a) * PROP_RADIUS,
        FLOOR_Y + 0.01,
        Math.cos(a) * PROP_RADIUS,
      );
      scene.add(shadow);
    }
  }

  /* ------------------------------------------------------ deck + ring */
  const floorGeo = new THREE.CircleGeometry(46, 64);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(
    floorGeo,
    new THREE.MeshStandardMaterial({
      color: 0xdfe5ec,
      metalness: 0.2,
      roughness: 0.55,
      envMapIntensity: 0.6,
    }),
  );
  floor.position.y = FLOOR_Y;
  scene.add(floor);
  const ringGeo = new THREE.RingGeometry(25.35, 25.75, 96);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: COL_GOLD,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
  ring.position.y = FLOOR_Y + 0.015;
  scene.add(ring);

  /* ----------------------------------------------------- particles */
  interface DustField {
    points: THREE.Points;
    base: Float32Array;
    speed: Float32Array;
    phase: Float32Array;
  }
  const makeDust = (count: number, size: number, opacity: number): DustField | null => {
    if (!dotTex) return null;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const r = 5 + Math.random() * 19;
      const a = Math.random() * TAU;
      base[i * 3] = Math.sin(a) * r;
      base[i * 3 + 1] = -3 + Math.random() * 10.5;
      base[i * 3 + 2] = Math.cos(a) * r;
      pos.set([base[i * 3], base[i * 3 + 1], base[i * 3 + 2]], i * 3);
      speed[i] = 0.09 + Math.random() * 0.16;
      phase[i] = Math.random() * TAU;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size,
      map: dotTex,
      color: 0xd9b84a,
      transparent: true,
      opacity,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    return { points, base, speed, phase };
  };
  const dust = makeDust(DUST_COUNT, 0.12, 0.8);
  const sparks = makeDust(SPARK_COUNT, 0.3, 0.42);

  /* --------------------------------------------------- camera director */
  interface CamState {
    az: number;
    r: number;
    y: number;
  }
  const pos: CamState = { az: 0, r: CAM_RADIUS, y: CAM_Y };
  let from: CamState = { ...pos };
  let to: CamState = { ...pos };
  let tStart = -1;
  let moving = false;
  let active = 0;

  const setActive = (index: number) => {
    const i = ((Math.round(index) % N) + N) % N;
    active = i;
    const target = (i / N) * TAU;
    let d = target - pos.az;
    d = (((d % TAU) + TAU + Math.PI) % TAU) - Math.PI; // shortest arc
    const style = i % 3;
    from = { ...pos };
    to = {
      az: pos.az + d,
      r: style === 1 ? CAM_RADIUS - 1.4 : CAM_RADIUS, // glide: dolly in
      y: style === 2 ? CAM_Y + 0.85 : CAM_Y, // arc: crane up
    };
    tStart = clock;
    moving = true;
  };

  const tickCamera = (t: number) => {
    if (moving) {
      const k = clamp((t - tStart) / TRANSITION_S, 0, 1);
      const e = easeInOutCubic(k);
      pos.az = from.az + (to.az - from.az) * e;
      pos.r = from.r + (to.r - from.r) * e;
      pos.y = from.y + (to.y - from.y) * e;
      if (k >= 1) moving = false;
    }
    const sway = Math.sin(t * 0.23) * 0.013 + Math.sin(t * 0.11 + 1.7) * 0.009;
    const bob = Math.sin(t * 0.31 + 0.9) * 0.05;
    camera.position.set(
      Math.sin(pos.az + sway) * pos.r,
      pos.y + bob,
      Math.cos(pos.az + sway) * pos.r,
    );
    lookTarget.set(
      Math.sin(pos.az) * RING_RADIUS * 0.995,
      PANEL_Y + bob * 0.35,
      Math.cos(pos.az) * RING_RADIUS * 0.995,
    );
    camera.lookAt(lookTarget);
  };

  /* --------------------------------------------------- frame contents */
  const tickScene = (t: number, dt: number) => {
    // panels: gentle float + active-frame glow
    for (let i = 0; i < panels.length; i += 1) {
      const p = panels[i];
      p.group.position.y = PANEL_Y + Math.sin(t * p.freq + p.phase) * 0.13;
      p.group.rotation.z = Math.sin(t * p.freq * 0.8 + p.phase) * 0.008;
      const targetEm =
        i === active ? 0.26 + Math.sin(t * 1.9 + p.phase) * 0.04 : 0.1;
      p.frontMat.emissiveIntensity +=
        (targetEm - p.frontMat.emissiveIntensity) * (1 - Math.exp(-dt * 3));
    }

    // machine components: rollers/wheels turn, wires slide + braid scrolls
    for (const s of spinners) {
      if (s.axis === 'z') s.obj.rotation.z += s.speed * dt;
      else if (s.axis === 'y') s.obj.rotation.y += s.speed * dt;
      else s.obj.rotation.x += s.speed * dt;
    }
    for (const s of sliders) {
      s.obj.position.x = s.baseX + Math.sin(t * 0.7 + s.phase) * 0.24;
      if (s.tex) s.tex.offset.x = (t * 0.14 + s.phase * 0.08) % 1;
    }

    // golden particles drifting
    [dust, sparks].forEach((field, fi) => {
      if (!field) return;
      const arr = (field.points.geometry.getAttribute('position') as THREE.BufferAttribute)
        .array as Float32Array;
      for (let i = 0; i < field.speed.length; i += 1) {
        let y = arr[i * 3 + 1] + field.speed[i] * dt * (fi ? 0.6 : 1);
        if (y > 7.6) y = -3;
        arr[i * 3 + 1] = y;
        arr[i * 3] = field.base[i * 3] + Math.sin(t * 0.5 + field.phase[i]) * 0.35;
        arr[i * 3 + 2] = field.base[i * 3 + 2] + Math.cos(t * 0.4 + field.phase[i]) * 0.35;
      }
      (field.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    });

    // lights: gold roamer + active panel light easing toward the current panel
    goldLight.position.set(
      Math.sin(t * 0.11) * 17,
      3.2 + Math.sin(t * 0.07) * 1.2,
      Math.cos(t * 0.11) * 17,
    );
    const la = (active / N) * TAU;
    const lt = new THREE.Vector3(
      Math.sin(la) * (RING_RADIUS - 5.5),
      PANEL_Y + 1.4,
      Math.cos(la) * (RING_RADIUS - 5.5),
    );
    panelLight.position.lerp(lt, 1 - Math.exp(-dt * 2.4));
    panelLight.intensity = 85 + Math.sin(t * 1.7) * 12;
  };

  /* ------------------------------------------------------ render loop */
  let clock = 0; // scene time (seconds), advanced by start()/renderOnce
  let raf = 0;
  let running = false;
  let last = 0;

  const debug = {
    ready: false,
    panelCount: N,
    texturesLoaded: 0,
    step: 0,
    cam: [0, 0, 0],
    particles: DUST_COUNT + SPARK_COUNT,
    disposed: false,
  };
  const setDebugHandle = () => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __pwiWgl3d?: typeof debug }).__pwiWgl3d = debug;
    }
  };
  setDebugHandle();

  const frame = (t: number, dt: number) => {
    tickCamera(t);
    tickScene(t, dt);
    renderer.render(scene, camera);
    renderedOnce = true;
    debug.step = active;
    debug.cam = [
      Number(camera.position.x.toFixed(3)),
      Number(camera.position.y.toFixed(3)),
      Number(camera.position.z.toFixed(3)),
    ];
    debug.texturesLoaded = texturesLoaded;
    if (!ready && texturesSettled >= N && renderedOnce) {
      ready = true;
      debug.ready = true;
    }
  };

  /* public API ------------------------------------------------------- */
  const resize = (width: number, height: number) => {
    const w = Math.max(1, Math.round(width) || 1280);
    const h = Math.max(1, Math.round(height) || 720);
    let dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5);
    const budget = w * h * dpr * dpr;
    if (budget > 2300000) dpr *= Math.sqrt(2300000 / budget);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = clamp(w / h, 0.42, 3);
    camera.updateProjectionMatrix();
  };

  const renderOnce = (seconds = 0) => {
    const t = Number.isFinite(seconds) ? seconds : 0;
    clock = t;
    last = t;
    tickCamera(t);
    tickScene(t, 1 / 60);
    renderer.render(scene, camera);
    renderedOnce = true;
    debug.step = active;
    debug.cam = [
      Number(camera.position.x.toFixed(3)),
      Number(camera.position.y.toFixed(3)),
      Number(camera.position.z.toFixed(3)),
    ];
    debug.texturesLoaded = texturesLoaded;
    if (texturesSettled >= N) {
      ready = true;
      debug.ready = true;
    }
  };

  const start = () => {
    if (running || reducedMotion) return;
    running = true;
    last = 0;
    const tick = (nowMs: number) => {
      if (!running) return;
      const now = nowMs / 1000;
      const dt = last ? Math.min(0.1, Math.max(0.001, now - last)) : 1 / 60;
      last = now;
      clock = now;
      frame(now, dt);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
  };

  const stop = () => {
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  };

  const dispose = () => {
    stop();
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    managedTextures.forEach((tex) => tex.dispose());
    env.dispose();
    renderer.dispose();
    debug.disposed = true;
    if (typeof window !== 'undefined' && (window as unknown as { __pwiWgl3d?: unknown }).__pwiWgl3d === debug) {
      delete (window as unknown as { __pwiWgl3d?: unknown }).__pwiWgl3d;
    }
  };

  // Initial facing: panel 0, one still frame, then the host starts the loop.
  setActive(0);
  renderOnce(0);

  return { resize, start, stop, renderOnce, setActive, dispose };
};
