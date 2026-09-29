const { chromium } = require('playwright');
const VIS = '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  p.on('response', async r => {
    if (/\/api\/v1\/(locations|visitor\/hosts)/.test(r.url())) {
      let body = '';
      try { body = (await r.text()).slice(0, 300); } catch {}
      console.log('RESP', r.status(), r.url().replace('http://localhost:3001/api/v1',''), body);
    }
  });
  await p.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.getByRole('button', { name: /ENTER SYSTEM/i }).waitFor({ state:'visible', timeout: 300000 });
  await p.getByRole('button', { name: /ENTER SYSTEM/i }).click();
  await p.locator('input#login_email').waitFor({ state:'visible', timeout: 300000 });
  await p.locator('input#login_email').fill('system.admin@erp.com');
  await p.locator('input#login_password').fill('Admin#2026!Secure');
  await p.locator('button[type=submit]').click();
  await p.waitForURL(u => !u.pathname.includes('/login'), { timeout: 300000 });
  await p.goto('http://localhost:3000/visitor-management/visitors', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.getByTestId('visitor-page').waitFor({ state:'visible', timeout: 300000 });
  await p.getByTestId('new-visitor-button').click();
  await p.getByTestId('visitor-form').waitFor({ state:'visible', timeout: 60000 });
  const pick = async (labelText, query) => {
    const item = p.locator('.ant-form-item', { has: p.locator(`label:text-is("${labelText}")`) });
    const combo = item.locator('.ant-select').first();
    await combo.scrollIntoViewIfNeeded();
    await combo.click();
    const dd = p.locator(VIS).last();
    await dd.waitFor({ state: 'visible', timeout: 30000 });
    if (query) await combo.locator('input').first().fill(query);
    await dd.locator('.ant-select-item-option').first().waitFor({ state:'visible', timeout: 60000 });
    const chosen = (await dd.locator('.ant-select-item-option').first().innerText()).trim();
    await dd.locator('.ant-select-item-option').first().click();
    await dd.waitFor({ state:'hidden', timeout: 30000 }).catch(()=>{});
    return chosen;
  };
  console.log('DIV:', await pick('Division','CCD'));
  await p.waitForTimeout(6000);
  const item2 = p.locator('.ant-form-item', { has: p.locator('label:text-is("Location")') });
  console.log('LOC SELECT VALUE:', JSON.stringify(await item2.locator('.ant-select').first().innerText()));
  await item2.locator('.ant-select').first().click();
  const dd2 = p.locator(VIS).last();
  await dd2.waitFor({ state:'visible', timeout: 30000 });
  await p.waitForTimeout(2000);
  console.log('LOC OPTIONS:', JSON.stringify(await dd2.locator('.ant-select-item-option').allInnerTexts()));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
