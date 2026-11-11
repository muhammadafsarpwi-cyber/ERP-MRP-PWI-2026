const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const CHROME = [
  'C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

const artifactDir = 'C:\\Users\\afsar\\.gemini\\antigravity\\brain\\6b7c2e3c-d757-44d3-a015-5803bc7d22da';

async function main() {
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

  console.log('Navigating to /store/material-issues...');
  await page.goto(BASE + '/store/material-issues', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Take screenshot of main table
  await page.screenshot({ path: `${artifactDir}\\store_issues_table_english.png` });
  console.log('Saved store_issues_table_english.png');

  // Click "New Material Issue"
  console.log('Clicking New Material Issue button...');
  const newBtn = page.locator('button:has-text("New Material Issue")').first();
  await newBtn.click();
  await page.waitForTimeout(1500);

  // 1. Select Source Store: SPI General Store
  console.log('Selecting Source Store (SPI General Store)...');
  const storeInput = page.locator('.ant-modal .ant-select').filter({ hasText: /Select store/i }).first();
  if (await storeInput.isVisible()) {
    await storeInput.click();
    await page.waitForTimeout(600);
    const gsOpt = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: /SPI General Store/i }).first();
    if (await gsOpt.isVisible()) {
      await gsOpt.click();
      await page.waitForTimeout(800);
    }
  }

  // 2. Select Destination Department: Heading & Threading
  console.log('Selecting Destination Department...');
  const deptSelect = page.locator('.ant-modal .ant-select').filter({ hasText: /Select Department/i }).first();
  if (await deptSelect.isVisible()) {
    await deptSelect.click();
    await page.waitForTimeout(600);
    const deptOpt = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first();
    if (await deptOpt.isVisible()) {
      await deptOpt.click();
      await page.waitForTimeout(1200); // allow machines to load
    }
  }

  // 3. Click "Add Item Line"
  console.log('Adding line item...');
  const addLineBtn = page.locator('.ant-modal button:has-text("Add Item Line")');
  if (await addLineBtn.isVisible()) {
    await addLineBtn.click();
    await page.waitForTimeout(1000);
  }

  // Wait for division items to finish loading
  console.log('Waiting for division items to finish loading...');
  await page.waitForFunction(() => !document.body.innerText.includes('Loading division items...'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // 4. Open Item search dropdown to verify strict division-scoped items!
  console.log('Opening Item dropdown...');
  const itemSelect = page.locator('.ant-modal .ant-table .ant-select, .ant-modal .ant-card .ant-select').first();
  if (await itemSelect.isVisible()) {
    await itemSelect.click();
    await page.waitForTimeout(1000);
  }

  // Take screenshot with division-filtered items dropdown open
  await page.screenshot({ path: `${artifactDir}\\store_issue_division_filtered_items.png` });
  console.log('Saved store_issue_division_filtered_items.png');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Take full desktop modal screenshot
  await page.screenshot({ path: `${artifactDir}\\store_issue_modal_english_desktop.png` });
  console.log('Saved store_issue_modal_english_desktop.png');

  // 5. Mobile Viewport Check (390 x 844 iPhone standard)
  console.log('Testing Mobile Viewport...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${artifactDir}\\store_issue_modal_mobile_cards.png` });
  console.log('Saved store_issue_modal_mobile_cards.png');

  await browser.close();
  console.log('Playwright run completed successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
