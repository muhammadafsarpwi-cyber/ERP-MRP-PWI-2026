const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:3000';
const CHROME = ['C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const lr = await fetch('http://localhost:3001/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) });
  if (lr.status !== 200 && lr.status !== 201) { console.log('LOGIN FAILED status=' + lr.status); process.exit(3); }
  const j = await lr.json();
  await p.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.evaluate(({ token, refreshToken, user }) => { localStorage.setItem('token', token); localStorage.setItem('refresh_token', refreshToken); localStorage.setItem('erp_user', JSON.stringify(user)); }, j);
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.goto(BASE + '/master-data/items', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForFunction(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length > 0, { timeout: 25000 });
  await p.waitForTimeout(1500);
  const viewBtn = p.locator('.ant-table-tbody > tr.ant-table-row').first().locator('button[aria-label^="View "]').first();
  await viewBtn.scrollIntoViewIfNeeded().catch(() => {});
  await viewBtn.click({ force: true });
  await p.waitForTimeout(3000);

  const info = await p.evaluate(() => {
    const wrapEl = document.querySelector('.ant-modal-wrap');
    const innerHTMLPrefix = (wrapEl ? wrapEl.innerHTML : '(no wrap)').replace(/\s+/g, ' ').slice(0, 700);
    const myWrap = document.querySelector('.erp-draggable-modal');
    const myWrapHTML = myWrap ? myWrap.innerHTML.replace(/\s+/g, ' ').slice(0, 300) : '(none)';
    const modalEl = document.querySelector('.ant-modal');
    const modalParent = modalEl ? modalEl.parentElement.className : '(none)';
    const modalChildren = modalEl ? modalEl.children.length : 0;
    const modalContent = modalEl ? (modalEl.textContent || '').replace(/\s+/g, ' ').slice(0, 120) : '(none)';
    return {
      wrapExists: !!wrapEl,
      wrapChildren: wrapEl ? Array.from(wrapEl.children).map((c) => c.className && c.className.toString().split(' ')[0]) : [],
      myWrapExists: !!myWrap,
      myWrapChildrenCount: myWrap ? myWrap.children.length : -1,
      myWrapOuterStart: myWrap ? myWrap.outerHTML.slice(0, 200) : '(none)',
      myWrapHTML,
      modalParent,
      modalChildren,
      modalContent,
      innerHTMLPrefix,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await b.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });