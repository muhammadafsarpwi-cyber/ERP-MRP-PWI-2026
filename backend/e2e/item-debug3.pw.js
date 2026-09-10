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
  await p.waitForTimeout(2000);

  const info = await p.evaluate(() => {
    const wrap = document.querySelector('.ant-modal-wrap');
    const modal = wrap.querySelector('.ant-modal');
    const wrapper = wrap.querySelector('.erp-draggable-modal');
    const cs = (el) => el ? { display: getComputedStyle(el).display, textAlign: getComputedStyle(el).textAlign, margin: getComputedStyle(el).margin, padding: getComputedStyle(el).padding, width: getComputedStyle(el).width, position: getComputedStyle(el).position, top: getComputedStyle(el).top, left: getComputedStyle(el).left, insetInlineStart: getComputedStyle(el).insetInlineStart } : null;
    const beforeStyle = getComputedStyle(wrap, '::before');
    return {
      wrap: cs(wrap),
      modal: { ...cs(modal), right: getComputedStyle(modal).right },
      wrapper: { ...cs(wrapper), right: getComputedStyle(wrapper).right },
      before: { content: beforeStyle.content, display: beforeStyle.display, width: beforeStyle.width, height: beforeStyle.height, verticalAlign: beforeStyle.verticalAlign },
      wrapRect: wrap.getBoundingClientRect().toJSON(),
      wrapperRect: wrapper.getBoundingClientRect().toJSON(),
      modalRect: modal.getBoundingClientRect().toJSON(),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await b.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });