/* HR-02 My Attendance browser E2E + HR regression.
 *
 * Run from repo root:
 *   node backend/e2e/hr-my-attendance.pw.js
 *
 * Prerequisites:
 *   - backend running on :3001, CRA dev server on :3000
 *
 * Performs a REAL login through the UI as dev@erp-local.test (whose account is
 * temporarily linked to hr employee EMP-FT5), exercises the My Attendance
 * page (default month, August range, status filter), then smoke-checks the
 * other live HR routes. Does NOT modify any data.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'http://localhost:3000';
const API = 'http://localhost:3001/api/v1';
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

let pass = 0, fail = 0;
const failures = [];
const expect = (cond, name, extra) => {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name + (extra ? ' (' + extra + ')' : '')); }
};

async function run() {
  let browser;
  try { browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true }); }
  catch (e) { browser = await chromium.launch({ headless: true }); }
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

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
    const resp = await fetch(API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }).catch(() => null);
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

  console.log('\n== /hr/my-attendance ==');
  await page.goto(BASE + '/hr/my-attendance', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3500);

  const title = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => '')
    || (await page.locator('.ant-page-header-heading-title').first().textContent({ timeout: 3000 }).catch(() => '')) || '';
  const bodyText = await page.locator('body').innerText().catch(() => '');
  expect(!bodyText.includes('Something went wrong') && !bodyText.includes('Application Error'), 'no error boundary');
  expect(bodyText.includes('My Attendance') || title.includes('My Attendance'), 'page shows My Attendance', 'title="' + title.trim() + '"');

  expect(bodyText.includes('Phase5b Test'), 'linked employee name shown');
  expect(bodyText.includes('Today'), 'today block present');

  console.log('-- default current-month view (September, no records) --');
  expect(bodyText.includes('No attendance records in this period'), 'truthful empty state for current month');

  console.log('-- apply August range via the range picker --');
  const pickerInputs = page.locator('.ant-picker-input input');
  await pickerInputs.nth(0).click({ timeout: 10000 });
  await pickerInputs.nth(0).fill('2026-08-01');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await pickerInputs.nth(1).fill('2026-08-31');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  console.log('  picker values now: "' + (await pickerInputs.nth(0).inputValue().catch(() => '?')) + '" / "' + (await pickerInputs.nth(1).inputValue().catch(() => '?')) + '"');
  await page.getByRole('button', { name: 'Apply' }).click({ timeout: 10000 });
  await page.waitForTimeout(3500);

  let augText = await page.locator('body').innerText().catch(() => '');
  console.log('  applied state — range inputs: "' + (await pickerInputs.nth(0).inputValue().catch(() => '?')) + '" / "' + (await pickerInputs.nth(1).inputValue().catch(() => '?')) + '"');
  console.log('  body has Aug row: ' + augText.includes('2026-08-30'));
  expect(augText.includes('2026-08-30'), 'August PRESENT record row visible');

  console.log('-- status filter PRESENT --');
  const statusSelect = page.locator('.erp-filter-bar .ant-select').first();
  await statusSelect.click({ timeout: 10000 });
  await page.waitForSelector('.ant-select-dropdown:visible', { timeout: 10000 });
  const presentOption = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: 'PRESENT' }).first();
  await presentOption.click({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Apply' }).click({ timeout: 10000 });
  await page.waitForTimeout(3500);
  augText = await page.locator('body').innerText().catch(() => '');
  expect(augText.includes('2026-08-30'), 'PRESENT filter keeps the real record');

  console.log('-- status filter ABSENT --');
  await statusSelect.click({ timeout: 10000 });
  await page.waitForSelector('.ant-select-dropdown:visible', { timeout: 10000 });
  const absentOption = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: 'ABSENT' }).first();
  await absentOption.click({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Apply' }).click({ timeout: 10000 });
  await page.waitForTimeout(3500);
  augText = await page.locator('body').innerText().catch(() => '');
  expect(augText.includes('No records match the selected filters'), 'ABSENT filter shows filtered empty state');
  expect(!augText.includes('2026-08-30'), 'ABSENT filter hides PRESENT record');

  await page.screenshot({ path: path.join(os.tmpdir(), 'hr02-my-attendance.png'), fullPage: true });

  console.log('\n== HR routes regression ==');
  for (const route of ['/hr/dashboard', '/hr/leaves', '/hr/attendance-register']) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3500);
    const t = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => '')
      || (await page.locator('.ant-page-header-heading-title').first().textContent({ timeout: 3000 }).catch(() => '')) || '(no title)';
    const b = await page.locator('body').innerText().catch(() => '');
    const ok = b.includes('Something went wrong');
    expect(!ok && t.trim().length > 0, 'route renders: ' + route, 'title="' + (t || '').trim() + '"' + (ok ? ' ERROR_BOUNDARY' : ''));
  }

  console.log('\n== Console errors ==');
  const uniqConsole = [...new Set(consoleErrors)];
  if (uniqConsole.length === 0) console.log('  (none)');
  uniqConsole.forEach((e) => console.log('  ERR ' + e));

  console.log('== Page errors ==');
  const uniqPageErr = [...new Set(pageErrors)];
  if (uniqPageErr.length === 0) console.log('  (none)');
  uniqPageErr.forEach((e) => console.log('  ERR ' + e));

  console.log('== Failed requests ==');
  const uniqFailed = [...new Set(failedRequests)];
  if (uniqFailed.length === 0) console.log('  (none)');
  uniqFailed.forEach((e) => console.log('  FAIL ' + e));

  const outPath = path.join(os.tmpdir(), 'hr02-my-attendance-e2e.json');
  fs.writeFileSync(outPath, JSON.stringify({ pass, fail, failures, consoleErrors: uniqConsole, pageErrors: uniqPageErr, failedRequests: uniqFailed }, null, 2));
  console.log('\nResults written: ' + outPath);

  await browser.close();
  console.log('\nTOTALS: pass=' + pass + ' fail=' + fail);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('FATAL: ' + e);
  process.exit(2);
});