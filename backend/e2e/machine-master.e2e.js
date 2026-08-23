/* PROMPT-07 E2E: Machine Master
 * Run: node e2e/machine-master.e2e.js   (backend must be on :3001)
 */
const { Client } = require('pg');

const BASE = 'http://localhost:3001/api/v1';
const EMAIL = 'dev@erp-local.test';
const PASSWORD = 'Dev#2026Test';

const SPD_DEPT = 'd3000000-0000-0000-0000-000000000001';
const CCD_DEPT = 'd3000000-0000-0000-0000-000000000010';
const SPD_DIV = 'd1000000-0000-0000-0000-000000000001';
const SPD_SEC = 'd2000000-0000-0000-0000-000000000001';
const CCD_DIV = 'd1000000-0000-0000-0000-000000000002';

let token = '';
let r, v;
let pass = 0, fail = 0;
const failures = [];

function expect(cond, name) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name); }
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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

const CODE = 'E2E-MM-' + Date.now().toString(36).toUpperCase();

async function main() {
  console.log('== cleanup previous e2e artifacts ==');
  const c0 = await db();
  // references first (soft-deleted guard entries/targets keep the FK alive)
  await c0.query("DELETE FROM production_entries WHERE machine_id IN (SELECT id FROM machines WHERE machine_code LIKE 'E2E-MM-%')");
  await c0.query("DELETE FROM machine_targets WHERE machine_id IN (SELECT id FROM machines WHERE machine_code LIKE 'E2E-MM-%')");
  await c0.query("DELETE FROM machines WHERE machine_code LIKE 'E2E-MM-%'");
  await c0.end();

  console.log('== login ==');
  const lr = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  expect(lr.status === 200 || lr.status === 201, 'login ok (' + lr.status + ')');
  const lj = await lr.json();
  token = lj.token || lj.accessToken || lj.access_token || (lj.data && lj.data.accessToken);
  expect(!!token, 'token acquired');

  console.log('== list & filters ==');
  r = await api('GET', '/machines?page=1&limit=10');
  expect(r.status === 200, 'GET /machines 200');
  expect(r.json.total === 66 && r.json.data.length === 10, `total=66 active machines (8 legacy demos soft-deleted) page slice=10 (got total=${r.json && r.json.total})`);
  expect(r.json.data.every((m) => m.divisionId && m.qrPayload), 'all machines have hierarchy + qrPayload backfilled');

  r = await api('GET', `/machines?departmentId=${SPD_DEPT}`);
  expect(r.status === 200 && r.json.total >= 5, `filter departmentId=SPD Straightener -> ${r.json && r.json.total} (expect 5 canonical ST)`);
  expect(r.json.data.every((m) => m.departmentId === SPD_DEPT && m.divisionId === SPD_DIV && m.sectionId === SPD_SEC), 'SPD filter rows carry full chain');

  r = await api('GET', `/machines?divisionId=${CCD_DIV}`);
  expect(r.status === 200 && r.json.total > 0 && r.json.data.every((m) => m.divisionId === CCD_DIV), 'filter divisionId CCD');

  r = await api('GET', '/machines?status=ACTIVE&criticality=MEDIUM');
  expect(r.status === 200 && r.json.data.every((m) => m.status === 'ACTIVE' && m.criticality === 'MEDIUM'), 'filters status+criticality');

  r = await api('GET', '/machines?search=Straightener');
  expect(r.status === 200 && r.json.total >= 1, `search=Straightener -> ${r.json && r.json.total}`);
  r = await api('GET', '/machines?search=MCH001');
  expect(r.status === 200 && r.json.data.some((m) => m.machineId === 'MCH001'), 'search by Machine ID MCH001 finds ST-01');
  r = await api('GET', '/machines?search=mch002');
  expect(r.status === 200 && r.json.data.some((m) => m.machineId === 'MCH002'), 'Machine ID search case-insensitive');
  r = await api('GET', '/machines?machineId=MCH001');
  expect(r.status === 200 && r.json.total === 1 && r.json.data[0].machineId === 'MCH001', 'dedicated machineId filter (prefix)');
  r = await api('GET', '/machines?machineId=mch0');
  expect(r.status === 200 && r.json.total >= 3, 'dedicated machineId filter prefix mch0 -> ' + (r.json && r.json.total));

  r = await api('GET', '/machines?sortBy=name&sortDir=DESC&page=1&limit=5');
  const names = r.json.data.map((m) => m.name);
  expect(r.status === 200 && [...names].sort().reverse().every((n, i) => n === names[i]), 'sort by name DESC works');

  r = await api('GET', '/machines?page=2&limit=10');
  expect(r.status === 200 && r.json.page === 2 && r.json.data.length === 10, 'pagination page 2');
  r = await api('GET', '/machines?sectionId=' + SPD_SEC);
  expect(r.status === 200 && r.json.total >= 1 && r.json.data.every((m) => m.sectionId === SPD_SEC), `filter sectionId SPD -> ${r.json && r.json.total}`);
  r = await api('GET', '/machines?page=99&limit=10');
  expect(r.status === 200 && r.json.data.length === 0, 'pagination beyond range -> empty');

  console.log('== create ==');
  const createBody = {
    machineCode: CODE,
    name: 'E2E Test Header Machine',
    description: 'Created by PROMPT-07 e2e',
    departmentId: SPD_DEPT,
    machineNumber: 'MM-1001',
    machineType: 'Cold Forge',
    location: 'Hall A / Bay 3',
    model: 'HF-85',
    manufacturer: 'Chun Zu',
    serialNumber: 'SN-E2E-' + Date.now(),
    capacity: 120.5, // canonical DECIMAL(19,4) numeric capacity
    powerRating: '15 kW',
    installationDate: '2024-03-15',
    warrantyExpiryDate: '2029-03-14',
    criticality: 'HIGH',
  };
  r = await api('POST', '/machines', createBody);
  expect(r.status === 201, 'POST /machines 201 (' + r.status + ')');
  const mid = r.json && r.json.id;
  expect(!!mid, 'created id present');
  const genMid = r.json && r.json.machineId;
  expect(typeof genMid === 'string' && /^MCH\d{3,}$/.test(genMid), 'Machine ID auto-generated in MCH### format (' + genMid + ')');
  expect(genMid !== CODE, 'Machine ID separate from Machine Code');
  expect(r.json.machineCode === CODE, 'Machine Code preserved as submitted');
  expect(r.json.machineNumber === 'MM-1001', 'Machine Number preserved as submitted (MM-1001)');
  expect(Number(r.json.capacity) === 120.5, 'numeric capacity persisted as 120.5');
  expect(r.json.status === 'ACTIVE' && r.json.criticality === 'HIGH', 'defaults status ACTIVE + criticality HIGH persisted');
  expect(r.json.divisionId === SPD_DIV && r.json.sectionId === SPD_SEC, 'hierarchy inherited from department');
  expect(r.json.qrPayload === '/production/machines/' + mid, 'qrPayload = deep-link /production/machines/<id>');

  console.log('== QR lookup by generated Machine ID ==');
  v = await api('GET', '/machines/qr/' + genMid);
  expect(v.status === 200 && v.json.id === mid, 'GET /machines/qr/' + genMid + ' resolves new machine');
  v = await api('GET', '/machines/qr/' + genMid.toLowerCase());
  expect(v.status === 200 && v.json.id === mid, 'QR lookup by machine id is case-insensitive');

  console.log('== validation guards ==');
  v = await api('POST', '/machines', { ...createBody, name: 'dup code same dept' });
  expect(v.status === 409, 'duplicate machineCode in SAME department -> 409 (' + v.status + ')');

  v = await api('POST', '/machines', { ...createBody, machineCode: CODE, departmentId: CCD_DEPT, name: 'same code other dept', serialNumber: null });
  expect(v.status === 201, 'SAME code in DIFFERENT department -> allowed (201) (' + v.status + ')');
  const twinId = v.json.id;
  expect(!!twinId, 'cross-department twin created');
  const dt = await api('DELETE', '/machines/' + twinId);
  expect(dt.status === 204, 'cleanup cross-dept twin');

  v = await api('POST', '/machines', { ...createBody, machineCode: CODE + '-B', serialNumber: createBody.serialNumber });
  expect(v.status === 409, 'duplicate serialNumber -> 409 (' + v.status + ')');

  v = await api('POST', '/machines', { ...createBody, machineCode: CODE + '-C', divisionId: CCD_DIV });
  expect(v.status === 400, 'division/department mismatch -> 400 (' + v.status + ')');

  v = await api('POST', '/machines', { ...createBody, machineCode: CODE + '-D', installationDate: '2030-01-01', warrantyExpiryDate: '2020-01-01' });
  expect(v.status === 400, 'warranty before installation -> 400 (' + v.status + ')');

  v = await api('POST', '/machines', { ...createBody, machineCode: CODE + '-E', warrantyExpiryDate: 'not-a-date' });
  expect(v.status === 400, 'bad date format -> 400 (' + v.status + ')');

  v = await api('POST', '/machines', {});
  expect(v.status === 400, 'empty body -> 400 (' + v.status + ')');

  console.log('== update ==');
  v = await api('PATCH', '/machines/' + mid, { name: 'E2E Renamed Machine', criticality: 'CRITICAL', location: 'Hall B / Bay 1' });
  expect(v.status === 200 && v.json.name === 'E2E Renamed Machine' && v.json.criticality === 'CRITICAL' && v.json.location === 'Hall B / Bay 1', 'PATCH updates fields');
  expect(v.json.status === 'ACTIVE', 'status untouched by PATCH');

  v = await api('PATCH', '/machines/' + mid, { machineCode: 'ST-01' });
  expect(v.status === 409, 'rename to existing code -> 409 (' + v.status + ')');

  v = await api('PUT', '/machines/' + mid, { name: 'E2E Renamed Machine', criticality: 'CRITICAL', location: 'Hall B / Bay 1' });
  expect(v.status === 200 && v.json.name === 'E2E Renamed Machine' && v.json.location === 'Hall B / Bay 1', 'PUT full-replace update works (' + v.status + ')');

  console.log('== status transitions ==');
  for (const st of ['MAINTENANCE', 'RETIRED', 'INACTIVE', 'ACTIVE']) {
    v = await api('PATCH', '/machines/' + mid + '/status', { status: st });
    expect(v.status === 200 && v.json.status === st, `status -> ${st} (${v.status})`);
  }
  v = await api('PATCH', '/machines/' + mid + '/status', { status: 'BROKEN' });
  expect(v.status === 400, 'invalid status value -> 400 (' + v.status + ')');

  console.log('== QR lookup ==');
  v = await api('GET', '/machines/by-code/' + encodeURIComponent('machine:' + mid));
  expect(v.status === 200 && v.json.id === mid, 'resolve by legacy machine:<id> payload');
  v = await api('GET', '/machines/by-code/' + mid);
  expect(v.status === 200 && v.json.id === mid, 'resolve by bare id');
  v = await api('GET', '/machines/by-code/' + encodeURIComponent(`http://localhost:3000/production/machines/${mid}?src=scan`));
  expect(v.status === 200 && v.json.id === mid, 'resolve by full scanned QR URL');

  v = await api('GET', '/machines/' + mid + '/qr');
  expect(v.status === 200 && typeof v.json.dataUrl === 'string' && v.json.dataUrl.startsWith('data:image/png;base64,'), 'QR PNG data URL returned');
  expect(v.json.payload === '/production/machines/' + mid, 'QR payload is stable deep-link path');
  expect(typeof v.json.url === 'string' && v.json.url.endsWith('/production/machines/' + mid), 'absolute QR URL returned for scanning');

  console.log('== detail & errors ==');
  v = await api('GET', '/machines/' + mid);
  expect(v.status === 200 && v.json.machineCode === CODE && v.json.department && v.json.division && v.json.section, 'GET detail with relations');
  v = await api('GET', '/machines/00000000-0000-4000-8000-0000000000ff');
  expect(v.status === 404, 'unknown id -> 404 (' + v.status + ')');
  v = await api('GET', '/machines/not-a-uuid');
  expect(v.status === 400, 'invalid uuid param -> 400 (' + v.status + ')');
  v = await api('GET', '/machines/by-code/nope-does-not-exist');
  expect(v.status === 404, 'unknown qr/code -> 404 (' + v.status + ')');

  const anon = await fetch(BASE + '/machines');
  expect(anon.status === 401 || anon.status === 403, 'unauthenticated blocked (' + anon.status + ')');

  console.log('== delete reference guard ==');
  {
    const cg = await db();
    const compRow = (await cg.query('SELECT company_id FROM machines LIMIT 1')).rows[0];
    const shiftRow = (await cg.query("SELECT id FROM shifts WHERE company_id=$1 AND shift_code='SHIFT-A' AND is_active=true", [compRow.company_id])).rows[0];
    const itemRow = (await cg.query("SELECT id, base_uom_id FROM items WHERE company_id=$1 AND status='ACTIVE' ORDER BY created_at LIMIT 1", [compRow.company_id])).rows[0];
    const orgRow = (await cg.query("SELECT d.id div_id, s.id sec_id, dp.id dept_id FROM divisions d JOIN sections s ON s.division_id=d.id JOIN departments dp ON dp.section_id=s.id WHERE dp.id=$1", [SPD_DEPT])).rows[0];
    await cg.end();
    if (shiftRow && itemRow && orgRow) {
      // ERP-00016: a production entry for a machine requires an ACTIVE machine
      // target (auto-resolved) — create one for the temp machine first.
      const today = new Date().toISOString().slice(0, 10);
      const tgt = await api('POST', '/production/machine-targets', {
        machineId: mid, shiftId: shiftRow.id, uomId: itemRow.base_uom_id,
        standardHours: 8, targetQuantity: 5000, effectiveFrom: today,
      });
      expect(tgt.status === 201, 'temp machine target created (' + tgt.status + ')');
      const pe = await api('POST', '/production/entries', {
        divisionId: orgRow.div_id, sectionId: orgRow.sec_id, departmentId: orgRow.dept_id,
        entryDate: today, shiftId: shiftRow.id, machineId: mid,
        operatorName: 'E2E Guard Operator', itemId: itemRow.id, uomId: itemRow.base_uom_id,
        actualQuantity: 50, runningHours: 8, downtimeHours: 0, scrapQuantity: 0,
        postToInventory: false,
      });
      expect(pe.status === 201, 'reference production entry created (' + pe.status + ')');
      v = await api('DELETE', '/machines/' + mid);
      expect(v.status === 409, 'DELETE referenced machine blocked -> 409 (' + v.status + ')');
      expect(String(v.json && v.json.message || '').toLowerCase().includes('production entr'), 'guard message mentions production entry reference');
      const peDel = await api('DELETE', '/production/entries/' + pe.json.data.id);
      expect(peDel.status === 200, 'reference production entry cleaned up (' + peDel.status + ')');
      if (tgt.status === 201) await api('DELETE', '/production/machine-targets/' + tgt.json.id);
    } else {
      fail++; failures.push('reference-guard prerequisites missing (shift/item/org)');
      console.log('  FAIL reference-guard prerequisites missing');
    }
  }

  console.log('== soft delete ==');
  v = await api('DELETE', '/machines/' + mid);
  expect(v.status === 204, 'DELETE -> 204 (' + v.status + ')');
  v = await api('GET', '/machines/' + mid);
  expect(v.status === 404, 'deleted machine hidden from findOne');
  r = await api('GET', '/machines?limit=100');
  expect(!r.json.data.some((m) => m.id === mid), 'deleted machine absent from list');

  // code reusable after soft delete
  v = await api('POST', '/machines', { machineCode: CODE, name: 'Reborn after delete', departmentId: SPD_DEPT });
  expect(v.status === 201, 'machineCode reusable after soft delete (' + v.status + ')');
  const reborn = v.json.id;
  await api('DELETE', '/machines/' + reborn);

  console.log('== legacy endpoints compatibility ==');
  v = await api('GET', '/production/machines?departmentId=' + SPD_DEPT);
  expect(v.status === 200 && Array.isArray(v.json.data) && !v.json.data.some((m) => m.id === mid), 'legacy GET /production/machines works, excludes deleted');
  v = await api('POST', '/production/machines', { machineCode: CODE + '-LEG', name: 'Legacy created', departmentId: SPD_DEPT });
  expect(v.status === 201 && !!v.json.data && !!v.json.data.id, 'legacy POST /production/machines creates (' + v.status + ')');
  const legacyId = v.json.data ? v.json.data.id : null;

  console.log('== DB integrity ==');
  const c = await db();
  const row = (await c.query('SELECT division_id, section_id, department_id, qr_code, is_active, status FROM machines WHERE id=$1', [legacyId])).rows[0];
  expect(row.is_active === true && row.qr_code === '/production/machines/' + legacyId, 'legacy-created row has deep-link qr_payload in DB');
  const del = (await c.query('SELECT is_active, status FROM machines WHERE id=$1', [mid])).rows[0];
  expect(del && del.is_active === false && del.status === 'INACTIVE', 'soft delete persisted in DB');
  const cnt = (await c.query('SELECT COUNT(*)::int n FROM machines WHERE is_active')).rows[0];
  // 57 canonical + 9 kept legacy - 8 intentionally-INACTIVE near-dup demos = 66,
  // plus the legacy-created row from this run (persisted until next run's cleanup)
  expect(cnt.n === 67, 'active machine count = 66 curated + 1 legacy-created this run (count=' + cnt.n + ')');
  const canon = (await c.query("SELECT count(*)::int n FROM machines WHERE is_active AND machine_id ~ '^MCH[0-9]{3}$' AND regexp_replace(machine_id, '\\D', '', 'g')::int BETWEEN 1 AND 57")).rows[0];
  expect(canon.n === 57, 'canonical MCH001..MCH057 inventory complete (count=' + canon.n + ')');
  const dupPairs = (await c.query("SELECT count(*)::int n FROM (SELECT company_id, COALESCE(department_id::text,'x') d, lower(machine_code) code FROM machines WHERE is_active GROUP BY 1,2,3 HAVING count(*)>1) x")).rows[0];
  expect(dupPairs.n === 0, 'no duplicate (company, department, code) identity pairs');
  const crossDept = (await c.query("SELECT count(DISTINCT department_id)::int n FROM machines WHERE is_active AND machine_code='SP-01'")).rows[0];
  expect(crossDept.n >= 2, "code 'SP-01' legitimately exists across multiple departments (active=" + crossDept.n + ')');
  const hier = (await c.query("SELECT count(*)::int n FROM machines WHERE department_id IS NOT NULL AND (division_id IS NULL OR section_id IS NULL OR qr_code IS NULL) AND is_active")).rows[0];
  expect(hier.n === 0, 'all active dept-mapped machines have division+section+qr');
  await c.end();

  console.log(`\n===== RESULT: ${pass} passed, ${fail} failed =====`);
  if (failures.length) { console.log('Failures:'); failures.forEach((f) => console.log(' - ' + f)); process.exit(1); }
}

main().catch((e) => { console.error('E2E crashed:', e.message); process.exit(1); });
