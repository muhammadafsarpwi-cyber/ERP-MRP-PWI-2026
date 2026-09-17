// @ts-check
const { chromium } = require('playwright');
const fs = require('fs');
const { spawn } = require('child_process');

const API = 'http://127.0.0.1:3001/api/v1';
const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';
const SHOT_DIR = 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\hr04';

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

async function pickSelect(page, ariaLabel, optionText) {
  const sel = page.locator(`[aria-label="${ariaLabel}"]`);
  await sel.first().click();
  await page.waitForTimeout(350);
  const opt = page.locator(`.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option`, { hasText: optionText }).first();
  await opt.waitFor({ state: 'visible', timeout: 8000 });
  await opt.click();
  await page.waitForTimeout(250);
}

async function kpiValue(page, label) {
  const txt = await page
    .locator(`xpath=//div[contains(@class,'erp-kpi-card') and .//span[contains(@class,'erp-kpi-card__label') and normalize-space()='${label}']]//span[contains(@class,'erp-kpi-card__value')]`)
    .first()
    .textContent();
  return (txt || '').trim();
}

function visibleModal(page, text) {
  return page.locator('.ant-modal-wrap:visible .ant-modal', { hasText: text });
}

function bossRow(page, code) {
  return page.locator('tr.ant-table-row', { hasText: code });
}

