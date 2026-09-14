// @ts-check
const { chromium } = require('playwright');
const fs = require('fs');
const { spawn } = require('child_process');

const API = 'http://127.0.0.1:3001/api/v1';
const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';
const SHOT_DIR = 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\hr06';

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

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok: !!ok, extra: extra || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}\t${name}${extra ? ' :: ' + extra : ''}`);
}

function httpJson(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = require('http').request(API + path, {
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

async function kpiValue(page, label) {
  const txt = await page
    .locator(`xpath=//div[contains(@class,'erp-kpi-card') and .//span[contains(@class,'erp-kpi-card__label') and normalize-space()='${label}']]//span[contains(@class,'erp-kpi-card__value')]`)
    .first()
    .textContent();
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

async function shot(page, name) {
  const file = `${SHOT_DIR}\\${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log('   screenshot:', file);
}

async function seedAuthAndTheme(page, { token, user, refreshToken, mode }) {
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
}

async function openLeaves(page, { token, user, refreshToken, mode }) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await seedAuthAndTheme(page, { token, user, refreshToken, mode });
  await page.goto(BASE + '/hr/leaves', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('text=Leave Requests', { timeout: 20000 });
  await page.waitForTimeout(2500);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const backendUp = await waitListening(3001, 3000);
  const frontendUp = await waitListening(3000, 3000);
  const children = [];

  if (!backendUp) {
    children.push(spawn('node.exe', ['dist/main.js'], { cwd: 'D:\\ERP-MRP-PWI-2026\\backend', stdio: 'ignore' }));
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

  const unauth = await httpJson('GET', '/hr/leave-requests');
  check('unauthenticated list -> 401', unauth.status === 401, `status=${unauth.status}`);

  const login = await httpJson('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  check('login via API', login.status === 201 && !!login.json?.token, `status=${login.status}`);
  if (!login.json?.token) { console.log('\nABORT'); for (const c of children) c.kill(); process.exit(1); }
  const adminToken = login.json.token;

  // ---- API phase ----
  const opts = await httpJson('GET', '/hr/leave-requests/options', { token: adminToken });
  const o = opts.json?.data;
  check('options: company present', !!o?.companyId, `companyId=${o?.companyId}`);
  check('options: 4 leave types', o?.leaveTypes?.length === 4, `count=${o?.leaveTypes?.length}`);
  check('options: 4 statuses', o?.statuses?.length === 4, `count=${o?.statuses?.length}`);
  check('options: employees loaded', (o?.employees?.length ?? 0) >= 1, `count=${o?.employees?.length}`);

  const emp = o?.employees?.[0];
  const lType = o?.leaveTypes?.[0];
  if (!emp || !lType) { console.log('\nABORT: no employee/leave type seeds'); for (const c of children) c.kill(); process.exit(1); }

  const base = await httpJson('GET', '/hr/leave-requests', { token: adminToken });
  const baselineTotal = base.json?.data?.total ?? -1;
  const onLeaveApi = base.json?.data?.summary?.onLeaveToday ?? -1;
  check('baseline list total >= 1', baselineTotal >= 1, `total=${baselineTotal}`);
  check('baseline summary KPI set', base.json?.data?.summary?.pending >= 0 && base.json?.data?.summary?.approved >= 0, `pending=${base.json?.data?.summary?.pending} approved=${base.json?.data?.summary?.approved}`);
  check('summary counts match records', (base.json?.data?.summary?.pending + base.json?.data?.summary?.approved + base.json?.data?.summary?.rejected + base.json?.data?.summary?.cancelled) === baselineTotal, `sum=${base.json?.data?.summary?.pending}+${base.json?.data?.summary?.approved}+${base.json?.data?.summary?.rejected}+${base.json?.data?.summary?.cancelled} total=${baselineTotal}`);

  // tempA create -> update -> approve
  const a = await httpJson('POST', '/hr/leave-requests', { token: adminToken, body: { employeeId: emp.id, leaveTypeId: lType.id, startDate: '2026-11-02', endDate: '2026-11-04', reason: 'HR-06 E2E tmp A' } });
  check('create tempA -> 201', a.status === 201 && !!a.json?.data?.id, `status=${a.status}`);
  const idA = a.json?.data?.id;

  const overlap = await httpJson('POST', '/hr/leave-requests', { token: adminToken, body: { employeeId: emp.id, leaveTypeId: lType.id, startDate: '2026-11-04', endDate: '2026-11-06', reason: 'HR-06 E2E overlap' } });
  check('overlap create -> 409', overlap.status === 409, `status=${overlap.status}`);

  const afterA = await httpJson('GET', '/hr/leave-requests', { token: adminToken });
  check('list total increments after create', afterA.json?.data?.total === baselineTotal + 1, `total=${afterA.json?.data?.total}`);

  const upd = await httpJson('PATCH', `/hr/leave-requests/${idA}`, { token: adminToken, body: { reason: 'HR-06 E2E tmp A updated' } });
  check('update tempA -> 200', upd.status === 200, `status=${upd.status}`);

  const ap = await httpJson('PATCH', `/hr/leave-requests/${idA}/approve`, { token: adminToken, body: { remarks: 'approved in E2E' } });
  check('approve tempA -> 200', ap.status === 200 && ap.json?.data?.status === 'APPROVED', `status=${ap.status} state=${ap.json?.data?.status}`);

  const ap2 = await httpJson('PATCH', `/hr/leave-requests/${idA}/approve`, { token: adminToken, body: {} });
  check('re-approve non-pending -> 400', ap2.status === 400, `status=${ap2.status}`);

  // tempB create -> reject
  const b = await httpJson('POST', '/hr/leave-requests', { token: adminToken, body: { employeeId: emp.id, leaveTypeId: lType.id, startDate: '2026-11-16', endDate: '2026-11-18', reason: 'HR-06 E2E tmp B' } });
  const idB = b.json?.data?.id;
  const rj = await httpJson('PATCH', `/hr/leave-requests/${idB}/reject`, { token: adminToken, body: { remarks: 'rejected in E2E' } });
  check('reject tempB -> 200', rj.status === 200 && rj.json?.data?.status === 'REJECTED', `status=${rj.status} state=${rj.json?.data?.status}`);

  // tempD create -> cancel (for filter test)
  const d = await httpJson('POST', '/hr/leave-requests', { token: adminToken, body: { employeeId: emp.id, leaveTypeId: lType.id, startDate: '2026-12-10', endDate: '2026-12-12', reason: 'HR-06 E2E tmp D' } });
  const idD = d.json?.data?.id;
  const cn = await httpJson('PATCH', `/hr/leave-requests/${idD}/cancel`, { token: adminToken, body: {} });
  check('cancel tempD -> 200', cn.status === 200 && cn.json?.data?.status === 'CANCELLED', `status=${cn.status} state=${cn.json?.data?.status}`);

  const detail = await httpJson('GET', `/hr/leave-requests/${idA}`, { token: adminToken });
  check('getById shows audit/remarks', detail.json?.data?.remarks === 'approved in E2E' && !!detail.json?.data?.audit?.approvedAt, `remarks=${detail.json?.data?.remarks}`);

  // Fresh API snapshot for the browser phase (state after all CRUD ops above).
  const snap = await httpJson('GET', '/hr/leave-requests', { token: adminToken });
  const snapTotal = snap.json?.data?.total ?? -1;
  const snapPending = snap.json?.data?.summary?.pending ?? -1;
  const snapApproved = snap.json?.data?.summary?.approved ?? -1;
  check('snapshot total includes all temp records', snapTotal === baselineTotal + 3, `total=${snapTotal}`);

  // ---- Browser phase ----
  const browser = await chromium.launch({ headless: true });
  const createdIds = [idB, idD, idA].filter(Boolean);
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

    await openLeaves(page, { token: login.json.token, user: login.json.user, refreshToken: login.json.refreshToken, mode: 'light' });

    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check('[1920] light theme applied', theme === 'light', `theme=${theme}`);
    check('[1920] page title visible', await page.locator('text=Leave Requests').first().isVisible());

    const kPending = await kpiValue(page, 'Pending');
    const kApproved = await kpiValue(page, 'Approved');
    const kOnLeave = await kpiValue(page, 'On Leave Today');
    check('[1920] KPI Pending matches API', kPending === String(snapPending), `kpi=${kPending} api=${snapPending}`);
    check('[1920] KPI Approved matches API', kApproved === String(snapApproved), `kpi=${kApproved} api=${snapApproved}`);
    check('[1920] KPI On Leave Today matches API', kOnLeave === String(onLeaveApi), `kpi=${kOnLeave} api=${onLeaveApi}`);

    const rows1 = await page.locator('tr.ant-table-row').count();
    check('[1920] rows match API total', rows1 === snapTotal, `rows=${rows1} api=${snapTotal}`);
    check('[1920] tempA row shows APPROVED', await page.locator('tr.ant-table-row', { hasText: '2026-11-02' }).first().locator('.ant-tag', { hasText: 'Approved' }).isVisible().catch(() => false));
    check('[1920] tempB row shows REJECTED', await page.locator('tr.ant-table-row', { hasText: '2026-11-16' }).first().locator('.ant-tag', { hasText: 'Rejected' }).isVisible().catch(() => false));

    const ov1 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('[1920] no horizontal overflow', ov1 <= 1, `overflow=${ov1}`);
    await shot(page, '01-1920-leaves-light');

    // Status filter -> CANCELLED
    await pickByPlaceholder(page, 'Status', 'Cancelled');
    await page.locator('button', { hasText: 'Apply' }).first().click();
    await page.waitForTimeout(2200);
    const cancelledRows = await page.locator('tr.ant-table-row').count();
    const cancelledTxt = cancelledRows ? await page.locator('tr.ant-table-row').first().textContent().catch(() => '') : '';
    check('[filters] CANCELLED -> 1 row (tempD)', cancelledRows === 1 && /2026-12-10/.test(cancelledTxt || ''), `rows=${cancelledRows} txt=${(cancelledTxt || '').slice(0, 40)}`);
    await shot(page, '02-1920-leaves-filtered-cancelled');

    await page.locator('button', { hasText: 'Reset' }).first().click();
    await page.waitForTimeout(2200);
    const afterReset = await page.locator('tr.ant-table-row').count();
    check('[filters] Reset restores rows', afterReset === snapTotal, `rows=${afterReset}`);

    // View modal
    await page.locator('tr.ant-table-row', { hasText: '2026-11-02' }).first().locator('[aria-label="eye"]').click();
    await page.waitForSelector('text=Leave Request Details', { timeout: 8000 });
    check('[view] details modal shows approved remarks', await page.locator('.ant-modal', { hasText: 'approved in E2E' }).first().isVisible().catch(() => false));
    check('[view] details modal shows leave type', await page.locator('.ant-modal', { hasText: lType.name }).first().isVisible().catch(() => false));
    await shot(page, '03-1920-leaves-view-modal');
    await page.locator('.ant-modal-close').first().click();
    await page.waitForTimeout(400);

    // Create new tempC via UI
    await page.locator('button', { hasText: 'Request Leave' }).first().click();
    await page.waitForSelector('text=Request Leave', { timeout: 8000 });
    await pickByPlaceholder(page, 'Select employee', emp.employeeCode);
    await pickByPlaceholder(page, 'Select leave type', 'L-1');
    const dateInputs = page.locator('.ant-modal .ant-picker input');
    await dateInputs.nth(0).fill('2026-12-01');
    await dateInputs.nth(0).press('Enter');
    await page.waitForTimeout(300);
    await dateInputs.nth(1).fill('2026-12-03');
    await dateInputs.nth(1).press('Enter');
    await page.waitForTimeout(300);
    const dateVals = await dateInputs.evaluateAll((els) => els.map((e) => e.value)).catch(() => []);
    console.log('DIAG dateInputs=', JSON.stringify(dateVals));
    await page.locator('.ant-modal textarea').first().fill('HR-06 E2E tmp C from UI');
    await shot(page, '04-1920-leaves-create-modal');
    await page.locator('.ant-modal span', { hasText: /Submit/ }).first().click();
    await page
      .locator('.ant-modal:has-text("Request Leave")')
      .waitFor({ state: 'hidden', timeout: 10000 })
      .catch(() => {});
    const toasts = await page.locator('.ant-message-notice').allTextContents().catch(() => []);
    const valErrors = await page.locator('.ant-form-item-explain-error').allTextContents().catch(() => []);
    console.log('DIAG after submit: toasts=', JSON.stringify(toasts), 'valErrors=', JSON.stringify(valErrors));

    const uiRow = page.locator('tr.ant-table-row', { hasText: '2026-12-01' });
    await uiRow.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const uiCreated = await uiRow.count();
    check('[ui-create] tempC row appears', uiCreated === 1, `rows=${uiCreated}`);
    check('[ui-create] tempC row PENDING', await uiRow.first().locator('.ant-tag', { hasText: 'Pending' }).isVisible().catch(() => false));
    const kP2 = await kpiValue(page, 'Pending');
    check('[ui-create] Pending KPI increments', Number(kP2) === Number(kPending) + 1, `kpi=${kP2} before=${kPending}`);

    // Approve tempC via UI
    await uiRow.first().locator('[aria-label="check"]').click();
    await page.waitForSelector('text=Approve Leave Request', { timeout: 8000 });
    await page.locator('.ant-modal:has-text("Approve Leave Request") textarea').first().fill('approved from UI');
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await uiRow.first().locator('.ant-tag', { hasText: 'Approved' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    check('[ui-approve] tempC now APPROVED', await uiRow.first().locator('.ant-tag', { hasText: 'Approved' }).isVisible().catch(() => false));

    // Delete tempC via UI
    await uiRow.first().locator('[aria-label="delete"]').click();
    await page.waitForSelector('.ant-modal-confirm', { timeout: 8000 });
    await page.locator('.ant-modal-confirm .ant-btn-dangerous').first().click();
    await uiRow.first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    const uiDeleted = await uiRow.count();
    check('[ui-delete] tempC removed', uiDeleted === 0, `rows=${uiDeleted}`);

    check('[ui] no page errors', pageErrors.filter((e) => !/400|404/.test(e)).length === 0, pageErrors.slice(0, 3).join(' | '));
    await page.close();

    // Dark mode pass
    const dark = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const darkErrors = [];
    dark.on('pageerror', (e) => darkErrors.push(String(e)));
    dark.on('console', (m) => { if (m.type() === 'error') darkErrors.push(m.text()); });
    await openLeaves(dark, { token: login.json.token, user: login.json.user, refreshToken: login.json.refreshToken, mode: 'dark' });
    const darkTheme = await dark.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check('[dark] dark theme applied', darkTheme === 'dark', `theme=${darkTheme}`);
    const darkRows = await dark.locator('tr.ant-table-row').count();
    check('[dark] rows match API', darkRows === snapTotal, `rows=${darkRows}`);
    const darkOverflow = await dark.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('[dark] no horizontal overflow', darkOverflow <= 1, `overflow=${darkOverflow}`);
    check('[dark] no page errors', darkErrors.filter((e) => !/400|404/.test(e)).length === 0, darkErrors.slice(0, 3).join(' | '));
    await shot(dark, '05-1920-leaves-dark');
    await dark.close();
  } catch (e) {
    check('browser E2E crashed', false, String(e && e.message || e));
  } finally {
    await browser.close();

    // ---- cleanup: delete all HR-06 E2E temp records, then verify baseline restored ----
    const tmpList = await httpJson('GET', '/hr/leave-requests', { token: adminToken });
    for (const r of tmpList.json?.data?.records ?? []) {
      if (/HR-06 E2E/.test(r.reason || '')) {
        await httpJson('DELETE', `/hr/leave-requests/${r.id}`, { token: adminToken });
      }
    }
    const remainList = await httpJson('GET', '/hr/leave-requests', { token: adminToken });
    const remain = (remainList.json?.data?.records ?? []).filter((r) => /HR-06 E2E/.test(r.reason || '')).length;
    check('cleanup: no HR-06 E2E temp records remain', remain === 0, `remain=${remain}`);
    check('cleanup: list back to baseline', remainList.json?.data?.total === baselineTotal, `total=${remainList.json?.data?.total} baseline=${baselineTotal}`);

    for (const c of children) c.kill();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n== HR-06 LEAVES E2E RESULT: ${results.length - failed}/${results.length} passed ==`);
  process.exit(failed ? 2 : 0);
})();