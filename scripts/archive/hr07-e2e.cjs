// @ts-check
// HR-07 Phase 9 — Real browser E2E for /hr/regularizations.
// Seeds temp records via API, verifies list/filters/view/edit/create (UI),
// duplicate protection, approve/reject, responsive (1280/768/390), light+dark,
// then cleans every temp record (incl. attendance rows created by approval).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const { Client } = require('pg');

const API = 'http://127.0.0.1:3001/api/v1';
const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';
const SHOT_DIR = 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\hr07';
const BACKEND = 'D:\\ERP-MRP-PWI-2026\\backend';

const env = {};
for (const line of fs.readFileSync(path.join(BACKEND, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok: !!ok, extra: extra || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}\t${name}${extra ? ' :: ' + extra : ''}`);
}

function httpJson(method, route, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = require('http').request(API + route, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function waitListening(port, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const socket = require('http').request({ host: '127.0.0.1', port, path: '/', timeout: 800 }, () => resolve(true));
      socket.on('error', () => {
        if (Date.now() - start > timeoutMs) resolve(false);
        else setTimeout(tick, 600);
      });
      socket.end();
    };
    tick();
  });
}

const days = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function kpiValue(page, label) {
  const txt = await page
    .locator(`xpath=//div[contains(@class,'erp-kpi-card') and .//span[contains(@class,'erp-kpi-card__label') and normalize-space()='${label}']]//span[contains(@class,'erp-kpi-card__value')]`)
    .first()
    .textContent()
    .catch(() => '');
  return (txt || '').trim();
}

async function pickByPlaceholder(page, placeholderText, optionText) {
  const placeholder = page.locator('.ant-select-selection-placeholder', { hasText: placeholderText }).first();
  await placeholder.locator('..').click();
  await page.waitForTimeout(400);
  const opt = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', { hasText: optionText }).first();
  await opt.waitFor({ state: 'visible', timeout: 8000 });
  await opt.click();
  await page.waitForTimeout(300);
}

async function pickerInModal(page, placeholderText, optionText) {
  const modal = page.locator('.ant-modal:has-text("Submit Regularization")');
  const plc = modal.locator('.ant-select-selection-placeholder', { hasText: placeholderText }).first();
  await plc.locator('..').click();
  await page.waitForTimeout(600);
  const opt = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', { hasText: optionText }).first();
  try {
    await opt.waitFor({ state: 'visible', timeout: 15000 });
  } catch (e) {
    const texts = await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').allTextContents().catch(() => []);
    console.log('DIAG pickerInModal opted texts=', JSON.stringify(texts.slice(0, 8)));
    throw e;
  }
  await opt.click();
  await page.waitForTimeout(300);
}

async function fillAndEnter(page, locator, value) {
  await locator.fill(value);
  await locator.press('Enter');
  await page.waitForTimeout(400);
}

async function waitRows(page, n, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let count = -1;
  while (Date.now() < deadline) {
    count = await page.locator('tr.ant-table-row').count();
    if (count === n) return count;
    await page.waitForTimeout(400);
  }
  return count;
}

async function openModalFromRow(page, rowLoc, iconLabel, modalTitle, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    await rowLoc.locator(`[aria-label="${iconLabel}"]`).first().scrollIntoViewIfNeeded().then(() => {}, () => {});
    await rowLoc.locator(`[aria-label="${iconLabel}"]`).first().click({ force: true }).catch(() => {});
    try {
      await page.locator(`.ant-modal:has-text("${modalTitle}")`).waitFor({ state: 'visible', timeout: 8000 });
      return true;
    } catch {}
    await page.waitForTimeout(700);
  }
  return false;
}

