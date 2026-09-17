const { chromium } = require('playwright');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('request', req => {
    if (req.url().includes('items')) console.log('REQUEST:', req.method(), req.url());
  });
  page.on('response', resp => {
    if (resp.url().includes('items')) console.log('RESPONSE:', resp.status(), resp.url());
  });
  await page.goto('http://localhost:3000/login');
  await page.fill('input[id="email"]', 'system.admin@erp.com');
  await page.fill('input[id="password"]', 'Admin#2026!Secure');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.goto('http://localhost:3000/production/routings');
  await page.waitForTimeout(2000);
  const row = await page.waitForSelector('.ant-table-row');
  await row.click();
  await page.waitForTimeout(2000);
  const editBtn = await page.waitForSelector('button:has(.anticon-edit)');
  await editBtn.click();
  await page.waitForTimeout(4000);
  await browser.close();
}
test().catch(console.error);
