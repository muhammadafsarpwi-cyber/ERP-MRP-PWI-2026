const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  const apiCalls = [];
  page.on('response', resp => {
    if (resp.url().includes('/api/v1/') && !resp.url().includes('/auth/me') && !resp.url().includes('/health')) {
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

  // Test Machine detail
  console.log('\n=== MACHINE DETAIL ===');
  apiCalls.length = 0;
  await page.goto('http://localhost:3000/barcode-management/machines', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log('List API calls:', JSON.stringify(apiCalls));
  
  const eyeBtn = page.locator('span[role="img"][aria-label="eye"]').first();
  if (await eyeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    apiCalls.length = 0;
    await eyeBtn.click();
    await page.waitForTimeout(3000);
    console.log('Detail API calls:', JSON.stringify(apiCalls));
    const modalText = await page.locator('.ant-modal-body').textContent().catch(() => 'NO MODAL');
    console.log('Modal:', modalText.substring(0, 500));
    await page.locator('.ant-modal-close').first().click().catch(() => {});
    await page.waitForTimeout(500);
  } else {
    console.log('No eye button found');
  }

  // Test Employee detail
  console.log('\n=== EMPLOYEE DETAIL ===');
  apiCalls.length = 0;
  await page.goto('http://localhost:3000/barcode-management/employees', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log('List API calls:', JSON.stringify(apiCalls));
  
  const empEye = page.locator('span[role="img"][aria-label="eye"]').first();
  if (await empEye.isVisible({ timeout: 3000 }).catch(() => false)) {
    apiCalls.length = 0;
    await empEye.click();
    await page.waitForTimeout(3000);
    console.log('Detail API calls:', JSON.stringify(apiCalls));
    const modalText = await page.locator('.ant-modal-body').textContent().catch(() => 'NO MODAL');
    console.log('Modal:', modalText.substring(0, 500));
  }

  // Test Production detail
  console.log('\n=== PRODUCTION DETAIL ===');
  apiCalls.length = 0;
  await page.goto('http://localhost:3000/barcode-management/production', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const prodEye = page.locator('span[role="img"][aria-label="eye"]').first();
  if (await prodEye.isVisible({ timeout: 3000 }).catch(() => false)) {
    apiCalls.length = 0;
    await prodEye.click();
    await page.waitForTimeout(3000);
    console.log('Detail API calls:', JSON.stringify(apiCalls));
    const modalText = await page.locator('.ant-modal-body').textContent().catch(() => 'NO MODAL');
    console.log('Modal:', modalText.substring(0, 500));
  }

  // Test Job Card detail
  console.log('\n=== JOB CARD DETAIL ===');
  apiCalls.length = 0;
  await page.goto('http://localhost:3000/barcode-management/job-cards', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const jcEye = page.locator('span[role="img"][aria-label="eye"]').first();
  if (await jcEye.isVisible({ timeout: 3000 }).catch(() => false)) {
    apiCalls.length = 0;
    await jcEye.click();
    await page.waitForTimeout(3000);
    console.log('Detail API calls:', JSON.stringify(apiCalls));
    const modalText = await page.locator('.ant-modal-body').textContent().catch(() => 'NO MODAL');
    console.log('Modal:', modalText.substring(0, 500));
  }

  // Test Print
  console.log('\n=== ITEM PRINT ===');
  await page.goto('http://localhost:3000/barcode-management/items', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const printerBtn = page.locator('span[role="img"][aria-label="printer"]').first();
  if (await printerBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await printerBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'D:/ERP-MRP-PWI-2026/browser-qa-screenshots/final-print.png', fullPage: true });
    const svgInfo = await page.evaluate(() => {
      const svgs = document.querySelectorAll('.ant-modal-body svg');
      return Array.from(svgs).map(s => ({
        hasRect: !!s.querySelector('rect'),
        children: s.children.length,
        width: s.getAttribute('width'),
      }));
    });
    console.log('SVG barcode:', JSON.stringify(svgInfo));
    console.log('Barcode rendered:', svgInfo.some(s => s.hasRect));
    const printText = await page.locator('.ant-modal-body').textContent().catch(() => '');
    console.log('Print content:', printText.substring(0, 300));
  }

  await browser.close();
})();
