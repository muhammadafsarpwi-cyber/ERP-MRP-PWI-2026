/** Focused debug: does an in-browser Edit→Save PATCH complete? Captures request/response/requestfailed + timing. */
const { chromium } = require('playwright');
const { Client } = require('pg');

const BASE = 'http://localhost:3000';
const db = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await db.connect();
  const before = await db.query('SELECT parent_location_id FROM warehouse_locations WHERE location_code=$1', ['CCD-C01']);
  console.log('DB parent BEFORE:', before.rows[0].parent_location_id);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
  page.on('requestfailed', (r) => console.log('[requestfailed]', r.method(), r.url(), JSON.stringify(r.failure())));
  page.on('request', (r) => { if (r.method() === 'PATCH') console.log('[PATCH req]', Date.now() % 100000, r.url(), r.postData()); });
  page.on('response', (r) => { if (r.request().method() === 'PATCH') console.log('[PATCH res]', Date.now() % 100000, r.status(), r.url()); });

  await page.addInitScript(() => sessionStorage.setItem('pwi_welcome_passed', 'true'));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input#login_email', 'system.admin@erp.com');
  await page.fill('input#login_password', 'Admin#2026!Secure');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  await page.goto(`${BASE}/organization/locations`, { waitUntil: 'networkidle' });
  await page.waitForSelector('tr:has(td:text-is("CCD-C01"))', { timeout: 20000 });

  await page.locator('tr:has(td:text-is("CCD-C01")) button[title="Edit Location"]').click();
  await page.waitForSelector('.ant-modal-title:has-text("Edit Location")', { timeout: 15000 });

  const editModal = () => page.locator('.ant-modal').filter({ has: page.locator('.ant-modal-title', { hasText: 'Edit Location' }) });
  const parentItem = () => editModal().locator('.ant-form-item', { has: page.locator('label', { hasText: 'Parent Location' }) });

  const shown = async () => {
    const sel = parentItem().locator('.ant-select-selection-item');
    if (await sel.count()) return (await sel.first().innerText()).trim();
    const ph = parentItem().locator('.ant-select-selection-placeholder');
    if (await ph.count()) return '(empty)';
    return '(unknown)';
  };
  console.log('form parent on open:', JSON.stringify(await shown()));

  // dropdown options
  await parentItem().locator('.ant-select-selector').click();
  await page.waitForSelector('.ant-select-dropdown:visible', { timeout: 5000 });
  const opts = await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').allInnerTexts();
  console.log('OPTIONS:', JSON.stringify(opts));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // select A01 and save
  await parentItem().locator('.ant-select-selector').click();
  await page.waitForSelector('.ant-select-dropdown:visible', { timeout: 5000 });
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: 'CCD-A01' }).first().click();
  await page.waitForTimeout(300);
  console.log('selected:', JSON.stringify(await shown()));

  const t0 = Date.now();
  await editModal().locator('button:has-text("OK")').click();
  await page.waitForTimeout(700);
  const confirm = page.locator('.ant-modal-confirm:visible');
  if (await confirm.count()) {
    await confirm.locator('button:has-text("Save")').click();
    console.log('save confirmed at +', Date.now() - t0, 'ms');
  } else {
    console.log('no confirmation dialog (unexpected)');
  }

  // Wait up to 20s for edit modal to close
  let closed = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const stillVisible = await page.locator('.ant-modal-title:has-text("Edit Location")').isVisible().catch(() => false);
    const loading = await editModal().locator('button:has-text("OK").ant-btn-loading').count().catch(() => 0);
    if (!stillVisible) { closed = true; console.log('modal closed at +', Date.now() - '0' - t0, 'ms; loading=', loading); break; }
    if (i % 4 === 0) console.log('  t+', Date.now() - t0, 'ms modal visible; ok-loading=', loading);
  }
  if (!closed) console.log('MODAL STILL OPEN after 20s');
  await page.waitForTimeout(1500);
  const msgs = await page.locator('.ant-message-notice').allInnerTexts().catch(() => []);
  const confs = await page.locator('.ant-modal-confirm:visible').allInnerTexts().catch(() => []);
  console.log('messages:', JSON.stringify(msgs), 'confirms:', JSON.stringify(confs));

  const after = await db.query('SELECT parent_location_id FROM warehouse_locations WHERE location_code=$1', ['CCD-C01']);
  console.log('DB parent AFTER:', after.rows[0].parent_location_id);

  // reload page and re-check table + form
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('tr:has(td:text-is("CCD-C01"))', { timeout: 20000 });
  const row = await page.locator('tr:has(td:text-is("CCD-C01"))').innerText();
  console.log('TABLE ROW AFTER RELOAD:', JSON.stringify(row.replace(/\n/g, ' | ')));

  await browser.close();
  await db.end();
  process.exit(0);
})().catch(async (e) => { console.error('DEBUG FAILED:', e); try { await db.end(); } catch {} process.exit(1); });
