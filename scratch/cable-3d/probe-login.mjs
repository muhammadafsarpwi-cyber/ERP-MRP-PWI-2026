import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ` + m.text()));
page.on('pageerror', (e) => logs.push(`[pageerror] ` + (e.stack || e.message)));

await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(12000);
const state = await page.evaluate(() => ({
  hasScene: !!document.querySelector('.erp-command-scene'),
  hasCard: !!document.querySelector('.erp-2027-login-card'),
  hasCanvas: !!document.querySelector('.erp-command-canvas'),
  hasRootChildren: !!document.querySelector('#root') && document.querySelector('#root').childElementCount,
  overlay: !!document.querySelector('iframewebpack-dev-server') || !!document.querySelector('[data-devserver-overlay]'),
  bodyText: (document.body.innerText || '').slice(0, 400),
}));
console.log('STATE', JSON.stringify(state, null, 2));
console.log('--- logs ---');
console.log(logs.slice(0, 80).join('\n') || '(clean)');
await browser.close();
