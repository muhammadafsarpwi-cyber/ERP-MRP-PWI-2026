/* PROMPT #24 — diagnose table header colors + division data (light & dark). */
const { chromium } = require('playwright');

const APP = 'http://localhost:3000';
const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';
const D_CCD = 'd1000000-0000-0000-0000-000000000002';
const D_SPD = 'd1000000-0000-0000-0000-000000000001';

const adminUser = {
  id: 'admin-1', displayName: 'Muhammad Afsar', email: 'afsar@pwi.test',
  permissions: ['admin.users.view','admin.users.create','admin.users.update','admin.users.assign_roles','admin.users.manage_scope','admin.users.deactivate','admin.users.activate'],
  divisions: { unrestricted: true, items: [], permissionScopes: {} },
};
const roles = [{ id: 'role-admin', roleCode: 'ADMIN', name: 'Administrator' }, { id: 'role-prod', roleCode: 'PRODUCTION', name: 'Production' }];
const companies = [{ id: COMPANY_ID, companyCode: 'COMP-001', tradeName: 'Pakistan Wire Industries', legalName: 'Pakistan Wire Industries (Pvt) Ltd' }];
const divisions = [{ id: D_CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division', status: 'ACTIVE' }, { id: D_SPD, divisionCode: 'DIV-SPD', name: 'Spoke Division', status: 'ACTIVE' }];
const existingUser = {
  id: 'user-anas', authUserId: 'auth-anas', displayName: 'Anas Test', email: 'anas@pwi.test', phone: '+92-300-1111111',
  status: 'ACTIVE', defaultCompanyId: COMPANY_ID, defaultCompany: { tradeName: 'Pakistan Wire Industries' },
  userRoles: [{ id: 'ur-1', roleId: 'role-prod', role: { id: 'role-prod', roleCode: 'PRODUCTION', name: 'Production' } }],
  organizationScopes: [
    { id: 'scope-1', companyId: COMPANY_ID, divisionId: D_CCD, scopeLevel: 'DIVISION', isFullScope: false, status: 'ACTIVE', company: { id: COMPANY_ID, legalName: companies[0].legalName }, division: { id: D_CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division' } },
    { id: 'scope-2', companyId: COMPANY_ID, divisionId: D_SPD, scopeLevel: 'DIVISION', isFullScope: false, status: 'ACTIVE', company: { id: COMPANY_ID, legalName: companies[0].legalName }, division: { id: D_SPD, divisionCode: 'DIV-SPD', name: 'Spoke Division' } },
  ],
  createdAt: '2026-09-10T10:00:00Z',
};

function json(route, body) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function setupRoutes(page) {
  await page.route('**/api/v1/**', r => json(r, { data: [], total: 0, success: true }));
  await page.route('**/api/v1/auth/me', r => json(r, { success: true, data: adminUser }));
  await page.route('**/api/v1/admin/users**', (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const detailMatch = url.match(/\/api\/v1\/admin\/users\/([^/?#]+)$/);
    if (detailMatch && method === 'GET') {
      const id = detailMatch[1];
      const record = id === existingUser.id ? existingUser : { id, displayName: 'X', email: 'x@x.com', defaultCompanyId: COMPANY_ID };
      return json(route, { data: { ...record, organizationScopes: record.organizationScopes || [] } });
    }
    return json(route, { data: [existingUser], total: 1 });
  });
  await page.route('**/api/v1/admin/roles**', r => json(r, { data: roles, total: roles.length }));
  await page.route('**/api/v1/companies**', r => json(r, { data: companies }));
  await page.route('**/api/v1/divisions**', r => json(r, { data: divisions }));
}

async function seedSession(page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('erp_user', JSON.stringify({ id: 'admin-1', displayName: 'A', permissions: ['admin.users.view','admin.users.create','admin.users.update'] }));
    localStorage.setItem('erp_permissions_ts', String(Date.now()));
    localStorage.setItem('pwi_erp_workspace_tabs_v1', JSON.stringify({ state: { tabs: [
      { id: '/dashboard', route: '/dashboard', pathname: '/dashboard', title: 'Dashboard', closable: false, timestamp: 0 },
      { id: '/admin/users', route: '/admin/users', pathname: '/admin/users', title: 'Users', closable: true, timestamp: 1 },
    ], activeTabId: '/admin/users' }, version: 0 }));
  });
}

async function inspect(browser, theme) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await seedSession(page);
  await setupRoutes(page);
  await page.goto(`${APP}/admin/users`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.user-management-container', { timeout: 15000 });
  await page.waitForSelector('.ant-table', { timeout: 15000 });
  await page.waitForTimeout(500);

  if (theme === 'dark') {
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(500);
  }

  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const ths = document.querySelectorAll('.crystal-table-card .ant-table-thead th');
    const firstRow = document.querySelector('.ant-table-tbody tr');
    return {
      dataTheme: root.getAttribute('data-theme'),
      tokenHeaderColor: cs.getPropertyValue('--theme-table-header-color').trim(),
      tokenText: cs.getPropertyValue('--theme-text').trim(),
      headers: Array.from(ths).map(th => {
        const thCs = getComputedStyle(th);
        const title = th.querySelector('.ant-table-column-title');
        const titleCs = title ? getComputedStyle(title) : null;
        return {
          text: th.textContent.trim().replace(/\s+/g, ' ').substring(0, 22),
          thColor: thCs.color,
          thBg: thCs.backgroundColor,
          titleColor: titleCs ? titleCs.color : null,
        };
      }),
      divisionCell: firstRow ? (firstRow.querySelector('td:nth-child(6)')?.textContent || '').trim().substring(0, 60) : null,
      emailColor: firstRow ? getComputedStyle(firstRow.querySelector('.user-cell-email') || firstRow).color : null,
    };
  });

  console.log(`\n=== ${theme.toUpperCase()} ===`);
  console.log(`data-theme=${result.dataTheme}  --theme-table-header-color=${result.tokenHeaderColor}  --theme-text=${result.tokenText}`);
  result.headers.forEach(h => console.log(`  ${h.text.padEnd(22)} th=${h.thColor} bg=${h.thBg} title=${h.titleColor}`));
  console.log(`  division cell: ${result.divisionCell}`);
  console.log(`  email color: ${result.emailColor}`);
  await page.screenshot({ path: `scratch/p24-${theme}-before.png` });
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  await inspect(browser, 'light');
  await inspect(browser, 'dark');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
