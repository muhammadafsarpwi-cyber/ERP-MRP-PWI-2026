// @ts-check
const { chromium } = require('playwright');
const fs = require('fs');

const API = 'http://127.0.0.1:3001/api/v1';
const BASE = 'http://127.0.0.1:3000';
const SHOT_DIR = 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\hr06';

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok: !!ok, extra: extra || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}\t${name}${extra ? ' :: ' + extra : ''}`);
}

async function seedAuthAndTheme(page, { token, user, refreshToken, mode }) {
  await page.evaluate(({ token, user, refreshToken, mode }) => {
    localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('erp_user', JSON.stringify(user));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
    if (mode) {
      localStorage.setItem('erp_theme_prefs_v1', JSON.stringify({
        [`user:${user.id}`]: { mode, paletteId: 'indigo' },
      }));
    }
  }, { token, user, refreshToken, mode });
}

async function openLeaves(page, { token, user, refreshToken, mode }) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await seedAuthAndTheme(page, { token, user, refreshToken, mode });
  await page.goto(BASE + '/hr/leaves', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('text=Leave Requests', { timeout: 20000 });
  await page.waitForTimeout(2500);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const loginResp = await (await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }),
  })).json().catch((e) => { check('login via API', false, String(e)); return null; });
  check('login via API', !!loginResp?.token, `status=${loginResp ? '' : 'null'}`);

  const combos = [
    { width: 1280, mode: 'light' },
    { width: 1280, mode: 'dark' },
    { width: 768, mode: 'light' },
    { width: 768, mode: 'dark' },
    { width: 390, mode: 'light' },
    { width: 390, mode: 'dark' },
  ];

  for (const c of combos) {
    const page = await browser.newPage({ viewport: { width: c.width, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
    try {
      await openLeaves(page, { token: loginResp.token, user: loginResp.user, refreshToken: loginResp.refreshToken, mode: c.mode });
      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      const rows = await page.locator('tr.ant-table-row').count();
      const kpiCards = await page.locator('.erp-kpi-card').count();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`[${c.width}/${c.mode}] theme=${c.mode}`, theme === c.mode, `theme=${theme}`);
      check(`[${c.width}/${c.mode}] rows rendered`, rows >= 1, `rows=${rows}`);
      check(`[${c.width}/${c.mode}] KPI cards rendered`, kpiCards === 4, `cards=${kpiCards}`);
      check(`[${c.width}/${c.mode}] no horizontal overflow`, overflow <= 1, `overflow=${overflow}`);
      check(`[${c.width}/${c.mode}] no page errors`, pageErrors.filter((e) => !/400|404/.test(e)).length === 0, pageErrors.slice(0, 2).join(' | '));
      await page.screenshot({ path: `${SHOT_DIR}\\06-${c.width}-leaves-${c.mode}.png`, fullPage: false });
      console.log('   screenshot:', `${SHOT_DIR}\\06-${c.width}-leaves-${c.mode}.png`);
    } catch (e) {
      check(`[${c.width}/${c.mode}] crashed`, false, String(e && e.message || e));
    } finally {
      await page.close();
    }
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n== HR-06 RESPONSIVE RESULT: ${results.length - failed}/${results.length} passed ==`);
  process.exit(failed ? 2 : 0);
})();