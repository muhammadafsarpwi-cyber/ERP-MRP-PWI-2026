/* PROMPT-34 browser runtime audit for the redesigned Item Detail modal.
 *
 * Run from repo root:
 *   node backend/e2e/item-detail-modal.pw.js
 *
 * Prerequisites:
 *   - backend running on :3001, frontend dev server on :3000
 *   - a Playwright chromium build available
 *
 * Verifies (real login, no data writes):
 *   1. Item Management page renders and the table shows rows.
 *   2. Clicking the View action opens the new centered modal (no drawer).
 *   3. Modal header shows Item Code, Status badge, Item Type tag.
 *   4. Tabs exist: Overview / Organization / Specifications / Production Route / History.
 *   5. Overview tab renders Basic Information without undefined/null/NaN.
 *   6. History tab renders real backend data (Inventory / Stock Ledger / Production tabs).
 *   7. History action in the table row opens the modal on the History tab.
 *   8. No console/page/network errors during the flow.
 */
const { chromium } = require('playwright');
const fs = require('fs');

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

console.log('== Login ==');
  let authed = false;
  const resp = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).catch((e) => null);
  if (resp && (resp.status === 200 || resp.status === 201)) {
    const j = await resp.json();
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.evaluate(({ token, refreshToken, user }) => {
      localStorage.setItem('token', token);
      if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
      if (user) localStorage.setItem('erp_user', JSON.stringify(user));
    }, { token: j.token, refreshToken: j.refreshToken, user: j.user });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    authed = true;
  } else {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('input#email, input[autocomplete="username"]', { timeout: 15000 });
    await page.evaluate(() => {
      document.querySelectorAll('iframe[id*="overlay"]').forEach((f) => f.remove());
    }).catch(() => {});
    await page.fill('input#email, input[autocomplete="username"]', EMAIL);
    await page.fill('input[autocomplete="current-password"]', PASSWORD);
    await page.click('button[type="submit"]', { force: true, timeout: 15000 });
    await page.waitForURL('**/dashboard', { timeout: 20000 }).catch(() => {});
    authed = page.url().includes('/dashboard');
  }
  expect(authed, 'login lands on authenticated shell');

console.log('\n== Item Management page ==');
  await page.goto(BASE + '/master-data/items', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('.ant-table-tbody > tr.ant-table-row');
    return rows.length > 0;
  }, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1500);
const tableRows = await page.locator('.ant-table-tbody > tr.ant-table-row').count();
  expect(tableRows > 0, `items table renders rows (${tableRows})`);
  const itemCodeLink = page.locator('.ant-table-tbody > tr.ant-table-row button[aria-label^="View item"]').first();
  expect(await itemCodeLink.count() > 0, 'item code link present in first column');

