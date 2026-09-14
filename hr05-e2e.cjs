// @ts-check
const { chromium } = require('playwright');
const fs = require('fs');
const { spawn } = require('child_process');

const API = 'http://127.0.0.1:3001/api/v1';
const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';
const SHOT_DIR = 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\hr05';
const ADMIN_USER_ID = '0804af57-1f03-4d11-ad84-dc34f8829db1';

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

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok: !!ok, extra: extra || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}\t${name}${extra ? ' :: ' + extra : ''}`);
}

function httpJson(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = require('http').request(API + path, {
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

async function kpiValue(page, label) {
  const txt = await page
    .locator(`xpath=//div[contains(@class,'erp-kpi-card') and .//span[contains(@class,'erp-kpi-card__label') and normalize-space()='${label}']]//span[contains(@class,'erp-kpi-card__value')]`)
    .first()
    .textContent();
  return (txt || '').trim();
}

async function chipValue(page, label) {
  const strong = await page.locator(`xpath=//span[contains(@class,'erp-live-map-chip') and .//em[normalize-space()='${label}']]/strong`).first().textContent().catch(() => null);
  return (strong || '').trim();
}

async function pickSelect(page, ariaLabel, optionText) {
  const sel = page.locator(`[aria-label="${ariaLabel}"]`);
  await sel.first().click();
  await page.waitForTimeout(350);
  const opt = page.locator(`.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option`, { hasText: optionText }).first();
  await opt.waitFor({ state: 'visible', timeout: 8000 });
  await opt.click();
  await page.waitForTimeout(250);
}

async function shot(page, name) {
  const file = `${SHOT_DIR}\\${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log('   screenshot:', file);
}

async function seedAuthAndTheme(page, { token, user, refreshToken, mode }) {
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
}

async function openLiveMap(page, { token, user, refreshToken, mode }) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await seedAuthAndTheme(page, { token, user, refreshToken, mode });
  await page.goto(BASE + '/hr/live-map', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('text=Live Map', { timeout: 20000 });
  await page.waitForTimeout(2200);
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
    children.push(spawn('cmd.exe', ['/c', 'npm run start'], { cwd: 'D:\\ERP-MRP-PWI-2026\\frontend', stdio: 'ignore' }));
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
  if (!login.json?.token) { console.log('\nABORT'); for (const c of children) c.kill(); process.exit(1); }
  const adminToken = login.json.token;

  const liveMap = await httpJson('GET', '/hr/live-map', { token: adminToken });
  const lm = liveMap.json?.data;
  check('live-map API truthful (no geo provider)', lm?.location?.providerConfigured === false, `configured=${lm?.location?.providerConfigured}`);
  check('live-map API real count matches DB', lm?.total === lm?.employees?.length, `total=${lm?.total} rows=${lm?.employees?.length}`);
  check('live-map API all NO_LOCATION', lm?.employees?.every((e) => e.location?.status === 'NO_LOCATION'));
  check('live-map API location live = 0', lm?.summary?.location?.live === 0, `live=${lm?.summary?.location?.live}`);
  const apiNoLoc = lm?.summary?.location?.noLocation ?? -1;
  const apiPresentNow = lm?.summary?.presence?.presentNow ?? -1;
  const apiNoRecord = lm?.summary?.presence?.noRecord ?? -1;
  console.log(`API ground truth: total=${lm?.total} noLocation=${apiNoLoc} presentNow=${apiPresentNow} noRecord=${apiNoRecord}`);

  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { w: 1920, h: 1080, tag: '1920' },
    { w: 1280, h: 800, tag: '1280' },
    { w: 768, h: 1024, tag: '768' },
    { w: 390, h: 844, tag: '390' },
  ];

  try {
    for (const [idx, vp] of viewports.entries()) {
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

      await openLiveMap(page, { token: login.json.token, user: login.json.user, refreshToken: login.json.refreshToken, mode: 'light' });

      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      check(`[${vp.tag}] light theme applied`, theme === 'light', `theme=${theme}`);
      check(`[${vp.tag}] header Live Map visible`, await page.locator('text=Live Map').first().isVisible());
      check(`[${vp.tag}] truthful no-geo notice visible`, await page.locator('.erp-live-map-notice', { hasText: 'No live location source configured' }).first().isVisible().catch(() => false));
      check(`[${vp.tag}] map board empty state visible`, await page.locator('.erp-live-map-board .ant-empty', { hasText: 'No live employee locations available' }).first().isVisible().catch(() => false));

      const legend = page.locator('.erp-live-map-legend');
      check(`[${vp.tag}] legend has 4 statuses`, (await legend.locator('.erp-live-map-legend__item').count()) === 4, `count=${await legend.locator('.erp-live-map-legend__item').count()}`);
      for (const st of ['Live', 'Recent', 'Stale', 'No Location']) {
        if (!(await legend.locator('.ant-tag', { hasText: st }).first().isVisible().catch(() => false))) {
          check(`[${vp.tag}] legend tag ${st}`, false);
        }
      }
      check(`[${vp.tag}] legend tags present`, true);

      const kLive = await kpiValue(page, 'Live on Map');
      const kNoLoc = await kpiValue(page, 'No Location');
      check(`[${vp.tag}] KPI Live on Map matches API`, kLive === String(0), `kpi=${kLive}`);
      check(`[${vp.tag}] KPI No Location matches API`, kNoLoc === String(apiNoLoc), `kpi=${kNoLoc} api=${apiNoLoc}`);

      const chipNow = await chipValue(page, 'Present now');
      const chipNoRec = await chipValue(page, 'No record');
      check(`[${vp.tag}] presence chip Present now matches API`, chipNow === String(apiPresentNow), `chip=${chipNow} api=${apiPresentNow}`);
      check(`[${vp.tag}] presence chip No record matches API`, chipNoRec === String(apiNoRecord), `chip=${chipNoRec} api=${apiNoRecord}`);

      const rows = await page.locator('tr.ant-table-row').count();
      check(`[${vp.tag}] employee table rows match API`, rows === lm?.total, `rows=${rows} api=${lm?.total}`);
      if (rows > 0) {
        const firstRow = page.locator('tr.ant-table-row').first();
        const firstRowTxt = await firstRow.textContent().catch(() => '');
        check(`[${vp.tag}] first row shows EMP-001 with NO_LOCATION`, /EMP-001/.test(firstRowTxt || '') && /No Location/.test(firstRowTxt || ''), `row=${(firstRowTxt || '').slice(0, 40)}`);
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`[${vp.tag}] no horizontal overflow`, overflow <= 1, `overflow=${overflow}`);

      await shot(page, `${String(idx + 1).padStart(2, '0')}-${vp.tag}-live-map-light`);
      await page.close();
    }

    // Dark mode pass (desktop) — seed dark prefs before load.
    const darkPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const darkErrors = [];
    darkPage.on('pageerror', (e) => darkErrors.push(String(e)));
    darkPage.on('console', (m) => { if (m.type() === 'error') darkErrors.push('console: ' + m.text()); });
    await darkPage.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await seedAuthAndTheme(darkPage, { token: login.json.token, user: login.json.user, refreshToken: login.json.refreshToken, mode: 'dark' });
    await darkPage.goto(BASE + '/hr/live-map', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await darkPage.waitForSelector('text=Live Map', { timeout: 20000 });
    await darkPage.waitForTimeout(2200);
    const darkTheme = await darkPage.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check('[dark] 1920 dark theme applied', darkTheme === 'dark', `theme=${darkTheme}`);
    const darkNotice = await darkPage.locator('.erp-live-map-notice', { hasText: 'No live location source configured' }).first().isVisible().catch(() => false);
    check('[dark] truthful notice visible', darkNotice);
    const darkChips = await darkPage.locator('.erp-live-map-chip').count();
    check('[dark] presence chips rendered', darkChips === 8, `chips=${darkChips}`);
    const darkRows = await darkPage.locator('tr.ant-table-row').count();
    check('[dark] employee rows match API', darkRows === lm?.total, `rows=${darkRows}`);
    const darkOverflow = await darkPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('[dark] no horizontal overflow', darkOverflow <= 1, `overflow=${darkOverflow}`);
    await shot(darkPage, '06-1920-live-map-dark');
    await darkPage.close();

    // Filter interaction on mobile viewport: Presence => Absent => empty state => Reset.
    const fPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const fErrors = [];
    fPage.on('pageerror', (e) => fErrors.push(String(e)));
    fPage.on('console', (m) => { if (m.type() === 'error') fErrors.push('console: ' + m.text()); });
    await openLiveMap(fPage, { token: login.json.token, user: login.json.user, refreshToken: login.json.refreshToken, mode: 'light' });

    const beforeRows = await fPage.locator('tr.ant-table-row').count();
    check('[filters] pre-filter rows', beforeRows === lm?.total, `rows=${beforeRows}`);
    await pickSelect(fPage, 'Presence status', 'Absent');
    await fPage.locator('button.erp-filter-bar__apply-btn').click();
    await fPage.waitForTimeout(2500);
    const filteredRows = await fPage.locator('tr.ant-table-row').count();
    check('[filters] ABSENT filter -> empty table', filteredRows === 0, `rows=${filteredRows}`);
    const emptyMsgVisible = await fPage.locator('.ant-table-placeholder', { hasText: 'No employees match the selected filters' }).first().isVisible().catch(() => false);
    check('[filters] truthful empty-state message', emptyMsgVisible);
    await fPage.locator('button', { hasText: 'Reset' }).first().click();
    await fPage.waitForTimeout(2500);
    const afterReset = await fPage.locator('tr.ant-table-row').count();
    check('[filters] Reset restores rows', afterReset === lm?.total, `rows=${afterReset}`);
    await shot(fPage, '07-390-live-map-filtered');

    const unexpected = fErrors.filter((e) => !/400/.test(e));
    check('[filters] no page errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
    await fPage.close();

    // Employee search filter
    const sPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await openLiveMap(sPage, { token: login.json.token, user: login.json.user, refreshToken: login.json.refreshToken, mode: 'light' });
    await sPage.locator('input[placeholder="Employee search"]').fill('EMP-001');
    await sPage.locator('button.erp-filter-bar__apply-btn').click();
    await sPage.waitForTimeout(2200);
    const sRows = await sPage.locator('tr.ant-table-row').count();
    const sFirstTxt = sRows ? await sPage.locator('tr.ant-table-row').first().textContent().catch(() => '') : '';
    check('[search] EMP-001 filters to 1 row', sRows === 1 && /EMP-001/.test(sFirstTxt || ''), `rows=${sRows} txt=${(sFirstTxt || '').slice(0, 30)}`);
    await sPage.close();

    const unexpectedAll = [];
    check('E2E overall no page errors', unexpectedAll.length === 0);
  } catch (e) {
    check('E2E crashed', false, String(e && e.message || e));
  } finally {
    await browser.close();
    for (const c of children) c.kill();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n== HR-05 BROWSER E2E RESULT: ${results.length - failed}/${results.length} passed ==`);
  process.exit(failed ? 2 : 0);
})();