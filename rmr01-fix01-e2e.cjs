// @ts-check
// RMR-01-A-FIX-01 focused verification: breadcrumb + page header correction only.
// Checks: Home icon crumb, "Home / Production / Raw Material Receiving" (no
// duplicated Production), page title, single New Receipt / Refresh in header,
// no duplicate actions, responsive overflow at 1920/1280/768/390, no errors.
const fs = require('fs');
const { chromium } = require('playwright');

const API = 'http://127.0.0.1:3001/api/v1';
const BASE = 'http://127.0.0.1:3000';
const SHOT_DIR = 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\rmr01-fix01';

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

async function crumbs(page) {
  return page.locator('.ant-breadcrumb-item').allTextContents().then((t) => t.map((x) => x.trim()).filter(Boolean));
}

async function headerTitle(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(
      (d) => d.style?.fontWeight === '700' && d.textContent && d.children.length === 0,
    );
    return el ? el.textContent.trim() : '';
  });
}

async function overflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return { scrollW: de.scrollWidth, clientW: de.clientWidth, overflowX: de.scrollWidth - de.clientWidth };
  });
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const login = await httpJson('POST', '/auth/login', { body: { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' } });
  check('login via API', login.status === 201 && !!login.json?.token, `status=${login.status}`);
  if (!login.json?.token) process.exit(1);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('refresh_token', token);
    localStorage.setItem('erp_user', JSON.stringify(user));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
  }, { token: login.json.token, user: login.json.user });

  const errors = [];
  try {
    // Main verification at 1920x1080
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('There may be circular references')) errors.push('console: ' + m.text()); });
    await page.goto(BASE + '/production/receiving', { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await page.waitForSelector('tr.ant-table-row', { timeout: 40000 }); } catch {}
    await page.waitForTimeout(1200);

    const c = await crumbs(page);
    check('breadcrumb = Home / Production / Raw Material Receiving',
      c.length === 3 && c[0] === 'Home' && c[1] === 'Production' && c[2] === 'Raw Material Receiving',
      JSON.stringify(c));
    check('no duplicated Production', c.filter((x) => x === 'Production').length === 1, JSON.stringify(c));
    const homeHasIcon = await page.locator('.ant-breadcrumb-item').first().locator('svg, [role="img"]').count();
    check('Home crumb has Home icon', homeHasIcon >= 1, `iconElements=${homeHasIcon}`);
    const title = await headerTitle(page);
    check('page title = "Raw Material Receiving"', title === 'Raw Material Receiving', `"${title}"`);

    const newBtn = await page.locator('button:has-text("New Receipt (Gate Pass)")').count();
    const refBtn = await page.locator('button:has-text("Refresh")').count();
    check('"New Receipt (Gate Pass)" appears once', newBtn === 1, `count=${newBtn}`);
    check('"Refresh" appears once', refBtn === 1, `count=${refBtn}`);
    check('actions live in main header', await page.locator('button:has-text("New Receipt (Gate Pass)")').first().isVisible());
    await shot(page, '01-fix-main-1920');

    const ov = await overflow(page);
    check('[responsive 1920] no horizontal overflow', ov.overflowX <= 4, `overflow=${ov.overflowX}px`);
    await page.close();

    // Responsive scan
    const widths = [1920, 1280, 768, 390];
    for (const w of widths) {
      const h = w === 390 ? 844 : w === 768 ? 1024 : w === 1280 ? 800 : 1080;
      const pg = await context.newPage();
      pg.on('pageerror', (e) => errors.push(`resp(${w}) pageerror: ${String(e)}`));
      pg.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('There may be circular references')) errors.push(`resp(${w}) console: ${m.text()}`); });
      await pg.goto(BASE + '/production/receiving', { waitUntil: 'domcontentloaded', timeout: 30000 });
      try { await pg.waitForSelector('tr.ant-table-row', { timeout: 40000 }); } catch {}
      await pg.waitForTimeout(1000);
      const cw = await crumbs(pg);
      const ovX = (await overflow(pg)).overflowX;
      check(`[responsive ${w}] breadcrumb correct + no overflow`,
        cw.length === 3 && cw[2] === 'Raw Material Receiving' && ovX <= 4,
        `crumbs=${JSON.stringify(cw)} overflow=${ovX}px`);
      await pg.setViewportSize({ width: w, height: h });
      await pg.waitForTimeout(400);
      await shot(pg, `02-fix-${w}`);
      await pg.close();
    }

    check('[errors] no console/page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log('\n──────────────────── RMR-01-A-FIX-01 ────────────────────');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}\t${r.name}${r.extra ? ' :: ' + r.extra : ''}`);
  console.log(`SUMMARY: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FIX-01 ERROR', e); process.exit(2); });