/** Diagnose why the edit modal stays open after a successful save. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const C01 = 'CCD-C01', A01 = 'CCD-A01';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));

  let patchDone = null;
  page.on('response', async (resp) => {
    if (resp.request().method() === 'PATCH' && resp.url().includes('/warehouse-locations/')) {
      patchDone = Date.now();
      console.log('PATCH response HTTP', resp.status());
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
    console.log('Save clicked');
  }

  // wait for response then give the UI generous time to react
  const deadline = Date.now() + 15000;
  while (!patchDone && Date.now() < deadline) await page.waitForTimeout(100);
  console.log('patchDone:', !!patchDone);
  await page.waitForTimeout(6000);

  const state = await page.evaluate(() => {
    const modals = [...document.querySelectorAll('.ant-modal')].map((m) => ({
      title: m.querySelector('.ant-modal-title')?.innerText || '(none)',
      display: m.offsetParent ? 'visible' : 'hidden',
      inWrap: !!m.closest('.ant-modal-wrap'),
      wrapDisplay: m.closest('.ant-modal-wrap') ? getComputedStyle(m.closest('.ant-modal-wrap')).display : null,
      wrapHidden: m.closest('.ant-modal-wrap')?.classList.contains('ant-modal-wrap-hidden') || false,
    }));
    const toasts = [...document.querySelectorAll('.ant-message-notice')].map((t) => t.innerText.replace(/\s+/g, ' ').trim());
    const confirms = [...document.querySelectorAll('.ant-modal-confirm')].map((c) => c.innerText.replace(/\s+/g, ' ').trim().slice(0, 200));
    const okBtn = [...document.querySelectorAll('.ant-modal button')].find((b) => b.innerText.trim() === 'OK');
    return { modals, toasts, confirms, editOkStillThere: !!okBtn };
  });
  console.log(JSON.stringify(state, null, 2));

  await browser.close();

  // restore DB baseline: clear parent via API
  const { Client } = require('pg');
  const db = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 6543, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await db.connect();
  const login = await fetch('http://localhost:3001/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }) }).then((r) => r.json());
  const row = (await db.query("SELECT id FROM warehouse_locations WHERE location_code=$1", [C01])).rows[0];
  const res = await fetch(`http://localhost:3001/api/v1/warehouse-locations/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` }, body: JSON.stringify({ parentLocationId: null }) });
  const after = (await db.query('SELECT parent_location_id FROM warehouse_locations WHERE id=$1', [row.id])).rows[0].parent_location_id;
  console.log('restore PATCH', res.status, '| C01 parent now =', after);
  await db.end();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
