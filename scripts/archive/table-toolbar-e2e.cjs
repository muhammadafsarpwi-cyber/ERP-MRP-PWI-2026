// @ts-check
// FINAL VERIFICATION — ERP Shared Table + Toolbar UI review.
// Non-destructive browser checks across Target Management, Machine Master,
// Machine Tooling, Routing, BOM, Employees at 1920/1280/768/390 (light) + 1280 (dark).
// Verifies: page load, toolbar order (Add → Refresh), sticky header opt-in only,
// horizontal table scroll, pagination, filters, modal open/close, console/page errors.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const API = 'http://127.0.0.1:3001/api/v1';
const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';
const SHOT_DIR = 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\table-toolbar';

const results = [];
function check(name, ok, extra) {
  const row = { name, ok: !!ok, extra: extra || '' };
  results.push(row);
  console.log(`${ok ? 'PASS' : 'FAIL'}\t${name}${extra ? ' :: ' + extra : ''}`);
}
function info(msg) { console.log('INFO\t' + msg); }

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
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function openPage(page, { token, user, refreshToken, mode, route }) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.evaluate(({ token, user, refreshToken, mode }) => {
    localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('erp_user', JSON.stringify(user));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
    if (mode) {
      localStorage.setItem('erp_theme_prefs_v1', JSON.stringify({
        [`user:${user.id}`]: { mode, paletteId: 'indigo' },
      }));
    }
  }, { token, user, refreshToken, mode });
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
}

// reading-order comparison works across toolbar wrap on mobile
async function boxOf(page, locatorHandle) {
  const box = await locatorHandle.boundingBox();
  if (!box) return null;
  return box;
}
const orderMetric = (box) => Math.round(box.y) * 1000000 + Math.round(box.x);

const PAGES = [
  {
    key: 'targets',
    label: 'Target Management',
    route: '/production/targets',
    heading: 'Machine Targets',
    addBtn: 'Add Target',
    addBtnExact: true,
    expectSticky: true,
  },
  {
    key: 'machine-master',
    label: 'Machine Master',
    route: '/master-data/machines',
    heading: 'Machine Master',
    addBtn: 'Add Machine',
    addBtnExact: true,
    expectSticky: true,
  },
  {
    key: 'machine-tooling',
    label: 'Machine Tooling',
    route: '/master-data/machine-tools',
    heading: 'Machine Tools & Components',
    addBtn: 'Add Tool / Component',
    addBtnExact: false,
    expectSticky: false,
  },
  {
    key: 'routing',
    label: 'Routing',
    route: '/production/routings',
    heading: 'Production Routings',
    addBtn: 'New Routing',
    addBtnExact: true,
    expectSticky: false,
  },
  {
    key: 'bom',
    label: 'BOM',
    route: '/production/bom',
    heading: 'Bill of Materials',
    addBtn: 'New BOM',
    addBtnExact: true,
    expectSticky: false,
  },
  {
    key: 'employees',
    label: 'Employees',
    route: '/hr/employees',
    heading: 'Employees Master Directory',
    addBtn: 'New Employee',
    addBtnExact: true,
    expectSticky: false,
  },
];

const VIEWPORTS = [
  { w: 1920, h: 1000, mode: 'light' },
  { w: 1280, h: 900, mode: 'light' },
  { w: 768, h: 900, mode: 'light' },
  { w: 390, h: 844, mode: 'light' },
  { w: 1280, h: 900, mode: 'dark' },
];

