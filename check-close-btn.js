// @ts-check
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const API = 'http://127.0.0.1:3001/api/v1';
  const BASE = 'http://127.0.0.1:3000';

  const loginResp = await page.request.post(API + '/auth/login', { data: { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' } });
  const loginData = await loginResp.json();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(({ token, user }) => { localStorage.setItem('token', token); localStorage.setItem('erp_user', JSON.stringify(user)); }, { token: loginData.token, user: loginData.user });

  await page.goto(BASE + '/production/targets', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  const viewBtn = await page.$('table tbody tr.ant-table-row td:last-child button:first-child');
  if (viewBtn) { await viewBtn.click(); await page.waitForTimeout(2000); }

  // Get X button computed styles
  const closeStyles = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) {
      if (getComputedStyle(w).display !== 'none') { modal = w; break; }
    }
    if (!modal) return 'NO MODAL';
    const c = modal.querySelector('.ant-modal-close');
    if (!c) return 'NO CLOSE';
    const cs = getComputedStyle(c);
    return {
      position: cs.position,
      top: cs.top,
      right: cs.right,
      left: cs.left,
      width: cs.width,
      height: cs.height,
      marginRight: cs.marginRight,
    };
  });
  console.log('=== X BUTTON COMPUTED STYLES ===');
  console.log(JSON.stringify(closeStyles, null, 2));

  // Get the ant-modal-content position and size
  const contentStyles = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) {
      if (getComputedStyle(w).display !== 'none') { modal = w; break; }
    }
    if (!modal) return 'NO MODAL';
    const content = modal.querySelector('.ant-modal-content');
    if (!content) return 'NO CONTENT';
    const cs = getComputedStyle(content);
    const rect = content.getBoundingClientRect();
    return {
      position: cs.position,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  });
  console.log('\n=== CONTENT STYLES ===');
  console.log(JSON.stringify(contentStyles, null, 2));

  await browser.close();
})();
