const { chromium } = require('playwright');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('Item') || msg.text().includes('dept')) {
      console.log('BROWSER CONSOLE:', msg.type(), msg.text());
    }
  });

  page.on('response', resp => {
    if (resp.url().includes('items') || resp.url().includes('machine')) {
      console.log('RESP:', resp.status(), resp.url());
    }
  });

  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' })
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token || loginJson.data?.token || loginJson.data?.accessToken;
  const user = loginJson.user || loginJson.data?.user;

  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ jwt, u }) => {
    localStorage.setItem('token', jwt);
    localStorage.setItem('access_token', jwt);
    if (u) localStorage.setItem('erp_user', JSON.stringify(u));
  }, { jwt: token, u: user });

  await page.goto('http://localhost:3000/production/routings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const rtgRow = await page.waitForSelector('.ant-table-row', { timeout: 10000 });
  const viewBtn = await rtgRow.$('button[title*="View" i], button:has(.anticon-eye)');
  if (viewBtn) await viewBtn.click();
  else await rtgRow.click();
  await page.waitForTimeout(2000);

  const editOpBtn = await page.waitForSelector('button[title*="Edit" i], button:has(.anticon-edit)', { timeout: 8000 });
  await editOpBtn.click();
  await page.waitForTimeout(3000);

  const selectText = await page.locator('.ant-form-item:has-text("Material Item")').first().innerText();
  console.log('Material Item field text:', selectText);

  await browser.close();
}

test().catch(console.error);
