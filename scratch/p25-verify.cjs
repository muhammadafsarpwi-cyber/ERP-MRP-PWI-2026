const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('erp_user', JSON.stringify({ id: 'admin-1', displayName: 'A', permissions: ['admin.users.view','admin.users.create','admin.users.update','admin.users.assign_roles','admin.users.manage_scope','admin.users.deactivate','admin.users.activate'] }));
    localStorage.setItem('erp_permissions_ts', String(Date.now()));
    localStorage.setItem('pwi_erp_workspace_tabs_v1', JSON.stringify({ state: { tabs: [
      { id: '/dashboard', route: '/dashboard', pathname: '/dashboard', title: 'Dashboard', closable: false, timestamp: 0 },
      { id: '/admin/users', route: '/admin/users', pathname: '/admin/users', title: 'Users', closable: true, timestamp: 1 },
    ], activeTabId: '/admin/users' }, version: 0 }));
  });
  await page.route('**/api/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, success: true }) }));
  await page.route('**/api/v1/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'admin-1', displayName: 'A', permissions: ['admin.users.view','admin.users.create','admin.users.update','admin.users.assign_roles','admin.users.manage_scope','admin.users.deactivate','admin.users.activate'] } }) }));
  await page.route('**/api/v1/admin/users**', (route) => {
    const url = route.request().url();
    if (url.includes('/admin/users') && !url.includes('/division-access')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{
        id: 'user-1', displayName: 'Test User', email: 'test@pwi.com', phone: '+1234567890',
        status: 'ACTIVE', defaultCompanyId: 'comp-1', defaultCompany: { tradeName: 'Test Company' },
        userRoles: [{ id: 'ur-1', roleId: 'role-1', role: { id: 'role-1', roleCode: 'PRODUCTION', name: 'Production' } }],
        organizationScopes: [
          { id: 's1', companyId: 'comp-1', divisionId: 'div-1', scopeLevel: 'DIVISION', isFullScope: false, status: 'ACTIVE', division: { id: 'div-1', divisionCode: 'DIV-CCD', name: 'Control Cable Division' } },
          { id: 's2', companyId: 'comp-1', divisionId: 'div-2', scopeLevel: 'DIVISION', isFullScope: false, status: 'ACTIVE', division: { id: 'div-2', divisionCode: 'DIV-SPD', name: 'Spoke Division' } }
        ],
        createdAt: '2026-09-10T10:00:00Z', lastLoginAt: '2026-09-12T10:00:00Z'
      }], total: 1 }) }));
    } else if (url.includes('/division-access')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { effective: { unrestricted: false, divisionIds: ['div-1', 'div-2'] } } }) });
    }
  });
  await page.route('**/api/v1/admin/roles**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'role-1', roleCode: 'PRODUCTION', name: 'Production' }], total: 1 }) }));
  await page.route('**/api/v1/companies**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'comp-1', tradeName: 'Test Company' }] }) }));
  await page.route('**/api/v1/divisions**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'div-1', divisionCode: 'DIV-CCD', name: 'Control Cable Division', status: 'ACTIVE' }, { id: 'div-2', divisionCode: 'DIV-SPD', name: 'Spoke Division', status: 'ACTIVE' }] }) }));
  await page.goto('http://localhost:3000/admin/users', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.user-management-container', { timeout: 15000 });
  await page.waitForSelector('.ant-table', { timeout: 15000 });
  await page.waitForTimeout(500);

  // Open View modal
  await page.getByRole('button', { name: /view/i }).first().click();
  await page.waitForSelector('.erp-draggable-modal .ant-modal-body', { timeout: 10000 });
  await page.waitForTimeout(800);

  // Check View form Division Access in LIGHT theme
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
  await page.waitForTimeout(300);

  const lightInfo = await page.evaluate(() => {
    const tags = document.querySelectorAll('.user-preview-roles-container:last-child .ant-tag, .user-preview-roles-container:last-child .ant-empty-description');
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      divisionAccess: Array.from(tags).map(t => t.textContent.trim()),
    };
  });
  console.log('=== VIEW FORM LIGHT THEME ===', JSON.stringify(lightInfo, null, 2));

  // Check View form Division Access in DARK theme
  await page.evaluate(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', 'dark');
    root.style.setProperty('--theme-text', 'rgba(226, 232, 255, 0.92)');
    root.style.setProperty('--theme-surface', '#181c33');
    root.style.setProperty('--theme-surface-elevated', '#202544');
    root.style.setProperty('--theme-surface-alt', '#202544');
    root.style.setProperty('--theme-border', '#2a3054');
    root.style.setProperty('--theme-accent', '#818cf8');
    root.style.setProperty('--theme-text-secondary', 'rgba(214, 221, 244, 0.78)');
    root.style.setProperty('--theme-text-muted', 'rgba(199, 204, 235, 0.55)');
  });
  await page.waitForTimeout(300);

  const darkInfo = await page.evaluate(() => {
    const tags = document.querySelectorAll('.user-preview-roles-container:last-child .ant-tag, .user-preview-roles-container:last-child .ant-empty-description');
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      divisionAccess: Array.from(tags).map(t => t.textContent.trim()),
    };
  });
  console.log('=== VIEW FORM DARK THEME ===', JSON.stringify(darkInfo, null, 2));

  await page.screenshot({ path: 'scratch/p25-view-form.png' });
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });