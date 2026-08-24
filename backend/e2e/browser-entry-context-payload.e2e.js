/* ============================================================================
 * browser-entry-context-payload.e2e.js
 * REGRESSION GUARD for the Production Entry context/save data flow.
 *
 * Exact user scenario (spec section 12):
 *   Date       : 2026-08-24
 *   Shift      : Shift 1 (Morning) · 8h planned  -> SHIFT-A
 *   Machine    : FT-01
 *   Division   : CCD — Control Cable Division
 *   Section    : Spiral
 *   Department : Flattening
 *
 * Verifies:
 *  - compact Production Context labels display correctly
 *  - outgoing POST /production/entries carries REAL UUIDs + "YYYY-MM-DD"
 *    (never display labels), captured by a fetch interceptor
 *  - save succeeds (no "must be a UUID" errors)
 *  - edit + save keeps every context value intact (PUT payload + API)
 *  - incomplete context submits NOTHING (client-side guard)
 *  - Rejection % + Running/Downtime still work alongside the fix
 * ==========================================================================*/
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');
const BASE = process.env.API_BASE || 'http://localhost:3001/api/v1';
const FRONT = process.env.FRONT_BASE || 'http://localhost:3000';

/* ── exact-scenario master data ── */
const MACHINE_ID = 'f61bc882-412e-4779-b76e-91b8687c361e'; // FT-01
const MACHINE_CODE = 'FT-01';
const DIVISION_ID = 'd1000000-0000-0000-0000-000000000002'; // CCD — Control Cable Division
const SECTION_ID = 'd2000000-0000-0000-0000-000000000006'; // Spiral
const DEPARTMENT_ID = 'd3000000-0000-0000-0000-000000000010'; // Flattening
const SHIFT_ID = '4ff84e90-bbb2-4ef5-9c79-e193a3ffa37e'; // Shift 1 (Morning)
const DATE_A = '2026-08-24';
const PLANNED = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let passed = 0; let failed = 0;
let ENTRY_ID = '';
function ok(cond, msg) { if (cond) { passed++; console.log('  PASS ' + msg); } else { failed++; console.log('  FAIL ' + msg); } }

