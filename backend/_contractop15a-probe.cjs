'use strict';
/* Task15-A runtime contract probe — verifies:
 *   1) POST /production/routings/:id/operations WITH companyId     -> 400 "companyId should not exist"
 *   2) POST .../operations WITHOUT companyId                        -> 201 (server derives companyId from org scope)
 *   3) PUT  /production/routings/operations/:id WITH companyId      -> 400
 *   4) PUT  .../operations/:id WITHOUT companyId                    -> 200
 *   5) Routing create with inline op carrying companyId             -> 400 (nested contract also enforced)
 * Run from backend/: node _contractop15a-probe.cjs  (backend must be up on :3001)
 */
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

const cleanRouting = async (schema, rid) => {
  if (!rid) return;
  const ops = await pool.query(`SELECT id FROM "${schema}".routing_operations WHERE routing_id=$1`, [rid]);
  for (const o of ops.rows) {
    await pool.query(`DELETE FROM "${schema}".routing_operation_outputs WHERE routing_operation_id=$1`, [o.id]);
    await pool.query(`DELETE FROM "${schema}".routing_operation_inputs WHERE routing_operation_id=$1`, [o.id]);
    await pool.query(`DELETE FROM "${schema}".routing_operations WHERE id=$1`, [o.id]);
  }
  await pool.query(`DELETE FROM "${schema}".production_routings WHERE id=$1`, [rid]);
};

