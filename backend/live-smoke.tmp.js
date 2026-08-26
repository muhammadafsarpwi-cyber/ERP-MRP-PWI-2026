/* PROMPT-11 live API smoke test — run: node live-smoke.tmp.js */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const BASE = 'http://localhost:3001/api/v1';
const EMAIL = 'dev@erp-local.test';
const TEMP_PASS = 'SmokeTest-2026-P11!';
const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
// NP-02 chain + GENERAL shift + KG (verified in PROMPT-10 E2E)
const DIV = 'd1000000-0000-0000-0000-000000000001';
const SEC = 'd2000000-0000-0000-0000-000000000002';
const DEP = 'd3000000-0000-0000-0000-000000000005';
const KG = '52a2a811-b692-497e-9467-10a06b66043b';

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
  return { status: res.status, json };
}

(async () => {
  const q = async (sql, p) => (await pool.query(sql, p)).rows;

  // ── Baseline data-safety counts ──
  const count = async (t) => (await q(`SELECT COUNT(*)::int c FROM ${t}`))[0].c;
  const before = {
    machines: await count('machines'), items: await count('items'), shifts: await count('shifts'),
    uoms: await count('uoms'), targets: await count('machine_targets'), entries: await count('production_entries'),
  };
  console.log('BASELINE:', JSON.stringify(before));

  // ── Login (documented dev-password reset flow) ──
  const userId = (await q(`SELECT id FROM auth.users WHERE email = $1`, [EMAIL]))[0].id;
  const oldHash = (await q(`SELECT encrypted_password FROM auth.users WHERE id = $1`, [userId]))[0].encrypted_password;
  await q(`UPDATE auth.users SET encrypted_password = $1 WHERE id = $2`,
    [bcrypt.hashSync(TEMP_PASS, 10), userId]);
  let token;
  try {
    const login = await api(null, 'POST', '/auth/login', { email: EMAIL, password: TEMP_PASS });
    ok('LOGIN', (login.status === 200 || login.status === 201) && !!login.json.token, `status=${login.status}`);
    token = login.json.token;
  } finally {
    await q(`UPDATE auth.users SET encrypted_password = $1 WHERE id = $2`, [oldHash, userId]);
  }
  if (!token) throw new Error('no token — aborting');

  const me = await api(token, 'GET', '/auth/me');
  ok('GET /auth/me', me.status === 200 && !!me.json.data?.id);

  // ── Masters ──
  const machines = await api(token, 'GET', '/production/machines?search=NP');
  ok('GET machines (search=NP)', machines.status === 200 && machines.json.data.length > 0);
  const machine = machines.json.data.find((m) => m.machineCode === 'NP-02') ?? machines.json.data[0];
  ok('machine NP-02 found', !!machine, machine?.machineCode);

  const shifts = await api(token, 'GET', '/production/shifts');
  ok('GET shifts', shifts.status === 200 && shifts.json.data.length > 0);
  const general = shifts.json.data.find((s) => s.shiftCode === 'GENERAL') ?? shifts.json.data[0];

  const items = await api(token, 'GET', '/master-data/items?limit=500&status=ACTIVE');
  ok('GET items', items.status === 200 && (items.json.data?.length ?? items.json.items?.length ?? 0) > 0,
    `status=${items.status} body=${JSON.stringify(items.json).slice(0, 160)}`);
  const itemList = items.json.data ?? items.json.items ?? [];
  const wire = itemList.find((i) => i.itemCode === 'SAMPLE-WIRE-4.50');
  const nipple = itemList.find((i) => i.itemCode === 'SAMPLE-NIPPLE');
  ok('items WIRE+NIPPLE present', !!wire && !!nipple);

  const uoms = await api(token, 'GET', '/master-data/uom');
  ok('GET uoms', uoms.status === 200 && uoms.json.data.length > 0);
  const pcs = uoms.json.data.find((u) => u.code === 'PCS');
  const meter = uoms.json.data.find((u) => u.code === 'M' || u.code === 'METER');

  // ── Target list + filters ──
  const tgAll = await api(token, 'GET', '/production/machine-targets?page=1&limit=5');
  ok('GET machine-targets list', tgAll.status === 200 && typeof tgAll.json.total === 'number', `total=${tgAll.json.total}`);
  const tgItem = await api(token, 'GET', `/production/machine-targets?itemId=${wire.id}`);
  ok('target filter by itemId', tgItem.status === 200);
  const tgSearch = await api(token, 'GET', `/production/machine-targets?search=NP`);
  ok('target search=NP', tgSearch.status === 200);

  // ── Ensure an ACTIVE item-scoped target exists for the resolve tests ──
  const today = new Date().toISOString().slice(0, 10);
  const existingActive = (await q(
    `SELECT id FROM machine_targets WHERE company_id=$1 AND machine_id=$2 AND shift_id=$3 AND item_id=$4 AND uom_id=$5 AND status='ACTIVE' AND is_active=true AND effective_to IS NULL LIMIT 1`,
    [COMPANY, machine.id, general.id, wire.id, KG])).length > 0;
  let tempTargetId = null;
  if (!existingActive) {
    const created = await api(token, 'POST', '/production/machine-targets', {
      divisionId: DIV, sectionId: SEC, departmentId: DEP,
      machineId: machine.id, shiftId: general.id, itemId: wire.id, uomId: KG,
      targetQuantity: 5000, standardHours: 8,
    });
    ok('create ACTIVE item-scoped target', created.status === 201, `status=${created.status} ${JSON.stringify(created.json?.message ?? '')}`);
    tempTargetId = created.json?.data?.id;
  }
  const activeNow = (await q(
    `SELECT id FROM machine_targets WHERE company_id=$1 AND machine_id=$2 AND shift_id=$3 AND item_id=$4 AND status='ACTIVE' AND is_active=true AND effective_to IS NULL LIMIT 1`,
    [COMPANY, machine.id, general.id, wire.id]))[0];

  // ── Resolve preview: enriched response ──
  const res8 = await api(token, 'GET',
    `/production/entries/machine-target?machineId=${machine.id}&shiftId=${general.id}&productionDate=${today}&itemId=${wire.id}&workingHours=8`);
  ok('resolve 8h → status 200', res8.status === 200, res8.status !== 200 ? JSON.stringify(res8.json).slice(0, 200) : '');
  const d8 = res8.json?.data ?? {};
  ok('resolve returns target record id', !!d8.effectiveTargetRecordId);
  ok('resolve returns plannedHours (enrichment)', d8.plannedHours === 8, `plannedHours=${d8.plannedHours}`);
  ok('resolve returns route field', 'route' in d8, `route=${d8.route ? d8.route.routingCode : 'null'}`);
  ok('resolve returns item info with conversions', !!d8.item?.conversions, d8.item ? d8.item.code : '-');
  ok('resolve returns targetPerHour', Math.abs((d8.targetPerHour ?? 0) - 625) < 0.01, `targetPerHour=${d8.targetPerHour}`);
  ok('resolve calculatedTarget 8h = 5000', Math.abs((d8.calculatedTarget ?? 0) - 5000) < 0.01, `calc=${d8.calculatedTarget}`);

  const res6 = await api(token, 'GET',
    `/production/entries/machine-target?machineId=${machine.id}&shiftId=${general.id}&productionDate=${today}&itemId=${wire.id}&workingHours=6`);
  ok('resolve 6h → 3750', res6.status === 200 && Math.abs((res6.json.data.calculatedTarget ?? 0) - 3750) < 0.01, `calc=${res6.json.data?.calculatedTarget}`);
  const res12 = await api(token, 'GET',
    `/production/entries/machine-target?machineId=${machine.id}&shiftId=${general.id}&productionDate=${today}&itemId=${wire.id}&workingHours=12`);
  ok('resolve 12h → 7500', res12.status === 200 && Math.abs((res12.json.data.calculatedTarget ?? 0) - 7500) < 0.01, `calc=${res12.json.data?.calculatedTarget}`);

  // ── Controlled business errors (4xx, never 5xx) ──
  const noTarget = await api(token, 'GET',
    `/production/entries/machine-target?machineId=${machine.id}&shiftId=${general.id}&productionDate=${today}&itemId=${nipple.id}`);
  ok('resolve w/o target for item → controlled error', noTarget.status === 400 || (noTarget.status === 200 && false),
    `status=${noTarget.status} msg=${String(noTarget.json?.message).slice(0, 80)}`);

  const badMachine = await api(token, 'GET',
    `/production/entries/machine-target?machineId=00000000-0000-4000-8000-00000000dead&shiftId=${general.id}&productionDate=${today}`);
  ok('unknown machine → 404 controlled', badMachine.status === 404, `status=${badMachine.status}`);

  // ── Production Entry E2E: auto-target create → duplicate → filters → report → delete ──
  const stamp = Date.now().toString().slice(-6);
  const entryPayload = {
    divisionId: DIV, sectionId: SEC, departmentId: DEP,
    entryDate: today, shiftId: general.id, machineId: machine.id,
    operatorName: `SMOKE-${stamp}`, itemId: wire.id, uomId: KG,
    actualQuantity: 4800, runningHours: 7, downtimeHours: 1, scrapQuantity: 25,
  };
  const createdEntry = await api(token, 'POST', '/production/entries', entryPayload);
  ok('entry create with auto target', createdEntry.status === 201, `status=${createdEntry.status} msg=${JSON.stringify(createdEntry.json?.message).slice(0, 120)}`);
  const e = createdEntry.json?.data;
  ok('entry target auto-filled = 5000 (8h full)', !!e && Number(e.targetQuantity) === 5000, `target=${e?.targetQuantity}`);
  ok('entry achievement = 96%', !!e && Math.abs(Number(e.achievementPercentage) - 96) < 0.01, `ach=${e?.achievementPercentage}`);
  ok('entry efficiency = 87.5% (7/8)', !!e && Math.abs(Number(e.efficiencyPercentage) - 87.5) < 0.01, `eff=${e?.efficiencyPercentage}`);
  ok('entry linked to machine_target_id', !!e?.machineTargetId);

  const dup = await api(token, 'POST', '/production/entries', { ...entryPayload, operatorName: `SMOKE-DUP-${stamp}` });
  ok('duplicate entry blocked (409)', dup.status === 409, `status=${dup.status}`);

  const manualTarget = await api(token, 'POST', '/production/entries',
    { ...entryPayload, operatorName: `X-${stamp}`, targetQuantity: 123 });
  ok('manual target rejected when governed', manualTarget.status === 400 || manualTarget.status === 409, `status=${manualTarget.status}`);

  if (e?.id) {
    const patched = await api(token, 'PUT', `/production/entries/${e.id}`, { actualQuantity: 5000 });
    ok('entry update recalculates achievement=100%', patched.status === 200 && Math.abs(Number(patched.json.data.achievementPercentage) - 100) < 0.01,
      `status=${patched.status} ach=${patched.json.data?.achievementPercentage}`);

    const filtered = await api(token, 'GET',
      `/production/entries?machineId=${machine.id}&uomId=${KG}&search=SMOKE-${stamp}`);
    ok('findAll machineId+uomId+search filters', filtered.status === 200 && filtered.json.total >= 1, `total=${filtered.json.total}`);

    const report = await api(token, 'GET',
      `/production/entries/report?dateFrom=${today}&dateTo=${today}&machineId=${machine.id}&uomId=${KG}`);
    ok('report with machineId+uomId filter', report.status === 200 && report.json.entryCount >= 1, `entries=${report.json.entryCount}`);

    const del = await api(token, 'DELETE', `/production/entries/${e.id}`);
    ok('entry soft-delete', del.status === 200, `status=${del.status}`);
  }

  // ── Cleanup temp target (close it, preserving history convention) ──
  if (!existingActive && activeNow) {
    const closed = await api(token, 'PATCH', `/production/machine-targets/${activeNow.id}/close`, {});
    if (closed.status === 404 || closed.status === 405) {
      // fall back to status change endpoint shape if different
      const alt = await api(token, 'PUT', `/production/machine-targets/${activeNow.id}/status`, { status: 'CLOSED' });
      ok('temp target closed via /status', alt.status === 200 || alt.status === 201, `status=${alt.status}`);
    } else {
      ok('temp target closed via /close', closed.status === 200 || closed.status === 201, `status=${closed.status}`);
    }
  }

  // ── Data safety after ──
  const after = {
    machines: await count('machines'), items: await count('items'), shifts: await count('shifts'),
    uoms: await count('uoms'), targets: await count('machine_targets'), entries: await count('production_entries'),
  };
  console.log('AFTER:', JSON.stringify(after));
  ok('machines preserved', after.machines === before.machines);
  ok('items preserved', after.items === before.items);
  ok('shifts preserved', after.shifts === before.shifts);
  ok('uoms preserved', after.uoms === before.uoms);
  ok('targets preserved (only close, no delete/dupes)', after.targets === before.targets + (tempTargetId && !existingActive ? 1 : 0),
    `${before.targets} → ${after.targets}`);
  ok('entries preserved (soft-deleted row still counted)', after.entries === before.entries + (e?.id ? 1 : 0),
    `${before.entries} → ${after.entries}`);
  const orphans = (await q(
    `SELECT COUNT(*)::int c FROM production_entries pe LEFT JOIN items i ON i.id = pe.item_id LEFT JOIN shifts s ON s.id = pe.shift_id WHERE i.id IS NULL OR s.id IS NULL`))[0].c;
  ok('no orphan entries', orphans === 0, `orphans=${orphans}`);
  const leftover = (await q(
    `SELECT COUNT(*)::int c FROM production_entries WHERE operator_name LIKE 'SMOKE-%' OR operator_name LIKE 'X-%' AND is_active=true`))[0].c;
  ok('no active smoke rows left', leftover === 0, `active smoke rows=${leftover}`);

  console.log(`\nRESULT: PASS=${pass} FAIL=${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(async (err) => {
  console.error('FATAL:', err.message);
  process.exit(2);
}).finally(() => pool.end());