function launchBrowser(portNo) {
  const candidates = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'];
  const exe = candidates.find((p) => fs.existsSync(p));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-profile-'));
  const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + portNo, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  return { child, port: portNo };
}
class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.warnings = [];
    this.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); p(m.result); }
      else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'warning') {
        const t = m.params.args.map((a) => a.value !== undefined ? String(a.value) : '').join(' ');
        if (t.includes('useForm') || t.includes('circular references') || t.includes('tip')) this.warnings.push(t);
      }
    });
    return new Promise((r) => this.ws.addEventListener('open', () => r(this)));
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((res) => { this.pending.set(id, res); try { this.ws.send(JSON.stringify({ id, method, params })); } catch {} }); }
  async eval(e) {
    const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || e).slice(0, 300));
    return r.result && r.result.value;
  }
  async waitFor(expr, label, timeoutMs = 15000) {
    const t0 = Date.now();
    for (;;) {
      let v = false; try { v = await this.eval(expr); } catch {}
      if (v) return v;
      if (Date.now() - t0 > timeoutMs) throw new Error('FATAL timeout waiting for: ' + label);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

const SET_INPUT = `(el, val) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value'); d.set.call(el, String(val)); el.dispatchEvent(new Event('input', { bubbles: true })); }`;
const CLICK_AT = `(el) => { const r = el.getBoundingClientRect(); [{type:'mousedown',b:1},{type:'mouseup',b:1},{type:'click',b:0}].forEach(s=>el.dispatchEvent(new MouseEvent(s.type,{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}))); }`;

(async () => {
  /* login */
  const lr = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) });
  if (!lr.ok) throw new Error('login failed');
  const lj = await lr.json(); const token = lj.token;

  /* pg fixtures */
  const { Client } = require('pg');
  const c = await new Promise((res, rej) => { const x = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } }); x.connect().then(() => res(x)).catch(rej); });
  const ITEM = (await c.query(`SELECT i.id, i.item_code FROM items i JOIN uoms u ON u.id=i.base_uom_id WHERE i.company_id=$1 AND i.status='ACTIVE' AND u.code IN ('KG','PCS','METER') ORDER BY i.created_at LIMIT 1`, [lj.user.companyId])).rows[0];
  if (!ITEM) throw new Error('no suitable item');
  await c.query(`DELETE FROM production_entries WHERE machine_id=$1 AND shift_id=$2 AND entry_date::date=$3::date AND company_id=$4`, [MACHINE_ID, SHIFT_ID, DATE_A, lj.user.companyId]);
  const ts = Date.now();
  await c.query(`DELETE FROM machine_targets WHERE remarks LIKE 'E2E-CTX-%'`);
  await c.query(`INSERT INTO machine_targets (company_id, machine_id, item_id, shift_id, standard_hours, target_quantity, production_uom_id, effective_from, status, is_active, remarks, created_at, updated_at)
    VALUES ($1,$2,$3,$4,8,400,$5,$6::date,'ACTIVE',true,'E2E-CTX-'||$7, now(), now())`,
    [lj.user.companyId, MACHINE_ID, ITEM.id, SHIFT_ID, ITEM.base_uom_id || (await c.query(`SELECT base_uom_id FROM items WHERE id=$1`, [ITEM.id])).rows[0].base_uom_id, DATE_A, String(ts)]);
  console.log('== setup ==');
  ok(true, 'fixtures ready (item ' + ITEM.item_code + ', target 400/8h @ ' + DATE_A + ')');

  /* browser */
  const { child, port } = launchBrowser(9357);
  for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
  const tabRes = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' }).catch(() => fetch('http://127.0.0.1:' + port + '/json/new?about:blank'));
  const tab = await tabRes.json();
  const cdp = await new Cdp(tab.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');

  /* fetch interceptor installed BEFORE any app script runs */
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (function(){ if (window.__capInstalled) return; window.__capInstalled = true; window.__captured = [];
      const orig = window.fetch;
      window.fetch = function(input, init) {
        try {
          const url = typeof input === 'string' ? input : (input && input.url) || '';
          const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
          if (url.includes('/production/entries') && ['POST','PUT'].includes(method)) {
            let body = null; try { body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body; } catch(e) {}
            window.__captured.push({ method, url, body });
          }
        } catch(e) {}
        return orig.apply(this, arguments);
      };
    })();` });

  await cdp.send('Page.navigate', { url: FRONT + '/login' });
  await cdp.waitFor(`document.readyState === "complete"`, 'login page');
  await cdp.eval(`localStorage.setItem('token', ${JSON.stringify(token)}); localStorage.setItem('refresh_token','e2e');
    localStorage.setItem('erp_user', ${JSON.stringify(JSON.stringify(lj.user || {}))}); true`);

  const LOCKED_URL = `${FRONT}/production/entries/new?from=select&machineId=${MACHINE_ID}&entryDate=${DATE_A}&shiftId=${SHIFT_ID}&divisionId=${DIVISION_ID}&sectionId=${SECTION_ID}&departmentId=${DEPARTMENT_ID}`;

  /* ── §12: exact scenario, CREATE ── */
  console.log('== create: exact scenario ==');
  await cdp.send('Page.navigate', { url: LOCKED_URL });
  await cdp.waitFor(`document.readyState === "complete"`, 'new entry page');
  await cdp.waitFor(`document.body.innerText.includes('Production Context')`, 'context summary', 20000);
  await cdp.waitFor(`!!document.querySelector('.ant-input-number-input')`, 'form fields', 15000);
  await new Promise((r) => setTimeout(r, 1200)); // let target resolution settle

  const labels = await cdp.eval(`({
    hasMachine: document.body.innerText.includes('${MACHINE_CODE}'),
    hasShift: document.body.innerText.includes('Shift 1 (Morning)'),
    hasPlanned: document.body.innerText.includes('8h planned'),
    hasDep: document.body.innerText.includes('Flattening'),
    hasSec: document.body.innerText.includes('Spiral'),
    hasDiv: document.body.innerText.toLowerCase().includes('control cable division'),
    hasDate: document.body.innerText.includes('24 Aug 2026'),
  })`);
  ok(labels.hasMachine && labels.hasShift && labels.hasDep && labels.hasSec && labels.hasDiv, 'context labels displayed (machine/shift/dept/section/division)');
  ok(labels.hasDate, 'date displayed as 24 Aug 2026');

  /* target resolved? */
  const tgt = await cdp.waitFor(`(() => { const el=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()==='Target Quantity'); const inp=el&&el.querySelector('.ant-input-number-input'); return inp?parseFloat(inp.value)||0:null; })() > 0`, 'target auto-populated', 12000)
    ? await cdp.eval(`(() => { const el=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()==='Target Quantity'); return parseFloat(el.querySelector('.ant-input-number-input').value); })()`) : 0;
  ok(tgt === 400, 'target auto-resolved to 400 (got ' + tgt + ')');

  /* fill production figures */
  await cdp.eval(`(()=>{const op=document.querySelector('input[placeholder="Operator on duty"]'); (${SET_INPUT})(op,'Ctx E2E Op'); return 1})()`);
  await cdp.eval(`(()=>{const fi=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()==='Item / Product'); (${CLICK_AT})(fi.querySelector('.ant-select-selector')); return 1})()`);
  await cdp.waitFor(`!!document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')`, 'item dropdown');
  await cdp.eval(`(()=>{const dd=document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    const opt=[...dd.querySelectorAll('.ant-select-item-option')].find(o=>o.textContent.includes('${ITEM.item_code}'))||dd.querySelector('.ant-select-item-option');
    (${CLICK_AT})(opt); return 1})()`);
  await new Promise((r) => setTimeout(r, 500));

  const setNum = async (label, v) => {
    await cdp.eval(`(()=>{const fi=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()===${JSON.stringify(label)});
      const el=fi.querySelector('.ant-input-number-input'); (${SET_INPUT})(el, ${JSON.stringify(v)}); return 1})()`);
    await new Promise((r) => setTimeout(r, 300));
  };
  /* Running/Downtime: planned 8, set running 7 -> downtime derives to 1 (§9B) */
  await setNum('Running Hours', 7);
  const dtVal = await cdp.eval(`parseFloat([...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()==='Downtime Hours').querySelector('.ant-input-number-input').value)`);
  ok(Math.abs(dtVal - 1) < 0.001, 'running 7 of planned 8 -> downtime derived 1h (got ' + dtVal + ')');
  const dtDisabled = await cdp.eval(`(()=>{const fi=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()==='Downtime Hours'); return !!fi.querySelector('.ant-input-number-disabled') || fi.querySelector('.ant-input-number-input').disabled;})()`);
  ok(dtDisabled, 'downtime is derived/read-only');
  /* Rejection %: 10 / (350+10) = 2.78% */
  await setNum('Actual Good Production', 350);
  await setNum('Rejection / Scrap', 10);
  await cdp.waitFor(`(() => { const card=[...document.querySelectorAll('.ant-card')].find(x=>x.querySelector('.ant-card-head-title')&&x.querySelector('.ant-card-head-title').textContent==='KPI Summary');
    if(!card) return false; const m=card.innerText.match(/Rejection %[^0-9-]*([0-9.-]+)%/); return m && Math.abs(parseFloat(m[1])-2.78)<0.01; })()`, 'rejection % 2.78', 8000);
  ok(true, 'Rejection % live: 10/(350+10)=2.78%');

  /* SAVE */
  const capBefore = await cdp.eval(`window.__captured.length`);
  await cdp.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Save Production Entry')); b.click(); return 1})()`);
  await cdp.waitFor(`location.pathname === '/production/entries/select'`, 'redirect after save', 20000);
  await new Promise((r) => setTimeout(r, 600));
  const caps = await cdp.eval(`window.__captured.slice(${JSON.stringify(0)}).filter(x=>x.method==='POST'&&x.url.includes('/production/entries')&&!x.url.includes('machine-target'))`);
  ok(caps.length >= 1, 'POST /production/entries was intercepted (' + caps.length + ')');
  const body = caps[caps.length - 1].body;
  const ctxFields = ['divisionId', 'sectionId', 'departmentId', 'shiftId'];
  for (const k of ctxFields) ok(UUID_RE.test(String(body[k] || '')), k + ' is a real UUID (' + String(body[k]).slice(0, 8) + '…)');
  ok(String(body.entryDate) === DATE_A, 'entryDate normalized "' + body.entryDate + '" === ' + DATE_A);
  ok(UUID_RE.test(String(body.machineId || '')) && body.machineId === MACHINE_ID, 'machineId is the real FT-01 id');
  ok(body.divisionId === DIVISION_ID && body.sectionId === SECTION_ID && body.departmentId === DEPARTMENT_ID && body.shiftId === SHIFT_ID,
    'all four context UUIDs match the selection context exactly');
  const idVals = [body.divisionId, body.sectionId, body.departmentId, body.shiftId, body.machineId];
  const noLabels = ['Control Cable Division', 'Spiral', 'Flattening', 'Morning', 'Aug 2026'].every(l => !idVals.includes(l));
  ok(noLabels, 'no display labels used as IDs');

  /* server truth */
  const ms = await fetch(`${BASE}/production/entries/machine-status?entryDate=${DATE_A}&divisionId=${DIVISION_ID}&sectionId=${SECTION_ID}&departmentId=${DEPARTMENT_ID}`, { headers: { Authorization: `Bearer ${token}` } });
  const msj = await ms.json();
  const ftRow = (msj.data || []).find((r) => r.machineCode === MACHINE_CODE);
  ok(ftRow && ftRow.status === 'ALREADY_ENTERED', 'backend shows FT-01 ALREADY_ENTERED (save really landed)');
  const det = await fetch(`${BASE}/production/entries/${ftRow.entryId}`, { headers: { Authorization: `Bearer ${token}` } });
  const dj = await det.json(); const d0 = dj.data;
  ok(d0.divisionId === DIVISION_ID && d0.sectionId === SECTION_ID && d0.departmentId === DEPARTMENT_ID && d0.shiftId === SHIFT_ID && d0.machineId === MACHINE_ID, 'persisted row carries all five context IDs');
  ok(String(d0.entryDate).slice(0, 10) === DATE_A, 'persisted entryDate is ' + DATE_A);
  ENTRY_ID = d0.id;

  /* ── §13: EDIT regression ── */
  console.log('== edit: context preserved ==');
  await cdp.send('Page.navigate', { url: `${FRONT}/production/entries/${ENTRY_ID}/edit` });
  await cdp.waitFor(`document.readyState === "complete"`, 'edit page');
  await cdp.waitFor(`document.body.innerText.includes('Production Context')`, 'edit summary', 20000);
  await cdp.waitFor(`(() => { const f=[...document.querySelectorAll('.ant-form-item')].find(x=>x.querySelector('label')&&x.querySelector('label').textContent.trim()==='Running Hours'); const i=f&&f.querySelector('.ant-input-number-input'); return i&&Math.abs(parseFloat(i.value)-7)<0.01; })()`, 'edit loaded running=7', 20000);
  const dtEdit = await cdp.eval(`parseFloat([...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()==='Downtime Hours').querySelector('.ant-input-number-input').value)`);
  ok(Math.abs(dtEdit - 1) < 0.001, 'edit loaded downtime=1 (derived pair intact)');
  await setNum('Actual Good Production', 355);
  await cdp.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Update')); b.click(); return 1})()`);
  await cdp.waitFor(`location.pathname.includes('${ENTRY_ID}')`, 'redirect to detail after update', 20000);
  await new Promise((r) => setTimeout(r, 500));
  const puts = await cdp.eval(`window.__captured.filter(x=>x.method==='PUT'&&x.url.includes('/production/entries/'))`);
  ok(puts.length >= 1, 'PUT intercepted');
  const ub = puts[puts.length - 1].body;
  ok(UUID_RE.test(String(ub.divisionId || '')) && ub.divisionId === DIVISION_ID, 'edit keeps divisionId');
  ok(UUID_RE.test(String(ub.sectionId || '')) && ub.sectionId === SECTION_ID, 'edit keeps sectionId');
  ok(UUID_RE.test(String(ub.departmentId || '')) && ub.departmentId === DEPARTMENT_ID, 'edit keeps departmentId');
  ok(UUID_RE.test(String(ub.shiftId || '')) && ub.shiftId === SHIFT_ID, 'edit keeps shiftId');
  ok(ub.machineId === MACHINE_ID, 'edit keeps machineId');
  ok(String(ub.entryDate) === DATE_A, 'edit keeps entryDate ' + DATE_A);
  const det2 = await fetch(`${BASE}/production/entries/${ENTRY_ID}`, { headers: { Authorization: `Bearer ${token}` } });
  const d2 = (await det2.json()).data;
  ok(d2.actualQuantity === 355, 'update applied (actualQuantity 355)');
  ok(d2.runningHours === 7 && Number(d2.downtimeHours) === 1, 'hours survived edit (7 / 1)');
  ok(d2.divisionId === DIVISION_ID && d2.sectionId === SECTION_ID && d2.departmentId === DEPARTMENT_ID && d2.shiftId === SHIFT_ID && d2.machineId === MACHINE_ID && String(d2.entryDate).slice(0, 10) === DATE_A, 'persisted context unchanged after edit');

  /* ── §15: incomplete context submits nothing ── */
  console.log('== guard: missing context ==');
  await cdp.send('Page.navigate', { url: `${FRONT}/production/entries/new?from=select&machineId=${MACHINE_ID}&entryDate=${DATE_A}` });
  await cdp.waitFor(`document.readyState === "complete"`, 'partial-context page');
  await cdp.waitFor(`!!document.querySelectorAll('.ant-select-selector').length`, 'free-form fields rendered', 15000);
  const capN0 = await cdp.eval(`window.__captured.length`);
  await cdp.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Save Production Entry')); b.click(); return 1})()`);
  await new Promise((r) => setTimeout(r, 1200));
  const errs = await cdp.eval(`[...document.querySelectorAll('.ant-form-item-explain-error')].map(e=>e.textContent)`);
  const capN1 = await cdp.eval(`window.__captured.length`);
  ok(capN1 === capN0, 'NO request sent for incomplete context');
  ok(errs.some(e => /required/i.test(e)), 'antd required-errors guide the user (' + errs.length + ' shown)');

  /* warnings guard */
  ok(cdp.warnings.filter(w => w.includes('useForm')).length === 0, 'no useForm-not-connected warning');
  ok(cdp.warnings.filter(w => w.includes('tip')).length === 0, 'no Spin tip warning');
  ok(cdp.warnings.filter(w => w.includes('circular references')).length === 0, 'no circular-references warning');

  /* cleanup */
  await c.query(`DELETE FROM production_entries WHERE id=$1`, [ENTRY_ID]);
  await c.query(`DELETE FROM machine_targets WHERE remarks LIKE 'E2E-CTX-%'`);
  await c.end();
  child.kill();
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(async (e) => { console.error('FATAL ' + e.message); process.exit(1); });
