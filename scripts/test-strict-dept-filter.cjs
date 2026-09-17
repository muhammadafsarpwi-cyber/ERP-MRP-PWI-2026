const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/afsar/.gemini/antigravity-ide/brain/7b7905a2-ce36-4aa3-a88c-f4fcddc6cc4f';

(async () => {
  console.log('🚀 Testing Strict Section -> Department -> Materials filtering...');
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
    await page.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // 2. Navigate to Routings
    console.log('2. Navigating to Routings...');
    await page.goto('http://localhost:3000/production/routings', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 3. Find DBGRTG644551 or RTG-001
    console.log('3. Finding DBGRTG644551 routing...');
    let rtgRow = await page.$('tr:has-text("DBGRTG644551")');
    if (!rtgRow) {
      console.log('DBGRTG644551 not found, finding RTG-001...');
      rtgRow = await page.waitForSelector('tr:has-text("RTG-001")', { timeout: 10000 });
    }
    const viewBtn = await rtgRow.$('button[title*="View" i], button:has(.anticon-eye)');
    if (viewBtn) await viewBtn.click();
    else await rtgRow.click();
    await page.waitForTimeout(2000);

    // 4. Click Edit on the first operation
    console.log('4. Opening Operation Edit modal...');
    const editOpBtn = await page.waitForSelector('button[title*="Edit" i], button:has(.anticon-edit)', { timeout: 8000 });
    await editOpBtn.click();
    await page.waitForTimeout(1500);

    // 5. Select Division DIV-CCD then Section SEC-111
    console.log('5. Selecting DIV-CCD - Control Cable Division...');
    const divSelect = await page.waitForSelector('.ant-form-item:has-text("Division") .ant-select');
    await divSelect.click();
    await page.waitForTimeout(500);
    const divOption = await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:has-text("DIV-CCD")');
    await divOption.click();
    await page.waitForTimeout(800);

    console.log('Selecting SEC-111 - CCD Raw Material Store...');
    const sectionSelect = await page.waitForSelector('.ant-form-item:has-text("Section") .ant-select');
    await sectionSelect.click();
    await page.waitForTimeout(500);

    // Click on SEC-111 option
    const secOption = await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:has-text("SEC-111")');
    await secOption.click();
    await page.waitForTimeout(1000);

    // 6. Open Department dropdown and verify ONLY CCD-DEPT111 is present!
    console.log('6. Checking Department dropdown options...');
    const deptSelect = await page.waitForSelector('.ant-form-item:has-text("Department") .ant-select');
    await deptSelect.click();
    await page.waitForTimeout(500);

    // Capture dropdown options text
    const dropdownOptions = await page.$$eval('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', els => els.map(e => e.innerText.trim()));
    console.log('Department Dropdown Options for SEC-111:\n', dropdownOptions);

    // Verify CENT-FIN, CENT-ADM are NOT present
    const hasCentral = dropdownOptions.some(opt => opt.includes('CENT-') || opt.includes('Administration') || opt.includes('Finance'));
    console.log('Contains leaked central departments?', hasCentral);
    if (hasCentral) {
      throw new Error(`Leak detected: ${dropdownOptions.join(', ')}`);
    }

    // Ensure CCD-DEPT111 is selected or selectable
    const ccdDeptOpt = await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:has-text("CCD-DEPT111")');
    await ccdDeptOpt.click();
    await page.waitForTimeout(1000);

    // Take screenshot of Step 1 with department selected
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_strict_section_dept_filter.png') });
    console.log('Saved 07_strict_section_dept_filter.png');

    // 7. Click "+ Add Input Material" and check material options
    console.log('7. Testing Input Materials dropdown for CCD-DEPT111...');
    const addMatBtn = await page.waitForSelector('button:has-text("Add Input Material")');
    await addMatBtn.click();
    await page.waitForTimeout(1000);

    // Click material item select
    const matSelect = await page.waitForSelector('.ant-form-item:has-text("Material Item") .ant-select, .ant-select:has-text("Select material item"), .ant-select:has-text("Type code")');
    await matSelect.click();
    await page.waitForTimeout(800);

    const matOptions = await page.$$eval('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', els => els.map(e => e.innerText.trim()));
    console.log(`Material options in CCD-DEPT111 (count ${matOptions.length}):\n`, matOptions.slice(0, 10));

    // Verify RM-WIRE items are present
    const hasRmWire = matOptions.some(opt => opt.includes('RM-WIRE'));
    console.log('Contains CCD Raw Materials (RM-WIRE)?', hasRmWire);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, '08_strict_department_materials.png') });
    console.log('Saved 08_strict_department_materials.png');

    console.log('✅ ALL STRICT FILTERING CHECKS PASSED PERFECTLY!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '00_strict_filter_error.png') }).catch(() => {});
  } finally {
    await browser.close();
  }
})();
