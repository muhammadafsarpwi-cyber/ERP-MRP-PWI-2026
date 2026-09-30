/* PROMPT #23 — Create New User form verification (desktop + mobile).
 *
 * Runs against the live dev servers (frontend :3000, backend :3001) with
 * the API layer mocked by Playwright route interception — the same data
 * contract the Jest suites use, but exercising the REAL rendering, CSS
 * stacking, scrolling and viewport behaviour.
 */
const { chromium, devices } = require('playwright');

const APP = 'http://localhost:3000';
const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';
const D_CCD = 'd1000000-0000-0000-0000-000000000002';
const D_SPD = 'd1000000-0000-0000-0000-000000000001';
const NEW_USER_ID = '3a7f9c15-6d02-4f8b-9a4e-5c1e2b7d90f4';

const adminUser = {
  id: 'admin-1',
  displayName: 'Muhammad Afsar',
  email: 'afsar@pwi.test',
  permissions: [
    'admin.users.view', 'admin.users.create', 'admin.users.update',
    'admin.users.assign_roles', 'admin.users.manage_scope',
    'admin.users.deactivate', 'admin.users.activate',
  ],
  divisions: { unrestricted: true, items: [], permissionScopes: {} },
};

const roles = [
  { id: 'role-admin', roleCode: 'ADMIN', name: 'Administrator' },
  { id: 'role-prod', roleCode: 'PRODUCTION', name: 'Production' },
];

const companies = [{
  id: COMPANY_ID, companyCode: 'COMP-001',
  tradeName: 'Pakistan Wire Industries',
  legalName: 'Pakistan Wire Industries (Pvt) Ltd',
}];

const divisions = [
  { id: D_CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division', status: 'ACTIVE' },
  { id: D_SPD, divisionCode: 'DIV-SPD', name: 'Spoke Division', status: 'ACTIVE' },
];

const existingUser = {
  id: 'user-anas',
  authUserId: 'auth-anas',
  displayName: 'Anas Test',
  email: 'anas@pwi.test',
  status: 'ACTIVE',
  defaultCompanyId: COMPANY_ID,
  defaultCompany: { tradeName: 'Pakistan Wire Industries' },
  userRoles: [{ id: 'ur-1', roleId: 'role-prod', role: { id: 'role-prod', roleCode: 'PRODUCTION', name: 'Production' } }],
  organizationScopes: [],
  createdAt: '2026-09-10T10:00:00Z',
};

const divisionAccessPuts = [];
const createFullPosts = [];
let newUserScopes = [];

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function setupRoutes(page) {
  // Catch-all FIRST: Playwright matches last-registered routes first, so this
  // has the lowest priority and only absorbs calls with no specific mock
  // (otherwise they hit the real backend and 401 → app redirects to /login).
  await page.route('**/api/v1/**', r => json(r, { data: [], total: 0, success: true }));

  await page.route('**/api/v1/auth/me', r => json(r, { success: true, data: adminUser }));
  await page.route('**/api/v1/auth/refresh', r => json(r, { token: 't', refreshToken: 'r' }));

  await page.route('**/api/v1/admin/users**', (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/division-access')) {
      if (method === 'GET') {
        return json(r2(route), {
          data: {
            effective: newUserScopes.length === 0
              ? { unrestricted: true, divisionIds: [] }
              : { unrestricted: false, divisionIds: newUserScopes.map(s => s.divisionId) },
          },
        });
      }
      if (method === 'PUT') {
        const body = route.request().postDataJSON();
        divisionAccessPuts.push(body);
        // emulate backend reconcile: replace division rows, drop company-wide
        newUserScopes = (body.divisionIds || []).map((id, i) => ({
          id: `scope-new-${i}`,
          companyId: body.companyId,
          divisionId: id,
          scopeLevel: 'DIVISION',
          isFullScope: false,
          status: 'ACTIVE',
          company: { id: body.companyId, legalName: companies[0].legalName },
          division: divisions.find(d => d.id === id) || { id },
        }));
        return json(r2(route), { success: true, data: { scopes: newUserScopes } });
      }
    }

    if (url.includes('/org-scopes')) {
      if (method === 'POST') {
        const body = route.request().postDataJSON();
        const scope = {
          id: `scope-${Date.now()}`,
          companyId: body.companyId,
          divisionId: body.divisionId,
          scopeLevel: body.scopeLevel,
          isFullScope: body.isFullScope,
          status: 'ACTIVE',
          company: { id: body.companyId, legalName: companies[0].legalName },
          division: divisions.find(d => d.id === body.divisionId) || { id: body.divisionId },
        };
        newUserScopes = [...newUserScopes.filter(s => s.divisionId !== body.divisionId), scope];
        return json(r2(route), { success: true, data: scope });
      }
      if (method === 'DELETE') {
        const id = url.split('/').pop();
        newUserScopes = newUserScopes.filter(s => s.id !== id);
        return json(r2(route), { success: true });
      }
    }

    if (url.includes('/avatar')) {
      return json(r2(route), { success: true, data: { ...existingUser, avatarUrl: '/uploads/avatars/x.png' } });
    }
    if (url.includes('/roles') && method === 'POST') {
      return json(r2(route), { success: true, data: {} });
    }
    if (url.includes('/reset-password') || url.includes('/deactivate') || url.includes('/activate')) {
      return json(r2(route), { success: true, data: {} });
    }

    // create-full
    if (url.includes('/create-full') && method === 'POST') {
      const body = route.request().postDataJSON();
      createFullPosts.push(body);
      newUserScopes = [];
      return json(r2(route), {
        success: true,
        data: { id: NEW_USER_ID, displayName: body.displayName, email: body.email, defaultCompanyId: body.companyId },
        message: 'User created successfully',
      });
    }

    // detail GET /admin/users/:id
    const detailMatch = url.match(/\/api\/v1\/admin\/users\/([^/?#]+)$/);
    if (detailMatch && method === 'GET') {
      const id = detailMatch[1];
      const record = id === existingUser.id ? existingUser : {
        id, displayName: 'Division Access Test User', email: 'new@pwi.test',
        defaultCompanyId: COMPANY_ID,
      };
      return json(r2(route), {
        data: { ...record, organizationScopes: id === NEW_USER_ID ? newUserScopes : record.organizationScopes || [] },
      });
    }

    // PATCH /admin/users/:id
    if (detailMatch && method === 'PATCH') {
      return json(r2(route), { success: true, data: existingUser });
    }

    // list GET /admin/users
    return json(r2(route), { data: [existingUser], total: 1 });
  });

  await page.route('**/api/v1/admin/roles**', r => json(r, { data: roles, total: roles.length }));
  await page.route('**/api/v1/companies**', r => json(r, { data: companies }));
  await page.route('**/api/v1/divisions**', r => json(r, { data: divisions }));
  await page.route('**/api/v1/notifications**', r => json(r, { data: [], total: 0 }));
  await page.route('**/api/v1/dashboard**', r => json(r, { data: {} }));
}

// route helper (kept tiny to avoid shadowing `route` param name)
function r2(route) { return route; }

async function seedSession(page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('access_token', 'fake-token');
    localStorage.setItem('erp_user', JSON.stringify({
      id: 'admin-1', displayName: 'Muhammad Afsar', email: 'afsar@pwi.test',
      permissions: [
        'admin.users.view', 'admin.users.create', 'admin.users.update',
        'admin.users.assign_roles', 'admin.users.manage_scope',
        'admin.users.deactivate', 'admin.users.activate',
      ],
    }));
    localStorage.setItem('erp_permissions_ts', String(Date.now()));
    // Seed the persisted workspace tab store so /admin/users is the ACTIVE tab
    // on load — otherwise the restored Dashboard tab mounts first (and would
    // latch the ErrorBoundary if a widget request ever failed).
    localStorage.setItem('pwi_erp_workspace_tabs_v1', JSON.stringify({
      state: {
        tabs: [
          { id: '/dashboard', route: '/dashboard', pathname: '/dashboard', title: 'Dashboard', closable: false, timestamp: 0 },
          { id: '/admin/users', route: '/admin/users', pathname: '/admin/users', title: 'Users', closable: true, timestamp: 1 },
        ],
        activeTabId: '/admin/users',
      },
      version: 0,
    }));
  });
}

const results = [];
function report(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function openCreateModal(page) {
  await page.goto(`${APP}/admin/users`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.user-management-container', { timeout: 15000 });
  await page.waitForSelector('.ant-table', { timeout: 15000 });
  await page.getByText('Add User').first().click();
  await page.waitForSelector('.erp-draggable-modal .ant-modal-body', { timeout: 10000 });
  await page.waitForTimeout(600);
}

// ─── DESKTOP ──────────────────────────────────────────────────────────────
async function runDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await seedSession(page);
  await setupRoutes(page);

  // 1. Desktop Create User — two-column layout preserved
  await openCreateModal(page);
  const emailBox = await page.getByPlaceholder('user@company.com').boundingBox();
  const nameBox = await page.getByPlaceholder('John Doe').boundingBox();
  report('desktop: two-column layout preserved', emailBox && nameBox && Math.abs(emailBox.y - nameBox.y) < 4 && emailBox.x < nameBox.x,
    `email x=${emailBox?.x | 0} name x=${nameBox?.x | 0}`);

  // footer visible without scrolling
  const footer = page.locator('.erp-draggable-modal .ant-modal-footer');
  const footerBox = await footer.boundingBox();
  const viewportH = 900;
  report('desktop: action footer visible without scrolling', footerBox && footerBox.y + footerBox.height <= viewportH,
    `footer bottom=${footerBox ? Math.round(footerBox.y + footerBox.height) : 'n/a'}`);
  const cancelBtn = page.getByRole('button', { name: 'Cancel' });
  const createBtn = page.getByRole('button', { name: 'Create User' });
  report('desktop: Cancel + Create User buttons present', await cancelBtn.count() === 1 && await createBtn.count() === 1);

  // form card present
  report('desktop: form card container present', await page.locator('.user-form-card').count() === 1);

  // 2. Desktop — scroll form, footer stays visible
  const body = page.locator('.erp-draggable-modal .ant-modal-body');
  await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(300);
  const footerBox2 = await footer.boundingBox();
  report('desktop: footer stays visible after scroll', footerBox2 && footerBox2.y + footerBox2.height <= viewportH);

  // division select present with label
  report('desktop: division select + label present',
    await page.getByText('Divisions').count() >= 1 && await page.getByText('Select divisions (optional)').count() >= 1);

  // 3. Desktop — select division, create user, verify persistence
  await page.getByPlaceholder('user@company.com').fill('prompt23.desktop@pwi.test');
  await page.getByPlaceholder('John Doe').fill('Prompt23 Desktop');
  await page.getByPlaceholder('Min 8 chars, upper+lower+number').fill('Testuser123!');
  await page.getByPlaceholder('Re-enter password').fill('Testuser123!');

  await page.locator('[data-testid="create-division-access-pending"] .ant-select').click();
  await page.waitForSelector('.ant-select-item-option-content');
  await page.getByText('DIV-CCD · Control Cable Division', { exact: true }).first().click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await page.screenshot({ path: 'scratch/p23-desktop-create.png' });
  await page.getByRole('button', { name: 'Create User' }).click();
  await page.waitForTimeout(1500);

  const createOk = createFullPosts.length === 1 && createFullPosts[0].email === 'prompt23.desktop@pwi.test';
  report('desktop: create-full POST fired', createOk, JSON.stringify(createFullPosts[0] || null));
  const putOk = divisionAccessPuts.length === 1 && (divisionAccessPuts[0].divisionIds || []).includes(D_CCD);
  report('desktop: division assignment persisted via PUT /division-access', putOk,
    JSON.stringify(divisionAccessPuts[0] || null));
  await page.screenshot({ path: 'scratch/p23-desktop-created.png' });

  // close success dialog
  const successBtn = page.getByTestId('save-result-success').getByRole('button', { name: /^Close$/ });
  if (await successBtn.count()) await successBtn.click();
  await page.waitForTimeout(300);

  // 4. Desktop — photo popup ABOVE create modal.
  // The create modal's mask is pointer-events:none, so a table avatar click
  // reaches the row even with the modal open — that is exactly the reported
  // bug scenario. The avatar sits under the centred modal, so fire the React
  // click handler directly (a real user clicks the visible part of the row).
  await page.evaluate(() => {
    const t = document.querySelector('.user-avatar-trigger');
    if (t) t.click();
  });
  await page.waitForTimeout(600);
  const stacking = await page.evaluate(() => {
    const avatarModal = document.querySelector('.user-avatar-modal');
    const createWrap = document.querySelector('.erp-draggable-modal-wrap');
    if (!avatarModal || !createWrap) return { found: false };
    const az = getComputedStyle(avatarModal.closest('.ant-modal-wrap') || avatarModal).zIndex;
    const cz = getComputedStyle(createWrap).zIndex;
    // hit-test: element at avatar modal centre must belong to the avatar modal
    const r = avatarModal.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { found: true, az: Number(az), cz: Number(cz), hitInside: !!el && avatarModal.contains(el) };
  });
  report('desktop: photo popup opens above create modal', stacking.found && stacking.az > stacking.cz && stacking.hitInside,
    `avatar z=${stacking.az} create z=${stacking.cz} hitInside=${stacking.hitInside}`);
  await page.screenshot({ path: 'scratch/p23-desktop-photo-popup.png' });

  // close photo popup (ESC)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const avatarGone = await page.locator('.user-avatar-modal').count() === 0;
  report('desktop: photo popup closes on ESC', avatarGone);

  // 5. Desktop — validation still works
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(400);
  await page.getByText('Add User').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Create User' }).click();
  await page.waitForTimeout(800);
  const errDialog = await page.getByTestId('save-result-error').count();
  report('desktop: validation blocks empty create', errDialog === 1);
  const errClose = page.getByTestId('save-result-error').getByRole('button', { name: /^Close$/ });
  if (await errClose.count()) await errClose.click();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await context.close();
}

// ─── MOBILE ────────────────────────────────────────────────────────────────
async function runMobile(browser) {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await seedSession(page);
  await setupRoutes(page);

  await openCreateModal(page);

  // no horizontal overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  report('mobile: no horizontal overflow', overflow <= 0, `overflow=${overflow}px`);

  // single-column: email above displayName
  const emailBox = await page.getByPlaceholder('user@company.com').boundingBox();
  const nameBox = await page.getByPlaceholder('John Doe').boundingBox();
  report('mobile: fields stack in single column', emailBox && nameBox && nameBox.y > emailBox.y + emailBox.height - 4,
    `email y=${emailBox ? Math.round(emailBox.y) : 'n/a'} name y=${nameBox ? Math.round(nameBox.y) : 'n/a'}`);

  // all fields reachable by scrolling + footer stays visible
  const body = page.locator('.erp-draggable-modal .ant-modal-body');
  const footer = page.locator('.erp-draggable-modal .ant-modal-footer');
  const footerBox = await footer.boundingBox();
  report('mobile: footer visible at open', footerBox && footerBox.y + footerBox.height <= 844,
    `footer bottom=${footerBox ? Math.round(footerBox.y + footerBox.height) : 'n/a'}`);

  // scroll to the very bottom of the form
  await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(300);
  const footerBox2 = await footer.boundingBox();
  report('mobile: footer stays visible after scroll to bottom', footerBox2 && footerBox2.y + footerBox2.height <= 844,
    `footer bottom=${footerBox2 ? Math.round(footerBox2.y + footerBox2.height) : 'n/a'}`);

  // division section reachable
  const divText = page.getByText('Select divisions (optional)');
  report('mobile: division select reachable at scroll bottom', await divText.count() === 1);
  await page.screenshot({ path: 'scratch/p23-mobile-scrolled.png' });

  // fill + create with division on mobile
  await body.evaluate(el => { el.scrollTop = 0; });
  await page.getByPlaceholder('user@company.com').fill('prompt23.mobile@pwi.test');
  await page.getByPlaceholder('John Doe').fill('Prompt23 Mobile');
  await page.getByPlaceholder('Min 8 chars, upper+lower+number').fill('Testuser123!');
  await page.getByPlaceholder('Re-enter password').fill('Testuser123!');
  await page.locator('[data-testid="create-division-access-pending"] .ant-select').click();
  await page.waitForSelector('.ant-select-item-option-content');
  await page.getByText('DIV-SPD · Spoke Division', { exact: true }).first().click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'scratch/p23-mobile-filled.png' });

  // footer buttons tappable (44px targets)
  const createBtn = page.getByRole('button', { name: 'Create User' });
  const btnBox = await createBtn.boundingBox();
  report('mobile: Create User button comfortably tappable', btnBox && btnBox.height >= 40, `height=${btnBox ? Math.round(btnBox.height) : 'n/a'}`);

  await createBtn.click();
  await page.waitForTimeout(1500);
  const putOk = divisionAccessPuts.some(p => (p.divisionIds || []).includes(D_SPD));
  report('mobile: create + division persistence works', createFullPosts.length === 2 && putOk,
    `creates=${createFullPosts.length} puts=${divisionAccessPuts.length}`);

  const successBtn = page.getByTestId('save-result-success').getByRole('button', { name: /^Close$/ });
  if (await successBtn.count()) await successBtn.click();
  await page.waitForTimeout(300);

  // photo popup above create modal on mobile + fits viewport.
  // The full-screen create modal covers the table, so fire the row's React
  // click handler directly (the reported bug: popup opened BEHIND the modal).
  await page.evaluate(() => {
    const t = document.querySelector('.user-avatar-trigger');
    if (t) t.click();
  });
  await page.waitForTimeout(600);
  const photo = await page.evaluate(() => {
    const m = document.querySelector('.user-avatar-modal');
    if (!m) return { found: false };
    const r = m.getBoundingClientRect();
    const wrap = m.closest('.ant-modal-wrap');
    return {
      found: true,
      z: Number(getComputedStyle(wrap || m).zIndex),
      fitsVp: r.width <= 390 && r.height <= 844 && r.x >= 0 && r.y >= 0,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    };
  });
  report('mobile: photo popup fits viewport + above create modal',
    photo.found && photo.z > 1060 && photo.fitsVp,
    `z=${photo.z} rect=${JSON.stringify(photo.rect)}`);
  await page.screenshot({ path: 'scratch/p23-mobile-photo-popup.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // keyboard viewport: shrink viewport height, footer must remain visible
  await page.setViewportSize({ width: 390, height: 400 });
  await page.waitForTimeout(400);
  const footerBox3 = await footer.boundingBox();
  report('mobile: footer visible with keyboard-height viewport (400px)',
    footerBox3 && footerBox3.y + footerBox3.height <= 400,
    `footer bottom=${footerBox3 ? Math.round(footerBox3.y + footerBox3.height) : 'n/a'}`);
  await page.screenshot({ path: 'scratch/p23-mobile-keyboard-viewport.png' });

  await context.close();
}

// ─── EDIT MODAL (division display + photo popup from edit) ─────────────────
async function runEdit(browser) {
  const context = await browser.newContext({    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await seedSession(page);
  await setupRoutes(page);

  await page.goto(`${APP}/admin/users`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.user-management-container', { timeout: 15000 });
  await page.waitForSelector('.ant-table', { timeout: 15000 });
  await page.getByRole('button', { name: /edit/i }).first().click();
  await page.waitForSelector('.erp-draggable-modal .ant-modal-body', { timeout: 10000 });
  await page.waitForTimeout(800);

  // edit modal: division access section visible
  report('edit: division access section present', await page.getByTestId('edit-division-access').count() === 1);

  // photo popup from INSIDE edit modal (Change Photo button) stacks above edit modal
  await page.getByRole('button', { name: /Change Photo/ }).click();
  await page.waitForTimeout(600);
  const stacking = await page.evaluate(() => {
    const avatarModal = document.querySelector('.user-avatar-modal');
    const editWrap = document.querySelector('.erp-draggable-modal-wrap');
    if (!avatarModal || !editWrap) return { found: false };
    const az = getComputedStyle(avatarModal.closest('.ant-modal-wrap') || avatarModal).zIndex;
    const cz = getComputedStyle(editWrap).zIndex;
    const r = avatarModal.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { found: true, az: Number(az), cz: Number(cz), hitInside: !!el && avatarModal.contains(el) };
  });
  report('edit: photo popup opens above edit modal', stacking.found && stacking.az > stacking.cz && stacking.hitInside,
    `avatar z=${stacking.az} edit z=${stacking.cz} hitInside=${stacking.hitInside}`);
  await page.screenshot({ path: 'scratch/p23-edit-photo-popup.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // division access modal from edit modal also stacks above
  const configureBtn = page.getByTestId('edit-division-access-configure');
  if (await configureBtn.count()) {
    await configureBtn.click();
    await page.waitForTimeout(600);
    const divStack = await page.evaluate(() => {
      const m = document.querySelector('.division-access-modal');
      const editWrap = document.querySelector('.erp-draggable-modal-wrap');
      if (!m || !editWrap) return { found: false };
      const az = getComputedStyle(m.closest('.ant-modal-wrap') || m).zIndex;
      const cz = getComputedStyle(editWrap).zIndex;
      const r = m.getBoundingClientRect();
      return { found: true, az: Number(az), cz: Number(cz), fitsVp: r.width <= 390 };
    });
    report('edit: division access modal above edit modal + fits mobile viewport',
      divStack.found && divStack.az > divStack.cz && divStack.fitsVp,
      `z=${divStack.az} fitsVp=${divStack.fitsVp}`);
    await page.screenshot({ path: 'scratch/p23-edit-division-modal.png' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } else {
    report('edit: division access configure button present', false, 'button not found');
  }

  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await runDesktop(browser);
    await runMobile(browser);
    await runEdit(browser);
  } finally {
    await browser.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\n==== ${results.length - failed.length}/${results.length} checks passed ====`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
