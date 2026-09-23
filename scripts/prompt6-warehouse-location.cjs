/**
 * PROMPT #6 — Warehouse Location Edit/Save verification harness.
 *
 * Usage:  node scripts/prompt6-warehouse-location.cjs [before|after]
 *
 * Runs the same checks in both phases and prints a PASS/FAIL table:
 *   T1   NULL parent loads as blank (not self, not stale)
 *   T2   current location excluded from the Parent Location dropdown
 *   T3   descendants of the current location excluded from the dropdown
 *   T4   saving a valid parent persists parent_location_id in the DB
 *   T4b  edit modal closes on a successful save
 *   T6   "No Parent" (cleared) persists as NULL
 *   T5   failed save keeps the modal open, shows the real backend error,
 *        and never shows a false success
 *   T7   no stale parent state when switching between records
 *   T8   value survives a browser refresh
 *   API1 backend rejects self as parent (400)
 *   API2 backend rejects a circular parent (400)
 *
 * Also records the exact PATCH payload the UI sends.
 */
const { chromium } = require('playwright');
const { Client } = require('pg');

const PHASE = process.argv[2] || 'before';
const BASE = 'http://localhost:3000';
const API = 'http://localhost:3001/api/v1';
const SHOTS = 'browser-qa-screenshots';

const C01 = 'CCD-C01';
const C02 = 'CCD-C02';
const A01 = 'CCD-A01';
const A02 = 'CCD-A02';

const db = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

