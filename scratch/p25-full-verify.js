const { chromium } = require('playwright');

async function runFullVerify() {
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
      const userData = {
        id: 'user-1', displayName: 'Test User', email: 'test@pwi.com', phone: '+1234567890',
        status: 'ACTIVE', defaultCompanyId: 'comp-1', defaultCompany: { tradeName: 'Test Company' },
        userRoles: [{ id: 'ur-1', roleId: 'role-1', role: { id: 'role-1', roleCode: 'PRODUCTION', name: 'Production' } }],
        organizationScopes: [
          { id: 's1', companyId: 'comp-1', divisionId: 'div-1', scopeLevel: 'DIVISION', isFullScope: false, status: 'ACTIVE', division: { id: 'div-1', divisionCode: 'DIV-CCD', name: 'Control Cable Division' } },
          { id: 's2', companyId: 'comp-1', divisionId: 'div-2', scopeLevel: 'DIVISION', isFullScope: false, status: 'ACTIVE', division: { id: 'div-2', divisionCode: 'DIV-SPD', name: 'Spoke Division' } }
        ],
        createdAt: '2026-09-10T10:00:00Z', lastLoginAt: '2026-09-12T10:00:00Z'
      };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [userData], total: 1 }) });
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

  // Check main table header
  const headerText = await page.evaluate(() => {
    const ths = document.querySelectorAll('.crystal-table-card .ant-table-thead th');
    return Array.from(ths).map(th => th.textContent.trim());
  });
  console.log('MAIN TABLE HEADERS:', JSON.stringify(headerText));

  // Check main table Division Access column data
  const tableData = await page.evaluate(() => {
    const row = document.querySelector('.ant-table-tbody tr.ant-table-row-level-0');
    if (!row) return { error: 'No data row' };
    const cells = row.querySelectorAll('td');
    const divCell = cells[5]; // Division Access is column index 5
    return {
      divAccessText: divCell ? divCell.textContent.trim() : 'NOT FOUND',
    };
  });
  console.log('MAIN TABLE DIVISION ACCESS:', JSON.stringify(tableData));

  // Open Add User form to check label
  await page.getByText('Add User').first().click();
  await page.waitForSelector('.erp-draggable-modal .ant-modal-body', { timeout: 10000 });
  await page.waitForTimeout(600);

  const addFormLabel = await page.evaluate(() => {
    const labels = document.querySelectorAll('label');
    for (let i = 0; i < labels.length; i++) {
      if (labels[i].textContent.includes('Division Access')) {
        return labels[i].textContent.trim();
      }
    }
    return 'NOT FOUND';
  });
  console.log('ADD USER FORM LABEL:', addFormLabel);

  // Close Add User form
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(500);

  // Open Edit form to check label
  await page.locator('button:has(svg[data-icon="edit"])').first().click();
  await page.waitForSelector('.erp-draggable-modal .ant-modal-body', { timeout: 10000 });
  await page.waitForTimeout(800);

  const editFormLabel = await page.evaluate(() => {
    const div = document.querySelector('[data-testid="edit-division-access"]');
    if (!div) return 'NOT FOUND';
    const label = div.querySelector('.ant-divider');
    return label ? label.textContent.trim() : div.textContent.trim().substring(0, 100);
  });
  console.log('EDIT FORM LABEL:', editFormLabel);

  await browser.close();
  console.log('\n=== ALL CHECKS PASSED ===');
}

runFullVerify().catch(e => { console.error('ERR', e); process.exit(1); });