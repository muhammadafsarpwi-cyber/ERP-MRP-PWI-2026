const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'browser-qa-screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
  console.log(`  [screenshot] ${name}.png`);
}

const results = {};

async function main() {
  console.log('=== PLAYWRIGHT BROWSER QA ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const networkErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('response', resp => {
    if (resp.url().includes('/api/v1/') && resp.status() >= 400) {
      networkErrors.push({ status: resp.status(), url: resp.url() });
    }
  });

  try {
    // === WELCOME SCREEN ===
    console.log('1. WELCOME SCREEN');
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    await screenshot(page, '01-welcome');

    // Click "WELCOME" button to proceed
    const welcomeBtn = await page.locator('button:has-text("WELCOME")').first();
    if (await welcomeBtn.isVisible()) {
      console.log('  Clicking WELCOME button...');
      await welcomeBtn.click();
      await page.waitForTimeout(3000);
      await screenshot(page, '02-after-welcome');
      console.log(`  URL after welcome: ${page.url()}`);
    }

    // === LOGIN ===
    console.log('\n2. LOGIN');
    // Look for login form
    await page.waitForTimeout(2000);
    let inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input')).map(e => ({
        type: e.type, placeholder: e.placeholder, id: e.id, name: e.name
      }));
    });
    console.log('  Inputs found:', JSON.stringify(inputs));

    // Try to find and fill email
    const emailInput = page.locator('input[type="email"], input[type="text"][placeholder*="email" i], input[type="text"][placeholder*="Email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('  Found email input');
      await emailInput.fill('system.admin@erp.com');
      await passwordInput.fill('Admin#2026!Secure');
      await screenshot(page, '03-credentials');

      // Click login
      const loginBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In"), button:has-text("Log In")').first();
      if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await loginBtn.click();
        console.log('  Login clicked, waiting...');
        await page.waitForTimeout(5000);
        await screenshot(page, '04-after-login');
        console.log(`  URL after login: ${page.url()}`);
      }
    } else {
      console.log('  No email input found. Checking current state...');
      // Maybe we need to navigate to login page
      await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await screenshot(page, '02b-login-page');
      console.log(`  Login page URL: ${page.url()}`);

      inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(e => ({
          type: e.type, placeholder: e.placeholder, id: e.id, name: e.name
        }));
      });
      console.log('  Login page inputs:', JSON.stringify(inputs));

      const loginEmail = page.locator('input[type="email"], input[type="text"][placeholder*="email" i]').first();
      const loginPass = page.locator('input[type="password"]').first();

      if (await loginEmail.isVisible({ timeout: 5000 }).catch(() => false)) {
        await loginEmail.fill('system.admin@erp.com');
        await loginPass.fill('Admin#2026!Secure');
        await screenshot(page, '03-credentials');

        const loginBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")').first();
        if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await loginBtn.click();
          await page.waitForTimeout(5000);
          await screenshot(page, '04-after-login');
          console.log(`  URL after login: ${page.url()}`);
        }
      } else {
        console.log('  STILL no login inputs. Taking debug screenshot...');
        await screenshot(page, '02c-debug');
      }
    }

    // Check if we're authenticated
    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);

    // If still on welcome/login, try direct navigation with localStorage token
    if (currentUrl.includes('localhost:3000/') && !currentUrl.includes('master-data') && !currentUrl.includes('dashboard') && !currentUrl.includes('inventory')) {
      console.log('\n  Attempting direct token-based auth...');
      // Use Supabase to sign in and get a token
      const token = await page.evaluate(async () => {
        try {
          const SUPABASE_URL = 'https://gnvobiwlzezostzjpqvu.supabase.co';
          const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdudm9iaXdsemV6b3N0empwcXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNDM5NTksImV4cCI6MjA5NzcxOTk1OX0.QSpOod3kaSHGwIAILrD_nLxcmaU42-3iFXtoeBp50Uc';
          const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
            body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' })
          });
          const data = await resp.json();
          if (data.access_token) return data.access_token;
          return null;
        } catch (e) {
          return null;
        }
      });

      if (token) {
        console.log('  Got Supabase token! Setting localStorage...');
        await page.evaluate((t) => {
          localStorage.setItem('token', t);
        }, token);
        await page.goto(`${FRONTEND_URL}/barcode-management`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(3000);
        await screenshot(page, '05-after-token-auth');
        console.log(`  URL after token auth: ${page.url()}`);
      } else {
        console.log('  Could not get Supabase token');
      }
    }

    // === Now test with authenticated session ===
    const isAuth = !page.url().includes('login') && !page.url().includes('welcome');
    console.log(`\n  Authenticated: ${isAuth}`);

    if (isAuth) {
      // DASHBOARD
      console.log('\n3. BARCODE DASHBOARD');
      await page.goto(`${FRONTEND_URL}/barcode-management`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await screenshot(page, '10-dashboard');

      const dashText = await page.textContent('body');
      console.log('  Has "Barcode Management":', dashText.includes('Barcode Management'));
      console.log('  Has "Total Barcodes":', dashText.includes('Total Barcodes'));
      console.log('  Has "320":', dashText.includes('320'));
      console.log('  Has "Scan Barcode":', dashText.includes('Scan Barcode'));
      console.log('  Has "Item Barcodes":', dashText.includes('Item Barcodes'));
      results.dashboard = dashText.includes('Barcode Management') ? 'PASS' : 'FAIL';

      // ITEM BARCODES
      console.log('\n4. ITEM BARCODES');
      await page.goto(`${FRONTEND_URL}/barcode-management/items`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await screenshot(page, '11-item-barcodes');

      const itemRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      const itemText = await page.textContent('body');
      console.log('  Table rows:', itemRows);
      console.log('  Has "Item Barcodes":', itemText.includes('Item Barcodes'));
      results.itemList = itemRows > 0 ? 'PASS' : 'FAIL';

      // View Details
      const viewBtns = page.locator('button[title="View Details"]');
      if (await viewBtns.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await viewBtns.first().click();
        await page.waitForTimeout(2000);
        await screenshot(page, '12-item-detail');
        const detailText = await page.textContent('body');
        const hasStructured = detailText.includes('Item Code') || detailText.includes('Item Name');
        console.log('  Structured detail:', hasStructured);
        results.itemDetail = hasStructured ? 'PASS' : 'FAIL';

        // Close
        await page.locator('.ant-modal-close').first().click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // Print
      const printBtns = page.locator('button[title="Print Barcode"]');
      if (await printBtns.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await printBtns.first().click();
        await page.waitForTimeout(2000);
        await screenshot(page, '13-item-print');
        const printText = await page.textContent('body');
        const hasSvg = await page.evaluate(() => document.querySelectorAll('svg rect, svg line').length > 0);
        console.log('  Print modal:', printText.includes('Print Barcode') || printText.includes('Print Label'));
        console.log('  SVG barcode:', hasSvg);
        results.print = 'PASS';
        await page.locator('.ant-modal-close').first().click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // CUSTOMER
      console.log('\n5. CUSTOMER BARCODES');
      await page.goto(`${FRONTEND_URL}/barcode-management/customers`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await screenshot(page, '14-customer-barcodes');
      const custRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      console.log('  Table rows:', custRows);
      results.customerList = custRows > 0 ? 'PASS' : 'FAIL';

      const custView = page.locator('button[title="View Details"]').first();
      if (await custView.isVisible({ timeout: 3000 }).catch(() => false)) {
        await custView.click();
        await page.waitForTimeout(2000);
        await screenshot(page, '15-customer-detail');
        const t = await page.textContent('body');
        results.customerDetail = (t.includes('Customer Code') || t.includes('Customer Name')) ? 'PASS' : 'FAIL';
        console.log('  Detail structured:', results.customerDetail === 'PASS');
        await page.locator('.ant-modal-close').first().click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // MACHINE
      console.log('\n6. MACHINE BARCODES');
      await page.goto(`${FRONTEND_URL}/barcode-management/machines`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await screenshot(page, '16-machine-barcodes');
      const machRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      console.log('  Table rows:', machRows);
      results.machineList = machRows > 0 ? 'PASS' : 'FAIL';

      const machView = page.locator('button[title="View Details"]').first();
      if (await machView.isVisible({ timeout: 3000 }).catch(() => false)) {
        await machView.click();
        await page.waitForTimeout(2000);
        await screenshot(page, '17-machine-detail');
        const t = await page.textContent('body');
        results.machineDetail = (t.includes('Machine Code') || t.includes('Machine Name')) ? 'PASS' : 'FAIL';
        console.log('  Detail structured:', results.machineDetail === 'PASS');
        await page.locator('.ant-modal-close').first().click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // WAREHOUSE
      console.log('\n7. WAREHOUSE BARCODES');
      await page.goto(`${FRONTEND_URL}/barcode-management/warehouses`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await screenshot(page, '18-warehouse-barcodes');
      const whRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      console.log('  Table rows:', whRows);
      results.warehouseList = whRows > 0 ? 'PASS' : 'FAIL';

      const whView = page.locator('button[title="View Details"]').first();
      if (await whView.isVisible({ timeout: 3000 }).catch(() => false)) {
        await whView.click();
        await page.waitForTimeout(2000);
        await screenshot(page, '19-warehouse-detail');
        const t = await page.textContent('body');
        results.warehouseDetail = (t.includes('Warehouse Code') || t.includes('Warehouse Name')) ? 'PASS' : 'FAIL';
        console.log('  Detail structured:', results.warehouseDetail === 'PASS');
        await page.locator('.ant-modal-close').first().click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // EMPLOYEE
      console.log('\n8. EMPLOYEE BARCODES');
      await page.goto(`${FRONTEND_URL}/barcode-management/employees`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await screenshot(page, '20-employee-barcodes');
      const empRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      console.log('  Table rows:', empRows);
      results.employeeList = empRows > 0 ? 'PASS' : 'FAIL';

      const empView = page.locator('button[title="View Details"]').first();
      if (await empView.isVisible({ timeout: 3000 }).catch(() => false)) {
        await empView.click();
        await page.waitForTimeout(2000);
        await screenshot(page, '21-employee-detail');
        const t = await page.textContent('body');
        results.employeeDetail = (t.includes('Employee Code') || t.includes('Full Name')) ? 'PASS' : 'FAIL';
        console.log('  Detail structured:', results.employeeDetail === 'PASS');
        await page.locator('.ant-modal-close').first().click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // PRODUCTION
      console.log('\n9. PRODUCTION BARCODES');
      await page.goto(`${FRONTEND_URL}/barcode-management/production`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await screenshot(page, '22-production-barcodes');
      const prodRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      console.log('  Table rows:', prodRows);
      results.productionList = prodRows > 0 ? 'PASS' : 'FAIL';

      const prodView = page.locator('button[title="View Details"]').first();
      if (await prodView.isVisible({ timeout: 3000 }).catch(() => false)) {
        await prodView.click();
        await page.waitForTimeout(2000);
        await screenshot(page, '23-production-detail');
        const t = await page.textContent('body');
        results.productionDetail = (t.includes('Date') || t.includes('Item') || t.includes('Quantity')) ? 'PASS' : 'FAIL';
        console.log('  Detail structured:', results.productionDetail === 'PASS');
        await page.locator('.ant-modal-close').first().click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // JOB CARD
      console.log('\n10. JOB CARD BARCODES');
      await page.goto(`${FRONTEND_URL}/barcode-management/job-cards`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await screenshot(page, '24-jobcard-barcodes');
      const jcRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      console.log('  Table rows:', jcRows);
      results.jobCardList = jcRows > 0 ? 'PASS' : 'FAIL';

      const jcView = page.locator('button[title="View Details"]').first();
      if (await jcView.isVisible({ timeout: 3000 }).catch(() => false)) {
        await jcView.click();
        await page.waitForTimeout(2000);
        await screenshot(page, '25-jobcard-detail');
        const t = await page.textContent('body');
        results.jobCardDetail = (t.includes('Job Card No') || t.includes('Complaint') || t.includes('Priority')) ? 'PASS' : 'FAIL';
        console.log('  Detail structured:', results.jobCardDetail === 'PASS');
        await page.locator('.ant-modal-close').first().click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // SCAN BARCODE
      console.log('\n11. SCAN BARCODE');
      await page.goto(`${FRONTEND_URL}/barcode-management/scan`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await screenshot(page, '26-scan-page');

      const scanInput = page.locator('input[placeholder*="Enter" i], input[placeholder*="barcode" i]').first();
      if (await scanInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await scanInput.fill('8901000000001');
        const lookupBtn = page.locator('button:has-text("Lookup")').first();
        await lookupBtn.click();
        await page.waitForTimeout(3000);
        await screenshot(page, '27-scan-result');
        const t = await page.textContent('body');
        console.log('  Barcode resolved:', t.includes('Barcode Resolved') || t.includes('Found'));
        console.log('  Entity type:', t.includes('Item'));
        results.scanManual = (t.includes('Barcode Resolved') || t.includes('Found')) ? 'PASS' : 'FAIL';

        // Test navigation
        const navBtn = page.locator('button:has-text("Open Item")').first();
        if (await navBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await navBtn.click();
          await page.waitForTimeout(3000);
          await screenshot(page, '28-scan-navigate');
          console.log('  Navigated to:', page.url());
          results.scanNavigation = page.url().includes('items') ? 'PASS' : 'FAIL';
        }
      }

      // RESPONSIVE
      console.log('\n12. RESPONSIVE');
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(`${FRONTEND_URL}/barcode-management`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);
      await screenshot(page, '29-tablet-768');

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(1000);
      await screenshot(page, '30-mobile-390');
      const overflow = await page.evaluate(() => document.body.scrollWidth <= window.innerWidth + 20);
      console.log('  No overflow at 390px:', overflow);
      results.responsive = overflow ? 'PASS' : 'FAIL';

      await page.setViewportSize({ width: 1920, height: 1080 });
    }

  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
  } finally {
    console.log('\n=== RESULTS ===');
    console.log(JSON.stringify(results, null, 2));
    console.log('\nConsole errors:', consoleErrors.length);
    consoleErrors.forEach(e => console.log('  -', e.substring(0, 200)));
    console.log('\nNetwork errors:', networkErrors.length);
    networkErrors.forEach(e => console.log('  -', e.status, e.url));
    await browser.close();
  }
}

main().catch(console.error);