const log = (...a) => console.log(`[${PHASE}]`, ...a);
const results = [];
function check(id, name, pass, detail) {
  results.push({ id, name, pass: !!pass, detail: detail || '' });
  log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function dbRow(code) {
  const r = await db.query(
    'SELECT id, location_code, name, parent_location_id FROM warehouse_locations WHERE location_code = $1',
    [code],
  );
  return r.rows[0] || null;
}
async function dbParentLabel(code) {
  const row = await dbRow(code);
  if (!row) return 'ROW NOT FOUND';
  if (!row.parent_location_id) return 'NULL (root)';
  const p = await db.query('SELECT location_code FROM warehouse_locations WHERE id = $1', [row.parent_location_id]);
  return p.rows[0] ? p.rows[0].location_code : row.parent_location_id;
}

(async () => {
  await db.connect();
  const baseline = await dbParentLabel(C01);
  log('DB parent_location_id BEFORE:', baseline);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });

  const patches = [];
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && req.url().includes('/warehouse-locations/')) {
      patches.push({ url: req.url().replace(BASE, ''), payload: req.postData() });
    }
  });
  page.on('response', async (resp) => {
    if (resp.request().method() === 'PATCH' && resp.url().includes('/warehouse-locations/')) {
      let body = '';
      try { body = (await resp.text()).slice(0, 500); } catch {}
      const rec = patches.find((p) => !p.status);
      if (rec) { rec.status = resp.status(); rec.responseBody = body; }
      else patches.push({ status: resp.status(), responseBody: body });
    }
  });

  // ---------- helpers ----------
  const editModal = () =>
    page.locator('.ant-modal').filter({ has: page.locator('.ant-modal-title', { hasText: 'Edit Location' }) });
  const parentItem = () =>
    editModal().locator('.ant-form-item', { has: page.locator('label', { hasText: 'Parent Location' }) });

  async function editModalOpen() {
    return (await page.locator('.ant-modal-title:has-text("Edit Location")').count()) > 0;
  }
  async function openEdit(code) {
    if (await editModalOpen()) await closeEdit();
    await page.locator(`tr:has(td:text-is("${code}")) button[title="Edit Location"]`).click();
    await page.waitForSelector('.ant-modal-title:has-text("Edit Location")', { timeout: 15000 });
    await page.waitForTimeout(700);
  }
  async function closeEdit() {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
  }
  async function parentShown() {
    const sel = parentItem().locator('.ant-select-selection-item');
    if (await sel.count()) return (await sel.first().innerText()).trim();
    const ph = parentItem().locator('.ant-select-selection-placeholder');
    if (await ph.count()) return '(empty)';
    return '(unknown)';
  }
  async function openParentDropdown() {
    await parentItem().locator('.ant-select-selector').click();
    await page.waitForSelector('.ant-select-dropdown:visible', { timeout: 5000 });
    await page.waitForTimeout(400);
  }
  async function dropdownOptions() {
    return page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').allInnerTexts();
  }
  async function readFormFields() {
    return page.evaluate(() => {
      const out = {};
      document.querySelectorAll('.ant-modal .ant-form-item').forEach((fi) => {
        const label = fi.querySelector('label')?.innerText || '?';
        const sel = fi.querySelector('.ant-select-selection-item');
        const ph = fi.querySelector('.ant-select-selection-placeholder');
        const inp = fi.querySelector('input:not([type=hidden]), textarea');
        out[label] = sel ? sel.getAttribute('title') || sel.innerText : ph ? '(empty)' : inp ? inp.value : '';
      });
      return out;
    });
  }
  /** Wait for any toast still on screen to expire so the next read is clean. */
  async function flushMessages() {
    await page.waitForTimeout(3300);
  }
  /** Toasts + any open (error) dialog — both channels the ERP uses for errors. */
  async function overlayTexts() {
    const msgs = await page.locator('.ant-message-notice').allInnerTexts().catch(() => []);
    const confs = await page.locator('.ant-modal-confirm:visible').allInnerTexts().catch(() => []);
    return [...msgs, ...confs].map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }
  async function dismissConfirmDialog() {
    const c = page.locator('.ant-modal-confirm:visible');
    if (await c.count()) {
      await c.locator('button:has-text("OK")').click().catch(() => {});
      await page.waitForTimeout(600);
    }
  }
  async function clickSave() {
    await page.locator('.ant-modal button:has-text("OK")').first().click();
    await page.waitForTimeout(700);
    const confirm = page.locator('.ant-modal-confirm:visible');
    const hasConfirm = (await confirm.count()) > 0;
    if (hasConfirm) {
      await confirm.locator('button:has-text("Save")').click();
      await page.waitForTimeout(1400);
    }
    return hasConfirm;
  }

  // ---------- login ----------
  await page.addInitScript(() => sessionStorage.setItem('pwi_welcome_passed', 'true'));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input#login_email', 'system.admin@erp.com');
  await page.fill('input#login_password', 'Admin#2026!Secure');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  log('logged in');

  await page.goto(`${BASE}/organization/locations`, { waitUntil: 'networkidle' });
  await page.waitForSelector(`tr:has(td:text-is("${C01}"))`, { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/p6-${PHASE}-01-table.png` });

  const rowText = await page.locator(`tr:has(td:text-is("${C01}"))`).innerText();
  log('TABLE ROW:', JSON.stringify(rowText.replace(/\n/g, ' | ')));
  check('T0', 'baseline: DB parent of CCD-C01 is NULL', baseline === 'NULL (root)', baseline);

  // ---------- T1: NULL loads blank ----------
  await openEdit(C01);
  const shown1 = await parentShown();
  const fields1 = await readFormFields();
  await page.screenshot({ path: `${SHOTS}/p6-${PHASE}-02-edit-modal.png` });
  log('EDIT FORM FIELDS:', JSON.stringify(fields1, null, 2));
  check('T1', 'NULL parent loads blank in the Edit form', shown1 === '(empty)', `shows: ${JSON.stringify(shown1)}`);

  // ---------- T2/T3: dropdown exclusions ----------
  await openParentDropdown();
  const opts = await dropdownOptions();
  await page.screenshot({ path: `${SHOTS}/p6-${PHASE}-03-dropdown.png` });
  log('DROPDOWN OPTIONS:', JSON.stringify(opts));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const selfPresent = opts.some((o) => o.includes(C01));
  const childPresent = opts.some((o) => o.includes(C02));
  check('T2', `current location ${C01} excluded from dropdown`, !selfPresent, selfPresent ? 'SELF IS LISTED' : 'self absent');
  check('T3', `descendant ${C02} excluded from dropdown`, !childPresent, childPresent ? 'CHILD IS LISTED' : 'child absent');

  // ---------- T4: valid parent persists ----------
  if (opts.some((o) => o.includes(A01))) {
    await openParentDropdown();
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: A01 }).first().click();
    await page.waitForTimeout(400);
    log('after selecting', A01, '->', JSON.stringify(await parentShown()));
    const beforeCount = patches.length;
    await flushMessages();
    const hadConfirm = await clickSave();
    log('save confirmation dialog shown:', hadConfirm, '| notifications:', JSON.stringify(await overlayTexts()));
    await page.screenshot({ path: `${SHOTS}/p6-${PHASE}-04-after-save.png` });
    const sent = patches[beforeCount];
    const dbAfter4 = await dbParentLabel(C01);
    check('T4', `saving parent ${A01} persists parent_location_id`, dbAfter4 === A01,
      `DB=${dbAfter4}; sent=${JSON.stringify(sent && sent.payload)}; HTTP=${sent && sent.status}`);
    check('T4b', 'edit modal closes on successful save', !(await editModalOpen()), `open=${await editModalOpen()}`);
  } else {
    check('T4', `saving parent ${A01} persists parent_location_id`, false, `${A01} not offered in the dropdown`);
  }

  // ---------- T6: No Parent -> NULL ----------
  await openEdit(C01);
  log('reopen shows parent:', JSON.stringify(await parentShown()));
  const clearBtn = parentItem().locator('.ant-select-clear, .ant-select-selection-clear');
  if (await clearBtn.count()) {
    await parentItem().locator('.ant-select-selector').hover();
    await clearBtn.first().click({ force: true });
    await page.waitForTimeout(400);
  }
  const shownAfterClear = await parentShown();
  await flushMessages();
  await clickSave();
  const msgs6 = await overlayTexts();
  const dbAfter6 = await dbParentLabel(C01);
  check('T6', 'No Parent (cleared) persists as NULL', dbAfter6 === 'NULL (root)',
    `form after clear=${JSON.stringify(shownAfterClear)}; DB=${dbAfter6}; msgs=${JSON.stringify(msgs6)}`);

  // ---------- T5: failed save keeps modal open + real error ----------
  await openEdit(C01);
  await page.route('**/warehouse-locations/**', async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 500, message: 'INJECTED: database connection lost' }),
      });
    } else route.continue();
  });
  await flushMessages();
  await clickSave();
  const msgs5 = await overlayTexts();
  const stillOpen5 = await editModalOpen();
  const errShown = msgs5.some((m) => /INJECTED|connection lost/i.test(m));
  const falseSuccess = msgs5.some((m) => /updated successfully|created successfully/i.test(m));
  await page.screenshot({ path: `${SHOTS}/p6-${PHASE}-05-failed-save.png` });
  check('T5', 'failed save keeps modal open + shows real backend error + no false success',
    stillOpen5 && errShown && !falseSuccess,
    `open=${stillOpen5}; msgs=${JSON.stringify(msgs5)}`);
  await page.unroute('**/warehouse-locations/**');
  await dismissConfirmDialog();

  // ---------- T7: no stale state across edits ----------
  await openEdit(C02);
  const c02Parent = await parentShown();
  const c02Fields = await readFormFields();
  await openEdit(C01);
  const c01Parent = await parentShown();
  await page.screenshot({ path: `${SHOTS}/p6-${PHASE}-06-stale-check.png` });
  check('T7', 'no stale parent state when switching records',
    c01Parent === '(empty)',
    `${C02} showed parent=${JSON.stringify(c02Parent)} name=${JSON.stringify(c02Fields.Name)}; then ${C01} showed parent=${JSON.stringify(c01Parent)} name=${JSON.stringify((await readFormFields()).Name)}`);

  // ---------- API-level self / circular rejection ----------
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const ids = {};
  for (const c of [C01, C02, A01, A02]) ids[c] = (await dbRow(c)).id;
  async function apiPatch(id, body) {
    const res = await fetch(`${API}/warehouse-locations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    let data = '';
    try { data = (await res.text()).slice(0, 300); } catch {}
    return { status: res.status, data };
  }
  const selfRes = await apiPatch(ids[C01], { parentLocationId: ids[C01] });
  check('API1', 'backend rejects self as parent (400)', selfRes.status === 400, `HTTP ${selfRes.status} ${selfRes.data}`);
  const circRes = await apiPatch(ids[A01], { parentLocationId: ids[A02] });
  check('API2', 'backend rejects circular parent (400)', circRes.status === 400, `HTTP ${circRes.status} ${circRes.data}`);

  // ---------- T8: browser refresh persists ----------
  await openEdit(C01).catch(() => {});
  await closeEdit();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector(`tr:has(td:text-is("${C01}"))`, { timeout: 20000 });
  await page.waitForTimeout(800);
  await openEdit(C01);
  const afterReload = await parentShown();
  await page.screenshot({ path: `${SHOTS}/p6-${PHASE}-07-after-refresh.png` });
  const dbFinal = await dbParentLabel(C01);
  check('T8', 'value persists across a browser refresh', dbFinal === baseline && afterReload === '(empty)',
    `DB=${dbFinal} (baseline ${baseline}); form=${JSON.stringify(afterReload)}`);
  await closeEdit();

  log('ALL PATCH REQUESTS:', JSON.stringify(patches, null, 2));
  log('DB parent_location_id AFTER:', await dbParentLabel(C01));

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  log('----------------------------------------');
  log(`SUMMARY (${PHASE}): ${results.length - failed.length}/${results.length} passed`);
  failed.forEach((f) => log(`  FAILED: ${f.id} ${f.name} — ${f.detail}`));

  await db.end();
  process.exit(failed.length ? 2 : 0);
})().catch(async (e) => {
  console.error(`[${PHASE}] FAILED:`, e);
  try { await db.end(); } catch {}
  process.exit(1);
});
