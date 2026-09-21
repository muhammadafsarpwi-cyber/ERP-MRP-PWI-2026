const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';

async function main() {
  console.log('🚀 Verifying Store Dashboard Dropdown and Column Removal...');
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

  console.log('2. Injecting auth token into browser...');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((jwt) => {
    localStorage.setItem('token', jwt);
    localStorage.setItem('access_token', jwt);
    localStorage.setItem('erp_token', jwt);
    localStorage.setItem('user', JSON.stringify({
      id: '0804af57-1f03-4d11-ad84-dc34f8829db1',
      email: 'system.admin@erp.com',
      displayName: 'System Admin',
      role: 'SUPER_ADMIN',
    }));
  }, token);

  console.log('3. Navigating to Store Dashboard...');
  await page.goto(`${BASE}/store/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.ant-card', { timeout: 15000 });
  await page.waitForTimeout(2000);

  console.log('4. Checking Store Stock Summary Card...');
  const stockSummaryCard = page.locator('.ant-card', { hasText: 'Store Stock Summary' }).first();
  await stockSummaryCard.waitFor({ timeout: 10000 });

  // Check headers of the table
  const tableHeaders = await page.$$eval(
    '.ant-card:has-text("Store Stock Summary") .ant-table-thead th',
    ths => ths.map(th => th.innerText.trim()).filter(Boolean)
  );
  console.log('\n--- STORE STOCK SUMMARY TABLE HEADERS ---\n', tableHeaders);

  const hasStoreColumn = tableHeaders.some(h => h.toUpperCase() === 'STORE');
  console.log('\nDoes table have STORE column?', hasStoreColumn ? 'YES (SHOULD BE REMOVED!)' : 'NO (REMOVED SUCCESSFULLY! ✅)');

  // Check dropdowns in the card header
  const dropdownTexts = await page.$$eval(
    '.ant-card:has-text("Store Stock Summary") .ant-card-extra .ant-select',
    sels => sels.map(s => s.innerText.trim().replace(/\n+/g, ' | '))
  );
  console.log('\n--- DROPDOWNS IN CARD HEADER ---\n', dropdownTexts);

  // Take screenshot
  const artifactDir = path.resolve(process.env.USERPROFILE || '', '.gemini/antigravity-ide/brain/c93704e6-2b37-4d41-9d0c-0666b831511c');
  const screenshotPath = path.join(artifactDir, 'store_dashboard_store_dropdown_verified.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('\n✅ Screenshot saved to:', screenshotPath);

  await browser.close();
}

main().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
