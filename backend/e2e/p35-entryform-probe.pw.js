const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:3000';
const CHROME = ['C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

  const lr = await fetch('http://localhost:3001/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) });
  if (lr.status !== 200 && lr.status !== 201) { console.log('LOGIN FAILED status=' + lr.status); process.exit(3); }
  const j = await lr.json();
  await p.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.evaluate(({ token, refreshToken, user }) => { localStorage.setItem('token', token); localStorage.setItem('refresh_token', refreshToken); localStorage.setItem('erp_user', JSON.stringify(user)); }, j);
  await p.goto(BASE + '/production/entries/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(4000);

  const info = await p.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label, .ant-form-item-label, [class*="title"], .ant-card-head-title, h1, h2, h3')).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 60);
    const placeholders = Array.from(document.querySelectorAll('input[placeholder], textarea[placeholder]')).map((e) => (e.placeholder || '')).filter(Boolean).slice(0, 40);
    const selects = Array.from(document.querySelectorAll('.ant-select-selector')).map((e) => ((e.textContent || '').replace(/\s+/g, ' ').trim())).slice(0, 30);
    const buttons = Array.from(document.querySelectorAll('button')).map((e) => ((e.textContent || '').replace(/\s+/g, ' ').trim() || (e.getAttribute('aria-label') || '') + (e.className.includes('ant-btn-primary') ? ' [primary]' : ''))).filter(Boolean).slice(0, 40);
    const switches = Array.from(document.querySelectorAll('.ant-switch')).length;
    const datePickers = Array.from(document.querySelectorAll('.ant-picker')).length;
    const url = location.pathname;
    const bodyText = (document.body.textContent || '').replace(/\s+/g, ' ').slice(0, 400);
    return { url, labels, placeholders, selects, buttons, switches, datePickers, bodyText };
  });
  console.log(JSON.stringify(info, null, 1));
  console.log('CONSOLE-ERRORS:', consoleErrors.length ? JSON.stringify(consoleErrors.slice(0, 5)) : 'none');
  await p.screenshot({ path: 'D:/ERP-MRP-PWI-2026/browser-qa-screenshots/p35-new-form-probe.png' });
  await b.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });