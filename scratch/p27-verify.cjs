const { chromium } = require('playwright');

const PERMS = ['admin.users.view', 'admin.users.create', 'admin.users.update', 'admin.users.assign_roles', 'admin.users.manage_scope', 'admin.users.deactivate', 'admin.users.activate'];

const USERS = [
  {
    id: 'user-1', authUserId: 'auth-1', displayName: 'Junaid Ahmed', username: 'junaid.ahmed',
    email: 'junaid@pwi.com', phone: '+92 300 1234567', employeeId: 'EMP-00125',
    status: 'ACTIVE', avatarUrl: null, defaultCompanyId: 'comp-1',
    defaultCompany: { id: 'comp-1', tradeName: 'PakWiz Industries' },
    userRoles: [
      { id: 'ur-1', roleId: 'r1', role: { id: 'r1', roleCode: 'ADMIN', name: 'Administrator' } },
      { id: 'ur-2', roleId: 'r2', role: { id: 'r2', roleCode: 'PRODUCTION', name: 'Production' } },
      { id: 'ur-3', roleId: 'r3', role: { id: 'r3', roleCode: 'SALES', name: 'Sales' } },
    ],
    organizationScopes: [
      { id: 's1', companyId: 'comp-1', divisionId: 'div-1', scopeLevel: 'DIVISION', isFullScope: false, status: 'ACTIVE', division: { id: 'div-1', divisionCode: 'DIV-CCD', name: 'Control Cable Division' } },
      { id: 's2', companyId: 'comp-1', divisionId: 'div-2', scopeLevel: 'DIVISION', isFullScope: false, status: 'ACTIVE', division: { id: 'div-2', divisionCode: 'DIV-SPD', name: 'Spoke Division' } },
    ],
    createdAt: '2026-09-10T10:00:00Z', lastLoginAt: '2026-09-12T10:00:00Z',
  },
  {
    id: 'user-2', authUserId: 'auth-2', displayName: 'Sara Khan', email: 'sara@pwi.com',
    phone: '', employeeId: '', status: 'INACTIVE', avatarUrl: null,
    defaultCompany: { id: 'comp-1', tradeName: 'PakWiz Industries' },
    userRoles: [], organizationScopes: [],
    createdAt: '2026-09-11T10:00:00Z', lastLoginAt: null,
  },
];

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`);
  if (!cond) failures++;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('erp_user', JSON.stringify({ id: 'admin-1', displayName: 'A', permissions: ['admin.users.view', 'admin.users.create', 'admin.users.update', 'admin.users.assign_roles', 'admin.users.manage_scope', 'admin.users.deactivate', 'admin.users.activate'] }));
    localStorage.setItem('erp_permissions_ts', String(Date.now()));
    localStorage.setItem('pwi_erp_workspace_tabs_v1', JSON.stringify({ state: { tabs: [
      { id: '/dashboard', route: '/dashboard', pathname: '/dashboard', title: 'Dashboard', closable: false, timestamp: 0 },
      { id: '/admin/users', route: '/admin/users', pathname: '/admin/users', title: 'Users', closable: true, timestamp: 1 },
    ], activeTabId: '/admin/users' }, version: 0 }));
  });
  // NOTE: Playwright matches routes in reverse registration order (last wins),
  // so the catch-all MUST be registered first, specifics after.
  await page.route('**/api/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, success: true }) }));
  await page.route('**/api/v1/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'admin-1', displayName: 'A', permissions: ['admin.users.view', 'admin.users.create', 'admin.users.update', 'admin.users.assign_roles', 'admin.users.manage_scope', 'admin.users.deactivate', 'admin.users.activate'] } }) }));
  await page.route('**/api/v1/admin/users**', (route) => {
    const url = route.request().url();
    if (url.includes('/division-access')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { effective: { unrestricted: false, divisionIds: [] } } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: USERS, total: 2 }) });
  });
  await page.route('**/api/v1/admin/roles**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0 }) }));
  await page.route('**/api/v1/companies**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route('**/api/v1/divisions**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));

  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200)); });
  page.on('requestfailed', r => console.log('REQ-FAIL:', r.url().slice(0, 120), r.failure() && r.failure().errorText));
  await page.goto('http://localhost:3000/admin/users', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.user-management-container', { timeout: 30000 });
  await page.waitForSelector('.ant-table', { timeout: 30000 });
  try {
    await page.waitForFunction(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length > 0, null, { timeout: 90000 });
  } catch (e) {
    console.log('WARN: no data rows after 90s (bundle compiling or fetch issue)');
  }
  await page.waitForTimeout(800);

  const hasRows = await page.evaluate(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length);
  console.log('ROWS:', hasRows);

  async function snapshot(theme) {
    return page.evaluate(() => {
      const cs = (el, p) => getComputedStyle(el)[p];
      const ths = Array.from(document.querySelectorAll('.ant-table-thead > tr > th'));
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody > tr.ant-table-row'));
      const firstRowCells = rows.length ? Array.from(rows[0].querySelectorAll('td')) : [];
      const fixCell = rows.length ? rows[0].querySelector('td.ant-table-cell-fix-right') : null;
      const fixTh = document.querySelector('.ant-table-thead th.ant-table-cell-fix-right');
      const emailLink = document.querySelector('.um-email-link');
      const divTags = Array.from(document.querySelectorAll('.um-div-tag')).map(t => ({
        text: t.textContent.trim(), bg: cs(t, 'backgroundColor'), color: cs(t, 'color'),
        code: (t.querySelector('.um-div-code') || {}).textContent || null,
      }));
      const statusTags = Array.from(document.querySelectorAll('.um-status-tag')).map(t => ({ text: t.textContent.trim(), bg: cs(t, 'backgroundColor'), color: cs(t, 'color') }));
      const actionBtns = rows.length ? Array.from(rows[0].querySelectorAll('td.ant-table-cell-fix-right button')).map(b => {
        const r = b.getBoundingClientRect(); const cell = b.closest('td').getBoundingClientRect();
        return { label: b.getAttribute('aria-label') || b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height),
          inside: r.left >= cell.left - 1 && r.right <= cell.right + 1, bg: cs(b, 'backgroundColor'), border: cs(b, 'borderTopColor') };
      }) : [];
      const midRow = rows.length > 1 ? rows[0] : rows[0];
      const midCells = midRow ? Array.from(midRow.querySelectorAll('td')) : [];
      return {
        headers: ths.map(h => h.textContent.trim()),
        thBg: ths.length ? cs(ths[0], 'backgroundColor') : null,
        thColor: ths.length ? cs(ths[0], 'color') : null,
        fixThBg: fixTh ? cs(fixTh, 'backgroundColor') : null,
        fixThColor: fixTh ? cs(fixTh, 'color') : null,
        rowBg: firstRowCells.length ? cs(firstRowCells[0], 'backgroundColor') : null,
        fixTdBg: fixCell ? cs(fixCell, 'backgroundColor') : null,
        firstBorder: firstRowCells.length ? `${cs(firstRowCells[0], 'borderBottomWidth')}/${cs(firstRowCells[0], 'borderBottomColor')}` : null,
        fixBorder: fixCell ? `${cs(fixCell, 'borderBottomWidth')}/${cs(fixCell, 'borderBottomColor')}` : null,
        emailColor: emailLink ? cs(emailLink, 'color') : null,
        emailText: emailLink ? emailLink.textContent.trim() : null,
        divTags, statusTags, actionBtns,
        tableRight: document.querySelector('.ant-table') ? Math.round(document.querySelector('.ant-table').getBoundingClientRect().right) : null,
        fixRight: fixCell ? Math.round(fixCell.getBoundingClientRect().right) : null,
        bodyTexts: document.querySelector('.ant-table-tbody').textContent,
      };
    });
  }

  // ---------- LIGHT ----------
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
  await page.waitForTimeout(400);
  const light = await snapshot('light');
  console.log('HEADERS:', JSON.stringify(light.headers));
  check('column order (8 cols)', JSON.stringify(light.headers) === JSON.stringify(['User', 'Company', 'Division Access', 'Roles', 'Last Login', 'Created', 'Status', 'Actions']));
  check('no Employee/Phone/Email columns', !light.headers.some(h => /Employee ID|Phone|Email/.test(h)), JSON.stringify(light.headers));
  // Composite geometry: name above email above phone inside ONE user cell
  const comp = await page.evaluate(() => {
    const cell = document.querySelector('tr.ant-table-row .um-user-composite');
    if (!cell) return null;
    const name = cell.querySelector('.user-cell-name');
    const email = cell.querySelector('.um-email-link');
    const phone = cell.querySelector('.um-phone-line');
    const R = el => { const r = el.getBoundingClientRect(); return Math.round(r.top); };
    return {
      hasAvatar: !!cell.querySelector('.user-avatar-trigger'),
      name: name ? name.textContent.trim() : null,
      emailHref: email ? email.getAttribute('href') : null,
      emailTop: email ? R(email) : -1, nameTop: name ? R(name) : -1, phoneTop: phone ? R(phone) : -1,
      phoneText: phone ? phone.textContent.trim() : null,
      emailColor: email ? getComputedStyle(email).color : null,
      sameCell: !!(name && email && phone && name.closest('.um-user-composite') === cell && email.closest('.um-user-composite') === cell && phone.closest('.um-user-composite') === cell),
    };
  });
  check('composite cell exists with avatar', !!(comp && comp.hasAvatar));
  check('name line present', comp && /Junaid Ahmed/.test(comp.name), comp && comp.name);
  check('email below name, same cell', !!(comp && comp.sameCell && comp.emailTop > comp.nameTop), comp && `${comp.nameTop} -> ${comp.emailTop}`);
  check('phone below email, same cell', !!(comp && comp.phoneTop > comp.emailTop), comp && `${comp.emailTop} -> ${comp.phoneTop}`);
  check('email mailto link, blue', comp && comp.emailHref === 'mailto:junaid@pwi.com' && comp.emailColor === 'rgb(79, 70, 229)', comp && `${comp.emailHref} ${comp.emailColor}`);
  check('phone number present', comp && comp.phoneText === '+92 300 1234567', comp && comp.phoneText);
  const empLine = await page.evaluate(() => {
    const cell = document.querySelector('tr.ant-table-row .um-user-composite');
    const idEl = cell ? cell.querySelector('.um-id-line') : null;
    const emailEl = cell ? cell.querySelector('.um-email-link') : null;
    const R = el => Math.round(el.getBoundingClientRect().top);
    return idEl ? { text: idEl.textContent.trim(), top: R(idEl), emailTop: emailEl ? R(emailEl) : -1 } : null;
  });
  check('employee ID line in user cell', !!(empLine && empLine.text === 'EMP-00125'), empLine && empLine.text);
  check('ID line above email line', !!(empLine && empLine.top < empLine.emailTop), empLine && `${empLine.top} < ${empLine.emailTop}`);
  const lum = (rgb) => { const m = rgb && rgb.match(/[\d.]+/g); if (!m) return 999; const [r, g, b] = m.map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  check('light header strong dark bg', lum(light.thBg) < 90, light.thBg);
  check('light header white text', lum(light.thColor) > 200, light.thColor);
  check('fixed header same bg', light.fixThBg === light.thBg, `${light.fixThBg} vs ${light.thBg}`);
  check('email link present + blue', light.emailText === 'junaid@pwi.com' && light.emailColor === 'rgb(79, 70, 229)', `${light.emailText} ${light.emailColor}`);
  check('two division tags', light.divTags.length === 2, JSON.stringify(light.divTags.map(t => t.text)));
  check('division colors distinct', light.divTags.length === 2 && light.divTags[0].bg !== light.divTags[1].bg, `${light.divTags[0] && light.divTags[0].bg} vs ${light.divTags[1] && light.divTags[1].bg}`);
  check('division code chips', light.divTags.every(t => !!t.code), JSON.stringify(light.divTags.map(t => t.code)));
  check('division names real', /Control Cable Division/.test(light.bodyTexts) && /Spoke Division/.test(light.bodyTexts));
  check('status pills distinct', light.statusTags.length === 2 && light.statusTags[0].bg !== light.statusTags[1].bg, JSON.stringify(light.statusTags));
  check('roles shown (3, no overflow)', /ADMIN/.test(light.bodyTexts) && /PRODUCTION/.test(light.bodyTexts) && /SALES/.test(light.bodyTexts));
  check('empty states', /No Division Access/.test(light.bodyTexts) && /No roles/.test(light.bodyTexts) && /Never/.test(light.bodyTexts));
  check('row divider: fixed cell has border', light.fixBorder && light.fixBorder.startsWith('1px'), light.fixBorder);
  check('row divider: same color thru Actions', light.firstBorder === light.fixBorder, `${light.firstBorder} vs ${light.fixBorder}`);
  check('fixed td bg == row bg', light.fixTdBg === light.rowBg, `${light.fixTdBg} vs ${light.rowBg}`);
  // Scroll the table container fully right: sticky fixed-column geometry is
  // only meaningful at the scrolled position.
  await page.evaluate(() => {
    const scroller = document.querySelector('.user-management-container .ant-table-content');
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  });
  await page.waitForTimeout(400);
  const edge = await page.evaluate(() => {
    const scroller = document.querySelector('.user-management-container .ant-table-content');
    const fixCell = document.querySelector('tr.ant-table-row td.ant-table-cell-fix-right');
    const btns = fixCell ? Array.from(fixCell.querySelectorAll('button')).map(b => {
      const r = b.getBoundingClientRect(); const cell = fixCell.getBoundingClientRect();
      return { label: b.getAttribute('aria-label') || '', w: Math.round(r.width),
        inside: r.left >= cell.left - 1 && r.right <= cell.right + 1, visible: r.width > 0 && r.left < window.innerWidth };
    }) : [];
    const sr = scroller ? scroller.getBoundingClientRect() : null;
    const fr = fixCell ? fixCell.getBoundingClientRect() : null;
    return {
      scrollerRight: sr ? Math.round(sr.right) : null,
      fixRight: fr ? Math.round(fr.right) : null,
      fixLeft: fr ? Math.round(fr.left) : null,
      scrollLeft: scroller ? scroller.scrollLeft : null,
      scrollMax: scroller ? scroller.scrollWidth - scroller.clientWidth : null,
      btns,
      chips: Array.from(document.querySelectorAll('.um-div-code')).map(c => ({ text: c.textContent.trim(), bg: getComputedStyle(c).backgroundColor })),
    };
  });
  check('fixed col reaches container edge', edge.scrollerRight !== null && Math.abs(edge.scrollerRight - edge.fixRight) < 3, `container:${edge.scrollerRight} fix:${edge.fixRight} scroll:${edge.scrollLeft}/${edge.scrollMax}`);
  check('action buttons compact+inside+visible', edge.btns.length >= 6 && edge.btns.every(b => b.w <= 32 && b.inside && b.visible), JSON.stringify(edge.btns.map(b => b.label + ':' + b.w)));
  check('division chips saturated+distinct', edge.chips.length === 2 && edge.chips[0].bg !== edge.chips[1].bg && !/255, 25[56]/.test(edge.chips[0].bg), JSON.stringify(edge.chips));

  // hover fill on view button (now scrolled into view)
  await page.hover('tr.ant-table-row td.ant-table-cell-fix-right button');
  await page.waitForTimeout(250);
  const hoverBg = await page.evaluate(() => {
    const b = document.querySelector('tr.ant-table-row td.ant-table-cell-fix-right button');
    return b ? getComputedStyle(b).backgroundColor : null;
  });
  check('hover fills action button', hoverBg === 'rgb(14, 165, 233)', hoverBg);
  await page.screenshot({ path: 'scratch/p27-table-light.png' });

  // ---------- DARK (real ThemeProvider path: seed prefs + reload) ----------
  await page.evaluate(() => {
    localStorage.setItem('erp_theme_prefs_v1', JSON.stringify({ 'user:admin-1': { mode: 'dark', paletteId: 'indigo' } }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.user-management-container', { timeout: 30000 });
  try {
    await page.waitForFunction(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length > 0, null, { timeout: 90000 });
  } catch (e) {
    console.log('WARN: no data rows after reload (dark)');
  }
  await page.waitForTimeout(800);
  const darkMode = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check('dark mode active via theme store', darkMode === 'dark', String(darkMode));
  const dark = await snapshot('dark');
  check('dark header band (not bright)', lum(dark.thBg) < 90, dark.thBg);
  check('dark header readable', lum(dark.thColor) > 150, dark.thColor);
  check('dark: no white fixed strip', dark.fixTdBg !== 'rgb(255, 255, 255)' && dark.fixThBg !== 'rgb(255, 255, 255)', `${dark.fixTdBg} / ${dark.fixThBg}`);
  check('dark: fixed bg == row bg', dark.fixTdBg === dark.rowBg, `${dark.fixTdBg} vs ${dark.rowBg}`);
  check('dark: divider thru Actions', dark.firstBorder === dark.fixBorder, `${dark.firstBorder} vs ${dark.fixBorder}`);
  check('dark: email readable link', lum(dark.emailColor) > 90 && lum(dark.emailColor) < 200, dark.emailColor);
  check('dark: division colors distinct', dark.divTags.length === 2 && dark.divTags[0].bg !== dark.divTags[1].bg, `${dark.divTags[0] && dark.divTags[0].bg} vs ${dark.divTags[1] && dark.divTags[1].bg}`);
  check('dark: status pills distinct', dark.statusTags.length === 2 && dark.statusTags[0].bg !== dark.statusTags[1].bg, JSON.stringify(light.statusTags.map(s => s.text)));
  await page.screenshot({ path: 'scratch/p27-table-dark.png' });

  // ---------- RESPONSIVE ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'scratch/p27-table-mobile.png' });
  await page.evaluate(() => {
    const scroller = document.querySelector('.user-management-container .ant-table-content');
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  });
  await page.waitForTimeout(400);
  const resp = await page.evaluate(() => ({
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    tableScrolls: (() => { const w = document.querySelector('.user-management-container .ant-table-content'); if (!w) return null; return w.scrollWidth - w.clientWidth; })(),
    fixVisible: (() => { const c = document.querySelector('tr.ant-table-row td.ant-table-cell-fix-right'); if (!c) return false; const r = c.getBoundingClientRect(); return r.width > 40 && r.left < window.innerWidth && r.right > 0; })(),
  }));
  check('mobile: no page-level h-overflow', resp.pageOverflow <= 1, String(resp.pageOverflow));
  check('mobile: table scrolls internally', resp.tableScrolls !== null && resp.tableScrolls > 0, String(resp.tableScrolls));
  check('mobile: actions fixed+visible', resp.fixVisible === true);

  await browser.close();
  console.log(failures === 0 ? 'ALL P27 CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERR', e); process.exit(1); });

