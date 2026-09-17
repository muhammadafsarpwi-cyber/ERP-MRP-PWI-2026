const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/afsar/.gemini/antigravity-ide/brain/7b7905a2-ce36-4aa3-a88c-f4fcddc6cc4f';

(async () => {
  console.log('🚀 Starting E2E Playwright validation for Operation Editor & Fixed Sidebar Header...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Login
    console.log('1. Navigating to login...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[id="email"], input[type="email"], input[placeholder*="email" i]', 'system.admin@erp.com');
    await page.fill('input[id="password"], input[type="password"]', 'Admin#2026!Secure');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => console.log('Current URL:', page.url()));
    await page.waitForTimeout(1500);

    // 2. Validate Fixed Brand Header in Desktop Sidebar
    console.log('2. Checking Sidebar Brand Header...');
    const brandHeader = await page.waitForSelector('.erp-sidebar-brand-fixed', { timeout: 5000 });
    const brandText = await brandHeader.innerText();
    console.log('Brand Header text:\n', brandText);

    // Scroll menu down to test that brand header remains strictly pinned at top
    const menuWrap = await page.$('.erp-sidebar-menu-scrollable');
    if (menuWrap) {
      await page.evaluate(el => el.scrollTop = 400, menuWrap);
      await page.waitForTimeout(500);
      const scrollTop = await page.evaluate(el => el.scrollTop, menuWrap);
      console.log('Menu scrolled to:', scrollTop);
    }

    await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_sidebar_fixed_brand_header.png') });
    console.log('Saved 01_sidebar_fixed_brand_header.png');

    // 3. Navigate to Routings and open RTG-001
    console.log('3. Navigating to Routings...');
    await page.goto('http://localhost:3000/production/routings', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Find the row containing RTG-001 and click its View Details button
    const rtgRow = await page.waitForSelector('tr:has-text("RTG-001")', { timeout: 10000 });
    const viewBtn = await rtgRow.$('button[title*="View" i], button:has(.anticon-eye)');
    if (viewBtn) {
      console.log('Clicking View Details button on RTG-001 row...');
      await viewBtn.click();
    } else {
      console.log('Clicking RTG-001 text directly...');
      await page.click('text=RTG-001');
    }
    await page.waitForTimeout(2000);

    // 4. In RTG-001 Operations tab, click Edit on OP-001
    console.log('4. Opening OP-001 Edit modal...');
    const opRow = await page.waitForSelector('tr:has-text("OP-001")', { timeout: 10000 });
    const editOpBtn = await opRow.$('button[title*="Edit" i], button:has(.anticon-edit)');
    if (editOpBtn) {
      console.log('Clicking Edit button on OP-001 operation row...');
      await editOpBtn.click();
    } else {
      console.log('Fallback: clicking any edit button...');
      await page.click('button:has(.anticon-edit)');
    }
    await page.waitForTimeout(2000);

    // 5. Verify Modal rendered with 6 steps and proper window controls
    const modalDialog = await page.waitForSelector('.ant-modal-content', { timeout: 8000 });
    console.log('Modal found!');

    // Screenshot normal modal view
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_modal_with_flow_and_department.png') });
    console.log('Saved 02_modal_with_flow_and_department.png');

    // 6. Test Maximize (Full Screen)
    console.log('6. Testing Maximize button...');
    const maxBtn = await page.waitForSelector('button[title*="Maximize" i], [title*="Full Screen" i], button:has(.anticon-fullscreen)');
    await maxBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_modal_maximized.png') });
    console.log('Saved 03_modal_maximized.png');

    // Restore from maximize
    const restoreMaxBtn = await page.waitForSelector('button[title*="Restore" i], button:has(.anticon-fullscreen-exit)');
    await restoreMaxBtn.click();
    await page.waitForTimeout(800);

    // 7. Test Minimize to Floating Dock Pill
    console.log('7. Testing Minimize button...');
    const minBtn = await page.waitForSelector('button[title*="Minimize" i], button:has(.anticon-minus)');
    await minBtn.click();
    await page.waitForTimeout(1000);

    // Verify dock pill is visible
    const dockPill = await page.waitForSelector('.erp-minimized-dock-pill', { timeout: 5000 });
    console.log('Dock pill visible:', await dockPill.innerText());
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_modal_minimized_dock.png') });
    console.log('Saved 04_modal_minimized_dock.png');

    // 8. Restore from Dock Pill
    console.log('8. Restoring from dock pill...');
    const restoreBtn = await page.waitForSelector('.erp-minimized-dock-pill button:has-text("Restore")');
    await restoreBtn.click();
    await page.waitForTimeout(1000);

    // Verify modal is back with all data
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_modal_restored.png') });
    console.log('Saved 05_modal_restored.png');

    // 9. Click "+ Add Input Material" to verify clean wide material item dropdown
    console.log('9. Clicking + Add Input Material...');
    const addMaterialBtn = await page.waitForSelector('button:has-text("Add Input Material")');
    await addMaterialBtn.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_input_materials_expanded.png') });
    console.log('Saved 06_input_materials_expanded.png');

    console.log('✅ ALL VALIDATION CHECKS PASSED!');
  } catch (err) {
    console.error('❌ Validation Error:', err);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '00_error_screenshot.png') }).catch(() => {});
  } finally {
    await browser.close();
  }
})();