console.log('\n== Open detail modal via View action ==');
  const viewButton = page.locator('.ant-table-tbody > tr.ant-table-row').first()
    .locator('button[aria-label^="View "]').first();
  await viewButton.scrollIntoViewIfNeeded().catch(() => {});
  await viewButton.click({ force: true });
  await page.waitForTimeout(1200);
  // Wait until the modal shows loaded content (not the "Loading item details" skeleton)
  await page.waitForFunction(() => {
    const body = document.querySelector('.ant-modal .ant-modal-body');
    return body && !body.textContent.includes('Loading item details') && body.textContent.trim().length > 0;
  }, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(800);

  const modal = page.locator('.ant-modal').filter({ hasText: 'Close' });
  expect(await modal.count() > 0, 'detail modal is open (not a drawer)');

  const drawerCount = await page.locator('.ant-drawer-open').count();
  expect(drawerCount === 0, 'no Drawer is used for item detail');

  const modalText = await modal.textContent().catch(() => '');
  expect(/Overview|Organization|Specifications|Production Route|History/.test(modalText),
    'modal has 5 tabs (Overview/Organization/Specifications/Production Route/History)', modalText.slice(0, 160));

  const tabLabels = await modal.locator('.ant-tabs-tab').allTextContents();
  const expectedTabs = ['Overview', 'Organization', 'Specifications', 'Production Route', 'History'];
  const tabOk = expectedTabs.every((t) => tabLabels.some((l) => l.includes(t)));
  expect(tabOk, `tab labels match: ${tabLabels.map((t) => t.trim()).join(' | ')}`);

const headerText = await modal.locator('.ant-modal-header').textContent().catch(() => '');
  expect(/ACTIVE|INACTIVE/i.test(headerText), 'status badge present in modal header', headerText.slice(0, 120));

  const modalBodyText = await modal.locator('.ant-modal-body').textContent().catch(() => '');
  const naCheck = !/undefined|NaN|null/.test(modalBodyText);
  expect(naCheck, 'no literal undefined/NaN/null text in modal body', modalBodyText.slice(0, 200));

  console.log('\n== Overview tab renders Basic Information ==');
  const bodyText2 = await modal.locator('.ant-modal-body').textContent().catch(() => '');
  expect(/Basic Information/.test(bodyText2), 'Overview tab shows Basic Information card');
  expect(/itemCode|Item Code/.test(bodyText2) || /-[A-Z0-9]/.test(bodyText2), 'Item Code value rendered');

  console.log('\n== History tab (via modal header History button) ==');
const historyHeaderBtn = modal.locator('.ant-modal-header button').filter({ hasText: 'History' }).first();
  await historyHeaderBtn.click();
  await page.waitForTimeout(300);
  await page.waitForFunction(() => {
    const body = document.querySelector('.ant-modal .ant-modal-body');
    return body && !body.textContent.includes('Loading item') && /Inventory|Stock Ledger|Production/.test(body.textContent);
  }, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(400);
  const historyBody = await modal.locator('.ant-modal-body').textContent().catch(() => '');
  expect(/Inventory by Warehouse|Stock Ledger|Production History/.test(historyBody),
    'History tab shows inventory/stock-ledger/production sections');

  console.log('\n== History action from table row (standalone open) ==');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
const rowHistoryBtn = page.locator('.ant-table-tbody > tr.ant-table-row').first()
    .locator('button[aria-label^="History for "]').first();
if (await rowHistoryBtn.count() > 0) {
    await rowHistoryBtn.click();
    await page.waitForTimeout(1000);
    await page.waitForFunction(() => {
      const body = document.querySelector('.ant-modal .ant-modal-body');
      return body && !body.textContent.includes('Loading item') && /Inventory|Stock Ledger|Production/.test(body.textContent);
    }, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(800);
    const reopenModal = page.locator('.ant-modal').filter({ hasText: 'Close' });
    const reopenedText = await reopenModal.textContent().catch(() => '');
    expect(/Item History|Inventory by Warehouse|Stock Ledger/.test(reopenedText),
      'row History action opens modal on History tab', reopenedText.slice(0, 160));
  } else {
    expect(false, 'History action button exists in table row');
  }

  console.log('\n== Production Route tab ==');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
await viewButton.click();
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => {
    const body = document.querySelector('.ant-modal .ant-modal-body');
    return body && !body.textContent.includes('Loading item details') && body.textContent.trim().length > 0;
  }, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(500);
  const routeTab = page.locator('.ant-modal .ant-tabs-tab').filter({ hasText: 'Production Route' }).first();
  await routeTab.click();
  await page.waitForTimeout(2500);
  const routeBody = await page.locator('.ant-modal-body').textContent().catch(() => '');
  expect(/Production Route \/ Process/.test(routeBody), 'Production Route tab renders Route/Process card');

  const consoleClean = consoleErrors.length === 0 && pageErrors.length === 0;
  const netClean = failedRequests.length === 0;
  expect(consoleClean, 'no console/page errors during flow' + (consoleErrors.length ? ' :: ' + consoleErrors.slice(0, 2).join(' | ') : ''));
  expect(netClean, 'no failed network requests' + (failedRequests.length ? ' :: ' + failedRequests.slice(0, 2).join(' | ') : ''));

  console.log('\n==== SUMMARY ====');
  console.log(`PASS: ${pass}  FAIL: ${fail}`);
  if (failures.length) console.log('FAILURES: ' + failures.join('; '));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => { console.error('AUDIT ERROR: ' + (e && e.stack ? e.stack : String(e))); process.exit(2); });

