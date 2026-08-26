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

  try {
    // Login
    console.log('LOGIN...');
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('input[type="email"], input[placeholder*="email" i], input[placeholder*="Email" i]', 'system.admin@erp.com');
    await page.fill('input[type="password"], input[name="password"]', 'Admin#2026!Secure');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    console.log('Login OK');

    // Clear network log to focus on admin pages
    networkLog.length = 0;

    // Navigate to User Management
    console.log('\nNavigating to /admin/users...');
    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Report all network requests
    console.log('\n=== NETWORK REQUESTS ===');
    const errors = networkLog.filter(n => n.status >= 400);
    const ok = networkLog.filter(n => n.status >= 200 && n.status < 300);
    console.log(`Total: ${networkLog.length}, OK: ${ok.length}, Errors: ${errors.length}`);
    errors.forEach(e => console.log(`  ERROR: ${e.method} ${e.url} → ${e.status}`));
    
    // Show all API requests
    const apiRequests = networkLog.filter(n => n.url.includes('/api/'));
    console.log('\n=== API REQUESTS ===');
    apiRequests.forEach(r => {
      const icon = r.status >= 200 && r.status < 300 ? '✓' : '✗';
      console.log(`  ${icon} ${r.method} ${r.url.replace('http://localhost:3001', '')} → ${r.status}`);
    });

    // Check if page has error state
    console.log('\n=== PAGE STATE ===');
    const pageText = await page.textContent('body');
    const has403 = pageText.includes('403') || pageText.includes('Access Denied') || pageText.includes('permission');
    const hasError = pageText.includes('error') || pageText.includes('Error') || pageText.includes('AxiosError');
    console.log(`Page has 403/Access Denied text: ${has403}`);
    console.log(`Page has error text: ${hasError}`);

    // Check if the user table rendered
    const table = await page.$('table');
    const tableRows = await page.$$('table tbody tr');
    console.log(`Table rendered: ${!!table}`);
    console.log(`Table rows: ${tableRows.length}`);

    // Check for the runtime error overlay (React error boundary)
    const errorOverlay = await page.$('[data-overlay="true"], .error-boundary, [role="alert"]');
    console.log(`Error overlay: ${errorOverlay ? 'VISIBLE' : 'not found'}`);

    // Get any React error
    const reactError = await page.evaluate(() => {
      const err = document.querySelector('.react-error-boundary, [data-reactroot] .error');
      return err?.textContent?.substring(0, 500) || null;
    });
    console.log(`React error: ${reactError || 'none'}`);

    await page.screenshot({ path: path.join(DIR, '30-users-page.png'), fullPage: true });

    // Console errors
    console.log('\n=== CONSOLE ERRORS ===');
    const relevantErrors = consoleErrors.filter(e => e.includes('403') || e.includes('AxiosError') || e.includes('Request failed'));
    console.log(`Relevant errors (403/Axios): ${relevantErrors.length}`);
    relevantErrors.forEach(e => console.log(`  ${e.substring(0, 300)}`));
    console.log(`All console messages: ${consoleErrors.length}`);
    consoleErrors.forEach(e => console.log(`  ${e.substring(0, 200)}`));

    // Check localStorage for auth state
    const authState = await page.evaluate(() => {
      return {
        hasToken: !!localStorage.getItem('token'),
        hasUser: !!localStorage.getItem('erp_user'),
        hasPerms: !!localStorage.getItem('erp_permissions_ts'),
        user: JSON.parse(localStorage.getItem('erp_user') || 'null'),
      };
    });
    console.log('\n=== AUTH STATE ===');
    console.log(`Token: ${authState.hasToken ? 'present' : 'MISSING'}`);
    console.log(`User: ${authState.user?.email || 'N/A'}`);
    console.log(`User ID: ${authState.user?.id || 'N/A'}`);
    console.log(`User permissions count: ${authState.user?.permissions?.length || 0}`);
    if (authState.user?.permissions) {
      const adminPerms = authState.user.permissions.filter(p => p.startsWith('admin.'));
      console.log(`Admin permissions: ${adminPerms.length} → ${adminPerms.join(', ')}`);
    }

    console.log('\n=== COMPLETE ===');
  } catch (e) {
    console.error('ERROR:', e.message);
    await page.screenshot({ path: path.join(DIR, 'error-users.png'), fullPage: true });
  } finally {
    await browser.close();
  }
})();