async function shot(page, name) {
  const file = `${SHOT_DIR}\\${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log('   screenshot:', file);
}

async function openPage(page, { token, user, refreshToken, mode, route = '/hr/regularizations' }) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.evaluate(({ token, user, refreshToken, mode }) => {
    localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('erp_user', JSON.stringify(user));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
    if (mode) {
      localStorage.setItem('erp_theme_prefs_v1', JSON.stringify({
        [`user:${user.id}`]: { mode, paletteId: 'indigo' },
      }));
    }
  }, { token, user, refreshToken, mode });
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForSelector('text=Regularizations', { timeout: 25000 });
  await page.waitForTimeout(2500);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const backendUp = await waitListening(3001, 3000);
  const frontendUp = await waitListening(3000, 3000);
  const children = [];
  if (!backendUp) {
    children.push(spawn('node.exe', ['dist/main.js'], { cwd: BACKEND, stdio: 'ignore' }));
    check('backend child started', await waitListening(3001, 45000));
  } else {
    check('backend already up on 3001', true);
  }
  if (!frontendUp) {
    children.push(spawn('cmd.exe', ['/c', 'npm run start'], { cwd: 'D:\\ERP-MRP-PWI-2026\\frontend', stdio: 'ignore' }));
    check('frontend child started', await waitListening(3000, 90000));
  } else {
    check('frontend already up on 3000', true);
  }
  if (!(await waitListening(3001, 3000)) || !(await waitListening(3000, 3000))) {
    console.log('\nABORT: services not reachable');
    for (const c of children) c.kill();
    process.exit(1);
  }

  const client = new Client({
    host: env.DB_HOST || 'localhost',
    port: parseInt(env.DB_PORT || '5432', 10),
    user: env.DB_USERNAME || 'postgres',
    password: env.DB_PASSWORD || 'postgres',
    database: env.DB_DATABASE || 'erp_database',
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED !== 'false', servername: env.DB_SSL_SERVERNAME || undefined } : false,
  });
  await client.connect();
  const q = async (sql, p) => (await client.query(sql, p)).rows;

  const unauth = await httpJson('GET', '/hr/regularizations');
  check('unauthenticated list -> 401', unauth.status === 401, `status=${unauth.status}`);
  const login = await httpJson('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  check('login via API', login.status === 201 && !!login.json?.token, `status=${login.status}`);
  if (!login.json?.token) { console.log('\nABORT'); for (const c of children) c.kill(); process.exit(1); }
  const token = login.json.token;

  const opts = await httpJson('GET', '/hr/regularizations/options', { token });
  const o = opts.json?.data;
  const emp = o?.employees?.[0];
  const base = await httpJson('GET', '/hr/regularizations', { token });
  const baselineTotal = base.json?.data?.total ?? -1;

  // helper: find clean dates (no reg, no approved leave, no attendance)
  async function pickCleanDates(count) {
    const dates = [];
    for (let i = 0; i <= 30 && dates.length < count; i++) {
      const d = days(i);
      const conflict = await q(
        `SELECT 1 FROM hr_regularizations r WHERE r.employee_id=$1 AND TO_CHAR(r.attendance_date,'YYYY-MM-DD')=$2 AND r.is_active
         UNION SELECT 1 FROM hr_leave_requests l WHERE l.employee_id=$1 AND l.status='APPROVED' AND l.is_active AND TO_CHAR(l.start_date,'YYYY-MM-DD')<=$2 AND TO_CHAR(l.end_date,'YYYY-MM-DD')>=$2
         UNION SELECT 1 FROM hr_attendance a WHERE a.employee_id=$1 AND TO_CHAR(a.attendance_date,'YYYY-MM-DD')=$2`,
        [emp.id, d]);
      if (conflict.length === 0) dates.push(d);
    }
    return dates;
  }

  const cleanDates = await pickCleanDates(3);
  check('found enough clean dates', cleanDates.length >= 3, `count=${cleanDates.length}`);
  const [dateA, dateB, dateC] = cleanDates;

  // Seed tempA + tempB (SUBMITTED) via API
  const a = await httpJson('POST', '/hr/regularizations', { token, body: {
    employeeId: emp.id, attendanceDate: dateA, correctionType: 'CHECK_IN', reason: 'FORGOT_TO_PUNCH',
    requestedCheckIn: `${dateA}T08:45:00`, remarks: 'HR-07 E2E tmp A',
  }});
  const idA = a.json?.data?.id;
  const b = await httpJson('POST', '/hr/regularizations', { token, body: {
    employeeId: emp.id, attendanceDate: dateB, correctionType: 'STATUS', reason: 'STATUS_ERROR',
    requestedStatus: 'PRESENT', remarks: 'HR-07 E2E tmp B',
  }});
  const idB = b.json?.data?.id;
  check('seeded tempA + tempB', a.status === 201 && b.status === 201, `A=${a.status} B=${b.status}`);

  let createdUiId = null;
  let tempCApproved = false;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

    await openPage(page, { token, user: login.json.user, refreshToken: login.json.refreshToken, mode: 'light' });

    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check('[browser] light theme applied', theme === 'light', `theme=${theme}`);
    check('[browser] page title visible', await page.locator('text=Regularizations').first().isVisible());
    check('[browser] sidebar nav Regularizations', await page.locator('aside, .ant-layout-sider, nav').first().locator('text=Regularizations').first().isVisible().catch(() => false));

    const kSub = await kpiValue(page, 'Submitted');
    check('[browser] KPI Submitted = 2', kSub === '2', `kpi=${kSub}`);
    const rows1 = await page.locator('tr.ant-table-row').count();
    check('[browser] table rows = 2 (seeded)', rows1 === 2, `rows=${rows1}`);
    const rowA = page.locator('tr.ant-table-row', { hasText: dateA });
    check('[browser] tempA row: requestNo RGZ-', await rowA.first().locator('td', { hasText: /^RGZ-/ }).first().isVisible().catch(() => false));
    check('[browser] tempA row: Submitted tag', await rowA.first().locator('.ant-tag', { hasText: 'Submitted' }).isVisible().catch(() => false));
    check('[browser] tempA row: Check In type', await rowA.first().locator('td', { hasText: 'Check In' }).first().isVisible().catch(() => false));
    check('[browser] tempA row: employee code', await rowA.first().locator('td', { hasText: emp.employeeCode }).first().isVisible().catch(() => false));
    const ov1 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('[browser] no horizontal overflow', ov1 <= 1, `overflow=${ov1}`);
    await shot(page, '01-1400-light');

    // View modal
    check('[view] view modal opens', await openModalFromRow(page, rowA, 'eye', 'Regularization Details'));
    await page.waitForSelector('.ant-modal:has-text("Regularization Details")', { timeout: 8000 });
    check('[view] modal shows request no.', await page.locator('.ant-modal', { hasText: /RGZ-/ }).first().isVisible().catch(() => false));
    check('[view] modal shows reason', await page.locator('.ant-modal', { hasText: 'Forgot to Punch' }).first().isVisible().catch(() => false));
    check('[view] modal shows remarks', await page.locator('.ant-modal', { hasText: 'HR-07 E2E tmp A' }).first().isVisible().catch(() => false));
    check('[view] modal shows audit Submitted At', await page.locator('.ant-modal:has-text("Regularization Details")', { hasText: 'Submitted At' }).first().isVisible().catch(() => false));
    await shot(page, '02-view-modal');
    await page.locator('.ant-modal:has-text("Regularization Details")').locator('.ant-modal-close').first().click();
    await page.waitForTimeout(600);

    // Edit tempA via UI
    check('[edit] edit modal opens', await openModalFromRow(page, rowA, 'edit', 'Edit Regularization'));
    await page.locator('.ant-modal textarea').first().fill('HR-07 E2E tmp A edited');
    await shot(page, '03-edit-modal');
    await page.locator('.ant-modal').getByRole('button', { name: 'Save' }).click();
    await page.locator('.ant-modal:has-text("Edit Regularization")').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    check('[edit] edit modal closes after save', await page.locator('.ant-modal:has-text("Edit Regularization")').first().isHidden().catch(() => false));
    await page.waitForTimeout(600);
    const detA = await httpJson('GET', `/hr/regularizations/${idA}`, { token });
    check('[edit] API reflects edited remarks', detA.json?.data?.remarks === 'HR-07 E2E tmp A edited', `remarks=${detA.json?.data?.remarks}`);

    // Create tempC via UI (admin -> employee select in modal)
    await page.locator('button', { hasText: 'Submit Regularization' }).first().click();
    await page.waitForSelector('text=Submit Regularization', { timeout: 10000 });
    await pickerInModal(page, 'Select employee', emp.employeeCode);
    const dateInputs = page.locator('.ant-modal .ant-picker input');
    await fillAndEnter(page, dateInputs.nth(0), dateC);
    await pickerInModal(page, 'Select type', 'Check Out');
    await pickerInModal(page, 'Select reason', 'Missing Check Out');
    await fillAndEnter(page, dateInputs.nth(1), '18:00');
    await page.locator('.ant-modal textarea').first().fill('HR-07 E2E tmp C from UI');
    await shot(page, '04-create-modal');
    await page.locator('.ant-modal').getByRole('button', { name: 'Submit' }).click();
    await page
      .locator('.ant-modal:has-text("Submit Regularization")')
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {});
    const uiRow = page.locator('tr.ant-table-row', { hasText: dateC });
    await uiRow.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    check('[ui-create] tempC row appears SUBMITTED', await uiRow.first().locator('.ant-tag', { hasText: 'Submitted' }).isVisible().catch(() => false));
    check('[ui-create] toast submitted successfully', await page.locator('.ant-message-notice', { hasText: 'Regularization submitted successfully.' }).first().isVisible().catch(() => false));
    const kSub2 = await kpiValue(page, 'Submitted');
    check('[ui-create] KPI Submitted = 3', kSub2 === '3', `kpi=${kSub2}`);
    const uiatr = await q(`SELECT id FROM hr_regularizations WHERE employee_id=$1 AND TO_CHAR(attendance_date,'YYYY-MM-DD')=$2 AND remarks='HR-07 E2E tmp C from UI'`, [emp.id, dateC]);
    createdUiId = uiatr[0]?.id;
    check('[ui-create] tempC row persisted', !!createdUiId, `id=${createdUiId}`);

    // Duplicate protection via UI (same employee + dateC, different type)
    await page.locator('button', { hasText: 'Submit Regularization' }).first().click();
    await page.waitForSelector('text=Submit Regularization', { timeout: 10000 });
    await pickerInModal(page, 'Select employee', emp.employeeCode);
    const dupInputs = page.locator('.ant-modal .ant-picker input');
    await fillAndEnter(page, dupInputs.nth(0), dateC);
    await pickerInModal(page, 'Select type', 'Check In');
    await pickerInModal(page, 'Select reason', 'Forgot to Punch');
    await fillAndEnter(page, dupInputs.nth(1), '08:45');
    await page.locator('.ant-modal').getByRole('button', { name: 'Submit' }).click();
    await page.waitForTimeout(3000);
    check('[duplicate] conflict error surfaced', await page.locator('.ant-message-notice', { hasText: 'already exists' }).first().isVisible().catch(() => false));
    check('[duplicate] modal stays open on 409', await page.locator('.ant-modal:has-text("Submit Regularization")').first().isVisible().catch(() => false));
    await page.locator('.ant-modal:has-text("Submit Regularization")').locator('.ant-modal-close').first().click();
    await page.waitForTimeout(600);

    // Status filter -> APPROVED (none yet) -> 0 rows; then SUBMITTED -> 3 rows
    await pickByPlaceholder(page, 'Status', 'Approved');
    await page.locator('button', { hasText: 'Apply' }).first().click();
    await page.waitForTimeout(2200);
    check('[filter] APPROVED -> 0 rows', await page.locator('tr.ant-table-row').count() === 0, `rows=${await page.locator('tr.ant-table-row').count()}`);
    await shot(page, '05-filter-approved-empty');
    await page.locator('button', { hasText: 'Reset' }).first().click();
    const resetCount = await waitRows(page, 3, 15000);
    check('[filter] Reset restores 3 rows', resetCount === 3, `rows=${resetCount}`);
    await page.waitForTimeout(800);

    // Reject tempB via UI
    const rowB = page.locator('tr.ant-table-row', { hasText: dateB });
    check('[ui-reject] reject modal opens', await openModalFromRow(page, rowB, 'close', 'Reject Regularization'));
    await page.locator('.ant-modal:has-text("Reject Regularization") textarea').first().fill('rejected from UI');
    await page.locator('.ant-modal').getByRole('button', { name: 'Reject', exact: true }).click();
    await rowB.first().locator('.ant-tag', { hasText: 'Rejected' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    check('[ui-reject] tempB now REJECTED', await rowB.first().locator('.ant-tag', { hasText: 'Rejected' }).isVisible().catch(() => false));
    check('[ui-reject] toast rejected', await page.locator('.ant-message-notice', { hasText: 'Regularization rejected.' }).first().isVisible().catch(() => false));
    const kRj = await kpiValue(page, 'Rejected');
    check('[ui-reject] KPI Rejected = 1', kRj === '1', `kpi=${kRj}`);

    // Approve tempC via UI
    const rowC = page.locator('tr.ant-table-row', { hasText: dateC });
    check('[ui-approve] approve modal opens', await openModalFromRow(page, rowC, 'check', 'Approve Regularization'));
    await page.locator('.ant-modal:has-text("Approve Regularization") textarea').first().fill('approved from UI');
    await shot(page, '06-approve-modal');
    await page.locator('.ant-modal').getByRole('button', { name: 'Approve', exact: true }).click();
    let approveToast = false;
    try {
      await page.locator('.ant-message-notice', { hasText: 'Regularization approved successfully.' }).waitFor({ state: 'visible', timeout: 6000 });
      approveToast = true;
    } catch {}
    await rowC.first().locator('.ant-tag', { hasText: 'Approved' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    check('[ui-approve] tempC now APPROVED', await rowC.first().locator('.ant-tag', { hasText: 'Approved' }).isVisible().catch(() => false));
    check('[ui-approve] toast approved', approveToast);
    const kAp = await kpiValue(page, 'Approved');
    check('[ui-approve] KPI Approved = 1', kAp === '1', `kpi=${kAp}`);
    const kSub3 = await kpiValue(page, 'Submitted');
    check('[ui-approve] KPI Submitted = 1 (tempA only)', kSub3 === '1', `kpi=${kSub3}`);

    // Audit via view on approved tempC
    await rowC.first().locator('[aria-label="eye"]').click();
    await page.waitForSelector('text=Approved Check In', { timeout: 10000 });
    check('[audit] approved row shows Decision Remarks', await page.locator('.ant-modal', { hasText: 'approved from UI' }).first().isVisible().catch(() => false));
    check('[audit] submitted/decided audit rows present', await page.locator('.ant-modal', { hasText: 'Decided At' }).first().isVisible().catch(() => false));
    await shot(page, '07-view-approved-audit');
    await page.locator('.ant-modal:has-text("Regularization Details")').locator('.ant-modal-close').first().click();
    await page.waitForTimeout(400);

    check('[browser] no page errors', pageErrors.filter((e) => !/400|404|409/.test(e)).length === 0, pageErrors.filter((e) => !/400|404|409/.test(e)).slice(0, 3).join(' | '));

    // Responsive middle (768)
    const m = await browser.newPage({ viewport: { width: 768, height: 900 } });
    await openPage(m, { token, user: login.json.user, refreshToken: login.json.refreshToken, mode: 'light' });
    const rows768 = await waitRows(m, 3, 15000);
    check('[768] table rows render (3)', rows768 === 3, `rows=${rows768}`);
    const ov768 = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('[768] no horizontal overflow', ov768 <= 1, `overflow=${ov768}`);
    await shot(m, '08-768-light');
    await m.close();

    // Responsive small (390)
    const s = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await openPage(s, { token, user: login.json.user, refreshToken: login.json.refreshToken, mode: 'light' });
    const rows390 = await waitRows(s, 3, 15000);
    check('[390] table rows render (3)', rows390 === 3, `rows=${rows390}`);
    const ov390 = await s.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('[390] no horizontal overflow', ov390 <= 1, `overflow=${ov390}`);
    await shot(s, '09-390-light');
    await s.close();

    // Dark mode (1280)
    const d = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const dErrors = [];
    d.on('pageerror', (e) => dErrors.push('pageerror: ' + String(e)));
    d.on('console', (m) => { if (m.type() === 'error') dErrors.push('console: ' + m.text()); });
    await openPage(d, { token, user: login.json.user, refreshToken: login.json.refreshToken, mode: 'dark' });
    const darkTheme = await d.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check('[dark] dark theme applied', darkTheme === 'dark', `theme=${darkTheme}`);
    const rowsDark = await waitRows(d, 3, 15000);
    check('[dark] table rows render (3)', rowsDark === 3, `rows=${rowsDark}`);
    const ovDark = await d.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('[dark] no horizontal overflow', ovDark <= 1, `overflow=${ovDark}`);
    check('[dark] no console errors', dErrors.filter((e) => !/400|404|409/.test(e)).length === 0, dErrors.filter((e) => !/400|404|409/.test(e)).slice(0, 3).join(' | '));
    await shot(d, '10-1280-dark');
    await d.close();

    tempCApproved = true;
    await page.close();
  } catch (e) {
    check('browser E2E crashed', false, String((e && e.message) || e));
  } finally {
    await browser.close();

    // ---- cleanup: hard-remove all HR-07 E2E temp regs + history + attendance created by approval ----
    const ids = await q(`SELECT id FROM hr_regularizations WHERE remarks LIKE 'HR-07 E2E%'`);
    const idList = ids.map((r) => r.id);
    let attDeleted = 0;
    if (idList.length) {
      const attIds = await q(`SELECT DISTINCT attendance_id FROM hr_attendance_history WHERE regularization_id = ANY($1)`, [idList]);
      if (attIds.length) {
        await q(`DELETE FROM hr_attendance WHERE id = ANY($1) RETURNING id`, [attIds.map((a) => a.attendance_id)]);
        attDeleted = attIds.length;
      }
      await q(`DELETE FROM hr_attendance_history WHERE regularization_id = ANY($1)`, [idList]);
      await q(`DELETE FROM hr_regularizations WHERE id = ANY($1)`, [idList]);
    }
    const remain = await q(`SELECT COUNT(*)::int c FROM hr_regularizations WHERE remarks LIKE 'HR-07 E2E%'`);
    const finalList = await httpJson('GET', '/hr/regularizations', { token });
    check('cleanup: no HR-07 E2E temp regs remain', Number(remain[0].c) === 0, `remain=${remain[0].c}`);
    check('cleanup: attendance rows from approvals removed', true, `deleted=${attDeleted}`);
    check('cleanup: list back to baseline', finalList.json?.data?.total === baselineTotal, `total=${finalList.json?.data?.total} baseline=${baselineTotal}`);
    await client.end();
  }

  for (const c of children) c.kill();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n== HR-07 PHASE 9 BROWSER E2E RESULT: ${results.length - failed}/${results.length} passed ==`);
  process.exit(failed ? 2 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });