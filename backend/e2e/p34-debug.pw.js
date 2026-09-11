const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:3000';
const CHROME = ['C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 300)); });
  p.on('pageerror', (e) => console.log('PAGE-ERR:', e.message.slice(0, 300)));
  const lr = await fetch('http://localhost:3001/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) });
  const j = await lr.json();
  await p.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.evaluate(({ token, refreshToken, user }) => { localStorage.setItem('token', token); localStorage.setItem('refresh_token', refreshToken); localStorage.setItem('erp_user', JSON.stringify(user)); }, j);
  await p.goto(BASE + '/master-data/items', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(4000);
  const rows = await p.locator('.ant-table-tbody > tr.ant-table-row').count();
  console.log('ROWS:', rows);
  const bodyText = (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 500);
  console.log('PAGE:', bodyText);
  await p.screenshot({ path: 'D:/ERP-MRP-PWI-2026/browser-qa-screenshots/p34-debug.png' });
  await b.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
