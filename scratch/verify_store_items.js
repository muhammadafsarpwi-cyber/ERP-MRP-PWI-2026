const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const CHROME = [
  'C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

async function run() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Authenticating via API...');
  const lr = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }),
  });
  const j = await lr.json();

  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(({ token, refreshToken, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('erp_user', JSON.stringify(user));
  }, j);

  console.log('Navigating to /store/items...');
  await page.goto(BASE + '/store/items', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.ant-select:not(.ant-select-loading)', { timeout: 15000 });
  await page.waitForTimeout(2000);

  const artifactDir = 'C:\\Users\\afsar\\.gemini\\antigravity\\brain\\6b7c2e3c-d757-44d3-a015-5803bc7d22da';

  // 1. Select Division: Control Cable Division
  console.log('Selecting Control Cable Division...');
  const divSelect = page.locator('.ant-select').nth(0);
  await divSelect.click();
  await page.waitForTimeout(600);
  const ccdOption = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: 'Control Cable' }).first();
  if (await ccdOption.isVisible()) {
    await ccdOption.click();
  }
  await page.waitForTimeout(1000);

  // 2. Select Section: CCD Raw Material Store
  console.log('Selecting Section...');
  const secSelect = page.locator('.ant-select').nth(1);
  await secSelect.click();
  await page.waitForTimeout(600);
  const secOption = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: 'CCD Raw Material' }).first();
  if (await secOption.isVisible()) {
    console.log('Selected Section: CCD Raw Material Store');
    await secOption.click();
  } else {
    // Pick first available
    const first = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first();
    console.log('Selected fallback section:', await first.textContent());
    await first.click();
  }
  await page.waitForTimeout(1000);

  // 3. Select Department: CCD Stores
  console.log('Selecting Department...');
  const deptSelect = page.locator('.ant-select').nth(2);
  await deptSelect.click();
  await page.waitForTimeout(600);
  const deptOption = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: 'CCD Stores' }).first();
  if (await deptOption.isVisible()) {
    console.log('Selected Department: CCD Stores');
    await deptOption.click();
  } else {
    const first = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first();
    console.log('Selected fallback dept:', await first.textContent());
    await first.click();
  }
  await page.waitForTimeout(4000);
  await page.waitForSelector('.ant-table-row', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // 4. Capture screenshot showing auto-selected Store with items!
  const finalShot = path.join(artifactDir, 'store_items_auto_selected_perfect.png');
  await page.screenshot({ path: finalShot, fullPage: true });
  console.log('Saved auto-selected store screenshot to:', finalShot);

  await browser.close();
  console.log('Done!');
}

run().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