async function shot(page, name) {
  const file = `${SHOT_DIR}\\${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log('   screenshot:', file);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const child = spawn('node.exe', ['dist/main.js'], { cwd: 'D:\\ERP-MRP-PWI-2026\\backend', stdio: 'ignore' });
  const up = await waitListening(3001, 45000);
  check('backend child up on 3001', up);
  if (!up) { child.kill(); process.exit(1); }

  const login = await httpJson('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  check('login via API', login.status === 201 && !!login.json?.token, `status=${login.status}`);
  if (!login.json?.token) { console.log('\nABORT'); process.exit(1); }
  const adminToken = login.json.token;

  // Pre-run cleanup: remove any leftover roster records so the page starts clean
  const opts = await httpJson('GET', '/hr/shift-roster/options', { token: adminToken });
  const today = opts.json?.data?.today || '';
  const preList = await httpJson('GET', `/hr/shift-roster?rosterDate=${today}`, { token: adminToken });
  const preRecords = preList.json?.data?.records || [];
  for (const rec of preRecords) {
    await httpJson('DELETE', `/hr/shift-roster/${rec.id}`, { token: adminToken });
  }
  const postClear = await httpJson('GET', `/hr/shift-roster?rosterDate=${today}`, { token: adminToken });
  const cleared = postClear.json?.data?.records || [];
  check('clean start (no roster records remain)', cleared.length === 0, `cleared=${preRecords.length} remaining=${cleared.length}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.evaluate(({ token, user, refreshToken }) => {
      localStorage.setItem('token', token);
      if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('erp_user', JSON.stringify(user));
      localStorage.setItem('erp_permissions_ts', Date.now().toString());
    }, { token: login.json.token, user: login.json.user, refreshToken: login.json.refreshToken });

    await page.goto(BASE + '/hr/shift-roster', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('text=Shift Roster', { timeout: 20000 });
    await page.waitForTimeout(2000);

    check('page header Shift Roster', await page.locator('text=Shift Roster').first().isVisible());

    const kTotal = await kpiValue(page, 'Total Employees');
    const kAssigned = await kpiValue(page, 'Assigned Today');
    const kUnassigned = await kpiValue(page, 'Unassigned');
    const kActive = await kpiValue(page, 'Active Shifts');
    check('KPIs correct empty state', kTotal === '7' && kAssigned === '0' && kUnassigned === '7' && kActive === '3',
      `Total=${kTotal} Assigned=${kAssigned} Unassigned=${kUnassigned} Active=${kActive}`);

    const roleTab = page.locator('[role="tablist"][aria-label="Roster views"]');
    check('status bar rendered', await roleTab.isVisible());
    const chips = await roleTab.locator('button.erp-roster-chip').count();
    check('status bar chips', chips >= 5, `chips=${chips} (ALL + 3 shifts + UNASSIGNED)`);
    const s1chip = roleTab.locator('button.erp-roster-chip', { has: page.locator('em', { hasText: 'S-1' }) });
    check('S-1 shift chip present', (await s1chip.count()) === 1);
    const unassignedChipCount = (await roleTab.locator('button.erp-roster-chip--unassigned .erp-roster-chip__count').textContent());
    check('UNASSIGNED chip = 7', (unassignedChipCount || '').trim() === '7', `chip=${unassignedChipCount}`);

    check('empty table state shown', await page.locator('.ant-table-placeholder', { hasText: 'No shift assignments recorded for this date' }).first().isVisible().catch(() => false));
    await shot(page, '01-roster-empty');

    // Filter -> Unassigned view (via UNASSIGNED chip in the status bar)
    await roleTab.locator('button.erp-roster-chip--unassigned').click();
    await page.waitForTimeout(2200);
    check('unassigned section title', await page.locator('text=Unassigned Employees').first().isVisible().catch(() => false));
    const unassignedRows = await page.locator('tr.ant-table-row').count();
    check('unassigned rows = 7', unassignedRows === 7, `rows=${unassignedRows}`);
    const assignBtns = await page.locator('button[aria-label="Assign employee"]').count();
    check('each unassigned row has Assign', assignBtns === 7, `assignBtns=${assignBtns}`);
    await shot(page, '02-unassigned-filter');

    await page.locator('button', { hasText: 'Reset' }).first().click();
    await page.waitForTimeout(2000);
    check('reset back to all', await page.locator('text=Shift Roster').first().isVisible().catch(() => false));

    // Assign via header button
    await page.locator('button', { hasText: 'Assign Shift' }).first().click();
    const addModal = visibleModal(page, 'Assign Shift').first();
    await addModal.waitFor({ state: 'visible', timeout: 10000 });
    check('add modal opens', await addModal.isVisible().catch(() => false));
    await page.waitForTimeout(500);

    await pickSelect(page, 'Assignment employee', 'EMP-001');
    await page.waitForTimeout(500);
    await pickSelect(page, 'Assignment shift', 'S-1');
    await page.waitForTimeout(600);
    const rosterDateVal = await page.locator('input#rosterDate').first().inputValue().catch(() => '');
    check('roster date prefilled', /^\d{4}-\d{2}-\d{2}$/.test(rosterDateVal), `date=${rosterDateVal}`);
    check('shift timing preview visible', await addModal.textContent().then((t) => /08:00/.test(t || '')).catch(() => false));
    await page.locator('textarea#remarks').fill('E2E temp assignment');
    await shot(page, '03-add-modal-filled');

    await page.locator('button', { hasText: 'Create Assignment' }).last().click();
    await page.waitForTimeout(2500);
    const successModal = visibleModal(page, 'Shift Assigned Successfully').first();
    check('success modal shown', await successModal.isVisible().catch(() => false));
    await shot(page, '04-success-modal');
    await successModal.locator('button:has-text("OK")').click();
    await page.waitForTimeout(1500);

    const kAssignedAfter = await kpiValue(page, 'Assigned Today');
    const kUnassignedAfter = await kpiValue(page, 'Unassigned');
    check('KPIs after create', kAssignedAfter === '1' && kUnassignedAfter === '6', `Assigned=${kAssignedAfter} Unassigned=${kUnassignedAfter}`);
    check('table has EMP-001 row', (await bossRow(page, 'EMP-001').count()) === 1);
    const allChipCount = (await roleTab.locator('button.erp-roster-chip:has-text("ALL") .erp-roster-chip__count').textContent());
    check('ALL chip = 1', (allChipCount || '').trim() === '1', `chip=${allChipCount}`);

    // Shift chip filter
    await s1chip.first().click();
    await page.waitForTimeout(2000);
    const s1Rows = await page.locator('tr.ant-table-row').count();
    check('S-1 chip filter shows 1 row', s1Rows === 1, `rows=${s1Rows}`);
    await roleTab.locator('button.erp-roster-chip:has-text("ALL")').click();
    await page.waitForTimeout(1500);

    // View detail
    await page.locator('button[aria-label="View details"]').first().click();
    const viewModal = visibleModal(page, 'Shift Assignment Detail').first();
    await viewModal.waitFor({ state: 'visible', timeout: 10000 });
    check('view modal opens', await viewModal.isVisible().catch(() => false));
    await page.waitForTimeout(400);
    const viewDesc = await viewModal.textContent();
    const flat = (s) => (s || '').replace(/\s+/g, ' ');
    check('view shows audit createdBy System Admin', /Created by\s*System Admin/.test(viewDesc || ''), 'audit block rendered');
    check('view shows shift hours', /Shift hours\s*08:00:00\s*[–-]\s*16:00:00/.test(viewDesc || ''), `raw=${(flat(viewDesc)).slice(-260)}`);
    await shot(page, '05-view-detail');
    await viewModal.locator('button:has-text("Close")').click();
    await page.waitForTimeout(800);

    // Edit
    await page.locator('button[aria-label="Edit assignment"]').first().click();
    const editModal = visibleModal(page, 'Edit Shift Assignment').first();
    await editModal.waitFor({ state: 'visible', timeout: 10000 });
    check('edit modal opens', await editModal.isVisible().catch(() => false));
    await editModal.locator('textarea#remarks').fill('E2E temp assignment updated');
    await editModal.locator('button:has-text("Save Changes")').click();
    await page.waitForTimeout(2500);
    const updSuccessModal = visibleModal(page, 'Assignment Updated Successfully').first();
    check('update success modal', await updSuccessModal.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false));
    await shot(page, '06-update-success');
    await updSuccessModal.locator('button:has-text("OK")').click();
    await page.waitForTimeout(1200);
    await page.locator('button[aria-label="View details"]').first().click();
    await page.waitForTimeout(800);
    const viewModal2 = visibleModal(page, 'Shift Assignment Detail').first();
    await viewModal2.waitFor({ state: 'visible', timeout: 10000 });
    const viewUpdated = await viewModal2.textContent();
    check('update persisted remarks', /E2E temp assignment updated/.test(viewUpdated || ''));
    const m1 = /Created at\s*([0-9-]+\s+[0-9:]+)/.exec(viewUpdated || '');
    const m2 = /Updated at\s*([0-9-]+\s+[0-9:]+)/.exec(viewUpdated || '');
    check('audit timestamps present & updated differs', !!m1 && !!m2 && m1[1] !== m2[1], `created=${m1?.[1]} updated=${m2?.[1]}`);
    await viewModal2.locator('button:has-text("Close")').click();
    await page.waitForTimeout(800);

    // Ensure no stray modal remains before row actions
    const stray = page.locator('.ant-modal-wrap:visible .ant-modal');
    const strayCount = await stray.count();
    for (let i = 0; i < strayCount; i++) {
      const closeBtn = stray.nth(i).locator('.ant-modal-close');
      if (await closeBtn.count()) await closeBtn.first().click({ force: true });
    }
    await page.waitForTimeout(500);

    // Duplicate protection
    await page.locator('button', { hasText: 'Assign Shift' }).first().click();
    const dupModal = visibleModal(page, 'Assign Shift').first();
    await dupModal.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(600);
    await pickSelect(page, 'Assignment employee', 'EMP-001');
    await page.waitForTimeout(400);
    await pickSelect(page, 'Assignment shift', 'S-1');
    await page.waitForTimeout(400);
    await dupModal.locator('button:has-text("Create Assignment")').click();
    await page.waitForTimeout(2500);
    const dupMsg = page.locator('.ant-message-notice', { hasText: 'already assigned' });
    check('duplicate rejected with message', await dupMsg.isVisible().catch(() => false));
    await shot(page, '07-duplicate-error');
    await dupModal.locator('button:has-text("Cancel")').click();
    const discardConfirm = page.locator('.ant-modal-confirm:visible', { hasText: 'Discard this draft?' });
    check('unsaved-draft confirm offered', await discardConfirm.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false));
    if (await discardConfirm.isVisible().catch(() => false)) {
      await discardConfirm.locator('button:has-text("Discard")').click();
    }
    await page.waitForTimeout(800);
    console.log('MODAL DEBUG:', await page.evaluate(() => Array.from(document.querySelectorAll('.ant-modal-wrap')).map((w) => ({ display: getComputedStyle(w).display, title: (w.querySelector('.ant-modal-title')?.textContent || '').trim().slice(0, 50), z: getComputedStyle(w).zIndex }))));

    // Delete
    await page.locator('button[aria-label="Remove assignment"]').first().click();
    await page.waitForTimeout(800);
    const confirmModal = page.locator('.ant-modal-confirm', { hasText: 'Remove this roster assignment?' });
    check('delete confirm opened', await confirmModal.isVisible().catch(() => false));
    await confirmModal.locator('button:has-text("Remove")').click();
    const empRow = page.locator('tr.ant-table-row', { hasText: 'EMP-001' });
    await empRow.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    const rowsAfterDelete = await page.locator('tr.ant-table-row').count();
    check('row removed after delete', rowsAfterDelete === 0, `rows=${rowsAfterDelete}`);
    await page.waitForTimeout(500);
    const kAssignedFinal = await kpiValue(page, 'Assigned Today');
    const kUnassignedFinal = await kpiValue(page, 'Unassigned');
    check('KPIs back to empty', kAssignedFinal === '0' && kUnassignedFinal === '7', `Assigned=${kAssignedFinal} Unassigned=${kUnassignedFinal}`);
    await shot(page, '08-restored-empty');

    // Cleanup safety: delete any lingering roster rows via API
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const list = await httpJson('GET', `/hr/shift-roster?rosterDate=${rosterDateVal}`, { token });
    const leftover = (list.json?.data?.records || []).filter((r) => /E2E temp assignment/.test(r.remarks || ''));
    for (const rec of leftover) { await httpJson('DELETE', `/hr/shift-roster/${rec.id}`, { token }); }
    check('no lingering E2E records', leftover.length === 0, `leftover=${leftover.length}`);

    const unexpected = pageErrors.filter((e) => !/400/.test(e) && !/status of 400/.test(e));
    check('no page errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
  } catch (e) {
    check('E2E crashed', false, String(e && e.message || e));
  } finally {
    await browser.close();
    child.kill();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n== HR-04 BROWSER E2E RESULT: ${results.length - failed}/${results.length} passed ==`);
  process.exit(failed ? 2 : 0);
})();