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
  const resp = await fetch('http://localhost:3001/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) });
  const j = await resp.json();
  await p.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.evaluate(({ token, refreshToken, user }) => { localStorage.setItem('token', token); localStorage.setItem('refresh_token', refreshToken); localStorage.setItem('erp_user', JSON.stringify(user)); }, j);
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.goto(BASE + '/master-data/items', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForFunction(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length > 0, { timeout: 25000 });
  await p.waitForTimeout(1500);
  const viewBtn = p.locator('.ant-table-tbody > tr.ant-table-row').first().locator('button[aria-label^="View "]').first();
  await viewBtn.scrollIntoViewIfNeeded().catch(() => {});
  await viewBtn.click({ force: true });
  await p.waitForTimeout(1200);
  await p.waitForFunction(() => { const body = document.querySelector('.ant-modal .ant-modal-body'); return body && !body.textContent.includes('Loading item'); }, { timeout: 25000 });
  await p.waitForTimeout(500);

  const vals = await p.evaluate(() => {
    const wraps = Array.from(document.querySelectorAll('.ant-modal-wrap'));
    return wraps.map((w) => {
      const vis = w.style.display !== 'none';
      const wrapR = w.getBoundingClientRect();
      const boxes = Array.from(w.querySelectorAll('.erp-draggable-modal')).map((m) => {
        const r = m.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), disp: getComputedStyle(m).display, pos: getComputedStyle(m).position, transform: getComputedStyle(m).transform };
      });
      const handle = w.querySelector('.erp-draggable-modal-resize-handle');
      let handleInfo = null;
      if (handle) {
        const r = handle.getBoundingClientRect();
        handleInfo = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), z: getComputedStyle(handle).zIndex, pe: getComputedStyle(handle).pointerEvents };
        const elOnTop = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        handleInfo.onTopEl = elOnTop ? elOnTop.className || elOnTop.tagName : null;
      }
      const before = w.querySelector('.ant-modal-centered::before');
      return { vis, wrapRP: [Math.round(wrapR.x), Math.round(wrapR.y), Math.round(wrapR.width)], boxes, handleInfo, beforeExists: !!before };
    });
  });
  console.log(JSON.stringify(vals, null, 2));
  await b.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });