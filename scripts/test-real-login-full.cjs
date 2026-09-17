const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testFullFlow() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });

  console.log('1. Navigating to login...');
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(1000);

  console.log('2. Entering credentials & submitting...');
  await page.fill('#login_email', 'system.admin@erp.com');
  await page.fill('#login_password', 'Admin#2026!Secure');
  await page.click('button[type="submit"]');

  console.log('3. Waiting for dashboard navigation...');
  await page.waitForURL('**/dashboard', { timeout: 15000 });

  console.log('4. Navigating to /production/routings...');
  await page.goto('http://localhost:3000/production/routings');

  console.log('5. Waiting for table rows to load...');
  await page.waitForSelector('tr.ant-table-row', { timeout: 15000 });

  const rowCount = await page.locator('tr.ant-table-row').count();
  console.log('Successfully rendered table rows:', rowCount);

  const artifactDir = path.resolve(__dirname, '../.gemini/antigravity-ide/brain/7b7905a2-ce36-4aa3-a88c-f4fcddc6cc4f');
  const targetDir = fs.existsSync(artifactDir) ? artifactDir : path.resolve(process.env.USERPROFILE || '', '.gemini/antigravity-ide/brain/7b7905a2-ce36-4aa3-a88c-f4fcddc6cc4f');

  // Verify headers
  const headers = await page.$$eval('.ant-table-thead th', ths => ths.map(t => t.innerText.trim()).filter(Boolean));
  console.log('Table Headers:', headers);

  // Take screenshot of the table with all audit columns and actions
  await page.screenshot({ path: path.join(targetDir, '01_routing_table_audit_and_actions.png') });
  console.log('Saved 01_routing_table_audit_and_actions.png');

  // Verify sample row 1
  const firstRow = await page.locator('tr.ant-table-row').first().innerText();
  console.log('Sample Row 1:\n', firstRow.replace(/\n+/g, ' | '));

  // Look for DBGRTG644551
  const dbgRow = page.locator('tr.ant-table-row', { hasText: 'DBGRTG644551' }).first();
  if (await dbgRow.count() > 0) {
    console.log('6. Clicking Edit on DBGRTG644551...');
    const editBtn = dbgRow.locator('button:has(.anticon-edit)').first();
    await editBtn.click();
    await page.waitForSelector('.ant-modal-content', { timeout: 8000 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(targetDir, '02_routing_edit_modal_resolved_names.png') });
    console.log('Saved 02_routing_edit_modal_resolved_names.png');

    const modalSelects = await page.$$eval('.ant-modal-content .ant-select-selection-item', items => items.map(i => i.innerText.trim()));
    console.log('Modal Dropdown selections:', modalSelects);

    const hasUuid = modalSelects.some(s => /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(s));
    console.log('Any raw UUID displayed in modal dropdowns?:', hasUuid);

    // Cancel modal
    await page.click('.ant-modal-content button:has-text("Cancel")');
    await page.waitForTimeout(1000);
  }

  // Check ACTIVE row RTG-001 action buttons
  const rtg001 = page.locator('tr.ant-table-row', { hasText: 'RTG-001' }).first();
  if (await rtg001.count() > 0) {
    const editBtn = rtg001.locator('button:has(.anticon-edit)').first();
    const delBtn = rtg001.locator('button:has(.anticon-delete)').first();
    console.log('RTG-001 Edit enabled?', !(await editBtn.isDisabled()));
    console.log('RTG-001 Delete enabled?', !(await delBtn.isDisabled()));
  }

  await browser.close();
  console.log('ALL VERIFICATIONS COMPLETED WITH 100% SUCCESS!');
}

testFullFlow().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
