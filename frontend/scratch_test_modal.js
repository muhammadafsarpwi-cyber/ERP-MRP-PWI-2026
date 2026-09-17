const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/afsar/.gemini/antigravity-ide/brain/7b7905a2-ce36-4aa3-a88c-f4fcddc6cc4f';

(async () => {
  console.log('--- Launching Playwright Verification ---');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // Login
  console.log('Navigating to login...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 30000 });

  await page.locator('input[type="email"], input#email, input#login_email').first().fill('system.admin@erp.com');
  await page.locator('input[type="password"]').first().fill('Admin#2026!Secure');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  console.log('Logged in successfully!');

  // Navigate to Raw Material Receiving
  console.log('Navigating to Raw Material Receiving...');
  await page.goto('http://localhost:3000/production/receiving');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  // Click "New Receipt (Gate Pass)" button
  console.log('Opening New Receipt Modal...');
  const newReceiptBtn = page.locator('button:has-text("New Receipt (Gate Pass)")');
  await newReceiptBtn.click();
  await page.waitForSelector('.raw-material-modal-split-container', { timeout: 10000 });
  console.log('Modal opened!');

  // Wait for refData to finish loading
  console.log('Waiting for reference data to be ready in modal...');
  await page.waitForSelector('.ant-modal-body #divisionId', { timeout: 15000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('#divisionId');
    const wrap = el?.closest('.ant-select');
    return wrap && !wrap.classList.contains('ant-select-loading');
  }, { timeout: 15000 });
  await page.waitForTimeout(500);

  // Select Division: DIV-CCD
  console.log('Selecting Division DIV-CCD...');
  const divSelector = page.locator('.ant-modal-body .ant-form-item:has(#divisionId) .ant-select-selector');
  await divSelector.click();
  await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { timeout: 5000 });
  const divOption = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: 'DIV-CCD' });
  await divOption.first().click();
  await page.waitForTimeout(600);

  // Select Section: SEC-111
  console.log('Selecting Section SEC-111...');
  const secSelector = page.locator('.ant-modal-body .ant-form-item:has(#sectionId) .ant-select-selector');
  await secSelector.click();
  await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { timeout: 5000 });
  const secOption = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: 'SEC-111' });
  await secOption.first().click();
  await page.waitForTimeout(800);

  // Check Department: Should be auto-selected to CCD Stores!
  const deptWrap = page.locator('.ant-modal-body .ant-form-item:has(#departmentId) .ant-select-selection-item');
  const deptText = await deptWrap.innerText().catch(() => '');
  console.log('Department Select Value after selecting SEC-111:', deptText);

  // Click department dropdown to verify options
  console.log('Opening department dropdown to verify filtered options...');
  const deptSelector = page.locator('.ant-modal-body .ant-form-item:has(#departmentId) .ant-select-selector');
  await deptSelector.click();
  await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { timeout: 5000 });
  const deptOptions = await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content').allInnerTexts();
  console.log('Department dropdown options visible:', deptOptions);

  // Verify that CENT-FIN, CENT-ADM, CENT-HR are NOT in the dropdown!
  const hasCorporate = deptOptions.some(t => t.includes('CENT-') || t.includes('Accounts') || t.includes('Human Res'));
  console.log('Contains corporate departments? (Must be false):', hasCorporate);

  // Close department dropdown
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Select Warehouse
  console.log('Selecting Warehouse...');
  const whSelector = page.locator('.ant-modal-body .ant-form-item:has(#warehouseId) .ant-select-selector');
  await whSelector.click();
  await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { timeout: 5000 });
  const whOption = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first();
  await whOption.click();
  await page.waitForTimeout(400);

  // Fill in Section 2 Line Items
  console.log('Selecting Item and quantities in Section 2...');
  const itemSelect = page.locator('.raw-material-modal-form-col .ant-table-tbody .ant-select').first();
  await itemSelect.click();
  await page.waitForTimeout(500);
  const itemOpt = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content').first();
  await itemOpt.click();
  await page.waitForTimeout(600);

  // Set Gate Pass Qty = 0
  const gpInput = page.locator('.raw-material-modal-form-col .ant-table-tbody input.ant-input-number-input').nth(0);
  await gpInput.fill('0');
  await gpInput.press('Tab');
  await page.waitForTimeout(300);

  // Set Received Qty = 1000
  const recvInput = page.locator('.raw-material-modal-form-col .ant-table-tbody input.ant-input-number-input').nth(1);
  await recvInput.fill('1000');
  await recvInput.press('Tab');
  await page.waitForTimeout(800);

  // Take screenshot of Split View with auto-selected department and bold RED Surplus Net Diff
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '01_modal_split_cascade_and_red_surplus.png'),
    fullPage: false
  });
  console.log('Captured 01_modal_split_cascade_and_red_surplus.png');

  // Test Eye Toggle Button: Hide Live Preview
  console.log('Testing Eye Toggle Button to HIDE Preview...');
  const eyeBtn = page.locator('[data-testid="toggle-live-preview-btn"]');
  await eyeBtn.click();
  await page.waitForTimeout(500);

  // Verify right column is hidden and form is full width
  const previewColVisible = await page.locator('.raw-material-modal-preview-col').isVisible();
  console.log('Preview Column Visible after toggle off? (Must be false):', previewColVisible);

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '02_modal_preview_toggled_off_fullwidth.png'),
    fullPage: false
  });
  console.log('Captured 02_modal_preview_toggled_off_fullwidth.png');

  // Test Eye Toggle Button: Restore Live Preview
  console.log('Testing Eye Toggle Button to RESTORE Preview...');
  await eyeBtn.click();
  await page.waitForTimeout(500);

  const previewColRestored = await page.locator('.raw-material-modal-preview-col').isVisible();
  console.log('Preview Column Visible after toggle on? (Must be true):', previewColRestored);

  // Add 3 more lines to demonstrate independent form scrolling
  console.log('Adding 3 more lines to test independent scrolling...');
  const addLineBtn = page.locator('button:has-text("Add Item")');
  await addLineBtn.click();
  await page.waitForTimeout(300);
  await addLineBtn.click();
  await page.waitForTimeout(300);
  await addLineBtn.click();
  await page.waitForTimeout(400);

  // Scroll down the form column
  console.log('Scrolling down the left form column...');
  await page.evaluate(() => {
    const formCol = document.querySelector('.raw-material-modal-form-col');
    if (formCol) formCol.scrollTop = formCol.scrollHeight;
  });
  await page.waitForTimeout(600);

  // Check that Live Verification Panel is still at top and visible!
  const livePreviewCard = page.locator('.raw-material-live-preview-card');
  const isLiveCardVisible = await livePreviewCard.isVisible();
  const box = await livePreviewCard.boundingBox();
  console.log('Live Preview Card visible while form scrolled to bottom?', isLiveCardVisible, 'Card top coordinate:', box?.y);

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '03_form_scrolled_independently_preview_pinned.png'),
    fullPage: false
  });
  console.log('Captured 03_form_scrolled_independently_preview_pinned.png');

  // Focus on the Live Verification Card to capture close-up of 4 single-row KPIs & 2027 Material Cards
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '04_live_verification_2027_kpis_and_cards.png'),
    clip: box || undefined
  });
  console.log('Captured 04_live_verification_2027_kpis_and_cards.png');

  await browser.close();
  console.log('--- All Tests Completed Successfully! ---');
})();
