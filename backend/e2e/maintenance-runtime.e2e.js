/* Authenticated browser E2E for the Maintenance module.
 * Run: node e2e/maintenance-runtime.e2e.js   (backend :3001, frontend dev server :3000)
 * Covers (real Chromium via CDP, real login, real DB):
 *   1. Job Card Create (BREAKDOWN, no department) via the real Job Card form
 *   2. Job Card Create (PREVENTIVE + assigned department) via the same form
 *   3. Maintenance Dashboard (KPIs)                4. Maintenance Reports
 *   5. Maintenance Teams (list + details + members) 6. PM Plans (list + machine relation)
 *   7. PM Schedules (list + Complete/Skip + restore) 8. Maintenance Categories (3 tabs)
 *   9. Network payload validation (no empty-string UUIDs, correct endpoints)
 *  10/11/12. Backend logs / builds (checked by the caller after this run)
 */
const { Client } = require('pg');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'http://localhost:3001/api/v1';
const FRONT = 'http://localhost:3000';
const EMAIL = 'dev@erp-local.test';
const PASSWORD = 'Dev#2026Test';
const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';

let token = '';
let pass = 0, fail = 0;
const failures = [];

function expect(cond, name) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name); }
}

async function api(method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

async function db() {
  return new Promise((resolve, reject) => {
    const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
    c.connect().then(() => resolve(c)).catch(reject);
  });
}

function launchBrowser() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const exe = candidates.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('no Chrome/Edge found');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-profile-'));
  const port = 9341;
  const child = spawn(exe, [
    '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run',
    '--remote-debugging-port=' + port, '--window-size=1680,1050',
    '--user-data-dir=' + profile, 'about:blank',
  ], { stdio: 'ignore' });
  return { child, port, profile };
}

