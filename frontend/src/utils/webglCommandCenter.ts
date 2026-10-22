/**
 * webglCommandCenter — the "Enterprise Command Center" WebGL scene that backs
 * the PWI auth screens (Login / Forgot Password / Reset Password).
 *
 * An edge-to-edge industrial hall rendered in Three.js:
 *   - a structural back wall with pilasters, a header beam and a gold LED
 *     strip, side walls, and structural columns;
 *   - a seam-marked concrete floor (procedural slab-joint texture);
 *   - two heavy-duty storage racks along the side bays loaded with wire rod
 *     coils, plus floor coil stacks and upright leaning coils in the front
 *     yard;
 *   - two wire treatment modules (capstans slowly turning for ambient life);
 *   - golden dust drifting through the depth of the hall.
 *
 * THEME ENGINE (the point of this file): every material, light and the sky
 * gradient are bound to a `Look` derived from the central CSS theme state.
 * `setTheme(mode)` starts a 0.8 s eased cross-fade (matching the CSS 0.8 s
 * structural transition in auth.css) that retunes, per frame:
 *   - Light: sky #f5f5f7 → #e4e4e9 silver-slate gradient, racks in polished
 *     brushed aluminum, coils in bright silver/chrome (roughness 0.07,
 *     envMapIntensity 1.55 → sharp edge reflections), ambient hemisphere
 *     brightens to 1.15.
 *   - Dark: carbon/slate tones, charcoal racks, darker steel coils with
 *     tactical highlights and a stronger gold accent light.
 * The fade starts on the very next frame after setTheme() (zero latency) and
 * keeps interpolating from wherever a mid-flight re-toggle left off.
 *
 * Design notes (house style, mirrors webglCableScene):
 *   - OPAQUE canvas, no post-processing, DPR capped at 1.5 with a 2.3 Mpx
 *     budget, no shadows; the environment is a PMREM soft-box room so the
 *     chrome coils get real edge reflections;
 *   - reduced motion: the scene still renders (it is the page backdrop) but
 *     the camera, capstans and dust are frozen and theme swaps are instant;
 *   - self-contained: the caller drives resize/start/stop/setTheme/dispose.
 *
 * QA hook: window.__pwiCmdScene = { ready, mode, transitioning, progress,
 * counts, colors, roughness, metalness, env, lights, cam, particles,
 * disposed } — read by scratch/cable-3d/qa-login-theme.mjs.
 */

import * as THREE from 'three';

export type CommandCenterMode = 'light' | 'dark';

export interface CommandCenterOptions {
  /** Initial theme mode — should match `data-theme` on <html>. */
  mode?: CommandCenterMode;
  /** Freeze ambient motion; theme swaps become instant. */
  reducedMotion?: boolean;
}

export interface CommandCenterHandle {
  /** (Re)size the renderer + camera; safe to call every frame if needed. */
  resize(width: number, height: number): void;
  /** Start the 0.8 s theme cross-fade (instant under reduced motion). */
  setTheme(mode: CommandCenterMode): void;
  /** Start (or resume) the rAF loop. */
  start(): void;
  /** Stop the rAF loop (tab hidden / unmount). */
  stop(): void;
  /** Render one frame at `seconds` without starting the loop (stills). */
  renderOnce(seconds?: number): void;
  /** Release every GPU resource and the QA debug handle. */
  dispose(): void;
}

/* ----------------------------------------------------------------- tuning */
const FOV = 42;
const THEME_TRANSITION_S = 0.8; // matches the CSS 0.8 s structural fade
const DUST_COUNT = 90;
const PIXEL_BUDGET = 2300000;

const COL_GOLD = 0xd4af37;

const easeInOutCubic = (k: number) =>
  k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hexStr = (c: THREE.Color) =>
  '#' + c.getHex(THREE.SRGBColorSpace).toString(16).padStart(6, '0');

/* ------------------------------------------------------------ theme looks */
/** Every tunable of the scene as plain hex/scalars, one set per theme mode. */
interface Look {
  bgTop: string;
  bgBottom: string;
  fog: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  keyColor: string;
  keyIntensity: number;
  fillColor: string;
  fillIntensity: number;
  goldIntensity: number;
  floorColor: string;
  floorRoughness: number;
  floorMetalness: number;
  wallColor: string;
  wallRoughness: number;
  wallMetalness: number;
  rackColor: string;
  rackRoughness: number;
  rackMetalness: number;
  rackEnv: number;
  coilColor: string;
  coilRoughness: number;
  coilMetalness: number;
  coilEnv: number;
  machineColor: string;
  machineRoughness: number;
  machineMetalness: number;
  ledIntensity: number;
}

const LOOKS: Record<CommandCenterMode, Look> = {
  // Premium light silver-slate: bright gradient sky, polished brushed-aluminum
  // racks, bright silver/chrome coils with sharp edge reflections.
  light: {
    bgTop: '#f5f5f7',
    bgBottom: '#e4e4e9',
    fog: '#dfe1e6',
    hemiSky: '#ffffff',
    hemiGround: '#c8ccd4',
    hemiIntensity: 1.15,
    keyColor: '#ffffff',
    keyIntensity: 1.15,
    fillColor: '#eaf0f8',
    fillIntensity: 0.4,
    goldIntensity: 34,
    floorColor: '#d5d8de',
    floorRoughness: 0.62,
    floorMetalness: 0.24,
    wallColor: '#c6cbd4',
    wallRoughness: 0.66,
    wallMetalness: 0.28,
    rackColor: '#cdd3db',
    rackRoughness: 0.3,
    rackMetalness: 0.9,
    rackEnv: 1.15,
    coilColor: '#eef1f6',
    coilRoughness: 0.07,
    coilMetalness: 1.0,
    coilEnv: 1.55,
    machineColor: '#b6bcc6',
    machineRoughness: 0.45,
    machineMetalness: 0.55,
    ledIntensity: 0.5,
  },
  // Dark carbon / textured slate with tactical gold highlights.
  dark: {
    bgTop: '#12161c',
    bgBottom: '#0a0d11',
    fog: '#0d1015',
    hemiSky: '#7f93ad',
    hemiGround: '#14171c',
    hemiIntensity: 0.5,
    keyColor: '#dfe8f4',
    keyIntensity: 0.62,
    fillColor: '#42506b',
    fillIntensity: 0.22,
    goldIntensity: 60,
    floorColor: '#171b21',
    floorRoughness: 0.85,
    floorMetalness: 0.2,
    wallColor: '#1d2229',
    wallRoughness: 0.8,
    wallMetalness: 0.25,
    rackColor: '#2e343c',
    rackRoughness: 0.62,
    rackMetalness: 0.6,
    rackEnv: 0.7,
    coilColor: '#59616c',
    coilRoughness: 0.36,
    coilMetalness: 1.0,
    coilEnv: 0.95,
    machineColor: '#232931',
    machineRoughness: 0.72,
    machineMetalness: 0.4,
    ledIntensity: 1.05,
  },
};

/** Live (interpolatable) version of `Look`: colors become THREE.Color. */
interface LiveLook {
  bgTop: THREE.Color;
  bgBottom: THREE.Color;
  fog: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  keyColor: THREE.Color;
  keyIntensity: number;
  fillColor: THREE.Color;
  fillIntensity: number;
  goldIntensity: number;
  floorColor: THREE.Color;
  floorRoughness: number;
  floorMetalness: number;
  wallColor: THREE.Color;
  wallRoughness: number;
  wallMetalness: number;
  rackColor: THREE.Color;
  rackRoughness: number;
  rackMetalness: number;
  rackEnv: number;
  coilColor: THREE.Color;
  coilRoughness: number;
  coilMetalness: number;
  coilEnv: number;
  machineColor: THREE.Color;
  machineRoughness: number;
  machineMetalness: number;
  ledIntensity: number;
}

const toLive = (l: Look): LiveLook => ({
  bgTop: new THREE.Color(l.bgTop),
  bgBottom: new THREE.Color(l.bgBottom),
  fog: new THREE.Color(l.fog),
  hemiSky: new THREE.Color(l.hemiSky),
  hemiGround: new THREE.Color(l.hemiGround),
  hemiIntensity: l.hemiIntensity,
  keyColor: new THREE.Color(l.keyColor),
  keyIntensity: l.keyIntensity,
  fillColor: new THREE.Color(l.fillColor),
  fillIntensity: l.fillIntensity,
  goldIntensity: l.goldIntensity,
  floorColor: new THREE.Color(l.floorColor),
  floorRoughness: l.floorRoughness,
  floorMetalness: l.floorMetalness,
  wallColor: new THREE.Color(l.wallColor),
  wallRoughness: l.wallRoughness,
  wallMetalness: l.wallMetalness,
  rackColor: new THREE.Color(l.rackColor),
  rackRoughness: l.rackRoughness,
  rackMetalness: l.rackMetalness,
  rackEnv: l.rackEnv,
  coilColor: new THREE.Color(l.coilColor),
  coilRoughness: l.coilRoughness,
  coilMetalness: l.coilMetalness,
  coilEnv: l.coilEnv,
  machineColor: new THREE.Color(l.machineColor),
  machineRoughness: l.machineRoughness,
  machineMetalness: l.machineMetalness,
  ledIntensity: l.ledIntensity,
});

const copyLive = (dst: LiveLook, src: LiveLook): LiveLook => {
  dst.bgTop.copy(src.bgTop);
  dst.bgBottom.copy(src.bgBottom);
  dst.fog.copy(src.fog);
  dst.hemiSky.copy(src.hemiSky);
  dst.hemiGround.copy(src.hemiGround);
  dst.hemiIntensity = src.hemiIntensity;
  dst.keyColor.copy(src.keyColor);
  dst.keyIntensity = src.keyIntensity;
  dst.fillColor.copy(src.fillColor);
  dst.fillIntensity = src.fillIntensity;
  dst.goldIntensity = src.goldIntensity;
  dst.floorColor.copy(src.floorColor);
  dst.floorRoughness = src.floorRoughness;
  dst.floorMetalness = src.floorMetalness;
  dst.wallColor.copy(src.wallColor);
  dst.wallRoughness = src.wallRoughness;
  dst.wallMetalness = src.wallMetalness;
  dst.rackColor.copy(src.rackColor);
  dst.rackRoughness = src.rackRoughness;
  dst.rackMetalness = src.rackMetalness;
  dst.rackEnv = src.rackEnv;
  dst.coilColor.copy(src.coilColor);
  dst.coilRoughness = src.coilRoughness;
  dst.coilMetalness = src.coilMetalness;
  dst.coilEnv = src.coilEnv;
  dst.machineColor.copy(src.machineColor);
  dst.machineRoughness = src.machineRoughness;
  dst.machineMetalness = src.machineMetalness;
  dst.ledIntensity = src.ledIntensity;
  return dst;
};

const lerpLive = (out: LiveLook, a: LiveLook, b: LiveLook, k: number): LiveLook => {
  out.bgTop.lerpColors(a.bgTop, b.bgTop, k);
  out.bgBottom.lerpColors(a.bgBottom, b.bgBottom, k);
  out.fog.lerpColors(a.fog, b.fog, k);
  out.hemiSky.lerpColors(a.hemiSky, b.hemiSky, k);
  out.hemiGround.lerpColors(a.hemiGround, b.hemiGround, k);
  out.hemiIntensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * k;
  out.keyColor.lerpColors(a.keyColor, b.keyColor, k);
  out.keyIntensity = a.keyIntensity + (b.keyIntensity - a.keyIntensity) * k;
  out.fillColor.lerpColors(a.fillColor, b.fillColor, k);
  out.fillIntensity = a.fillIntensity + (b.fillIntensity - a.fillIntensity) * k;
  out.goldIntensity = a.goldIntensity + (b.goldIntensity - a.goldIntensity) * k;
  out.floorColor.lerpColors(a.floorColor, b.floorColor, k);
  out.floorRoughness = a.floorRoughness + (b.floorRoughness - a.floorRoughness) * k;
  out.floorMetalness = a.floorMetalness + (b.floorMetalness - a.floorMetalness) * k;
  out.wallColor.lerpColors(a.wallColor, b.wallColor, k);
  out.wallRoughness = a.wallRoughness + (b.wallRoughness - a.wallRoughness) * k;
  out.wallMetalness = a.wallMetalness + (b.wallMetalness - a.wallMetalness) * k;
  out.rackColor.lerpColors(a.rackColor, b.rackColor, k);
  out.rackRoughness = a.rackRoughness + (b.rackRoughness - a.rackRoughness) * k;
  out.rackMetalness = a.rackMetalness + (b.rackMetalness - a.rackMetalness) * k;
  out.rackEnv = a.rackEnv + (b.rackEnv - a.rackEnv) * k;
  out.coilColor.lerpColors(a.coilColor, b.coilColor, k);
  out.coilRoughness = a.coilRoughness + (b.coilRoughness - a.coilRoughness) * k;
  out.coilMetalness = a.coilMetalness + (b.coilMetalness - a.coilMetalness) * k;
  out.coilEnv = a.coilEnv + (b.coilEnv - a.coilEnv) * k;
  out.machineColor.lerpColors(a.machineColor, b.machineColor, k);
  out.machineRoughness = a.machineRoughness + (b.machineRoughness - a.machineRoughness) * k;
  out.machineMetalness = a.machineMetalness + (b.machineMetalness - a.machineMetalness) * k;
  out.ledIntensity = a.ledIntensity + (b.ledIntensity - a.ledIntensity) * k;
  return out;
};

/* ------------------------------------------------- canvas texture helpers */
/** Procedural concrete slab texture: seams every slab + faint brush streaks. */
const makeSeamsTexture = (): THREE.CanvasTexture | null => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  // slab joint around each tile + mid joints
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 254);
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.stroke();
  // faint brushed streaks so the floor is not a flat colour field
  for (let i = 0; i < 26; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${(0.012 + (i % 5) * 0.006).toFixed(3)})`;
    ctx.fillRect(0, (i * 10 + (i % 3) * 7) % 256, 256, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(12, 10);
  return tex;
};

/** Soft round sprite for the golden dust. */
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

/* =========================================================== scene factory */
export const createCommandCenterScene = (
  canvas: HTMLCanvasElement,
  options: CommandCenterOptions = {},
): CommandCenterHandle | null => {
  const reducedMotion = options.reducedMotion === true;
  let appliedMode: CommandCenterMode = options.mode === 'dark' ? 'dark' : 'light';

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
    return null; // no WebGL: host removes the canvas, CSS gradient stays
  }
  renderer.setClearColor(new THREE.Color(LOOKS[appliedMode].bgBottom), 1);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color(LOOKS[appliedMode].fog), 0.016);

  const camera = new THREE.PerspectiveCamera(FOV, 1.78, 0.3, 260);
  camera.position.set(0, 3.4, 13.5);
  const lookTarget = new THREE.Vector3(0, 2.7, -6);
  camera.lookAt(lookTarget);

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
  const hemi = new THREE.HemisphereLight(0xffffff, 0xc8ccd4, 1.15);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(14, 20, 8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xeaf0f8, 0.4);
  fill.position.set(-12, 9, 6);
  scene.add(fill);
  const goldLight = new THREE.PointLight(COL_GOLD, 34, 46, 2);
  goldLight.position.set(0, 6.5, -2);
  scene.add(goldLight);

  /* --------------------------------------------------- shared resources */
  const seamsTex = makeSeamsTexture();
  const dotTex = makeDotTexture();
  const managedTextures: THREE.Texture[] = [seamsTex, dotTex].filter(
    (t): t is THREE.CanvasTexture => t !== null,
  );

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: seamsTex || undefined,
    roughness: 0.62,
    metalness: 0.24,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xc6cbd4,
    roughness: 0.66,
    metalness: 0.28,
  });
  const rackMat = new THREE.MeshStandardMaterial({
    color: 0xcdd3db,
    roughness: 0.3,
    metalness: 0.9,
    envMapIntensity: 1.15,
  });
  const coilMat = new THREE.MeshStandardMaterial({
    color: 0xeef1f6,
    roughness: 0.07,
    metalness: 1.0,
    envMapIntensity: 1.55,
  });
  const machineMat = new THREE.MeshStandardMaterial({
    color: 0xb6bcc6,
    roughness: 0.45,
    metalness: 0.55,
  });
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x120e04,
    emissive: new THREE.Color(COL_GOLD),
    emissiveIntensity: 0.5,
    roughness: 0.4,
    metalness: 0.2,
  });

  /* ------------------------------------------------------- the sky drape */
  // A gradient plane attached to the camera: always fills the viewport, so
  // the canvas reads as a premium silver-slate gradient in light theme and a
  // deep carbon gradient in dark theme, independent of aspect or camera sway.
  const backdropMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Vector3() },
      uBottom: { value: new THREE.Vector3() },
    },
    vertexShader:
      'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'varying vec2 vUv;\nuniform vec3 uTop;\nuniform vec3 uBottom;\nvoid main(){ gl_FragColor = vec4(mix(uBottom, uTop, clamp(vUv.y, 0.0, 1.0)), 1.0); }',
    depthWrite: false,
    fog: false,
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(240, 90), backdropMat);
  backdrop.position.set(0, 0, -70);
  backdrop.renderOrder = -1;
  camera.add(backdrop);
  scene.add(camera); // required for the camera-attached backdrop to render

  /* ----------------------------------------------------- structural hall */
  // Back wall + pilasters + header beam + gold LED strip.
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(92, 17, 1.4), wallMat);
  backWall.position.set(0, 8.5, -30);
  scene.add(backWall);
  for (let x = -40; x <= 40; x += 10) {
    const pilaster = new THREE.Mesh(new THREE.BoxGeometry(1.3, 17, 2.0), wallMat);
    pilaster.position.set(x, 8.5, -29.4);
    scene.add(pilaster);
  }
  const headerBeam = new THREE.Mesh(new THREE.BoxGeometry(92, 1.5, 2.4), wallMat);
  headerBeam.position.set(0, 14.2, -29.2);
  scene.add(headerBeam);
  const wallLed = new THREE.Mesh(new THREE.BoxGeometry(74, 0.18, 0.3), ledMat);
  wallLed.position.set(0, 12.6, -29.15);
  scene.add(wallLed);

  // Side walls frame the hall (the "side storage bays" live in front of them).
  const sideWallGeo = new THREE.BoxGeometry(1.4, 15, 64);
  const sideWallL = new THREE.Mesh(sideWallGeo, wallMat);
  sideWallL.position.set(-22, 7.5, -8);
  scene.add(sideWallL);
  const sideWallR = new THREE.Mesh(sideWallGeo, wallMat);
  sideWallR.position.set(22, 7.5, -8);
  scene.add(sideWallR);

  // Structural columns.
  const columnGeo = new THREE.BoxGeometry(0.75, 13.5, 0.75);
  [-10.5, 10.5].forEach((x) => {
    [-2.5, -15].forEach((z) => {
      const column = new THREE.Mesh(columnGeo, wallMat);
      column.position.set(x, 6.75, z);
      scene.add(column);
    });
  });

  // Seam-marked floor slab.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(150, 120), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -10);
  scene.add(floor);

  /* -------------------------------------------------- racks (side bays) */
  let coilCount = 0;
  const buildRack = (x: number): THREE.Group => {
    const group = new THREE.Group();
    const postGeo = new THREE.BoxGeometry(0.42, 8.6, 0.42);
    const zs = [3, -3, -9, -15, -21];
    zs.forEach((z) => {
      [-1.05, 1.05].forEach((dz) => {
        const post = new THREE.Mesh(postGeo, rackMat);
        post.position.set(0, 4.3, z + dz);
        group.add(post);
      });
    });
    const beamGeo = new THREE.BoxGeometry(2.4, 0.32, 28);
    [1.7, 4.5, 7.3].forEach((y) => {
      const beam = new THREE.Mesh(beamGeo, rackMat);
      beam.position.set(0, y, -9);
      group.add(beam);
    });
    const coilGeo = new THREE.TorusGeometry(1.0, 0.42, 12, 34);
    zs.slice(0, 4).forEach((z, zi) => {
      [1.7, 4.5, 7.3].forEach((y, li) => {
        if ((zi + li) % 2 === 0 || li === 0) {
          const coil = new THREE.Mesh(coilGeo, coilMat);
          coil.rotation.x = Math.PI / 2;
          coil.position.set(0, y + 0.46, z);
          group.add(coil);
          coilCount += 1;
          if ((zi + li) % 3 === 0) {
            const stacked = new THREE.Mesh(coilGeo, coilMat);
            stacked.rotation.x = Math.PI / 2;
            stacked.position.set(0, y + 1.32, z);
            group.add(stacked);
            coilCount += 1;
          }
        }
      });
    });
    group.position.set(x, 0, 0);
    return group;
  };
  scene.add(buildRack(-16.2));
  scene.add(buildRack(16.2));

  /* ------------------------------------------------- front coil rod yard */
  const yardCoilGeo = new THREE.TorusGeometry(1.35, 0.5, 12, 34);
  [-6.2, 6.2].forEach((x) => {
    [0.52, 1.5, 2.48].forEach((y) => {
      const coil = new THREE.Mesh(yardCoilGeo, coilMat);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(x, y, 4.8);
      scene.add(coil);
      coilCount += 1;
    });
  });
  // upright coils leaning against the rack fronts
  const leanGeo = new THREE.TorusGeometry(1.5, 0.45, 12, 34);
  [-13.6, 13.6].forEach((x, i) => {
    const coil = new THREE.Mesh(leanGeo, coilMat);
    coil.rotation.y = i === 0 ? Math.PI / 2 : -Math.PI / 2;
    coil.rotation.z = i === 0 ? 0.08 : -0.08;
    coil.position.set(x, 1.98, -1.5);
    scene.add(coil);
    coilCount += 1;
  });

  /* ------------------------------------------------ wire treatment modules */
  const capstans: THREE.Mesh[] = [];
  const buildMachine = (x: number, z: number, yaw: number): THREE.Group => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.3, 2.6), machineMat);
    body.position.y = 1.15;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 2.0), machineMat);
    top.position.set(-0.6, 2.75, 0);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.86, 0.16, 2.66), ledMat);
    stripe.position.y = 1.9;
    const capstan = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.16, 10, 26), coilMat);
    capstan.position.set(1.35, 1.5, 1.36);
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.42, 22), rackMat);
    spool.rotation.x = Math.PI / 2;
    spool.position.set(-1.2, 3.0, 1.1);
    const footGeo = new THREE.BoxGeometry(3.9, 0.22, 2.7);
    const foot = new THREE.Mesh(footGeo, rackMat);
    foot.position.y = 0.11;
    capstans.push(capstan);
    group.add(body, top, stripe, capstan, spool, foot);
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    return group;
  };
  scene.add(buildMachine(-7.4, -8.5, 0.5));
  scene.add(buildMachine(7.4, -8.5, -0.5));

  /* ------------------------------------------------------- golden dust */
  let dust: THREE.Points | null = null;
  let dustBase: Float32Array | null = null;
  let dustPhase: Float32Array | null = null;
  if (!reducedMotion && dotTex) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(DUST_COUNT * 3);
    dustBase = new Float32Array(DUST_COUNT * 3);
    dustPhase = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = 0.2 + Math.random() * 10.5;
      pos[i * 3 + 2] = -28 + Math.random() * 36;
      dustBase[i * 3] = pos[i * 3];
      dustBase[i * 3 + 1] = pos[i * 3 + 1];
      dustBase[i * 3 + 2] = pos[i * 3 + 2];
      dustPhase[i] = Math.random() * Math.PI * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: dotTex,
      size: 0.42,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      color: new THREE.Color(0xd9b45b),
    });
    dust = new THREE.Points(geo, mat);
    scene.add(dust);
  }

  /* ------------------------------------------------------ theme engine */
  const current = toLive(LOOKS[appliedMode]);
  const fromLive = toLive(LOOKS[appliedMode]);
  const targetLive = toLive(LOOKS[appliedMode]);

  let transitioning = false;
  let transitionT0 = 0; // seconds on the rAF/performance.now() time origin

  const srgbV3 = (v: THREE.Vector3, c: THREE.Color) => {
    const hex = c.getHex(THREE.SRGBColorSpace);
    v.set(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
  };

  /** Push the live look into every themed surface of the scene. */
  const applyLive = (l: LiveLook) => {
    srgbV3(backdropMat.uniforms.uTop.value, l.bgTop);
    srgbV3(backdropMat.uniforms.uBottom.value, l.bgBottom);
    if (scene.fog) scene.fog.color.copy(l.fog);
    renderer.setClearColor(l.bgBottom, 1);

    hemi.color.copy(l.hemiSky);
    hemi.groundColor.copy(l.hemiGround);
    hemi.intensity = l.hemiIntensity;
    key.color.copy(l.keyColor);
    key.intensity = l.keyIntensity;
    fill.color.copy(l.fillColor);
    fill.intensity = l.fillIntensity;
    goldLight.intensity = l.goldIntensity;

    floorMat.color.copy(l.floorColor);
    floorMat.roughness = l.floorRoughness;
    floorMat.metalness = l.floorMetalness;
    wallMat.color.copy(l.wallColor);
    wallMat.roughness = l.wallRoughness;
    wallMat.metalness = l.wallMetalness;
    rackMat.color.copy(l.rackColor);
    rackMat.roughness = l.rackRoughness;
    rackMat.metalness = l.rackMetalness;
    rackMat.envMapIntensity = l.rackEnv;
    coilMat.color.copy(l.coilColor);
    coilMat.roughness = l.coilRoughness;
    coilMat.metalness = l.coilMetalness;
    coilMat.envMapIntensity = l.coilEnv;
    machineMat.color.copy(l.machineColor);
    machineMat.roughness = l.machineRoughness;
    machineMat.metalness = l.machineMetalness;
    ledMat.emissiveIntensity = l.ledIntensity;

    // QA readbacks (exact hex the scene currently renders).
    debug.colors.bgTop = hexStr(l.bgTop);
    debug.colors.bgBottom = hexStr(l.bgBottom);
    debug.colors.fog = hexStr(l.fog);
    debug.colors.floor = hexStr(l.floorColor);
    debug.colors.wall = hexStr(l.wallColor);
    debug.colors.rack = hexStr(l.rackColor);
    debug.colors.coil = hexStr(l.coilColor);
    debug.colors.machine = hexStr(l.machineColor);
    debug.roughness.floor = Number(l.floorRoughness.toFixed(3));
    debug.roughness.rack = Number(l.rackRoughness.toFixed(3));
    debug.roughness.coil = Number(l.coilRoughness.toFixed(3));
    debug.metalness.coil = Number(l.coilMetalness.toFixed(3));
    debug.env.rack = Number(l.rackEnv.toFixed(3));
    debug.env.coil = Number(l.coilEnv.toFixed(3));
    debug.lights.hemi = Number(l.hemiIntensity.toFixed(3));
    debug.lights.key = Number(l.keyIntensity.toFixed(3));
  };

  /* ------------------------------------------------------ render loop */
  let clock = 0; // scene time (seconds), advanced by start()/renderOnce
  let raf = 0;
  let running = false;
  let last = 0;
  let renderedOnce = false;

  const debug = {
    ready: false,
    mode: appliedMode,
    transitioning: false,
    progress: 1,
    counts: { racks: 2, coils: 0, machines: 2, columns: 4, floorSeams: true },
    colors: { bgTop: '', bgBottom: '', fog: '', floor: '', wall: '', rack: '', coil: '', machine: '' },
    roughness: { floor: 0, rack: 0, coil: 0 },
    metalness: { coil: 0 },
    env: { rack: 0, coil: 0 },
    lights: { hemi: 0, key: 0 },
    cam: [0, 0, 0],
    particles: 0,
    disposed: false,
  };
  debug.counts.coils = coilCount;
  debug.particles = dust ? DUST_COUNT : 0;
  const setDebugHandle = () => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __pwiCmdScene?: typeof debug }).__pwiCmdScene = debug;
    }
  };
  setDebugHandle();

  const tickTheme = (t: number) => {
    if (!transitioning) return;
    const k = clamp((t - transitionT0) / THEME_TRANSITION_S, 0, 1);
    lerpLive(current, fromLive, targetLive, easeInOutCubic(k));
    applyLive(current);
    debug.progress = Number(k.toFixed(3));
    if (k >= 1) {
      transitioning = false;
      debug.transitioning = false;
      debug.progress = 1;
    } else {
      debug.transitioning = true;
    }
  };

  const tickScene = (t: number, dt: number) => {
    tickTheme(t);
    // ambient camera sway (frozen under reduced motion)
    if (!reducedMotion) {
      camera.position.set(
        Math.sin(t * 0.09) * 0.5,
        3.4 + Math.sin(t * 0.125) * 0.12,
        13.5 + camPull + Math.cos(t * 0.07) * 0.35,
      );
      camera.lookAt(lookTarget);
      // capstans slowly turning on the wire treatment modules
      capstans.forEach((c, i) => {
        c.rotation.z += dt * (0.55 + i * 0.18);
      });
      // golden dust drift
      if (dust && dustBase && dustPhase) {
        const attr = dust.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < DUST_COUNT; i += 1) {
          arr[i * 3] = dustBase[i * 3] + Math.sin(t * 0.3 + dustPhase[i]) * 0.6;
          arr[i * 3 + 1] =
            dustBase[i * 3 + 1] + Math.sin(t * 0.18 + dustPhase[i] * 1.7) * 0.45;
        }
        attr.needsUpdate = true;
      }
    }
  };

  const frame = (t: number, dt: number) => {
    tickScene(t, dt);
    renderer.render(scene, camera);
    renderedOnce = true;
    debug.cam = [
      Number(camera.position.x.toFixed(3)),
      Number(camera.position.y.toFixed(3)),
      Number(camera.position.z.toFixed(3)),
    ];
    if (!debug.ready) debug.ready = true;
  };

  /* public API ------------------------------------------------------- */
  // Portrait/narrow viewports: widen the frustum and step the camera back so
  // the side racks and coil yard stay inside the frame on mobile.
  let camPull = 0;

  const resize = (width: number, height: number) => {
    const w = Math.max(1, Math.round(width) || 1280);
    const h = Math.max(1, Math.round(height) || 720);
    let dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5);
    const budget = w * h * dpr * dpr;
    if (budget > PIXEL_BUDGET) dpr *= Math.sqrt(PIXEL_BUDGET / budget);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = clamp(w / h, 0.42, 3);
    camera.fov = camera.aspect < 1 ? FOV + (1 - camera.aspect) * 24 : FOV;
    camPull = camera.aspect < 1 ? (1 - camera.aspect) * 10 : 0;
    camera.updateProjectionMatrix();
  };

  const setTheme = (mode: CommandCenterMode) => {
    if (mode === appliedMode && !transitioning) return;
    appliedMode = mode;
    debug.mode = mode;
    if (reducedMotion || !running) {
      // instant swap: reduced motion, or nobody can watch the fade anyway
      transitioning = false;
      copyLive(current, toLive(LOOKS[mode]));
      debug.transitioning = false;
      debug.progress = 1;
      applyLive(current);
      if (!running) renderOnce(clock);
      return;
    }
    copyLive(fromLive, current);
    copyLive(targetLive, toLive(LOOKS[mode]));
    // Anchor to wall clock (same time origin as the rAF timestamps `tickTheme`
    // compares against): the last rendered frame can be arbitrarily stale when
    // the renderer is busy, and a stale anchor would let the fade "start in
    // past" and snap instead of cross-fading over the full 0.8 s.
    transitionT0 = performance.now() / 1000;
    transitioning = true;
    debug.transitioning = true;
    debug.progress = 0;
  };

  const renderOnce = (seconds = 0) => {
    const t = Number.isFinite(seconds) ? seconds : 0;
    clock = t;
    last = t;
    frame(t, 1 / 60);
  };

  const start = () => {
    if (running) return;
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
    backdrop.geometry.dispose();
    backdropMat.dispose();
    managedTextures.forEach((tex) => tex.dispose());
    env.dispose();
    renderer.dispose();
    debug.disposed = true;
    if (typeof window !== 'undefined' && (window as unknown as { __pwiCmdScene?: unknown }).__pwiCmdScene === debug) {
      delete (window as unknown as { __pwiCmdScene?: unknown }).__pwiCmdScene;
    }
  };

  // Paint one themed still, then the host starts the loop.
  applyLive(current);
  if (!renderedOnce) renderOnce(0);

  return { resize, setTheme, start, stop, renderOnce, dispose };
};
