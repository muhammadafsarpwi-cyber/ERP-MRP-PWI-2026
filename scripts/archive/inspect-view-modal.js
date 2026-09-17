// @ts-check
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const API = 'http://127.0.0.1:3001/api/v1';
  const BASE = 'http://127.0.0.1:3000';

  // Login
  const loginResp = await page.request.post(API + '/auth/login', { data: { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' } });
  const loginData = await loginResp.json();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(({ token, user }) => { localStorage.setItem('token', token); localStorage.setItem('erp_user', JSON.stringify(user)); }, { token: loginData.token, user: loginData.user });

  // Navigate
  await page.goto(BASE + '/production/targets', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  // Click View on first row
  const viewBtn = await page.$('table tbody tr.ant-table-row td:last-child button:first-child');
  if (viewBtn) { await viewBtn.click(); await page.waitForTimeout(2000); }

  // Get the full erp-draggable-modal HTML
  const modalHTML = await page.evaluate(() => {
    const el = document.querySelector('.erp-draggable-modal');
    return el ? el.outerHTML.substring(0, 10000) : 'NO MODAL';
  });
  console.log('=== ERP DRAGGABLE MODAL HTML (first 10000) ===');
  console.log(modalHTML);

  // Get the title row HTML
  const titleRowHTML = await page.evaluate(() => {
    const el = document.querySelector('.erp-draggable-modal-title-row');
    return el ? el.outerHTML : 'NO TITLE ROW';
  });
  console.log('\n=== TITLE ROW HTML ===');
  console.log(titleRowHTML);

  // Get the extra area
  const extraHTML = await page.evaluate(() => {
    const el = document.querySelector('.erp-draggable-modal-title-extra');
    return el ? el.outerHTML : 'NO EXTRA';
  });
  console.log('\n=== EXTRA AREA HTML ===');
  console.log(extraHTML);

  // Get close button
  const closeHTML = await page.evaluate(() => {
    // Look for close button in the modal
    const modal = document.querySelector('.view-target-modal');
    if (!modal) return 'NO view-target-modal';
    const close = modal.querySelector('.ant-modal-close');
    if (close) return close.outerHTML;
    // Try any X button
    const xBtn = modal.querySelector('[aria-label="Close"], button[class*="close"]');
    if (xBtn) return xBtn.outerHTML;
    return 'NO CLOSE BUTTON FOUND in view-target-modal';
  });
  console.log('\n=== CLOSE BUTTON ===');
  console.log(closeHTML);

  // Get all buttons in the header area
  const headerButtons = await page.evaluate(() => {
    const modal = document.querySelector('.view-target-modal');
    if (!modal) return 'NO modal';
    const titleRow = modal.querySelector('.erp-draggable-modal-title-row');
    if (!titleRow) return 'NO title row';
    const btns = titleRow.querySelectorAll('button');
    return Array.from(btns).map(b => ({ text: b.textContent, classes: b.className, html: b.outerHTML.substring(0, 500) }));
  });
  console.log('\n=== HEADER BUTTONS ===');
  console.log(JSON.stringify(headerButtons, null, 2));

  // Get the modal body content (TargetView)
  const targetViewHTML = await page.evaluate(() => {
    const modal = document.querySelector('.view-target-modal');
    if (!modal) return 'NO modal';
    // Find the content area
    const body = modal.querySelector('.ant-modal-body');
    if (body) return body.innerHTML.substring(0, 8000);
    // Try erp-draggable-modal-inner
    const inner = modal.querySelector('.erp-draggable-modal-inner');
    if (inner) return inner.innerHTML.substring(0, 8000);
    return 'NO BODY/INNER';
  });
  console.log('\n=== TARGET VIEW BODY ===');
  console.log(targetViewHTML);

  await page.screenshot({ path: 'C:/Users/afsar/AppData/Local/Temp/opencode/inspect-view-modal.png', fullPage: false });
  await browser.close();
})();
