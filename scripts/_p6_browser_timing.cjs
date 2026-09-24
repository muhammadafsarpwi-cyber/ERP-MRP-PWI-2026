/** Measure real in-browser Save-click -> PATCH-response latency (T4b timing analysis). */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const C01 = 'CCD-C01', A01 = 'CCD-A01';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  let patchStart = null, patchDone = null, modalClosedAt = null;
  const t0 = Date.now();

  page.on('response', async (resp) => {
    if (resp.request().method() === 'PATCH' && resp.url().includes('/warehouse-locations/')) {
      patchDone = Date.now() - t0;
      console.log('PATCH response at', patchDone, 'ms from script start; HTTP', resp.status());
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

  const tClick = Date.now() - t0;
  await page.locator('.ant-modal button:has-text("OK")').first().click();
  await page.waitForTimeout(700);
  const confirm = page.locator('.ant-modal-confirm:visible');
  if (await confirm.count()) {
    patchStart = Date.now() - t0;
    console.log('Save clicked at', patchStart, 'ms; PATCH starts now');
    await confirm.locator('button:has-text("Save")').click();
  }
  // poll for modal close like T4b does
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const open = (await page.locator('.ant-modal-title:has-text("Edit Location")').count()) > 0;
    if (!open) { modalClosedAt = Date.now() - t0; break; }
    await page.waitForTimeout(50);
  }
  console.log('modal closed at', modalClosedAt, 'ms');
  console.log('PATCH latency (click->response):', patchDone && patchStart ? (patchDone - patchStart) : 'n/a', 'ms');
  console.log('close after save-click:', modalClosedAt && patchStart ? (modalClosedAt - patchStart) : 'n/a', 'ms');

  // restore: clear parent back to null
  if (modalClosedAt) {
    // reopen, clear, save
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
    await page.waitForTimeout(3000);
    console.log('restored (cleared) parent');
  }

  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
