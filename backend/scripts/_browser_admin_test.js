const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:3000';
const DIR = path.join(__dirname, '..', '..', 'screenshots');

(async () => {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const networkLog = [];
  page.on('response', resp => {
    networkLog.push({ method: resp.request().method(), url: resp.url(), status: resp.status() });
  });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  const results = {};

  try {
    // Login
    console.log('=== LOGIN ===');
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('input[type="email"], input[placeholder*="email" i], input[placeholder*="Email" i]', 'system.admin@erp.com');
    await page.fill('input[type="password"], input[name="password"]', 'Admin#2026!Secure');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    console.log('Login OK');

    // --- USER MANAGEMENT PAGE ---
    console.log('\n=== USER MANAGEMENT PAGE ===');
    networkLog.length = 0;
    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Verify stat cards
    const statCards = await page.$$('.ant-card .ant-statistic');
    results.statCards = statCards.length;
    console.log(`Stat cards: ${results.statCards}`);

    // Verify stat card titles
    const statTitles = await page.$$eval('.ant-statistic .ant-statistic-title', els => els.map(e => e.textContent?.trim()));
    results.statTitles = statTitles;
    console.log(`Stat titles: ${JSON.stringify(statTitles)}`);

    // Verify main table
    const table = await page.$('table');
    results.tableExists = !!table;
    console.log(`Table exists: ${results.tableExists}`);

    const tableRows = await page.$$('table tbody tr');
    results.tableRows = tableRows.length;
    console.log(`Table rows: ${results.tableRows}`);

    // Verify columns present
    const headers = await page.$$eval('table thead th', els => els.map(e => e.textContent?.trim()));
    results.columns = headers;
    console.log(`Columns: ${JSON.stringify(headers)}`);

    // Verify role tags
    const roleTags = await page.$$('table .ant-tag');
    results.roleTags = roleTags.length;
    console.log(`Role tags: ${results.roleTags}`);

    // Verify status badges
    const statusBadges = await page.$$('.ant-badge');
    results.statusBadges = statusBadges.length;
    console.log(`Status badges: ${results.statusBadges}`);

    // Verify search bar
    const searchInput = await page.$('input[placeholder*="Search" i]');
    results.searchBar = !!searchInput;
    console.log(`Search bar: ${results.searchBar}`);

    // Verify status filter
    const statusFilter = await page.$('.ant-select');
    results.statusFilter = !!statusFilter;
    console.log(`Status filter: ${results.statusFilter}`);

    // Verify Add User button
    const addBtn = await page.$('button:has-text("Add User")');
    results.addUserBtn = !!addBtn;
    console.log(`Add User button: ${results.addUserBtn}`);

    // Verify action buttons in table
    const editBtns = await page.$$('table tbody tr button');
    results.actionBtns = editBtns.length;
    console.log(`Action buttons: ${results.actionBtns}`);

    // Verify no errors in API
    const apiErrors = networkLog.filter(n => n.status >= 400);
    results.apiErrors = apiErrors.length;
    apiErrors.forEach(e => console.log(`  API ERROR: ${e.method} ${e.url.replace('http://localhost:3001', '')} → ${e.status}`));

    await page.screenshot({ path: path.join(DIR, '40-users-table.png'), fullPage: true });

    // --- ADD USER MODAL ---
    console.log('\n=== ADD USER MODAL ===');
    if (addBtn) {
      await addBtn.click();
      await page.waitForSelector('.ant-modal', { timeout: 5000 });
      await page.waitForTimeout(500);

      const modal = await page.$('.ant-modal');
      results.modalOpen = !!modal;
      console.log(`Modal open: ${results.modalOpen}`);

      // Count form sections (Divider with orientation="left")
      const sections = await page.$$('.ant-modal .ant-divider');
      results.formSections = sections.length;
      console.log(`Form sections: ${sections.length}`);

      // Count form items
      const formItems = await page.$$('.ant-modal .ant-form-item');
      results.formItems = formItems.length;
      console.log(`Form items: ${formItems.length}`);

      // Verify form labels
      const labels = await page.$$eval('.ant-modal .ant-form-item-label', els => els.map(e => e.textContent?.trim()));
      results.formLabels = labels;
      console.log(`Form labels: ${JSON.stringify(labels)}`);

      // Verify Create User button
      const createBtn = await page.$('.ant-modal .ant-btn-primary:has-text("Create User")');
      results.createBtn = !!createBtn;
      console.log(`Create User button: ${results.createBtn}`);

      await page.screenshot({ path: path.join(DIR, '41-add-user-modal.png'), fullPage: true });

      // Close modal
      const closeBtn = await page.$('.ant-modal .ant-modal-close');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(500);
    }

    // --- ROLE MANAGEMENT PAGE ---
    console.log('\n=== ROLE MANAGEMENT PAGE ===');
    networkLog.length = 0;
    await page.goto(`${BASE}/admin/roles`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const roleTable = await page.$('table');
    results.roleTableExists = !!roleTable;
    console.log(`Role table: ${results.roleTableExists}`);

    const roleTableRows = await page.$$('table tbody tr');
    results.roleTableRows = roleTableRows.length;
    console.log(`Role table rows: ${results.roleTableRows}`);

    const roleHeaders = await page.$$eval('table thead th', els => els.map(e => e.textContent?.trim()));
    results.roleColumns = roleHeaders;
    console.log(`Role columns: ${JSON.stringify(roleHeaders)}`);

    const roleApiErrors = networkLog.filter(n => n.status >= 400);
    results.roleApiErrors = roleApiErrors.length;
    roleApiErrors.forEach(e => console.log(`  API ERROR: ${e.method} ${e.url.replace('http://localhost:3001', '')} → ${e.status}`));

    await page.screenshot({ path: path.join(DIR, '42-role-management.png'), fullPage: true });

    // --- PERMISSION MANAGEMENT PAGE ---
    console.log('\n=== PERMISSION MANAGEMENT PAGE ===');
    networkLog.length = 0;
    await page.goto(`${BASE}/admin/permissions`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const permTable = await page.$('table');
    results.permTableExists = !!permTable;
    console.log(`Permission table: ${results.permTableExists}`);

    const permTableRows = await page.$$('table tbody tr');
    results.permTableRows = permTableRows.length;
    console.log(`Permission table rows: ${results.permTableRows}`);

    const permApiErrors = networkLog.filter(n => n.status >= 400);
    results.permApiErrors = permApiErrors.length;
    permApiErrors.forEach(e => console.log(`  API ERROR: ${e.method} ${e.url.replace('http://localhost:3001', '')} → ${e.status}`));

    await page.screenshot({ path: path.join(DIR, '43-permission-management.png'), fullPage: true });

    // --- PERMISSION MATRIX PAGE ---
    console.log('\n=== PERMISSION MATRIX PAGE ===');
    networkLog.length = 0;
    await page.goto(`${BASE}/admin/permissions-matrix`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const matrixTable = await page.$('table');
    results.matrixTableExists = !!matrixTable;
    console.log(`Matrix table: ${results.matrixTableExists}`);

    const matrixHeaders = await page.$$eval('table thead th', els => els.map(e => e.textContent?.trim()));
    results.matrixColumns = matrixHeaders;
    console.log(`Matrix columns: ${JSON.stringify(matrixHeaders)}`);

    const matrixApiErrors = networkLog.filter(n => n.status >= 400);
    results.matrixApiErrors = matrixApiErrors.length;

    await page.screenshot({ path: path.join(DIR, '44-permission-matrix.png'), fullPage: true });

    // --- CONSOLE ERRORS ---
    console.log('\n=== CONSOLE ERRORS ===');
    const relevantErrors = consoleErrors.filter(e => e.includes('403') || e.includes('AxiosError') || e.includes('Request failed'));
    results.relevantErrors = relevantErrors.length;
    console.log(`403/Axios errors: ${relevantErrors.length}`);
    relevantErrors.forEach(e => console.log(`  ${e.substring(0, 200)}`));
    console.log(`Total console warnings/errors: ${consoleErrors.length}`);

    // --- FINAL SUMMARY ---
    console.log('\n=== RESULTS SUMMARY ===');
    console.log(JSON.stringify(results, null, 2));

  } catch (e) {
    console.error('ERROR:', e.message);
    await page.screenshot({ path: path.join(DIR, 'error-admin-test.png'), fullPage: true });
  } finally {
    await browser.close();
  }
})();
