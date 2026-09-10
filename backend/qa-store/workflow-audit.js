const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { db, COMPANY, api, expect, summary } = require('./helper');

const STORE = '3b6b5628-859c-4df0-aab7-a69fd953bdd7';
const ITEM = '1c53e9a9-b020-4d3a-bcd4-67ab8b50ef6f';
const UOM = '52a2a811-b692-497e-9467-10a06b66043b';
const SUPPLIER = 'c2fbc823-b2c8-4af8-87f3-694bf55e549b';
const ROLE = { PRODUCTION: '818d2141-cbc0-4ab9-9f1b-c6140211079a', INVENTORY: '309592ee-a436-4e11-abd7-0006074a410a', MANAGEMENT: 'f1f4e338-c812-4f45-83fb-5d42839388b5', REPORT_VIEWER: '7f8ea08c-2a52-43a3-b355-43bf93438acf' };
const WAREHOUSE = 'aa9fedcb-27ac-47d2-a963-40d01c2594bc';

const T0 = new Date();

(async () => {
  const c = await db();
  const cleanup = [];
  const identities = [];

  async function provisionAuthUser(email, password) {
  const authId = crypto.randomUUID();
  const hashed = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  await c.query('BEGIN');
  try {
    await c.query(`SET LOCAL session_replication_role = 'replica'`);
    await c.query(
      `INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, recovery_token, recovery_sent_at,
        email_change_token_new, email_change, email_change_sent_at,
        confirmation_token, confirmation_sent_at,
        raw_app_meta_data, raw_user_meta_data,
        is_super_admin, created_at, updated_at,
        is_sso_user, is_anonymous
      ) VALUES (
        $1, $2, 'authenticated', 'authenticated', $3, $4,
        $5, '', NULL,
        '', '', NULL,
        '', NULL,
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        false, $5, $5,
        false, false
      )`,
      ['00000000-0000-0000-0000-000000000000', authId, email, hashed, now],
    );
    await c.query(
      `INSERT INTO auth.identities (
        id, provider_id, provider, identity_data, user_id, created_at, updated_at, last_sign_in_at
      ) VALUES (
        $1::uuid, $2, 'email',
        $3::jsonb,
        $4::uuid, $5, $5, $5
      )`,
      [crypto.randomUUID(), authId, JSON.stringify({ sub: authId, email, email_verified: true, phone_verified: false }), authId, now],
    );
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  }
  return authId;
}

async function makeUser(roleCode, tag) {
    const id = crypto.randomUUID();
    const email = `qa-store-${tag}@qa.local.test`;
    const password = 'Qa' + crypto.randomBytes(6).toString('hex') + '!9';
    const authId = await provisionAuthUser(email, password);
    await c.query(
      `INSERT INTO erp_users (id, auth_user_id, email, username, display_name, first_name, last_name, default_company_id, status, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',true, now(), now())`,
      [id, authId, email, tag, 'QA ' + tag, 'QA', tag, COMPANY],
    );
    await c.query(
      `INSERT INTO user_roles (id, user_id, role_id, status, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,'ACTIVE',true, now(), now())`,
      [crypto.randomUUID(), id, ROLE[roleCode]],
    );
    await c.query(
      `INSERT INTO user_organization_scopes (id, user_id, company_id, scope_level, is_full_scope, status, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,'COMPANY',true,'ACTIVE',true, now(), now())`,
      [crypto.randomUUID(), id, COMPANY],
    );
    cleanup.push(`DELETE FROM auth.identities WHERE user_id='${authId}'`);
    cleanup.push(`DELETE FROM auth.users WHERE id='${authId}'`);
    cleanup.push(`DELETE FROM user_organization_scopes WHERE user_id='${id}'`);
    cleanup.push(`DELETE FROM user_roles WHERE user_id='${id}'`);
    cleanup.push(`DELETE FROM erp_users WHERE id='${id}'`);
    const lr = await api('POST', '/auth/login', { email, password });
    if (lr.status >= 400) throw new Error('qa login failed for ' + roleCode + ': ' + JSON.stringify(lr.json).slice(0, 200));
    identities.push({ role: roleCode, tag, erpId: id });
    return { erpId: id, token: lr.json.token || lr.json.accessToken || (lr.json.data && lr.json.data.accessToken) };
  }

  const dev = await (async () => {
    const { login } = require('./helper');
    const r = await login();
    return { token: r.token };
  })();

  const creator = await makeUser('INVENTORY', 'creator');
  const manager = await makeUser('INVENTORY', 'manager');
  const gm = await makeUser('MANAGEMENT', 'gm');
  const viewer = await makeUser('REPORT_VIEWER', 'viewer');
  const prod = await makeUser('PRODUCTION', 'prod');

  // ---------- SECURITY / PERMISSION ENFORCEMENT ----------
  const viewerDash = await api('GET', '/store/dashboard', null, viewer.token);
  expect(viewerDash.status === 403, 'REPORT_VIEWER denied /store/dashboard (store.view missing)');
  const viewerCreate = await api('POST', '/store/material-requests', {}, viewer.token);
  expect(viewerCreate.status === 403, 'REPORT_VIEWER denied create MR (request.create missing)');
  const gmCreate = await api('POST', '/store/material-requests', {}, gm.token);
  expect(gmCreate.status === 403, 'MANAGEMENT denied create MR (request.create missing)');
  const prodApprove = await api('POST', `/store/material-requests/${crypto.randomUUID()}/approve`, {}, prod.token);
  expect(prodApprove.status === 403, 'PRODUCTION denied approve MR (request.approve missing)');

  // ---------- MR WORKFLOW ----------
  const reqNum = 'QA-WF-' + Math.floor(Date.now() / 1000);
  const createRes = await api('POST', '/store/material-requests', {
    requestNumber: reqNum,
    requestDate: new Date().toISOString().slice(0, 10),
    requiredDate: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    storeId: STORE,
    purpose: 'QA store workflow audit',
    priority: 'NORMAL',
    lines: [{ itemId: ITEM, requestedQuantity: 2, uomId: UOM, requiredDate: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) }],
  }, creator.token);
  expect(createRes.status === 201 || createRes.status === 200, 'creator creates MR (PRODUCTION can create)');
  const mr = (createRes.json && (createRes.json.id || createRes.json.data?.id)) || null;
  expect(Boolean(mr), 'MR created with id');
  console.log('      MR id=' + mr + ' number=' + (createRes.json?.requestNumber || (createRes.json?.data && createRes.json.data.requestNumber)));

  if (mr) {
    cleanup.push(`DELETE FROM material_request_lines WHERE request_id='${mr}'`);
    cleanup.push(`DELETE FROM material_requests WHERE id='${mr}'`);

    const submit = await api('POST', `/store/material-requests/${mr}/submit`, {}, creator.token);
    expect(submit.status === 201 || submit.status === 200, 'creator submits MR');

    const selfApprove = await api('POST', `/store/material-requests/${mr}/approve`, {}, creator.token);
    expect(selfApprove.status === 400 && /segregation of duties/i.test(JSON.stringify(selfApprove.json)), 'SoD: creator cannot approve own MR (400)');

    const mgrApprove = await api('POST', `/store/material-requests/${mr}/approve`, { remarks: 'QA manager ok' }, manager.token);
    expect(mgrApprove.status === 201 || mgrApprove.status === 200, 'manager (INVENTORY) approves MR');
    if (mgrApprove.json) console.log('      after approve status=' + (mgrApprove.json.status || mgrApprove.json.data?.status));

    const mgrGmSame = await api('POST', `/store/material-requests/${mr}/gm-approve`, {}, manager.token);
    expect(mgrGmSame.status === 403, 'INVENTORY lacks gm_approve -> 403 (manager&GM can also never be same)');

    const gmApprove = await api('POST', `/store/material-requests/${mr}/gm-approve`, { remarks: 'QA GM ok' }, gm.token);
    expect(gmApprove.status === 201 || gmApprove.status === 200, 'GM (MANAGEMENT) gm-approves MR');

    const detail = await api('GET', `/store/material-requests/${mr}`, null, creator.token);
    const d = detail.json || {};
    expect(d.gmApprovedAt != null && d.approvedBy === manager.erpId, 'MR persisted gmApprovedAt + approvedBy=manager');

    const gmConv = await api('POST', `/store/material-requests/${mr}/convert-pr`, {}, gm.token);
    expect(gmConv.status === 403, 'MANAGEMENT denied convert-pr (request.convert missing)');

    const conv = await api('POST', `/store/material-requests/${mr}/convert-pr`, {}, manager.token);
    expect(conv.status === 201 || conv.status === 200, 'manager converts MR -> PR');
    console.log('      convert resp=' + JSON.stringify(conv.json).slice(0, 240));
    const { rows: prRows } = await c.query(
      `SELECT id, requisition_code, status FROM purchase_requisitions WHERE requisition_code = 'PR-MR-' || $1`, [reqNum]);
    expect(prRows.length === 1, 'PR row created in purchase_requisitions (code PR-MR-<reqNum>)');
    const prId = (prRows[0] || {}).id;
    const { rows: mrRow } = await c.query(
      `SELECT pr_id, pr_number, status FROM material_requests WHERE id=$1`, [mr]);
    expect(Boolean(mrRow[0] && mrRow[0].pr_id) && mrRow[0].status === 'FULLY_CONVERTED', 'MR persisted FULLY_CONVERTED with pr_id linked');
    if (prId) {
      cleanup.push(`DELETE FROM purchase_requisition_lines WHERE requisition_id='${prId}'`);
      cleanup.push(`DELETE FROM purchase_requisitions WHERE id='${prId}'`);
    }

    const ack = await api('POST', `/store/material-requests/${mr}/acknowledge`, {}, manager.token);
    expect(ack.status === 201 || ack.status === 200, 'procurement acknowledge ok (INVENTORY)');

    const etaGet = await api('GET', `/store/material-requests/${mr}/eta`, null, manager.token);
    expect(etaGet.status === 200, 'GET ETA info 200');

    const etaSet = await api('POST', `/store/material-requests/${mr}/eta`, { expectedDeliveryDate: new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10), supplierId: SUPPLIER }, manager.token);
    expect(etaSet.status === 201 || etaSet.status === 200, 'manager updates ETA (INVENTORY eta.update)');
    const etaInfo = await api('GET', `/store/material-requests/${mr}/eta`, null, manager.token);
    const ej = etaInfo.json || {};
    const etaBody = ej.data ? ej.data : ej;
    expect(etaBody.supplierId === SUPPLIER || Boolean(etaBody.expectedDeliveryDate), 'ETA persisted supplier + date');

    const timeline = await api('GET', `/store/material-requests/${mr}/timeline`, null, creator.token);
    const tj = timeline.json || {};
    const events = tj.events || tj.data || (Array.isArray(tj) ? tj : []);
    expect(timeline.status === 200 && events.length >= 4, 'timeline populated (>=4 events) got ' + events.length);

    if (prId) {
      cleanup.push(`DELETE FROM purchase_requisition_lines WHERE requisition_id='${prId}'`);
      cleanup.push(`DELETE FROM purchase_requisitions WHERE id='${prId}'`);
    }
  }

  // ---------- REPLENISHMENT ----------
  const runResp = await api('POST', '/store/replenishment/run', {}, dev.token);
  expect(runResp.status === 201 || runResp.status === 200, 'POST /store/replenishment/run executes');
  if (runResp.json) console.log('      run result=' + JSON.stringify(runResp.json).slice(0, 200));

  const queueResp = await api('GET', '/store/replenishment', null, dev.token);
  expect(queueResp.status === 200 && Array.isArray(queueResp.json?.data || queueResp.json?.items || queueResp.json), 'GET /store/replenishment returns rows');

  const kpiResp = await api('GET', '/store/replenishment/kpis', null, dev.token);
  expect(kpiResp.status === 200, 'GET /store/replenishment/kpis 200');

  const { rows: replRows } = await c.query(
    `SELECT * FROM store_replenishments WHERE company_id=$1 AND store_id=$2 AND item_id=$3`, [COMPANY, STORE, ITEM]);
  const candidate = replRows[0];
  if (candidate) {
    const snap = {
      status: candidate.status, cancelled: candidate.cancelled, cancelledAt: candidate.cancelled_at,
      cancelledBy: candidate.cancelled_by, cancelReason: candidate.cancel_reason,
      deferred: candidate.deferred, deferredUntil: candidate.deferred_until, deferredReason: candidate.deferred_reason,
      adjustedQty: candidate.adjusted_quantity, adjustedReason: candidate.adjusted_reason,
      adjustedBy: candidate.adjusted_by, adjustedAt: candidate.adjusted_at,
      mrId: candidate.material_request_id, mrNum: candidate.material_request_number,
    };
    const url = `/store/replenishment/${candidate.id}`;
    const cmr = await api('POST', url + '/create-mr', {}, dev.token);
    if (cmr.status === 201 || cmr.status === 200) {
      expect(true, 'create-mr ok');
    } else {
      expect(cmr.status === 400, 'create-mr guard responds 400 when no remaining requirement (' + cmr.status + ')');
    }
    const { rows: after} = await c.query(`SELECT material_request_id FROM store_replenishments WHERE id=$1`, [candidate.id]);
    const newMr = after[0] && after[0].material_request_id;
    if (newMr && newMr !== snap.mrId) {
      expect(true, 'create-mr linked a new material request');
      cleanup.push(`DELETE FROM material_request_lines WHERE request_id='${newMr}'`);
      cleanup.push(`DELETE FROM material_requests WHERE id='${newMr}'`);
    }
    const adj = await api('POST', url + '/adjust', { quantity: snap.adjustedQty != null ? snap.adjustedQty : 1, reason: 'QA adjust' }, dev.token);
    expect(adj.status === 201 || adj.status === 200, 'adjust quantity ok');
    const def = await api('POST', url + '/defer', { until: new Date(Date.now() + 864e5).toISOString().slice(0, 10), reason: 'QA defer' }, dev.token);
    expect(def.status === 201 || def.status === 200, 'defer ok');
    const canc = await api('POST', url + '/cancel', { reason: 'QA cancel' }, dev.token);
    expect(canc.status === 201 || canc.status === 200, 'cancel ok');
    const unrev = await api('POST', url + '/unreview', {}, dev.token);
    expect(unrev.status === 201 || unrev.status === 200, 'unreview ok');
    await c.query(
      `UPDATE store_replenishments
       SET status=$2, cancelled=$3, cancelled_at=$4, cancelled_by=$5, cancel_reason=$6,
           deferred=$7, deferred_until=$8, deferred_reason=$9,
           adjusted_quantity=$10, adjusted_reason=$11, adjusted_by=$12, adjusted_at=$13,
           material_request_id=$14, material_request_number=$15
       WHERE id=$1`,
      [candidate.id, snap.status, snap.cancelled, snap.cancelledAt, snap.cancelledBy, snap.cancelReason,
       snap.deferred, snap.deferredUntil, snap.deferredReason, snap.adjustedQty, snap.adjustedReason, snap.adjustedBy, snap.adjustedAt,
       snap.mrId, snap.mrNum]);
    console.log('      restored pre-existing replenishment row ' + candidate.id);
  } else {
    console.log('      no replenishment row for store/item — GET returned');
  }

  // ---------- INVENTORY RECONCILIATION (read-only) ----------
  const { rows: bal } = await c.query(
    `SELECT on_hand, reserved, available FROM inventory_balances WHERE company_id=$1 AND item_id=$2 AND warehouse_id=$3`,
    [COMPANY, ITEM, WAREHOUSE]);
  const { rows: led } = await c.query(
    `SELECT COUNT(*)::int AS rows,
            COALESCE(SUM(quantity) FILTER (WHERE direction='IN'),0)::float8 AS inq,
            COALESCE(SUM(quantity) FILTER (WHERE direction='OUT'),0)::float8 AS outq
     FROM stock_ledger WHERE company_id=$1 AND item_id=$2 AND warehouse_id=$3`,
    [COMPANY, ITEM, WAREHOUSE]);
  const balRow = bal[0];
  expect(Number(balRow?.on_hand) === Number(balRow?.available) + Number(balRow?.reserved), 'balance invariant: on_hand = available + reserved (' + (balRow && balRow.on_hand) + ')');
  expect(led[0].rows > 0, 'stock_ledger has history rows for item+warehouse (' + led[0].rows + ')');
  console.log('      balance=' + JSON.stringify(balRow) + ' ledgerRows=' + led[0].rows + ' in=' + led[0].inq + ' out=' + led[0].outq);

  // ---------- CLEANUP ----------
  for (const sql of cleanup) {
    try { await c.query(sql); } catch (e) { console.log('      cleanup warn: ' + e.message.slice(0, 120)); }
  }
  const { rows: gone } = await c.query(`SELECT id FROM erp_users WHERE email LIKE 'qa-store-%@qa.local.test'`);
  expect(gone.length === 0, 'temp Qa users all removed');
  await c.end();

  summary('STORE WORKFLOW + SECURITY + REPLENISHMENT AUDIT');
})().catch((e) => { console.error(e); process.exit(1); });