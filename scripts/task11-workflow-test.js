/* TASK 11 — Live Store Material Request full business workflow test with SoD.
 *
 * Run from repo root:
 *   node scripts/task11-workflow-test.js
 *
 * Prerequisites: backend on :3001, test users provisioned (store.manager.qa, store.gm.qa),
 * real store/item/uom rows exist (CCD-RM-STORE / RM-WIRE-002).
 *
 * Walk-through:
 *   1. creator (dev) creates MR
 *   2. creator tries to approve own request  -> SoD rejection
 *   3. creator submits
 *   4. GM (no store.request.approve) tries to approve -> 403 permission rejection
 *   5. manager approves (real approver)
 *   6. manager (no store.request.gm_approve) tries to GM approve -> 403
 *   7. creator (has gm_approve) tries to GM approve own request -> SoD rejection
 *   8. GM approves -> APPROVED + gmApprovedAt
 *   9. manager (has store.request.convert) converts to PR -> FULLY_CONVERTED
 *
 * Second MR for PARTIAL conversion -> re-conversion:
 *   A. create + submit + manager approve + gm approve
 *   B. convert with lineQuantities of 50% -> PARTIALLY_CONVERTED
 *   C. convert remaining -> FULLY_CONVERTED (re-conversion unique PR)
 *
 * Also exercises ETA update + acknowledge.
 *
 * Test data uses E2E- prefixed request numbers so it is clearly test-originated.
 */
const BASE = 'http://localhost:3001/api/v1';

const USERS = {
  creator: { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' },
  manager: { email: 'store.manager.qa@erp-local.test', password: 'Manager#2026Qa1' },
  gm: { email: 'store.gm.qa@erp-local.test', password: 'GmQa#2026Test1' },
};

// Real rows from the live database (verified 2026-09-10 via API)
const STORE_ID = '3b6b5628-859c-4df0-aab7-a69fd953bdd7'; // CCD-RM-STORE (default)
const ITEM_ID = '1c53e9a9-b020-4d3a-bcd4-67ab8b50ef6f';   // RM-WIRE-002
const UOM_ID = '52a2a811-b692-497e-9467-10a06b66043b';    // KG
const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';

let pass = 0, fail = 0;
const failures = [];
const trace = [];
const expect = (cond, name, extra) => {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name + (extra ? ' (' + extra + ')' : '')); }
  trace.push({ name, pass: cond, extra: extra || '' });
};

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  return { status: r.status, json };
}

async function login(user) {
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  for (let attempt = 1; attempt <= 6; attempt++) {
    const r = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    if (r.status === 200 || r.status === 201) return r.json.token;
    if (r.status === 429) {
      await sleep(attempt * 2500);
      continue;
    }
    throw new Error('login failed for ' + user.email + ' status=' + r.status);
  }
  throw new Error('login failed for ' + user.email + ' after retries (rate limited)');
}

