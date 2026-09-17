const { chromium } = require('playwright');
const path = require('path');

async function check() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' })
  });
  const authData = await loginRes.json();
  console.log('Login res status:', loginRes.status, 'user:', authData.user?.email);

  await page.goto('http://localhost:3000/login');
  // Fill form directly to trigger full React auth flow
  await page.fill('input[id*="username"], input[type="email"], input[id*="email"]', 'system.admin@erp.com');
  await page.fill('input[type="password"]', 'Admin#2026!Secure');
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log('Current URL after login submit:', page.url());

  await page.goto('http://localhost:3000/production/routings');
  await page.waitForTimeout(3000);
  console.log('URL at routings:', page.url());

  const tableRows = await page.locator('.ant-table-row').count();
  console.log('Table rows count:', tableRows);
  const bodyText = await page.locator('body').innerText();
  console.log('Page body snippet:', bodyText.slice(0, 300));

  await page.screenshot({ path: path.join(__dirname, 'routings_debug.png') });
  await browser.close();
}

check().catch(console.error);
