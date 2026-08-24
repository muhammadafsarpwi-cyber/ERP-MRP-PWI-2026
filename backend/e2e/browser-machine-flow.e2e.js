/* Browser E2E (real Chromium via CDP): production-entry machine-selection flow + ERP-00016 target auto-fill + downtime→running + KPI threshold card
 * Run: node e2e/browser-machine-flow.e2e.js   (backend :3001, frontend dev server :3000)
 * Covers: select-screen tiles/counters/button gating -> locked create form with compact
 *         Production Context summary -> TARGET AUTO-POPULATED from the active Machine
 *         Target (never typed) -> downtime reduces Running Hours (planned − downtime) ->
 *         save -> redirect back with flipped status -> EDIT persists without DTO errors ->
 *         Achievement % indicator rule + theme tokens + meaningful header titles.
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
const DATE_C = '2027-03-17';

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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ minimal CDP client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
  const port = 9337;
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
    this.closed = false;
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
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

async function main() {
  /* â”€â”€ login + fixtures â”€â”€ */
  console.log('== setup (API + fixtures) ==');
  const lr = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  expect(lr.status === 200 || lr.status === 201, 'api login ok');
  const lj = await lr.json();
  token = lj.token || lj.accessToken || (lj.data && lj.data.accessToken);
  const USER = lj.user || (lj.data && lj.data.user) || { email: EMAIL };
  expect(!!token, 'token acquired');

  const c = await db();
  const depQ = await c.query(`
    SELECT m.department_id, m.division_id, m.section_id, d.name AS dept_name, COUNT(*) AS machine_count
    FROM machines m JOIN departments d ON d.id = m.department_id
    WHERE m.is_active = true AND m.department_id IS NOT NULL AND m.division_id IS NOT NULL AND m.section_id IS NOT NULL
    GROUP BY m.department_id, m.division_id, m.section_id, d.name
    HAVING COUNT(*) >= 2 ORDER BY machine_count DESC LIMIT 1`);
  const dep = depQ.rows[0];
  expect(!!dep, 'fixture department resolved' + (dep ? ' (' + dep.dept_name + ')' : ''));

  const machQ = await c.query(`
    SELECT id, machine_code FROM machines
    WHERE department_id = $1 AND is_active = true ORDER BY machine_code ASC`, [dep.department_id]);
  const machines = machQ.rows;
  const COMPANY = (await c.query('SELECT company_id FROM machines WHERE id=$1', [machines[0].id])).rows[0].company_id;

  const shiftQ = await c.query(`SELECT id, shift_code, planned_hours FROM shifts WHERE company_id=$1 AND is_active=true AND shift_code IN ('SHIFT-A','SHIFT-B') ORDER BY shift_code`, [COMPANY]);
  const SHIFT_A = shiftQ.rows.find((s) => s.shift_code === 'SHIFT-A');
  expect(!!SHIFT_A, 'SHIFT-A resolved');
  const PLANNED = Number(SHIFT_A.planned_hours);
  expect(PLANNED > 0, 'SHIFT-A planned_hours=' + PLANNED);

  const itemQ = await c.query(`
    SELECT i.id, i.item_code, i.base_uom_id FROM items i
    JOIN uoms u ON u.id = i.base_uom_id
    WHERE i.company_id = $1 AND i.status = 'ACTIVE' AND u.code IN ('KG','PCS','METER')
    ORDER BY i.created_at LIMIT 1`, [COMPANY]);
  const ITEM = itemQ.rows[0];
  expect(!!ITEM, 'item with KG/PCS/METER base uom resolved' + (ITEM ? ' (' + ITEM.item_code + ')' : ''));
  const uomCode = (await c.query('SELECT code FROM uoms WHERE id=$1', [ITEM.base_uom_id])).rows[0].code;

  // machine targets for SP-01/SP-03/SP-04/SP-05 (DATE_A) and SP-06 (DATE_C) x SHIFT-A
  const TARGET_IDS = [];
  const M1 = machines[0], M3 = machines[2], M4 = machines[3], M5 = machines[4], M6 = machines[5];
  const ALL_MACHINES = [M1, M3, M4, M5, M6];
  const FREE_IDS = []; // free-text control rows (steering the KPI aggregate)
  // deterministic start: wipe leftovers from any previously aborted run
  {
    const lc = await c.query(
      `SELECT id FROM production_entries WHERE company_id=$1 AND entry_date = ANY($2::date[]) AND shift_id=$3 AND machine_id = ANY($4::uuid[]) AND is_active = true`,
      [COMPANY, [DATE_A, DATE_C], SHIFT_A.id, ALL_MACHINES.map((m) => m.id)]);
    for (const r of lc.rows) await api('DELETE', '/production/entries/' + r.id).catch(() => {});
    if (lc.rows.length) console.log('  ---- pre-cleaned ' + lc.rows.length + ' leftover test entr(ies)');
  }
  for (const m of ALL_MACHINES) {
    const ex = await c.query(
      `SELECT id FROM machine_targets
       WHERE machine_id=$1 AND shift_id=$2 AND status='ACTIVE' AND is_active = true
         AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $3::date)
       ORDER BY created_at DESC LIMIT 1`,
      [m.id, SHIFT_A.id, DATE_A]);
    if (ex.rows[0]) {
      TARGET_IDS.push(ex.rows[0].id);
      console.log('  ---- machine-target already present for ' + m.machine_code + ' (reusing)');
    } else {
      const tcr = await api('POST', '/production/machine-targets', {
        machineId: m.id, shiftId: SHIFT_A.id, uomId: ITEM.base_uom_id,
        standardHours: 8, targetQuantity: 500, effectiveFrom: '2027-01-01',
        remarks: 'E2E-BROWSER-' + Date.now(),
      });
      expect(tcr.status === 201 && !!tcr.json.id, 'machine-target created for ' + m.machine_code);
      TARGET_IDS.push(tcr.json.id);
    }
  }

  // seed one entry via API so SP-01 shows green before we touch the UI
  let SEED_ENTRY_ID = null;
  const ensureEntry = async (m, date, actual) => {
    const exE = await c.query(
      `SELECT id FROM production_entries WHERE company_id=$1 AND entry_date=$2 AND shift_id=$3 AND machine_no=$4 AND is_active = true LIMIT 1`,
      [COMPANY, date, SHIFT_A.id, m.machine_code]);
    if (exE.rows[0]) { console.log('  ---- seed entry already present for ' + m.machine_code + ' (reusing)'); return exE.rows[0].id; }
    const r = await api('POST', '/production/entries', {
      divisionId: dep.division_id, sectionId: dep.section_id, departmentId: dep.department_id,
      entryDate: date, shiftId: SHIFT_A.id, machineId: m.id, machineNo: m.machine_code,
      itemId: ITEM.id, operatorName: 'Browser E2E Seed',
      actualQuantity: actual, runningHours: 7, downtimeHours: 1, scrapQuantity: 2,
    });
    if (r.status !== 201) console.log('  [debug] seed create (' + m.machine_code + '):', JSON.stringify(r.json));
    expect(r.status === 201, 'seed entry created for ' + m.machine_code + '@' + date + ' (' + r.status + ')');
    return r.json && r.json.id;
  };
  SEED_ENTRY_ID = await ensureEntry(M1, DATE_A, 80);   // green tile for the select screen
  await ensureEntry(M4, DATE_A, 100);                  // low performer
  await ensureEntry(M5, DATE_A, 300);                  // mid performer
  await ensureEntry(M6, DATE_C, 306.25);               // exactly 70.00% on its own filtered page

  // dynamic expectations for the select screen (extra seed rows must not break asserts)
  const stPre = await api('GET', `/production/entries/machine-status?entryDate=${DATE_A}&shiftId=${SHIFT_A.id}&departmentId=${dep.department_id}`);
  expect(stPre.status === 200 && !!stPre.json.meta, 'pre-UI machine-status fetched');
  const EXP_ENTERED = stPre.json.meta.enteredCount;
  const EXP_REQUIRED = stPre.json.meta.entryRequiredCount;
  console.log('  ---- expected counters: entered=' + EXP_ENTERED + ' required=' + EXP_REQUIRED);


  // guaranteed cleanup: sweeps entries for our test machines + our marked targets
  const cleanupAll = async (extraTargetIds = []) => {
    const cc = await db();
    try {
      const rows = await cc.query(
        `SELECT id FROM production_entries WHERE company_id=$1 AND entry_date = ANY($2::date[]) AND shift_id=$3 AND (machine_id = ANY($4::uuid[]) OR operator_name = 'Browser E2E Free') AND is_active = true`,
        [COMPANY, [DATE_A, DATE_C], SHIFT_A.id, ALL_MACHINES.map((m) => m.id)]);
      for (const r of rows.rows) await api('DELETE', '/production/entries/' + r.id).catch(() => {});
      const tg = await cc.query(
        `SELECT id FROM machine_targets WHERE remarks LIKE 'E2E-BROWSER-%'
         UNION SELECT id FROM machine_targets WHERE id = ANY($1::uuid[]) AND remarks LIKE 'E2E-BROWSER-%'`,
        [extraTargetIds]);
      for (const r of tg.rows) await api('DELETE', '/production/machine-targets/' + r.id).catch(() => {});
    } finally { await cc.end().catch(() => {}); }
  };

  /* â”€â”€ browser â”€â”€ */
  console.log('== browser: machine-selection flow ==');
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
    const goto = async (url) => { await cdp.send('Page.navigate', { url }); await cdp.waitFor('document.readyState === "complete"', 'ready ' + url); };

    // authenticate on the SPA origin
    await goto(FRONT + '/login');
    await cdp.eval(`localStorage.setItem('token', ${JSON.stringify(token)});
      localStorage.setItem('refresh_token', 'e2e');
      localStorage.setItem('erp_user', ${JSON.stringify(JSON.stringify(USER))}); true`);

    // Step 1 screen
    const selectUrl = FRONT + '/production/entries/select?entryDate=' + DATE_A +
      '&shiftId=' + SHIFT_A.id + '&departmentId=' + dep.department_id;
    await goto(selectUrl);
    await cdp.waitFor(`/Total Machines:\\s*\\d+/.test(document.body.innerText) && /Entry Required:\\s*\\d+/.test(document.body.innerText)`,
      'select screen counters populated', 25000);

    const txt = await cdp.eval('document.body.innerText');
    expect(/Total Machines:\s*14/.test(txt), 'counter Total Machines: 14 rendered');
    expect(new RegExp('Entered:\\s*' + EXP_ENTERED + '\\b').test(txt), 'counter Entered: ' + EXP_ENTERED + ' rendered');
    expect(new RegExp('Entry Required:\\s*' + EXP_REQUIRED + '\\b').test(txt), 'counter Entry Required: ' + EXP_REQUIRED + ' rendered');
    expect(txt.includes('Already Entered') && txt.includes('Entry Required'), 'tile status labels rendered');

    // find a machine's tile by climbing up from its code-bearing node to the card root
    const TILE_FN = `(code) => {
      let node = [...document.querySelectorAll('div,span')].reverse()
        .find(n => n.childElementCount === 0 && n.textContent.trim() === code);
      while (node && !/Already Entered|Entry Required/.test(node.innerText)) node = node.parentElement;
      if (!node) return null;
      return { entered: node.innerText.includes('Already Entered'),
               btns: [...node.querySelectorAll('button')].map(b=>b.textContent.trim()) };
    }`;
    const tileInfo = await cdp.eval(`(() => {
      const fn = ${TILE_FN};
      const out = {};
      for (const code of ['${M1.machine_code}', '${M3.machine_code}']) out[code] = fn(code);
      return out;
    })()`);
    expect(tileInfo[M1.machine_code] && tileInfo[M1.machine_code].entered, M1.machine_code + ' tile flagged Already Entered');
    expect(tileInfo[M1.machine_code] && !tileInfo[M1.machine_code].btns.includes('Select'),
      M1.machine_code + ' tile has NO Select button');
    expect(tileInfo[M1.machine_code] && tileInfo[M1.machine_code].btns.some(b => b.startsWith('View / Edit')),
      M1.machine_code + ' tile offers View / Edit');
    expect(tileInfo[M3.machine_code] && !tileInfo[M3.machine_code].entered &&
      tileInfo[M3.machine_code].btns.includes('Select'), M3.machine_code + ' tile flagged Entry Required with Select button');

    // open the create form via the real Select button (climb to tile root first)
    const clicked = await cdp.eval(`(() => {
      const fn = ${TILE_FN};
      const node = [...document.querySelectorAll('div,span')].reverse()
        .find(n => n.childElementCount === 0 && n.textContent.trim() === '${M3.machine_code}');
      let t = node;
      while (t && !/Already Entered|Entry Required/.test(t.innerText)) t = t.parentElement;
      if (!t) return false;
      const sel = [...t.querySelectorAll('button')].find(b => b.textContent.trim() === 'Select');
      if (!sel) return false;
      sel.click(); return true;
    })()`);
    if (!clicked) console.log('  [debug] Select button not found for ' + M3.machine_code);
    expect(clicked === true, 'Select button clickable on ' + M3.machine_code + ' tile');
    await cdp.waitFor(`location.pathname.endsWith('/production/entries/new') && location.search.includes('from=select') && location.search.includes('machineId=${M3.id}')`,
      'navigated to prefilled create form', 15000);
    await cdp.waitFor(`document.body.innerText.includes('Production Context')`, 'compact Production Context summary shown', 15000);
    const formTxt = await cdp.eval('document.body.innerText');
    expect(formTxt.includes('Locked by the machine-selection step'), 'lock explanation shown');

    /* header title must be meaningful, never the bare URL segment */
    const headerTitle = await cdp.eval(`((document.querySelector('.erp-app-header span') || {}).textContent || '').trim()`);
    expect(headerTitle === 'New Production Entry', 'header shows "New Production Entry" (got "' + headerTitle + '")');

    /* redundant context fields are REMOVED from the detailed form — context is a summary */
    const dupCtxFields = await cdp.eval(`(() => {
      const wanted = ['Division', 'Section', 'Department', 'Date', 'Shift'];
      return wanted.filter((l) => [...document.querySelectorAll('.ant-form-item label')]
        .some((x) => x.textContent.trim() === l)).length;
    })()`);
    expect(dupCtxFields === 0, 'no duplicated Division/Section/Department/Date/Shift form fields (' + dupCtxFields + ' left)');

    /* summary carries every locked dimension */
    const ctxTxt = await cdp.eval(`[...document.querySelectorAll('.ant-card')].map(x=>x.innerText).join('|')`);
    expect(ctxTxt.includes('15 Mar 2027'), 'context summary shows the date');
    expect(ctxTxt.includes('${M3.machine_code}'), 'context summary shows the machine code');
    for (const lbl of ['Date', 'Shift', 'Machine No.', 'Department', 'Section', 'Division']) {
      expect(ctxTxt.includes(lbl), 'context summary shows ' + lbl);
    }

    /* machine/date are not editable inputs in locked mode either */
    const machInput = await cdp.eval(`(() => {
      const fi = [...document.querySelectorAll('.ant-form-item')].find(f =>
        f.querySelector('label') && f.querySelector('label').textContent.trim() === 'Machine No.');
      return fi ? !!fi.querySelector('input') : false;
    })()`);
    expect(machInput === false, 'Machine No. has no editable input (summary only)');

    /* ── TARGET AUTO-FILL: value appears from the Machine Target master WITHOUT typing ── */
    console.log('== browser: ERP-00016 target auto-resolution ==');
    const EXP_T = (hours) => Math.round(500 * hours / 8 * 10000) / 10000;
    const targetFieldText = `(() => {
      const el = document.querySelector('.target-auto-field');
      if (!el) return null;
      const m = el.innerText.replace(/[^0-9.]/g, '.').match(/([0-9]+\\.?[0-9]*)/);
      return m ? parseFloat(m[1]) : null;
    })()`;
    const EXP_T0 = EXP_T(PLANNED); // downtime still at its 0 default -> running == planned
    await cdp.waitFor(`(() => { const v = ${targetFieldText}(); return v !== null && Math.abs(v - ${EXP_T0}) < 0.0001; })()`,
      'target AUTO-populated to ' + EXP_T0 + ' (standard 500 / 8h x planned ' + PLANNED + 'h)', 20000);
    const noTargetInput = await cdp.eval(`!!document.querySelector('.target-auto-field input') === false`);
    expect(noTargetInput, 'target field is read-only presentation (no input to type into)');
    // UOM is locked to the target's unit
    await cdp.waitFor(`(() => {
      const fi = [...document.querySelectorAll('.ant-form-item')].find(f =>
        f.querySelector('label') && f.querySelector('label').textContent.trim() === 'UOM Type');
      return fi && fi.querySelector('.ant-select.ant-select-disabled');
    })()`, 'UOM select locked to Machine Target unit', 15000);

    /* ── DOWNTIME → RUNNING HOURS derivation (planned − downtime) ── */
    console.log('== browser: downtime reduces running hours ==');
    const runningValueExpr = `(() => {
      const fi = [...document.querySelectorAll('.ant-form-item')].find(f =>
        f.querySelector('label') && f.querySelector('label').textContent.trim() === 'Running Hours');
      const inp = fi && fi.querySelector('.ant-input-number-input');
      return inp ? parseFloat(inp.value) : null;
    })()`;
    await cdp.waitFor(`(() => { const v = ${runningValueExpr}; return v !== null && Math.abs(v - ${PLANNED}) < 0.001; })()`,
      'running hours initially derived as planned (' + PLANNED.toFixed(2) + ')', 10000);
    const runInputDisabled = await cdp.eval(`(() => {
      const fi = [...document.querySelectorAll('.ant-form-item')].find(f =>
        f.querySelector('label') && f.querySelector('label').textContent.trim() === 'Running Hours');
      const wrap = fi && fi.querySelector('.ant-input-number');
      return !!(wrap && (wrap.className.includes('ant-input-number-disabled') || wrap.className.includes('ant-input-number-readonly')));
    })()`);
    expect(runInputDisabled, 'Running Hours input is read-only/derived');

    const setInputByLabel = async (label, val) => {
      await cdp.eval(`(()=>{const fi=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()===${JSON.stringify(label)});
        const inp=fi.querySelector('.ant-input-number-input'); (${SET_INPUT})(inp, ${JSON.stringify(val)}); return 1})()`);
    };

    await setInputByLabel('Downtime Hours', 1);
    await cdp.waitFor(`(() => { const v = ${runningValueExpr}; return v !== null && Math.abs(v - (${PLANNED} - 1)) < 0.001; })()`,
      'downtime 1h -> running ' + (PLANNED - 1).toFixed(2), 10000);
    await cdp.waitFor(`(() => { const v = ${targetFieldText}(); return v !== null && Math.abs(v - ${EXP_T(PLANNED - 1)}) < 0.0001; })()`,
      'target re-pro-rated to running ' + (PLANNED - 1) + 'h -> ' + EXP_T(PLANNED - 1), 15000);

    await setInputByLabel('Downtime Hours', 2);
    await cdp.waitFor(`(() => { const v = ${runningValueExpr}; return v !== null && Math.abs(v - (${PLANNED} - 2)) < 0.001; })()`,
      'downtime 2h -> running ' + (PLANNED - 2).toFixed(2), 10000);
    await setInputByLabel('Downtime Hours', 1); // final entry uses 1h downtime

    /* operator types ONLY genuine production fields — never the target */
    await cdp.eval(`(() => {
      const op = document.querySelector('input[placeholder="Operator on duty"]');
      (${SET_INPUT})(op, 'Browser E2E Operator'); return true;
    })()`);

    const pickOption = async (labelText, match) => {
      await cdp.eval(`(()=>{const fi=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()===${JSON.stringify(labelText)});(${CLICK_AT})(fi.querySelector('.ant-select-selector'));return 1})()`);
      await cdp.waitFor(`!!document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')`, 'dropdown open ' + labelText);
      await cdp.eval(`(()=>{const dd=document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
        const opt=[...dd.querySelectorAll('.ant-select-item-option')].find(o=>o.textContent.includes(${JSON.stringify(match)}))||dd.querySelector('.ant-select-item-option');
        (${CLICK_AT})(opt); return 1})()`);
      await new Promise((r) => setTimeout(r, 350));
    };
    await pickOption('Item / Product', ITEM.item_code);

    const needUom = await cdp.eval(`(()=>{const fi=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()==='UOM Type');
      return !!fi.querySelector('.ant-select-selection-placeholder')})()`);
    if (needUom) await pickOption('UOM Type', uomCode + ' ');

    await setInputByLabel('Actual Good Production', 300);

    // confirm the operator never typed a target: the payload the server received
    // must store the server-resolved value (assert after save via API below).
    await cdp.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Save Production Entry')); b.click(); return 1})()`);

    // diagnostics: what happened right after submit?
    await new Promise((r) => setTimeout(r, 2500));
    const diag = await cdp.eval(`(() => ({
      url: location.pathname + location.search,
      errs: [...document.querySelectorAll('.ant-form-item-explain-error')].map(e=>e.textContent),
      msg: (document.querySelector('.ant-message') || {}).innerText || '',
      notif: (document.querySelector('.ant-notification') || {}).innerText || ''
    }))()`);
    console.log('   [diag] after save click:', JSON.stringify(diag));

    // success = redirect back to select screen with the machine now green
    await cdp.waitFor(`location.pathname.endsWith('/production/entries/select')`, 'redirected back to select screen', 25000);
    const counterExpr = `new RegExp('Entered:\\\\s*' + (${EXP_ENTERED} + 1) + '\\\\b').test(document.body.innerText)`;
    try {
      await cdp.waitFor(counterExpr, 'counter Entered: ' + (EXP_ENTERED + 1) + ' after UI save', 30000);
    } catch {
      const dbg = await cdp.eval(`(() => ({
        url: location.pathname + location.search,
        alertErr: [...document.querySelectorAll('.ant-alert-error')].map(a=>a.innerText),
        msg: (document.querySelector('.ant-message') || {}).innerText || '',
        counters: (document.body.innerText.match(/Total Machines:[\\s\\S]{0,80}/) || [''])[0],
        sp03: (() => { let n=[...document.querySelectorAll('div,span')].reverse().find(x=>x.childElementCount===0&&x.textContent.trim()==='${M3.machine_code}');
          while(n && !/Already Entered|Entry Required/.test(n.innerText)) n=n.parentElement;
          return n ? n.innerText.replace(/\\n/g,' | ').slice(0,160) : null; })()
      }))()`);
      console.log('   [debug] post-save state:', JSON.stringify(dbg));
      throw new Error('counter never showed Entered=' + (EXP_ENTERED + 1));
    }
    const afterTxt = await cdp.eval('document.body.innerText');
    expect(afterTxt.includes(M3.machine_code), M3.machine_code + ' still listed after save');
    const sp03Now = await cdp.eval(`(() => {
      const fn = ${TILE_FN};
      const t = fn('${M3.machine_code}');
      return t ? t.entered : null;
    })()`);
    expect(sp03Now === true, M3.machine_code + ' tile flipped to Already Entered after UI save');

    // cross-check via API + capture created entry for cleanup
    await new Promise((r) => setTimeout(r, 400));
    const st = await api('GET', `/production/entries/machine-status?entryDate=${DATE_A}&shiftId=${SHIFT_A.id}&departmentId=${dep.department_id}`);
    const row3 = (st.json.data || []).find((m) => m.machineCode === M3.machine_code);
    expect(st.status === 200 && st.json.meta.enteredCount === EXP_ENTERED + 1, 'API confirms enteredCount=' + (EXP_ENTERED + 1));
    expect(row3 && row3.status === 'ENTERED' && row3.entries.length >= 1, 'API confirms ' + M3.machine_code + ' ENTERED with entry payload');
    const savedEntry = row3.entries[0];
    /* server resolved the target authoritatively: standard 500 / 8h x running (PLANNED-1)h — operator never typed it */
    const EXP_SAVED_T = Math.round(500 * (PLANNED - 1) / 8 * 10000) / 10000;
    expect(Math.abs(Number(savedEntry.targetQuantity) - EXP_SAVED_T) < 0.0001,
      'saved targetQuantity is server-resolved ' + EXP_SAVED_T + ' (got ' + savedEntry.targetQuantity + ')');
    const dup = await api('POST', '/production/entries', {
      divisionId: dep.division_id, sectionId: dep.section_id, departmentId: dep.department_id,
      entryDate: DATE_A, shiftId: SHIFT_A.id, machineId: M3.id, machineNo: M3.machine_code,
      itemId: ITEM.id, operatorName: 'x', actualQuantity: 1, runningHours: 1, downtimeHours: 0, scrapQuantity: 0,
    });
    expect(dup.status === 409, 'backend duplicate guard still rejects second entry for ' + M3.machine_code);

    /* ── EDIT FLOW: open the saved entry in edit mode, change actual, save again ── */
    console.log('== browser: edit & save existing entry ==');
    await goto(FRONT + '/production/entries/' + savedEntry.id + '/edit');
    await cdp.waitFor(`document.body.innerText.includes('Production Context')`, 'edit page shows context summary', 20000);
    let headerTitle2 = '';
    try {
      await cdp.waitFor(`((document.querySelector('.erp-app-header span') || {}).textContent || '').trim() === 'Edit Production Entry'`,
        'edit page header shows "Edit Production Entry"', 15000);
      headerTitle2 = await cdp.eval(`(document.querySelector('.erp-app-header span') || {}).textContent`);
    } catch { headerTitle2 = '(timeout)'; }
    expect(headerTitle2 === 'Edit Production Entry', 'edit header title correct');
    await cdp.waitFor(`!!document.querySelector('.target-auto-field')`, 'target still auto-displayed read-only on edit', 15000);
    const editNoTargetInput = await cdp.eval(`!!document.querySelector('.target-auto-field input') === false`);
    expect(editNoTargetInput, 'target not editable on edit page either');
    await setInputByLabel('Actual Good Production', 310.25);
    await cdp.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Update Production Entry')); b.click(); return 1})()`);
    await new Promise((r) => setTimeout(r, 2500));
    const editDiag = await cdp.eval(`(() => ({
      url: location.pathname,
      errs: [...document.querySelectorAll('.ant-form-item-explain-error')].map(e=>e.textContent),
      msg: (document.querySelector('.ant-message') || {}).innerText || '',
      notif: (document.querySelector('.ant-notification') || {}).innerText || ''
    }))()`);
    console.log('   [diag] after update click:', JSON.stringify(editDiag));
    await cdp.waitFor(`location.pathname.endsWith('/production/entries/${savedEntry.id}')`, 'redirected to detail after update', 25000);
    const upd = await api('GET', '/production/entries/' + savedEntry.id);
    expect(upd.status === 200 && Math.abs(Number(upd.json.data.actualQuantity) - 310.25) < 0.0001,
      'update persisted actualQuantity=310.25 via UI (got ' + (upd.json.data || {}).actualQuantity + ')');
    expect(Math.abs(Number(upd.json.data.runningHours) - (PLANNED - 1)) < 0.001,
      'saved runningHours = planned-downtime (' + (PLANNED - 1) + ') (got ' + upd.json.data.runningHours + ')');
    expect(Math.abs(Number(upd.json.data.targetQuantity) - EXP_SAVED_T) < 0.0001,
      'target survived edit untouched at ' + EXP_SAVED_T + ' (got ' + upd.json.data.targetQuantity + ')');
    expect(!upd.json.data.postToInventory, 'PUT accepted without CREATE-only fields (postToInventory absent)');

    /* â”€â”€ KPI achievement indicator â”€â”€ */
    console.log('== browser: KPI threshold indicator ==');
    await goto(FRONT + '/production/entries');
    await cdp.waitFor(`[...document.querySelectorAll('.ant-statistic')].some(s=>s.textContent.includes('Achievement'))`, 'achievement statistic present', 25000);
    await cdp.waitFor(`document.querySelectorAll('.ant-table-tbody tr.ant-table-row').length > 0`, 'list rows loaded', 25000);

    const kpi = await cdp.eval(`(() => {
      const probe = document.createElement('div'); document.body.appendChild(probe);
      const tokenColor = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
      const s = [...document.querySelectorAll('.ant-statistic')].find(x=>x.textContent.includes('Achievement'));
      const valEl = s.querySelector('.ant-statistic-content-value');
      const icon = s.querySelector('.ant-statistic-content-prefix .anticon');
      const iconDir = icon ? (icon.className.includes('arrow-up')?'up':icon.className.includes('arrow-down')?'down':icon.className.includes('arrow-right')?'right':'?') : '?';
      const col = s.closest('.ant-col') || s.parentElement;
      const m = (col ? col.innerText : s.innerText).match(/([\\d.]+)\\s*%/);
      return { raw: (col||s).innerText.replace(/\\n/g,' | '), pct: m?parseFloat(m[1]):null, dir: iconDir,
        color: getComputedStyle(valEl).color,
        successTok: tokenColor('var(--theme-success)'), dangerTok: tokenColor('var(--theme-danger)'), mutedTok: tokenColor('var(--theme-text-muted)'),
        labelAbove: !!col && col.textContent.includes('Above target threshold'),
        labelBelow: !!col && col.textContent.includes('Below target threshold'),
        labelAt: !!col && col.textContent.includes('At target threshold') };
    })()`);
    console.log('   KPI card:', kpi.raw);
    expect(kpi.pct !== null, 'achievement % parsed (' + kpi.pct + '%)');
    if (kpi.pct !== null) {
      const branch = kpi.pct > 70 ? 'above' : (kpi.pct < 70 ? 'below' : 'at');
      if (branch === 'above') {
        expect(kpi.dir === 'up' && kpi.labelAbove, '>70 renders up-arrow + Above label');
        expect(kpi.color === kpi.successTok, '>70 colored with --theme-success');
      } else if (branch === 'below') {
        expect(kpi.dir === 'down' && kpi.labelBelow, '<70 renders down-arrow + Below label');
        expect(kpi.color === kpi.dangerTok, '<70 colored with --theme-danger');
      } else {
        expect(kpi.dir === 'right' && kpi.labelAt, '=70 renders right-arrow + At label');
        expect(kpi.color === kpi.mutedTok, '=70 colored with --theme-text-muted');
      }
    }
    // theme-token behaviour: switch palette and confirm the indicator color follows the token
    const themeSwap = await cdp.eval(`(async () => {
      const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
      const s=[...document.querySelectorAll('.ant-statistic')].find(x=>x.textContent.includes('Achievement'));
      const valEl=s.querySelector('.ant-statistic-content-value');
      const html=document.documentElement;
      const before=getComputedStyle(valEl).color;
      const prev=html.getAttribute('data-theme');
      html.setAttribute('data-theme','dark'); await sleep(80);
      const after=getComputedStyle(valEl).color;
      html.setAttribute('data-theme', prev || ''); await sleep(80);
      const restored=getComputedStyle(valEl).color;
      return { before, after, restored };
    })()`);
    expect(themeSwap.restored === themeSwap.before, 'indicator color restores when palette switches back');
    console.log('   palette colors light/dark/restored:', themeSwap.before, '/', themeSwap.after, '/', themeSwap.restored);

    /* force the other two threshold branches through the list's own filters
     * (<70: four DATE_A test rows -> 780/1750 = 44.57%; =70: single DATE_C row -> 306.25/437.5 = 70.00%) */
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitForKpiPct = async (pct) => {
      const expr = `(() => {
        const s=[...document.querySelectorAll('.ant-statistic')].find(x=>x.textContent.includes('Achievement'));
        if (!s) return false;
        const col=s.closest('.ant-col')||s.parentElement;
        const m=(col?col.innerText:s.innerText).match(/([\\d.]+)\\s*%/);
        return !!m && Math.abs(parseFloat(m[1]) - ${pct}) < 0.005;
      })()`;
      try {
        await cdp.waitFor(expr, `KPI card shows ${pct}%`, 25000);
      } catch {
        const dbg = await cdp.eval(`(() => ({
          rowCount: document.querySelectorAll('.ant-table-tbody tr.ant-table-row').length,
          statRaw: ([...document.querySelectorAll('.ant-statistic')].find(x=>x.textContent.includes('Achievement')) || {innerText:'?'}).closest('.ant-col').innerText.replace(/\\n/g,' | ')
        }))()`);
        console.log('   [debug] kpi state:', JSON.stringify(dbg));
        throw new Error('KPI card never showed ' + pct + '%');
      }
    };

    /* Force the other two threshold branches deterministically by steering the
     * default page aggregate with free-text-machine control rows (no machine
     * target needed, exact math against the same rows the component sums). */
    console.log('== browser: KPI below/at-threshold branches (aggregate steering) ==');
    const listTotals = async () => {
      const r = await api('GET', '/production/entries?page=1&limit=50');
      const rows = r.json.data || [];
      return {
        T: rows.reduce((s, x) => s + Number(x.targetQuantity), 0),
        A: rows.reduce((s, x) => s + Number(x.actualQuantity), 0),
        n: rows.length,
      };
    };
    const addFreeRow = async (target, actual) => {
      const r = await api('POST', '/production/entries', {
        divisionId: dep.division_id, sectionId: dep.section_id, departmentId: dep.department_id,
        entryDate: DATE_A, shiftId: SHIFT_A.id, machineNo: 'E2E-FREE-' + Date.now() + '-' + FREE_IDS.length,
        itemId: ITEM.id, uomId: ITEM.base_uom_id, operatorName: 'Browser E2E Free',
        targetQuantity: target, actualQuantity: actual, runningHours: 8, downtimeHours: 0, scrapQuantity: 0,
      });
      if (r.status !== 201) console.log('  [debug] free row create:', JSON.stringify(r.json));
      expect(r.status === 201, 'free-text control row created (' + r.status + ')');
      FREE_IDS.push(r.json && r.json.id);
      return r.json && r.json.id;
    };
    const probeBranch = async () => cdp.eval(`(() => {
      const pr=document.createElement('div');pr.style.position='absolute';document.body.appendChild(pr);
      const tokenColor=(v)=>{pr.style.color=v;return getComputedStyle(pr).color};
      const s=[...document.querySelectorAll('.ant-statistic')].find(x=>x.textContent.includes('Achievement'));
      const valEl=s.querySelector('.ant-statistic-content-value');
      const icon=s.querySelector('.ant-statistic-content-prefix .anticon');
      const col=s.closest('.ant-col')||s.parentElement;
      const out={dir: icon ? (icon.className.includes('arrow-up')?'up':icon.className.includes('arrow-down')?'down':icon.className.includes('arrow-right')?'right':'?') : '?',
        color:getComputedStyle(valEl).color,
        successTok:tokenColor('var(--theme-success)'), dangerTok:tokenColor('var(--theme-danger)'), mutedTok:tokenColor('var(--theme-text-muted)'),
        labelAbove:col.textContent.includes('Above target threshold'),
        labelBelow:col.textContent.includes('Below target threshold'),
        labelAt:col.textContent.includes('At target threshold')};
      pr.remove(); return out;
    })()`);

    // ── below-threshold branch ──
    let { T, A } = await listTotals();
    const tb = Math.max(100000, Math.ceil(20 * T));
    const ab = Math.max(1, Math.round(0.5 * (T + tb)) - A);
    const expBelowPct = Math.round(((A + ab) / (T + tb)) * 10000) / 100;
    await addFreeRow(tb, ab);
    await goto(FRONT + '/production/entries');
    await waitForKpiPct(expBelowPct);
    const kpiBelow = await probeBranch();
    console.log('   KPI (<70):', JSON.stringify(kpiBelow));
    expect(kpiBelow.dir === 'down' && kpiBelow.labelBelow, '<70 renders down-arrow + Below label');
    expect(kpiBelow.color === kpiBelow.dangerTok, '<70 colored with --theme-danger');

    // remove the below-row, then build an EXACT 70.00% page for the neutral branch
    for (const id of FREE_IDS.splice(0)) await api('DELETE', '/production/entries/' + id);
    ({ T, A } = await listTotals());
    const t2 = Math.max(1000000, Math.ceil(50 * T));
    // need round((A+a)/(T+t2)*1e4)/100 === 70 -> ratio within [0.699995, 0.700005];
    // window width 1e-5*(T+t2) >= 10 units, so integer rounding always lands inside it
    const a2 = Math.max(1, Math.round(0.7 * (T + t2) - A));
    const expAtPct = Math.round(((A + a2) / (T + t2)) * 10000) / 100;
    expect(expAtPct === 70, 'control math yields exactly 70.00% (' + expAtPct + ')');
    await addFreeRow(t2, a2);
    await goto(FRONT + '/production/entries');
    await waitForKpiPct(70);
    const kpiAt = await probeBranch();
    console.log('   KPI (=70):', JSON.stringify(kpiAt));
    expect(kpiAt.dir === 'right' && kpiAt.labelAt, '=70 renders right-arrow + At label');
    expect(kpiAt.color === kpiAt.mutedTok, '=70 colored with --theme-text-muted');

    if (cdp.exceptions.length) {
      console.log('   [info] page exceptions observed:', cdp.exceptions.length);
      for (const e of cdp.exceptions.slice(0, 5)) console.log('     -', e.exceptionDetails || e.text || JSON.stringify(e).slice(0, 160));
    }

    /* end of flow */
    await c.end();
  } finally {
    try { if (cdp) await cdp.send('Browser.close'); } catch { /* already gone */ }
    try { child.kill(); } catch { /* noop */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ }
    console.log('== cleanup ==');
    try {
      await cleanupAll(TARGET_IDS);
      const stA = await api('GET', `/production/entries/machine-status?entryDate=${DATE_A}&shiftId=${SHIFT_A.id}&departmentId=${dep.department_id}`);
      const stC = await api('GET', `/production/entries/machine-status?entryDate=${DATE_C}&shiftId=${SHIFT_A.id}&departmentId=${dep.department_id}`);
      expect(stA.status === 200 && stA.json.meta.enteredCount === 0, 'post-cleanup enteredCount back to 0 (' + DATE_A + ')');
      expect(stC.status === 200 && stC.json.meta.enteredCount === 0, 'post-cleanup enteredCount back to 0 (' + DATE_C + ')');
    } catch (e) { console.log('   [warn] cleanup failed:', e && e.message); }
  }

  console.log('\nRESULT: pass=' + pass + ' fail=' + fail);
  if (failures.length) console.log('FAILURES: ' + failures.join(' | '));
  process.exit(fail ? 1 : 0);
}

setTimeout(() => { console.error('FATAL global watchdog: run exceeded 8 minutes'); process.exit(3); }, 8 * 60 * 1000).unref();
main().catch((e) => { console.error('FATAL', e); process.exit(2); });






