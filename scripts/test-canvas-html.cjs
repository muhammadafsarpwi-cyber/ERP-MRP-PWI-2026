const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' })
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token || loginJson.data?.token;

  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate((jwt) => {
    localStorage.setItem('token', jwt);
    localStorage.setItem('access_token', jwt);
  }, token);

  await page.goto('http://localhost:3000/production/routings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const dbgRow = page.locator('.ant-table-tbody tr:has-text("DBGRTG644551")');
  await dbgRow.locator('button:has(.anticon-eye)').click();
  await page.waitForTimeout(1500);

  await page.locator('.ant-segmented-item:has-text("Process Flow")').click();
  await page.waitForTimeout(3000);

  const canvasHtml = await page.locator('.routing-flow-canvas-container').innerHTML();
  console.log('Canvas HTML length:', canvasHtml.length);
  console.log('Canvas HTML:\n', canvasHtml.slice(0, 1000));

  await browser.close();
}

main().catch(console.error);
