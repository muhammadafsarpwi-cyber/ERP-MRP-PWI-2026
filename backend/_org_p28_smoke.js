/* PROMPT-28 Organization-module live smoke test.
   Focused verification: create + edit (companyId stripped) + negative companyId test + cleanup.
   Uses dev@erp-local.test super-admin via password-reset/restore pattern. */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const BASE = 'http://localhost:3001/api/v1';
const EMAIL = 'dev@erp-local.test';
const TEMP_PASS = 'OrgP28-Smoke-2026!';
const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const DIV_V0  = 'd1000000-0000-0000-0000-000000000001';
const SEC_V0  = 'd2000000-0000-0000-0000-000000000002';

const pool = new Pool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, ssl: { rejectUnauthorized: false },
});

let pass = 0, fail = 0;
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  [PASS] ${label}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  [FAIL] ${label}${extra ? ' — ' + extra : ''}`); }
};
const api = async (tk, method, path, body) => {
  const isGet = method === 'GET' || method === 'HEAD';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
    ...(isGet ? {} : { body: body ? JSON.stringify(body) : undefined }),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

(async () => {
  const q = async (sql, p) => (await pool.query(sql, p)).rows;
  const stamp = '28';
  const ids = {};   // cleanup map: label -> { table, id }

  // ── LOGIN ──
  console.log('\n[Login]');
  const uid  = (await q(`SELECT id FROM auth.users WHERE email=$1`, [EMAIL]))[0].id;
  const oldH = (await q(`SELECT encrypted_password FROM auth.users WHERE id=$1`, [uid]))[0].encrypted_password;
  await q(`UPDATE auth.users SET encrypted_password=$1 WHERE id=$2`, [bcrypt.hashSync(TEMP_PASS, 10), uid]);
  let token;
  try {
    const r = await api(null, 'POST', '/auth/login', { email: EMAIL, password: TEMP_PASS });
    token = r.json?.token;
    ok('login', !!token, `status=${r.status}`);
  } finally {
    await q(`UPDATE auth.users SET encrypted_password=$1 WHERE id=$2`, [oldH, uid]);
  }
  if (!token) throw new Error('no token');

  // ── Gather parent IDs ──
  const branches = (await api(token, 'GET', '/branches', { limit: 1 })).json?.data || [];
  const BRANCH_ID = branches[0]?.id;
  const warehouses = (await api(token, 'GET', '/warehouses', { limit: 1 })).json?.data || [];
  const WH_ID = warehouses[0]?.id;

  // Helper: create, verify, edit-no-companyId, edit-with-companyId(400), delete
  const smokeCrud = async (label, endpoint, createBody, editNoCo, editWithCo, dbTable) => {
    console.log(`\n[${label}]`);

    // ── Create ──
    const c = await api(token, 'POST', endpoint, createBody);
    const id = c.json?.data?.id || c.json?.id;
    ok(`create`, c.status >= 200 && c.status < 300 && !!id, `status=${c.status}`);
    if (id) ids[label] = { table: dbTable, id };

    // ── Verify DB ──
    if (id && dbTable) {
      const row = (await q(`SELECT id FROM ${dbTable} WHERE id=$1`, [id]))[0];
      ok('row in DB', !!row);
    }

    // ── Edit WITHOUT companyId (frontend's new payload) ──
    if (id && editNoCo) {
      const e = await api(token, 'PATCH', `${endpoint}/${id}`, editNoCo);
      ok('edit without companyId', e.status === 200, `status=${e.status}`);
    }

    // ── Edit WITH companyId (should 400 forbidNonWhitelisted) ──
    if (id && editWithCo) {
      const r = await api(token, 'PATCH', `${endpoint}/${id}`, editWithCo);
      ok('edit with companyId rejected (400)', r.status === 400, `status=${r.status}`);
    }
  };

  // ── BRANCH ──
  await smokeCrud(
    'Branch',
    '/branches',
    { companyId: COMPANY, branchCode: `BR-28-${stamp}`, name: `Smoke Branch ${stamp}` },
    { name: `Smoke Branch ${stamp} R` },
    { companyId: COMPANY, name: 'Should Fail' },
    'branches'
  );

  // ── DIVISION ──
  await smokeCrud(
    'Division',
    '/divisions',
    { companyId: COMPANY, divisionCode: `DIV-28-${stamp}`, name: `Smoke Division ${stamp}` },
    { name: `Smoke Division ${stamp} R` },
    { companyId: COMPANY, name: 'Should Fail' },
    'divisions'
  );

  // ── SECTION (under v0 division) ──
  await smokeCrud(
    'Section-v0',
    '/sections',
    { companyId: COMPANY, divisionId: DIV_V0, sectionCode: `SEC-28-${stamp}`, name: `Smoke Section ${stamp}` },
    { divisionId: DIV_V0, name: `Smoke Section ${stamp} R` },
    { companyId: COMPANY, name: 'Should Fail' },
    'sections'
  );

  // ── DEPARTMENT (under v0 division + v0 section) ──
  await smokeCrud(
    'Department-v0',
    '/departments',
    { companyId: COMPANY, divisionId: DIV_V0, sectionId: SEC_V0, departmentCode: `DEP-28-${stamp}`, name: `Smoke Dept ${stamp}` },
    { divisionId: DIV_V0, sectionId: SEC_V0, name: `Smoke Dept ${stamp} R` },
    { companyId: COMPANY, name: 'Should Fail' },
    'departments'
  );

  // ── WAREHOUSE ──
  await smokeCrud(
    'Warehouse',
    '/warehouses',
    { companyId: COMPANY, warehouseCode: `WH-28-${stamp}`, name: `Smoke WH ${stamp}`, warehouseType: 'GENERAL' },
    { name: `Smoke WH ${stamp} R` },
    { companyId: COMPANY, name: 'Should Fail' },
    'warehouses'
  );

  // ── WAREHOUSE LOCATION ──
  if (WH_ID) {
    console.log('\n[Warehouse Location]');
    const lc = `LOC-28-${stamp}`;
    const c = await api(token, 'POST', '/warehouse-locations', { warehouseId: WH_ID, locationCode: lc, name: `Smoke Loc ${stamp}` });
    const id = c.json?.data?.id || c.json?.id;
    ok('create', c.status >= 200 && c.status < 300 && !!id, `status=${c.status}`);
    if (id) { ids['Location'] = { table: 'warehouse_locations', id }; const row = (await q(`SELECT id FROM warehouse_locations WHERE id=$1`, [id]))[0]; ok('row in DB', !!row); }
    if (id) {
      const e = await api(token, 'PATCH', `/warehouse-locations/${id}`, { name: `Smoke Loc ${stamp} R` });
      ok('edit', e.status === 200, `status=${e.status}`);
    }
  }

  // ── BUSINESS UNIT ──
  console.log('\n[Business Unit]');
  const buCode = `BU-28-${stamp}`;
  const buC = await api(token, 'POST', '/business-units', { companyId: COMPANY, code: buCode, name: `Smoke BU ${stamp}` });
  const buId = buC.json?.data?.id || buC.json?.id;
  ok('create', buC.status >= 200 && buC.status < 300 && !!buId, `status=${buC.status}`);
  if (buId) {
    ids['Business Unit'] = { table: 'business_units', id: buId };
    const row = (await q(`SELECT id FROM business_units WHERE id=$1`, [buId]))[0];
    ok('row in DB', !!row);
    // edit without companyId
    const e1 = await api(token, 'PATCH', `/business-units/${buId}`, { name: `Smoke BU ${stamp} R` });
    ok('edit without companyId', e1.status === 200, `status=${e1.status}`);
    // edit WITH companyId → 400
    const e2 = await api(token, 'PATCH', `/business-units/${buId}`, { companyId: COMPANY, name: 'Should Fail' });
    ok('edit with companyId rejected (400)', e2.status === 400, `status=${e2.status}`);
  }

  // ── CLEANUP ──
  console.log('\n[Cleanup]');
  for (const [lbl, { table, id }] of Object.entries(ids)) {
    await q(`DELETE FROM ${table} WHERE id=$1`, [id]);
    const rem = (await q(`SELECT COUNT(*)::int c FROM ${table} WHERE id=$1`, [id]))[0].c;
    ok(`cleanup ${lbl}`, rem === 0);
  }

  // ── VERIFY zero residual AUD-28 across all tables ──
  console.log('\n[Residual AUD-28 check]');
  for (const tbl of ['companies','branches','divisions','sections','departments','warehouses','warehouse_locations','business_units']) {
    const codeCol = { companies:'company_code', branches:'branch_code', divisions:'division_code', sections:'section_code', departments:'department_code', warehouses:'warehouse_code', warehouse_locations:'location_code', business_units:'code' }[tbl];
    const n = (await q(`SELECT COUNT(*)::int c FROM ${tbl} WHERE ${codeCol} ILIKE '%-28-%'`, []))[0].c;
    ok(`zero AUD-28 in ${tbl}`, n === 0, `remaining=${n}`);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail > 0 ? 1 : 0;
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });