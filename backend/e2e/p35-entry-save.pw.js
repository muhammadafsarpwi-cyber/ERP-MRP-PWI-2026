const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:3000';
const CHROME = ['C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
  const consoleErrors = [];
  const consoleLogs = [];
  const postEntryHits = [];
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('antd: Select')) consoleErrors.push(m.text().slice(0, 200)); if (m.type() === 'log') consoleLogs.push(m.text().slice(0, 300)); });
  p.on('request', (r) => { if (r.method() === 'POST' && /\/api\/v1\/production\/entries($|\?)/.test(r.url())) postEntryHits.push(r.url()); });
  const postResponses = [];
  p.on('response', async (r) => { if (r.request().method() === 'POST' && /\/api\/v1\/production\/entries($|\?)/.test(r.url())) { postResponses.push({ status: r.status(), body: (await r.text().catch(() => '')).slice(0, 400) }); } });

  let lr;
  for (let i = 0; i < 8; i++) {
    lr = await fetch('http://localhost:3001/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) });
    if (lr.status !== 429) break;
    console.log('LOGIN 429, retry ' + (i + 1));
    await new Promise((r) => setTimeout(r, 15000));
  }
  if (lr.status !== 200 && lr.status !== 201) { console.log('LOGIN FAILED status=' + lr.status); process.exit(3); }
  const j = await lr.json();
  await p.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.evaluate(({ token, refreshToken, user }) => { localStorage.setItem('token', token); localStorage.setItem('refresh_token', refreshToken); localStorage.setItem('erp_user', JSON.stringify(user)); }, j);
  await p.goto(BASE + '/production/entries/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(4000);

  // ── helper: pick option in the currently-open searchable select dropdown ──
  async function openAndPick(hasPlaceholderText, typeText, optionText) {
    const sel = p.locator('.ant-select').filter({ hasText: new RegExp(hasPlaceholderText) }).first();
    await sel.click();
    await p.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { timeout: 10000 });
    if (typeText) {
      await p.keyboard.type(typeText);
      await p.waitForTimeout(500);
    }
    const opt = p.locator('.ant-select-item-option').filter({ hasText: optionText }).first();
    await opt.waitFor({ state: 'visible', timeout: 10000 });
    await opt.click();
    await p.waitForTimeout(600);
  }

  // ── Division / Section / Department / Shift ──
  await openAndPick('Select Division', 'Control Cable', 'Control Cable');
  await openAndPick('Select Section', 'Spiral', 'Spiral');
  await openAndPick('Select Department', 'Flattening', 'Flattening');
  await openAndPick('Select Shift', '', 'Shift 1 (Morning)');

  // parse planned hours from shift select text
  const shiftText = await p.locator('.ant-select').filter({ hasText: /planned/i }).first().textContent();
  const m = /planned ([\d.]+)h/.exec(shiftText || '');
  const plannedH = m ? parseFloat(m[1]) : 8;
  console.log('SHIFT-planned-hours:', plannedH);

  // ── Machine No. (choose a registered machine from this department) ──
  const machant = p.locator('.ant-select').filter({ hasText: /Select or type machine no\./i }).first();
  await machant.click();
  const mcin = machant.locator('input').first();
  await mcin.pressSequentially('FT-05', { delay: 25 });
  await p.waitForTimeout(1000);
  const optCount = await p.locator('.ant-select-item-option').count();
  console.log('MACHINE-dropdown-options:', optCount);
  const macOption = p.locator('.ant-select-item-option').filter({ hasText: 'FT-05 — Flattening Machine FT-05' }).first();
  await macOption.waitFor({ state: 'visible', timeout: 10000 });
  await macOption.click();
  await p.waitForTimeout(600);

  // ── Add one production item line ──
  await p.getByRole('button', { name: '+ Add Item' }).click();
  await p.waitForSelector('[data-testid="production-item-row-1"]', { timeout: 10000 });

  const itemSel = p.locator('[data-testid="production-item-row-1"] .ant-select').first();
  await itemSel.click();
  await p.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { timeout: 10000 });
  await p.keyboard.type('FLAT-WIRE-001');
  await p.waitForTimeout(500);
  await p.locator('.ant-select-item-option').filter({ hasText: 'FLAT-WIRE-001' }).first().click();
  await p.waitForTimeout(800);

  // UOM should auto-fill (KG) from item master
  const uomText = await p.locator('[data-testid="line-uom-1"]').textContent();
  console.log('LINE-UOM:', (uomText || '').replace(/\s+/g, ' ').trim());

  const qtyInput = p.locator('[data-testid="production-item-row-1"] input[aria-label="Item quantity"]').first();
  await qtyInput.fill('5');
  await p.waitForTimeout(500);

  // ── Production Figures (manual mode) ──
  const fillByLabel = async (labelReg, value) => {
    const item = p.locator('.ant-form-item').filter({ has: p.locator('label').filter({ hasText: labelReg }) }).first();
    const input = item.locator('input').first();
    await input.click();
    await input.fill(String(value));
    await p.waitForTimeout(300);
  };
  await fillByLabel(/Target Production/, 5);
  await fillByLabel(/Running Hours/, plannedH);
  await fillByLabel(/Rejection \/ Scrap/, 0);

  // ── Operator (manual) ──
  const opSel = p.locator('.ant-select').filter({ hasText: /Select HR operator or type manual name/i }).first();
  await opSel.click();
  await opSel.locator('input').first().pressSequentially('QA P35 Operator');
  await p.waitForTimeout(500);
  await p.keyboard.press('Enter');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);

  // ── Save ──
  const saveBtn = p.getByRole('button', { name: 'Save Production Entry' });
  await saveBtn.click();

  // ── Success modal assertions (wait properly for the title) ──
  const modalSel = p.locator('.ant-modal:has-text("Production Entry Saved Successfully")');
  let modalVisible = false;
  try { await modalSel.waitFor({ state: 'visible', timeout: 12000 }); modalVisible = true; } catch (e) { modalVisible = false; }
  await p.waitForTimeout(500);
  const modalText = modalVisible ? (await modalSel.textContent() || '').replace(/\s+/g, ' ') : '';
  const entryNumberMatch = /PE-\d{4}-\d{5}/.exec(modalText);
  console.log('MODAL visible:', modalVisible);
  console.log('MODAL title:', modalVisible && modalText.includes('Production Entry Saved Successfully'));
  console.log('MODAL entry-ref-label:', modalVisible && modalText.includes('ENTRY REFERENCE'));
  console.log('MODAL entry-number:', entryNumberMatch ? entryNumberMatch[0] : 'NONE');
  console.log('MODAL shift:', modalVisible && modalText.includes('Shift 1 (Morning)'));
  console.log('MODAL dept:', modalVisible && modalText.includes('Flattening'));
  console.log('MODAL item:', modalVisible && modalText.includes('FLAT-WIRE-001'));
  console.log('MODAL qty:', modalVisible && modalText.includes('Quantity5 KG'));
  console.log('MODAL status:', modalVisible && modalText.includes('Saved'));
  console.log('MODAL machine:', modalVisible && modalText.includes('FT-05'));
  console.log('MODAL buttons:', modalVisible && (modalText.includes('View Entry') && modalText.includes('Enter Another Entry') && modalText.includes('Close')));
  console.log('MODAL-TEXT:', modalVisible ? modalText.slice(0, 400) : '(none)');
  console.log('POST-ENTRY-REQUESTS:', postEntryHits.length);
  console.log('POST-RESPONSES:', JSON.stringify(postResponses));

  if (!modalVisible || !entryNumberMatch) {
    await p.waitForTimeout(1500);
    const diag = await p.evaluate(() => {
      const errs = Array.from(document.querySelectorAll('.ant-form-item-explain-error')).map((e) => e.textContent);
      const msgs = Array.from(document.querySelectorAll('.ant-message-notice')).map((e) => e.textContent);
      const alerts = Array.from(document.querySelectorAll('.ant-alert')).map((e) => e.textContent);
      const anyModal = (document.querySelector('.ant-modal')?.textContent || '').replace(/\s+/g, ' ').slice(0, 200);
      const modalOpen = [...document.querySelectorAll('.ant-modal-wrap')].filter((w) => getComputedStyle(w).display !== 'none').length;
      return { errs: errs.slice(0, 10), msgs: msgs.slice(0, 5), alerts: alerts.slice(0, 5), anyModal, modalOpen };
    });
    console.log('FORM-ERRORS:', JSON.stringify(diag));
    console.log('CONSOLE-ERRORS:', JSON.stringify(consoleErrors.slice(0, 5)));
    console.log('CONSOLE-LOGS:', JSON.stringify(consoleLogs.filter((x) => /ON_FINISH|ENTRY_SAVE|SENDING|BEFORE_API|AFTER_API|Circular/.test(x)).slice(0, 8)));
    await p.screenshot({ path: 'D:/ERP-MRP-PWI-2026/browser-qa-screenshots/p35-save-failure.png' });
    await b.close();
    process.exit(4);
  }
  await p.screenshot({ path: 'D:/ERP-MRP-PWI-2026/browser-qa-screenshots/p35-save-success-modal.png' });

  // ── View Entry → detail page shows the same entry number ──
  await p.getByRole('button', { name: 'View Entry' }).click();
  await p.waitForURL(/\/production\/entries\/[0-9a-f-]{36}/, { timeout: 15000 });
  const detailUrl = p.url();
  const entryId = /\/production\/entries\/([0-9a-f-]{36})/.exec(detailUrl)[1];
  await p.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(3000);
  const detailBody = (await p.locator('body').textContent() || '').replace(/\s+/g, ' ');
  console.log('DETAIL entryId:', entryId);
  console.log('DETAIL shows entryNumber:', detailBody.includes(entryNumberMatch[0]));
  console.log('DETAIL entry-ref-row:', detailBody.includes('Entry Reference'));
  await p.screenshot({ path: 'D:/ERP-MRP-PWI-2026/browser-qa-screenshots/p35-save-detail.png', fullPage: false });

  console.log('CONSOLE-ERRORS:', consoleErrors.length ? JSON.stringify(consoleErrors.slice(0, 5)) : 'none');
  console.log('ENTRY_ID_FOR_CLEANUP=' + entryId);
  console.log('ENTRY_NUMBER_CREATED=' + entryNumberMatch[0]);
  await b.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });