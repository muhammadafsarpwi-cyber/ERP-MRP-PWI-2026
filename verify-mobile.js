// @ts-check
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 500, height: 800 } });
  const API = 'http://127.0.0.1:3001/api/v1';
  const BASE = 'http://127.0.0.1:3000';

  const loginResp = await page.request.post(API + '/auth/login', { data: { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' } });
  const loginData = await loginResp.json();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(({ token, user }) => { localStorage.setItem('token', token); localStorage.setItem('erp_user', JSON.stringify(user)); }, { token: loginData.token, user: loginData.user });

  await page.goto(BASE + '/production/targets', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('table tbody tr.ant-table-row', { timeout: 15000 });
  await page.waitForTimeout(2000);

  const viewBtn = await page.$('table tbody tr.ant-table-row td:last-child button:first-child');
  if (viewBtn) { await viewBtn.click(); await page.waitForTimeout(2000); }

  const mobileCheck = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) { if (getComputedStyle(w).display !== 'none') { modal = w; break; } }
    if (!modal) return null;
    const container = modal.querySelector('.tv-fields');
    if (!container) return null;
    const cs = getComputedStyle(container);
    const field = container.querySelector('.tv-field');
    const fieldCs = field ? getComputedStyle(field) : null;
    return {
      gridColumns: cs.gridTemplateColumns,
      fieldDirection: fieldCs?.flexDirection,
      viewportWidth: window.innerWidth,
    };
  });
  console.log('Mobile check:', JSON.stringify(mobileCheck, null, 2));

  await page.screenshot({ path: 'C:/Users/afsar/AppData/Local/Temp/opencode/target-view-mobile.png', fullPage: false });
  await browser.close();
})();
