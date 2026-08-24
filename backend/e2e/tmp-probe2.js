/* Interactive probe: open the locked create form and dump network + DOM state */
const { Client } = require('pg');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'http://localhost:3001/api/v1';
const FRONT = 'http://localhost:3000';
const DATE_A = '2027-03-15';

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
  ];
  const exe = candidates.find((p) => fs.existsSync(p));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-profile-'));
  const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9339', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  return { child, port: 9339 };
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.netlog = [];
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        resolve(msg.result);
      } else if (msg.method === 'Network.responseReceived') {
        const u = msg.params.response.url;
        if (u.includes('/api/') || u.includes('localhost:3001')) {
          this.netlog.push({ url: u.replace(BASE, ''), status: msg.params.response.status });
        }
      }
    });
    return new Promise((resolve) => { this.ws.addEventListener('open', () => resolve(this)); });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve) => { this.pending.set(id, { resolve }); try { this.ws.send(JSON.stringify({ id, method, params })); } catch { this.pending.delete(id); } });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EVAL-ERR: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 300);
    return r.result.value;
  }
  async waitFor(expr, timeoutMs = 15000) {
    const t0 = Date.now();
    for (;;) {
      let ok = false;
      try { ok = await this.eval(expr); } catch {}
      if (ok) return true;
      if (Date.now() - t0 > timeoutMs) return false;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

(async () => {
  const lr = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) });
  const lj = await lr.json();
  const token = lj.token;
  const USER = lj.user;

  const c = await db();
  const machQ = await c.query(`SELECT id, machine_code, department_id FROM machines WHERE is_active=true AND machine_code='SP-03' LIMIT 1`);
  const M3 = machQ.rows[0];
  const depQ = await c.query(`SELECT department_id, division_id, section_id FROM machines WHERE id=$1`, [M3.id]);
  const dep = depQ.rows[0];
  const COMPANY = (await c.query('SELECT company_id FROM machines WHERE id=$1', [M3.id])).rows[0].company_id;
  const SHIFT_A = (await c.query(`SELECT id FROM shifts WHERE company_id=$1 AND shift_code='SHIFT-A' AND is_active=true`, [COMPANY])).rows[0];

  // ensure an ACTIVE target exists for SP-03 x SHIFT-A @ DATE_A
  let tg = (await c.query(`SELECT id, target_quantity, standard_hours, uom_id FROM machine_targets WHERE machine_id=$1 AND shift_id=$2 AND status='ACTIVE' AND is_active=true AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $3::date) LIMIT 1`, [M3.id, SHIFT_A.id, DATE_A])).rows[0];
  if (!tg) {
    const cr = await fetch(BASE + '/production/machine-targets', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ machineId: M3.id, shiftId: SHIFT_A.id, uomId: (await c.query(`SELECT base_uom_id FROM items WHERE item_code='RAW-001' LIMIT 1`)).rows[0].base_uom_id, standardHours: 8, targetQuantity: 500, effectiveFrom: '2027-01-01', remarks: 'E2E-BROWSER-' + Date.now() }) });
    console.log('target create status:', cr.status);
    tg = (await c.query(`SELECT id, target_quantity, standard_hours, uom_id FROM machine_targets WHERE machine_id=$1 AND shift_id=$2 AND status='ACTIVE' AND is_active=true AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $3::date) ORDER BY created_at DESC LIMIT 1`, [M3.id, SHIFT_A.id, DATE_A])).rows[0];
  }
  console.log('fixture target:', JSON.stringify(tg));

  // server-side resolve sanity
  const rr = await fetch(`${BASE}/production/entries/machine-target?machineId=${M3.id}&shiftId=${SHIFT_A.id}&productionDate=${DATE_A}`, { headers: { Authorization: 'Bearer ' + token } });
  console.log('server resolve:', rr.status, JSON.stringify(await rr.json()).slice(0, 260));

  /* browser */
  const { child, port } = launchBrowser();
  for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  const tabRes = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' }).catch(() => fetch('http://127.0.0.1:' + port + '/json/new?about:blank'));
  const tab = await tabRes.json();
  const cdp = await new Cdp(tab.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await new Promise((r) => setTimeout(r, 500));

  await cdp.send('Page.navigate', { url: FRONT + '/login' });
  await cdp.waitFor('document.readyState === "complete"');
  await cdp.eval(`localStorage.setItem('token', ${JSON.stringify(token)});
    localStorage.setItem('refresh_token', 'e2e');
    localStorage.setItem('erp_user', ${JSON.stringify(JSON.stringify(USER))}); true`);

  const url = `${FRONT}/production/entries/new?from=select&machineId=${M3.id}&entryDate=${DATE_A}&shiftId=${SHIFT_A.id}&divisionId=${dep.division_id}&sectionId=${dep.section_id}&departmentId=${dep.department_id}`;
  await cdp.send('Page.navigate', { url });
  await cdp.waitFor(`document.body.innerText.includes('Production Context')`, 20000);
  await new Promise((r) => setTimeout(r, 4000)); // let resolves settle

  const state = await cdp.eval(`(() => ({
    headerTitle: ((document.querySelector('.erp-app-header span') || {}).textContent || '').trim(),
    summaryCard: [...document.querySelectorAll('.ant-card')].map(x=>x.innerText.replace(/\\n/g,' | ')).slice(0,2),
    targetField: (document.querySelector('.target-auto-field')||{}).innerText || null,
    alerts: [...document.querySelectorAll('.ant-alert')].map(a=>a.innerText.slice(0,220)),
    formErrors: [...document.querySelectorAll('.ant-form-item-explain-error')].map(e=>e.textContent),
    saveDisabled: (()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Save Production Entry')); return b?b.disabled:null})(),
  }))()`);
  console.log('PAGE STATE:', JSON.stringify(state, null, 1));
  console.log('NETWORK LOG:');
  for (const n of cdp.netlog) console.log(' ', n.status, n.url);

  child.kill();
  await c.end();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
