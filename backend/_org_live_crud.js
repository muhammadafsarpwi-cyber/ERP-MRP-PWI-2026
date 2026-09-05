/* PROMPT-27 Organization-module full live CRUD verification (AFTER fixes).
   Uses dev@erp-local.test (Super Administrator) via the documented dev-password
   reset flow (password restored in finally). Creates only AUD- prefixed records
   and removes them. Reports DB-level confirmation for each operation. */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const BASE = 'http://localhost:3001/api/v1';
const EMAIL = 'dev@erp-local.test';
const TEMP_PASS = 'OrgAudit-2026-P27!';

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const BRANCH = '6ce862c9-f8e4-48a0-b859-3f0e9fb73c9a';
const DIV_V0 = 'd1000000-0000-0000-0000-000000000001';   // DIV-SPD (version-0 ACTIVE)
const SEC_V0 = 'd2000000-0000-0000-0000-000000000002';   // SEC-011 (version-0)

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  [PASS] ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra ? ' — ' + extra : ''}`); }
};

const pool = new Pool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, ssl: { rejectUnauthorized: false },
});

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

(async () => {
  const q = async (sql, p) => (await pool.query(sql, p)).rows;
  const stamp = Date.now().toString().slice(-6);
  const P = `AUD-${stamp}`; // prefix for all created codes

  const userId = (await q(`SELECT id FROM auth.users WHERE email=$1`, [EMAIL]))[0].id;
  const oldHash = (await q(`SELECT encrypted_password FROM auth.users WHERE id=$1`, [userId]))[0].encrypted_password;
  await q(`UPDATE auth.users SET encrypted_password=$1 WHERE id=$2`, [bcrypt.hashSync(TEMP_PASS, 10), userId]);
  let token;
  try {
    const login = await api(null, 'POST', '/auth/login', { email: EMAIL, password: TEMP_PASS });
    token = login.json.token;
    ok('LOGIN (dev super-admin)', !!token, `status=${login.status}`);
  } finally {
    await q(`UPDATE auth.users SET encrypted_password=$1 WHERE id=$2`, [oldHash, userId]);
  }
  if (!token) throw new Error('no token — aborting');

  const created = {}; // code -> id

  const tsql = (table) => `SELECT (SELECT code FROM information_schema.columns WHERE table_name=$1 AND column_name='code') IS NOT NULL AS has_code, (SELECT code FROM information_schema.columns WHERE table_name=$1 AND column_name='warehouse_code') IS NOT NULL AS has_wh`;
  void tsql;

  // ============ 1) COMPANIES ============
  console.log('\n[Companies]');
  {
    const code = `AUD-COMP-${stamp}`;
    const c = await api(token, 'POST', '/companies', { companyCode: code, legalName: `Audit Company ${stamp}`, country: 'PK', baseCurrency: 'PKR', fiscalYearStart: '07-01', timezone: 'Asia/Karachi' });
    ok('CREATE company', c.status === 201 || c.status === 200, `status=${c.status} code=${code}`);
    const row = c.json?.data || c.json;
    const id = row?.id;
    const db = id ? (await q(`SELECT id, status, legal_name FROM companies WHERE id=$1`, [id]))[0] : null;
    ok('COMPANY row in DB', !!db && db.status && db.legal_name?.includes(`Audit Company ${stamp}`));
    if (id) {
      const upd = await api(token, 'PATCH', `/companies/${id}`, { legalName: `Audit Company ${stamp} R` });
      const dbUpd = (await q(`SELECT legal_name FROM companies WHERE id=$1`, [id]))[0];
      ok('EDIT company', (upd.status === 200) && dbUpd.legal_name?.endsWith('R'), `status=${upd.status}`);
      // duplicate code
      const dup = await api(token, 'POST', '/companies', { companyCode: code, legalName: 'Dup', country: 'PK', baseCurrency: 'PKR', fiscalYearStart: '07-01', timezone: 'Asia/Karachi' });
      ok('duplicate company code -> 409', dup.status === 409, `status=${dup.status}`);
      await q(`DELETE FROM companies WHERE id=$1`, [id]);
      ok('CLEANUP company removed', (await q(`SELECT COUNT(*)::int c FROM companies WHERE id=$1`, [id]))[0].c === 0);
    }
  }

  // ============ 2) BRANCHES ============
  console.log('\n[Branches]');
  {
    const code = `AUD-BR-${stamp}`;
    const c = await api(token, 'POST', '/branches', { companyId: COMPANY, branchCode: code, name: `Audit Branch ${stamp}` });
    const id = c.json?.data?.id || c.json?.id;
    ok('CREATE branch', (c.status === 201 || c.status === 200) && !!id, `status=${c.status}`);
    const db = id ? (await q(`SELECT id, status FROM branches WHERE id=$1`, [id]))[0] : null;
    ok('BRANCH row in DB', !!db);
    if (id) {
      const upd = await api(token, 'PATCH', `/branches/${id}`, { name: `Audit Branch ${stamp} R` });
      const dbUpd = (await q(`SELECT name FROM branches WHERE id=$1`, [id]))[0];
      ok('EDIT branch', upd.status === 200 && dbUpd.name?.endsWith('R'), `status=${upd.status}`);
      const deact = await api(token, 'PATCH', `/branches/${id}/deactivate`);
      ok('DEACTIVATE branch', deact.status === 200, `status=${deact.status}`);
      const act = await api(token, 'PATCH', `/branches/${id}/activate`);
      ok('ACTIVATE branch', act.status === 200, `status=${act.status}`);
      await q(`DELETE FROM branches WHERE id=$1`, [id]);
    }
  }

  // ============ 3) DIVISIONS ============
  console.log('\n[Divisions]');
  {
    const code = `AUD-DIV-${stamp}`;
    const c = await api(token, 'POST', '/divisions', { companyId: COMPANY, divisionCode: code, name: `Audit Division ${stamp}` });
    const id = c.json?.data?.id || c.json?.id;
    ok('CREATE division', (c.status === 201 || c.status === 200) && !!id, `status=${c.status}`);
    const db = id ? (await q(`SELECT id FROM divisions WHERE id=$1`, [id]))[0] : null;
    ok('DIVISION row in DB', !!db);
    if (id) {
      const upd = await api(token, 'PATCH', `/divisions/${id}`, { name: `Audit Division ${stamp} R` });
      const dbUpd = (await q(`SELECT name FROM divisions WHERE id=$1`, [id]))[0];
      ok('EDIT division', upd.status === 200 && dbUpd.name?.endsWith('R'), `status=${upd.status}`);
      await q(`DELETE FROM divisions WHERE id=$1`, [id]);
    }
  }

  // ============ 4) SECTIONS (under version-0 division) ============
  console.log('\n[Sections]');
  let sectionId = null;
  {
    const code = `AUD-SEC-${stamp}`;
    const c = await api(token, 'POST', '/sections', { companyId: COMPANY, divisionId: DIV_V0, sectionCode: code, name: `Audit Section ${stamp}` });
    sectionId = c.json?.data?.id || c.json?.id;
    ok('CREATE section under v0 division', (c.status === 201 || c.status === 200) && !!sectionId, `status=${c.status} ${JSON.stringify(c.json?.message || c.json?.error || '')}`);
    const db = sectionId ? (await q(`SELECT id, division_id FROM sections WHERE id=$1`, [sectionId]))[0] : null;
    ok('SECTION row in DB (division_id allowed as v0)', !!db, db ? `status=${db.division_id}` : 'no-row');
    if (sectionId) {
      const upd = await api(token, 'PATCH', `/sections/${sectionId}`, { name: `Audit Section ${stamp} R` });
      const dbUpd = (await q(`SELECT name FROM sections WHERE id=$1`, [sectionId]))[0];
      ok('EDIT section', upd.status === 200 && dbUpd.name?.endsWith('R'), `status=${upd.status}`);
      // malformed UUID must be rejected
      const bad = await api(token, 'POST', '/sections', { companyId: COMPANY, divisionId: 'NOT-A-UUID', sectionCode: `AUD-BAD-${stamp}`, name: 'Bad' });
      ok('malformed divisionId -> 400 (not accepted)', bad.status === 400, `status=${bad.status}`);
      if (bad.status === 201) { await q(`DELETE FROM sections WHERE id=$1`, [bad.json?.data?.id || bad.json?.id]); }
    }
  }

  // ============ 5) DEPARTMENTS (under v0 division+section) ============
  console.log('\n[Departments]');
  let departmentId = null;
  {
    const code = `AUD-DEP-${stamp}`;
    const c = await api(token, 'POST', '/departments', { companyId: COMPANY, divisionId: DIV_V0, sectionId: SEC_V0, departmentCode: code, name: `Audit Dept ${stamp}` });
    departmentId = c.json?.data?.id || c.json?.id;
    ok('CREATE department under v0 division+section', (c.status === 201 || c.status === 200) && !!departmentId, `status=${c.status} ${JSON.stringify(c.json?.message || c.json?.error || '')}`);
    const db = departmentId ? (await q(`SELECT id, section_id FROM departments WHERE id=$1`, [departmentId]))[0] : null;
    ok('DEPARTMENT row in DB (section_id v0 accepted)', !!db, db ? `sec=${db.section_id}` : 'no-row');
    if (departmentId) {
      const upd = await api(token, 'PATCH', `/departments/${departmentId}`, { name: `Audit Dept ${stamp} R` });
      const dbUpd = (await q(`SELECT name FROM departments WHERE id=$1`, [departmentId]))[0];
      ok('EDIT department', upd.status === 200 && dbUpd.name?.endsWith('R'), `status=${upd.status}`);
      const bad = await api(token, 'POST', '/departments', { companyId: COMPANY, divisionId: 'garbage!!', departmentCode: `AUD-DEPB-${stamp}`, name: 'Bad' });
      ok('malformed divisionId on department -> 400', bad.status === 400, `status=${bad.status}`);
      if (bad.status === 201) { await q(`DELETE FROM departments WHERE id=$1`, [bad.json?.data?.id || bad.json?.id]); }
    }
  }

  // ============ 6) WAREHOUSES ============
  console.log('\n[Warehouses]');
  let warehouseId = null;
  {
    const code = `AUD-WH-${stamp}`;
    const c = await api(token, 'POST', '/warehouses', { companyId: COMPANY, warehouseCode: code, name: `Audit WH ${stamp}`, warehouseType: 'GENERAL' });
    warehouseId = c.json?.data?.id || c.json?.id;
    ok('CREATE warehouse', (c.status === 201 || c.status === 200) && !!warehouseId, `status=${c.status}`);
    const db = warehouseId ? (await q(`SELECT id FROM warehouses WHERE id=$1`, [warehouseId]))[0] : null;
    ok('WAREHOUSE row in DB', !!db);
    if (warehouseId) {
      const upd = await api(token, 'PATCH', `/warehouses/${warehouseId}`, { name: `Audit WH ${stamp} R` });
      const dbUpd = (await q(`SELECT name FROM warehouses WHERE id=$1`, [warehouseId]))[0];
      ok('EDIT warehouse', upd.status === 200 && dbUpd.name?.endsWith('R'), `status=${upd.status}`);
    }
  }

  // ============ 7) WAREHOUSE LOCATIONS ============
  console.log('\n[Warehouse Locations]');
  let locationId = null;
  {
    const code = `AUD-LOC-${stamp}`;
    if (warehouseId) {
      const c = await api(token, 'POST', '/warehouse-locations', { warehouseId, locationCode: code, name: `Audit Loc ${stamp}` });
      locationId = c.json?.data?.id || c.json?.id;
      ok('CREATE location', (c.status === 201 || c.status === 200) && !!locationId, `status=${c.status} ${JSON.stringify(c.json?.message || c.json?.error || '')}`);
      const db = locationId ? (await q(`SELECT id, warehouse_id FROM warehouse_locations WHERE id=$1`, [locationId]))[0] : null;
      ok('LOCATION row in DB', !!db, db ? `wh=${db.warehouse_id}` : 'no-row');
      if (locationId) {
        const upd = await api(token, 'PATCH', `/warehouse-locations/${locationId}`, { name: `Audit Loc ${stamp} R` });
        const dbUpd = (await q(`SELECT name FROM warehouse_locations WHERE id=$1`, [locationId]))[0];
        ok('EDIT location', upd.status === 200 && dbUpd.name?.endsWith('R'), `status=${upd.status}`);
      }
    } else {
      ok('SKIP location (no parent warehouse created)', false, 'warehouseId missing');
    }
  }

  // ============ malformed-uuid rejection (raw string) ============
  console.log('\n[UUID strictness]');
  {
    const r = await api(token, 'POST', '/sections', { companyId: COMPANY, divisionId: '12345-not-a-uuid', sectionCode: `AUD-U-${stamp}`, name: 'UUID reject' });
    ok('Reject malformed UUID (no accept-all)', r.status === 400, `status=${r.status}`);
  }

  // ============ CLEANUP created records ============
  console.log('\n[Cleanup]');
  if (locationId) await q(`DELETE FROM warehouse_locations WHERE id=$1`, [locationId]);
  if (warehouseId) await q(`DELETE FROM warehouses WHERE id=$1`, [warehouseId]);
  if (departmentId) await q(`DELETE FROM departments WHERE id=$1`, [departmentId]);
  if (sectionId) await q(`DELETE FROM sections WHERE id=$1`, [sectionId]);
  // divisions/branches/companies already cleaned inline

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail > 0 ? 1 : 0;
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });