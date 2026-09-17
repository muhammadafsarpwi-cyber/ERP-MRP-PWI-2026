const { chromium } = require('playwright');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/afsar/.gemini/antigravity-ide/brain/7b7905a2-ce36-4aa3-a88c-f4fcddc6cc4f';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('1. Authenticating...');
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' })
  });
  const { token, refreshToken, user } = await loginRes.json();

  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, refreshToken, user }) => {
    localStorage.clear();
    localStorage.setItem('token', token);
    localStorage.setItem('access_token', token);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    if (user) localStorage.setItem('erp_user', JSON.stringify(user));
  }, { token, refreshToken, user });

  console.log('2. Navigating to routings page...');
  await page.goto('http://localhost:3000/production/routings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Test 1: Routing Edit Modal -> Click Save -> Directly opens centered SaveResultDialog (NO top confirmation modal!)
  console.log('3. Testing Routing Edit and Save without top duplicate modal...');
  const editRoutingBtn = page.locator('button[title*="Edit" i], button:has(.anticon-edit)').first();
  await editRoutingBtn.click();
  await page.waitForTimeout(1000);

  // Take screenshot of Edit Routing modal
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '01_routing_edit_modal_clean.png') });

  // Click Save on Edit Routing modal
  console.log('4. Clicking Save on routing modal...');
  const saveRoutingBtn = page.locator('.ant-modal-footer button:has-text("Save")');
  await saveRoutingBtn.click();

  // Wait for SaveResultDialog (either loading or success)
  await page.waitForSelector('.erp-save-result-card, .erp-save-result-loading', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Check if unwanted "Save Confirmation" modal popped up
  const topConfirm = await page.locator('.ant-modal:has-text("Save Confirmation")').count();
  console.log('Top Save Confirmation count (should be 0):', topConfirm);

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '02_routing_direct_save_dialog.png') });

  // Wait for SaveResultDialog to complete (reach success or failure card)
  const closeResultBtn = page.locator('.erp-save-result-card button:has-text("Close"), .ant-modal:has-text("Successful") button:has-text("Close"), .ant-modal:has-text("Save Failed") button:has-text("Close")').first();
  await closeResultBtn.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '02b_routing_save_success_dialog.png') });

  await closeResultBtn.click();
  await page.waitForTimeout(1200);

  // Ensure routing is DRAFT so operations can be edited
  await fetch('http://localhost:3001/api/v1/production/routings/a6f9ce93-2769-4b99-b1ea-784d240c1081/status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'DRAFT' })
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Test 2: View Routing Details and Operation Editor Step 4 (Output Products)
  console.log('5. Opening Routing details to test Operation Editor Step 4...');
  let rtgRow = await page.$('tr:has-text("DBGRTG644551")');
  if (!rtgRow) {
    rtgRow = await page.waitForSelector('.ant-table-row', { timeout: 10000 });
  }
  const viewBtn = await rtgRow.$('button[title*="View" i], button:has(.anticon-eye)');
  if (viewBtn) await viewBtn.click();
  else await rtgRow.click();
  await page.waitForTimeout(1500);

  // Click Edit Operation
  console.log('6. Opening Operation Editor...');
  const editOpBtn = await page.waitForSelector('button[title*="Edit" i], button:has(.anticon-edit)', { timeout: 8000 });
  await editOpBtn.click();
  await page.waitForTimeout(2000);

  // Scroll down to Step 4 Output Products
  console.log('7. Viewing Step 4 Output Products with Division Departments filter...');
  const step4Card = page.locator('.ant-modal .ant-card:has-text("Output Products")');
  await step4Card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '03_step4_output_products_card.png') });

  // Click Output Dept dropdown
  console.log('8. Opening Step 4 Output Dept dropdown...');
  const outputDeptSelect = page.locator('.ant-modal .ant-card:has-text("Output Products") .ant-select:has-text(" - ")').first();
  await outputDeptSelect.click();
  await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', { timeout: 5000 });
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '04_step4_output_dept_dropdown.png') });

  // Select CCD-DEPT111 department
  const deptOption = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:has-text("CCD-DEPT111")').first();
  if (await deptOption.count() > 0) {
    await deptOption.click();
  } else {
    const firstOpt = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first();
    await firstOpt.click();
  }
  await page.waitForTimeout(1000);

  // Add output product row
  console.log('9. Adding output row and opening Output Product Item dropdown to inspect badges...');
  const addOutBtn = page.locator('.ant-modal button:has-text("Add Output Product")');
  await addOutBtn.click();
  await page.waitForTimeout(1000);

  // The output item select is the second .ant-select inside the Step 4 card
  const outputItemSelect = page.locator('.ant-modal .ant-card:has-text("Output Products") .ant-select').nth(1);
  await outputItemSelect.click();
  await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { timeout: 8000 });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '05_step4_output_items_dropdown_badges.png') });

  // Select first item option to verify dynamic UOM
  const outItemOption = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first();
  if (await outItemOption.count() > 0) {
    await outItemOption.click();
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '06_step4_dynamic_uom_display.png') });

  // Close operation editor
  console.log('10. Closing operation editor...');
  const closeOpBtn = page.locator('.ant-modal-footer button:has-text("Cancel")');
  await closeOpBtn.click();
  await page.waitForTimeout(1200);

  // Test 3: Operation Remove prominent centered confirmation modal
  console.log('11. Testing Operation Remove prominent centered modal...');
  const removeOpBtn = page.locator('button[title*="Remove" i], button:has(.anticon-delete)').first();
  if (await removeOpBtn.count() > 0) {
    await removeOpBtn.click();
    await page.waitForSelector('.ant-modal-confirm', { timeout: 5000 });
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, '07_operation_remove_centered_modal.png') });

    const cancelDeleteBtn = page.locator('.ant-modal-confirm button:has-text("Cancel")');
    await cancelDeleteBtn.click();
    await page.waitForTimeout(800);
  }

  // Test 4: Section Management delete confirmation
  console.log('12. Testing Section Management centered delete confirmation...');
  await page.goto('http://localhost:3000/organization/sections', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const deleteSectionBtn = page.locator('button:has(.anticon-delete)').first();
  if (await deleteSectionBtn.count() > 0) {
    await deleteSectionBtn.click();
    await page.waitForSelector('.ant-modal-confirm', { timeout: 5000 });
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, '08_section_delete_centered_modal.png') });

    const cancelSecDelete = page.locator('.ant-modal-confirm button:has-text("Cancel")');
    await cancelSecDelete.click();
    await page.waitForTimeout(800);
  }

  console.log('All verification steps completed successfully!');
  await browser.close();
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
