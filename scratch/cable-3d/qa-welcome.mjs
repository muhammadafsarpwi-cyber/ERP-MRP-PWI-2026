import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

/**
 * QA harness for the welcome-screen WebGL background.
 *   node qa-welcome.mjs <port> <W> <H>
 * Serves are expected to be running already (node serve.mjs <port> from
 * frontend/build). Screenshots land in ./shots/welcome-*.png
 */

const port = process.argv[2] || 8620;
const W = Number(process.argv[3] || 1600);
const H = Number(process.argv[4] || 900);
const base = 'http://127.0.0.1:' + port + '/';

const outDir = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox']
});

const logs = [];
const run = async (label, width, height) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', (m) => logs.push('[' + label + '][' + m.type() + '] ' + m.text()));
  page.on('pageerror', (e) => logs.push('[' + label + '][pageerror] ' + e.message));

  await page.goto(base, { waitUntil: 'load', timeout: 90000 });
  const hasCanvas = await page
    .waitForSelector('.erp-welcome-webgl-canvas', { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  console.log(label, 'canvas mounted:', hasCanvas);
  await page.waitForTimeout(7000);

  const info = await page.evaluate(() => {
    const host = document.querySelector('.erp-welcome-webgl');
    const canvas = document.querySelector('.erp-welcome-webgl-canvas');
    const panel = document.querySelector('.erp-welcome-panel');
    const rect = canvas ? canvas.getBoundingClientRect() : null;
    const centre = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const cs = host ? getComputedStyle(host) : null;
    return {
      hostZ: cs ? cs.zIndex : null,
      hostPointer: cs ? cs.pointerEvents : null,
      hostRect: host ? host.getBoundingClientRect().toJSON() : null,
      canvasRect: rect ? { w: Math.round(rect.width), h: Math.round(rect.height) } : null,
      panelTop: panel ? panel.contains(centre) || centre === panel || (centre && panel.contains(centre)) : null,
      centreTag: centre ? centre.tagName + '.' + String(centre.className).slice(0, 40) : null,
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      scrollH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
      webgl2: !!canvas && !!canvas.getContext('webgl2'),
    };
  });
  console.log(label, 'layout:', JSON.stringify(info, null, 1));
  console.log(
    label,
    'overflow check:',
    info.scrollW <= info.innerW && info.scrollH <= info.innerH ? 'OK (no overflow)' : 'FAIL'
  );

  // Rough frame rate over 2s (SwiftShader is CPU-bound, real GPUs are far faster)
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const loop = () => {
          frames++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(loop);
          else resolve(Math.round((frames * 1000) / (performance.now() - t0)));
        };
        requestAnimationFrame(loop);
      })
  );
  console.log(label, 'fps (software raster):', fps);

  // Freeze the scene before capturing: our component stops its rAF loop on
  // `visibilitychange`, so flipping the (configurable) hidden flag exercises
  // the production pause path and frees the main thread for the compositor.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: outDir + 'welcome-' + label + '.png', animations: 'disabled', timeout: 90000 });
  console.log(label, 'shot 1 written');

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: outDir + 'welcome-' + label + '-b.png', animations: 'disabled', timeout: 90000 });
  console.log(label, 'shot 2 written (motion compare)');
  await page.close();
};

await run('desktop', W, H);
await run('mobile', 390, 844);

console.log('--- console ---');
const noise = logs.filter((l) => !/Download the React DevTools|Browserslist|caniuse/.test(l));
console.log(noise.slice(0, 60).join('\n') || '(clean)');
await browser.close();
