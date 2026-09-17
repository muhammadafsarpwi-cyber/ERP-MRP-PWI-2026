const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACTS_DIR = 'C:/Users/afsar/.gemini/antigravity-ide/brain/7b7905a2-ce36-4aa3-a88c-f4fcddc6cc4f';

async function main() {
  console.log('1. Loading auth token...');
  const auth = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-token.json'), 'utf8'));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('BROWSER ERROR:', msg.text());
  });
  page.on('pageerror', (err) => {
    console.log('PAGE ERROR:', err.stack || err.message);
  });

  console.log('2. Authenticating via API and injecting token...');
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
  console.log('Successfully injected auth token!');

  console.log('3. Navigating to /production/entries/select with Spoke Division and General Shift...');
  await page.goto('http://localhost:3000/production/entries/select?divisionId=d1000000-0000-0000-0000-000000000001&shiftId=7b376b7c-e668-48ba-8914-ab04d06709d2');

  // Wait for loading spinner to detach
  try {
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 20000 });
  } catch {}
  await page.waitForTimeout(1500);

  // Capture screenshot of machine selection screen with loaded machines
  const shot1 = path.join(ARTIFACTS_DIR, '01_machine_select_names_and_actions.png');
  await page.screenshot({ path: shot1, fullPage: false });
  console.log('Saved screenshot 1:', shot1);

  // Remove CRA dev server overlay iframe if present
  await page.evaluate(() => document.getElementById('webpack-dev-server-client-overlay')?.remove());

  // Click "Select" on the first machine card
  console.log('Clicking Select on first machine card...');
  const cardSelectBtn = page.locator('button.ant-btn-primary:has-text("Select")').first();
  await cardSelectBtn.waitFor({ state: 'visible', timeout: 20000 });
  await cardSelectBtn.click({ force: true });
  await page.waitForURL('**/production/entries/new**', { timeout: 15000 });
  await page.waitForTimeout(2500);

  const shotFormPreload = path.join(ARTIFACTS_DIR, '02_entry_form_from_machine_select.png');
  await page.screenshot({ path: shotFormPreload, fullPage: false });
  console.log('Saved screenshot 2 (from select):', shotFormPreload);

  console.log('4. Navigating to /production/entries/new...');
  await page.goto('http://localhost:3000/production/entries/new');
  await page.waitForTimeout(2000);

  const shot3 = path.join(ARTIFACTS_DIR, '03_entry_form_names_first.png');
  await page.screenshot({ path: shot3, fullPage: false });
  console.log('Saved screenshot 3:', shot3);

  console.log('5. Navigating to /production/entries (Entry List)...');
  await page.goto('http://localhost:3000/production/entries');
  await page.waitForTimeout(2000);

  const shot4 = path.join(ARTIFACTS_DIR, '04_entry_list_names_and_actions.png');
  await page.screenshot({ path: shot4, fullPage: false });
  console.log('Saved screenshot 4:', shot4);

  console.log('All verifications complete!');
  await browser.close();
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
