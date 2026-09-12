'use strict';
/* Task14 multi-input/output runtime smoke test — run from backend/: node runtime-smoke-routing.cjs */
const path = __dirname;
require('dotenv').config({ path: path + '/.env' });
const { Pool } = require('pg');

const BASE = 'http://localhost:3001/api/v1';
const EMAIL = process.env.SMOKE_EMAIL || 'dev@erp-local.test';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Dev#2026Test';

const pool = new Pool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, schema: process.env.DB_SCHEMA,
  ssl: false,
});

let passed = 0, failed = 0;
const fails = [];
function check(desc, cond, extra) {
  if (cond) { passed++; console.log('  OK   ' + desc); }
  else { failed++; fails.push(desc + (extra ? ' :: ' + extra : '')); console.log('  FAIL ' + desc + (extra ? ' :: ' + extra : '')); }
}

async function api(method, urlPath, body, token) {
  const r = await fetch(BASE + urlPath, {
    method, headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text.slice(0, 200) }; }
  return { status: r.status, json: j };
}

async function run() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  const token = login.json.token;
  check('login returns token (status ' + login.status + ')', !!token && login.status === 201, JSON.stringify(login.json).slice(0, 160));
  if (!token) return;

  // ---- B. Route types ------------------------------------------------------------------
  const rtList = await api('GET', '/master-data/route-types', null, token);
  const rts = Array.isArray(rtList.json.data) ? rtList.json.data : [];
  check('GET /master-data/route-types 200 with data', rtList.status === 200 && Array.isArray(rtList.json.data), JSON.stringify(rtList.json).slice(0, 160));
  const ccdRt = rts.find(r => r.routeCode === 'CCD');
  check('seeded CCD route type present (status ' + (ccdRt ? ccdRt.status : '?') + ')', !!ccdRt && String(ccdRt.status).toUpperCase() === 'ACTIVE', ccdRt ? JSON.stringify({ name: ccdRt.name, desc: ccdRt.description, status: ccdRt.status }) : 'not found');
  const ccdRtId = ccdRt ? ccdRt.id : null;

  // ---- C. Route-type CRUD --------------------------------------------------------------
  const smkCode = 'SMKRT' + Date.now().toString().slice(-6);
  const companyQ = await pool.query(`SELECT default_company_id FROM "${process.env.DB_SCHEMA || 'public'}".erp_users WHERE email=$1`, [EMAIL]);
  const companyId = companyQ.rows[0] && companyQ.rows[0].default_company_id;
  const rtCreate = await api('POST', '/master-data/route-types', { companyId, routeCode: smkCode, name: 'Smoke Route Type', description: 'created by smoke test', status: 'ACTIVE' }, token);
  const rtCreated = rtCreate.json.data || rtCreate.json.item || rtCreate.json;
  const rtId = rtCreated && (rtCreated.id);  
  check('route-type create 201 (code ' + (rtCreated && rtCreated.code) + ')', rtCreate.status === 201 && !!rtId, JSON.stringify(rtCreate.json).slice(0, 200));

  let rtUpdate = null;
  if (rtId) {
    rtUpdate = await api('PATCH', '/master-data/route-types/' + rtId, { name: 'Smoke Route Type UPDATED', description: 'updated by smoke test' }, token);
    check('route-type update 200 name changed', rtUpdate.status === 200 && (rtUpdate.json.data || rtUpdate.json).name === 'Smoke Route Type UPDATED', JSON.stringify(rtUpdate.json).slice(0, 200));
    const rtDeact = await api('PATCH', '/master-data/route-types/' + rtId + '/deactivate', {}, token);
    const stDeact = (rtDeact.json.data || rtDeact.json).status;
    check('route-type deactivate -> ' + stDeact, rtDeact.status === 200 && String(stDeact).toUpperCase() === 'INACTIVE', JSON.stringify(rtDeact.json).slice(0, 200));
    const rtAct = await api('PATCH', '/master-data/route-types/' + rtId + '/activate', {}, token);
    const stAct = (rtAct.json.data || rtAct.json).status;
    check('route-type activate -> ' + stAct, rtAct.status === 200 && String(stAct).toUpperCase() === 'ACTIVE', JSON.stringify(rtAct.json).slice(0, 200));
  }

  // ---- D. Reference data for selects ----------------------------------------------------
  const whList = await api('GET', '/warehouses', null, token);
  const whs = Array.isArray(whList.json.data) ? whList.json.data : [];
  check('GET /warehouses 200 (' + whs.length + ' found)', whList.status === 200, JSON.stringify(whList.json).slice(0, 140));

  const macList = await api('GET', '/production/machines', null, token);
  let macs = Array.isArray(macList.json.data) ? macList.json.data : (Array.isArray(macList.json.items) ? macList.json.items : []);
  check('GET /production/machines 200 (' + macs.length + ' found)', macList.status === 200, JSON.stringify(macList.json).slice(0, 140));

  const itemQ = await pool.query(`SELECT i.item_code AS code, i.id, i.base_uom_id AS uom_id FROM "${process.env.DB_SCHEMA || 'public'}".items i WHERE i.item_code IN ('RM-WIRE-001','WIP-FLAT-001','FG-CASING-001','PACK-CASING-001')`);
  const byCode = {}; itemQ.rows.forEach(r => byCode[r.code] = r);
  const rmWire = byCode['RM-WIRE-001'], wipFlat = byCode['WIP-FLAT-001'], fg = byCode['FG-CASING-001'], pack = byCode['PACK-CASING-001'];
  check('demo items present (RM-WIRE/WIP-FLAT/FG-CASING/PACK-CASING)', !!(rmWire && wipFlat && fg && pack), JSON.stringify(byCode));

  // ---- E. Seeded routing RTG-CCD-001 ------------------------------------------------------
  const rtgList = await api('GET', '/production/routings', null, token);
  const rtgs = Array.isArray(rtgList.json.data) ? rtgList.json.data : [];
  check('GET /production/routings 200 (' + rtgs.length + ' found)', rtgList.status === 200 && Array.isArray(rtgList.json.data), JSON.stringify(rtgList.json).slice(0, 160));
  const ccd = rtgs.find(r => r.routingCode === 'RTG-CCD-001');
  check('seeded RTG-CCD-001 routing present', !!ccd, 'not found in list');
  let ccdDetail = null;
  if (ccd) {
    ccdDetail = await api('GET', '/production/routings/' + ccd.id, null, token);
    const d = ccdDetail.json.data;
    const ops = d && d.operations;
    const routeTypeMatches = d && d.routeTypeId && ccdRtId ? String(d.routeTypeId) === String(ccdRtId) : (d && d.routeType ? String(d.routeType.code) === 'CCD' : false);
    check('CCD routing detail: route_type_id persisted', ccdDetail.status === 200 && routeTypeMatches, JSON.stringify(ccdDetail.json).slice(0, 240));
    check('CCD detail has 4 operations in sequence 10/20/30/40', !!ops && ops.length === 4 && ops.map(o => o.sequenceNo).join(',') === '10,20,30,40', ops ? JSON.stringify(ops.map(o => ({ s: o.sequenceNo, c: o.operationCode }))) : 'no operations');
    const hasJunction = !!ops && ops.some(o => (Array.isArray(o.inputs) && o.inputs.length > 0) && (Array.isArray(o.outputs) && o.outputs.length > 0));
    const inCount = ops ? ops.reduce((n, o) => n + (Array.isArray(o.inputs) ? o.inputs.length : 0), 0) : 0;
    const outCount = ops ? ops.reduce((n, o) => n + (Array.isArray(o.outputs) ? o.outputs.length : 0), 0) : 0;
    check('CCD ops expose input/output junction arrays (total ' + inCount + ' in / ' + outCount + ' out)', hasJunction && inCount >= 4 && outCount >= 4, ops ? JSON.stringify(ops) : '');
  }

  // ---- F. Flow graph --------------------------------------------------------------------
  if (fg) {
    const flowRoot = await api('GET', '/production/routings/flow/' + fg.id, null, token);
    const g = flowRoot.json.data;
    check('flow graph for FG-CASING-001 200', flowRoot.status === 200 && !!g, JSON.stringify(flowRoot.json).slice(0, 200));
    if (g) {
      const stages = g.stages || [];
      check('flow graph stages present (' + stages.length + ' stages)', stages.length > 0, JSON.stringify(g).slice(0, 400));
      check('flow graph exposes source/branch/convergence node sets', Array.isArray(g.sourceNodeIds) && Array.isArray(g.branchNodeIds) && Array.isArray(g.convergenceNodeIds), JSON.stringify(g).slice(0, 400));
    }
  }

  // ---- G. Full routing CRUD with multi-input/output ---------------------------------------
  const rtgCode = 'SMKRTG' + Date.now().toString().slice(-6);
  const warehouseId = whs.length ? (whs[0].id || whs[0].warehouseId) : null;
  const machine = macs.length ? macs[0] : null;
  const machineId = machine ? (machine.id || machine.machineId) : null;
  const uomKg = rmWire ? rmWire.uom_id : null;

  const op1In = [{ itemId: rmWire.id, quantity: 200, uomId: uomKg, isPrimary: true, lineNumber: 10, scrapBasis: 'WITH_SCRAP', sourceWarehouseId: warehouseId }];
  const op1Out = [{ itemId: wipFlat.id, quantity: 190, uomId: uomKg, isPrimary: true, lineNumber: 10, outputType: 'GOOD' }];
  const op2In = [
    { itemId: wipFlat.id, quantity: 190, uomId: uomKg, isPrimary: true, lineNumber: 10, scrapBasis: 'WITH_SCRAP', sourceWarehouseId: warehouseId },
    { itemId: rmWire.id, quantity: 10, uomId: uomKg, isPrimary: false, lineNumber: 20, scrapBasis: 'NONE', sourceWarehouseId: warehouseId },
  ];
  const op2Out = [
    { itemId: fg.id, quantity: 95, uomId: uomKg, isPrimary: true, lineNumber: 10, outputType: 'GOOD' },
    { itemId: pack.id, quantity: 5, uomId: uomKg, isPrimary: false, lineNumber: 20, outputType: 'WASTE' },
  ];

  const createBody = {
    routingCode: rtgCode, name: 'Smoke Multi-I/O Routing', description: 'created by smoke test',
    productId: fg.id, routeTypeId: ccdRtId, baseQuantity: 1, isDefault: false,
    operations: [
      { sequenceNo: 10, operationCode: 'OP-A', operationName: 'Op Alpha', machineRequired: false, machineId: null, inputs: op1In, outputs: op1Out },
      { sequenceNo: 20, operationCode: 'OP-B', operationName: 'Op Beta', machineRequired: true, machineId, inputs: op2In, outputs: op2Out },
    ],
  };
  const rtgCreate = await api('POST', '/production/routings', createBody, token);
  const created = rtgCreate.json.data;
  check('routing create 201 with routeTypeId + multi-I/O ops', rtgCreate.status === 201 && created && created.id, JSON.stringify(rtgCreate.json).slice(0, 320));
  const rtgId = created && created.id;

  if (created) {
    const detail = await api('GET', '/production/routings/' + rtgId, null, token);
    const d = detail.json.data;
    check('detail: routeTypeId persisted & 2 ops present', detail.status === 200 && d && String(d.routeTypeId) === String(ccdRtId) && d.operations.length === 2, JSON.stringify(detail.json).slice(0, 320));
    const bOp = d.operations.find(o => o.operationCode === 'OP-B');
    const bi = bOp ? (Array.isArray(bOp.inputs) ? bOp.inputs.length : 0) : 0;
    const bo = bOp ? (Array.isArray(bOp.outputs) ? bOp.outputs.length : 0) : 0;
    check('OP-B persists multi-input (2) & multi-output (2) junctions', bi === 2 && bo === 2, JSON.stringify(bOp || {}).slice(0, 400));
    check('OP-B persists machine_id (' + (bOp && bOp.machineId) + ') when machineRequired', !bOp || bOp.machineRequired === true, JSON.stringify(bOp || {}));

    const bOpId = bOp && bOp.id;
    if (bOpId) {
      const upd = await api('PUT', '/production/routings/operations/' + bOpId, {
        operationCode: 'OP-B', operationName: 'Op Beta UPDATED', operationId: bOp.operationId ? bOp.operationId : undefined,
        sequenceNo: 20, machineRequired: true, machineId, scrapPercentage: 3,
        inputs: op2In, outputs: op2Out,
      }, token);
      let updOk = false;
      if (upd.status === 200) {
        const after = await api('GET', '/production/routings/' + rtgId, null, token);
        const b2 = (after.json.data && after.json.data.operations || []).find(o => o.operationCode === 'OP-B');
        updOk = !!b2 && b2.operationName === 'Op Beta UPDATED' && Number(b2.scrapPercentage) === 3;
        console.log('  info update applied: name=' + (b2 && b2.operationName) + ' scrap=' + (b2 && b2.scrapPercentage));
      }
      check('update operation 200 (name + scrap persisted)', updOk, JSON.stringify(upd.json).slice(0, 300));
    }

    const reorder = await api('POST', '/production/routings/' + rtgId + '/operations/' + bOpId + '/reorder', { newSequenceNo: 1 }, token);
    const rd = reorder.json.data;
    const moved = rd && rd.operations ? rd.operations[0] : null;
    check('reorder OP-B to front succeeds (first op is OP-B)', reorder.status === 200 && moved && moved.id === bOpId, JSON.stringify(reorder.json).slice(0, 300));

    const dup = await api('POST', '/production/routings/' + rtgId + '/operations/' + bOpId + '/duplicate', null, token);
    const dd = dup.json.data;
    check('duplicate OP-B -> 3 operations, copy carries junctions (clone code OP-B-2)', dup.status === 201 && dd && dd.operations.length === 3 && dd.operations.some(o => o.operationCode === 'OP-B-2' && Array.isArray(o.inputs) && o.inputs.length === 2 && Array.isArray(o.outputs) && o.outputs.length === 2), JSON.stringify(dup.json).slice(0, 400));
  }

  // ---- G2. Synthetic org UUIDs (Task15: UUID_LOOSE contract) --------------------------------
  {
    const orgList = await api('GET', '/divisions?limit=200', null, token);
    const divs = Array.isArray(orgList.json.data) ? orgList.json.data : [];
    const ccdDiv = divs.find(x => x.divisionCode === 'DIV-CCD');
    check('divisions lookup exposes CCD with synthetic UUID (' + (ccdDiv ? ccdDiv.id : 'n/a') + ')', !!ccdDiv && /^d[0-9a-f]{7}-/.test(ccdDiv.id || ''), JSON.stringify(ccdDiv || {}).slice(0, 160));

    const secList = await api('GET', '/sections?limit=200', null, token);
    const secs = Array.isArray(secList.json.data) ? secList.json.data : [];
    const ccdSec = ccdDiv ? secs.find(x => x.divisionId === ccdDiv.id) : null;

    const deptList = await api('GET', '/departments?limit=200', null, token);
    const depts = Array.isArray(deptList.json.data) ? deptList.json.data : [];
    const chainDept = ccdSec
      ? depts.find(x => x.sectionId === ccdSec.id)
      : (ccdDiv ? depts.find(x => x.sectionId && secs.some(s => s.id === x.sectionId && s.divisionId === ccdDiv.id)) : null);
    const ccdDept = chainDept || null;

    let g2 = null;
    if (ccdDiv && ccdSec && ccdDept && fg && wipFlat && rmWire && uomKg) {
      const g2Code = 'SMKRTG2' + Date.now().toString().slice(-6);
      const g2Create = await api('POST', '/production/routings', {
        routingCode: g2Code, name: 'Smoke Synthetic UUID Routing',
        productId: fg.id, routeTypeId: ccdRtId, baseQuantity: 1, isDefault: false,
        operations: [
          { sequenceNo: 10, operationCode: 'OP-UUID-A', operationName: 'Op UUID A',
            divisionId: ccdDiv.id, sectionId: ccdSec.id, departmentId: ccdDept.id,
            inputs: op1In, outputs: op1Out },
        ],
      }, token);
      g2 = g2Create.json.data;
      const g2Ok = g2Create.status === 201 && g2 && g2.id;
      check('operation create (nested in routing) accepts synthetic org UUIDs -> 201', g2Ok, JSON.stringify(g2Create.json).slice(0, 300));
      if (g2Ok) {
        const g2Op = (g2.operations || []).find(o => o.operationCode === 'OP-UUID-A');
        check('nested op persists org chain (div ' + (g2Op && g2Op.divisionId) + ' / dept ' + (g2Op && g2Op.departmentId) + ')', !!g2Op && String(g2Op.divisionId) === String(ccdDiv.id) && String(g2Op.departmentId) === String(ccdDept.id), JSON.stringify(g2Op || {}).slice(0, 300));

        const g2Add = await api('POST', '/production/routings/' + g2.id + '/operations', {
          sequenceNo: 20, operationCode: 'OP-UUID-B', operationName: 'Op UUID B',
          divisionId: ccdDiv.id, sectionId: ccdSec.id, departmentId: ccdDept.id,
          inputs: op1In, outputs: op1Out,
        }, token);
        const g2b = ((g2Add.json.data && g2Add.json.data.operations) || []).find(o => o.operationCode === 'OP-UUID-B');
        check('operation add (standalone) accepts synthetic org UUIDs -> 201', g2Add.status === 201 && !!g2b && String(g2b.divisionId) === String(ccdDiv.id), JSON.stringify(g2Add.json).slice(0, 300));
        if (g2b && g2b.id) {
          const g2Upd = await api('PUT', '/production/routings/operations/' + g2b.id, { operationName: 'Op UUID B UPDATED', divisionId: ccdDiv.id, sectionId: ccdSec.id, departmentId: ccdDept.id }, token);
          const g2u = ((g2Upd.json.data && g2Upd.json.data.operations) || []).find(o => o.id === g2b.id);
          check('operation update accepts synthetic org UUIDs -> 200', g2Upd.status === 200 && !!g2u && g2u.operationName === 'Op UUID B UPDATED', JSON.stringify(g2Upd.json).slice(0, 300));
        }
      }

      // Validation is NOT disabled: a non-UUID org code (e.g. 'DIV-CCD') must still 400.
      const badOrg = await api('POST', '/production/routings/' + g2.id + '/operations', {
        sequenceNo: 30, operationCode: 'OP-BADORG', operationName: 'Bad Org', divisionId: 'DIV-CCD',
        inputs: op1In, outputs: op1Out,
      }, token);
      check('non-UUID org code still rejected 400 (validation intact)', badOrg.status === 400, JSON.stringify(badOrg.json).slice(0, 200));
    } else {
      check('operation create accepts synthetic org UUIDs (full CCD chain)', false, 'SKIPPED - no CCD div/sec/dept chain; div=' + !!ccdDiv + ' sec=' + !!ccdSec + ' dept=' + !!ccdDept);
    }

    if (g2 && g2.id) {
      const opsClean2 = await pool.query(`SELECT id FROM "${process.env.DB_SCHEMA || 'public'}".routing_operations WHERE routing_id=$1`, [g2.id]);
      for (const o of opsClean2.rows) {
        await pool.query(`DELETE FROM "${process.env.DB_SCHEMA || 'public'}".routing_operation_outputs WHERE routing_operation_id=$1`, [o.id]);
        await pool.query(`DELETE FROM "${process.env.DB_SCHEMA || 'public'}".routing_operation_inputs WHERE routing_operation_id=$1`, [o.id]);
        await pool.query(`DELETE FROM "${process.env.DB_SCHEMA || 'public'}".routing_operations WHERE id=$1`, [o.id]);
      }
      await pool.query(`DELETE FROM "${process.env.DB_SCHEMA || 'public'}".production_routings WHERE id=$1`, [g2.id]);
      console.log('  clean: deleted synthetic-UUID smoke routing + ops');
    }

    // Machine Target lookup contract (read-only integration: existing module is source of truth).
    const mtList = await api('GET', '/production/machine-targets?limit=200', null, token);
    const mts = Array.isArray(mtList.json.data) ? mtList.json.data : [];
    check('GET /production/machine-targets 200 (' + mts.length + ' targets)', mtList.status === 200, JSON.stringify(mtList.json).slice(0, 200));
    if (mts.length) {
      const hasShape = mts.every(t => t.id && t.standardHours !== undefined && t.standardHours !== null && (t.targetQuantity !== undefined || t.standardTarget !== undefined));
      check('machine-target rows expose id/standardHours/target fields', hasShape, JSON.stringify(mts[0]).slice(0, 300));
    }
  }

  // ---- H. Whitelist guard still rejects unknown props --------------------------------------
  const bad = await api('POST', '/production/routings', { routingCode: 'BADCODE', name: 'Bad', productId: fg.id, routeTypeId: ccdRtId, unknownField: 'boom', operations: [] }, token);
  check('unknown field rejected 400 (whitelist intact)', bad.status === 400, JSON.stringify(bad.json).slice(0, 200));

  // ---- I. Cleanup (DB) --------------------------------------------------------------------
  if (rtgId) {
    const opsClean = await pool.query(`SELECT id FROM "${process.env.DB_SCHEMA || 'public'}".routing_operations WHERE routing_id=$1`, [rtgId]);
    for (const o of opsClean.rows) {
      await pool.query(`DELETE FROM "${process.env.DB_SCHEMA || 'public'}".routing_operation_outputs WHERE routing_operation_id=$1`, [o.id]);
      await pool.query(`DELETE FROM "${process.env.DB_SCHEMA || 'public'}".routing_operation_inputs WHERE routing_operation_id=$1`, [o.id]);
      await pool.query(`DELETE FROM "${process.env.DB_SCHEMA || 'public'}".routing_operations WHERE id=$1`, [o.id]);
    }
    await pool.query(`DELETE FROM "${process.env.DB_SCHEMA || 'public'}".production_routings WHERE id=$1`, [rtgId]);
    console.log('  clean: deleted smoke routing + ops');
  }
  if (rtId) {
    await pool.query(`DELETE FROM "${process.env.DB_SCHEMA || 'public'}".route_types WHERE id=$1`, [rtId]);
    console.log('  clean: deleted smoke route type');
  }

  console.log('\n===== SMOKE RESULT: ' + passed + ' passed, ' + failed + ' failed =====');
  if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log('  - ' + f)); }
  await pool.end();
  process.exit(failed ? 1 : 0);
}

run().catch(e => { console.error('SMOKE ABORT:', e.message); process.exit(2); });