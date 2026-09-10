const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:3000';
const CHROME = ['C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const j = await (await fetch('http://localhost:3001/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) })).json();
  await p.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.evaluate(({ token, refreshToken, user }) => { localStorage.setItem('token', token); localStorage.setItem('refresh_token', refreshToken); localStorage.setItem('erp_user', JSON.stringify(user)); }, j);
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.goto(BASE + '/master-data/items', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForFunction(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length > 0, { timeout: 25000 });
  await p.waitForTimeout(1500);
  const viewBtn = p.locator('.ant-table-tbody > tr.ant-table-row').first().locator('button[aria-label^="View "]').first();
  await viewBtn.scrollIntoViewIfNeeded().catch(() => {});
  await viewBtn.click({ force: true });
  await p.waitForTimeout(2500);

  const info = await p.evaluate(() => {
    const modal = document.querySelector('.erp-draggable-modal .ant-modal');
    const modalStyle = getComputedStyle(modal);
    // does the .erp-draggable-modal .ant-modal rule exist?
    const sheetMatches = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule.selectorText && rule.selectorText.includes('erp-draggable-modal')) {
            sheetMatches.push({ selector: rule.selectorText, width: rule.style && rule.style.width, cssText: (rule.cssText || '').slice(0, 80) });
          }
        }
      } catch (e) { sheetMatches.push({ sheetError: e.message }); }
    }
    const r = modal.getBoundingClientRect();
    const parent = modal.parentElement;
    const parentStyle = parent ? getComputedStyle(parent) : null;
    return {
      modalWidth: modalStyle.width,
      modalDisplay: modalStyle.display,
      modalRect: { x: Math.round(r.x), w: Math.round(r.width) },
      parentClass: parent ? parent.className : null,
      parentDisplay: parentStyle ? parentStyle.display : null,
      parentWidth: parentStyle ? parentStyle.width : null,
      sheets: sheetMatches,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await b.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });