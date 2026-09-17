// @ts-check
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';
const SHOT_DIR = 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\ui-2027-v2';

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
  console.log('🚀 Starting PWI ERP 2027 UI v2 Live Verification...');
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

    // 2. Verify Sidebar Header Fixed/Sticky when scrolling menu
    const brandCard = page.locator('.erp-desktop-sider > div').first();
    const brandBoxBefore = await brandCard.boundingBox();
    const menuContainer = page.locator('.erp-desktop-sider > div').nth(1);
    
    // Scroll the menu downwards
    await menuContainer.evaluate((el) => { el.scrollTop = 400; });
    await page.waitForTimeout(200);
    const brandBoxAfter = await brandCard.boundingBox();
    
    const brandFixed = !!(brandBoxBefore && brandBoxAfter && Math.abs(brandBoxBefore.y - brandBoxAfter.y) < 2);
    check('Sidebar Brand Logo Card is fixed/sticky and does not scroll', brandFixed, `Y before=${brandBoxBefore?.y}, Y after=${brandBoxAfter?.y}`);
    await page.screenshot({ path: path.join(SHOT_DIR, '01_sidebar_fixed_header.png') });

    // 3. Navigate to Production Inventory Report
    await page.goto(`${BASE}/production/inventory-report`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.erp-pir, .ant-table-row', { timeout: 15000 });

    // 4. Find and click RM-WIRE-008 row
    const rmWireRow = page.locator('.ant-table-row:has-text("RM-WIRE-008")').first();
    await rmWireRow.waitFor({ state: 'visible', timeout: 10000 });
    await rmWireRow.click();

    // 5. Verify Stock Ledger Drill-down Modal
    const modal = page.locator('.erp-workspace-modal .ant-modal-content');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForSelector('.erp-flow-stage-strip, .erp-modern-ledger-table', { timeout: 10000 });

    // Verify 2027 Material Flow Stage Connector Strip
    const flowStrip = page.locator('.erp-flow-stage-strip');
    const flowStripVisible = await flowStrip.isVisible();
    const flowText = flowStripVisible ? await flowStrip.innerText() : '';
    console.log(`Flow strip text: ${flowText}`);
    check('2027 Material Flow Stage Strip is rendered', flowStripVisible && flowText.includes('Source') && flowText.includes('RM-WIRE-008'));
    check('Flow Strip connects to downstream consumers', flowText.includes('WIP-ST-011') || flowText.includes('Feeds'));

    // Verify Modal Controls Group (Minimize, Maximize, Close)
    const ctrlGroup = page.locator('.erp-modal-ctrl-group');
    check('Modern Modal Controls Group rendered', await ctrlGroup.isVisible());
    const minBtn = page.locator('.erp-modal-ctrl-btn[aria-label="Minimize"]');
    check('Minimize button exists in modal header', await minBtn.isVisible());

    // Verify Department / Destination shows Straightener (ST-01) and Produces WIP-ST-011
    await page.waitForSelector('.erp-modern-ledger-table .erp-dest-badge', { timeout: 5000 });
    const tableText = await page.locator('.erp-modern-ledger-table').innerText();
    const hasStraightener = tableText.includes('Straightener') || tableText.includes('ST-01');
    const hasProducesWip = tableText.includes('WIP-ST-011') || tableText.includes('Produces:');
    check('Destination Department shows Straightener / Machine Tag', hasStraightener, `Found Straightener in table`);
    check('Table shows producing item (Produces: WIP-ST-011)', hasProducesWip, `Found Produces in table`);

    await page.screenshot({ path: path.join(SHOT_DIR, '02_modal_with_flow_and_department.png') });

    // 6. Test Minimize Action
    await minBtn.click();
    await modal.waitFor({ state: 'hidden', timeout: 5000 });

    // Modal should be hidden
    const modalVisible = await modal.isVisible();
    check('Stock Ledger Modal is hidden after clicking Minimize', !modalVisible);

    // Minimized floating dock should be visible at bottom right
    const dock = page.locator('.erp-modal-minimized-dock');
    await dock.waitFor({ state: 'visible', timeout: 5000 });
    const dockText = await dock.innerText();
    console.log(`Dock text: ${dockText}`);
    check('Floating Minimized Dock Bar appears at bottom-right', await dock.isVisible());
    check('Dock shows item code RM-WIRE-008 & Minimized badge', dockText.includes('RM-WIRE-008') && dockText.includes('MINIMIZED'));

    await page.screenshot({ path: path.join(SHOT_DIR, '03_modal_minimized_dock.png') });

    // 7. Test Restore from Dock
    await dock.click();
    await modal.waitFor({ state: 'visible', timeout: 5000 });
    const modalRestored = await modal.isVisible();
    check('Clicking floating dock restores the modal to full view', modalRestored);

    await page.screenshot({ path: path.join(SHOT_DIR, '04_modal_restored.png') });

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
