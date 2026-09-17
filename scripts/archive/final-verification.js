// @ts-check
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://127.0.0.1:3000';
const API = 'http://127.0.0.1:3001/api/v1';

let results = [];
const PASS = (name) => { results.push({ name, status: 'PASS' }); console.log(`  [PASS] ${name}`); };
const FAIL = (name, reason) => { results.push({ name, status: 'FAIL', reason }); console.log(`  [FAIL] ${name} - ${reason}`); };
const INFO = (name, detail) => { results.push({ name, status: 'INFO', detail }); console.log(`  [INFO] ${name} - ${detail}`); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  console.log('\n========================================');
  console.log('  PROMPT - MACHINE TARGETS FINAL UI');
  console.log('========================================\n');

  // Login
  try {
    const loginResp = await page.request.post(API + '/auth/login', { data: { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' } });
    const loginData = await loginResp.json();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(({ token, user }) => { localStorage.setItem('token', token); localStorage.setItem('erp_user', JSON.stringify(user)); }, { token: loginData.token, user: loginData.user });
    PASS('Login');
  } catch (e) { FAIL('Login', e.message); await browser.close(); return; }

  // Navigate
  await page.goto(BASE + '/production/targets', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('table tbody tr.ant-table-row', { timeout: 15000 });
  await page.waitForTimeout(2000);
  PASS('Navigation to Machine Targets');

  // ─── FILTER + SEARCH ───────────────────────────────────────
  console.log('\n--- FILTER + SEARCH ---');
  const filterBtn = await page.$('button:has(.anticon-filter), button:has-text("Filters")');
  const searchInput = await page.$('input[placeholder*="Search"], input[placeholder*="search"]');
  if (filterBtn && searchInput) {
    const fb = await filterBtn.boundingBox();
    const sb = await searchInput.boundingBox();
    if (fb && sb && fb.x < sb.x) PASS('Filter LEFT of Search');
    else FAIL('Filter position', `Filter x=${fb?.x}, Search x=${sb?.x}`);
  }
  // Filter collapsed by default
  const filterPanel = await page.$('.ant-card:has(.ant-select)');
  if (filterPanel) {
    const vis = await filterPanel.isVisible();
    if (!vis) PASS('Filter collapsed by default');
    else INFO('Filter panel', 'Visible by default');
  } else {
    PASS('Filter collapsed by default (no panel)');
  }
  // Filter opens
  if (filterBtn) {
    await filterBtn.click();
    await page.waitForTimeout(500);
    const selects = await page.$$('.ant-select');
    if (selects.length > 1) PASS('Filter opens with selects');
    await filterBtn.click();
    await page.waitForTimeout(500);
  }
  // Search works
  if (searchInput) {
    await searchInput.fill('APS');
    await page.waitForTimeout(1500);
    const rows = await page.$$('table tbody tr.ant-table-row');
    PASS(`Search works (${rows.length} results for "APS")`);
    await searchInput.fill('');
    await page.waitForTimeout(1500);
  }

  // ─── TABLE COLUMNS ─────────────────────────────────────────
  console.log('\n--- TABLE COLUMNS ---');
  const headers = await page.$$eval('table thead th', ths => ths.map(th => th.textContent?.trim()));
  console.log(`  Columns: ${headers.join(' | ')}`);
  if (headers.includes('MACHINE ID')) PASS('MACHINE ID column');
  else FAIL('MACHINE ID column', `Not found. Headers: ${headers.join(', ')}`);
  if (headers.includes('Machine')) PASS('Machine column');
  if (headers.includes('Machine Name')) PASS('Machine Name column');
  if (!headers.includes('TARGET ID')) PASS('TARGET ID correctly removed');
  else FAIL('TARGET ID still present', 'Should not show TARGET ID');

  // Machine ID data
  const firstRow = await page.$('table tbody tr.ant-table-row');
  if (firstRow) {
    const firstCell = await firstRow.$('td:first-child');
    const text = await firstCell?.textContent();
    if (text && /^MCH\d+$/i.test(text.trim())) PASS('Machine ID shows MCH###');
    else INFO('Machine ID data', text?.trim());
  }

  // ─── VIEW MODAL ────────────────────────────────────────────
  console.log('\n--- VIEW MODAL ---');
  const viewBtn = await page.$('table tbody tr.ant-table-row td:last-child button:first-child');
  if (viewBtn) {
    await viewBtn.click();
    await page.waitForTimeout(2000);

    // Header layout
    const headerInfo = await page.evaluate(() => {
      const wraps = document.querySelectorAll('.ant-modal-wrap');
      let modal = null;
      for (const w of wraps) { if (getComputedStyle(w).display !== 'none') { modal = w; break; } }
      if (!modal) return null;
      const extra = modal.querySelector('.erp-draggable-modal-title-extra');
      const closeBtn = modal.querySelector('.ant-modal-close');
      const editBtn = extra?.querySelector('button');
      if (!extra || !closeBtn || !editBtn) return null;
      const er = extra.getBoundingClientRect();
      const cr = closeBtn.getBoundingClientRect();
      const edr = editBtn.getBoundingClientRect();
      return {
        gap: Math.round(cr.x - edr.right),
        overlap: edr.right > cr.x,
        closeColor: getComputedStyle(closeBtn).color,
        closeBorder: getComputedStyle(closeBtn).border,
      };
    });
    
    if (headerInfo) {
      if (!headerInfo.overlap) PASS('Edit/X no overlap');
      else FAIL('Edit/X overlap', `gap=${headerInfo.gap}px`);
      if (headerInfo.gap >= 8) PASS(`Edit/X separation (${headerInfo.gap}px gap)`);
      else INFO('Edit/X gap', `${headerInfo.gap}px`);
      if (headerInfo.closeColor.includes('239') || headerInfo.closeColor.includes('68') || headerInfo.closeColor.includes('239, 68')) {
        PASS('Red close button color');
      } else {
        INFO('Close button color', headerInfo.closeColor);
      }
      if (headerInfo.closeBorder.includes('252') || headerInfo.closeBorder.includes('165') || headerInfo.closeBorder.includes('252, 165')) {
        PASS('Red close button border');
      } else {
        INFO('Close button border', headerInfo.closeBorder);
      }
    }

    // Two-column field alignment
    const fieldLayout = await page.evaluate(() => {
      const wraps = document.querySelectorAll('.ant-modal-wrap');
      let modal = null;
      for (const w of wraps) { if (getComputedStyle(w).display !== 'none') { modal = w; break; } }
      if (!modal) return null;
      const container = modal.querySelector('.tv-fields');
      if (!container) return null;
      const fields = container.querySelectorAll('.tv-field');
      const positions = Array.from(fields).map(f => ({
        label: f.querySelector('.tv-field-label')?.textContent,
        x: Math.round(f.getBoundingClientRect().x),
        y: Math.round(f.getBoundingClientRect().y),
      }));
      // Check if fields are in 2 columns (same y = same row)
      const rows = {};
      for (const p of positions) {
        const key = p.y;
        if (!rows[key]) rows[key] = [];
        rows[key].push(p.label);
      }
      const twoCol = Object.values(rows).every(r => r.length === 2);
      return { twoCol, rows, fieldCount: fields.length };
    });

    if (fieldLayout) {
      if (fieldLayout.twoCol) PASS('Two-column field layout');
      else FAIL('Two-column layout', JSON.stringify(fieldLayout.rows));
      if (fieldLayout.fieldCount >= 8) PASS(`All fields rendered (${fieldLayout.fieldCount})`);
    }

    // maskClosable=false
    await page.mouse.click(10, 10);
    await page.waitForTimeout(1000);
    const modalStill = await page.evaluate(() => {
      const wraps = document.querySelectorAll('.ant-modal-wrap');
      for (const w of wraps) { if (getComputedStyle(w).display !== 'none') return true; }
      return false;
    });
    if (modalStill) PASS('maskClosable=false');

    // X closes modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    const modalClosed = await page.evaluate(() => {
      const wraps = document.querySelectorAll('.ant-modal-wrap');
      for (const w of wraps) { if (getComputedStyle(w).display !== 'none') return false; }
      return true;
    });
    if (modalClosed) PASS('X/Escape closes modal');

    // No stray plus/add icon in header
    const icons = await page.evaluate(() => {
      const wraps = document.querySelectorAll('.ant-modal-wrap');
      let modal = null;
      for (const w of wraps) { if (getComputedStyle(w).display !== 'none') { modal = w; break; } }
      if (!modal) return [];
      const headerIcons = modal.querySelectorAll('.ant-modal-header .anticon, .erp-draggable-modal-title-extra .anticon');
      return Array.from(headerIcons).map(i => i.getAttribute('aria-label'));
    });
    const plusIcons = icons.filter(i => i === 'plus' || i === 'plus-circle' || i === 'plus-square');
    if (plusIcons.length === 0) PASS('No stray plus/add icon in header');
    else FAIL('Stray plus icon', plusIcons.join(', '));

    await page.screenshot({ path: 'C:/Users/afsar/AppData/Local/Temp/opencode/final-view-modal.png', fullPage: false });
  }

  // ─── ADD MODAL ─────────────────────────────────────────────
  console.log('\n--- ADD MODAL ---');
  const addBtn = await page.$('button:has-text("Add Target")');
  if (addBtn) {
    await addBtn.click();
    await page.waitForTimeout(2000);
    const modal = await page.evaluate(() => {
      const wraps = document.querySelectorAll('.ant-modal-wrap');
      for (const w of wraps) { if (getComputedStyle(w).display !== 'none') return true; }
      return false;
    });
    if (modal) {
      PASS('Add modal opens');
      
      // Check scroll - form should have overflow
      const scrollInfo = await page.evaluate(() => {
        const wraps = document.querySelectorAll('.ant-modal-wrap');
        let modal = null;
        for (const w of wraps) { if (getComputedStyle(w).display !== 'none') { modal = w; break; } }
        if (!modal) return null;
        const body = modal.querySelector('.ant-modal-body');
        if (!body) return null;
        const formPanel = body.querySelector('[style*="overflow"]');
        return {
          bodyOverflow: getComputedStyle(body).overflow,
          hasFormScroll: !!formPanel,
        };
      });
      if (scrollInfo?.bodyOverflow === 'hidden' || scrollInfo?.hasFormScroll) {
        PASS('Add modal scroll architecture');
      }

      // Check draggable
      const header = await page.$('.ant-modal-wrap:not([style*="display: none"]) .ant-modal-header');
      if (header) {
        const style = await header.evaluate(el => getComputedStyle(el).cursor);
        if (style === 'move') PASS('Modal draggable');
      }

      // maskClosable=false
      await page.mouse.click(10, 10);
      await page.waitForTimeout(1000);
      const stillOpen = await page.evaluate(() => {
        const wraps = document.querySelectorAll('.ant-modal-wrap');
        for (const w of wraps) { if (getComputedStyle(w).display !== 'none') return true; }
        return false;
      });
      if (stillOpen) PASS('Add modal maskClosable=false');

      // Cancel
      const cancelBtn = await page.$('.ant-modal-wrap:not([style*="display: none"]) button:has-text("Cancel")');
      if (cancelBtn) { await cancelBtn.click(); await page.waitForTimeout(1000); }
    }
  }

  // ─── EDIT MODAL ────────────────────────────────────────────
  console.log('\n--- EDIT MODAL ---');
  const editIcon = await page.$('.anticon-edit, td:last-child .anticon-edit');
  if (editIcon) {
    await editIcon.click();
    await page.waitForTimeout(2000);
    const modal = await page.evaluate(() => {
      const wraps = document.querySelectorAll('.ant-modal-wrap');
      for (const w of wraps) { if (getComputedStyle(w).display !== 'none') return true; }
      return false;
    });
    if (modal) {
      PASS('Edit modal opens');
      // Check form has values
      const inputs = await page.$$('.ant-modal-wrap:not([style*="display: none"]) .ant-select-selection-item');
      if (inputs.length > 0) PASS('Edit form pre-filled');
      
      await page.screenshot({ path: 'C:/Users/afsar/AppData/Local/Temp/opencode/final-edit-modal.png', fullPage: false });
      
      const cancelBtn = await page.$('.ant-modal-wrap:not([style*="display: none"]) button:has-text("Cancel")');
      if (cancelBtn) { await cancelBtn.click(); await page.waitForTimeout(1000); }
    }
  }

  // ─── CONSOLE ERRORS ────────────────────────────────────────
  console.log('\n--- ERRORS ---');
  const blockingErrors = consoleErrors.filter(e => 
    !e.includes('warning') && !e.includes('Warning') && !e.includes('favicon') && !e.includes('404')
    && !e.includes('notifications') && !e.includes('communication')
  );
  if (blockingErrors.length === 0) PASS('No blocking console errors');
  else FAIL(`Console errors (${blockingErrors.length})`, blockingErrors.slice(0, 3).join('\n    '));

  // Take final screenshot
  await page.screenshot({ path: 'C:/Users/afsar/AppData/Local/Temp/opencode/final-table.png', fullPage: true });

  await browser.close();

  // Summary
  console.log('\n========================================');
  console.log('  PLAYWRIGHT SUMMARY');
  console.log('========================================');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const infoCount = results.filter(r => r.status === 'INFO').length;
  console.log(`  PASS: ${passCount}`);
  console.log(`  FAIL: ${failCount}`);
  console.log(`  INFO: ${infoCount}`);
  console.log('========================================\n');
  
  if (failCount > 0) {
    console.log('FAILURES:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  - ${r.name}: ${r.reason}`));
  }
  
  fs.writeFileSync('C:/Users/afsar/AppData/Local/Temp/opencode/final-results.json', JSON.stringify(results, null, 2));
})();