async function run() {
  const schema = process.env.DB_SCHEMA || 'public';

  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  const token = login.json.token;
  check('login returns token (status ' + login.status + ')', !!token && login.status === 201, JSON.stringify(login.json).slice(0, 160));
  if (!token) return;

  // Reference data
  const rtList = await api('GET', '/master-data/route-types', null, token);
  const rts = Array.isArray(rtList.json.data) ? rtList.json.data : [];
  const ccdRtId = (rts.find(r => r.routeCode === 'CCD') || {}).id;

  const itemQ = await pool.query(`SELECT i.item_code AS code, i.id, i.base_uom_id AS uom_id FROM "${schema}".items i WHERE i.item_code IN ('RM-WIRE-001','WIP-FLAT-001','FG-CASING-001')`);
  const byCode = {}; itemQ.rows.forEach(r => byCode[r.code] = r);
  const rmWire = byCode['RM-WIRE-001'], fg = byCode['FG-CASING-001'];
  check('demo items present (RM-WIRE / FG-CASING)', !!(rmWire && fg), JSON.stringify(byCode));

  let createdRid = null, createdOpId = null;
  if (rmWire && fg && ccdRtId) {
    const rtgCode = 'S15A' + Date.now().toString().slice(-6);
    const createBody = {
      routingCode: rtgCode, name: 'Task15-A Contract Probe Routing',
      productId: fg.id, routeTypeId: ccdRtId, baseQuantity: 1, isDefault: false,
      operations: [
        { sequenceNo: 10, operationCode: 'OP-0', operationName: 'Seed Op', machineRequired: false, machineId: null,
          inputs: [{ itemId: rmWire.id, quantity: 1, uomId: rmWire.uom_id, isPrimary: true, lineNumber: 10 }],
          outputs: [{ itemId: fg.id, quantity: 1, uomId: rmWire.uom_id, isPrimary: true, lineNumber: 10 }] },
      ],
    };
    const setUp = await api('POST', '/production/routings', createBody, token);
    const created = setUp.json.data;
    createdRid = created && created.id;
    const seedOp = created && created.operations && created.operations.find(o => o.operationCode === 'OP-0');
    check('setup: DRAFT routing created with 1 seed op', setUp.status === 201 && createdRid && seedOp, JSON.stringify(setUp.json).slice(0, 240));
    if (seedOp && seedOp.id) createdOpId = seedOp.id;

    const validOp = {
      sequenceNo: 20, operationCode: 'OP-CON', operationName: 'Contract Op',
      machineRequired: false, machineId: null,
      inputs: [{ itemId: rmWire.id, quantity: 1, uomId: rmWire.uom_id, isPrimary: true, lineNumber: 10 }],
      outputs: [{ itemId: fg.id, quantity: 1, uomId: rmWire.uom_id, isPrimary: true, lineNumber: 10 }],
    };

    // 1) Add op WITH companyId -> must be rejected by whitelist (CASE-A ruled out).
    const wCompany = await api('POST', `/production/routings/${createdRid}/operations`, { ...validOp, companyId: 'c1000000-0000-4000-8000-000000000001' }, token);
    const wMsg = JSON.stringify(wCompany.json).includes('companyId should not exist');
    check('1. POST op with companyId -> 400 "companyId should not exist"', wCompany.status === 400 && wMsg, JSON.stringify(wCompany.json).slice(0, 240));

    // 2) Add op WITHOUT companyId -> server derives companyId; operation persisted.
    const noCompany = await api('POST', `/production/routings/${createdRid}/operations`, validOp, token);
    const ncOps = (noCompany.json.data && noCompany.json.data.operations) || [];
    const ncOp = ncOps.find(o => o.operationCode === 'OP-CON');
    check('2. POST op without companyId -> 201 and persisted', noCompany.status === 201 && !!ncOp && ncOp.id, JSON.stringify(noCompany.json).slice(0, 240));

    const ncOpId = ncOp && ncOp.id;

    // 3) PUT op WITH companyId -> 400.
    const updW = await api('PUT', `/production/routings/operations/${ncOpId}`, { operationName: 'Contract Op X', companyId: 'c1000000-0000-4000-8000-000000000001' }, token);
    check('3. PUT op with companyId -> 400 "companyId should not exist"', updW.status === 400 && JSON.stringify(updW.json).includes('companyId should not exist'), JSON.stringify(updW.json).slice(0, 240));

    // 4) PUT op WITHOUT companyId -> 200.
    const updN = await api('PUT', `/production/routings/operations/${ncOpId}`, { operationName: 'Contract Op UPDATED' }, token);
    const updAfter = await api('GET', `/production/routings/${createdRid}`, null, token);
    const updOp = ((updAfter.json.data && updAfter.json.data.operations) || []).find(o => o.id === ncOpId);
    check('4. PUT op without companyId -> 200 and applied', updN.status === 200 && updOp && updOp.operationName === 'Contract Op UPDATED', JSON.stringify(updN.json).slice(0, 240));

    // 5) Routing create whose inline op carries companyId -> 400 (same nested contract).
    const nestBody = {
      routingCode: 'S15ANEST' + Date.now().toString().slice(-5), name: 'Nested companyId probe',
      productId: fg.id, routeTypeId: ccdRtId, baseQuantity: 1, isDefault: false,
      operations: [{ sequenceNo: 10, operationCode: 'OP-N', operationName: 'Nested', companyId: 'c1000000-0000-4000-8000-000000000002', inputs: [], outputs: [] }],
    };
    const nest = await api('POST', '/production/routings', nestBody, token);
    check('5. nested inline op with companyId -> 400 (whitelist intact)', nest.status === 400 && JSON.stringify(nest.json).includes('companyId should not exist'), JSON.stringify(nest.json).slice(0, 240));
    if (nest.status === 400) {
      console.log('  info nested probe rejected before insert (no row to clean)');
    } else if (nest.json.data && nest.json.data.id) {
      await cleanRouting(schema, nest.json.data.id);
    }
  } else {
    check('runtime contract probe setup', false, 'SKIPPED - missing refs rm=' + !!rmWire + ' fg=' + !!fg + ' rt=' + !!ccdRtId);
  }

  await cleanRouting(schema, createdRid);

  console.log('\n===== TASK15-A CONTRACT PROBE: ' + passed + ' passed, ' + failed + ' failed =====');
  if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log('  - ' + f)); }
  await pool.end();
  process.exit(failed ? 1 : 0);
}

run().catch(e => { console.error('PROBE ABORT:', e.message); process.exit(2); });