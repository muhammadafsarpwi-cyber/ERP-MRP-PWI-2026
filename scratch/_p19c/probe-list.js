const path = require('path');
const { chromium } = require('playwright');
const dayjs = require(path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'dayjs'));

const APP = 'http://localhost:3000';
const API = 'http://localhost:3001/api/v1';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';

(async () => {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const token = (await login.json()).token;
  const H = { authorization: `Bearer ${token}` };
  const j = await (await fetch(`${API}/visitor/entries?limit=25&page=1`, { headers: H })).json();
  const rows = j.data || [];
  console.log('api rows:', rows.length, 'total:', j.total, 'meta:', JSON.stringify(j.meta));
  console.log('timeIn range:', rows.map(r => dayjs(r.timeIn).format('YYYY-MM-DD')).sort()[0], '->', rows.map(r => dayjs(r.timeIn).format('YYYY-MM-DD')).sort().pop());
  console.log('today:', dayjs().format('YYYY-MM-DD'), ' this month:', dayjs().format('YYYY-MM'));
  const inMonth = rows.filter(r => dayjs(r.timeIn).isSame(dayjs(), 'month')).length;
  const inDay = rows.filter(r => dayjs(r.timeIn).isSame(dayjs(), 'day')).length;
  console.log('rows in current month:', inMonth, ' rows today:', inDay);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
  page.on('response', async r => {
    if (!r.url().includes('/visitor/entries?page')) return;
    try {
      const b = await r.json();
      errs.push(`RES ${r.status()} ${r.url()} topKeys=${Object.keys(b).join('|')} dataIsArray=${Array.isArray(b.data)} dataLen=${(b.data || []).length} total=${b.total}`);
    } catch (e) { errs.push('RES parse fail: ' + e.message); }
  });
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /ENTER SYSTEM/i }).click();
  await page.locator('input#login_email').fill(EMAIL);
  await page.locator('input#login_password').fill(PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 180000 });
  await page.goto(`${APP}/visitor-management/visitors`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('visitor-page').waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForTimeout(2500);

  try {
    const r = await page.evaluate(async () => {
      const t = localStorage.getItem('token');
      const res = await fetch('http://localhost:3001/api/v1/visitor/entries?page=1&limit=25', { headers: { authorization: `Bearer ${t}` } });
      return { status: res.status, text: (await res.text()).slice(0, 400) };
    });
    console.log('APP-SHAPED RESPONSE:', JSON.stringify(r).slice(0, 500));
  } catch (e) { console.log('capture failed:', e.message); }

  const dom = await page.evaluate(() => {
    const tbodies = Array.from(document.querySelectorAll('table'));
    return {
      tables: tbodies.length,
      rowCounts: tbodies.map(t => t.querySelectorAll('tbody tr').length),
      theadRows: tbodies.map(t => t.querySelectorAll('thead tr').length),
      allTrClasses: Array.from(document.querySelectorAll('tr')).slice(0, 8).map(t => t.className),
      allTrText: Array.from(document.querySelectorAll('tr')).slice(0, 6).map(t => t.innerText.replace(/\s+/g, ' ').slice(0, 60)),
      rowSelCounts: {
        antTableRow: document.querySelectorAll('tr.ant-table-row').length,
        antTableMeasureRow: document.querySelectorAll('tr.ant-table-measure-row').length,
        antTableSummary: document.querySelectorAll('tr.ant-table-summary').length,
        antTablePlaceholder: document.querySelectorAll('tr.ant-table-placeholder').length,
        tbodyAnt: document.querySelectorAll('tbody.ant-table-tbody tr').length,
      },
      spin: !!document.querySelector('.ant-spin-spinning'),
      bodyTextHead: (document.querySelector('[data-testid="visitor-page"]')?.innerText || '').slice(400, 900),
    };
  });
  console.log('DOM:', JSON.stringify(dom, null, 2));
  console.log('errors:', errs.slice(0, 8));
  const msgs = await page.evaluate(() => Array.from(document.querySelectorAll('.ant-message-notice-content')).map(e => e.textContent));
  console.log('toasts:', JSON.stringify(msgs));
  const inPage = await page.evaluate(async () => {
    const raw = localStorage.getItem('erp_token') || localStorage.getItem('token');
    const keys = Object.keys(localStorage);
    return { tokenKeys: keys.filter(k => /token|auth|erp/i.test(k)), has: !!raw };
  });
  console.log('localStorage:', JSON.stringify(inPage));
  await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  await browser.close();
})();
