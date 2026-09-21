const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';

async function main() {
  console.log('🚀 Starting Stock Ledger Modal Verification...');
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

  console.log('3. Navigating to Store Stock Balance...');
  await page.goto(`${BASE}/store/stock-balance`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.ant-table', { timeout: 15000 });

  console.log('4. Waiting for rows...');
  await page.waitForSelector('tr.ant-table-row', { timeout: 15000 });

  const flatWireRow = page.locator('tr.ant-table-row', { hasText: 'FLAT-WIRE-001' }).first();
  await flatWireRow.waitFor({ timeout: 10000 });
  console.log('Found FLAT-WIRE-001 row!');

  console.log('5. Clicking on Stock Ledger button to open POP-UP MODAL...');
  const ledgerBtn = flatWireRow.locator('button', { hasText: 'Stock Ledger' }).first();
  await ledgerBtn.click();

  console.log('6. Waiting for POP-UP MODAL to open...');
  await page.waitForSelector('.ant-modal-content', { timeout: 10000 });
  await page.waitForTimeout(2500);

  // Read Modal title
  const modalTitle = await page.locator('.ant-modal-title').innerText();
  console.log('\n--- MODAL TITLE ---\n', modalTitle.replace(/\n+/g, ' | '));

  // Read KPI cards
  const stats = await page.$$eval('.ant-modal-body .ant-statistic', elements =>
    elements.map(el => el.innerText.replace(/\n+/g, ' | '))
  );
  console.log('\n--- KPI CARDS ---\n', stats);

  // Read Tabs
  const tabs = await page.$$eval('.ant-modal-body .ant-tabs-tab', elements =>
    elements.map(el => el.innerText.trim())
  );
  console.log('\n--- TABS ---\n', tabs);

  // Check row count
  const modalRows = await page.locator('.ant-modal-body tr.ant-table-row').count();
  console.log('\n--- MODAL LEDGER ROW COUNT ---:', modalRows);

  // Check sample rows
  const sampleRows = await page.$$eval('.ant-modal-body tr.ant-table-row', rows =>
    rows.slice(0, 5).map(r => r.innerText.replace(/\t+|\n+/g, ' | '))
  );
  console.log('\n--- SAMPLE MODAL ROWS ---\n', sampleRows);

  // Check Delete buttons
  const deleteBtnCount = await page.locator('.ant-modal-body button .anticon-delete').count();
  console.log('\n--- DELETE ACTION BUTTONS COUNT ---:', deleteBtnCount);

  // Check for any Urdu characters
  const modalText = await page.locator('.ant-modal-content').innerText();
  const urduMatch = modalText.match(/[\u0600-\u06FF]/g);
  console.log('\n--- URDU CHARACTERS IN MODAL ---:', urduMatch ? urduMatch.join('') : 'NONE (100% ENGLISH)');

  // Take screenshot of the pop-up modal
  const artifactDir = path.resolve(process.env.USERPROFILE || '', '.gemini/antigravity-ide/brain/c93704e6-2b37-4d41-9d0c-0666b831511c');
  const screenshotPath = path.join(artifactDir, 'stock_ledger_popup_modal_verified.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('\n✅ Screenshot saved to:', screenshotPath);

  await browser.close();
}

main().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
