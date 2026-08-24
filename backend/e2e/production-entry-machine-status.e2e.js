/* E2E: Production-entry machine availability pre-check (duplicate prevention UX)
 * Run: node e2e/production-entry-machine-status.e2e.js   (backend on :3001)
 */
const { Client } = require('pg');

const BASE = 'http://localhost:3001/api/v1';
const EMAIL = 'dev@erp-local.test';
const PASSWORD = 'Dev#2026Test';

let token = '';
let pass = 0, fail = 0;
const failures = [];

function expect(cond, name) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name); }
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

async function db() {
  return new Promise(async (resolve, reject) => {
    const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
    c.connect().then(() => resolve(c)).catch(reject);
  });
}

const DATE_A = '2027-03-15';
const DATE_B = '2027-03-16';

async function main() {
  console.log('== login ==');
  const lr = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  expect(lr.status === 200 || lr.status === 201, 'login ok (' + lr.status + ')');
  const lj = await lr.json();
  token = lj.token || lj.accessToken || lj.access_token || (lj.data && lj.data.accessToken);
  expect(!!token, 'token acquired');

  console.log('== fixtures ==');
  const c = await db();
  const depQ = await c.query(`
    SELECT m.department_id, m.division_id, m.section_id, d.name AS dept_name,
           COUNT(*) AS machine_count
    FROM machines m
    JOIN departments d ON d.id = m.department_id
    WHERE m.is_active = true
      AND m.department_id IS NOT NULL AND m.division_id IS NOT NULL AND m.section_id IS NOT NULL
    GROUP BY m.department_id, m.division_id, m.section_id, d.name
    HAVING COUNT(*) >= 2
    ORDER BY machine_count DESC
    LIMIT 1`);
  const dep = depQ.rows[0];
  expect(!!dep, 'department with >=2 machines found' + (dep ? ' (' + dep.dept_name + ')' : ''));

  const machQ = await c.query(`
    SELECT id, machine_code FROM machines
    WHERE department_id = $1 AND is_active = true
    ORDER BY machine_code ASC`, [dep.department_id]);
  const machines = machQ.rows;
  expect(machines.length >= 2, machines.length + ' active machines in ' + dep.dept_name);

  const compQ = await c.query('SELECT company_id FROM machines WHERE id=$1', [machines[0].id]);
  const COMPANY = compQ.rows[0].company_id;
  const shiftQ = await c.query('SELECT id, shift_code FROM shifts WHERE company_id = $1 AND is_active = true ORDER BY shift_code', [COMPANY]);
  expect(shiftQ.rows.length >= 2, '>=2 shifts available (' + shiftQ.rows.map(function (s) { return s.shift_code; }).join(',') + ')');
  const SHIFT_A = shiftQ.rows[0];
  const SHIFT_B = shiftQ.rows[1];

  const itemQ = await c.query(`SELECT id, base_uom_id FROM items WHERE company_id = $1 AND status = 'ACTIVE' ORDER BY created_at LIMIT 1`, [COMPANY]);
  const ITEM = itemQ.rows[0];
  expect(!!ITEM, 'active item resolved');
  // ERP-00016: if an active machine-target governs machine1 x SHIFT_A on DATE_A, manual target is rejected server-side.
  // Match resolver semantics exactly: status ACTIVE + not soft-deleted + date inside [effective_from, effective_to].
  const mtQ = await c.query(
    `SELECT id FROM machine_targets WHERE machine_id=$1 AND shift_id=$2 AND status='ACTIVE' AND is_active=true
       AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $3::date) LIMIT 1`,
    [machines[0].id, SHIFT_A.id, DATE_A]);
  const tuomQ = await c.query("SELECT id FROM uoms WHERE code IN ('KG','PCS','METER') AND is_active = true ORDER BY code LIMIT 1");
  const TARGET_UOM = tuomQ.rows[0];
  expect(!!TARGET_UOM, 'allowed production UOM resolved');
  const HAS_TARGET = mtQ.rows.length > 0;
  // ERP-00016: machine-linked entries require an active target for (machine, shift).
  let TARGET_ID = null;
  if (!HAS_TARGET) {
    const tcr = await api('POST', '/production/machine-targets', {
      machineId: machines[0].id, shiftId: SHIFT_A.id, uomId: TARGET_UOM.id,
      standardHours: 8, targetQuantity: 500,
      effectiveFrom: '2027-01-01', remarks: 'E2E-MTSTATUS-' + Date.now(),
    });
    if (tcr.status !== 201) console.log('  [debug] target create:', JSON.stringify(tcr.json));
    TARGET_ID = tcr.json && tcr.json.id;
    expect(!!TARGET_ID, 'machine-target created for entry flow (' + tcr.status + ')');
  }

  async function getStatus(shiftId, date) {
    return api('GET', '/production/entries/machine-status?entryDate=' + date + '&shiftId=' + shiftId + '&departmentId=' + dep.department_id);
  }

  console.log('== baseline: all machines ENTRY_REQUIRED ==');
  let st = await getStatus(SHIFT_A.id, DATE_A);
  expect(st.status === 200, 'machine-status 200 (' + st.status + ')');
  expect(st.json && st.json.meta && st.json.meta.totalMachines === machines.length, 'totalMachines=' + (st.json && st.json.meta ? st.json.meta.totalMachines : '?') + ' (expected ' + machines.length + ')');
  expect(st.json.meta.enteredCount === 0, 'enteredCount=0 on clean date');
  expect(st.json.data.every(function (m) { return m.status === 'ENTRY_REQUIRED'; }), 'every machine ENTRY_REQUIRED');

  console.log('== create entry for machine 1 ==');
  const payload = {
    divisionId: dep.division_id, sectionId: dep.section_id, departmentId: dep.department_id,
    entryDate: DATE_A, shiftId: SHIFT_A.id,
    machineId: machines[0].id, machineNo: machines[0].machine_code,
    operatorName: 'E2E Operator', itemId: ITEM.id,
    actualQuantity: 80, runningHours: 7, downtimeHours: 1, scrapQuantity: 2,
  };
  if (!TARGET_ID) { payload.targetQuantity = 100; payload.uomId = ITEM.base_uom_id; }
  const cr = await api('POST', '/production/entries', payload);
  if (cr.status !== 201) console.log('  [debug] create response:', JSON.stringify(cr.json));
  expect(cr.status === 201, 'entry created (' + cr.status + ')');
  const ENTRY_ID = cr.json && cr.json.data && cr.json.data.id;

  console.log('== status flips to ENTERED for that machine only ==');
  st = await getStatus(SHIFT_A.id, DATE_A);
  const byCode = {};
  st.json.data.forEach(function (m) { byCode[m.machineCode] = m; });
  const m1 = byCode[machines[0].machine_code];
  const m2 = byCode[machines[1].machine_code];
  expect(m1 && m1.status === 'ENTERED', machines[0].machine_code + ' -> ENTERED');
  expect(m1 && m1.entryCount === 1 && m1.entries[0].id === ENTRY_ID, 'ENTERED row carries the entry id');
  expect(m2 && m2.status === 'ENTRY_REQUIRED', machines[1].machine_code + ' stays ENTRY_REQUIRED');
  expect(st.json.meta.enteredCount === 1 && st.json.meta.entryRequiredCount === machines.length - 1, 'meta counters updated');

  console.log('== backend duplicate protection (409) ==');
  const dup = await api('POST', '/production/entries', payload);
  expect(dup.status === 409, 'duplicate POST rejected 409 (' + dup.status + ')');
  expect(String((dup.json && dup.json.message) || '').indexOf('already exists') !== -1, '409 message mentions existing entry');

  console.log('== dynamic recalculation ==');
  let alt = await getStatus(SHIFT_B.id, DATE_A);
  const altByCode = {};
  alt.json.data.forEach(function (m) { altByCode[m.machineCode] = m; });
  expect(altByCode[machines[0].machine_code].status === 'ENTRY_REQUIRED', 'Shift B -> machine ENTRY_REQUIRED again');
  alt = await getStatus(SHIFT_A.id, DATE_B);
  const alt2ByCode = {};
  alt.json.data.forEach(function (m) { alt2ByCode[m.machineCode] = m; });
  expect(alt2ByCode[machines[0].machine_code].status === 'ENTRY_REQUIRED', 'Next day -> machine ENTRY_REQUIRED again');

  console.log('== update excludes self from duplicate check ==');
  const up = await api('PUT', '/production/entries/' + ENTRY_ID, { actualQuantity: 85 });
  expect(up.status === 200, 'PUT own record ok (' + up.status + ')');
  expect(Number(up.json && up.json.data && up.json.data.actualQuantity) === 85, 'updated value persisted');

  console.log('== org scoping: division filter returns same machines ==');
  const divSt = await api('GET', '/production/entries/machine-status?entryDate=' + DATE_A + '&shiftId=' + SHIFT_A.id + '&divisionId=' + dep.division_id);
  expect(divSt.status === 200, 'division-scoped call 200');
  const divM = divSt.json.data.filter(function (m) { return m.departmentId === dep.department_id; });
  expect(divM.length === machines.length, 'division scope includes all dept machines');
  expect(divM.every(function (m) { return m.machineCode === machines[0].machine_code ? m.status === 'ENTERED' : m.status === 'ENTRY_REQUIRED'; }), 'statuses consistent under division scope');

  console.log('== invalid shift rejected ==');
  const bad = await api('GET', '/production/entries/machine-status?entryDate=' + DATE_A + '&shiftId=00000000-0000-0000-0000-000000000000&departmentId=' + dep.department_id);
  expect(bad.status === 400, 'unknown shift -> 400 (' + bad.status + ')');

  console.log('== soft-delete flips back to ENTRY_REQUIRED ==');
  const del = await api('DELETE', '/production/entries/' + ENTRY_ID);
  expect(del.status === 200, 'DELETE ok (' + del.status + ')');
  st = await getStatus(SHIFT_A.id, DATE_A);
  const finByCode = {};
  st.json.data.forEach(function (m) { finByCode[m.machineCode] = m; });
  expect(finByCode[machines[0].machine_code].status === 'ENTRY_REQUIRED', 'machine back to ENTRY_REQUIRED after delete');
  expect(st.json.meta.enteredCount === 0, 'enteredCount back to 0');

  if (TARGET_ID) {
    const tdel = await api('DELETE', '/production/machine-targets/' + TARGET_ID);
    expect(tdel.status === 200 || tdel.status === 204, 'cleanup machine-target removed');
  }

  await c.end();
  console.log('');
  console.log('RESULT: pass=' + pass + ' fail=' + fail);
  if (fail > 0) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
}

main().catch(async (e) => { console.error('FATAL', e); process.exit(1); });





