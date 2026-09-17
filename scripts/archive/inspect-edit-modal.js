// @ts-check
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const API = 'http://127.0.0.1:3001/api/v1';
  const BASE = 'http://127.0.0.1:3000';

  const lr = await page.request.post(API + '/auth/login', { data: { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' } });
  const ld = await lr.json();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(({ token, user }) => { localStorage.setItem('token', token); localStorage.setItem('erp_user', JSON.stringify(user)); }, { token: ld.token, user: ld.user });

  await page.goto(BASE + '/production/targets', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('table tbody tr.ant-table-row', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Open Edit modal
  const editIcon = await page.$('.anticon-edit, td:last-child .anticon-edit');
  if (editIcon) { await editIcon.click(); await page.waitForTimeout(2000); }

  // Inspect the grid container and both panels
  const layout = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) { if (getComputedStyle(w).display !== 'none') { modal = w; break; } }
    if (!modal) return null;

    const body = modal.querySelector('.ant-modal-body');
    const grid = body?.firstElementChild;
    if (!grid) return null;

    const children = Array.from(grid.children);
    const left = children[0];
    const right = children[1];

    const cs = (el) => el ? getComputedStyle(el) : null;
    const br = (el) => el ? el.getBoundingClientRect() : null;

    return {
      body: {
        height: cs(body)?.height,
        overflow: cs(body)?.overflow,
        scrollHeight: body?.scrollHeight,
        clientHeight: body?.clientHeight,
        rect: br(body),
      },
      grid: {
        display: cs(grid)?.display,
        height: cs(grid)?.height,
        overflow: cs(grid)?.overflow,
        gridTemplateColumns: cs(grid)?.gridTemplateColumns,
        rect: br(grid),
      },
      left: {
        overflowY: cs(left)?.overflowY,
        height: cs(left)?.height,
        scrollHeight: left?.scrollHeight,
        clientHeight: left?.clientHeight,
        rect: br(left),
        childCount: left?.children?.length,
      },
      right: {
        overflowY: cs(right)?.overflowY,
        height: cs(right)?.height,
        scrollHeight: right?.scrollHeight,
        clientHeight: right?.clientHeight,
        rect: br(right),
      },
    };
  });
  console.log(JSON.stringify(layout, null, 2));

  await page.screenshot({ path: 'C:/Users/afsar/AppData/Local/Temp/opencode/edit-modal-layout.png', fullPage: false });
  await browser.close();
})();
