/* probe8: validate select-all + insertText approach on InputNumber */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');
const BASE = 'http://localhost:3001/api/v1'; const FRONT = 'http://localhost:3000';
function launchBrowser(portNo) {
  const candidates = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'];
  const exe = candidates.find((p) => fs.existsSync(p));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-profile-'));
  const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + portNo, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  return { child, port: portNo };
}
class Cdp {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map();
    this.ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); p(m.result); } });
    return new Promise((r) => this.ws.addEventListener('open', () => r(this))); }
  send(method, params = {}) { const id = ++this.id; return new Promise((res) => { this.pending.set(id, res); try { this.ws.send(JSON.stringify({ id, method, params })); } catch {} }); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'ERR ' + String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || '').slice(0, 250); return r.result.value; }
  async waitFor(e, t = 15000) { const t0 = Date.now(); for (;;) { let v=false; try{v=await this.eval(e);}catch{} if(v) return true; if(Date.now()-t0>t) return false; await new Promise(r=>setTimeout(r,200)); } }
}
(async () => {
  const lr = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) });
  const lj = await lr.json(); const token = lj.token;
  const { Client } = require('pg');
  const c = await new Promise((res, rej) => { const x = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } }); x.connect().then(() => res(x)).catch(rej); });
  let M = (await c.query(`SELECT id FROM machines WHERE machine_code='SP-02' LIMIT 1`)).rows[0];
  if (!M) M = (await c.query(`SELECT id FROM machines WHERE is_active=true AND machine_code ILIKE 'sp%' ORDER BY machine_code LIMIT 1`)).rows[0];
  const dep = (await c.query(`SELECT department_id, division_id, section_id FROM machines WHERE id=$1`, [M.id])).rows[0];
  const SH = (await c.query(`SELECT id FROM shifts WHERE shift_code='SHIFT-A' AND is_active=true ORDER BY company_id LIMIT 1`)).rows[0];
  await c.end();
  const { child, port } = launchBrowser(9355);
  for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
  const tabRes = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' }).catch(() => fetch('http://127.0.0.1:' + port + '/json/new?about:blank'));
  const tab = await tabRes.json();
  const cdp = await new Cdp(tab.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: FRONT + '/login' });
  await cdp.waitFor(`document.readyState === "complete"`);
  await cdp.eval(`localStorage.setItem('token', ${JSON.stringify(token)}); localStorage.setItem('refresh_token','e2e');
    localStorage.setItem('erp_user', ${JSON.stringify(JSON.stringify(lj.user || {}))}); true`);
  await cdp.send('Page.navigate', { url: `${FRONT}/production/entries/new?from=select&machineId=${M.id}&entryDate=2027-03-15&shiftId=${SH.id}&divisionId=${dep.division_id}&sectionId=${dep.section_id}&departmentId=${dep.department_id}` });
  await cdp.waitFor(`document.readyState === "complete"`);
  await cdp.waitFor(`document.body.innerText.includes('Production Context')`, 20000);
  await new Promise((r) => setTimeout(r, 3500));

  const TYPE_INPUT = `(el, val) => {
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, String(val));
    el.blur();
  }`;
  const snap = `(() => {
    const fi=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()==='Rejection / Scrap');
    const inp=fi.querySelector('.ant-input-number-input');
    const card=[...document.querySelectorAll('.ant-card')].find(x=>x.querySelector('.ant-card-head-title')&&x.querySelector('.ant-card-head-title').textContent==='KPI Summary');
    const m=card?card.innerText.match(/Rejection %[^0-9-]*([0-9.-]+)%/):null;
    return { dom: inp.value, pct: m?+m[1]:null };
  })()`;
  const setV = async (v) => { await cdp.eval(`(()=>{const fi=[...document.querySelectorAll('.ant-form-item')].find(f=>f.querySelector('label')&&f.querySelector('label').textContent.trim()==='Rejection / Scrap'); (${TYPE_INPUT})(fi.querySelector('.ant-input-number-input'), ${JSON.stringify(v)}); return 1})()`); };

  console.log('initial:', JSON.stringify(await cdp.eval(snap)));
  for (const v of ['100', '50', '25']) {
    await setV(v); await new Promise(r=>setTimeout(r,500));
    console.log('after ' + v + ':', JSON.stringify(await cdp.eval(snap)));
  }
  child.kill();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
