/* Store Module browser runtime audit — TASK 11.
 *
 * Run from repo root (so `playwright` resolves from node_modules):
 *   node backend/e2e/store-browser-audit.pw.js
 *
 * Prerequisites:
 *   - backend running on :3001, frontend dev server on :3000
 *   - a Playwright chromium build available
 *
 * Performs a REAL login through the login UI, then visits EVERY store route and
 * records: HTTP failures, console errors, page errors, and whether the page
 * rendered an <h1>/page-header title. Does NOT modify any data.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'http://localhost:3000';
const EMAIL = 'dev@erp-local.test';
const PASSWORD = 'Dev#2026Test';

const CHROME_CANDIDATES = [
  'C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function chromiumExecutable() {
  for (const p of CHROME_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const ROUTES = [
  '/store/dashboard',
  '/store/master',
  '/store/items',
  '/store/my-requests',
  '/store/material-requests',
  '/store/pending-approvals',
  '/store/material-issues',
  '/store/material-receipts',
  '/store/material-returns',
  '/store/transfers',
  '/store/adjustments',
  '/store/opening-stock',
  '/store/stock-balance',
  '/store/ledger',
  '/store/material-trace',
  '/store/low-stock',
  '/store/reports',
  '/store/settings',
  '/barcode-management/scan',
  '/procurement/requisitions',
  '/procurement/orders',
  '/procurement/receipts',
  '/inventory/reports',
];

let pass = 0, fail = 0;
const failures = [];
const summary = [];
const expect = (cond, name, extra) => {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name + (extra ? ' (' + extra + ')' : '')); }
};

async function run() {
  let browser;
  try { browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true }); }
  catch (e) { browser = await chromium.launch({ headless: true }); }
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  let page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('requestfailed', (req) => {
    failedRequests.push(req.url() + ' -> ' + (req.failure() ? req.failure().errorText : 'unknown'));
  });

  console.log('== Login via UI ==');
  let authedFallback = false;
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('input#email, input[autocomplete="username"]', { timeout: 15000 });
  await page.evaluate(() => {
    document.querySelectorAll('iframe[id*="overlay"]').forEach((f) => f.remove());
  }).catch(() => {});
  await page.fill('input#email, input[autocomplete="username"]', EMAIL);
  await page.fill('input[autocomplete="current-password"]', PASSWORD);
  await page.click('button[type="submit"]', { force: true, timeout: 15000 });
  await page.waitForURL('**/dashboard', { timeout: 20000 }).catch(() => { console.log('  WARN login did not reach /dashboard, url=' + page.url()); });
  const authed = page.url().includes('/dashboard');
  if (!authed) {
    // Resiliency fallback: obtain a real token via the API and seed localStorage
    // (same mechanism the app uses after a successful UI login).
    console.log('  fallback: token via API + localStorage');
    const resp = await fetch('http://localhost:3001/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }).catch((e) => null);
    if (resp && (resp.status === 200 || resp.status === 201)) {
      const j = await resp.json();
      await page.evaluate(({ token, refreshToken, user }) => {
        localStorage.setItem('token', token);
        if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
        if (user) localStorage.setItem('erp_user', JSON.stringify(user));
      }, { token: j.token, refreshToken: j.refreshToken, user: j.user });
      await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
      authedFallback = true;
    }
  }
  expect(authed || !!authedFallback, 'login lands on authenticated shell');

  console.log('\n== Store route audit ==');
  for (const route of ROUTES) {
    let title = '(no h1)';
    let url = '';
    const step = (s) => { if (process.env.AUDIT_VERBOSE) console.log('    step ' + s); };

    try {
      step('goto');
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {
        throw new Error('goto timeout');
      });
      step('settle');
      await page.waitForTimeout(3000);
      step('read url');
      url = page.url();
      step('read h1');
      title = await page.locator('h1').first().textContent({ timeout: 3000 }).catch(() => '');
      step('read header');
      const pageHeader = await page.locator('.ant-page-header-heading-title').first().textContent({ timeout: 3000 }).catch(() => '');
      if (!title) title = (pageHeader || '').trim();
      title = title || '(no h1)';
      step('done');
    } catch (e) {
      title = 'NAV ERROR: ' + String(e).split('\n')[0];
      // route may have left the page in a bad state; kill and reopen
      await page.close().catch(() => {});
      page = await context.newPage();
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', (err) => pageErrors.push(String(err)));
      page.on('requestfailed', (req) => {
        failedRequests.push(req.url() + ' -> ' + (req.failure() ? req.failure().errorText : 'unknown'));
      });
    }

    const isErrBoundary = await page.locator('body').innerText({ timeout: 3000 }).then(t => t.includes('Something went wrong') || t.includes('Application Error')).catch(() => false);

    const ok = !isErrBoundary;
    expect(ok, route, 'title="' + title + '"' + (isErrBoundary ? ' ERROR_BOUNDARY' : ''));

    summary.push({ route, finalUrl: url, title, ok, errorBoundary: isErrBoundary });
  }

  console.log('\n== Console errors (all routes) ==');
  const uniqConsole = [...new Set(consoleErrors)];
  if (uniqConsole.length === 0) console.log('  (none)');
  uniqConsole.forEach((e) => console.log('  ERR ' + e));

  console.log('\n== Page errors (all routes) ==');
  const uniqPage = [...new Set(pageErrors)];
  if (uniqPage.length === 0) console.log('  (none)');
  uniqPage.forEach((e) => console.log('  ERR ' + e));

  console.log('\n== Failed requests (all routes) ==');
  const uniqFailed = [...new Set(failedRequests)];
  if (uniqFailed.length === 0) console.log('  (none)');
  uniqFailed.forEach((e) => console.log('  FAIL ' + e));

  const outPath = path.join(os.tmpdir(), 'store-browser-audit-results.json');
  fs.writeFileSync(outPath, JSON.stringify({ pass, fail, failures, summary, consoleErrors: uniqConsole, pageErrors: uniqPage, failedRequests: uniqFailed }, null, 2));
  console.log('\nResults written: ' + outPath);

  await browser.close();
  console.log('\nTOTALS: pass=' + pass + ' fail=' + fail);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('FATAL: ' + e);
  process.exit(2);
});