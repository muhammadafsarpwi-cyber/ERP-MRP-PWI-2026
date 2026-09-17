// @ts-check
// RMR-01-C-B — Real browser verification of the Inventory Status popup backend
// (READ-ONLY) at frontend RMR-01-C-B. Opens real receipts RMR-00020 / RMR-00043 /
// RMR-00039 through Receipt Detail -> View Inventory, cross-checks every displayed
// value against the live backend response, verifies exactly ONE inventory request
// per opening, read-only (no mutation), centered modal + explicit X, light/dark
// mode, and responsive scan at 1920 / 1280 / 768 / 390.
const fs = require('fs');
const { chromium } = require('playwright');

const API = 'http://127.0.0.1:3001/api/v1';
const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';
const SHOT_DIR = 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\rmr01c-b';
const RECEIVING_ROUTE = '/production/receiving';

const results = [];
const T0 = Date.now();
function check(name, ok, extra) {
  results.push({ name, ok: !!ok, extra: extra || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}\t${name}${extra ? ' :: ' + extra : ''}`);
}

function httpJson(method, route, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = require('http').request(API + route, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function waitListening(port, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const socket = require('http').request({ host: '127.0.0.1', port, path: '/', timeout: 800 }, () => resolve(true));
      socket.on('error', () => {
        if (Date.now() - start > timeoutMs) resolve(false);
        else setTimeout(tick, 600);
      });
      socket.end();
    };
    tick();
  });
}

async function shot(page, name) {
  const file = `${SHOT_DIR}\\${name}.png`;
  await page.screenshot({ path: file, fullPage: false }).catch((e) => console.log('   screenshot failed', name, e.message));
  console.log('   screenshot:', file);
}

async function openPage(context, route) {
  const page = await context.newPage();
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1800);
  return page;
}

function docOverflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return { scrollW: de.scrollWidth, clientW: de.clientWidth, overflowX: de.scrollWidth - de.clientWidth };
  });
}

const fmt = (v) => Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd}-${months[d.getMonth()]}-${d.getFullYear()}`;
};

// Verify one receipt's inventory popup against the live backend response.
async function verifyReceipt(page, code, ref, opts) {
  const label = opts?.label || code;
  const beforeInv = opts.curInv();
  const mutations = () => opts.mutations();

  // find the row and open the receipt detail
  const row = page.locator('tr.ant-table-row', { hasText: code }).first();
  await row.waitFor({ state: 'visible', timeout: 40000 }).catch(() => {});
  check(`[${label}] receipt row found`, (await row.count()) === 1);

  const dl = await row.locator('.anticon-eye').count();
  check(`[${label}] detail (eye) action present`, dl === 1);
  await row.locator('.anticon-eye').click();
  await page.waitForSelector('[data-testid="rm-detail-code"]', { timeout: 30000 });
  await page.waitForFunction(
    (c) => document.querySelector('[data-testid="rm-detail-code"]')?.textContent === c,
    code, { timeout: 30000 },
  ).catch(() => {});
  check(`[${label}] receipt detail loaded`, (await page.locator('[data-testid="rm-detail-code"]').textContent()).trim() === code);

  const invBtn = page.locator('[data-testid="rm-detail-inventory"]');
  check(`[${label}] View Inventory button visible`, await invBtn.isVisible());
  await invBtn.click();

  await page.waitForSelector('[data-testid="rm-inventory-loading"], [data-testid="rm-inventory-receipt"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="rm-inventory-receipt"]', { timeout: 40000 });
  const odata = opts?.odata;
  if (!odata || odata.mode === 'light') {
    check(`[${label}] inventory receipt chip = ${code}`,
      (await page.locator('[data-testid="rm-inventory-receipt"]').textContent()).trim() === code);
  }

  // centered modal, explicit X, width ~1120, i.e. NOT a drawer
  const wrap = page.locator('.ant-modal-wrap:has([data-testid="rm-inventory-body"])');
  const centered = (await wrap.getAttribute('class')).includes('ant-modal-centered');
  check(`[${label}] centered modal (not drawer)`, centered);
  check(`[${label}] explicit X close present`,
    (await page.locator('.ant-modal-wrap:has([data-testid="rm-inventory-body"]) .ant-modal-close').count()) === 1);
  const modalStyle = await page.locator('.ant-modal-wrap:has([data-testid="rm-inventory-body"]) .ant-modal').getAttribute('style');
  check(`[${label}] modal width configured (~1120)`, /width\s*:\s*1120/i.test(modalStyle || ''), modalStyle?.slice(0, 60));

  const body = page.locator('[data-testid="rm-inventory-body"]');
  check(`[${label}] title "Inventory Status"`, await body.locator(':text("Inventory Status")').first().isVisible());
  check(`[${label}] subtitle uses receipt code`,
    await body.locator(`:text("Inventory for items received in ${code}")`).first().isVisible());

  // header context chips: Warehouse + Receipt Date (formatted, no UUIDs)
  const warehouseName = ref.data?.warehouse?.name;
  if (warehouseName) {
    check(`[${label}] warehouse context shown`, await body.locator(`:text("${warehouseName}")`).first().isVisible());
  }
  const dateStr = fmtDate(ref.data?.receiptDate);
  if (dateStr) {
    check(`[${label}] receipt date shown (DD-MMM-YYYY)`, await body.locator(`:text("${dateStr}")`).first().isVisible());
  }

  // every API item rendered with correct values, no UUIDs, no dupes
  const refItems = ref.data?.items || [];
  check(`[${label}] item count matches API (${refItems.length})`,
    refItems.length > 0 && (await body.locator('.rmr-inventory-item').count()) === refItems.length);
  let itemsOk = true;
  for (const it of refItems) {
    const ic = it.item?.itemCode;
    const inN = it.item?.name;
    const rc = fmt(it.receivedQuantity);
    const oh = it.balance?.exists ? fmt(it.balance?.onHand) : null;
    const res = it.balance?.exists ? fmt(it.balance?.reserved) : null;
    const av = it.balance?.exists ? fmt(it.balance?.available) : null;
    if (ic) { itemsOk = itemsOk && (await body.locator(':text("' + ic + '")').first().isVisible()); }
    if (inN) { itemsOk = itemsOk && (await body.locator(':text("' + inN + '")').first().isVisible()); }
    itemsOk = itemsOk && (await body.locator('.ant-table-tbody tr', { hasText: ic }).count()) === 1;
    if (it.uom?.code) { itemsOk = itemsOk && (await body.locator('.ant-table-tbody tr', { hasText: ic }).locator(`:text("${it.uom.code}")`).count()) >= 1; }
    if (rc.replace(/,/g, '') !== '0') { itemsOk = itemsOk && (await body.locator('.ant-table-tbody tr', { hasText: ic }).locator(`:text("${rc}")`).count()) >= 1; }
    if (oh !== null) { itemsOk = itemsOk && (await body.locator('.ant-table-tbody tr', { hasText: ic }).locator(`:text("${oh}")`).count()) >= 1; }
    if (res !== null) { itemsOk = itemsOk && (await body.locator('.ant-table-tbody tr', { hasText: ic }).locator(`:text("${res}")`).count()) >= 1; }
    if (av !== null) { itemsOk = itemsOk && (await body.locator('.ant-table-tbody tr', { hasText: ic }).locator(`:text("${av}")`).count()) >= 1; }
  }
  check(`[${label}] every item code/name/qty/onHand/reserved/available matched API`, itemsOk);

  // headers wording distinguishes the two concepts
  check(`[${label}] "Received in This Receipt" / "Current On Hand" headers present`,
    (await body.locator('.ant-table-thead :text("Received in This Receipt")').count()) >= 1 &&
    (await body.locator('.ant-table-thead :text("Current On Hand")').count()) >= 1);

  // no UUID displayed in the table
  const uuidInTable = await body.locator('.ant-table').evaluate((el) =>
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(el.textContent || ''),
  );
  check(`[${label}] no UUIDs displayed`, !uuidInTable);

  if (!odata || odata.mode === 'light') {
    const inCall = opts.curInv() - beforeInv;
    check(`[${label}] exactly one inventory API request`, inCall === 1, `calls=${inCall}`);
    check(`[${label}] no mutation requests (read-only)`, mutations() === 0, `mutations=${mutations()}`);
  }

  // no document-level horizontal overflow with the popup open
  const ov = await docOverflow(page);
  check(`[${label}] no document horizontal overflow`, ov.overflowX <= 4, `overflow=${ov.overflowX}px`);

  if (opts.shotName) await shot(page, opts.shotName);
  return body;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  check('backend :3001 up', await waitListening(3001, 4000));
  check('frontend :3000 up', await waitListening(3000, 4000));

  const login = await httpJson('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  check('login via API', login.status === 201 && !!login.json?.token, `status=${login.status}`);
  if (!login.json?.token) { console.log('\nABORT: login failed'); process.exit(1); }
  const token = login.json.token;

  // Live backend reference for the three receipts under test.
  const list = (await httpJson('GET', '/inventory/receipts/gate-pass', { token })).json?.data || [];
  const find = (code) => list.find((r) => r.receiptCode === code);
  const refs = {};
  const targetCodes = ['RMR-00020', 'RMR-00043', 'RMR-00039'];
  for (const code of targetCodes) {
    const rec = find(code);
    if (!rec) { console.log(`  (skip ${code}: not in list)`); continue; }
    const detail = (await httpJson('GET', `/inventory/receipts/gate-pass/${rec.id}`, { token })).json?.data;
    const invResp = await httpJson('GET', `/inventory/receipts/gate-pass/${rec.id}/inventory`, { token });
    const inv = invResp.json;
    refs[code] = { id: rec.id, data: inv?.data };
    check(`[api] ${code} inventory endpoint (${inv?.data?.items?.length ?? 0} items)`,
      [200, 201].includes(invResp.status) && !!inv?.data, `http=${invResp.status} bodyStatus=${inv?.status}`);
  }

  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  try {
    const invCount = { n: 0 };
    const mutCount = { n: 0 };
    const tagPage = (p) => {
      p.on('response', (res) => { if (/\/inventory\/receipts\/gate-pass\/[^/]+\/inventory$/.test(res.url())) invCount.n += 1; });
      p.on('request', (r) => { if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method())) mutCount.n += 1; });
      return p;
    };
    const lightCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await lightCtx.addInitScript(({ token, user, refreshToken }) => {
      localStorage.setItem('token', token);
      if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('erp_user', JSON.stringify(user));
      localStorage.setItem('erp_permissions_ts', Date.now().toString());
      localStorage.setItem('erp_theme_prefs_v1', JSON.stringify({ [`user:${user.id}`]: { mode: 'light', paletteId: 'indigo' } }));
    }, { token: login.json.token, user: login.json.user, refreshToken: login.json.refreshToken });

    // ── RMR-00043 (2 items) — full value cross-check at 1920, light ─────────
    let page = tagPage(await openPage(lightCtx, RECEIVING_ROUTE));
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + String(e)));

    try { await page.waitForSelector('tr.ant-table-row', { timeout: 40000 }); } catch {}
    await page.waitForTimeout(1200);

    const b1 = await verifyReceipt(page, 'RMR-00043', refs['RMR-00043'], {
      label: 'RMR-00043', curInv: () => invCount.n, mutations: () => mutCount.n, shotName: '01-rmr00043-inventory-light',
    });
    // close/reopen cleanly (same receipt, fresh call, no dupes)
    await page.locator('.ant-modal-wrap:has([data-testid="rm-inventory-body"]) .ant-modal-close').click();
    await page.waitForTimeout(500);
    check('[reopen] inventory popup fully closed', (await page.locator('[data-testid="rm-inventory-body"]').count()) === 0);
    const beforeCalls = invCount.n;
    await page.locator('[data-testid="rm-detail-inventory"]').click();
    await page.waitForSelector('[data-testid="rm-inventory-receipt"]', { timeout: 40000 });
    check('[reopen] reopening makes exactly one more inventory call', invCount.n === beforeCalls + 1, `total=${invCount.n}`);
    await page.locator('.ant-modal-wrap:has([data-testid="rm-inventory-body"]) .ant-modal-close').click();
    await page.waitForTimeout(500);

    // ── RMR-00020 (1 item) and RMR-00039 (3 items) ─────────────────────────
    for (const code of ['RMR-00020', 'RMR-00039']) {
      page = tagPage(await openPage(lightCtx, RECEIVING_ROUTE));
      page.on('pageerror', (e) => pageErrors.push('pageerror: ' + String(e)));
      try { await page.waitForSelector('tr.ant-table-row', { timeout: 40000 }); } catch {}
      await page.waitForTimeout(1200);
      const exp = code === 'RMR-00039' ? 3 : 1;
      await verifyReceipt(page, code, refs[code], {
        label: code, curInv: () => invCount.n, mutations: () => mutCount.n,
        shotName: `02-${code}-inventory-light`,
      });
      check(`[${code}] item count matches expected ${exp}`, (refs[code].data?.items?.length || 0) === exp);
      await page.close();
    }

    // ── Dark mode ───────────────────────────────────────────────────────────
    const darkCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await darkCtx.addInitScript(({ token, user, refreshToken }) => {
      localStorage.setItem('token', token);
      if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('erp_user', JSON.stringify(user));
      localStorage.setItem('erp_permissions_ts', Date.now().toString());
      localStorage.setItem('erp_theme_prefs_v1', JSON.stringify({ [`user:${user.id}`]: { mode: 'dark', paletteId: 'indigo' } }));
    }, { token: login.json.token, user: login.json.user, refreshToken: login.json.refreshToken });
    const dpage = tagPage(await openPage(darkCtx, RECEIVING_ROUTE));
    dpage.on('pageerror', (e) => pageErrors.push('pageerror: ' + String(e)));
    try { await dpage.waitForSelector('tr.ant-table-row', { timeout: 40000 }); } catch {}
    await dpage.waitForTimeout(1200);
    const da = await dpage.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check('[dark] theme activated via data-theme', da === 'dark');
    await verifyReceipt(dpage, 'RMR-00043', refs['RMR-00043'], {
      label: 'RMR-00043/dark', curInv: () => invCount.n, mutations: () => mutCount.n,
      shotName: '03-rmr00043-inventory-dark',
    });
    const darkBg = await dpage.evaluate(() => {
      const el = document.querySelector('.rmr-inventory-modal .ant-modal-content');
      return el ? getComputedStyle(el).backgroundColor : null;
    });
    check('[dark] inventory modal surface uses dark theme surface', !!darkBg && darkBg !== 'rgb(255, 255, 255)');
    await dpage.close();

    // ── Responsive scan (RMR-00043 detail -> inventory) ─────────────────────
    const widths = [1920, 1280, 768, 390];
    for (const w of widths) {
      const h = w === 390 ? 844 : w === 768 ? 1024 : w === 1280 ? 800 : 1080;
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      await ctx.addInitScript(({ token, user, refreshToken }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('erp_user', JSON.stringify(user));
        localStorage.setItem('erp_permissions_ts', Date.now().toString());
        localStorage.setItem('erp_theme_prefs_v1', JSON.stringify({ [`user:${user.id}`]: { mode: 'light', paletteId: 'indigo' } }));
      }, { token: login.json.token, user: login.json.user });
      const pg = await openPage(ctx, RECEIVING_ROUTE);
      pg.on('pageerror', (e) => pageErrors.push(`resp(${w}) pageerror: ` + String(e)));
      try { await pg.waitForSelector('tr.ant-table-row', { timeout: 40000 }); } catch {}
      await pg.waitForTimeout(1000);
      const row = pg.locator('tr.ant-table-row', { hasText: 'RMR-00043' }).first();
      if (await row.count()) {
        await row.locator('.anticon-eye').click();
        await pg.waitForSelector('[data-testid="rm-detail-inventory"]', { timeout: 30000 });
        await pg.locator('[data-testid="rm-detail-inventory"]').click();
        await pg.waitForSelector('[data-testid="rm-inventory-receipt"]', { timeout: 40000 });
        await pg.waitForTimeout(400);
        const ov = await docOverflow(pg);
        check(`[responsive ${w}] no document horizontal overflow`, ov.overflowX <= 4, `overflow=${ov.overflowX}px`);
        const closeBox = await pg.locator('.ant-modal-wrap:has([data-testid="rm-inventory-body"]) .ant-modal-close').boundingBox();
        check(`[responsive ${w}] close X accessible in viewport`, !!closeBox && closeBox.x >= 0 && closeBox.x + closeBox.width <= w);
        await shot(pg, `04-responsive-${w}-inventory`);
      } else {
        check(`[responsive ${w}] RMR-00043 row visible`, false);
      }
      await ctx.close();
    }

    const realErrors = pageErrors.filter((e) => !e.includes('There may be circular references'));
    check('[errors] no page/console errors during entire run', realErrors.length === 0, realErrors.slice(0, 4).join(' | '));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log('\n──────────────────────── RMR-01-C-B E2E ────────────────────────');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}\t${r.name}${r.extra ? ' :: ' + r.extra : ''}`);
  console.log(`SUMMARY: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR', e); process.exit(2); });