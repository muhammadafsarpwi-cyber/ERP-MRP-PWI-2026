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

  // Find the visible modal by looking for visible modals
  const modalInfo = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    const info = [];
    for (const w of wraps) {
      const display = window.getComputedStyle(w).display;
      if (display === 'none') continue;
      info.push({
        classes: w.className,
        hasClose: !!w.querySelector('.ant-modal-close'),
        hasExtra: !!w.querySelector('.erp-draggable-modal-title-extra'),
        hasTvFields: !!w.querySelector('.tv-fields'),
      });
    }
    return info;
  });
  console.log('=== VISIBLE MODALS ===');
  console.log(JSON.stringify(modalInfo, null, 2));

  // Use broader selectors
  const positions = await page.evaluate(() => {
    // Find any visible modal
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) {
      if (window.getComputedStyle(w).display !== 'none') { modal = w; break; }
    }
    if (!modal) return { error: 'No visible modal' };
    
    const extra = modal.querySelector('.erp-draggable-modal-title-extra');
    const closeBtn = modal.querySelector('.ant-modal-close');
    const editBtn = extra?.querySelector('button');
    
    if (!extra || !closeBtn || !editBtn) return { error: 'Elements not found in modal', extra: !!extra, close: !!closeBtn, edit: !!editBtn };
    
    const extraRect = extra.getBoundingClientRect();
    const closeRect = closeBtn.getBoundingClientRect();
    const editRect = editBtn.getBoundingClientRect();
    
    return {
      extra: { x: Math.round(extraRect.x), y: Math.round(extraRect.y), width: Math.round(extraRect.width), right: Math.round(extraRect.right) },
      closeBtn: { x: Math.round(closeRect.x), y: Math.round(closeRect.y), width: Math.round(closeRect.width), right: Math.round(closeRect.right) },
      editBtn: { x: Math.round(editRect.x), y: Math.round(editRect.y), width: Math.round(editRect.width), right: Math.round(editRect.right) },
      gap: Math.round(closeRect.x - editRect.right),
      overlap: editRect.right > closeRect.x,
    };
  });
  console.log('\n=== HEADER LAYOUT ===');
  console.log(JSON.stringify(positions, null, 2));

  // Check two-column field layout
  const fieldsLayout = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) {
      if (window.getComputedStyle(w).display !== 'none') { modal = w; break; }
    }
    if (!modal) return 'NO VISIBLE MODAL';
    
    const fieldContainer = modal.querySelector('.tv-fields');
    if (!fieldContainer) return 'NO FIELD CONTAINER';
    
    const style = window.getComputedStyle(fieldContainer);
    const fields = fieldContainer.querySelectorAll('.tv-field');
    const fieldPositions = Array.from(fields).map(f => {
      const rect = f.getBoundingClientRect();
      return { label: f.querySelector('.tv-field-label')?.textContent, x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width) };
    });
    
    return {
      display: style.display,
      gridTemplateColumns: style.gridTemplateColumns,
      fieldCount: fields.length,
      fields: fieldPositions,
    };
  });
  console.log('\n=== FIELD LAYOUT ===');
  console.log(JSON.stringify(fieldsLayout, null, 2));

  // Take screenshots
  await page.screenshot({ path: 'C:/Users/afsar/AppData/Local/Temp/opencode/verify-header-1920.png', fullPage: false });

  // Check all icons
  const allIcons = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) {
      if (window.getComputedStyle(w).display !== 'none') { modal = w; break; }
    }
    if (!modal) return [];
    const icons = modal.querySelectorAll('.anticon');
    return Array.from(icons).map(i => ({ class: i.className, label: i.getAttribute('aria-label') || i.textContent?.substring(0, 20) }));
  });
  console.log('\n=== ALL ICONS IN VIEW MODAL ===');
  console.log(JSON.stringify(allIcons, null, 2));

  await browser.close();
})();
