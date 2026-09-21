const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';

async function main() {
  console.log('🚀 Verifying Store Opening Stock Page...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();

  console.log('1. Acquiring auth token...');
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token || loginJson.data?.token || loginJson.data?.session?.access_token;
  console.log('Auth token acquired:', !!token);

  console.log('2. Injecting token into browser localStorage...');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((jwt) => {
    const userObj = {
      id: '0804af57-1f03-4d11-ad84-dc34f8829db1',
      email: 'system.admin@erp.com',
      displayName: 'System Admin',
      role: 'SUPER_ADMIN',
      permissions: ['inventory.opening_stock.create', 'store.view'],
    };
    localStorage.setItem('token', jwt);
    localStorage.setItem('access_token', jwt);
    localStorage.setItem('erp_token', jwt);
    localStorage.setItem('erp_user', JSON.stringify(userObj));
    localStorage.setItem('user', JSON.stringify(userObj));
  }, token);

  console.log('3. Navigating to /store/opening-stock...');
  await page.goto(`${BASE}/store/opening-stock`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.ant-card', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Check form labels
  const formLabels = await page.$$eval('.ant-form-item-label label', labels =>
    labels.map(l => l.innerText.trim())
  );
  console.log('\n--- FORM LABELS ---:\n', formLabels);

  const hasCompany = formLabels.some(l => l.toUpperCase() === 'COMPANY');
  console.log('Has Company field?', hasCompany ? 'YES (ERROR)' : 'NO (REMOVED! ✅)');

  const hasDivision = formLabels.some(l => l.toUpperCase().includes('DIVISION'));
  console.log('Has Division field?', hasDivision ? 'YES ✅' : 'NO');

  // Check toolbar buttons
  const buttons = await page.$$eval('.ant-card-extra button', btns =>
    btns.map(b => b.innerText.trim()).filter(Boolean)
  );
  console.log('\n--- ACTION BUTTONS IN TOOLBAR ---:\n', buttons);

  // Check table headers
  const tableHeaders = await page.$$eval('.ant-table-thead th', ths =>
    ths.map(th => th.innerText.trim()).filter(Boolean)
  );
  console.log('\n--- OPENING STOCK TABLE HEADERS ---:\n', tableHeaders);

  // Check initial lines count
  const initialLineCount = await page.locator('tr.ant-table-row').count();
  console.log('Initial table lines count:', initialLineCount);

  // Click Add Line to add a second line
  console.log('4. Clicking "Add Line"...');
  await page.click('button:has-text("Add Line")');
  await page.waitForTimeout(1000);

  const updatedLineCount = await page.locator('tr.ant-table-row').count();
  console.log('Updated table lines count:', updatedLineCount);

  // Check for any Urdu text on page
  const pageText = await page.innerText('body');
  const urduMatch = pageText.match(/[\u0600-\u06FF]/g);
  console.log('Has Urdu on page?', urduMatch ? `YES (${urduMatch.length} chars)` : 'NO (100% PURE ENGLISH) ✅');

  // Take screenshot
  const artifactDir = path.resolve(process.env.USERPROFILE || '', '.gemini/antigravity-ide/brain/c93704e6-2b37-4d41-9d0c-0666b831511c');
  const screenshotPath = path.join(artifactDir, 'store_opening_stock_verified.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('\n✅ Screenshot saved to:', screenshotPath);

  await browser.close();
}

main().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
