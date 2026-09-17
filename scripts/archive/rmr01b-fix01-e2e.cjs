// @ts-check
// RMR-01-B-FIX-01 focused browser verification:
// Receipt Detail is a CENTERED MODAL (not a side Drawer), with readable header
// chips, responsive info grid, items table + totals, WhatsApp/Edit, internal
// scroll only, X close, no page horizontal overflow at 1920/1280/768/390, and
// no console/page errors.
const fs = require('fs');
const { chromium } = require('playwright');

const API = 'http://127.0.0.1:3001/api/v1';
const BASE = 'http://127.0.0.1:3000';
const SHOT_DIR = 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\rmr01b-fix01';

const results = [];
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

async function shot(page, name) {
  const file = `${SHOT_DIR}\\${name}.png`;
  await page.screenshot({ path: file, fullPage: false }).catch((e) => console.log('   screenshot failed', name, e.message));
  console.log('   screenshot:', file);
}

async function modalBox(page) {
  return page.locator('.rmr-detail-modal').boundingBox();
}

async function openDetailOnFirstRow(page) {
  const eye = page.locator('tr.ant-table-row').first().locator('button.ant-btn-icon-only, button').filter({ has: page.locator('.anticon-eye') }).first();
  if (await eye.count() === 0) return false;
  await eye.click({ timeout: 15000 });
  await page.waitForSelector('.rmr-detail-modal', { timeout: 15000 });
  // modal shell renders immediately; receipt body arrives once the detail fetch resolves (~2s)
  try { await page.waitForSelector('.rmr-detail-body [data-testid="rm-detail-wa"]', { timeout: 20000 }); } catch {}
  await page.waitForTimeout(400);
  return page.locator('.rmr-detail-modal').isVisible();
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const login = await httpJson('POST', '/auth/login', { body: { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' } });
  check('login via API', login.status === 201 && !!login.json?.token, `status=${login.status}`);
  if (!login.json?.token) process.exit(1);

  const browser = await chromium.launch({ headless: true });
  const errors = [];

  async function makeContext(viewport) {
    const ctx = await browser.newContext({ viewport });
    await ctx.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('refresh_token', token);
      localStorage.setItem('erp_user', JSON.stringify(user));
      localStorage.setItem('erp_permissions_ts', Date.now().toString());
    }, { token: login.json.token, user: login.json.user });
    return ctx;
  }

  try {
    // ---- Main verification at 1920x1080 ----
    const ctx = await makeContext({ width: 1920, height: 1080 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('There may be circular references')) errors.push('console: ' + m.text()); });
    await page.goto(BASE + '/production/receiving', { waitUntil: 'domcontentloaded', timeout: 40000 });
    try { await page.waitForSelector('tr.ant-table-row', { timeout: 40000 }); } catch {}
    await page.waitForTimeout(1200);

    const opened = await openDetailOnFirstRow(page);
    check('receipt detail opens as a modal popup', opened);

    const box = await modalBox(page);
    const vp = page.viewportSize();
    check('modal is rendered (non-zero box)', !!box && box.width > 300, box ? `${box.width}x${box.height}` : 'none');

    if (box) {
      const centerX = box.x + box.width / 2;
      check('[detail] modal is horizontally CENTERED (not a side drawer)', Math.abs(centerX - vp.width / 2) < 90, `centerX=${Math.round(centerX)} vpCenter=${Math.round(vp.width / 2)}`);
      check('[detail] modal left edge is well inside viewport', box.x > 24, `x=${Math.round(box.x)}`);
      check('[detail] modal width fits viewport', box.width <= 1180 + 2 && box.width <= vp.width - 24, `width=${Math.round(box.width)}`);
    }

    check('title = "Raw Material Receipt Detail"',
      await page.locator('.rmr-detail-title:has-text("Raw Material Receipt Detail")').count() > 0);
    check('header chips Receipt Code / Gate Pass present',
      (await page.locator('.rmr-detail-code-chip:has-text("Receipt Code")').count() > 0)
      && (await page.locator('.rmr-detail-code-chip:has-text("Gate Pass")').count() > 0));

    const infoFields = await page.locator('.rmr-detail-field').count();
    check('info grid cards rendered (>=5)', infoFields >= 5, `fields=${infoFields}`);

    const itemCols = await page.locator('.rmr-detail-items-table .ant-table-thead th').allTextContents();
    const needCols = ['#', 'Item', 'UOM', 'Gate Pass Qty', 'Received Qty', 'Difference'];
    const missingIt = needCols.filter((c) => !itemCols.join('|').includes(c));
    check('items table has # / Item / UOM / Gate Pass Qty / Received Qty / Difference', missingIt.length === 0, itemCols.join(', '));

    const totals = await page.locator('.rmr-detail-total-card').count();
    check('totals cards (Gate Pass / Received / Difference) rendered', totals === 3, `totals=${totals}`);

    check('WhatsApp button visible (rm-detail-wa)', await page.locator('[data-testid="rm-detail-wa"]').isVisible());
    check('Edit action visible (rm-detail-edit)', await page.locator('[data-testid="rm-detail-edit"]').isVisible());
    // WhatsApp lives inside the modal popup, not the side edge
    check('WhatsApp button is inside the centered modal popup', await page.locator('.rmr-detail-modal [data-testid="rm-detail-wa"]').count() === 1);

    const bodyStyle = await page.locator('.rmr-detail-body').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { maxH: cs.maxHeight, overflowY: cs.overflowY, scrollH: el.scrollHeight, clientH: el.clientHeight };
    });
    check('[detail] internal scroll container (max-height <= 90vh, scroll-y auto)',
      bodyStyle.overflowY === 'auto' && parseFloat(bodyStyle.maxH) > 0 && parseFloat(bodyStyle.maxH) <= 810 + 90,
      `maxH=${bodyStyle.maxH} overflowY=${bodyStyle.overflowY}`);
    const pageScrolled = await page.evaluate(() => window.scrollY);
    check('[detail] page itself did NOT scroll while modal open (y=0)', pageScrolled === 0, `pageScrollY=${pageScrolled}`);

    const itemRows = await page.locator('.rmr-detail-items-table .ant-table-tbody tr.ant-table-row').count();
    console.log('   info: receipt has', itemRows, 'item line(s) in detail');

    await shot(page, '01-detail-modal-1920-light');

    const xClose = page.locator('.rmr-detail-modal .ant-modal-close');
    check('explicit X close button present', await xClose.count() === 1);
    await xClose.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700);
    check('X close hides the modal', (await page.locator('.rmr-detail-modal').count()) === 0 || !(await page.locator('.rmr-detail-modal').isVisible()));

    const ov = await page.evaluate(() => {
      const de = document.documentElement;
      return de.scrollWidth - de.clientWidth;
    });
    check('[responsive 1920] no page horizontal overflow', ov <= 4, `overflow=${ov}px`);
    await page.close();

    // ---- Responsive scan 1280 / 768 / 390 ----
    const widths = [
      { w: 1280, h: 800, name: '02-detail-modal-1280' },
      { w: 768, h: 1024, name: '03-detail-modal-768' },
      { w: 390, h: 844, name: '04-detail-modal-390' },
    ];
    for (const { w, h, name } of widths) {
      const c = await makeContext({ width: w, height: h });
      const pg = await c.newPage();
      pg.on('pageerror', (e) => errors.push('pageerror@' + w + ': ' + String(e)));
      pg.on('console', (m) => { if (m.type() === 'error') errors.push('console@' + w + ': ' + m.text()); });
      await pg.goto(BASE + '/production/receiving', { waitUntil: 'domcontentloaded', timeout: 40000 });
      try { await pg.waitForSelector('tr.ant-table-row', { timeout: 40000 }); } catch {}
      await pg.waitForTimeout(900);
      const ok = await openDetailOnFirstRow(pg);
      check(`[responsive ${w}] detail opens as centered modal`, ok);
      const b = await modalBox(pg);
      const pv = pg.viewportSize();
      if (b) {
        const cX = b.x + b.width / 2;
        check(`[responsive ${w}] modal horizontally centered`, Math.abs(cX - pv.width / 2) < 90, `centerX=${Math.round(cX)}`);
        check(`[responsive ${w}] modal fits viewport width`, b.x >= 0 && b.x + b.width <= pv.width + 2, `x=${Math.round(b.x)} right=${Math.round(b.x + b.width)} vp=${pv.width}`);
      }
      const ovx = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`[responsive ${w}] no page horizontal overflow while modal open`, ovx <= 4, `overflow=${ovx}px`);
      await shot(pg, name);
      await pg.locator('.rmr-detail-modal .ant-modal-close').click().catch(() => {});
      await pg.waitForTimeout(400);
      check(`[responsive ${w}] X close works`, !(await pg.locator('.rmr-detail-modal').isVisible()));
      await pg.close();
      await c.close();
    }

    // ---- Dark mode look at 1920 ----
    const dctx = await makeContext({ width: 1920, height: 1080 });
    const dp = await dctx.newPage();
    dp.on('pageerror', (e) => errors.push('pageerror(dark): ' + String(e)));
    await dp.goto(BASE + '/production/receiving', { waitUntil: 'domcontentloaded', timeout: 40000 });
    try { await dp.waitForSelector('tr.ant-table-row', { timeout: 40000 }); } catch {}
    await dp.waitForTimeout(900);
    await dp.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await dp.waitForTimeout(300);
    await openDetailOnFirstRow(dp);
    await shot(dp, '05-detail-modal-1920-dark');
    check('dark-mode detail modal rendered', await dp.locator('.rmr-detail-modal').isVisible());
    await dp.close();
    await dctx.close();

    const cleanErrors = errors.filter((e) => !/Warning: validateDOMNesting|propType/i.test(e));
    check('no console/page errors during verification', cleanErrors.length === 0, cleanErrors.slice(0, 5).join(' | '));
  } finally {
    await browser.close();
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
    if (results.some((r) => !r.ok)) process.exitCode = 1;
  }
})();