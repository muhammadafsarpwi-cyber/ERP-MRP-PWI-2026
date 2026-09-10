const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:3000';
const CHROME = [
  'C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForSelector('input#email, input[autocomplete="username"]', { timeout: 15000 });
  await p.fill('input#email, input[autocomplete="username"]', 'dev@erp-local.test');
  await p.fill('input[autocomplete="current-password"]', 'Dev#2026Test');
  await p.click('button[type="submit"]', { force: true, timeout: 15000 });
  await p.waitForURL('**/dashboard', { timeout: 20000 }).catch(() => {});
  await p.goto(BASE + '/master-data/items', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForTimeout(6000);
  console.log('ant-table count:', await p.locator('.ant-table').count());
  console.log('rows:', await p.locator('.ant-table-tbody > tr').count());
  console.log('first row text:', JSON.stringify((await p.locator('.ant-table-tbody > tr').first().innerText().catch(() => '(none)')).slice(0, 300)));
  console.log('buttons w/ aria-label in tbody:', await p.locator('.ant-table-tbody button[aria-label]').count());
  console.log('sample arias:', JSON.stringify(await p.locator('.ant-table-tbody button[aria-label]').evaluateAll((els) => els.slice(0, 8).map((e) => e.getAttribute('aria-label')))));
  console.log('modal count:', await p.locator('.ant-modal').count());
  console.log('drawer count:', await p.locator('.ant-drawer').count());
  await b.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });