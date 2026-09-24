/** Check whether the served bundle contains the title-flip and what title shows after save. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const C01 = 'CCD-C01', A01 = 'CCD-A01';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
  let respAt = null;
  const t0 = Date.now();
  page.on('response', (r) => {
    if (r.request().method() === 'PATCH' && r.url().includes('/warehouse-locations/')) { respAt = Date.now() - t0; console.log('PATCH resp', respAt, r.status()); }
  });

  // Is the compiled bundle carrying the change? CRA serves from memory; grep the page's JS chunks.
  await page.addInitScript(() => sessionStorage.setItem('pwi_welcome_passed', 'true'));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input#login_email', 'system.admin@erp.com');
  await page.fill('input#login_password', 'Admin#2026!Secure');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  // Fetch the LocationManagement chunk source as the browser would see it
  const chunkHit = await page.evaluate(async () => {
    const entries = performance.getEntriesByType('resource').map((e) => e.name);
    return entries.filter((n) => n.includes('LocationManagement') || n.includes('main')).slice(0, 10);
  });
  console.log('chunks:', JSON.stringify(chunkHit, null, 1));

  await page.goto(`${BASE}/organization/locations`, { waitUntil: 'networkidle' });
  await page.waitForSelector(`tr:has(td:text-is("${C01}"))`, { timeout: 20000 });
  await page.waitForTimeout(800);

  await page.locator(`tr:has(td:text-is("${C01}")) button[title="Edit Location"]`).click();
  await page.waitForSelector('.ant-modal-title:has-text("Edit Location")', { timeout: 15000 });
  await page.waitForTimeout(700);

  const pi = page.locator('.ant-modal').filter({ has: page.locator('.ant-modal-title', { hasText: 'Edit Location' }) })
    .locator('.ant-form-item', { has: page.locator('label', { hasText: 'Parent Location' }) });
  await pi.locator('.ant-select-selector').click();
  await page.waitForSelector('.ant-select-dropdown:visible', { timeout: 5000 });
  await page.waitForTimeout(400);
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: A01 }).first().click();
  await page.waitForTimeout(400);

  await page.locator('.ant-modal button:has-text("OK")').first().click();
  await page.waitForTimeout(700);
  const confirm = page.locator('.ant-modal-confirm:visible');
  if (await confirm.count()) await confirm.locator('button:has-text("Save")').click();

  // after response, watch title TEXT and presence
  const dl = Date.now() + 8000;
  while (Date.now() < dl && !respAt) await page.waitForTimeout(50);
  for (let i = 0; i < 10; i++) {
    const state = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.ant-modal-title')];
      return t.map((n) => ({ text: n.innerText.trim().slice(0, 40), vis: !!n.offsetParent }));
    });
    console.log(`t+${Date.now() - (t0 + (respAt || 0))}ms after resp:`, JSON.stringify(state));
    const edit = await page.locator('.ant-modal-title:has-text("Edit Location")').count();
    if (!edit) { console.log('Edit Location title GONE at poll', i); break; }
    await page.waitForTimeout(200);
  }

  // restore
  const stillEdit = await page.locator('.ant-modal-title:has-text("Edit Location")').count();
  if (stillEdit) { await page.keyboard.press('Escape'); await page.waitForTimeout(800); }
  else {
    await page.locator(`tr:has(td:text-is("${C01}")) button[title="Edit Location"]`).click();
    await page.waitForSelector('.ant-modal-title:has-text("Edit Location")', { timeout: 15000 });
    await page.waitForTimeout(700);
    const p2 = page.locator('.ant-modal').filter({ has: page.locator('.ant-modal-title', { hasText: 'Edit Location' }) })
      .locator('.ant-form-item', { has: page.locator('label', { hasText: 'Parent Location' }) });
    await p2.locator('.ant-select-selector').hover();
    const cb = p2.locator('.ant-select-clear, .ant-select-selection-clear');
    if (await cb.count()) await cb.first().click({ force: true });
    await page.waitForTimeout(400);
    await page.locator('.ant-modal button:has-text("OK")').first().click();
    await page.waitForTimeout(700);
    const c2 = page.locator('.ant-modal-confirm:visible');
    if (await c2.count()) await c2.locator('button:has-text("Save")').click();
    await page.waitForTimeout(3000);
  }
  console.log('done');
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
