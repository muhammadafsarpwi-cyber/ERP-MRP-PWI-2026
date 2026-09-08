const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SCREENSHOT_DIR = path.join(__dirname, '..', 'browser-qa-screenshots');

(async () => {
  console.log('=== RETEST MACHINE + EMPLOYEE DETAIL ===\n');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const apiCalls = [];
  page.on('response', resp => {
    if (resp.url().includes('/api/v1/') && !resp.url().includes('/auth/') && !resp.url().includes('/health') && !resp.url().includes('/notifications') && !resp.url().includes('/communication') && !resp.url().includes('/pm/')) {
      apiCalls.push({ url: resp.url(), status: resp.status() });
    }
  });

  // Login
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);
  const wb = page.locator('button:has-text("WELCOME")').first();
  if (await wb.isVisible().catch(() => false)) await wb.click();
  await page.waitForTimeout(2000);
  await page.locator('#login_email').fill('system.admin@erp.com');
  await page.locator('#login_password').fill('Admin#2026!Secure');
  await page.locator('button[type="submit"], button:has-text("Login")').first().click();
  await page.waitForTimeout(5000);
  console.log('Logged in:', page.url());

  // Test Machine Detail (with fixed URL /machines/:id)
  console.log('\n=== MACHINE DETAIL (after fix) ===');
  await page.goto('http://localhost:3000/barcode-management/machines', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const machEye = page.locator('span[role="img"][aria-label="eye"]').first();
  if (await machEye.isVisible({ timeout: 3000 }).catch(() => false)) {
    apiCalls.length = 0;
    await machEye.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'retest-machine-detail.png'), fullPage: true });
    console.log('API calls:', JSON.stringify(apiCalls));
    const modalText = await page.locator('.ant-modal-body').textContent().catch(() => 'NO MODAL');
    console.log('Modal content:', modalText.substring(0, 500));
    console.log('Structured:', modalText.includes('Machine Code') || modalText.includes('Machine Name'));
    await page.locator('.ant-modal-close').first().click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // Test Employee Detail (pre-existing 500)
  console.log('\n=== EMPLOYEE DETAIL (pre-existing 500) ===');
  await page.goto('http://localhost:3000/barcode-management/employees', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const empEye = page.locator('span[role="img"][aria-label="eye"]').first();
  if (await empEye.isVisible({ timeout: 3000 }).catch(() => false)) {
    apiCalls.length = 0;
    await empEye.click();
    await page.waitForTimeout(3000);
    console.log('API calls:', JSON.stringify(apiCalls));
    const modalText = await page.locator('.ant-modal-body').textContent().catch(() => 'NO MODAL');
    console.log('Modal content:', modalText.substring(0, 300));
    console.log('Has NO MODAL:', modalText === 'NO MODAL');
  }

  // Test Scan Navigation
  console.log('\n=== SCAN — EXACT NAVIGATION ===');
  await page.goto('http://localhost:3000/barcode-management/scan', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const scanInput = page.locator('input[placeholder*="Enter" i], input[placeholder*="barcode" i]').first();
  const lookupBtn = page.locator('button:has-text("Lookup")').first();

  // Test with an actual barcode
  await scanInput.fill('8901000000001');
  await lookupBtn.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'retest-scan-result.png'), fullPage: true });
  const t = await page.textContent('body');
  console.log('Resolved:', t.includes('Found') || t.includes('Barcode Resolved'));
  console.log('Entity type visible:', t.includes('Item') || t.includes('Customer') || t.includes('Machine'));

  // Navigate to entity
  const navBtn = page.locator('button:has-text("Open Item")').first();
  if (await navBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await navBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'retest-scan-nav.png'), fullPage: true });
    console.log('Navigated to:', page.url());
    console.log('Correct entity page:', page.url().includes('items'));
  }

  await browser.close();
  console.log('\n=== DONE ===');
})();
