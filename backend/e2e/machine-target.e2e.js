/* PROMPT-08 E2E: Machine Target Master + automatic production target integration
 * Run: node e2e/machine-target.e2e.js   (backend must be on :3001)
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

const MARK = 'E2E-MT-' + Date.now().toString(36).toUpperCase();

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

  console.log('== lookups ==');
  const listRes = await api('GET', '/machines?search=ST-01&limit=10');
  expect(listRes.status === 200, 'machine list ok (' + listRes.status + ')');
  const rows0 = Array.isArray(listRes.json) ? listRes.json : (listRes.json?.data || listRes.json?.items || []);
  const st01 = rows0.find((m) => m.machineCode === 'ST-01' || m.machineId === 'MCH001');
  expect(!!st01, 'canonical machine ST-01 / MCH001 found');
  const companyId = st01.companyId;

  const c = await db();
  const shiftQ = await c.query("SELECT id, shift_code FROM shifts WHERE company_id=$1 AND shift_code='SHIFT-A' AND is_active=true", [companyId]);
  if (!shiftQ.rows[0]) throw new Error('SHIFT-A not found for company ' + companyId);
  const SHIFT1 = shiftQ.rows[0].id;
  const genQ = await c.query("SELECT id FROM shifts WHERE company_id=$1 AND shift_code='GENERAL' AND is_active=true", [companyId]);
  const GENERAL = genQ.rows[0] && genQ.rows[0].id;
  const uomQ = await c.query("SELECT id, code FROM uoms WHERE code='PCS' AND is_active=true LIMIT 1");
  const PCS = uomQ.rows[0].id;
  const kgQ = await c.query("SELECT id FROM uoms WHERE code='KG' AND is_active=true LIMIT 1");
  const KG = kgQ.rows[0] && kgQ.rows[0].id;
  // a second canonical machine for the GENERAL fallback test
  const m2Q = await c.query("SELECT m.id FROM machines m WHERE m.company_id=$1 AND m.machine_id='MCH002' AND m.is_active=true", [companyId]);
  const MCH2 = m2Q.rows[0] && m2Q.rows[0].id;
  // item for production entry creation
  const itemQ = await c.query("SELECT id, base_uom_id FROM items WHERE company_id=$1 AND status='ACTIVE' ORDER BY created_at LIMIT 1", [companyId]);
  const ITEM = itemQ.rows[0];
  expect(!!SHIFT1 && !!PCS && !!st01.id && !!ITEM, 'shift/uom/machine/item ids resolved');

  const today = new Date().toISOString().slice(0, 10);

  console.log('== target CRUD ==');
  const cr = await api('POST', '/production/machine-targets', {
    machineId: st01.id, shiftId: SHIFT1, uomId: PCS,
    standardHours: 8, targetQuantity: 5000,
    effectiveFrom: today, remarks: MARK,
  });
  expect(cr.status === 201, 'create target 201 (' + cr.status + ') ' + JSON.stringify(cr.json && cr.json.message || ''));
  const T1 = cr.json && cr.json.id;
  expect(!!T1, 'target id returned');

  const dup = await api('POST', '/production/machine-targets', {
    machineId: st01.id, shiftId: SHIFT1, uomId: PCS,
    standardHours: 8, targetQuantity: 9999,
    effectiveFrom: today, remarks: MARK + '-DUP',
  });
  expect(dup.status === 409, 'overlapping duplicate rejected 409 (' + dup.status + ')');

  const one = await api('GET', '/production/machine-targets/' + T1);
  expect(one.status === 200 && one.json.id === T1, 'detail by id 200');
  const lst = await api('GET', '/production/machine-targets?machineId=' + st01.id);
  const lstRows = Array.isArray(lst.json) ? lst.json : (lst.json?.data || lst.json?.items || []);
  expect(lst.status === 200 && lstRows.some((t) => t.id === T1), 'list filtered by machine contains target');
  expect(lstRows.every((t) => t.companyId === companyId), 'company isolation in list');

  const up = await api('PUT', '/production/machine-targets/' + T1, { targetQuantity: 6000 });
  expect(up.status === 200 && Number(up.json.targetQuantity) === 6000, 'update target quantity to 6000 (' + up.status + ')');

  const stOff = await api('PATCH', '/production/machine-targets/' + T1 + '/status', { status: 'INACTIVE' });
  expect(stOff.status === 200 && stOff.json.status === 'INACTIVE', 'status change INACTIVE (' + stOff.status + ')');
  const resOff = await api('GET', '/production/machine-targets/resolve?machineId=' + st01.id + '&shiftId=' + SHIFT1 + '&productionDate=' + today);
  expect(resOff.status === 400, 'resolve with only-INACTIVE target errors (' + resOff.status + ')');
  const stOn = await api('PATCH', '/production/machine-targets/' + T1 + '/status', { status: 'ACTIVE' });
  expect(stOn.status === 200 && stOn.json.status === 'ACTIVE', 'status change back ACTIVE');

  console.log('== resolution math (6000 per 8h) ==');
  const r6 = await api('GET', '/production/machine-targets/resolve?machineId=' + st01.id + '&shiftId=' + SHIFT1 + '&productionDate=' + today + '&workingHours=6');
  expect(r6.status === 200 && Number(r6.json.calculatedTarget) === 4500 && r6.json.usedGeneralFallback === false, '6h -> 4500 (' + r6.status + ') got ' + (r6.json && r6.json.calculatedTarget));
  const r8 = await api('GET', '/production/machine-targets/resolve?machineId=' + st01.id + '&shiftId=' + SHIFT1 + '&productionDate=' + today + '&workingHours=8');
  expect(r8.status === 200 && Number(r8.json.calculatedTarget) === 6000, '8h -> 6000');
  const r12 = await api('GET', '/production/machine-targets/resolve?machineId=' + st01.id + '&shiftId=' + SHIFT1 + '&productionDate=' + today + '&workingHours=12');
  expect(r12.status === 200 && Number(r12.json.calculatedTarget) === 9000, '12h -> 9000');
  const rn = await api('GET', '/production/machine-targets/resolve?machineId=' + st01.id + '&shiftId=' + SHIFT1 + '&productionDate=' + today);
  expect(rn.status === 200 && Number(rn.json.standardTarget) === 6000 && rn.json.calculatedTarget === null, 'no hours -> configured target only, calculated null');

  console.log('== GENERAL shift fallback ==');
  let T2 = null;
  if (MCH2 && GENERAL) {
    const g = await api('POST', '/production/machine-targets', {
      machineId: MCH2, shiftId: GENERAL, uomId: PCS,
      standardHours: 8, targetQuantity: 4000,
      effectiveFrom: today, remarks: MARK + '-GEN',
    });
    T2 = g.json && g.json.id;
    expect(g.status === 201, 'GENERAL-shift target created (' + g.status + ')');
    const fb = await api('GET', '/production/machine-targets/resolve?machineId=' + MCH2 + '&shiftId=' + SHIFT1 + '&productionDate=' + today + '&workingHours=6');
    expect(fb.status === 200 && fb.json.usedGeneralFallback === true && Number(fb.json.calculatedTarget) === 3000, 'fallback via GENERAL: 6h -> 3000, flagged (' + fb.status + ')');
    const nofb = await api('GET', '/production/machine-targets/resolve?machineId=' + MCH2 + '&shiftId=' + SHIFT1 + '&productionDate=' + today + '&allowGeneralFallback=false');
    expect(nofb.status === 400, 'allowGeneralFallback=false blocks cross-shift use (' + nofb.status + ')');
  } else {
    console.log('  SKIP general-fallback block (missing MCH002/GENERAL)');
  }

  console.log('== daily production entry integration ==');
  const orgQ = await c.query("SELECT d.id div_id, s.id sec_id, dp.id dept_id FROM divisions d JOIN sections s ON s.division_id=d.id JOIN departments dp ON dp.section_id=s.id WHERE dp.company_id=$1 AND dp.is_active=true AND d.is_active=true AND s.is_active=true AND dp.status='ACTIVE' LIMIT 1", [companyId]);
  const org = orgQ.rows[0];
  if (!org) {
    fail++; failures.push('no active division/section/department chain'); console.log('  FAIL no active org chain');
  }
  if (org) {
    const entryPayload = {
      divisionId: org.div_id, sectionId: org.sec_id, departmentId: org.dept_id,
      entryDate: today, shiftId: SHIFT1, machineId: st01.id,
      operatorName: 'E2E Operator', itemId: ITEM.id,
      runningHours: 6, downtimeHours: 1, actualQuantity: 3600, scrapQuantity: 0,
      postToInventory: false,
    };
    const pe = await api('POST', '/production/entries', entryPayload);
    expect(pe.status === 201, 'entry without manual target 201 (' + pe.status + ') ' + JSON.stringify(pe.json && pe.json.message || ''));
    const E1 = pe.json && pe.json.id;
    if (E1) {
      expect(pe.json.uomId === PCS, 'entry UOM auto-set from target (PCS)');
      expect(Number(pe.json.targetQuantity) === 4500, 'entry target auto-calculated 4500 (got ' + pe.json.targetQuantity + ')');
      expect(Number(pe.json.achievementPercentage) === 80, 'achievement 3600/4500 = 80% (got ' + pe.json.achievementPercentage + ')');
      const snapQ = await c.query('SELECT machine_target_id, standard_hours, calculated_target FROM production_entries WHERE id=$1', [E1]);
      const srow = snapQ.rows[0];
      expect(srow && srow.machine_target_id === T1 && Number(srow.standard_hours) === 8 && Number(srow.calculated_target) === 4500, 'DB snapshot columns persisted');

      const manual = await api('POST', '/production/entries', { ...entryPayload, entryDate: '2026-07-01', targetQuantity: 12345 });
      expect(manual.status === 400, 'manual target override rejected 400 (' + manual.status + ')');

      if (KG) {
        const badUom = await api('POST', '/production/entries', { ...entryPayload, entryDate: '2026-07-02', uomId: KG });
        expect(badUom.status === 400, 'incompatible UOM rejected 400 (' + badUom.status + ')');
      }

      const del = await api('DELETE', '/production/entries/' + E1);
      expect(del.status === 200 || del.status === 204, 'test entry deleted (' + del.status + ')');
    }
  }

  console.log('== delete guards ==');
  const refDel = T1 ? await api('DELETE', '/production/machine-targets/' + T1).catch(() => ({ status: -1 })) : null;
  // T1 was referenced by the deleted entry; guard counts active entries only — soft-deleted entry should not block
  expect(refDel && (refDel.status === 204 || refDel.status === 409), 'delete referenced/unused target handled (' + refDel && refDel.status + ')');
  if (T2) {
    const del2 = await api('DELETE', '/production/machine-targets/' + T2);
    expect(del2.status === 204 || del2.status === 200, 'delete unused GENERAL target (' + del2.status + ')');
  }

  console.log('== cleanup ==');
  try {
    await c.query("DELETE FROM machine_targets WHERE remarks LIKE $1", [MARK + '%']);
    await c.query("DELETE FROM production_entries WHERE operator_name='E2E Operator' AND machine_target_id IS NOT NULL AND entry_date=$1", [today]);
    console.log('cleanup done');
  } catch (e) { console.log('cleanup note: ' + e.message); }
  c.end();

  console.log('\n== RESULT: ' + pass + ' passed, ' + fail + ' failed ==');
  if (failures.length) { console.log('Failures:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
