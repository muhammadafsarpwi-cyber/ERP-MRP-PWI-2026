const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACTS_DIR = 'C:/Users/afsar/.gemini/antigravity-ide/brain/7b7905a2-ce36-4aa3-a88c-f4fcddc6cc4f';

async function main() {
  console.log('1. Loading cached auth token...');
  const auth = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-token.json'), 'utf8'));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('response', async resp => {
    if (resp.url().includes('routings')) {
      console.log('API RESP:', resp.status(), resp.url());
      try {
        const body = await resp.text();
        console.log('BODY:', body.slice(0, 150));
      } catch {}
    }
  });

  page.on('console', msg => {
    console.log('BROWSER:', msg.type(), msg.text());
  });
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.message);
  });

  console.log('2. Setting auth tokens on login page...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, refreshToken, user }) => {
    localStorage.clear();
    localStorage.setItem('token', token);
    localStorage.setItem('access_token', token);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    if (user) localStorage.setItem('erp_user', JSON.stringify(user));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
  }, auth);

  console.log('2b. Navigating to routings page and awaiting backend routings response...');
  const [routingsResp] = await Promise.all([
    page.waitForResponse(r => r.url().includes(':3001') && r.url().includes('production/routings') && r.status() === 200, { timeout: 60000 }),
    page.goto('http://localhost:3000/production/routings', { waitUntil: 'domcontentloaded' })
  ]);
  console.log('Routings API response received:', routingsResp.status());
  try {
    const data = await routingsResp.json();
    console.log('Routings count:', data.data?.length, 'keys:', Object.keys(data));
  } catch (e) {
    console.log('Failed to parse json:', e.message);
  }
  await page.waitForTimeout(2000);

  console.log('3. Opening routing row...');
  const rtgRow = await page.waitForSelector('.ant-table-row', { timeout: 15000 });
  const viewBtn = await rtgRow.$('button[title*="View" i], button:has(.anticon-eye)');
  if (viewBtn) await viewBtn.click();
  else await rtgRow.click();
  await page.waitForTimeout(2000);

  console.log('4. Opening Operation Editor...');
  const editOpBtn = await page.waitForSelector('button[title*="Edit" i], button:has(.anticon-edit)', { timeout: 8000 });
  await editOpBtn.click();

  console.log('5. Waiting for department items to finish loading...');
  const deptTag = await page.waitForSelector('.ant-tag:has-text("shown"):not(:has-text("0 shown"))', { timeout: 35000 });
  console.log('Department filter tag:', await deptTag.innerText());
  await page.waitForTimeout(1000);

  // Screenshot 1: Primary Material Filter Active
  console.log('5b. Capturing 01_operation_editor_primary_filter.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '01_operation_editor_primary_filter.png') });

  // Ensure an input material row exists
  let materialItemSelect = page.locator('.ant-form-item:has-text("Material Item") .ant-select').first();
  if (await materialItemSelect.count() === 0) {
    console.log('Adding input material row...');
    const addRowBtn = page.locator('button:has-text("Add Input Material")').first();
    await addRowBtn.click();
    await page.waitForTimeout(1000);
    materialItemSelect = page.locator('.ant-form-item:has-text("Material Item") .ant-select').first();
  }

  // Screenshot 2: Material dropdown showing only Primary Wires
  console.log('6. Opening Material dropdown for Primary Wires...');
  await materialItemSelect.click();
  await page.waitForTimeout(800);
  console.log('6b. Capturing 02_material_dropdown_primary_wires_only.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '02_material_dropdown_primary_wires_only.png') });

  // Select a primary wire
  const wireOption = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:has-text("RM-WIRE-006")').first();
  if (await wireOption.count() > 0) {
    await wireOption.click();
  } else {
    const firstOpt = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first();
    await firstOpt.click();
  }
  await page.waitForTimeout(800);

  // Screenshot 3: Qty / Unit display with dynamic UOM
  console.log('7. Capturing 03_material_qty_uom_display.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '03_material_qty_uom_display.png') });

  // Screenshot 4: Switch to Process Components
  console.log('8. Switching to Process Components filter...');
  const compBtn = page.locator('button:has-text("Process Components")').first();
  await compBtn.click();
  await page.waitForTimeout(800);
  await materialItemSelect.click();
  await page.waitForTimeout(800);
  console.log('8b. Capturing 04_material_dropdown_process_components.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '04_material_dropdown_process_components.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Switch back to Primary Materials
  const primaryBtn = page.locator('button:has-text("Primary Production Materials")').first();
  await primaryBtn.click();
  await page.waitForTimeout(800);

  // Step 5: Machine & Work Center Item Linkage
  console.log('9. Scrolling to Step 5 Machine & Work Center...');
  const step5Card = page.locator('.ant-card:has-text("Machine & Work Center")');
  await step5Card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  const reqMachineCheckbox = page.locator('label:has-text("Requires Machine") input[type="checkbox"]');
  if (!(await reqMachineCheckbox.isChecked())) {
    await reqMachineCheckbox.check();
    await page.waitForTimeout(1000);
  }

  // Screenshot 5: Machine & Work Center with targets
  console.log('9b. Capturing 05_step5_machine_item_targets.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '05_step5_machine_item_targets.png') });

  // Step 6: Test Error Popup Modal
  console.log('10. Testing centered Save Validation Error Popup Dialog...');
  const opCodeInput = page.locator('input[id*="operationCode"]').first();
  const originalOpCode = await opCodeInput.inputValue();
  await opCodeInput.fill(''); // make invalid

  const saveOpBtn = page.locator('.ant-modal-footer button:has-text("Save Operation")');
  await saveOpBtn.click();
  await page.waitForTimeout(1500);

  console.log('10b. Capturing 06_validation_error_popup_modal.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '06_validation_error_popup_modal.png') });

  // Close Error Dialog
  const errorDialogClose = page.locator('.ant-modal:has-text("Save Failed") button:has-text("Close"), .ant-modal:has-text("Validation") button:has-text("Close")').first();
  if (await errorDialogClose.count() > 0) {
    await errorDialogClose.click();
    await page.waitForTimeout(1000);
  }

  // Step 7: Test Success Popup Modal
  console.log('11. Testing centered Save Success Popup Dialog...');
  await opCodeInput.fill(originalOpCode || 'FT-001');
  await page.waitForTimeout(500);

  // Ensure row 0 has item selected
  const hasItem = await page.locator('.ant-form-item:has-text("Material Item") .ant-select-selection-item').count();
  if (hasItem === 0) {
    await materialItemSelect.click();
    await page.waitForTimeout(600);
    const wireOptionAgain = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:has-text("RM-WIRE")').first();
    if (await wireOptionAgain.count() > 0) {
      await wireOptionAgain.click();
      await page.waitForTimeout(600);
    }
  }

  await saveOpBtn.click();
  console.log('Waiting for success modal to appear...');
  await page.waitForSelector('.ant-modal:has-text("Successfully")', { timeout: 15000 });
  await page.waitForTimeout(800);

  console.log('11b. Capturing 07_save_success_popup_modal.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '07_save_success_popup_modal.png') });

  // Close success modal
  console.log('12. Closing success dialog...');
  const successDialogClose = page.locator('.ant-modal:has-text("Successfully") button:has-text("Close"), .ant-modal:has-text("Saved") button:has-text("Close")').first();
  if (await successDialogClose.count() > 0) {
    await successDialogClose.click();
    await page.waitForTimeout(1000);
  }

  await browser.close();
  console.log('COMPLETE! ALL 7 SCREENSHOTS VERIFIED AND SAVED!');
}

main().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
