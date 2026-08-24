/* Probe 3: intercept the actual browser response for /entries/machine-target */
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
  const candidates = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'];
  const exe = candidates.find((p) => fs.existsSync(p));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-profile-'));
  const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9341', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  return { child, port: 9341 };
}
class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map();
    this.responses = []; this.requests = new Map(); this.bodies = [];
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); p(msg.result); }
      else if (msg.method === 'Network.requestWillBeSent') {
        const u = msg.params.request.url;
        if (!/\.(js|css|png|svg|ico|map|woff)/.test(u)) this.requests.set(msg.params.requestId, { url: u, method: msg.params.request.method });
      } else if (msg.method === 'Network.loadingFailed') {
        const r = this.requests.get(msg.params.requestId);
        if (r && !r.done) this.responses.push({ ...r, failed: msg.params.errorText, canceled: msg.params.canceled });
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
    if (r.exceptionDetails) return 'EVAL-ERR: ' + String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 400);
    return r.result.value;
  }
  async waitFor(expr, timeoutMs = 15000) {
    const t0 = Date.now();
    for (;;) {
      let ok = false; try { ok = await this.eval(expr); } catch {}
      if (ok) return true;
      if (Date.now() - t0 > timeoutMs) return false;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

(async () => {
  const lr = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) });
  const lj = await lr.json(); const token = lj.token; const USER = lj.user;
  const c = await db();
  const M3 = (await c.query(`SELECT id FROM machines WHERE machine_code='SP-03' LIMIT 1`)).rows[0];
  const dep = (await c.query(`SELECT department_id, division_id, section_id FROM machines WHERE id=$1`, [M3.id])).rows[0];
  const COMPANY = (await c.query('SELECT company_id FROM machines WHERE id=$1', [M3.id])).rows[0].company_id;
  const SHIFT_A = (await c.query(`SELECT id FROM shifts WHERE company_id=$1 AND shift_code='SHIFT-A' AND is_active=true`, [COMPANY])).rows[0];
  await c.end();

  const { child, port } = launchBrowser();
  for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  const tabRes = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' }).catch(() => fetch('http://127.0.0.1:' + port + '/json/new?about:blank'));
  const tab = await tabRes.json();
  const cdp = await new Cdp(tab.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');

  await cdp.send('Page.navigate', { url: FRONT + '/login' });
  await cdp.waitFor('document.readyState === "complete"');
  await cdp.eval(`localStorage.setItem('token', ${JSON.stringify(token)});
    localStorage.setItem('refresh_token', 'e2e');
    localStorage.setItem('erp_user', ${JSON.stringify(JSON.stringify(USER))}); true`);

  const url = `${FRONT}/production/entries/new?from=select&machineId=${M3.id}&entryDate=${DATE_A}&shiftId=${SHIFT_A.id}&divisionId=${dep.division_id}&sectionId=${dep.section_id}&departmentId=${dep.department_id}`;
  await cdp.send('Page.navigate', { url });
  await cdp.waitFor(`document.body.innerText.includes('Production Context')`, 20000);
  await new Promise((r) => setTimeout(r, 5000));

  /* ground truth: replicate the app's exact call from inside the page */
  const inPage = await cdp.eval(`(async () => {
    try {
      const t = localStorage.getItem('token');
      const r = await fetch('${BASE}/production/entries/machine-target?machineId=${M3.id}&shiftId=${SHIFT_A.id}&productionDate=${DATE_A}', { headers: { Authorization: 'Bearer ' + t } });
      const txt = await r.text();
      return { status: r.status, body: txt.slice(0, 300) };
    } catch (e) { return { error: String(e) }; }
  })()`);
  console.log('IN-PAGE FETCH:', JSON.stringify(inPage, null, 1));

  const dom = await cdp.eval(`({
    targetField: (document.querySelector('.target-auto-field')||{}).innerText || null,
    alertErr: [...document.querySelectorAll('.ant-alert-error')].map(a=>a.innerText.slice(0,200)),
    saveDisabled: (()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Save Production Entry')); return b?b.disabled:null})(),
  })`);
  console.log('DOM:', JSON.stringify(dom));
  console.log('API REQUESTS SEEN:');
  for (const r of cdp.responses) console.log(' ', JSON.stringify(r).slice(0, 220));

  child.kill();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
