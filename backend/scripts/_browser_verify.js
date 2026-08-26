const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'screenshots');

(async () => {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const networkErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('requestfailed', req => networkErrors.push(`${req.method()} ${req.url()} ${req.failure()?.errorText}`));
  page.on('response', resp => { if (resp.status() >= 400) networkErrors.push(`${resp.status()} ${resp.url()}`); });

  try {
    // ─── STEP 1: LOGIN ──────────────────────────────────────────
    console.log('STEP 1: Navigate to login page...');
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-login-page.png'), fullPage: true });
    console.log('Login page loaded. Screenshot saved.');

    console.log('STEP 2: Logging in as SUPER_ADMIN...');
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="Email" i]', 'system.admin@erp.com');
    await page.fill('input[type="password"], input[name="password"]', 'Admin#2026!Secure');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    console.log('Login successful. Redirected to dashboard.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-dashboard.png'), fullPage: true });

    // ─── STEP 3: NAVIGATE TO PERMISSIONS MATRIX ────────────────
    console.log('STEP 3: Navigate to permissions matrix...');
    await page.goto(`${BASE}/admin/permissions-matrix`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForSelector('table', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-matrix-full.png'), fullPage: true });
    console.log('Permissions matrix loaded. Screenshot saved.');

    // ─── STEP 4: VERIFY ROLE COLUMNS ───────────────────────────
    console.log('\nSTEP 4: Verify role columns...');
    const headerCells = await page.$$('thead th');
    const roleNames = [];
    for (let i = 1; i < headerCells.length; i++) {
      const text = await headerCells[i].textContent();
      if (text) roleNames.push(text.trim().split('\n')[0].trim());
    }
    console.log(`Role columns found: ${roleNames.length}`);
    console.log(`Roles: ${roleNames.join(', ')}`);

    const expectedRoles = ['ADMIN', 'FINANCE', 'HR', 'INVENTORY', 'MANAGEMENT', 'PROCUREMENT', 'PRODUCTION', 'QUALITY CONTROL', 'REPORT VIEWER', 'SALES', 'SUPER ADMIN'];
    const missingRoles = expectedRoles.filter(r => !roleNames.some(rn => rn.toUpperCase().includes(r.replace(' ', ''))));
    const extraRoles = roleNames.filter(rn => !expectedRoles.some(r => rn.toUpperCase().includes(r.replace(' ', ''))));
    console.log(`Missing roles: ${missingRoles.length > 0 ? missingRoles.join(', ') : 'none'}`);
    console.log(`Extra roles: ${extraRoles.length > 0 ? extraRoles.join(', ') : 'none'}`);

    // ─── STEP 5: VERIFY MODULE SECTIONS ────────────────────────
    console.log('\nSTEP 5: Verify module sections...');
    const moduleHeaders = await page.$$('tbody tr td[colspan]');
    const moduleNames = [];
    for (const mh of moduleHeaders) {
      const text = await mh.textContent();
      if (text) moduleNames.push(text.trim());
    }
    console.log(`Module sections found: ${moduleNames.length}`);
    moduleNames.forEach(m => console.log(`  - ${m}`));

    const expectedModules = ['ORGANIZATION', 'ADMIN', 'MASTER DATA', 'INVENTORY', 'PROCUREMENT', 'CUSTOMER', 'SALES', 'MANUFACTURING'];
    const missingModules = expectedModules.filter(em => !moduleNames.some(mn => mn.toUpperCase().includes(em)));
    console.log(`Missing modules: ${missingModules.length > 0 ? missingModules.join(', ') : 'none'}`);

    // ─── STEP 6: VERIFY RESOURCE ROWS ──────────────────────────
    console.log('\nSTEP 6: Verify resource rows...');
    const resourceRows = await page.$$('tbody tr:not(:has(td[colspan]))');
    console.log(`Resource rows visible: ${resourceRows.length}`);

    const resourceNames = [];
    for (const rr of resourceRows) {
      const firstTd = await rr.$('td:first-child');
      if (firstTd) {
        const text = await firstTd.textContent();
        if (text) resourceNames.push(text.trim());
      }
    }

    // Verify specific screenshot resources
    const screenshotResources = [
      'Products & Items', 'Item Attributes', 'Item Barcodes',
      'Item Categories', 'Item Documents', 'Item Specifications',
      'Units of Measure', 'UOM Conversions',
      'Companies', 'Branches', 'Divisions', 'Warehouses',
    ];
    console.log('\nScreenshot resource check:');
    for (const sr of screenshotResources) {
      const found = resourceNames.some(rn => rn.includes(sr));
      console.log(`  ${sr}: ${found ? 'VISIBLE' : 'MISSING'}`);
    }

    // ─── STEP 7: VERIFY V/A/E/D CONTROLS ───────────────────────
    console.log('\nSTEP 7: Verify V/A/E/D controls...');
    const buttons = await page.$$('tbody button');
    console.log(`Permission buttons found: ${buttons.length}`);

    const firstRowButtons = await page.$$('tbody tr:not(:has(td[colspan])):first-of-type button');
    console.log(`Buttons in first resource row: ${firstRowButtons.length}`);

    // Count buttons with "V", "A", "E", "D" text
    let vCount = 0, aCount = 0, eCount = 0, dCount = 0, dashCount = 0;
    for (const btn of buttons) {
      const text = await btn.textContent();
      const t = text?.trim();
      if (t === 'V') vCount++;
      else if (t === 'A') aCount++;
      else if (t === 'E') eCount++;
      else if (t === 'D') dCount++;
    }
    const dashes = await page.$$('tbody span');
    for (const d of dashes) {
      const text = await d.textContent();
      if (text?.trim() === '-') dashCount++;
    }
    console.log(`V buttons: ${vCount}, A buttons: ${aCount}, E buttons: ${eCount}, D buttons: ${dCount}`);
    console.log(`- dashes (absent actions): ${dashCount}`);
    console.log(`Total V+A+E+D: ${vCount + aCount + eCount + dCount}`);

    // ─── STEP 8: CHECK BLANK AREAS ─────────────────────────────
    console.log('\nSTEP 8: Check for blank areas...');
    const table = await page.$('table');
    const tableBox = await table.boundingBox();
    console.log(`Table dimensions: ${Math.round(tableBox.width)}x${Math.round(tableBox.height)}px`);

    // ─── STEP 9: HORIZONTAL SCROLL ─────────────────────────────
    console.log('\nSTEP 9: Horizontal scroll...');
    const scrollContainer = await page.$('div[style*="overflow"]');
    if (scrollContainer) {
      const scrollWidth = await scrollContainer.evaluate(el => el.scrollWidth);
      const clientWidth = await scrollContainer.evaluate(el => el.clientWidth);
      console.log(`Scroll width: ${scrollWidth}px, Client width: ${clientWidth}px`);
      console.log(`Horizontal scroll needed: ${scrollWidth > clientWidth ? 'YES' : 'NO'}`);

      // Scroll to the right
      await scrollContainer.evaluate(el => el.scrollLeft = el.scrollWidth);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-matrix-scrolled-right.png'), fullPage: false });
      console.log('Scrolled right. Screenshot saved.');

      // Scroll back
      await scrollContainer.evaluate(el => el.scrollLeft = 0);
      await page.waitForTimeout(500);
    }

    // ─── STEP 10: COLLAPSE ALL ─────────────────────────────────
    console.log('\nSTEP 10: Test Collapse All...');
    const collapseBtn = await page.$('button:has-text("Collapse All")');
    if (collapseBtn) {
      await collapseBtn.click();
      await page.waitForTimeout(500);
      const rowsAfterCollapse = await page.$$('tbody tr:not(:has(td[colspan]))');
      console.log(`Rows after Collapse All: ${rowsAfterCollapse.length}`);
      const headersAfterCollapse = await page.$$('tbody tr td[colspan]');
      console.log(`Module headers after collapse: ${headersAfterCollapse.length}`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-matrix-collapsed.png'), fullPage: true });
      console.log('Collapsed state. Screenshot saved.');
    } else {
      console.log('Collapse All button NOT FOUND');
    }

    // ─── STEP 11: EXPAND ALL ───────────────────────────────────
    console.log('\nSTEP 11: Test Expand All...');
    const expandBtn = await page.$('button:has-text("Expand All")');
    if (expandBtn) {
      await expandBtn.click();
      await page.waitForTimeout(500);
      const rowsAfterExpand = await page.$$('tbody tr:not(:has(td[colspan]))');
      console.log(`Rows after Expand All: ${rowsAfterExpand.length}`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-matrix-expanded.png'), fullPage: true });
      console.log('Expanded state. Screenshot saved.');
    } else {
      console.log('Expand All button NOT FOUND');
    }

    // ─── STEP 12: TOGGLE PERMISSION ────────────────────────────
    console.log('\nSTEP 12: Toggle a permission...');
    // Find a non-granted permission button in the first resource row and click it
    const allBtns = await page.$$('tbody tr:not(:has(td[colspan])):first-of-type td:nth-child(2) button');
    if (allBtns.length > 0) {
      // Find one that appears un-granted (gray border)
      let targetBtn = null;
      let originalColor = null;
      for (const btn of allBtns) {
        const style = await btn.getAttribute('style');
        if (style && style.includes('#d9d9d9')) {
          targetBtn = btn;
          break;
        }
      }
      if (!targetBtn && allBtns.length > 0) {
        targetBtn = allBtns[allBtns.length - 1];
      }

      if (targetBtn) {
        const beforeText = await targetBtn.textContent();
        await targetBtn.click();
        await page.waitForTimeout(300);
        const afterText = await targetBtn.textContent();
        console.log(`Toggled button: "${beforeText}" → state changed (same label, different color)`);

        // Click Save
        const saveBtn = await page.$('button:has-text("Save Changes")');
        if (saveBtn) {
          const isDisabled = await saveBtn.getAttribute('disabled');
          console.log(`Save button disabled: ${isDisabled !== null}`);
          await saveBtn.click();
          await page.waitForTimeout(500);

          // Confirm in popconfirm
          const okBtn = await page.$('.ant-popconfirm-buttons button.ant-btn-primary');
          if (okBtn) {
            await okBtn.click();
            await page.waitForTimeout(2000);
            console.log('Save confirmed.');
          }

          // Check for success message
          const successMsg = await page.$('.ant-message-success');
          console.log(`Success message: ${successMsg ? 'VISIBLE' : 'NOT FOUND'}`);
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-after-save.png'), fullPage: true });
        } else {
          console.log('Save button NOT FOUND');
        }
      }
    }

    // ─── STEP 13: REFRESH AND VERIFY PERSISTENCE ───────────────
    console.log('\nSTEP 13: Refresh and verify persistence...');
    await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForSelector('table', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08-after-refresh.png'), fullPage: true });
    console.log('Page refreshed. Screenshot saved.');

    // Restore: click the same button again and save
    const restoredBtns = await page.$$('tbody tr:not(:has(td[colspan])):first-of-type td:nth-child(2) button');
    if (restoredBtns.length > 0) {
      let restoreBtn = null;
      for (const btn of restoredBtns) {
        const style = await btn.getAttribute('style');
        if (style && !style.includes('#d9d9d9') && style.includes('border:')) {
          restoreBtn = btn;
          break;
        }
      }
      if (restoreBtn) {
        await restoreBtn.click();
        await page.waitForTimeout(300);
        const saveBtn2 = await page.$('button:has-text("Save Changes")');
        if (saveBtn2) {
          await saveBtn2.click();
          await page.waitForTimeout(500);
          const okBtn2 = await page.$('.ant-popconfirm-buttons button.ant-btn-primary');
          if (okBtn2) {
            await okBtn2.click();
            await page.waitForTimeout(2000);
            console.log('Permission restored and saved.');
          }
        }
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09-after-restore.png'), fullPage: true });

    // ─── STEP 14: CONSOLE ERRORS ───────────────────────────────
    console.log('\nSTEP 14: Browser console errors...');
    console.log(`Console errors: ${consoleErrors.length}`);
    consoleErrors.slice(0, 10).forEach(e => console.log(`  ${e.substring(0, 200)}`));
    console.log(`Network errors: ${networkErrors.length}`);
    networkErrors.slice(0, 10).forEach(e => console.log(`  ${e.substring(0, 200)}`));

    // ─── FINAL ──────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════');
    console.log('BROWSER VERIFICATION COMPLETE');
    console.log('══════════════════════════════════════════');
    console.log(`Roles: ${roleNames.length}/11`);
    console.log(`Modules: ${moduleNames.length}/8`);
    console.log(`Resources: ${resourceRows.length}/55`);
    console.log(`V+A+E+D buttons: ${vCount + aCount + eCount + dCount}`);
    console.log(`- dashes: ${dashCount}`);
    console.log(`Console errors: ${consoleErrors.length}`);
    console.log(`Network errors: ${networkErrors.length}`);

    // Save verification summary
    const summary = {
      roles: roleNames.length,
      modules: moduleNames.length,
      resources: resourceRows.length,
      buttons: { v: vCount, a: aCount, e: eCount, d: dCount, dash: dashCount },
      consoleErrors: consoleErrors.length,
      networkErrors: networkErrors.length,
      networkErrorDetails: networkErrors,
      consoleErrorDetails: consoleErrors,
      screenshotResources: {},
    };
    for (const sr of screenshotResources) {
      summary.screenshotResources[sr] = resourceNames.some(rn => rn.includes(sr));
    }
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'verification-summary.json'), JSON.stringify(summary, null, 2));
    console.log('Summary written to screenshots/verification-summary.json');

  } catch (e) {
    console.error('ERROR:', e.message);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error-state.png'), fullPage: true });
  } finally {
    await browser.close();
  }
})();
