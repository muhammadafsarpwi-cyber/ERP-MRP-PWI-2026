/* Browser E2E (real Chromium via CDP): Production Entry form
 * CHANGE 1 — live Rejection %  = scrap / (good + scrap) × 100   [zero-safe]
 * CHANGE 2 — Downtime = Planned − Running  (Running primary, derived read-only)
 * Covers: rejection cases 900/100→10%, 950/50→5%, 1000/0→0%, 0/0→0%;
 *         running 12→0,11→1,10→2,8→4,0→12; validation 13 & −1;
 *         Efficiency 91.67%; create→save→edit(running 10→downtime 2)→persist;
 *         antd warning guard (useForm/Spin-tip/circular refs) on this page.
 * Run: node e2e/browser-entry-form-hours.e2e.js   (:3001 backend, :3000 frontend)
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
const DATE_A = '2027-03-15';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name); }
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
  const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9347', '--window-size=1680,1050', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  return { child, port: 9347, profile };
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.warnings = [];
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        p(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'warning') {
        this.warnings.push(msg.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200));
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'warning') {
        this.warnings.push(String(msg.params.entry.text).slice(0, 200));
      }
    });
    return new Promise((resolve) => { this.ws.addEventListener('open', () => resolve(this)); });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve) => { this.pending.set(id, resolve); try { this.ws.send(JSON.stringify({ id, method, params })); } catch { this.pending.delete(id); } });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 300));
    return r.result.value;
  }
  async waitFor(expr, desc, timeoutMs = 15000) {
    const t0 = Date.now();
    for (;;) {
      let v = false;
      try { v = await this.eval(expr); } catch { /* retry */ }
      if (v) return true;
      if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting for: ' + desc);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

const SET_INPUT = `(el, val) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : Object.getPrototypeOf(el);
  const d = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  d.set.call(el, String(val));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}`;
const CLICK_AT = `(el) => {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const mk = (t) => new MouseEvent(t, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y });
  el.dispatchEvent(mk('mousedown')); el.dispatchEvent(mk('mouseup')); el.dispatchEvent(mk('click'));
}`;

