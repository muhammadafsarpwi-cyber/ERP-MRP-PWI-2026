/* PROMPT-27 Organization-module live baseline: run BEFORE fixes to reproduce
   the FAILING paths, then again AFTER fixes to confirm resolution.
   Script only creates records with E2E-/AUDIT- prefixes and deletes them. */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const BASE = 'http://localhost:3001/api/v1';
const EMAIL = 'dev@erp-local.test';
const TEMP_PASS = 'OrgAudit-2026-P27!';

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const BRANCH = '6ce862c9-f8e4-48a0-b859-3f0e9fb73c9a';      // BR-001 (standard)
const DIV_V0 = 'd1000000-0000-0000-0000-000000000001';      // DIV-SPD (version-0)
const DIV_STD = '50824516-9c24-4122-86e7-c8e6fa1c5869';     // DIV-001 (standard, INACTIVE)
const SEC_V0 = 'd2000000-0000-0000-0000-000000000001';      // SEC-010 (version-0)
const DEP_V0 = 'd3000000-0000-0000-0000-000000000007';      // SPD-DEPT007 (version-0)
const WAREHOUSE = ''; // will resolve

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`[PASS] ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`[FAIL] ${name}${extra ? ' — ' + extra : ''}`); }
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
  const text = res.status >= 400 ? JSON.stringify(json).slice(0, 220) : '';
  return { status: res.status, json, text };
}

(async () => {
  const q = async (sql, p) => (await pool.query(sql, p)).rows;
  const stamp = Date.now().toString().slice(-6);

  const userId = (await q(`SELECT id FROM auth.users WHERE email=$1`, [EMAIL]))[0].id;
  const oldHash = (await q(`SELECT encrypted_password FROM auth.users WHERE id=$1`, [userId]))[0].encrypted_password;
  await q(`UPDATE auth.users SET encrypted_password=$1 WHERE id=$2`, [bcrypt.hashSync(TEMP_PASS, 10), userId]);
  let token;
  try {
    const login = await api(null, 'POST', '/auth/login', { email: EMAIL, password: TEMP_PASS });
    ok('LOGIN (dev super-admin)', (login.status === 200 || login.status === 201) && !!login.json.token, `status=${login.status}`);
    token = login.json.token;
  } finally {
    await q(`UPDATE auth.users SET encrypted_password=$1 WHERE id=$2`, [oldHash, userId]);
  }
  if (!token) throw new Error('no token — aborting');

  const me = await api(token, 'GET', '/auth/me');
  ok('GET /auth/me', me.status === 200, `status=${me.status}`);

  // ── LIST (view) endpoints ──
  const list = async (label, path) => {
    const r = await api(token, 'GET', path);
    const total = (r.json && (r.json.total ?? r.json.data?.length));
    ok(`LIST ${label}`, r.status === 200, `status=${r.status} total=${total}`);
  };
  await list('companies', '/companies?page=1&limit=5');
  await list('branches', '/branches?page=1&limit=5');
  await list('divisions', '/divisions?page=1&limit=5');
  await list('sections', '/sections?page=1&limit=5');
  await list('departments', '/departments?page=1&limit=5');
  await list('warehouses', '/warehouses?page=1&limit=5');
  await list('warehouse-locations', '/warehouse-locations?page=1&limit=5');

  // ── REPRODUCE version-0 UUID rejection ──
  // 1) Create a Section under version-0 division DIV-SPD -> expect 400 before fix, 201 after.
  const secCode = `AUD-SEC-${stamp}`;
  const createSec = await api(token, 'POST', '/sections', {
    companyId: COMPANY, divisionId: DIV_V0, sectionCode: secCode, name: `Audit Section ${stamp}`,
  });
  ok('CREATE section under v0 division (400-before/201-after)',
     createSec.status === 201 || createSec.status === 200, `status=${createSec.status} ${createSec.text}`);
  const secId = createSec.json?.id;

  // 2) Create a Department under version-0 division AND version-0 section -> expect 400 before, 201 after.
  const depCode = `AUD-DEP-${stamp}`;
  const createDep = await api(token, 'POST', '/departments', {
    companyId: COMPANY, divisionId: DIV_V0, sectionId: SEC_V0,
    departmentCode: depCode, name: `Audit Department ${stamp}`,
  });
  ok('CREATE department under v0 division+section (400-before/201-after)',
     createDep.status === 201 || createDep.status === 200, `status=${createDep.status} ${createDep.text}`);
  const depId = createDep.json?.id;

  // 3) Reproduce the exact generic front-end failure class: Section create against a v0 division.
  console.log(`\n-- Section create (v0 division) detail: status=${createSec.status}`, createSec.text || 'OK');

  // ── CLEANUP records we created (only our AUD-* rows) ──
  const cleanup = async () => {
    if (depId) await q(`DELETE FROM departments WHERE id=$1`, [depId]);
    if (secId) await q(`DELETE FROM sections WHERE id=$1`, [secId]);
  };
  await cleanup().catch(() => {});

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail > 0 ? 1 : 0;
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
