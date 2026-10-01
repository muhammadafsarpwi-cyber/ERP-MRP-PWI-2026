const { chromium } = require('playwright');

const USERS = [
  { id: 'user-1', authUserId: 'auth-1', displayName: 'Junaid Ahmed', username: 'junaid.ahmed', email: 'junaid@pwi.com', phone: '+92 300 1234567', employeeId: 'EMP-00125', status: 'ACTIVE', avatarUrl: null, defaultCompany: { id: 'comp-1', tradeName: 'PakWiz Industries' }, userRoles: [{ id: 'ur-1', roleId: 'r1', role: { id: 'r1', roleCode: 'ADMIN', name: 'A' } }], organizationScopes: [{ id: 's1', scopeLevel: 'DIVISION', isFullScope: false, status: 'ACTIVE', division: { id: 'd1', divisionCode: 'DIV-CCD', name: 'Control Cable Division' } }, { id: 's2', scopeLevel: 'DIVISION', isFullScope: false, status: 'ACTIVE', division: { id: 'd2', divisionCode: 'DIV-SPD', name: 'Spoke Division' } }], createdAt: '2026-09-29T10:30:00Z', lastLoginAt: '2026-09-30T14:45:00Z' },
  { id: 'user-2', authUserId: 'auth-2', displayName: 'Sara Khan', email: 'sara@pwi.com', phone: '', employeeId: '', status: 'INACTIVE', avatarUrl: null, defaultCompany: { id: 'comp-1', tradeName: 'PakWiz Industries' }, userRoles: [], organizationScopes: [], createdAt: '2026-09-11T10:00:00Z', lastLoginAt: null },
];

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`);
  if (!cond) failures++;
}
const lum = (rgb) => { const m = rgb && rgb.match(/[\d.]+/g); if (!m) return -1; const [r, g, b] = m.map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('erp_user', JSON.stringify({ id: 'admin-1', displayName: 'A', permissions: ['admin.users.view', 'admin.users.create', 'admin.users.update', 'admin.users.assign_roles', 'admin.users.manage_scope', 'admin.users.deactivate', 'admin.users.activate'] }));
    localStorage.setItem('erp_permissions_ts', String(Date.now()));
    localStorage.setItem('pwi_erp_workspace_tabs_v1', JSON.stringify({ state: { tabs: [
      { id: '/admin/users', route: '/admin/users', pathname: '/admin/users', title: 'Users', closable: false, timestamp: 1 }], activeTabId: '/admin/users' }, version: 0 }));
  });
  await page.route('**/api/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, success: true }) }));
  await page.route('**/api/v1/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'admin-1', displayName: 'A', permissions: ['admin.users.view', 'admin.users.create', 'admin.users.update', 'admin.users.assign_roles', 'admin.users.manage_scope', 'admin.users.deactivate', 'admin.users.activate'] } }) }));
  await page.route('**/api/v1/admin/users**', (route) => {
    const url = route.request().url();
    if (url.includes('/division-access')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { effective: { unrestricted: false, divisionIds: [] } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: USERS, total: 2 }) });
  });
  await page.route('**/api/v1/admin/roles**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0 }) }));
  await page.goto('http://localhost:3000/admin/users', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.user-management-container', { timeout: 30000 });
  try {
    await page.waitForFunction(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length === 2, null, { timeout: 90000 });
  } catch (e) { console.log('WARN: rows missing'); }
  await page.waitForTimeout(800);

  async function readTheme() {
    return page.evaluate(() => {
      const C = el => el ? getComputedStyle(el).color : null;
      const B = el => el ? getComputedStyle(el).backgroundColor : null;
      const firstTitle = document.querySelector('.user-management-container thead tr th .ant-table-column-title');
      const firstIcon = document.querySelector('.user-management-container thead tr th .anticon');
      const rows = Array.from(document.querySelectorAll('.user-management-container tbody tr.ant-table-row'));
      return {
        titleDiv: C(firstTitle), thIcon: C(firstIcon),
        rows: rows.map(row => {
          const q = s => row.querySelector(s);
          return {
            name: C(q('.user-cell-name')), id: C(q('.um-id-line')), email: C(q('.um-email-link')),
            phone: C(q('.um-phone-line')), time: C(q('.um-time-sub')), status: C(q('.um-status-tag')),
            cellBg: B(row.querySelector('td')), fixBg: B(row.querySelector('td.ant-table-cell-fix-right')),
          };
        }),
      };
    });
  }

  // ---------- LIGHT: contrast pairs ----------
  const light = await readTheme();
  check('light: header title readable on band', lum(light.titleDiv) > 200, light.titleDiv);
  check('light: header icon inherits (readable)', lum(light.thIcon) > 200, light.thIcon);
  light.rows.forEach((r, i) => {
    check(`light: row${i} name dark-on-light`, lum(r.name) < 110 && lum(r.cellBg) > 180, `${r.name} on ${r.cellBg}`);
    check(`light: row${i} id/phone muted-readable`, lum(r.id) < 170 || r.id === null, String(r.id));
    check(`light: row${i} email link colored`, r.email && lum(r.email) < 150, String(r.email));
    check(`light: row${i} fixed bg == row bg`, r.fixBg === r.cellBg, `${r.fixBg} vs ${r.cellBg}`);
  });

  // ---------- LIGHT: no vertical lines anywhere ----------
  const vlines = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.user-management-container tbody tr.ant-table-row td, .user-management-container thead tr th').forEach(td => {
      const s = getComputedStyle(td);
      if (s.borderLeftWidth !== '0px' || s.borderRightWidth !== '0px' || s.borderTopWidth !== '0px') {
        bad.push(`${td.tagName}.${td.className.toString().split(' ')[0]} L${s.borderLeftWidth} R${s.borderRightWidth} T${s.borderTopWidth}`);
      }
    });
    return bad;
  });
  check('no vertical/top cell lines', vlines.length === 0, vlines.slice(0, 4).join(' ; '));

  // ---------- LIGHT: hover sweep — bg may change, lines/shadows must not ----------
  const hoverOk = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.user-management-container tbody tr.ant-table-row'));
    const base = rows.map(r => Array.from(r.querySelectorAll('td')).map(td => { const s = getComputedStyle(td); return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth, s.boxShadow].join('|'); }));
    return { base, n: rows.length };
  });
  let hoverClean = hoverOk.n === 2;
  const hoverNotes = [];
  for (let i = 0; i < hoverOk.n; i++) {
    await page.locator('.user-management-container tbody tr.ant-table-row').nth(i).locator('td').first().hover();
    await page.waitForTimeout(250);
    const now = await page.evaluate((idx) => {
      const row = document.querySelectorAll('.user-management-container tbody tr.ant-table-row')[idx];
      return Array.from(row.querySelectorAll('td')).map(td => { const s = getComputedStyle(td); return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth, s.boxShadow, s.backgroundColor].join('|'); });
    }, i);
    const before = hoverOk.base[i];
    now.forEach((cell, c) => {
      const [bt, br, bb, bl, shadow] = cell.split('|');
      const [obt, obr, obb, obl, oshadow] = before[c].split('|');
      if (bt !== obt || br !== obr || bb !== obb || bl !== obl || shadow !== oshadow) {
        hoverClean = false;
        hoverNotes.push(`row${i} cell${c}: [${before[c]}] -> [${cell}]`);
      }
    });
  }
  check('hover changes bg only (no new lines/shadows)', hoverClean, hoverNotes.slice(0, 3).join(' ; '));
  await page.screenshot({ path: 'scratch/p30-light.png' });

  // ---------- DARK (real theme store) ----------
  await page.evaluate(() => {
    localStorage.setItem('erp_theme_prefs_v1', JSON.stringify({ 'user:admin-1': { mode: 'dark', paletteId: 'indigo' } }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.user-management-container', { timeout: 30000 });
  try {
    await page.waitForFunction(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length === 2, null, { timeout: 90000 });
  } catch (e) { console.log('WARN: dark rows missing'); }
  await page.waitForTimeout(800);
  const darkMode = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check('dark mode active', darkMode === 'dark', String(darkMode));
  const dark = await readTheme();
  check('dark: header title readable', lum(dark.titleDiv) > 150, dark.titleDiv);
  check('dark: header icon readable', lum(dark.thIcon) > 150, dark.thIcon);
  dark.rows.forEach((r, i) => {
    check(`dark: row${i} name light-on-dark`, lum(r.name) > 150 && lum(r.cellBg) < 110, `${r.name} on ${r.cellBg}`);
    check(`dark: row${i} no white cell`, lum(r.cellBg) < 110, String(r.cellBg));
    check(`dark: row${i} fixed bg == row bg`, r.fixBg === r.cellBg, `${r.fixBg} vs ${r.cellBg}`);
  });
  const dvlines = await page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('.user-management-container tbody tr.ant-table-row td, .user-management-container thead tr th').forEach(td => {
      const s = getComputedStyle(td);
      if (s.borderLeftWidth !== '0px' || s.borderRightWidth !== '0px' || s.borderTopWidth !== '0px') n++;
    });
    return n;
  });
  check('dark: no vertical/top cell lines', dvlines === 0, String(dvlines));
  await page.hover('.user-management-container tbody tr.ant-table-row td');
  await page.waitForTimeout(250);
  const dhover = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('.user-management-container tbody tr.ant-table-row td'));
    return cells.every(td => { const s = getComputedStyle(td); return s.boxShadow === 'none' && s.borderLeftWidth === '0px' && s.borderRightWidth === '0px' && s.borderTopWidth === '0px'; });
  });
  check('dark: hover adds no lines/shadows', dhover);
  await page.screenshot({ path: 'scratch/p30-dark.png' });

  // ---------- RESPONSIVE spot checks ----------
  for (const w of [1280, 768, 390]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      tableScrolls: (() => { const el = document.querySelector('.user-management-container .ant-table-content'); return el ? el.scrollWidth - el.clientWidth : null; })(),
      headersVisible: Array.from(document.querySelectorAll('.user-management-container thead th')).every(th => th.textContent.trim().length > 0),
    }));
    check(`vw${w}: no page overflow + headers intact`, r.pageOverflow <= 1 && r.headersVisible, JSON.stringify(r));
  }

  await browser.close();
  console.log(failures === 0 ? 'ALL P30 CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERR', e); process.exit(1); });
