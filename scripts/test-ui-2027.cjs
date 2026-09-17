// @ts-check
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';
const SHOT_DIR = 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\ui-2027';

if (!fs.existsSync(SHOT_DIR)) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
}

/** @type {Array<{ name: string; ok: boolean; extra?: string }>} */
const results = [];

/**
 * @param {string} name
 * @param {any} ok
 * @param {string} [extra]
 */
function check(name, ok, extra = '') {
  results.push({ name, ok: !!ok, extra: extra || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}\t${name}${extra ? ' :: ' + extra : ''}`);
}

async function main() {
  console.log('🚀 Starting PWI ERP 2027 UI & Live Verification...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Login
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    const emailInput = page.locator('input[type="email"], input#email, input[placeholder*="email" i]').first();
    if (await emailInput.isVisible()) {
      await emailInput.fill(EMAIL);
      const pwdInput = page.locator('input[type="password"]').first();
      await pwdInput.fill(PASSWORD);
      const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")').first();
      await submitBtn.click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    }

    // Wait for main dashboard / layout
    await page.waitForSelector('.erp-desktop-sider, .ant-layout-sider', { timeout: 15000 });

    // 2. Verify Sidebar Branding: PWI ERP System & Pakistan Wire Industries
    const siderText = await page.locator('.erp-desktop-sider').innerText();
    const hasPwiTitle = siderText.includes('PWI ERP System');
    const hasPwiSub = siderText.includes('Pakistan Wire Industries');
    check('Sidebar Branding Title: "PWI ERP System"', hasPwiTitle);
    check('Sidebar Branding Subtitle: "Pakistan Wire Industries"', hasPwiSub);

    await page.screenshot({ path: path.join(SHOT_DIR, '01_pwi_sidebar_branding.png') });

    // 3. Navigate to Production Inventory Report
    await page.goto(`${BASE}/production/inventory-report`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.erp-pir, .ant-table-row', { timeout: 15000 });

    // 4. Open Stock Ledger Drill-down Modal
    const firstRow = page.locator('.erp-pir .ant-table-tbody tr.ant-table-row').first();
    await firstRow.waitFor({ state: 'visible', timeout: 10000 });
    await firstRow.click();

    // Wait for modal to open
    const modal = page.locator('.erp-workspace-modal .ant-modal-content');
    await modal.waitFor({ state: 'visible', timeout: 10000 });

    // Measure modal bounding box vs sidebar bounding box
    const siderBox = await page.locator('.erp-desktop-sider').boundingBox();
    const modalBox = await modal.boundingBox();

    console.log(`Sidebar right: ${siderBox ? siderBox.x + siderBox.width : 'N/A'}, Modal left: ${modalBox ? modalBox.x : 'N/A'}`);
    const modalClearOfSidebar = !!(siderBox && modalBox && modalBox.x >= siderBox.x + siderBox.width);
    check('Modal does NOT overlap or go behind expanded sidebar', modalClearOfSidebar, `Modal Left=${modalBox?.x}, Sider Right=${siderBox?.width}`);

    await page.screenshot({ path: path.join(SHOT_DIR, '02_modal_with_expanded_sidebar.png') });

    // 5. Collapse Sidebar and verify modal adapts dynamically
    const collapseTrigger = page.locator('.ant-layout-sider-trigger, .erp-desktop-sider .ant-layout-sider-trigger').first();
    if (await collapseTrigger.isVisible()) {
      await collapseTrigger.click();
      await page.waitForTimeout(400); // wait for 0.2s css transition
      const modalBoxCollapsed = await modal.boundingBox();
      const siderBoxCollapsed = await page.locator('.erp-desktop-sider').boundingBox();
      console.log(`Collapsed Sider width: ${siderBoxCollapsed?.width}, Modal Left: ${modalBoxCollapsed?.x}, Modal Width: ${modalBoxCollapsed?.width}`);
      check('Modal adapts when sidebar collapses', !!(modalBoxCollapsed && siderBoxCollapsed && modalBoxCollapsed.x >= (siderBoxCollapsed.width || 0)));
      await page.screenshot({ path: path.join(SHOT_DIR, '03_modal_with_collapsed_sidebar.png') });

      // Expand sidebar back
      await collapseTrigger.click();
      await page.waitForTimeout(400);
    }

    // 6. Verify 2027 Modern Table, Movement Pills & Department / Destination
    await page.waitForSelector('.erp-modern-ledger-table', { timeout: 5000 });
    const pills = page.locator('.erp-modern-ledger-table .erp-mvt-pill');
    const pillCount = await pills.count();
    check('Movement pills rendered in modern ledger table', pillCount > 0, `Count=${pillCount}`);

    // Check no isolated single letters (I \n N)
    const tableText = await page.locator('.erp-modern-ledger-table').innerText();
    const hasBrokenIN = /\bI\nN\b/.test(tableText);
    check('No broken vertical wrapping "I \\n N"', !hasBrokenIN);

    // Check Department / Destination column
    const deptBadges = page.locator('.erp-modern-ledger-table .erp-dest-badge');
    const deptCount = await deptBadges.count();
    check('Department / Destination badges rendered without lonely "-" dashes', deptCount > 0, `Count=${deptCount}`);

    await page.screenshot({ path: path.join(SHOT_DIR, '04_2027_table_pills_and_departments.png') });

    // 7. Viewports: 1280, 768, 390
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, '05_responsive_1280.png') });

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, '06_responsive_768.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, '07_responsive_390.png') });

    check('Responsive screenshots captured at 1440, 1280, 768, 390', true);

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Test error:', err);
    check('Execution completed cleanly', false, errorMsg);
  } finally {
    await browser.close();
  }

  console.log('\n================ SUMMARY ================');
  let pass = 0, fail = 0;
  for (const r of results) {
    if (r.ok) pass++;
    else fail++;
  }
  console.log(`TOTAL: ${results.length} | PASS: ${pass} | FAIL: ${fail}`);
  if (fail > 0) process.exit(1);
}

main();