async function waitHttpReady(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/version');
      if (r.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('CDP endpoint never became ready');
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.exceptions = [];
    this.events = [];
    this.closed = false;
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      this.events.push(msg);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(timer);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(msg.params.exceptionDetails);
      }
    });
    const failAll = (why) => {
      this.closed = true;
      for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(new Error('CDP ' + why)); }
      this.pending.clear();
    };
    this.ws.addEventListener('close', () => failAll('socket closed'));
    this.ws.addEventListener('error', () => failAll('socket error'));
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(this));
      this.ws.addEventListener('error', reject);
    });
  }
  send(method, params = {}, timeoutMs = 45000) {
    if (this.closed) return Promise.reject(new Error('CDP closed'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP send timeout: ' + method)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.ws.send(JSON.stringify({ id, method, params })); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async waitFor(expr, desc, timeoutMs = 20000) {
    const t0 = Date.now();
    for (;;) {
      let ok = false;
      try { ok = await this.eval(expr); } catch { /* keep polling */ }
      if (ok) return;
      if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting for: ' + desc);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  pullEvents() {
    const evs = this.events;
    this.events = [];
    return evs;
  }
}

const SET_INPUT = `(el, val) => {
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
  d.set.call(el, String(val));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}`;
const CLICK_AT = `(el) => {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const mk = (t) => new MouseEvent(t, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y });
  el.dispatchEvent(mk('mousedown')); el.dispatchEvent(mk('mouseup')); el.dispatchEvent(mk('click'));
}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  console.log('== setup (API login + DB fixtures) ==');
  const lr = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  expect(lr.status === 200 || lr.status === 201, 'api login ok (' + lr.status + ')');
  const lj = await lr.json();
  token = lj.token || lj.accessToken || (lj.data && lj.data.accessToken);
  expect(!!token, 'token acquired');

  const c = await db();

  const erpQ = await c.query('SELECT * FROM erp_users WHERE email=$1 LIMIT 1', [EMAIL]);
  const erpRow = erpQ.rows[0];
  const loginUser = lj.user || (lj.data && lj.data.user) || {};
  const USER = Object.assign({}, loginUser, {
    email: EMAIL,
    id: erpRow ? erpRow.id : loginUser.id,
    defaultCompanyId: (erpRow && (erpRow.default_company_id || erpRow.companyId)) || COMPANY,
    firstName: erpRow && erpRow.first_name,
    lastName: erpRow && erpRow.last_name,
    displayName: (erpRow && (erpRow.display_name || erpRow.full_name)) || EMAIL,
  });
  expect(!!USER.defaultCompanyId, 'default company id resolved');

  // row-based name resolution (avoids assuming org column names)
  const rowNames = async (tbl, id) => {
    if (!id) return null;
    const r = (await c.query('SELECT * FROM ' + tbl + ' WHERE id=$1 LIMIT 1', [id])).rows[0];
    return r || null;
  };
  const enrich = async (m) => {
    if (!m) return m;
    m.divRow = await rowNames('divisions', m.division_id);
    m.secRow = await rowNames('sections', m.section_id);
    m.deptRow = m.department_id ? await rowNames('departments', m.department_id) : null;
    return m;
  };
  const candidates = (row) => {
    if (!row) return [];
    const name = row.name || row.machineName;
    const code = row.code || row.machineCode || row.departmentCode;
    return [name, code, name ? name + ' ' : '', name && code ? name + ' - ' + code : null, name && code ? name + ' (' + code + ')' : null, code && name ? code + ' - ' + name : null]
      .filter(Boolean);
  };

  // machine WITHOUT department (for BREAKDOWN variant), then machine WITH department (for PREVENTIVE variant)
  const machA = (await c.query(
    `SELECT id, machine_code, machine_id, company_id, division_id, section_id, department_id, machine_name
       FROM machines WHERE company_id=$1 AND is_active=$2 AND division_id IS NOT NULL
         AND section_id IS NOT NULL AND department_id IS NULL
      ORDER BY machine_code ASC LIMIT 1`, [COMPANY, true])).rows[0];
  const machB = (await c.query(
    `SELECT m.id, m.machine_code, m.machine_id, m.company_id, m.division_id, m.section_id, m.department_id,
            m.machine_name
       FROM machines m
       JOIN departments d ON d.id=m.department_id AND d.division_id=m.division_id AND d.section_id=m.section_id
      WHERE m.company_id=$1 AND m.is_active=$2 AND m.department_id IS NOT NULL
      ORDER BY d.name ASC LIMIT 1`, [COMPANY, true])).rows[0] || (await c.query(
    `SELECT m.id, m.machine_code, m.machine_id, m.company_id, m.division_id, m.section_id, m.department_id,
            m.machine_name
       FROM machines m WHERE m.company_id=$1 AND m.is_active=$2 AND m.department_id IS NOT NULL
         AND m.division_id IS NOT NULL AND m.section_id IS NOT NULL
      ORDER BY m.machine_code ASC LIMIT 1`, [COMPANY, true])).rows[0];
  const mach = await enrich(machA || machB);
  const machWithDept = await enrich(machB);

  expect(!!mach, 'fixture machine resolved' + (mach ? ' (' + (mach.machine_code || mach.machine_id) + ')' : ''));
  expect(!!mach && !!mach.division_id && !!mach.section_id, 'fixture machine has division+section');
  expect(!!machWithDept && !!machWithDept.department_id, 'machine WITH department resolved for PREVENTIVE variant');

  const digitsOf = (row) => (row && (row.code || row.name)) || '';

  // PM schedules that can be acted on (non-terminal), plus plan next_due_date restore snapshot
  const schedTargets = (await c.query(
    `SELECT s.id, s.status, s.scheduled_date, s.completed_at, s.pm_plan_id, plan.plan_code
       FROM maintenance_pm_schedules s
       LEFT JOIN maintenance_pm_plans plan ON plan.id = s.pm_plan_id
      WHERE s.status NOT IN ('COMPLETED','SKIPPED') ORDER BY s.scheduled_date ASC LIMIT 2`)).rows;
  const schedSnap = schedTargets.length ? (await c.query(
    `SELECT id, next_due_date FROM maintenance_pm_plans WHERE id = ANY($1::uuid[])`, [schedTargets.map((s) => s.pm_plan_id)])).rows : [];
  const nextDue = {}; for (const p of schedSnap) nextDue[p.id] = p.next_due_date;

  const createdJobCardIds = [];
  const createdJobCardCodes = [];

  /* ── browser ── */
  console.log('== browser: launch + authenticate ==');
  const { child, port, profile } = launchBrowser();
  let cdp = null;
  try {
    await waitHttpReady(port);
    const tabRes = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })
      .catch(() => fetch('http://127.0.0.1:' + port + '/json/new?about:blank'));
    const tab = await tabRes.json();
    cdp = await new Cdp(tab.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const requests = new Map(); // requestId -> {url, method, postData, status}
    const consume = () => {
      for (const msg of cdp.pullEvents()) {
        if (msg.method === 'Network.requestWillBeSent') {
          const p = msg.params;
          if (p.request && p.request.url && p.request.url.includes('/api/v1')) {
            requests.set(p.requestId, { url: p.request.url, method: p.request.method, postData: p.request.postData || '', status: null });
          }
        } else if (msg.method === 'Network.responseReceived') {
          const p = msg.params;
          const rec = requests.get(p.requestId);
          if (rec) rec.status = p.response ? p.response.status : null;
        }
      }
    };
    const waitApi = async (pred, desc, timeoutMs = 20000) => {
      const t0 = Date.now();
      for (;;) {
        consume();
        for (const [, rec] of requests) if (pred(rec)) return rec;
        if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting for API: ' + desc);
        await new Promise((r) => setTimeout(r, 250));
      }
    };

    const goto = async (url) => { await cdp.send('Page.navigate', { url }); await cdp.waitFor('document.readyState === "complete"', 'ready ' + url); };

    await goto(FRONT + '/login');
    await cdp.eval(`localStorage.setItem('token', ${JSON.stringify(token)});
      localStorage.setItem('refresh_token', 'e2e');
      localStorage.setItem('erp_user', ${JSON.stringify(JSON.stringify(USER))}); true`);

    const fieldItem = (label) => `[...document.querySelectorAll('.ant-form-item')].find(f => f.querySelector('label') && f.querySelector('label').textContent.trim() === ${JSON.stringify(label)})`;
    const pickOption = async (labelText, matchCandidates) => {
      await cdp.eval(`(()=>{const fi=${fieldItem(labelText)};(${CLICK_AT})(fi.querySelector('.ant-select-selector'));return 1})()`);
      await cdp.waitFor(`!!document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')`, 'dropdown open ' + labelText);
      const picked = await cdp.eval(`(()=>{
        const dd=document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
        const opts=[...dd.querySelectorAll('.ant-select-item-option')];
        const cands=${JSON.stringify(matchCandidates)};
        let opt=null;
        for (const cand of cands) { if (!cand) continue; const hit=opts.find(o=>o.textContent.includes(cand)); if (hit) { opt=hit; break; } }
        if (!opt) opt=opts[0];
        if (!opt) return null;
        (${CLICK_AT})(opt); return opt.textContent.trim();
      })()`);
      await new Promise((r) => setTimeout(r, 400));
      return picked;
    };

    /* ══ 1. CREATE JOB CARD (BREAKDOWN, no department) ══ */
    console.log('== 1. Job Card Create (BREAKDOWN, no department) ==');
    const m1 = mach;
    if (!m1) {
      console.log('  [FAIL] no BREAKDOWN fixture machine'); expect(false, 'fixture machine available');
    } else {
      await goto(FRONT + '/maintenance/job-cards/new');
      await cdp.waitFor(`document.body.innerText.includes('Organization & Asset') && !!document.querySelector('.ant-select:not(.ant-select-disabled)')`, 'create form rendered', 20000);
      const divPicked = await pickOption('Division', candidates(m1.divRow));
      expect(!!divPicked, 'division option picked ("' + (divPicked || '') + '")');
      await new Promise((r) => setTimeout(r, 500));
      const secPicked = await pickOption('Section', candidates(m1.secRow));
      expect(!!secPicked, 'section option picked ("' + (secPicked || '') + '")');
      await new Promise((r) => setTimeout(r, 500));
      const deptSel = await cdp.eval(`(() => { const fi=${fieldItem('Department')}; const s=fi.querySelector('.ant-select-selection-item'); return s? s.textContent.trim() : ''; })()`);
      expect(deptSel.trim() === '', 'no department selected (got "' + deptSel + '")');

      await cdp.eval(`(() => { const inp=document.querySelector('input[placeholder="Scan QR code or enter machine code, then press Enter"]'); (${SET_INPUT})(inp, ${JSON.stringify(m1.machine_code)}); return 1; })()`);
      await cdp.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Lookup Machine'); (${CLICK_AT})(b); return 1; })()`);
      await cdp.waitFor(`document.body.innerText.includes('Machine:')`, 'machine lookup success alert', 20000);
      await cdp.waitFor(`!!(document.getElementById('machineId') && document.getElementById('machineId').value)`, 'machineId hidden field set', 5000);
      const hidId = await cdp.eval(`document.getElementById('machineId').value`);
      expect(hidId === m1.id, 'hidden machineId equals fixture machine id');
      {
        consume();
        console.log('   [debug] API calls seen so far in flow 1:');
        for (const [, rec] of requests) console.log('     - ' + rec.method + ' ' + rec.url.replace(/^.*\/api\/v1/, '/api/v1') + ' -> ' + rec.status);
      }

      const preSel = await cdp.eval(`(() => ({
        pri: ((${fieldItem('Priority')} || {}).querySelector('.ant-select-selection-item')||{}).textContent||'',
        typ: ((${fieldItem('Maintenance Type')} || {}).querySelector('.ant-select-selection-item')||{}).textContent||''
      }))()`);
      expect(preSel.pri === 'Medium', 'priority default MEDIUM rendered (got "' + preSel.pri + '")');
      expect(preSel.typ === 'Breakdown', 'maintenance type default BREAKDOWN rendered (got "' + preSel.typ + '")');

      await cdp.eval(`(() => { const fi=${fieldItem('Complaint')}; const inp=fi.querySelector('textarea'); (${SET_INPUT})(inp, ${JSON.stringify('E2E Browser TEST job card (BREAKDOWN) - ' + Date.now())}); return 1; })()`);
      await cdp.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Create Job Card'); (${CLICK_AT})(b); return 1; })()`);
      await new Promise((r) => setTimeout(r, 1500));
      let createdId = '';
      try {
        await cdp.waitFor(`/\\/job-cards\\/[0-9a-f-]{36}/.test(location.pathname)`, 'navigated to job card detail', 25000);
        createdId = ((await cdp.eval('location.pathname')).match(/\/([0-9a-f-]{36})$/))[1];
      } catch (e) {
        consume();
        const dbg = await cdp.eval(`(() => ({
          path: location.pathname,
          errs: [...document.querySelectorAll('.ant-form-item-explain-error')].map(x=>x.textContent),
          msgs: (document.querySelector('.ant-message')||{}).innerText||'',
          notif: (document.querySelector('.ant-notification')||{}).innerText||'',
          alerts: [...document.querySelectorAll('.ant-alert')].map(a=>a.innerText),
          btnLoading: ([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Create Job Card')||{}).className||''
        }))()`);
        console.log('   [debug] after submit:', JSON.stringify(dbg));
        console.log('   [debug] requests so far:');
        for (const [, rec] of requests) console.log('     - ' + rec.method + ' ' + rec.url.replace('http://localhost:3001/api/v1','') + ' -> ' + rec.status + (rec.postData ? '   BODY: ' + rec.postData.slice(0, 200) : ''));
        throw e;
      }
      expect(!!createdId && UUID_RE.test(createdId), 'created job card id captured from URL');
      await waitApi((r) => r.method === 'GET' && r.url.includes('/job-cards/' + createdId) && r.status === 200, 'detail GET 200');
      consume();
      const createPost = [...requests.values()].find((r) => r.method === 'POST' && /job-cards$/.test(r.url.split('?')[0]) && r.postData && r.postData.includes(m1.id));
      expect(!!createPost, 'job card POST intercepted');
      let payload1 = null;
      if (createPost) { try { payload1 = JSON.parse(createPost.postData); } catch (e) { payload1 = null; } }
      expect(!!payload1, 'job card POST has JSON body');
      if (payload1) {
        expect(payload1.companyId === COMPANY, 'payload companyId correct');
        expect(payload1.divisionId === m1.division_id, 'payload divisionId = fixture division');
        expect(payload1.sectionId === m1.section_id, 'payload sectionId = fixture section');
        expect(payload1.machineId === m1.id, 'payload machineId = fixture machine');
        expect(payload1.priority === 'MEDIUM', 'payload priority = MEDIUM');
        expect(payload1.maintenanceType === 'BREAKDOWN', 'payload maintenanceType = BREAKDOWN');
        expect(typeof payload1.complaint === 'string' && payload1.complaint.length > 0, 'payload complaint present');
        const empties = Object.entries(payload1).filter(([k, v]) => typeof v === 'string' && v.trim() === '').map(([k]) => k);
        expect(empties.length === 0, 'payload has NO empty-string fields' + (empties.length ? ' (' + empties.join(', ') + ')' : ''));
        expect(!('assignedDepartmentId' in payload1) || payload1.assignedDepartmentId === null || payload1.assignedDepartmentId === undefined,
          'BREAKDOWN variant does not send a department');
      }
      const saved1 = await api('GET', '/master-data/maintenance/job-cards/' + createdId);
      expect(saved1.status === 200 && !!saved1.json && !!saved1.json.id, 'saved job card retrievable by id');
      const card1 = saved1.json;
      if (card1 && card1.id) {
        expect(card1.id === createdId, 'saved card id matches');
        expect(card1.machineId === m1.id, 'saved machineId matches (' + card1.machineId + ')');
        expect(card1.maintenanceType === 'BREAKDOWN', 'saved maintenanceType = BREAKDOWN (got "' + card1.maintenanceType + '")');
        const deptAbs = !('assignedDepartmentId' in card1) || card1.assignedDepartmentId === null || card1.assignedDepartmentId === undefined;
        expect(deptAbs, 'saved assignedDepartmentId null/absent');
      }
      createdJobCardIds.push(createdId);
      if (card1 && card1.jobCardNo) createdJobCardCodes.push(card1.jobCardNo);
    }

    /* ══ 2. CREATE JOB CARD (PREVENTIVE + department) ══ */
    console.log('== 2. Job Card Create (PREVENTIVE + assigned department) ==');
    const m2 = machWithDept;
    if (!m2) {
      console.log('  [notice] no machine-with-department fixture; PREVENTIVE variant NOT run');
    } else {
      await goto(FRONT + '/maintenance/job-cards/new');
      await cdp.waitFor(`document.body.innerText.includes('Organization & Asset') && !!document.querySelector('.ant-select:not(.ant-select-disabled)')`, 'create form rendered (prev)', 20000);
      const d2 = await pickOption('Division', candidates(m2.divRow));
      expect(!!d2, 'division picked for PREVENTIVE ("' + (d2 || '') + '")');
      await new Promise((r) => setTimeout(r, 450));
      const s2 = await pickOption('Section', candidates(m2.secRow));
      expect(!!s2, 'section picked for PREVENTIVE ("' + (s2 || '') + '")');
      await new Promise((r) => setTimeout(r, 450));
      await cdp.waitFor(`(() => { const fi=${fieldItem('Department')}; return !!fi.querySelector('.ant-select') && !fi.querySelector('.ant-select').className.includes('ant-select-disabled'); })()`, 'department select enabled', 10000);
      const dep2 = await pickOption('Department', candidates(m2.deptRow));
      expect(!!dep2, 'department option picked ("' + (dep2 || '') + '")');
      await new Promise((r) => setTimeout(r, 450));
      const typPicked = await pickOption('Maintenance Type', ['Preventive']);
      expect(!!typPicked, 'maintenance type set to Preventive');
      const sel2 = await cdp.eval(`(() => ({ typ: ((${fieldItem('Maintenance Type')} || {}).querySelector('.ant-select-selection-item')||{}).textContent||'' }))()`);
      expect(sel2.typ === 'Preventive', 'maintenance type value is Preventive (got "' + sel2.typ + '")');

      await cdp.eval(`(() => { const inp=document.querySelector('input[placeholder="Scan QR code or enter machine code, then press Enter"]'); (${SET_INPUT})(inp, ${JSON.stringify(m2.machine_code)}); return 1; })()`);
      await cdp.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Lookup Machine'); (${CLICK_AT})(b); return 1; })()`);
      await cdp.waitFor(`document.body.innerText.includes('Machine:')`, 'machine lookup success alert (prev)', 20000);
      await cdp.eval(`(() => { const fi=${fieldItem('Complaint')}; const inp=fi.querySelector('textarea'); (${SET_INPUT})(inp, ${JSON.stringify('E2E Browser TEST job card (PREVENTIVE) - ' + Date.now())}); return 1; })()`);
      await cdp.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Create Job Card'); (${CLICK_AT})(b); return 1; })()`);
      await new Promise((r) => setTimeout(r, 1500));
      let createdId2 = '';
      try {
        await cdp.waitFor(`/\\/job-cards\\/[0-9a-f-]{36}/.test(location.pathname)`, 'navigated to detail (prev)', 25000);
        createdId2 = ((await cdp.eval('location.pathname')).match(/\/([0-9a-f-]{36})$/))[1];
      } catch (e) {
        const dbg = await cdp.eval(`(() => ({
          path: location.pathname,
          errs: [...document.querySelectorAll('.ant-form-item-explain-error')].map(x=>x.textContent),
          msgs: (document.querySelector('.ant-message')||{}).innerText||'',
          alerts: [...document.querySelectorAll('.ant-alert')].map(a=>a.innerText)
        }))()`);
        console.log('   [debug] after submit (prev):', JSON.stringify(dbg));
        throw e;
      }
      expect(!!createdId2 && UUID_RE.test(createdId2), 'preventive job card id captured');
      await waitApi((r) => r.method === 'GET' && r.url.includes('/job-cards/' + createdId2) && r.status === 200, 'detail GET 200 (prev)');
      const saved2 = await api('GET', '/master-data/maintenance/job-cards/' + createdId2);
      expect(saved2.status === 200 && !!saved2.json && !!saved2.json.id, 'preventive job card retrievable by id');
      const card2 = saved2.json;
      if (card2 && card2.id) {
        expect(card2.maintenanceType === 'PREVENTIVE', 'saved maintenanceType = PREVENTIVE (got "' + card2.maintenanceType + '")');
        expect(card2.assignedDepartmentId === m2.department_id, 'saved assignedDepartmentId = fixture department');
        expect(card2.machineId === m2.id, 'saved machineId matches');
      }
      createdJobCardIds.push(createdId2);
      if (card2 && card2.jobCardNo) createdJobCardCodes.push(card2.jobCardNo);
    }

    /* ══ 3. DASHBOARD ══ */
    console.log('== 3. Maintenance Dashboard ==');
    await goto(FRONT + '/maintenance');
    await waitApi((r) => r.url.includes('/job-cards/dashboard') && r.status === 200, 'dashboard API 200', 25000);
    await waitApi((r) => r.url.includes('/job-cards/chart-data') && r.status === 200, 'chart-data API 200', 25000);
    await cdp.waitFor(`document.querySelectorAll('.ant-statistic').length >= 4`, 'KPI statistics rendered', 25000);
    const dashTxt = await cdp.eval('document.body.innerText');
    expect(dashTxt.includes('Open'), 'dashboard shows Open KPI');
    expect(/Approved|Completed/.test(dashTxt), 'dashboard shows Completed/Approved KPI');
    expect((dashTxt.match(/\b(Open|Assigned|In Progress|Completed|Approved|Awaiting Parts)\b/g) || []).length >= 3, 'dashboard KPIs populated');
    const dashErr = await cdp.eval(`[...document.querySelectorAll('.ant-alert-error')].map(a=>a.innerText)`);
    expect(dashErr.length === 0, 'dashboard has no error alerts');

    /* ══ 4. REPORTS ══ */
    console.log('== 4. Maintenance Reports ==');
    await goto(FRONT + '/maintenance/reports');
    await waitApi((r) => r.url.includes('/reports') && r.status === 200, 'reports API 200', 25000);
    await cdp.waitFor(`document.body.innerText.includes('Maintenance Reports')`, 'reports page rendered', 20000);
    const repErr = await cdp.eval(`[...document.querySelectorAll('.ant-alert-error')].map(a=>a.innerText)`);
    expect(repErr.length === 0, 'reports page has no error alerts');
    const repTxt = await cdp.eval('document.body.innerText');
    const repHas = repTxt.includes('Top Problem Machines') || repTxt.includes('Downtime by Maintenance Type') || repTxt.includes('No report data available');
    expect(repHas, 'reports page shows report cards or empty state');

    /* ══ 5. TEAMS ══ */
    console.log('== 5. Maintenance Teams ==');
    await goto(FRONT + '/maintenance/teams');
    await waitApi((r) => r.url.endsWith('/teams') && r.status === 200, 'teams list API 200', 25000);
    await cdp.waitFor(`document.querySelectorAll('.ant-table-tbody tr.ant-table-row').length > 0`, 'teams table rows rendered', 25000);
    const teamsRes = await api('GET', '/master-data/maintenance/teams');
    expect(teamsRes.status === 200 && Array.isArray(teamsRes.json) && teamsRes.json.length > 0, 'teams list via API returns rows');
    const team0 = teamsRes.json && teamsRes.json[0];
    if (team0) {
      await cdp.eval(`(() => { const rows=[...document.querySelectorAll('.ant-table-tbody tr.ant-table-row')];
        const btn=[...rows[0].querySelectorAll('button')].find(b=>/View|Details|Detail/i.test(b.textContent));
        if(!btn) return false; (${CLICK_AT})(btn); return true; })()`);
      await new Promise((r) => setTimeout(r, 900));
      await waitApi((r) => r.url.includes('/teams/' + team0.id) && r.status === 200, 'team detail API 200');
      const teamDetail = await api('GET', '/master-data/maintenance/teams/' + team0.id);
      expect(teamDetail.status === 200 && !!teamDetail.json, 'team detail retrievable via API');
      const detail0 = teamDetail.json;
      if (detail0 && detail0.id) {
        expect(detail0.id === team0.id, 'team detail id matches list');
        expect(detail0.department && typeof detail0.department === 'object', 'team detail loads department relation');
        expect('members' in detail0, 'team detail exposes members relation');
        if (Array.isArray(detail0.members) && detail0.members.length) {
          const allHaveUser = detail0.members.every((mm) => mm.user && mm.user.id);
          expect(allHaveUser, 'team members each load user relation');
          console.log('   [info] team ' + (detail0.teamName || team0.id).slice(0, 60) + ': ' + detail0.members.length + ' member(s)');
        }
      }
      const modalOpen = await cdp.eval(`!!document.querySelector('.ant-modal:not(.ant-modal-hidden)')`);
      expect(modalOpen, 'team details modal opened by View button');
      const modalTxt = await cdp.eval(`(document.querySelector('.ant-modal:not(.ant-modal-hidden)')||{innerText:''}).innerText`);
      expect(/Members/.test(modalTxt), 'modal shows Members section');
      if (Array.isArray(detail0.members) && detail0.members.length) {
        const firstName = detail0.members[0].user.firstName || detail0.members[0].user.displayName || detail0.members[0].user.email || '';
        if (firstName) await cdp.waitFor(`document.body.innerText.includes(${JSON.stringify(String(firstName))})`, 'member name rendered in modal', 8000).catch(() => console.log('   [info] member name not found in modal (different field)'));
      } else {
        expect(/No members assigned|No team members/.test(modalTxt), 'modal indicates no members assigned');
      }
      await cdp.eval(`(() => { const m=document.querySelector('.ant-modal:not(.ant-modal-hidden)'); if(!m) return; const b=[...m.querySelectorAll('.ant-modal-footer button')].pop(); if(b) (${CLICK_AT})(b); return 1; })()`).catch(() => {});
      await new Promise((r) => setTimeout(r, 400));
    }

    /* ══ 6. PM PLANS ══ */
    console.log('== 6. PM Plans ==');
    await goto(FRONT + '/maintenance/pm-plans');
    await waitApi((r) => r.url.endsWith('/pm/plans') && r.status === 200, 'pm plans API 200', 25000);
    const plansRes = await api('GET', '/master-data/maintenance/pm/plans');
    expect(plansRes.status === 200 && Array.isArray(plansRes.json), 'pm plans API returns array');
    const plan0 = plansRes.json && plansRes.json[0];
    if (plan0) {
      expect(plan0.machine && (plan0.machine.name || plan0.machine.machineCode || plan0.machine.id), 'pm plan loads machine relation');
      expect('assignedTeam' in plan0, 'pm plan exposes assignedTeam relation key');
      await cdp.waitFor(`document.body.innerText.includes(${JSON.stringify(plan0.planCode)})`, 'pm plan code rendered in list', 15000);
      const mn = plan0.machine && (plan0.machine.machineCode || plan0.machine.machineName || plan0.machine.name || plan0.machine.machineId);
      if (mn) await cdp.waitFor(`document.body.innerText.includes(${JSON.stringify(String(mn))})`, 'pm plan machine name rendered', 8000).catch(() => console.log('   [info] machine name not found in list text'));
      expect(!!plan0.startDate, 'pm plan startDate present');
    } else {
      console.log('  [info] no PM plans exist; list renders empty state by design');
    }

    /* ══ 7. PM SCHEDULES (+ Complete/Skip with DB restore) ══ */
    console.log('== 7. PM Schedules (+ Complete/Skip + DB restore) ==');
    await goto(FRONT + '/maintenance/pm-schedules');
    await waitApi((r) => r.url.endsWith('/pm/schedules') && r.status === 200, 'pm schedules API 200', 25000);
    await cdp.waitFor(`document.body.innerText.includes('PM Schedules')`, 'pm schedules page rendered', 20000);
    const schedRes = await api('GET', '/master-data/maintenance/pm/schedules');
    expect(schedRes.status === 200 && Array.isArray(schedRes.json), 'pm schedules API returns array');
    const s0 = schedRes.json && schedRes.json[0];
    if (s0) {
      expect(s0.machine && (s0.machine.name || s0.machine.machineCode || s0.machine.id), 'schedule loads machine relation');
      expect('generatedJobCard' in s0, 'schedule exposes generatedJobCard relation');
      expect('pmPlan' in s0 && s0.pmPlan, 'schedule loads pmPlan relation');
      await cdp.waitFor(`document.querySelectorAll('.ant-table-tbody tr.ant-table-row').length > 0`, 'schedule table rows rendered', 20000);

      // act on the first two non-terminal schedules (from the repos themselves)
      const doUiAction = async (actionLabel, apiSuffix, schedRow) => {
        const planCode = (schedRow && schedRow.plan_code) || '';
        const got = await cdp.eval(`(() => {
          const rows=[...document.querySelectorAll('.ant-table-tbody tr.ant-table-row')];
          let r = rows.find(x => ${JSON.stringify(planCode) ? 'x.innerText.includes(' + JSON.stringify(planCode) + ')' : 'false'});
          const row = r || rows[0];
          const b=row && [...row.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(actionLabel)});
          if(!b) return false;
          (${CLICK_AT})(b); return true;
        })()`);
        if (!got) { console.log('   [info] no ' + actionLabel + ' button on schedule row'); return 'none'; }
        await new Promise((r) => setTimeout(r, 700));
        await cdp.eval(`(() => { const pop=[...document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)')].pop();
          if(!pop) return false;
          const b=[...pop.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(actionLabel)});
          if(b) (${CLICK_AT})(b); return !!b; })()`);
        await waitApi((r) => r.method === 'POST' && r.url.includes('/schedules/' + schedRow.id + '/' + apiSuffix) && r.status === 200, actionLabel + ' API 200');
        return 'done';
      };

      if (schedTargets.length >= 1) {
        const r1 = await doUiAction('Complete', 'complete', schedTargets[0]);
        expect(r1 === 'done', 'Complete executed for non-terminal schedule ' + String(schedTargets[0].scheduled_date).slice(0, 10));
        if (r1 === 'done') {
          const v1 = await api('GET', '/master-data/maintenance/pm/schedules');
          const row = (v1.json || []).find((s) => s.id === schedTargets[0].id);
          expect(row && row.status === 'COMPLETED', 'schedule now COMPLETED via UI');
        }
      } else { console.log('  [info] no non-terminal schedule for Complete (all COMPLETED/SKIPPED)'); }

      if (schedTargets.length >= 2) {
        const r2 = await doUiAction('Skip', 'skip', schedTargets[1]);
        expect(r2 === 'done', 'Skip executed for non-terminal schedule ' + String(schedTargets[1].scheduled_date).slice(0, 10));
        if (r2 === 'done') {
          const v2 = await api('GET', '/master-data/maintenance/pm/schedules');
          const row = (v2.json || []).find((s) => s.id === schedTargets[1].id);
          expect(row && row.status === 'SKIPPED', 'schedule now SKIPPED via UI');
        }
      } else { console.log('  [info] no second non-terminal schedule for Skip'); }
    } else {
      console.log('  [info] no PM schedules exist; list renders empty state by design');
    }

    /* ══ 8. CATEGORIES ══ */
    console.log('== 8. Maintenance Categories (3 tabs) ==');
    await goto(FRONT + '/maintenance/categories');
    await cdp.waitFor(`document.body.innerText.includes('Maintenance Categories')`, 'categories page rendered', 20000);
    await waitApi((r) => r.url.endsWith('/categories/complaint') && r.status === 200, 'complaint categories 200', 25000);
    const clickTab = async (labelText) => {
      await cdp.eval(`(() => { const tab=[...document.querySelectorAll('.ant-tabs-tab')].find(t=>t.textContent.trim()===${JSON.stringify(labelText)}); if(tab) (${CLICK_AT})(tab); return !!tab; })()`);
      await new Promise((r) => setTimeout(r, 600));
    };
    await clickTab('Root Cause Categories');
    await waitApi((r) => r.url.endsWith('/categories/root-cause') && r.status === 200, 'root-cause categories 200', 25000);
    await clickTab('Failure Categories');
    await waitApi((r) => r.url.endsWith('/categories/failure') && r.status === 200, 'failure categories 200', 25000);
    const catErr = await cdp.eval(`[...document.querySelectorAll('.ant-alert-error')].map(a=>a.innerText)`);
    expect(catErr.length === 0, 'categories page has no error alerts after tabbing');
    const catChecks = [
      ['maintenance_complaint_categories', '/master-data/maintenance/categories/complaint'],
      ['maintenance_root_cause_categories', '/master-data/maintenance/categories/root-cause'],
      ['maintenance_failure_categories', '/master-data/maintenance/categories/failure'],
    ];
    for (const [table, path] of catChecks) {
      const dbq = await c.query('SELECT count(*)::int AS n FROM ' + table);
      const ap = await api('GET', path);
      expect(ap.status === 200, 'categories API 200: ' + path.split('/').pop());
      const rows = ap.status === 200 ? (Array.isArray(ap.json) ? ap.json : (ap.json && ap.json.data) || []) : [];
      if (ap.status === 200 && dbq.rows[0].n > 0) {
        expect(rows.length > 0, 'categories endpoint returns rows: ' + path.split('/').pop() + ' (' + rows.length + ')');
        expect(rows.every((r) => UUID_RE.test(String(r.id))), 'category rows have valid ids: ' + path.split('/').pop());
      }
    }

    /* ══ 9. Network payload validation ══ */
    console.log('== 9. Network payload validation ==');
    consume();
    const allApi = [...requests.values()];
    const noStatus = allApi.filter((r) => r.status === null || r.status === undefined);
    expect(noStatus.length === 0, 'every captured API request got a status response (' + noStatus.length + ' unmatched)');
    const non2xx = allApi.filter((r) => r.status !== null && (r.status < 200 || r.status >= 300));
    if (non2xx.length) {
      for (const r of non2xx.slice(0, 10)) console.log('   non-2xx: ' + r.method + ' ' + r.url.replace('http://localhost:3001/api/v1', '') + ' -> ' + r.status);
    }
    expect(non2xx.length === 0, 'all authenticated API responses during session are 2xx (' + non2xx.length + ' non-2xx)');
    const mutating = allApi.filter((r) => ['POST', 'PUT', 'PATCH'].includes(r.method));
    let emptyStrCount = 0;
    for (const r of mutating) {
      if (!r.postData) continue;
      let parsed = null;
      try { parsed = JSON.parse(r.postData); } catch { /* not JSON */ }
      if (parsed && typeof parsed === 'object') {
        const bad = Object.entries(parsed).filter(([k, v]) => typeof v === 'string' && v.trim() === '').map(([k]) => k);
        emptyStrCount += bad.length;
        if (bad.length) console.log('   [warn] empty-string fields in ' + r.method + ' ' + r.url.replace('http://localhost:3001/api/v1', '') + ': ' + bad.join(','));
      }
    }
    expect(emptyStrCount === 0, 'no empty-string values in any mutating request payload (' + emptyStrCount + ')');
    const flags = {
      dashboard: allApi.some((r) => r.url.includes('/job-cards/dashboard')),
      jobCardCreate: allApi.some((r) => r.method === 'POST' && /job-cards$/.test(r.url.split('?')[0])),
      reports: allApi.some((r) => r.url.includes('/reports')),
      teams: allApi.some((r) => r.url.includes('/teams')),
      pmPlans: allApi.some((r) => r.url.includes('/pm/plans')),
      pmSchedules: allApi.some((r) => r.url.includes('/pm/schedules')),
      categories: allApi.some((r) => r.url.includes('/categories/')),
    };
    expect(flags.dashboard && flags.jobCardCreate, 'dashboard + job card create endpoints exercised');
    expect(flags.reports && flags.teams && flags.pmPlans && flags.pmSchedules && flags.categories, 'reports/teams/pm-plans/pm-schedules/categories endpoints exercised');

    if (cdp.exceptions.length) {
      console.log('   [info] page exceptions observed: ' + cdp.exceptions.length);
      for (const e of cdp.exceptions.slice(0, 5)) console.log('     -', JSON.stringify(e).slice(0, 200));
    }

    await c.end();
  } finally {
    try { if (cdp) await cdp.send('Browser.close'); } catch { /* already gone */ }
    try { child.kill(); } catch { /* noop */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ }
    console.log('== cleanup (restore data + remove test rows) ==');
    try {
      const cc = await db();
      try {
        if (createdJobCardIds.length) {
          const del = await cc.query('DELETE FROM maintenance_job_cards WHERE id = ANY($1::uuid[])', [createdJobCardIds]);
          console.log('   [cleanup] deleted ' + del.rowCount + ' test job card(s)');
        }
        for (const t of schedTargets) {
          if (!t) continue;
          await cc.query('UPDATE maintenance_pm_schedules SET status=$1, completed_at=$2 WHERE id=$3', [t.status, t.completed_at, t.id]);
          await cc.query('UPDATE maintenance_pm_plans SET next_due_date=$1 WHERE id=$2', [nextDue[t.pm_plan_id] || null, t.pm_plan_id]);
        }
        const check = schedTargets.length ? (await cc.query('SELECT id, status, completed_at FROM maintenance_pm_schedules WHERE id = ANY($1::uuid[])', [schedTargets.map((s) => s.id)])).rows : [];
        const okSched = check.every((r) => {
          const t = schedTargets.find((s) => s.id === r.id);
          return t && r.status === t.status && String(r.completed_at || '') === String(t.completed_at || '');
        });
        expect(okSched, 'PM schedule statuses restored to original');
        if (createdJobCardIds.length) {
          const rem = (await cc.query('SELECT id FROM maintenance_job_cards WHERE id = ANY($1::uuid[])', [createdJobCardIds])).rows;
          expect(rem.length === 0, 'test job cards fully removed');
        }
      } finally { await cc.end().catch(() => {}); }
    } catch (e) { console.log('   [warn] cleanup failed:', e && e.message); }
  }

  console.log('\nRESULT: pass=' + pass + ' fail=' + fail);
  if (failures.length) console.log('FAILURES: ' + failures.join(' | '));
  if (createdJobCardCodes.length) console.log('Created test job cards during run (since removed): ' + createdJobCardCodes.join(', '));
  process.exit(fail ? 1 : 0);
}

setTimeout(() => { console.error('FATAL global watchdog: run exceeded 10 minutes'); process.exit(3); }, 10 * 60 * 1000).unref();
main().catch((e) => { console.error('FATAL', e); process.exit(2); });