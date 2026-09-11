const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:3000';
const CHROME = ['C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
  const consoleErrors = [];
  const consoleLogs = [];
  const postResponses = [];
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('antd: Select')) consoleErrors.push(m.text().slice(0, 300)); if (m.type() === 'log') consoleLogs.push(m.text().slice(0, 300)); });
  p.on('response', async (r) => { if (r.request().method() === 'POST' && /\/api\/v1\/production\/entries($|\?)/.test(r.url())) { postResponses.push({ status: r.status(), body: (await r.text().catch(() => '')).slice(0, 300) }); } });

  let lr;
  for (let i = 0; i < 8; i++) {
    lr = await fetch('http://localhost:3001/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) });
    if (lr.status !== 429) break;
    await new Promise((r) => setTimeout(r, 15000));
  }
  if (lr.status !== 200 && lr.status !== 201) { console.log('LOGIN FAILED status=' + lr.status); process.exit(3); }
  const j = await lr.json();
  await p.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.evaluate(({ token, refreshToken, user }) => { localStorage.setItem('token', token); localStorage.setItem('refresh_token', refreshToken); localStorage.setItem('erp_user', JSON.stringify(user)); }, j);
  await p.goto(BASE + '/production/entries/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(4000);

  async function openAndPick(hasPlaceholderText, typeText, optionText) {
    const sel = p.locator('.ant-select').filter({ hasText: new RegExp(hasPlaceholderText) }).first();
    await sel.click();
    if (typeText) { await p.keyboard.type(typeText); await p.waitForTimeout(500); }
    await p.locator('.ant-select-item-option').filter({ hasText: optionText }).first().click();
    await p.waitForTimeout(600);
  }

  await openAndPick('Select Division', 'Control Cable', 'Control Cable');
  await openAndPick('Select Section', 'Spiral', 'Spiral');
  await openAndPick('Select Department', 'Flattening', 'Flattening');
  await openAndPick('Select Shift', '', 'Shift 1 (Morning)');
  const shiftText = await p.locator('.ant-select').filter({ hasText: /planned/i }).first().textContent();
  const m = /planned ([\d.]+)h/.exec(shiftText || '');
  await p.keyboard.press('Escape');

  const machant = p.locator('.ant-select').filter({ hasText: /Select or type machine no\./i }).first();
  await machant.click();
  await machant.locator('input').first().pressSequentially('FT-03', { delay: 25 });
  await p.waitForTimeout(800);
  await p.locator('.ant-select-item-option').filter({ hasText: 'FT-03 — Flattening Machine FT-03' }).first().click();
  await p.waitForTimeout(500);

  await p.getByRole('button', { name: '+ Add Item' }).click();
  await p.waitForSelector('[data-testid="production-item-row-1"]', { timeout: 10000 });
  await p.locator('[data-testid="production-item-row-1"] .ant-select').first().click();
  await p.keyboard.type('FLAT-WIRE-001');
  await p.waitForTimeout(500);
  await p.locator('.ant-select-item-option').filter({ hasText: 'FLAT-WIRE-001' }).first().click();
  await p.waitForTimeout(600);
  await p.locator('[data-testid="production-item-row-1"] input[aria-label="Item quantity"]').first().fill('5');

  const fillByLabel = async (labelReg, value) => {
    const item = p.locator('.ant-form-item').filter({ has: p.locator('label').filter({ hasText: labelReg }) }).first();
    await item.locator('input').first().fill(String(value));
  };
  await fillByLabel(/Target Production/, 5);
  await fillByLabel(/Running Hours/, m ? parseFloat(m[1]) : 8);
  await fillByLabel(/Rejection \/ Scrap/, 0);

  const opSel = p.locator('.ant-select').filter({ hasText: /Select HR operator or type manual name/i }).first();
  await opSel.click();
  await opSel.locator('input').first().pressSequentially('QA P35 Operator');
  await p.waitForTimeout(500);
  await p.keyboard.press('Enter');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);

  await p.getByRole('button', { name: 'Save Production Entry' }).click();
  const tryModal = async () => {
    try { await p.locator('.ant-modal:has-text("Production Entry Saved Successfully")').waitFor({ state: 'visible', timeout: 12000 }); return true; } catch (e) { return false; }
  };
  let modalOk = await tryModal();
  if (!modalOk) {
    const diag = await p.evaluate(() => {
      const errs = Array.from(document.querySelectorAll('.ant-form-item-explain-error')).map((e) => e.textContent);
      const msgs = Array.from(document.querySelectorAll('.ant-message-notice')).map((e) => e.textContent);
      const bodyText = (document.body.textContent || '').replace(/\s+/g, ' ').slice(0, 300);
      return { errs: errs.slice(0, 8), msgs: msgs.slice(0, 4), bodyText };
    });
    console.log('ACTIONS: modal not shown. diag=', JSON.stringify(diag));
    console.log('ACTIONS: errors=', JSON.stringify(consoleErrors.slice(0, 6)));
    console.log('ACTIONS: logs=', JSON.stringify(consoleLogs.filter((x) => /ON_FINISH|ENTRY_SAVE/.test(x)).slice(0, 6)));
    console.log('ACTIONS: posts=', JSON.stringify(postResponses));
    await b.close();
    process.exit(5);
  }
  console.log('ACTIONS: success modal shown');

  const numberText = (await p.locator('.ant-modal:has-text("Production Entry Saved Successfully")').textContent() || '').replace(/\s+/g, ' ');
  const num = /PE-\d{4}-\d{5}/.exec(numberText);
  console.log('ACTIONS: entryNumber created =', num ? num[0] : 'NONE');

  const buttonNames = await p.locator('.ant-modal:has-text("Production Entry Saved Successfully") button').allTextContents();
  console.log('ACTIONS: modal buttons =', JSON.stringify(buttonNames));

  await p.getByRole('button', { name: 'Enter Another Entry' }).click();
  await p.waitForURL(/\/production\/entries\/new/, { timeout: 15000 });
  await p.waitForTimeout(2000);
  console.log('ACTIONS: after Enter Another Entry URL =', p.url());
  console.log('ACTIONS: on a fresh form =', await p.getByRole('button', { name: 'Save Production Entry' }).isVisible().catch(() => false));
  await p.screenshot({ path: 'D:/ERP-MRP-PWI-2026/browser-qa-screenshots/p35-actions.png' });
  await b.close();
  console.log('ACTIONS: DONE');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });