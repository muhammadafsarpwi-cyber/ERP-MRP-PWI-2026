import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

/**
 * QA harness for the light-theme cinematic welcome experience.
 *   node qa-welcome2.mjs [port] [W] [H]     (dev server must be running)
 * Verifies: no overflow, panel stacking, slideshow crossfade (16 tracks in
 * exact welcome-01..16 slot order), Ken Burns drift, staged handwriting
 * reveal, flares layer, the 3D gallery (window.__pwiWgl3d: 16 panels,
 * textures, particles, step, camera glide), console clean.
 * Screenshots land in ./shots/welcome2-*.png
 */

const port = process.argv[2] || 3000;
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 810);
const base = 'http://127.0.0.1:' + port + '/';

const outDir = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});

const logs = [];
let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const activeIndex = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('.erp-welcome-slide')].findIndex((s) =>
        s.classList.contains('is-active'),
      ),
  );

const run = async (label, width, height) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', (m) => logs.push(`[${label}][${m.type()}] ` + m.text()));
  page.on('pageerror', (e) => logs.push(`[${label}][pageerror] ` + e.message));

  await page.goto(base, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('.erp-welcome-panel', { timeout: 30000 });

  // --- handwriting mid-stage: sample relative to the animation, not wall-clock,
  //     since production/dev boot at different speeds -------------------------
  await page
    .waitForFunction(
      () => {
        const h1 = document.querySelector('.pwi-line--primary');
        if (!h1) return false;
        const m = /inset\(0(?:px)? ([\d.]+)%/.exec(getComputedStyle(h1).clipPath || '');
        if (!m) return false;
        const revealed = 100 - parseFloat(m[1]);
        return revealed > 4 && revealed < 96;
      },
      undefined,
      { timeout: 20000 },
    )
    .catch(() => {});
  const mid = await page.evaluate(() => {
    const h1 = document.querySelector('.pwi-line--primary');
    const h2 = document.querySelector('.pwi-line--company');
    const clip = h1 ? getComputedStyle(h1).clipPath : '';
    const m = /inset\(0(?:px)? ([\d.]+)%/.exec(clip || '');
    return {
      pct: m ? parseFloat(m[1]) : null,
      h2Pct: h2 ? /inset\(0(?:px)? ([\d.]+)%/.exec(getComputedStyle(h2).clipPath || '')?.[1] ?? null : null,
      penVisible: !!document.querySelector('.erp-write-pen'),
    };
  });
  console.log(label, 'mid-write:', JSON.stringify(mid));
  check(`${label} handwriting in progress`, mid.pct !== null && mid.pct > 1 && mid.pct < 99.5, `PWI revealed ${(100 - (mid.pct ?? 100)).toFixed(0)}%`);
  check(`${label} stage order (company line not yet started)`, mid.h2Pct === null || Number(mid.h2Pct) >= 99.9, `h2 inset ${mid.h2Pct}%`);
  await page.screenshot({ path: outDir + `welcome2-${label}-write.png`, animations: 'disabled', timeout: 90000 });

  // --- Ken Burns drift (probe a freshly-activated slide; screenshots fast-forward
  //     CSS animations, so this must run before the next capture) ---------------
  const slideCount = await page.evaluate(
    () => document.querySelectorAll('.erp-welcome-slide').length,
  );
  check(`${label} 16 slideshow tracks`, slideCount === 16, `${slideCount} slides`);
  const slotOrder = await page.evaluate(() =>
    [...document.querySelectorAll('.erp-welcome-slide .erp-welcome-img')]
      .map((img) => ((img.getAttribute('src') || '').match(/welcome-(\d+)\.jpg/) || [])[1] || '?')
      .join(','),
  );
  const wantOrder = Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, '0')).join(',');
  check(`${label} 16 slots map welcome-01..16 in order`, slotOrder === wantOrder, slotOrder);
  const s0 = await activeIndex(page);
  await page.waitForFunction((i) => {
    const cur = [...document.querySelectorAll('.erp-welcome-slide')].findIndex((s) => s.classList.contains('is-active'));
    return cur !== i;
  }, s0, { timeout: 15000 });
  const s1 = await activeIndex(page);
  check(`${label} slideshow advances`, s1 === (s0 + 1) % slideCount, `slide ${s0} -> ${s1}`);

  // --- 3D cinematic gallery (window.__pwiWgl3d debug handle) ----------------
  const hasCanvas = await page.evaluate(
    () => !!document.querySelector('.erp-welcome-webgl-canvas'),
  );
  check(`${label} 3D canvas mounted`, hasCanvas);
  try {
    await page.waitForFunction(() => !!window.__pwiWgl3d && window.__pwiWgl3d.ready, undefined, {
      timeout: 45000,
    });
  } catch {
    /* reported by the checks below */
  }
  const read3d = () =>
    page.evaluate(() => {
      const d = window.__pwiWgl3d;
      return d
        ? {
            ready: !!d.ready,
            panelCount: d.panelCount,
            texturesLoaded: d.texturesLoaded,
            step: d.step,
            cam: d.cam.map((v) => Number(v)),
            particles: d.particles,
          }
        : null;
    });
  const d0 = await read3d();
  check(`${label} 3D ready + 16 panels`, !!d0 && d0.ready && d0.panelCount === 16, d0 ? `panels ${d0.panelCount}` : 'no __pwiWgl3d handle');
  check(`${label} 3D panel textures loaded`, !!d0 && d0.texturesLoaded === 16, d0 ? `${d0.texturesLoaded}/16` : '-');
  check(`${label} golden particles present`, !!d0 && d0.particles > 0, d0 ? `${d0.particles} points` : '-');
  check(`${label} 3D step follows sequence`, !!d0 && d0.step === s1, d0 ? `step ${d0.step} vs slide ${s1}` : '-');
  await page.waitForTimeout(1400);
  const d1 = await read3d();
  check(
    `${label} camera glides between panels`,
    !!d0 && !!d1 && d0.cam.join(',') !== d1.cam.join(','),
    d0 && d1 ? `${d0.cam} -> ${d1.cam}` : '-',
  );

  // Playwright screenshots can pause infinite CSS animations, and the renderer
  // may throttle them transiently — resume before sampling and retry until the
  // transform actually moves, so a stall can't fake a Ken Burns failure.
  const sampleKb = () =>
    page.evaluate(() => {
      const img = document.querySelector('.erp-welcome-slide.is-active .erp-welcome-img');
      if (!img) return null;
      if (img.getAnimations) img.getAnimations().forEach((a) => a.play());
      return getComputedStyle(img).transform;
    });
  const kbA = await sampleKb();
  let kbB = kbA;
  for (let i = 0; i < 4 && kbA !== null && kbB === kbA; i++) {
    await page.waitForTimeout(1500);
    kbB = await sampleKb();
  }
  check(`${label} Ken Burns drift`, kbA !== null && kbB !== kbA, `${kbA} -> ${kbB}`);

  // --- full script + subtitle settled ----------------------------------------
  await page.waitForSelector('.erp-write-sub.is-visible', { timeout: 20000 }).catch(() => {});
  const full = await page.evaluate(() => {
    const lines = [...document.querySelectorAll('.pwi-line')].map((el) => {
      const clip = getComputedStyle(el).clipPath || '';
      const m = /inset\(0(?:px)? ([\d.]+)%/.exec(clip);
      return m ? parseFloat(m[1]) : -1;
    });
    return {
      lines,
      sub: !!document.querySelector('.erp-write-sub.is-visible'),
      pen: !!document.querySelector('.erp-write-pen'),
      flares: document.querySelectorAll('.erp-welcome-flare').length,
      webgl: !!document.querySelector('.erp-welcome-webgl-canvas'),
      photo: (() => {
        const img = document.querySelector('.erp-welcome-slide.is-active .erp-welcome-img');
        return img ? img.naturalWidth : 0;
      })(),
      centre: (() => {
        const c = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        const panel = document.querySelector('.erp-welcome-panel');
        return !!(c && panel && panel.contains(c));
      })(),
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      scrollH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
      bg: getComputedStyle(document.querySelector('.erp-welcome-root')).backgroundImage.slice(0, 60),
    };
  });
  console.log(label, 'final:', JSON.stringify(full));
  check(`${label} all lines written`, full.lines.every((v) => v === 0), `insets ${full.lines.join(',')}`);
  check(`${label} subtitle visible`, full.sub);
  check(`${label} pen retired`, !full.pen);
  check(`${label} flares layer (3)`, full.flares === 3, String(full.flares));
  check(`${label} 3D layer on (opaque canvas covers slideshow)`, full.webgl);
  check(`${label} photo loaded`, full.photo > 0, `${full.photo}px wide`);
  check(`${label} panel is top element at centre`, full.centre);
  check(`${label} no overflow`, full.scrollW <= full.innerW && full.scrollH <= full.innerH, `${full.scrollW}x${full.scrollH} vs ${full.innerW}x${full.innerH}`);

  await page.screenshot({ path: outDir + `welcome2-${label}-full.png`, animations: 'disabled', timeout: 90000 });
  console.log(label, 'shots written');
  await page.close();
};

await run('desktop', W, H);
await run('mobile', 390, 844);

console.log('--- console ---');
const noise = logs.filter(
  (l) => !/Download the React DevTools|Browserslist|caniuse|SwiftShader|GroupMarkerNotSet|software WebGL/i.test(l),
);
console.log(noise.slice(0, 60).join('\n') || '(clean)');

await browser.close();
process.exit(failures ? 1 : 0);
