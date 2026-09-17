const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';
const SHOT_DIR = 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\department-crud';

if (!fs.existsSync(SHOT_DIR)) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
}

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok: !!ok, extra: extra || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}\t${name}${extra ? ' :: ' + extra : ''}`);
}

async function main() {
  console.log('🚀 Starting Department E2E Live UI Test...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Acquire JWT token and inject session into browser
    const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const loginJson = await loginRes.json();
    const token = loginJson.token || loginJson.data?.token || loginJson.data?.session?.access_token;
    check('Auth Token Acquired', !!token);

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((jwt) => {
      localStorage.setItem('token', jwt);
      localStorage.setItem('access_token', jwt);
      localStorage.setItem('user', JSON.stringify({
        id: '0804af57-1f03-4d11-ad84-dc34f8829db1',
        email: 'system.admin@erp.com',
        displayName: 'System Admin',
        role: 'SUPER_ADMIN',
      }));
    }, token);

    // 2. Navigate to Organization -> Departments
    await page.goto(`${BASE}/organization/departments`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.ant-table', { timeout: 15000 });
    check('Navigate to Departments Page', page.url().includes('/departments'));

    // Check table headers
    const tableText = await page.locator('.ant-table').first().innerText();
    const hasCode = tableText.includes('Department Code');
    const hasCreatedBy = tableText.includes('Created By');
    const hasCreatedDate = tableText.includes('Created Date');
    const hasUpdatedBy = tableText.includes('Updated By');
    const hasUpdatedDate = tableText.includes('Updated Date');
    check('Table Header: Department Code', hasCode);
    check('Table Header: Created By', hasCreatedBy);
    check('Table Header: Created Date', hasCreatedDate);
    check('Table Header: Updated By', hasUpdatedBy);
    check('Table Header: Updated Date', hasUpdatedDate);

    await page.screenshot({ path: path.join(SHOT_DIR, '01_department_table_audit_columns.png'), fullPage: true });

    // 3. Test Save Validation Popup on incomplete create
    console.log('\n--- Step 3: Test Save Validation Popup ---');
    await page.locator('button:has-text("Add Department")').click();
    await page.waitForTimeout(1000);
    const modalVisible = await page.locator('.ant-modal').isVisible();
    check('Add Department Modal Opened', modalVisible);

    // Click OK without filling form
    await page.locator('.ant-modal-footer button.ant-btn-primary').click();
    await page.waitForTimeout(1000);
    const validationModal = await page.locator('.ant-modal-confirm-error').first().isVisible();
    check('Validation Error Popup Displayed', validationModal);
    await page.screenshot({ path: path.join(SHOT_DIR, '02_validation_error_popup.png') });

    // Close validation error popup
    await page.locator('.ant-modal-confirm-btns button').first().click();
    await page.waitForTimeout(500);

    // 4. Fill form with valid Department
    console.log('\n--- Step 4: Create Department with Section ---');
    const testDeptCode = 'QA-DEPT-' + Date.now().toString().slice(-4);
    
    // Select Company (first option)
    await page.locator('.ant-modal .ant-select').nth(0).click();
    await page.waitForTimeout(500);
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click();
    await page.waitForTimeout(1000);

    // Select Division (DIV-CCD)
    await page.locator('.ant-modal .ant-select').nth(1).click();
    await page.waitForTimeout(500);
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option:has-text("Control Cable")').first().click();
    await page.waitForTimeout(1000);

    // Select Section (SEC-016 CCD PVC & Packing Section )
    await page.locator('.ant-modal .ant-select').nth(2).click();
    await page.waitForTimeout(500);
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option:has-text("PVC")').first().click();
    await page.waitForTimeout(500);

    // Enter Code and Name
    await page.locator('.ant-modal input#departmentCode, .ant-modal input[name="departmentCode"]').first().fill(testDeptCode);
    await page.locator('.ant-modal input#name, .ant-modal input[name="name"]').first().fill('QA Cable Department');
    await page.waitForTimeout(500);

    // Click Save
    await page.locator('.ant-modal-footer button.ant-btn-primary').click();
    await page.waitForTimeout(1000);

    // Verify Confirmation Popup
    const confirmModal = await page.locator('.ant-modal-confirm-confirm').first().isVisible();
    check('Save Confirmation Popup Appeared', confirmModal);
    await page.screenshot({ path: path.join(SHOT_DIR, '03_save_confirmation_popup.png') });

    // Click Save in confirmation popup
    await page.locator('.ant-modal-confirm-btns button.ant-btn-primary').first().click();
    await page.locator('.ant-modal-confirm').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.locator('.ant-modal:not(.ant-modal-confirm)').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Verify success and table row
    const createdRow = page.locator('tr').filter({ hasText: testDeptCode }).first();
    await createdRow.waitFor({ state: 'visible', timeout: 10000 });
    const createdVisible = await createdRow.isVisible();
    check('Department Created & Visible in Table', createdVisible);
    const createdText = await createdRow.innerText();
    check('Created Section Matches PVC', createdText.includes('PVC') || createdText.includes('SEC-016'));
    check('Created By Displays System Admin', createdText.includes('System Admin') || createdText.includes('Admin'));
    await page.screenshot({ path: path.join(SHOT_DIR, '04_department_created_in_table.png'), fullPage: true });

    // 5. Test Edit Department & Section Change Persistence
    console.log('\n--- Step 5: Test Section Change in Edit Modal ---');
    // Click Edit icon for our created row
    await createdRow.locator('button[title="Edit Department"], .anticon-edit').first().click();
    await page.waitForTimeout(1000);

    // Verify Edit modal loaded existing values
    const editModal = page.locator('.ant-modal:not(.ant-modal-confirm)').first();
    check('Edit Modal Opened', await editModal.isVisible());

    // Change Section to Raw Material Store (SEC-111)
    await page.locator('.ant-modal .ant-select').nth(2).click();
    await page.waitForTimeout(500);
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option:has-text("Store")').first().click();
    await page.waitForTimeout(500);

    // Click Save
    await page.locator('.ant-modal-footer button.ant-btn-primary').click();
    await page.waitForTimeout(1000);

    // Confirm save
    const editConfirm = await page.locator('.ant-modal-confirm-confirm').first().isVisible();
    check('Edit Save Confirmation Popup Appeared', editConfirm);
    await page.locator('.ant-modal-confirm-btns button.ant-btn-primary').first().click();
    await page.locator('.ant-modal-confirm').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.locator('.ant-modal:not(.ant-modal-confirm)').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Verify updated Section in table
    const updatedRowWithStore = page.locator('tr').filter({ hasText: testDeptCode }).filter({ hasText: 'Store' });
    await updatedRowWithStore.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    const updatedRow = page.locator('tr').filter({ hasText: testDeptCode }).first();
    const updatedText = await updatedRow.innerText();
    check('Section Change Persisted in Table (SEC-111 / Store)', updatedText.includes('Store') || updatedText.includes('SEC-111'));
    await page.screenshot({ path: path.join(SHOT_DIR, '05_section_changed_in_table.png'), fullPage: true });

    // Reopen Edit modal and verify Section is still selected
    await updatedRow.locator('button[title="Edit Department"], .anticon-edit').first().click();
    await page.locator('.ant-modal:not(.ant-modal-confirm)').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1000);
    const sectionSelectedText = await page.locator('.ant-modal .ant-select').nth(2).innerText();
    check('Reopen Edit: New Section Still Selected', sectionSelectedText.includes('Store') || sectionSelectedText.includes('SEC-111'));
    await page.screenshot({ path: path.join(SHOT_DIR, '06_reopen_edit_persisted_section.png') });

    // Close Edit modal
    await page.locator('.ant-modal button[aria-label="Close"], .ant-modal .ant-modal-close').first().click();
    await page.locator('.ant-modal').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);

    // 6. Test Delete
    console.log('\n--- Step 6: Test Delete Department ---');
    await updatedRow.locator('button[title="Delete Department"], .anticon-delete').first().click();
    await page.waitForTimeout(1000);

    // Confirm deletion modal
    const deleteModal = await page.locator('.ant-modal-confirm-confirm').first().isVisible();
    check('Delete Confirmation Modal Appeared', deleteModal);
    await page.screenshot({ path: path.join(SHOT_DIR, '07_delete_confirmation_popup.png') });

    // Confirm delete
    await page.locator('.ant-modal-confirm-btns button:has-text("Delete")').first().click();
    await page.locator('.ant-modal-confirm').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Wait for row to disappear from table
    const deletedRow = page.locator('tr').filter({ hasText: testDeptCode });
    await deletedRow.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    check('Department Deleted from Table', (await deletedRow.count()) === 0);
    await page.screenshot({ path: path.join(SHOT_DIR, '08_after_deletion.png'), fullPage: true });

  } catch (err) {
    console.error('Error in E2E test:', err);
    await page.screenshot({ path: path.join(SHOT_DIR, 'error_state.png'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log('\n====================================');
  console.log('E2E TEST SUMMARY:');
  const passed = results.filter(r => r.ok).length;
  console.log(`Passed ${passed} / ${results.length} checks`);
  console.log('====================================');
}

main().catch(console.error);
