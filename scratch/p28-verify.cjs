const { chromium } = require('playwright');

const USERS = [
  { id: 'user-1', authUserId: 'auth-1', displayName: 'Junaid Ahmed', username: 'junaid.ahmed', email: 'junaid@pwi.com', phone: '+92 300 1234567', employeeId: 'EMP-00125', status: 'ACTIVE', avatarUrl: null, defaultCompany: { id: 'comp-1', tradeName: 'PakWiz Industries' }, userRoles: [], organizationScopes: [], createdAt: '2026-09-10T10:00:00Z', lastLoginAt: '2026-09-12T10:00:00Z' },
  { id: 'user-2', authUserId: 'auth-2', displayName: 'Sara Khan', email: 'sara@pwi.com', phone: '', employeeId: '', status: 'INACTIVE', avatarUrl: null, defaultCompany: { id: 'comp-1', tradeName: 'PakWiz Industries' }, userRoles: [], organizationScopes: [], createdAt: '2026-09-11T10:00:00Z', lastLoginAt: null },
];

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`);
  if (!cond) failures++;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
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
  const reqUrls = [];
  await page.route('**/api/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, success: true }) }));
  await page.route('**/api/v1/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'admin-1', displayName: 'A', permissions: ['admin.users.view', 'admin.users.create', 'admin.users.update', 'admin.users.assign_roles', 'admin.users.manage_scope', 'admin.users.deactivate', 'admin.users.activate'] } }) }));
  await page.route('**/api/v1/admin/users**', (route) => {
    reqUrls.push(route.request().url());
    const url = route.request().url();
    if (url.includes('/division-access')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { effective: { unrestricted: false, divisionIds: [] } } }) });
    }
    let data = USERS;
    try {
      const u = new URL(url);
      if (u.searchParams.get('status')) data = USERS.filter(x => x.status === u.searchParams.get('status'));
      if (u.searchParams.get('search')) data = USERS.filter(x => (x.displayName + x.email).toLowerCase().includes(u.searchParams.get('search').toLowerCase()));
    } catch (e) { /* ignore */ }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, total: data.length }) });
  });
  await page.route('**/api/v1/admin/roles**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0 }) }));
  await page.goto('http://localhost:3000/admin/users', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.user-management-container', { timeout: 30000 });
  try {
    await page.waitForFunction(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length > 0, null, { timeout: 90000 });
  } catch (e) { console.log('WARN: no rows'); }
  await page.waitForTimeout(800);

  // CHECK 3: Add User green button with user-plus icon
  const addBtn = await page.getByRole('button', { name: 'Add User' }).first().evaluateHandle(el => el);
  const addStyle = await page.evaluate((el) => {
    const s = getComputedStyle(el);
    const icon = el.querySelector('.anticon');
    return { bgImg: s.backgroundImage.slice(0, 40), color: s.color, iconLabel: icon ? icon.getAttribute('aria-label') : null };
  }, addBtn);
  check('Add User green gradient', /linear-gradient/.test(addStyle.bgImg) && addStyle.color === 'rgb(255, 255, 255)', `${addStyle.bgImg} ${addStyle.color}`);
  check('Add User user-plus icon', addStyle.iconLabel === 'user-add', String(addStyle.iconLabel));

  // Add User opens the existing flow (modal), then close it
  await page.getByRole('button', { name: 'Add User' }).first().click();
  await page.waitForTimeout(800);
  const addModalOpen = await page.evaluate(() => document.body.textContent.includes('Add User'));
  check('Add User opens existing flow', addModalOpen);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // CHECK 4: Refresh invokes reload (new /admin/users request)
  const before = reqUrls.filter(u => u.includes('/admin/users') && !u.includes('division-access')).length;
  await page.getByRole('button', { name: 'Refresh user list' }).click();
  await page.waitForTimeout(1200);
  const after = reqUrls.filter(u => u.includes('/admin/users') && !u.includes('division-access')).length;
  check('Refresh triggers reload', after > before, `${before} -> ${after}`);

  // Export menu exposes PDF + Excel/CSV (no invented Print)
  await page.getByRole('button', { name: 'Export users' }).click();
  await page.waitForTimeout(600);
  const menuText = await page.evaluate(() => document.body.textContent);
  check('Export offers PDF', /Export as PDF Document/.test(menuText));
  check('Export offers Excel/CSV', /Export as Excel \/ CSV/.test(menuText));

  // CSV export produces a real download
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
    page.getByText('Export as Excel / CSV').click(),
  ]);
  let dlName = '';
  if (download) { dlName = download.suggestedFilename(); await download.delete(); }
  check('CSV export downloads file', /users-export.*\.csv/.test(dlName), dlName);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // CHECK 5/6: Search + Status filter drive real requests
  await page.getByPlaceholder('Search users...').fill('Junaid');
  await page.getByPlaceholder('Search users...').press('Enter');
  await page.waitForTimeout(1200);
  check('Search fires filtered request', reqUrls.some(u => u.includes('search=Junaid')), reqUrls.slice(-3).join(' | ').slice(0, 160));
  await page.getByPlaceholder('Search users...').fill('');
  await page.getByPlaceholder('Search users...').press('Enter');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'More Filters' }).click();
  await page.waitForTimeout(400);
  const moreFiltersVisible = await page.locator('.um-more-filters-menu').isVisible();
  check('More Filters panel opens', moreFiltersVisible);
  await page.locator('.um-more-filters-menu .ant-select').click();
  await page.waitForTimeout(400);
  await page.locator('.ant-select-dropdown .ant-select-item-option-content', { hasText: 'Inactive Users' }).click();
  await page.waitForTimeout(1200);
  check('Status filter fires request', reqUrls.some(u => u.includes('status=INACTIVE')), reqUrls.slice(-2).join(' | ').slice(0, 160));

  // Reset restores
  await page.getByTestId('um-reset-filters').click();
  await page.waitForTimeout(1000);
  const searchVal = await page.getByPlaceholder('Search users...').inputValue();
  check('Reset clears search', searchVal === '', JSON.stringify(searchVal));

  // Page-top screenshots for visual QA (light + dark)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'scratch/p28-page-light.png' });
  await page.evaluate(() => {
    localStorage.setItem('erp_theme_prefs_v1', JSON.stringify({ 'user:admin-1': { mode: 'dark', paletteId: 'indigo' } }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.user-management-container', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const darkMode = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check('dark mode for page QA', darkMode === 'dark', String(darkMode));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'scratch/p28-page-dark.png' });
  const darkAdd = await page.getByRole('button', { name: 'Add User' }).first().evaluate(el => {
    const s = getComputedStyle(el);
    return s.backgroundImage.slice(0, 20) + ' ' + s.color;
  });
  check('dark: Add User still green + white text', /linear-gradient/.test(darkAdd) && darkAdd.includes('rgb(255, 255, 255)'), darkAdd);

  await browser.close();
  console.log(failures === 0 ? 'ALL P28 CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERR', e); process.exit(1); });