(async () => {
  console.log('== Login (3 distinct users) ==');
  const creatorToken = await login(USERS.creator);
  const managerToken = await login(USERS.manager);
  const gmToken = await login(USERS.gm);
  const AUTH = {
    creator: { Authorization: 'Bearer ' + creatorToken },
    manager: { Authorization: 'Bearer ' + managerToken },
    gm: { Authorization: 'Bearer ' + gmToken },
  };
  expect(true, 'all three users authenticated');

  const now = new Date();
  const serial = now.toISOString().replace(/[-:T.z]/g, '').slice(0, 14);
  const mark = 'E2E-' + serial;

  console.log('\n== MR-1: full SoD-gated workflow ==');
  // 1. create
  const create1 = await api('/store/material-requests', {
    method: 'POST',
    headers: AUTH.creator,
    body: JSON.stringify({
      requestNumber: mark + '-MR1',
      requestDate: now.toISOString().slice(0, 10),
      requiredDate: '2026-10-01',
      storeId: STORE_ID,
      purpose: 'TASK11 full workflow',
      remarks: 'Created by creator (dev)',
      lines: [{ itemId: ITEM_ID, requestedQuantity: 200, uomId: UOM_ID }],
    }),
  });
  expect(create1.status === 201 || create1.status === 200, 'creator creates MR-1', 'status=' + create1.status);
  const mr1 = (create1.json && (create1.json.data || create1.json)) || {};
  const mr1Id = mr1.id;
  expect(!!mr1Id, 'MR-1 has id', mr1Id || 'MISSING');
  expect(mr1.status === 'DRAFT', 'MR-1 starts DRAFT', mr1.status);
  expect(mr1.createdBy === USERS.creator.email || !!mr1.createdBy, 'MR-1 records creator', mr1.createdBy);
  trace.push({ name: 'MR-1 id', pass: true, extra: mr1Id });
  console.log('    MR-1 id=' + mr1Id);

  // 2. submit as creator (must be before approval trials)
  const submit1 = await api(`/store/material-requests/${mr1Id}/submit`, {
    method: 'POST', headers: AUTH.creator, body: JSON.stringify({}),
  });
  expect(submit1.status === 200 || submit1.status === 201, 'creator submits MR-1', 'status=' + submit1.status);
  expect((submit1.json && (submit1.json.data || submit1.json).status) === 'SUBMITTED', 'MR-1 is SUBMITTED',
    (submit1.json && (submit1.json.data || submit1.json).status));

  // 2b. SoD: creator (has approve perm) tries to approve own request -> status check now passes, SoD fires
  const selfApprove = await api(`/store/material-requests/${mr1Id}/approve`, {
    method: 'POST', headers: AUTH.creator, body: JSON.stringify({}),
  });
  expect(selfApprove.status === 400 && /segregation|own request/i.test(JSON.stringify(selfApprove.json)),
    'SoD: creator cannot approve own request',
    'status=' + selfApprove.status + ' msg=' + JSON.stringify(selfApprove.json && selfApprove.json.message).slice(0, 120));

  // 4. GM has no store.request.approve -> 403
  const gmApproveNoPerm = await api(`/store/material-requests/${mr1Id}/approve`, {
    method: 'POST', headers: AUTH.gm, body: JSON.stringify({}),
  });
  expect(gmApproveNoPerm.status === 403, 'GM lacks approve permission (403)',
    'status=' + gmApproveNoPerm.status + ' msg=' + JSON.stringify(gmApproveNoPerm.json && gmApproveNoPerm.json.message).slice(0, 100));

  // 5. manager approves
  const approve1 = await api(`/store/material-requests/${mr1Id}/approve`, {
    method: 'POST', headers: AUTH.manager, body: JSON.stringify({}),
  });
  expect(approve1.status === 200 || approve1.status === 201, 'manager approves MR-1', 'status=' + approve1.status);
  const a1 = approve1.json && (approve1.json.data || approve1.json);
  expect(a1.status === 'APPROVED', 'MR-1 APPROVED after manager', a1.status);
  expect(!!a1.approvedBy && !!a1.approvedAt, 'MR-1 records approvedBy + approvedAt',
    'approvedBy=' + a1.approvedBy + ' at=' + a1.approvedAt);

  // 6. manager has no gm_approve permission -> 403
  const mgrGmNoPerm = await api(`/store/material-requests/${mr1Id}/gm-approve`, {
    method: 'POST', headers: AUTH.manager, body: JSON.stringify({}),
  });
  expect(mgrGmNoPerm.status === 403, 'manager lacks gm_approve permission (403)',
    'status=' + mgrGmNoPerm.status + ' msg=' + JSON.stringify(mgrGmNoPerm.json && mgrGmNoPerm.json.message).slice(0, 100));

  // 7. SoD: creator (who HAS gm_approve via SUPER_ADMIN) tries GM-approve own request
  const selfGm = await api(`/store/material-requests/${mr1Id}/gm-approve`, {
    method: 'POST', headers: AUTH.creator, body: JSON.stringify({}),
  });
  expect(selfGm.status === 400 && /segregation|own request/i.test(JSON.stringify(selfGm.json)),
    'SoD: creator cannot GM-approve own request',
    'status=' + selfGm.status + ' msg=' + JSON.stringify(selfGm.json && selfGm.json.message).slice(0, 120));

  // 8. GM approves
  const gmApprove1 = await api(`/store/material-requests/${mr1Id}/gm-approve`, {
    method: 'POST', headers: AUTH.gm, body: JSON.stringify({}),
  });
  expect(gmApprove1.status === 200 || gmApprove1.status === 201, 'GM approves MR-1', 'status=' + gmApprove1.status);
  const g1 = gmApprove1.json && (gmApprove1.json.data || gmApprove1.json);
  expect(g1.status === 'APPROVED' && !!g1.gmApprovedBy && !!g1.gmApprovedAt,
    'MR-1 records gmApprovedBy + gmApprovedAt',
    'gmb=' + g1.gmApprovedBy + ' at=' + g1.gmApprovedAt);

  // 8b. convert before receiving? manager has store.request.convert
  const convert1 = await api(`/store/material-requests/${mr1Id}/convert-pr`, {
    method: 'POST', headers: AUTH.manager, body: JSON.stringify({}),
  });
  expect(convert1.status === 200 || convert1.status === 201, 'manager converts MR-1 to PR', 'status=' + convert1.status);
  const c1 = convert1.json && (convert1.json.data || convert1.json);
  expect(c1.status === 'FULLY_CONVERTED', 'MR-1 FULLY_CONVERTED', c1.status);
  expect(!!c1.prId && !!c1.prNumber, 'MR-1 carries PR reference', 'prId=' + c1.prId + ' prNumber=' + c1.prNumber);
  console.log('    MR-1 PR: ' + c1.prNumber + ' (' + c1.prId + ')');

  // verify timeline
  const timeline1 = await api(`/store/material-requests/${mr1Id}/timeline`, { method: 'GET', headers: AUTH.creator });
  expect(timeline1.status === 200 && Array.isArray(timeline1.json), 'MR-1 timeline retrievable', 'status=' + timeline1.status);
  const tCount = Array.isArray(timeline1.json) ? timeline1.json.length : 0;
  expect(tCount >= 4, 'MR-1 timeline has >=4 events (create/submit/approve/gm/convert/eta)', 'events=' + tCount);

  console.log('\n== MR-2: PARTIAL conversion then re-conversion ==');
  const create2 = await api('/store/material-requests', {
    method: 'POST',
    headers: AUTH.creator,
    body: JSON.stringify({
      requestNumber: mark + '-MR2',
      requestDate: now.toISOString().slice(0, 10),
      requiredDate: '2026-10-05',
      storeId: STORE_ID,
      purpose: 'TASK11 partial conversion',
      remarks: 'Created by creator (dev)',
      lines: [{ itemId: ITEM_ID, requestedQuantity: 300, uomId: UOM_ID }],
    }),
  });
  const mr2 = (create2.json && (create2.json.data || create2.json)) || {};
  const mr2Id = mr2.id;
  expect(!!mr2Id, 'MR-2 created', mr2Id || 'MISSING');
  console.log('    MR-2 id=' + mr2Id);

  const s2 = await api(`/store/material-requests/${mr2Id}/submit`, { method: 'POST', headers: AUTH.creator, body: JSON.stringify({}) });
  const a2 = await api(`/store/material-requests/${mr2Id}/approve`, { method: 'POST', headers: AUTH.manager, body: JSON.stringify({}) });
  const g2 = await api(`/store/material-requests/${mr2Id}/gm-approve`, { method: 'POST', headers: AUTH.gm, body: JSON.stringify({}) });
  expect(s2.status === 200 && a2.status === 200 && g2.status === 200, 'MR-2 submitted + manager + GM approved',
    's=' + s2.status + ' a=' + a2.status + ' g=' + g2.status);

  // A. convert 50% (150 of 300) -> PARTIALLY_CONVERTED
  const lineId2 = (g2.json && (g2.json.data || g2.json).lines && (g2.json.data || g2.json).lines[0] && (g2.json.data || g2.json).lines[0].id) ||
    (a2.json && (a2.json.data || a2.json).lines && (a2.json.data || a2.json).lines[0] && (a2.json.data || a2.json).lines[0].id);
  console.log('    MR-2 line id=' + lineId2);
  const pconv = await api(`/store/material-requests/${mr2Id}/convert-pr`, {
    method: 'POST',
    headers: AUTH.manager,
    body: JSON.stringify({ lineQuantities: [{ lineId: lineId2, quantity: 150 }] }),
  });
  expect(pconv.status === 200 || pconv.status === 201, 'partial convert (150/300) accepted', 'status=' + pconv.status);
  const pc = pconv.json && (pconv.json.data || pconv.json);
  expect(pc.status === 'PARTIALLY_CONVERTED', 'MR-2 PARTIALLY_CONVERTED', pc.status);
  expect(!!pc.prId && !!pc.prNumber, 'MR-2 has first PR', pc.prNumber);
  const firstPr = pc.prNumber;
  console.log('    MR-2 first PR: ' + pc.prNumber);

  // B. re-convert the remaining 150 -> FULLY_CONVERTED with NEW unique PR code
  const rconv = await api(`/store/material-requests/${mr2Id}/convert-pr`, {
    method: 'POST',
    headers: AUTH.manager,
    body: JSON.stringify({ lineQuantities: [{ lineId: lineId2, quantity: 150 }] }),
  });
  expect(rconv.status === 200 || rconv.status === 201, 're-conversion of remaining 150 accepted', 'status=' + rconv.status);
  const rc = rconv.json && (rconv.json.data || rconv.json);
  expect(rc.status === 'FULLY_CONVERTED', 'MR-2 FULLY_CONVERTED after re-convert', rc.status);
  expect(!!rc.prId && !!rc.prNumber && rc.prNumber !== firstPr, 're-conversion produced NEW distinct PR code',
    rc.prNumber + ' (first was ' + firstPr + ')');
  console.log('    MR-2 final PR: ' + rc.prNumber);

  console.log('\n== MR-3: ETA update + acknowledge ==');
  const create3 = await api('/store/material-requests', {
    method: 'POST',
    headers: AUTH.creator,
    body: JSON.stringify({
      requestNumber: mark + '-MR3',
      requestDate: now.toISOString().slice(0, 10),
      requiredDate: '2026-10-10',
      storeId: STORE_ID,
      purpose: 'TASK11 ETA check',
      lines: [{ itemId: ITEM_ID, requestedQuantity: 100, uomId: UOM_ID }],
    }),
  });
  const mr3 = (create3.json && (create3.json.data || create3.json)) || {};
  const mr3Id = mr3.id;
  expect(!!mr3Id, 'MR-3 created', mr3Id || 'MISSING');
  console.log('    MR-3 id=' + mr3Id);

  const etaGet = await api(`/store/material-requests/${mr3Id}/eta`, { method: 'GET', headers: AUTH.creator });
  expect(etaGet.status === 200, 'MB-3 ETA row retrievable (create default)', 'status=' + etaGet.status);

  const etaSet = await api(`/store/material-requests/${mr3Id}/eta`, {
    method: 'POST',
    headers: AUTH.manager,
    body: JSON.stringify({ expectedDeliveryDate: '2026-11-15', supplierConfirmedDate: '2026-11-01' }),
  });
  expect(etaSet.status === 200 || etaSet.status === 201, 'manager updates ETA', 'status=' + etaSet.status + ' msg=' + JSON.stringify(etaSet.json && etaSet.json.message).slice(0, 120));

  const ack = await api(`/store/material-requests/${mr3Id}/acknowledge`, {
    method: 'POST', headers: AUTH.manager, body: JSON.stringify({}),
  });
  expect(ack.status === 200 || ack.status === 201, 'manager acknowledges MR-3', 'status=' + ack.status);

  console.log('\nTOTALS: pass=' + pass + ' fail=' + fail);
  if (fail) console.log('FAILURES: ' + failures.join('; '));

  const fs = require('fs');
  fs.writeFileSync('C:\\Users\\afsar\\AppData\\Local\\Temp\\opencode\\task11-workflow-results.json', JSON.stringify({ pass, fail, failures, trace, mrsCreated: { mr1: mr1Id, mr2: mr2Id, mr3: mr3Id }, recordId: mark }, null, 2));
  console.log('trace saved');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL: ' + e.stack || e); process.exit(2); });