async function main() {
  /* ── fixtures ── */
  const lr = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const lj = await lr.json();
  const token = lj.token || lj.accessToken;
  const USER = lj.user || {};
  if (!token) throw new Error('login failed');
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const api = async (m, p, b) => {
    const r = await fetch(BASE + p, { method: m, headers: auth, body: b ? JSON.stringify(b) : undefined });
    let j = null; try { j = await r.json(); } catch { /* empty */ }
    return { status: r.status, json: j };
  };

  const c = await db();
  // department with >=2 machines (Spiral family used by the other suites too)
  const depQ = await c.query(`
    SELECT m.department_id, m.division_id, m.section_id, COUNT(*) AS n
    FROM machines m WHERE m.is_active=true AND m.department_id IS NOT NULL AND m.division_id IS NOT NULL AND m.section_id IS NOT NULL
    GROUP BY 1,2,3 HAVING COUNT(*)>=2 ORDER BY 4 DESC LIMIT 1`);
  const dep = depQ.rows[0];
  const machQ = await c.query(`SELECT id, machine_code FROM machines WHERE department_id=$1 AND is_active=true ORDER BY machine_code`, [dep.department_id]);
  const M = machQ.rows[1]; // second machine keeps SP-01 flows untouched
  const COMPANY = (await c.query('SELECT company_id FROM machines WHERE id=$1', [M.id])).rows[0].company_id;
  const ITEM = (await c.query(`
    SELECT i.id, i.item_code, i.base_uom_id FROM items i JOIN uoms u ON u.id=i.base_uom_id
    WHERE i.company_id=$1 AND i.status='ACTIVE' AND u.code IN ('KG','PCS','METER')
    ORDER BY i.created_at LIMIT 1`, [COMPANY])).rows[0];

  // 12-hour test shift (created fresh so planned hours are deterministic)
  let SH12 = (await c.query(`SELECT id, planned_hours::float8 AS ph FROM shifts WHERE company_id=$1 AND shift_code='SHIFT-E2E12' AND is_active=true`, [COMPANY])).rows[0];
  if (!SH12) {
    await c.query(
      `INSERT INTO shifts (company_id, shift_code, name, start_time, end_time, planned_hours, status, is_active, created_at, updated_at)
       VALUES ($1,'SHIFT-E2E12','E2E 12h Shift','06:00','18:00',12,'ACTIVE',true,now(),now())`,
      [COMPANY]);
    SH12 = (await c.query(`SELECT id, planned_hours::float8 AS ph FROM shifts WHERE company_id=$1 AND shift_code='SHIFT-E2E12'`, [COMPANY])).rows[0];
  }
  const PLANNED = Number(SH12.ph);
  if (PLANNED !== 12) throw new Error('expected planned_hours=12, got ' + PLANNED);

  // clean slate for this machine × shift × date
  for (const r of (await c.query(`SELECT id FROM production_entries WHERE company_id=$1 AND entry_date=$2 AND shift_id=$3 AND machine_id=$4 AND is_active=true`, [COMPANY, DATE_A, SH12.id, M.id])).rows) {
    await api('DELETE', '/production/entries/' + r.id).catch(() => {});
  }
  // active target: 600 units / 12h standard
  let TG = (await c.query(`SELECT id FROM machine_targets WHERE machine_id=$1 AND shift_id=$2 AND status='ACTIVE' AND is_active=true AND effective_from<=$3::date AND (effective_to IS NULL OR effective_to>=$3::date) LIMIT 1`, [M.id, SH12.id, DATE_A])).rows[0];
  if (!TG) {
    const cr = await api('POST', '/production/machine-targets', { machineId: M.id, shiftId: SH12.id, uomId: ITEM.base_uom_id, standardHours: 12, targetQuantity: 600, effectiveFrom: '2027-01-01', remarks: 'E2E-HOURS-' + Date.now() });
    ok(cr.status === 201, 'fixture machine-target created (' + cr.status + ')');
    TG = (await c.query(`SELECT id FROM machine_targets WHERE machine_id=$1 AND shift_id=$2 ORDER BY created_at DESC LIMIT 1`, [M.id, SH12.id])).rows[0];
  }

  /* ── browser ── */
  const { child, port } = launchBrowser();
  for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  const tabRes = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' }).catch(() => fetch('http://127.0.0.1:' + port + '/json/new?about:blank'));
  const tab = await tabRes.json();
  const cdp = await new Cdp(tab.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');

  await cdp.send('Page.navigate', { url: FRONT + '/login' });
  await cdp.waitFor(`document.readyState === "complete"`, 'login shell');
  await cdp.eval(`localStorage.setItem('token', ${JSON.stringify(token)});
    localStorage.setItem('refresh_token', 'e2e');
    localStorage.setItem('erp_user', ${JSON.stringify(JSON.stringify(USER))}); true`);

  const URL0 = `${FRONT}/production/entries/new?from=select&machineId=${M.id}&entryDate=${DATE_A}&shiftId=${SH12.id}&divisionId=${dep.division_id}&sectionId=${dep.section_id}&departmentId=${dep.department_id}`;
  await cdp.send('Page.navigate', { url: URL0 });
  await cdp.waitFor(`document.readyState === "complete"`, 'form shell');
  await cdp.waitFor(`document.body.innerText.includes('Production Context')`, 'context summary', 20000);

  const numByLabel = (label) => `(() => {
    const fi=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()===${JSON.stringify(label)});
    const inp=fi&&fi.querySelector('.ant-input-number-input'); return inp?parseFloat(inp.value):null; })()`;
  const setNum = async (label, val) => {
    await cdp.eval(`(()=>{const fi=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()===${JSON.stringify(label)});
      const inp=fi.querySelector('.ant-input-number-input'); (${SET_INPUT})(inp, ${JSON.stringify(val)}); return 1})()`);
  };
  const kpiText = (label) => `(() => {
    const tiles=[...document.querySelectorAll('.ant-card')].flatMap(x=>[...x.querySelectorAll(':scope > .ant-card-body > div')]);
    const t=[...document.querySelectorAll('.ant-card .ant-card')||[]];
    const all=[...document.querySelectorAll('.ant-typography')].map(x=>x.textContent);
    const card=[...document.querySelectorAll('.ant-card')].find(x=>x.querySelector('.ant-card-head-title') && x.querySelector('.ant-card-head-title').textContent==='KPI Summary');
    if(!card) return null; return card.innerText.replace(/\\n/g,' | '); })()`;
  const rejPctShown = `(() => {
    const card=[...document.querySelectorAll('.ant-card')].find(x=>x.querySelector('.ant-card-head-title')&&x.querySelector('.ant-card-head-title').textContent==='KPI Summary');
    if(!card) return null; const m=card.innerText.match(/Rejection %[^0-9-]*([0-9.-]+)%/); return m?parseFloat(m[1]):null; })()`;
  const effShown = `(() => {
    const card=[...document.querySelectorAll('.ant-card')].find(x=>x.querySelector('.ant-card-head-title')&&x.querySelector('.ant-card-head-title').textContent==='KPI Summary');
    if(!card) return null; const m=card.innerText.match(/Efficiency %[^0-9-]*([0-9.-]+)%/); return m?parseFloat(m[1]):null; })()`;
  const fieldError = (label) => `(() => {
    const fi=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()===${JSON.stringify(label)});
    const e=fi&&fi.querySelector('.ant-form-item-explain-error'); return e?e.textContent:null; })()`;
  const downtimeDisabled = `(() => {
    const fi=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()==='Downtime Hours');
    const w=fi&&fi.querySelector('.ant-input-number'); return !!(w&&w.className.includes('ant-input-number-disabled')); })()`;
  const helperLine = `(() => {
    const card=[...document.querySelectorAll('.ant-card')].find(x=>x.querySelector('.ant-card-head-title')&&x.querySelector('.ant-card-head-title').textContent==='Downtime');
    if(!card) return null; const m=card.innerText.match(/Planned ([0-9.]+)h − Running ([0-9.]+)h = Downtime ([0-9.]+)h/);
    return m?{p:+m[1],r:+m[2],d:+m[3]}:null; })()`;

  console.log('== setup ==');
  ok(true, 'form opened with locked context');

  // target auto-resolution sanity for this fixture (600/12h, downtime 0)
  await cdp.waitFor(`Math.abs((${numByLabel('Running Hours')}) - 12) < 0.001`, 'running initialized to planned 12h', 15000);
  const dt0 = await cdp.eval(numByLabel('Downtime Hours'));
  ok(Math.abs(dt0 - 0) < 0.001, 'initial downtime = 0 when running = planned (got ' + dt0 + ')');
  ok(await cdp.eval(downtimeDisabled), 'downtime is derived/read-only (disabled)');

  /* ── CHANGE 1: rejection % ── */
  console.log('== CHANGE 1: Rejection % ==');
  let rp = await cdp.eval(rejPctShown);
  ok(rp === 0, 'case 0/0 -> 0.00% (got ' + rp + ')');
  await setNum('Actual Good Production', 900);
  await setNum('Rejection / Scrap', 100);
  await cdp.waitFor(`${rejPctShown} === 10`, 'rejection 100/(900+100)=10%');
  rp = await cdp.eval(rejPctShown); ok(rp === 10, 'good=900 rej=100 -> 10.00% (got ' + rp + '%)');
  /* spec case 2: good=950, rej=50 -> 5.00% */
  await setNum('Actual Good Production', 950);
  await setNum('Rejection / Scrap', 50);
  await cdp.waitFor(`Math.abs((${rejPctShown}) - 5) < 0.01`, 'spec case 950/50 = 5%');
  rp = await cdp.eval(rejPctShown); ok(Math.abs(rp - 5) < 0.01, 'good=950 rej=50 -> 5.00% (got ' + rp + '%)');
  const midPct = await cdp.eval(`${rejPctShown}`);
  await setNum('Rejection / Scrap', 49);
  await cdp.waitFor(`Math.abs((${rejPctShown}) - ${Math.round(49 / 999 * 10000) / 100}) < 0.01`, 'live update on scrap change');
  ok(true, 'live recalculation on scrap change (' + midPct + '% -> ' + await cdp.eval(rejPctShown) + '%)');
  await setNum('Actual Good Production', 1000);
  await setNum('Rejection / Scrap', 0);
  await cdp.waitFor(`${rejPctShown} === 0`, 'rejection zero-safe');
  rp = await cdp.eval(rejPctShown); ok(rp === 0, 'good=1000 rej=0 -> 0.00% (got ' + rp + '%)');
  const rejColorVar = await cdp.eval(`(()=>{const card=[...document.querySelectorAll('.ant-card')].find(x=>x.querySelector('.ant-card-head-title')&&x.querySelector('.ant-card-head-title').textContent==='KPI Summary');
    const lab=[...card.querySelectorAll('.ant-typography')].find(x=>x.textContent==='Rejection %');
    const val=lab&&lab.parentElement.querySelector('span strong, strong');
    return val?val.getAttribute('style'):null;})()`);
  ok(!!rejColorVar && rejColorVar.includes('var(--theme-text)'), 'rejection value themed via semantic token (' + rejColorVar + ')');

  /* ── CHANGE 2: running -> downtime ── */
  console.log('== CHANGE 2: Running -> Downtime ==');
  await setNum('Rejection / Scrap', 2);   // final production mix for save: 98-ish below
  await setNum('Actual Good Production', 900);
  const cases = [[12, 0], [11, 1], [10, 2], [8, 4], [0, 12]];
  for (const [run, dt] of cases) {
    await setNum('Running Hours', run);
    try {
      await cdp.waitFor(`(() => { const v=${numByLabel('Downtime Hours')}; return v!==null && Math.abs(v-${dt})<0.001; })()`, 'downtime ' + dt, 8000);
      ok(true, 'planned 12, running ' + run + ' -> downtime ' + dt.toFixed(2));
    } catch {
      ok(false, 'planned 12, running ' + run + ' -> downtime ' + dt.toFixed(2) + ' (got ' + await cdp.eval(numByLabel('Downtime Hours')) + ')');
    }
  }
  await setNum('Running Hours', 11);
  await cdp.waitFor(`Math.abs((${numByLabel('Downtime Hours')}) - 1) < 0.001`, 'restore running 11/downtime 1');
  const hl = await cdp.eval(helperLine);
  ok(!!hl && hl.p === 12 && hl.r === 11 && hl.d === 1, 'helper line "Planned 12h − Running 11h = Downtime 1h" (' + JSON.stringify(hl) + ')');

  /* ── validation ── */
  console.log('== validation ==');
  await setNum('Running Hours', 13);
  try {
    await cdp.waitFor(`${JSON.stringify(fieldError('Running Hours'))}.includes('cannot exceed planned shift hours')`, 'over-planned error', 6000);
    ok(true, 'running 13 -> "Running hours cannot exceed planned shift hours."');
  } catch { ok(false, 'running 13 validation (got ' + await cdp.eval(fieldError('Running Hours')) + ')'); }
  await setNum('Running Hours', -1);
  try {
    await cdp.waitFor(`${JSON.stringify(fieldError('Running Hours'))}.includes('cannot be negative')`, 'negative error', 6000);
    ok(true, 'running -1 -> negative rejected');
  } catch { ok(false, 'running -1 validation (got ' + await cdp.eval(fieldError('Running Hours')) + ')'); }
  const dtAfterBad = await cdp.eval(numByLabel('Downtime Hours'));
  ok(Math.abs(dtAfterBad - 1) < 0.001, 'invalid running left downtime untouched at 1 (got ' + dtAfterBad + ')');

  /* ── KPI efficiency ── */
  console.log('== KPI ==');
  await setNum('Running Hours', 11);
  await cdp.waitFor(`Math.abs(${effShown} - 91.67) < 0.01`, 'efficiency 91.67%', 8000);
  ok(Math.abs(await cdp.eval(effShown) - 91.67) < 0.01, 'planned 12 / running 11 -> efficiency 91.67%');
  const achShown = `(() => { const card=[...document.querySelectorAll('.ant-card')].find(x=>x.querySelector('.ant-card-head-title')&&x.querySelector('.ant-card-head-title').textContent==='KPI Summary');
    const m=card.innerText.match(/Achievement %[^0-9-]*([0-9.-]+)%/); return m?parseFloat(m[1]):null; })()`;
  const achExp = Math.round(900 / (TARGET_QTY * 11 / 12) * 10000) / 100;
  ok(Math.abs(await cdp.eval(achShown) - achExp) < 0.05, 'achievement = actual / prorated target (' + achExp + '%)');

  /* ── save ── */
  console.log('== save (create) ==');
  await cdp.eval(`(()=>{const op=document.querySelector('input[placeholder="Operator on duty"]'); (${SET_INPUT})(op,'Hours E2E Op'); return 1})()`);
  const pickItem = async () => {
    await cdp.eval(`(()=>{const fi=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()==='Item / Product'); (${CLICK_AT})(fi.querySelector('.ant-select-selector')); return 1})()`);
    await cdp.waitFor(`!!document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')`, 'item dropdown');
    await cdp.eval(`(()=>{const dd=document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
      const opt=[...dd.querySelectorAll('.ant-select-item-option')].find(o=>o.textContent.includes('${ITEM.item_code}'))||dd.querySelector('.ant-select-item-option');
      (${CLICK_AT})(opt); return 1})()`);
    await new Promise((r) => setTimeout(r, 400));
  };
  await pickItem();
  await cdp.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Save Production Entry')); b.click(); return 1})()`);
  await new Promise((r) => setTimeout(r, 2000));
  const diag = await cdp.eval(`({url:location.pathname, errs:[...document.querySelectorAll('.ant-form-item-explain-error')].map(e=>e.textContent)})`);
  console.log('   [diag] after save:', JSON.stringify(diag));
  await cdp.waitFor(`location.pathname.endsWith('/production/entries/select')`, 'redirect after save', 25000);

  const st = await api('GET', `/production/entries/machine-status?entryDate=${DATE_A}&shiftId=${SH12.id}&departmentId=${dep.department_id}`);
  const row = (st.json.data || []).find((m) => m.machineCode === M.machine_code);
  ok(st.status === 200 && row && row.entries.length === 1, 'entry visible via API');
  const ENTRY_ID = row && row.entries[0] && row.entries[0].id;
  ok(!!ENTRY_ID, 'entry id captured');
  const saved = row.entries[0];
  ok(Math.abs(saved.actualQuantity - 900) < 0.001 && Math.abs(saved.targetQuantity - 600 * 11 / 12) < 0.01,
    'stored actual=900, pro-rated target=' + Math.round(600 * 11 / 12 * 10000) / 10000 + ' (got ' + saved.actualQuantity + '/' + saved.targetQuantity + ')');
  const det = await api('GET', '/production/entries/' + ENTRY_ID);
  ok(Math.abs(Number(det.json.data.runningHours) - 11) < 0.001 && Math.abs(Number(det.json.data.downtimeHours) - 1) < 0.001,
    'stored running=11 downtime=1 consistent pair');
  ok(Math.abs(Number(det.json.data.scrapQuantity) - 2) < 0.001, 'stored scrap=2');

  /* ── edit flow ── */
  console.log('== edit flow ==');
  await cdp.send('Page.navigate', { url: FRONT + '/production/entries/' + ENTRY_ID + '/edit' });
  await cdp.waitFor(`document.readyState === "complete"`, 'edit shell');
  await cdp.waitFor(`document.body.innerText.includes('Production Context')`, 'edit context summary', 20000);
  await cdp.waitFor(`Math.abs((${numByLabel('Running Hours')}) - 11) < 0.001 && Math.abs((${numByLabel('Downtime Hours')}) - 1) < 0.001`,
    'loaded 11/1 as stored', 15000);
  ok(true, 'edit opens with running=11 downtime=1');
  await setNum('Running Hours', 10);
  try {
    await cdp.waitFor(`Math.abs((${numByLabel('Downtime Hours')}) - 2) < 0.001`, 'downtime recalcs to 2', 8000);
    ok(true, 'edit: running 11->10 derives downtime 2.00');
  } catch { ok(false, 'edit recompute (got ' + await cdp.eval(numByLabel('Downtime Hours')) + ')'); }
  await cdp.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Update Production Entry')); b.click(); return 1})()`);
  await cdp.waitFor(`location.pathname.endsWith('/production/entries/${ENTRY_ID}')`, 'redirect after update', 25000);
  const det2 = await api('GET', '/production/entries/' + ENTRY_ID);
  ok(Math.abs(Number(det2.json.data.runningHours) - 10) < 0.001 && Math.abs(Number(det2.json.data.downtimeHours) - 2) < 0.001,
    'persisted after edit: running=10 downtime=2');

  /* ── antd warning guard (page-scoped) ── */
  console.log('== antd warnings (this page) ==');
  const badWarn = cdp.warnings.filter((w) =>
    /useForm.*not connected|`tip` only works|circular references/i.test(w));
  ok(badWarn.length === 0, 'no useForm/Spin-tip/circular-reference warnings on this page (' + badWarn.length + ')');
  if (badWarn.length) console.log('   warnings:', JSON.stringify(badWarn.slice(0, 4)));

  /* ── cleanup ── */
  await api('DELETE', '/production/entries/' + ENTRY_ID).catch(() => {});
  const tgRows = await c.query(`SELECT id FROM machine_targets WHERE remarks LIKE 'E2E-HOURS-%'`);
  for (const r of tgRows.rows) await api('DELETE', '/production/machine-targets/' + r.id).catch(() => {});
  await c.query(`DELETE FROM shifts WHERE company_id=$1 AND shift_code='SHIFT-E2E12'`, [COMPANY]);
  await c.end().catch(() => {});
  child.kill();

  console.log('\\nRESULT: pass=' + pass + ' fail=' + fail);
  if (failures.length) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
