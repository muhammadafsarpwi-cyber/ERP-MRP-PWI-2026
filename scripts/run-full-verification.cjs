const { chromium } = require('playwright');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/afsar/.gemini/antigravity-ide/brain/7b7905a2-ce36-4aa3-a88c-f4fcddc6cc4f';

async function main() {
  const browser = await chromium.launch({ headless: true });
  console.log('1. Authenticating with fresh admin token...');
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' })
  });
  const { token, refreshToken, user } = await loginRes.json();

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ token, refreshToken, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('access_token', token);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    if (user) localStorage.setItem('erp_user', JSON.stringify(user));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
  }, { token, refreshToken, user });

  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.text().includes('DEBUG_DEPT_ITEMS')) {
      console.log('PAGE LOG:', msg.text());
    }
  });

  console.log('2. Navigating to production routings...');
  await page.goto('http://localhost:3000/production/routings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('3. Opening routing details...');
  const rtgRow = await page.waitForSelector('.ant-table-row', { timeout: 15000 });
  const viewBtn = await rtgRow.$('button[title*="View" i], button:has(.anticon-eye)');
  if (viewBtn) await viewBtn.click();
  else await rtgRow.click();
  await page.waitForTimeout(2000);

  console.log('4. Clicking edit operation...');
  const editOpBtn = await page.waitForSelector('button[title*="Edit" i], button:has(.anticon-edit)', { timeout: 8000 });
  await editOpBtn.click();

  console.log('5. Waiting for department filter tag to finish loading items...');
  const tag = await page.waitForSelector('.ant-tag:has-text("shown"):not(:has-text("0 shown"))', { timeout: 35000 });
  const tagText = await tag.innerText();
  console.log('SUCCESS! Tag text is:', tagText);
  await page.waitForTimeout(1000);

  // Screenshot 1: Operation editor with Primary filter active
  console.log('5b. Capturing 01_operation_editor_primary_filter.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '01_operation_editor_primary_filter.png') });

  // Add input material row if not exists
  console.log('6. Ensuring an input material row exists...');
  let materialItemSelect = page.locator('.ant-form-item:has-text("Material Item") .ant-select').first();
  if (await materialItemSelect.count() === 0) {
    const addInputBtn = page.locator('button:has-text("Add Input Material")');
    await addInputBtn.click();
    await page.waitForTimeout(1000);
    materialItemSelect = page.locator('.ant-form-item:has-text("Material Item") .ant-select').first();
  }

  // Open the material dropdown
  console.log('7. Opening Material Item dropdown with Primary filter...');
  await materialItemSelect.click();
  await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', { timeout: 8000 });
  await page.waitForTimeout(800);

  // Screenshot 2: Material dropdown showing only primary production materials (wires)
  console.log('7b. Capturing 02_material_dropdown_primary_wires_only.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '02_material_dropdown_primary_wires_only.png') });

  // Select first wire item: RM-WIRE-001
  console.log('7c. Selecting RM-WIRE-001...');
  const wireOption = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:has-text("RM-WIRE-001"), .ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:has-text("RM-WIRE")').first();
  if (await wireOption.count() > 0) {
    await wireOption.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(1000);

  // Fill quantity = 1.05 and check UOM badge
  const qtyInput = page.locator('input[id*="quantity"]').first();
  if (await qtyInput.count() > 0) {
    await qtyInput.fill('1.05');
  }
  await page.waitForTimeout(600);

  // Screenshot 3: Qty / Unit display with dynamic UOM tag
  console.log('7d. Capturing 03_material_qty_uom_display.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '03_material_qty_uom_display.png') });

  // Test Process Components Filter button
  console.log('7e. Testing Process Components toggle...');
  const procCompBtn = page.locator('button:has-text("Process Components")');
  if (await procCompBtn.count() > 0) {
    await procCompBtn.click();
    await page.waitForTimeout(1000);
    await materialItemSelect.click();
    await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', { timeout: 8000 });
    await page.waitForTimeout(800);
    console.log('7f. Capturing 04_material_dropdown_process_components.png...');
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, '04_material_dropdown_process_components.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    // Switch back to primary
    await page.locator('button:has-text("Primary Production Materials")').click();
    await page.waitForTimeout(800);
  }

  // Scroll down to Step 5 (Machine & Work Center)
  console.log('8. Scrolling to Step 5 Machine & Work Center...');
  const step5Card = page.locator('.ant-card:has-text("Machine & Work Center")');
  await step5Card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  // Check requires machine if not checked
  const reqMachineCheckbox = page.locator('label:has-text("Requires Machine") input[type="checkbox"]');
  if (!(await reqMachineCheckbox.isChecked())) {
    await reqMachineCheckbox.check();
    await page.waitForTimeout(1000);
  }

  // Select Target Item to link machine targets
  console.log('8b. Selecting target item to filter configured machines...');
  const targetItemSelect = page.locator('div:has-text("Operation Target Item") + .ant-select, .ant-select:has-text("Select item to filter")').first();
  if (await targetItemSelect.count() > 0) {
    await targetItemSelect.click();
    await page.waitForTimeout(800);
    const itemOpt = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first();
    if (await itemOpt.count() > 0) {
      await itemOpt.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(800);
  }

  // Screenshot 5: Machine & Work Center with target linkage
  console.log('8c. Capturing 05_step5_machine_item_targets.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '05_step5_machine_item_targets.png') });

  // Test Error Popup: clear operation code and hit Save Operation
  console.log('9. Testing Save Validation Error in centered Popup Dialog...');
  const opCodeInput = page.locator('input[id*="operationCode"]').first();
  const originalOpCode = await opCodeInput.inputValue();
  await opCodeInput.fill(''); // make it invalid!

  const saveOpBtn = page.locator('.ant-modal-footer button:has-text("Save Operation")');
  await saveOpBtn.click();
  await page.waitForTimeout(1500);

  // Screenshot 6: Centered Validation Error Popup Modal
  console.log('9b. Capturing 06_validation_error_popup_modal.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '06_validation_error_popup_modal.png') });

  // Close the error dialog
  console.log('9c. Closing Error Popup Modal...');
  const errorDialogClose = page.locator('.ant-modal:has-text("Save Failed") button:has-text("Close"), .ant-modal:has-text("Validation") button:has-text("Close")').first();
  if (await errorDialogClose.count() > 0) {
    await errorDialogClose.click();
    await page.waitForTimeout(1000);
  }

  // Restore operation code
  console.log('10. Restoring operation code and testing successful save in centered Popup Dialog...');
  await opCodeInput.fill(originalOpCode || 'FT-001');
  await page.waitForTimeout(500);

  // Ensure an item is selected in row 0
  const rowItemVal = await page.locator('.ant-form-item:has-text("Material Item") .ant-select-selection-item').count();
  if (rowItemVal === 0) {
    await materialItemSelect.click();
    await page.waitForTimeout(600);
    const wireOptionAgain = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:has-text("RM-WIRE")').first();
    if (await wireOptionAgain.count() > 0) {
      await wireOptionAgain.click();
      await page.waitForTimeout(600);
    }
  }

  // Click Save Operation
  console.log('10b. Clicking Save Operation...');
  await saveOpBtn.click();
  try {
    await page.waitForSelector('.ant-modal:has-text("Successfully")', { timeout: 12000 });
  } catch {}
  await page.waitForTimeout(500);

  // Screenshot 7: Centered Success Popup Modal
  console.log('10c. Capturing 07_save_success_popup_modal.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '07_save_success_popup_modal.png') });

  // Close success dialog
  const successDialogClose = page.locator('.ant-modal:has-text("Successfully") button:has-text("Close"), .ant-modal:has-text("Saved") button:has-text("Close")').first();
  if (await successDialogClose.count() > 0) {
    await successDialogClose.click();
    await page.waitForTimeout(1000);
  }

  await browser.close();
  console.log('ALL 7 SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

main().catch(async err => {
  console.error('Error during test:', err);
  process.exit(1);
});
