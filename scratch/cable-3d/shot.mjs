import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const port = process.argv[2] || 8611;
const W = Number(process.argv[3] || 1600);
const H = Number(process.argv[4] || 900);
const KW = Number(process.argv[5] || 3840);
const KH = Number(process.argv[6] || 2160);

const outDir = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', m => logs.push('[' + m.type() + '] ' + m.text()));
page.on('pageerror', e => logs.push('[pageerror] ' + e.message));

await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load', timeout: 60000 });
const ready = await page.waitForFunction('window.__ready === true', null, { timeout: 120000 })
  .then(() => true).catch(() => false);
console.log('ready:', ready);
await page.waitForTimeout(6000);

const readStats = () => page.evaluate(() => ({
  fps: document.getElementById('sFps').textContent,
  draw: document.getElementById('sDraw').textContent,
  tris: document.getElementById('sTri').textContent,
  res: document.getElementById('sRes').textContent,
  err: document.getElementById('err').textContent
}));
console.log('warm stats:', JSON.stringify(await readStats()));

const grab = async (name) => {
  const data = await page.evaluate(() => document.getElementById('view').toDataURL('image/png'));
  const buf = Buffer.from(data.split(',')[1], 'base64');
  await writeFile(outDir + name, buf);
  console.log('wrote ' + name + ' (' + Math.round(buf.length / 1024) + ' KB)');
};

await grab('frame-' + W + 'x' + H + '.png');

// close-up on the hero cable cutaway (inner wire detail)
await page.evaluate(() => {
  const v = window.__view; v.auto = false; v.theta = 0.15; v.phi = 1.20; v.radius = 5.0;
  window.__target.set(-0.9, 1.75, 2.0);
});
await page.waitForTimeout(4000);
await grab('detail-closeup.png');
await page.waitForTimeout(2500);
await grab('detail-closeup-b.png');
await page.evaluate(() => document.getElementById('btnShell').click());
await page.waitForTimeout(3500);
await grab('detail-noshell.png');
await page.evaluate(() => document.getElementById('btnShell').click());
await page.waitForTimeout(1500);
await readStats().then(s => console.log('closeup stats:', JSON.stringify(s)));

if (KW > 0) {
  await page.evaluate(() => {
    const v = window.__view; v.auto = true; v.theta = 0.32; v.phi = 1.30; v.radius = 14.6;
    window.__target.set(0, 1.95, -1.0);
  });
  await page.setViewportSize({ width: KW, height: KH });
  await page.waitForTimeout(6000);
  const s2 = await page.evaluate(() => ({
    res: document.getElementById('sRes').textContent,
    tris: document.getElementById('sTri').textContent,
    err: document.getElementById('err').textContent
  }));
  console.log('4k stats:', JSON.stringify(s2));
  await grab('frame-' + KW + 'x' + KH + '.png');
}

console.log('--- console ---');
console.log(logs.slice(0, 80).join('\n') || '(clean)');
await browser.close();
