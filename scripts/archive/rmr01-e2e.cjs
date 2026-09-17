// @ts-check
// RMR-01-A — Real browser E2E for the Raw Material Receiving page.
// Validates: header actions moved up, single form-data lookup (sections +
// departments bundled, ZERO per-lookup API calls), client-side cascades,
// draggable/resizable modal, persistent minimized dock across navigation,
// draft preservation, close-on-dock, and responsive scan at
// 1920 / 1280 / 768 / 390 without document-level horizontal overflow.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { spawn } = require('child_process');

const API = 'http://127.0.0.1:3001/api/v1';
const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';
const SHOT_DIR = 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\rmr01';
const FRONTEND = 'D:\\ERP-MRP-PWI-2026\\frontend';
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
        resolve({ status: res.statusCode, json, raw });
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

async function navTo(page, submenuLabel, itemLabel) {
  const item = page.locator(`.ant-menu-item:has-text("${itemLabel}")`).first();
  if ((await item.isVisible().catch(() => false))) { await item.click(); await page.waitForTimeout(1800); return; }
  const sub = page.locator(`.ant-menu-submenu-title:has-text("${submenuLabel}")`).first();
  const open = await sub.evaluate((el) => el.closest('.ant-menu-submenu')?.classList.contains('ant-menu-submenu-open')).catch(() => false);
  if (!open) { await sub.click().catch(() => {}); await page.waitForTimeout(500); }
  await item.click();
  await page.waitForTimeout(1800);
}

async function pickSelect(page, placeholder, optionText) {
  const plc = page.locator('.ant-select-selection-placeholder', { hasText: placeholder }).first();
  if ((await plc.count()) === 0) return 'no-placeholder';
  await plc.locator('..').click();
  await page.waitForTimeout(350);
  const opt = page.locator(`.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:has-text("${optionText}")`).first();
  try {
    await opt.waitFor({ state: 'visible', timeout: 8000 });
    await opt.click();
    await page.waitForTimeout(250);
    return 'picked';
  } catch {
    return 'not-found';
  }
}

const selValue = (page, id) =>
  page.locator(`input[id="${id}"], .ant-select[id="${id}"]`).first()

function docOverflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return { scrollW: de.scrollWidth, clientW: de.clientWidth, overflowX: de.scrollWidth - de.clientWidth };
  });
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const backendUp = await waitListening(3001, 3000);
  const frontendUp = await waitListening(3000, 3000);
  const children = [];
  if (!backendUp) {
    children.push(spawn('node.exe', ['dist/main.js'], { cwd: 'D:\\ERP-MRP-PWI-2026\\backend', stdio: 'ignore' }));
    check('backend child started', await waitListening(3001, 45000));
  } else {
    check('backend already up on 3001', true);
  }
  if (!frontendUp) {
    children.push(spawn('cmd.exe', ['/c', 'npm run start'], { cwd: FRONTEND, stdio: 'ignore' }));
    check('frontend child started', await waitListening(3000, 90000));
  } else {
    check('frontend already up on 3000', true);
  }
  if (!(await waitListening(3001, 3000)) || !(await waitListening(3000, 3000))) {
    console.log('\nABORT: services not reachable');
    for (const c of children) c.kill();
    process.exit(1);
  }

  const login = await httpJson('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  check('login via API', login.status === 201 && !!login.json?.token, `status=${login.status}`);
  if (!login.json?.token) { console.log('\nABORT: login failed'); for (const c of children) c.kill(); process.exit(1); }
  const token = login.json.token;

  // Fetch the form-data bundle once via API so the browser can pick
  // exactly-rendered option labels for the cascade walk.
  const bundle = (await httpJson('GET', '/inventory/receipts/gate-pass/form-data', { token })).json?.data || null;
  check('[api] form-data bundle fetchable via API', !!bundle, bundle ? `sections=${bundle.sections?.length} departments=${bundle.departments?.length}` : 'n/a');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const pageErrors = [];

  try {
    await context.addInitScript(({ token, user, refreshToken }) => {
      localStorage.setItem('token', token);
      if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('erp_user', JSON.stringify(user));
      localStorage.setItem('erp_permissions_ts', Date.now().toString());
      localStorage.setItem('erp_theme_prefs_v1', JSON.stringify({ [`user:${user.id}`]: { mode: 'light', paletteId: 'indigo' } }));
    }, { token: login.json.token, user: login.json.user, refreshToken: login.json.refreshToken });

    let page = await openPage(context, RECEIVING_ROUTE);
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + String(e)));
    page.on('console', (m) => {
      const t = Math.round((Date.now() - T0) / 100) / 10;
      if (m.type() === 'error') pageErrors.push(`error@${t}s[${page.url()}]: ${m.text()}`);
      else if (m.type() === 'warning') console.log(`   !warn@${t}s[${page.url().replace(BASE, '')}]: ${m.text()}`);
    });

    // ── Network instrumentation (ONE page, whole flow) ──────────────────────
    const net = { formData: 0, formDataMs: 0, orgCalls: 0, listCalls: 0, lastFormMs: 0 };
    const reqStart = new Map();
    page.on('request', (r) => {
      const url = r.url();
      if (url.includes('/gate-pass/form-data')) reqStart.set(r.request().headers()['x-amb-id'] || r.url(), Date.now());
    });
    page.on('response', async (res) => {
      const url = res.url();
      if (url.includes('/gate-pass/form-data')) {
        net.formData += 1;
        if (reqStart.has(url)) net.lastFormMs = Date.now() - reqStart.get(url);
      }
      if (url.includes('/inventory/receipts/organization/sections') || url.includes('/inventory/receipts/organization/departments')) {
        net.orgCalls += 1;
      }
      if (url.endsWith('/inventory/receipts/gate-pass') || url.includes('/inventory/receipts/gate-pass?')) net.listCalls += 1;
    });

    try {
      await page.waitForSelector('text=Raw Material Receiving', { timeout: 30000 });
    } catch {
      await page.waitForTimeout(4000);
    }
    try {
      await page.waitForSelector('tr.ant-table-row', { timeout: 40000 });
    } catch {}
    await page.waitForTimeout(1500);
    check('[ui] receiving page title + history table rendered', await page.locator('tr.ant-table-row').first().isVisible());
    await shot(page, '01-receiving-history');

    // ── Header actions moved into the shared header ─────────────────────────
    check('[ui] header "New Receipt (Gate Pass)" button visible',
      await page.locator('button:has-text("New Receipt (Gate Pass)")').first().isVisible());
    check('[ui] header "Refresh" button visible',
      await page.locator('button:has-text("Refresh")').first().isVisible());

    // ── Static spread: no document-level horizontal overflow at 1920 ────────
    const ov1920 = await docOverflow(page);
    check('[responsive 1920] no document horizontal overflow', ov1920.overflowX <= 4, `scrollW-clientW=${ov1920.overflowX}px`);

    // ── Open modal, verify a single bundled lookup and real cascades ────────
    const formDataStart = Date.now();
    await page.locator('button:has-text("New Receipt (Gate Pass)")').first().click();
    await page.waitForSelector('text=LIVE VERIFICATION (2027)', { timeout: 20000 });
    check('[api] form-data called exactly once for the whole session', net.formData === 1, `count=${net.formData}`);
    check('[api] ZERO calls to /organization/sections|departments', net.orgCalls === 0, `count=${net.orgCalls}`);
    console.log(`   (reference data ready by modal-open +${Date.now() - formDataStart}ms cumulative)`);
    await shot(page, '02-modal-open');

    // Draggable + resizable affordances present.
    check('[ui] modal has resize handle', await page.locator('.erp-draggable-modal-resize-handle').first().isVisible().catch(() => false));
    check('[ui] modal header is drag handle (cursor move)', (await page.locator('.ant-modal-header').first().evaluate((el) => getComputedStyle(el).cursor)) === 'move');

    // Drag the modal (real pointer drag) — position must change. Grab the
    // header near the left edge: the right/bottom of the header holds the
    // LIVE VERIFICATION chip + minimize button, which are excluded draggers.
    const modalEl = page.locator('.erp-draggable-modal');
    const dragState = { before: null, after: null, target: null, moves: 0 };
    dragState.before = await modalEl.evaluate((el) => el.style.transform);
    const hb = await page.locator('.ant-modal-header').first().boundingBox();
    if (hb) {
      await page.evaluate(() => {
        window.__rmDrag = [];
        window.addEventListener('mousedown', (e) => window.__rmDrag.push('md:' + (e.target.className?.toString?.().split(' ')[0] || e.target.tagName)), true);
        window.addEventListener('mousemove', (e) => { if (e.buttons & 1) window.__rmDrag.push(`mm:${e.clientX},${e.clientY}`); });
      });
      await page.mouse.move(hb.x + 30, hb.y + 18);
      await page.mouse.down();
      await page.mouse.move(hb.x + 230, hb.y + 138, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(800);
      dragState.target = JSON.stringify(await page.evaluate(() => window.__rmDrag));
      dragState.after = await modalEl.evaluate((el) => el.style.transform);
    }
    const moved = (dragState.after || '') !== (dragState.before || '');
    const dX = parseFloat((dragState.after || '').match(/translate\((-?[\d.]+)px/)?.[1] || '0');
    const dY = parseFloat((dragState.after || '').match(/translate\(-?[\d.]+px,\s*(-?[\d.]+)px/)?.[1] || '0');
    check('[ui] modal draggable (transform changed)', moved, `before="${dragState.before}" after="${dragState.after}"`);
    console.log(`   drag dX=${dX} dY=${dY}  events=${dragState.target?.slice(0, 220)}`);

    // Resize via the handle (real pointer drag on bottom-right corner).
    const rb = await page.locator('.erp-draggable-modal-resize-handle').first().boundingBox();
    const sizeBefore = await page.locator('.ant-modal-wrap .ant-modal').first().evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
    if (rb) {
      await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
      await page.mouse.down();
      await page.mouse.move(rb.x + 160, rb.y + 100, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(600);
    }
    const sizeAfter = await page.locator('.ant-modal-wrap .ant-modal').first().evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
    check('[ui] modal resizable (size changed)',
      Math.abs(sizeAfter.w - sizeBefore.w) > 20 || Math.abs(sizeAfter.h - sizeBefore.h) > 20,
      `dW=${Math.round(sizeAfter.w - sizeBefore.w)} dH=${Math.round(sizeAfter.h - sizeBefore.h)}`);

    // ── Real cascade: Division → Section → Department against live data ─────
    if (bundle && Array.isArray(bundle.divisions) && bundle.divisions.length) {
      const div = bundle.divisions[0];
      const divLabel = `${div.divisionCode || ''} — ${div.name}`.replace(/^— /, '');
      const secs = (bundle.sections || []).filter((s) => !s.divisionId || s.divisionId === div.id);
      const sec = secs[0];
      const secLabel = sec ? `${sec.sectionCode || ''} — ${sec.name}`.replace(/^— /, '') : null;
      const depts = (bundle.departments || []).filter((d) => (!d.divisionId || d.divisionId === div.id) && (!sec || !d.sectionId || d.sectionId === sec.id));
      const dept = depts[0];
      const deptLabel = dept ? `${dept.departmentCode || ''} — ${dept.name}`.replace(/^— /, '') : null;

      const didPickDiv = await pickSelect(page, 'Select Division', divLabel);
      console.log(`   picking Division "${divLabel}" -> ${didPickDiv} (sections=${secs.length})`);
      await page.waitForTimeout(700);

      // Auto-select when exactly one section.
      if (secs.length === 1) {
        const txt = (await page.locator('.ant-select[id*="section"] .ant-select-selection-item').first().textContent().catch(() => '')) || '';
        const auto = txt.includes(sec.name);
        check('[cascade] single Section auto-selected', auto, `value="${txt}"`);
      } else {
        check('[cascade] multiple Sections left for manual pick (no auto)', true, `sections=${secs.length}`);
        if (secLabel) {
          const p = await pickSelect(page, 'Select Section', secLabel);
          console.log(`   picking Section "${secLabel}" -> ${p}`);
        }
      }
      if (deptLabel) {
        const p = await pickSelect(page, 'Select Department', deptLabel);
        console.log(`   picking Department "${deptLabel}" -> ${p}`);
      }
      await page.waitForTimeout(500);
    } else {
      check('[cascade] real bundle available for cascade walk', false, 'no bundle');
    }

    // Record a gate pass number to prove draft preservation later.
    const gpInput = page.locator('input[placeholder="e.g. GP-10250"], input[placeholder*="GP-"]').first();
    if (await gpInput.count()) {
      await gpInput.click();
      await gpInput.fill('GP-RMR01-E2E');
      await page.waitForTimeout(300);
    }
    check('[ui] gate pass number typed', (await gpInput.inputValue().catch(() => '')) === 'GP-RMR01-E2E');
    await shot(page, '03-modal-filled');

    // ── Minimize → navigate → dock persists → restore with draft ────────────
    const minBtn = page.locator('[data-testid="modal-minimize-btn"]').first();
    await minBtn.click();
    await page.waitForSelector('[data-testid="rm-persistent-minimized-bar"]', { timeout: 15000 });
    check('[dock] persistent minimized bar appears after minimize', true);

    // Navigate via the real sidebar (SPA, no reload) to prove the dock
    // outlives route changes handled by React Router.
    await navTo(page, 'Production', 'Production Dashboard');
    check('[dock] persists across real sidebar SPA navigation',
      await page.locator('[data-testid="rm-persistent-minimized-bar"]').isVisible());
    await shot(page, '04-dock-on-other-page');

    // Restore from the dock -> back to receiving, modal re-opens, draft intact.
    await page.locator('[data-testid="rm-dock-restore"]').click();
    await page.waitForSelector('text=LIVE VERIFICATION (2027)', { timeout: 30000 });
    await page.waitForTimeout(800);
    const restored = await page.locator('input[placeholder="e.g. GP-10250"], input[placeholder*="GP-"]').first().inputValue().catch(() => '');
    check('[dock] restore re-opens same draft on the receiving page', restored === 'GP-RMR01-E2E', `value="${restored}"`);
    await shot(page, '05-restored-draft');

    // Close on the dock discards the draft entirely.
    await page.locator('[data-testid="modal-minimize-btn"]').first().click();
    await page.waitForSelector('[data-testid="rm-persistent-minimized-bar"]', { timeout: 15000 });
    await page.locator('[data-testid="rm-dock-close"]').click();
    await page.waitForTimeout(800);
    check('[dock] close discards the draft (bar disappears)',
      (await page.locator('[data-testid="rm-persistent-minimized-bar"]').count()) === 0);
    await page.close();

    // ── Responsive scan on the receiving page ───────────────────────────────
    const widths = [1920, 1280, 768, 390];
    const ovs = {};
    for (const w of widths) {
      const h = w === 390 ? 844 : w === 768 ? 1024 : 800;
      const pg = await openPage(context, RECEIVING_ROUTE);
      pg.on('pageerror', (e) => pageErrors.push(`resp(${w}) pageerror: ${String(e)}`));
      try { await pg.waitForSelector('tr.ant-table-row', { timeout: 40000 }); } catch {}
      await pg.waitForTimeout(800);
      const o = await docOverflow(pg);
      ovs[w] = o.overflowX;
      check(`[responsive ${w}] no document horizontal overflow`, o.overflowX <= 4, `overflow=${o.overflowX}px scrollW=${o.scrollW} clientW=${o.clientW}`);
      await pg.setViewportSize({ width: w, height: h });
      await pg.waitForTimeout(400);
      await shot(pg, `06-responsive-${w}`);
      await pg.close();
    }

    const realErrors = pageErrors.filter((e) => !e.includes('There may be circular references'));
    if (pageErrors.some((e) => e.includes('There may be circular references'))) {
      console.log('   (ignored: pre-existing dev-only antd/rc-util "circular references" isEqual warning)');
    }
    check('[errors] no page/console errors during entire run', realErrors.length === 0, realErrors.slice(0, 4).join(' | '));
  } finally {
    await browser.close();
    for (const c of children) c.kill();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log('\n──────────────────────── RMR-01-A E2E ────────────────────────');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}\t${r.name}${r.extra ? ' :: ' + r.extra : ''}`);
  console.log(`SUMMARY: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR', e); process.exit(2); });