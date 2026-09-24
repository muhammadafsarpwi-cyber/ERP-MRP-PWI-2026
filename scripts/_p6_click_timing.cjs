/** Split in-browser Save-click timing: click -> request sent -> response -> title gone. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const C01 = 'CCD-C01', A01 = 'CCD-A01';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  let tClick = null, tReq = null, tResp = null, tGone = null;
  const t0 = Date.now();

  page.on('request', (req) => {
    if (req.method() === 'PATCH' && req.url().includes('/warehouse-locations/')) tReq = Date.now() - t0;
    if (req.method() === 'OPTIONS' && req.url().includes('/warehouse-locations/')) console.log('OPTIONS preflight at', Date.now() - t0, 'ms');
  });
  page.on('response', (resp) => {
    if (resp.request().method() === 'PATCH' && resp.url().includes('/warehouse-locations/')) {
      tResp = Date.now() - t0;
      console.log('PATCH response at', tResp, 'ms; HTTP', resp.status());
    }
  });

  await page.addInitScript(() => sessionStorage.setItem('pwi_welcome_passed', 'true'));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input#login_email', 'system.admin@erp.com');
  await page.fill('input#login_password', 'Admin#2026!Secure');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  await page.goto(`${BASE}/organization/locations`, { waitUntil: 'networkidle' });
  await page.waitForSelector(`tr:has(td:text-is("${C01}"))`, { timeout: 20000 });
  await page.waitForTimeout(800);

  await page.locator(`tr:has(td:text-is("${C01}")) button[title="Edit Location"]`).click();
  await page.waitForSelector('.ant-modal-title:has-text("Edit Location")', { timeout: 15000 });
  await page.waitForTimeout(700);

  const parentItem = page.locator('.ant-modal').filter({ has: page.locator('.ant-modal-title', { hasText: 'Edit Location' }) })
    .locator('.ant-form-item', { has: page.locator('label', { hasText: 'Parent Location' }) });
  await parentItem.locator('.ant-select-selector').click();
  await page.waitForSelector('.ant-select-dropdown:visible', { timeout: 5000 });
  await page.waitForTimeout(400);
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: A01 }).first().click();
  await page.waitForTimeout(400);

  await page.locator('.ant-modal button:has-text("OK")').first().click();
  await page.waitForTimeout(700);
  const confirm = page.locator('.ant-modal-confirm:visible');
  if (await confirm.count()) {
    await confirm.locator('button:has-text("Save")').click();
    tClick = Date.now() - t0;
    console.log('Save clicked at', tClick, 'ms');
  }

  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if ((await page.locator('.ant-modal-title:has-text("Edit Location")').count()) === 0) { tGone = Date.now() - t0; break; }
    await page.waitForTimeout(30);
  }
  console.log('title gone at', tGone, 'ms');
  console.log('click -> request sent :', tReq && tClick ? tReq - tClick : 'n/a', 'ms');
  console.log('request -> response   :', tResp && tReq ? tResp - tReq : 'n/a', 'ms');
  console.log('response -> title gone:', tGone && tResp ? tGone - tResp : 'n/a', 'ms');
  console.log('click -> title gone   :', tGone && tClick ? tGone - tClick : 'n/a', 'ms  (harness T4b check ~2.0-2.6s)');

  // restore baseline: clear parent
  await page.locator(`tr:has(td:text-is("${C01}")) button[title="Edit Location"]`).click();
  await page.waitForSelector('.ant-modal-title:has-text("Edit Location")', { timeout: 15000 });
  await page.waitForTimeout(700);
  const pi = page.locator('.ant-modal').filter({ has: page.locator('.ant-modal-title', { hasText: 'Edit Location' }) })
    .locator('.ant-form-item', { has: page.locator('label', { hasText: 'Parent Location' }) });
  await pi.locator('.ant-select-selector').hover();
  const clearBtn = pi.locator('.ant-select-clear, .ant-select-selection-clear');
  if (await clearBtn.count()) await clearBtn.first().click({ force: true });
  await page.waitForTimeout(400);
  await page.locator('.ant-modal button:has-text("OK")').first().click();
  await page.waitForTimeout(700);
  const c2 = page.locator('.ant-modal-confirm:visible');
  if (await c2.count()) await c2.locator('button:has-text("Save")').click();
  await page.waitForTimeout(3500);
  console.log('restored (cleared) parent');

  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
