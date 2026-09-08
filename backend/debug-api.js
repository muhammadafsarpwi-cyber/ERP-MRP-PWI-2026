const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

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

  // Get token from localStorage
  const token = await page.evaluate(() => localStorage.getItem('token'));
  console.log('Token available:', !!token);

  // Test employee detail API directly
  const empId = '2bea86bc-3b35-4c8c-a0ce-050cd7fd0dfa';
  const result = await page.evaluate(({ id, tok }) => {
    return fetch(`http://localhost:3001/api/v1/hr/employees/${id}`, {
      headers: { 'Authorization': `Bearer ${tok}` }
    }).then(r => r.text().then(body => ({ status: r.status, body: body.substring(0, 1000) })));
  }, { id: empId, tok: token });
  console.log('Employee API result:', JSON.stringify(result, null, 2));

  // Also test machine detail
  const machId = '5ee96714-fb9f-438a-8e38-59f23d4fa61d';
  const machResult = await page.evaluate(({ id, tok }) => {
    return fetch(`http://localhost:3001/api/v1/machines/${id}`, {
      headers: { 'Authorization': `Bearer ${tok}` }
    }).then(r => r.text().then(body => ({ status: r.status, body: body.substring(0, 1000) })));
  }, { id: machId, tok: token });
  console.log('Machine API result:', JSON.stringify(machResult, null, 2));

  await browser.close();
})();
