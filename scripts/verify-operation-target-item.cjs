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

  await page.goto('http://localhost:3000/login');
  await page.evaluate(({ token, refreshToken, user }) => {
    localStorage.clear();
    localStorage.setItem('token', token);
    localStorage.setItem('access_token', token);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    if (user) localStorage.setItem('erp_user', JSON.stringify(user));
  }, { token, refreshToken, user });

  console.log('2. Navigating to routings...');
  await page.goto('http://localhost:3000/production/routings');
  await page.waitForTimeout(2000);

  console.log('3. Opening first routing...');
  const rtgRow = await page.waitForSelector('.ant-table-row', { timeout: 15000 });
  const viewBtn = await rtgRow.$('button[title*="View" i], button:has(.anticon-eye)');
  if (viewBtn) await viewBtn.click();
  else await rtgRow.click();
  await page.waitForTimeout(2000);

  console.log('4. Clicking edit operation on first operation (OP-001)...');
  const editOpBtn = await page.waitForSelector('button[title*="Edit" i], button:has(.anticon-edit)', { timeout: 10000 });
  await editOpBtn.click();
  await page.waitForTimeout(2000);

  console.log('5. Scrolling to Step 5 Machine & Work Center...');
  const step5Card = page.locator('.ant-card:has-text("Machine & Work Center")').first();
  await step5Card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  // Check what is currently displayed in Operation Target Item Select
  const targetItemSelectText = await page.locator('div:has-text("Operation Target Item (Machine Target Link)") + .ant-select .ant-select-selection-item').innerText().catch(() => 'NOT_FOUND');
  console.log('Target Item Select Display Text:', targetItemSelectText);

  // Check Assigned Machine dropdown text
  const assignedMachineText = await page.locator('.ant-form-item:has-text("Assigned Machine") .ant-select-selection-item').innerText().catch(() => 'NOT_FOUND');
  console.log('Assigned Machine Display Text:', assignedMachineText);

  // Save screenshot
  const shotPath = path.join(ARTIFACTS_DIR, '05_step5_resolved_target_item_name.png');
  await page.screenshot({ path: shotPath, fullPage: false });
  console.log('Saved screenshot to:', shotPath);

  await browser.close();
  console.log('Verification finished successfully!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