async function verifyPage(browser, auth, cfg, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const httpErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('response', (res) => {
    if (res.status() >= 500) httpErrors.push(`${res.status()} ${res.url()}`);
  });

  const tag = `${cfg.key}@${vp.w}x${vp.h}/${vp.mode}`;
  const ok = (name, cond, extra) => check(`${tag} :: ${name}`, cond, extra);

  try {
    await openPage(page, { ...auth, route: cfg.route, mode: vp.mode });

    // 1) page load — heading (attach; some headings hide at small sizes)
    await page.waitForSelector(`text=${cfg.heading}`, { state: 'attached', timeout: 25000 });
    await page.waitForTimeout(2000);
    const headingVisible = await page.locator(`text=${cfg.heading}`).first().isVisible().catch(() => false);
    const tableRendered = await page.locator('.ant-table').count();
    ok('page loads', headingVisible || tableRendered > 0, `${cfg.heading} headingVisible=${headingVisible}, tables=${tableRendered}`);

    // theme check
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    ok('theme applied', theme === vp.mode, `theme=${theme}`);

    // tables rendered
    const tableCount = await page.locator('.ant-table-wrapper, .ant-table').count();
    ok('table rendered', tableCount > 0, `tables=${tableCount}`);

    // 2) toolbar order — Add before Refresh
    const addBtn = page.locator('button', { hasText: cfg.addBtn }).locator('visible=true').first();
    const addVisible = await addBtn.isVisible().catch(() => false);
    ok('add button visible', addVisible, cfg.addBtn);
    const refreshBtn = page.locator('button:has(.anticon-reload)').locator('visible=true').first();
    const refreshVisible = await refreshBtn.isVisible().catch(() => false);
    ok('refresh button visible', refreshVisible, 'icon-only reload');

    if (addVisible && refreshVisible) {
      const a = await boxOf(page, addBtn);
      const r = await boxOf(page, refreshBtn);
      if (a && r) {
        ok('toolbar order Add→Refresh', orderMetric(a) <= orderMetric(r),
          `add=${Math.round(a.x)},${Math.round(a.y)} refresh=${Math.round(r.x)},${Math.round(r.y)}`);
      } else {
        ok('toolbar order Add→Refresh', false, 'boxes unavailable');
      }
    }

    // 3) sticky header — only where opted in
    const stickyHolders = await page.locator('.ant-table-sticky-holder').count();
    ok('sticky header as opted-in', stickyHolders > 0 === cfg.expectSticky,
      `sticky-holders=${stickyHolders}, expect=${cfg.expectSticky}`);

    // 4) horizontal table scroll (internal) + no page-level overflow
    const scrollInfo = await page.evaluate(() => {
      const sel = '.ant-table-content, .ant-table-body, .ant-table-header';
      const els = Array.from(document.querySelectorAll(sel));
      const info = els.map((el) => {
        const cs = getComputedStyle(el);
        return {
          cls: (el.className || '').toString().slice(0, 40),
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
          overflowX: cs.overflowX,
        };
      });
      const doc = document.documentElement;
      return {
        containers: info,
        docScrollW: doc.scrollWidth,
        winW: window.innerWidth,
      };
    });
    // a) page must never horizontally overflow the viewport (regression guard)
    ok('no page-level horizontal overflow', scrollInfo.docScrollW <= scrollInfo.winW + 1,
      `docScrollW=${scrollInfo.docScrollW} winW=${scrollInfo.winW}`);
    // b) every overflowing table region must be internally scrollable
    const overflowing = scrollInfo.containers.filter((c) => c.scrollW > c.clientW + 1);
    const scrollOk = overflowing.every((c) => /auto|scroll|hidden/.test(c.overflowX));
    ok('table overflow contained in internal scroll', scrollOk,
      overflowSummary(scrollInfo.containers));
    if (overflowing.length) {
      info(`${tag} :: overflowing containers=${JSON.stringify(overflowing)}`);
    }

    // 5) pagination + rows (poll for rows a bit)
    await page.waitForFunction(() => {
      const t = document.querySelectorAll('.ant-table-tbody .ant-table-row, .ant-table-placeholder').length;
      return t > 0 || document.querySelectorAll('.ant-spin-spinning').length === 0;
    }, { timeout: 15000 }).catch(() => {});
    const rowCount = await page.locator('.ant-table-tbody .ant-table-row').count();
    const pag = await page.locator('.ant-pagination').count();
    ok('pagination present when rows > 0', rowCount === 0 || pag > 0, `rows=${rowCount}, pagination=${pag}`);

    // 6) filters present
    const filters = await page.evaluate(() => {
      const selects = document.querySelectorAll('.ant-select-selector').length;
      const search = document.querySelectorAll('input[placeholder*="Search" i]').length;
      const filterBtns = document.querySelectorAll('button:has(.anticon-filter), button:has(.anticon-search)').length;
      return selects + search + filterBtns;
    });
    ok('filter controls present', filters > 0, `filterControls=${filters}`);

    // 7) modal open / close (non-destructive)
    if (addVisible) {
      await addBtn.click();
      const modal = page.locator('.ant-modal:not(.ant-modal-confirm)');
      await page.waitForTimeout(700);
      const modalVisible = await modal.first().isVisible().catch(() => false);
      ok('modal opens', modalVisible, cfg.addBtn);
      if (modalVisible) {
        const titleText = await modal.first().locator('.ant-modal-title, .ant-drawer-title, .ant-modal-header').first().textContent().catch(() => '');
        info(`${tag} :: modal title="${(titleText || '').trim().slice(0, 60)}"`);
        // close via close button, then ESC fallback
        const closeBtn = page.locator('.ant-modal-close, .ant-modal .ant-btn-default:has-text("Cancel")').first();
        if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();
        else await page.keyboard.press('Escape');
        await page.waitForTimeout(700);
        if (await modal.first().isVisible().catch(() => false)) {
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(500);
        }
        const stillOpen = await modal.first().isVisible().catch(() => false);
        ok('modal closes', !stillOpen);
      }
      // make sure any stray modal/popup is dismissed before continuing
      await page.keyboard.press('Escape').catch(() => {});
    }
  } catch (e) {
    ok('page verification', false, `error=${String(e).slice(0, 200)}`);
  }

  // screenshot evidence
  const file = `${SHOT_DIR}\\${cfg.key}-${vp.w}x${vp.h}-${vp.mode}.png`;
  try { await page.screenshot({ path: file, fullPage: false }); } catch {}

  ok('no page errors (exceptions)', pageErrors.length === 0, pageErrors[0] ? pageErrors[0].slice(0, 160) : '');
  const realConsoleErrors = consoleErrors.filter((c) => !KNOWN_BENIGN_CONSOLE_ERRORS.some((k) => c.includes(k)));
  ok('no console errors', realConsoleErrors.length === 0, realConsoleErrors[0] ? realConsoleErrors[0].slice(0, 160) : '');
  if (realConsoleErrors.length !== consoleErrors.length) {
    info(`${tag} :: ${consoleErrors.length - realConsoleErrors.length} known-benign console error(s) (pre-existing antd useForm warning)`);
  }

  if (httpErrors.length) {
    const uniq = [...new Set(httpErrors)].slice(0, 3);
    ok('no http 5xx', false, uniq.join(' | '));
  } else {
    ok('no http 5xx', true);
  }

  await ctx.close();
}

function overflowSummary(containers) {
  return containers.map((c) => `${c.cls}:${c.scrollW}/${c.clientW}/${c.overflowX}`).join(' | ');
}

const KNOWN_BENIGN_CONSOLE_ERRORS = [
  'not connected to any Form element', // antd useForm created without a mounted Form (pre-existing in MachineTooling)
];

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const login = await httpJson('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  if (login.status !== 201 || !login.json?.token) {
    console.log('ABORT: login failed', login.status, login.raw);
    process.exit(1);
  }
  info('login via API OK');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const cfg of PAGES) {
      for (const vp of VIEWPORTS) {
        await verifyPage(browser, login.json, cfg, vp);
      }
    }
  } finally {
    await browser.close();
  }

  const fails = results.filter((r) => !r.ok);
  console.log(`\n==== SUMMARY: ${results.length} checks, ${fails.length} failed ====`);
  for (const f of fails) console.log('FAIL\t' + f.name + (f.extra ? ' :: ' + f.extra : ''));

  fs.writeFileSync(path.join(SHOT_DIR, 'results.json'), JSON.stringify({ checks: results, failed: fails.length, total: results.length }, null, 2));
})().catch((e) => { console.error('E2E CRASH', e); process.exit(2); });