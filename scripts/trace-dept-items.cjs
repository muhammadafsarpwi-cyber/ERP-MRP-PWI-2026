const { chromium } = require('playwright');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.text().includes('DEBUG_DEPT_ITEMS')) {
      console.log('PAGE LOG:', msg.text());
    }
  });

  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' })
  });
  const { token, refreshToken, user } = await loginRes.json();

  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, refreshToken, user }) => {
    localStorage.clear();
    localStorage.setItem('token', token);
    localStorage.setItem('access_token', token);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    if (user) localStorage.setItem('erp_user', JSON.stringify(user));
  }, { token, refreshToken, user });

  await page.goto('http://localhost:3000/production/routings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const rtgRow = await page.waitForSelector('.ant-table-row', { timeout: 10000 });
  const viewBtn = await rtgRow.$('button[title*="View" i], button:has(.anticon-eye)');
  if (viewBtn) await viewBtn.click();
  else await rtgRow.click();
  await page.waitForTimeout(2000);

  const editOpBtn = await page.waitForSelector('button[title*="Edit" i], button:has(.anticon-edit)', { timeout: 8000 });
  await editOpBtn.click();

  console.log('Waiting for department filter tag to show items...');
  const tag = await page.waitForSelector('.ant-tag:has-text("shown"):not(:has-text("0 shown"))', { timeout: 20000 });
  const tagText = await tag.innerText();
  console.log('SUCCESS! Tag text is:', tagText);

  // Open the material dropdown
  let materialItemSelect = page.locator('.ant-form-item:has-text("Material Item") .ant-select').first();
  if (await materialItemSelect.count() === 0) {
    const addInputBtn = page.locator('button:has-text("Add Input Material")');
    await addInputBtn.click();
    await page.waitForTimeout(1000);
    materialItemSelect = page.locator('.ant-form-item:has-text("Material Item") .ant-select').first();
  }

  await materialItemSelect.click();
  await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', { timeout: 8000 });
  const options = await page.$$eval('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', opts => opts.map(o => o.innerText.trim().replace(/\n+/g, ' ')));
  console.log('Dropdown options count:', options.length);
  console.log('Options:', options);

  await browser.close();
}

test().catch(console.error);
