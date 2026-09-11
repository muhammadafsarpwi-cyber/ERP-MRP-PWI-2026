const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:3000';
const CHROME = ['C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  const networkErrors = [];
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  p.on('response', (r) => { if (r.status() >= 500 || r.status() === 0) networkErrors.push(`${r.status()} ${r.url().slice(0, 120)}`); });

  const lr = await fetch('http://localhost:3001/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) });
  const j = await lr.json();
  await p.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.evaluate(({ token, refreshToken, user }) => { localStorage.setItem('token', token); localStorage.setItem('refresh_token', refreshToken); localStorage.setItem('erp_user', JSON.stringify(user)); }, j);
  await p.goto(BASE + '/master-data/items', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForFunction(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length > 0, { timeout: 40000 });
  await p.waitForTimeout(1500);

  // Search for FLAT-WIRE-001
  const search = p.locator('input[placeholder*="Search by code"]').first();
  await search.fill('FLAT-WIRE-001');
  await p.waitForTimeout(1200);
  await p.waitForFunction(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length >= 1, { timeout: 20000 });

  // Open detail modal
  await p.locator('.ant-table-tbody > tr.ant-table-row').first().locator('button[aria-label^="View "]').first().click({ force: true });
  await p.waitForSelector('.ant-modal-wrap .erp-draggable-modal', { timeout: 15000 });
  await p.waitForTimeout(2500);

  const modalInfo = await p.evaluate(() => {
    const modal = document.querySelector('.ant-modal');
    const wrap = document.querySelector('.erp-draggable-modal');
    const rect = wrap ? wrap.getBoundingClientRect() : null;
    const vw = window.innerWidth, vh = window.innerHeight;
    const header = modal ? (modal.textContent || '').slice(0, 150) : '';
    return {
      modalVisible: !!wrap,
      width: rect ? Math.round(rect.width) : 0,
      centeredX: rect ? Math.abs((rect.left + rect.width / 2) - vw / 2) < 60 : false,
      insideViewport: rect ? (rect.top >= -10 && rect.left >= -10 && rect.right <= vw + 10 && rect.bottom <= vh + 10) : false,
      headerText: header.replace(/\s+/g, ' '),
    };
  });
  console.log('MODAL:', JSON.stringify(modalInfo));

  // Category display check (overview tab)
  const catText = await p.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.ant-modal .ant-descriptions-item'));
    const cat = items.find((el) => el.textContent && el.textContent.startsWith('Category'));
    return cat ? cat.textContent.replace(/\s+/g, ' ').trim() : 'CATEGORY ROW NOT FOUND';
  });
  console.log('CATEGORY-ROW:', catText);

  // Organization tab
  await p.locator('.ant-modal .ant-tabs-tab').filter({ hasText: 'Organization' }).first().click();
  await p.waitForTimeout(600);
  const orgText = await p.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.ant-modal .ant-descriptions-item'));
    const pick = (label) => { const el = items.find((e) => e.textContent && e.textContent.startsWith(label)); return el ? el.textContent.replace(/\s+/g, ' ').trim() : '(missing)'; };
    return { company: pick('Company'), division: pick('Division'), section: pick('Section'), department: pick('Department') };
  });
  console.log('ORG-TAB:', JSON.stringify(orgText));

  // Inventory & Control tab
  await p.locator('.ant-modal .ant-tabs-tab').filter({ hasText: 'Inventory & Control' }).first().click();
  await p.waitForTimeout(600);
  const invText = await p.evaluate(() => {
    const tags = Array.from(document.querySelectorAll('.ant-modal .ant-tag')).map((t) => t.textContent.trim());
    return tags;
  });
  console.log('INVENTORY-TAGS:', JSON.stringify(invText.slice(0, 12)));

  // Pricing tab
  await p.locator('.ant-modal .ant-tabs-tab').filter({ hasText: 'Pricing' }).first().click();
  await p.waitForTimeout(600);
  const priceText = await p.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.ant-modal .ant-descriptions-item'));
    const pick = (label) => { const el = items.find((e) => e.textContent && e.textContent.startsWith(label)); return el ? el.textContent.replace(/\s+/g, ' ').trim() : '(missing)'; };
    return { cost: pick('Cost Price'), sell: pick('Selling Price') };
  });
  console.log('PRICING-TAB:', JSON.stringify(priceText));

  // Production Route tab - six stage flow
  await p.locator('.ant-modal .ant-tabs-tab').filter({ hasText: 'Production Route' }).first().click();
  await p.waitForTimeout(2500);
  const flowInfo = await p.evaluate(() => {
    const stageEls = Array.from(document.querySelectorAll('.ant-modal div')).filter((d) => d.textContent && /^0\d$/.test((d.querySelector('span') || {}).textContent || '') && d.style.minWidth);
    const body = document.querySelector('.ant-modal .ant-modal-body');
    const bodyText = body ? body.textContent.replace(/\s+/g, ' ') : '';
    const hasRawMaterial = bodyText.includes('RAW MATERIAL');
    const hasFlattening = /WIRE FLATTENING/.test(bodyText);
    const hasSpiral = /SPIRAL WINDING/.test(bodyText);
    const has12 = bodyText.includes('1.20');
    const has04x26 = bodyText.includes('0.40') && bodyText.includes('2.60');
    const has375 = bodyText.includes('3.75');
    return { hasRawMaterial, hasFlattening, hasSpiral, has12, has04x26, has375, snippet: bodyText.slice(0, 700) };
  });
  console.log('FLOW:', JSON.stringify({ raw: flowInfo.hasRawMaterial, flat: flowInfo.hasFlattening, spiral: flowInfo.hasSpiral, size12: flowInfo.has12, flatSize: flowInfo.has04x26, spiralSize: flowInfo.has375 }));
  console.log('FLOW-SNIPPET:', flowInfo.snippet);

  // Drag the modal
  const wrap = await p.locator('.erp-draggable-modal-wrap .ant-modal-header').first().boundingBox();
  if (wrap) {
    const before = await p.locator('.erp-draggable-modal').first().boundingBox();
    await p.mouse.move(wrap.x + wrap.width * 0.3, wrap.y + 14);
    await p.mouse.down();
    await p.mouse.move(wrap.x + wrap.width * 0.3 + 120, wrap.y + 14 + 80, { steps: 8 });
    await p.mouse.up();
    const after = await p.locator('.erp-draggable-modal').first().boundingBox();
    console.log('DRAG: dx=' + (Math.round(after.x - before.x)) + ' dy=' + (Math.round(after.y - before.y)));
    const vw = 1600, vh = 1000;
    console.log('DRAG-IN-VIEWPORT:', after.top >= -10 && after.left >= -10 && after.right <= vw + 10 && after.bottom <= vh + 10);
  }

  // Resize via bottom-right handle
  const handle = await p.locator('.erp-draggable-modal-resize-handle').first().boundingBox();
  if (handle) {
    const before = await p.locator('.erp-draggable-modal').first().boundingBox();
    await p.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await p.mouse.down();
    await p.mouse.move(handle.x + handle.width / 2 - 150, handle.y + handle.height / 2 - 100, { steps: 6 });
    await p.mouse.up();
    const after = await p.locator('.erp-draggable-modal').first().boundingBox();
    console.log('RESIZE: dw=' + (Math.round(after.width - before.width)) + ' dh=' + (Math.round(after.height - before.height)));
  }

  // Internal scrolling: body must be scrollable
  const scrollInfo = await p.evaluate(() => {
    const body = document.querySelector('.erp-draggable-modal .ant-modal-body');
    return body ? { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollable: body.scrollHeight > body.clientHeight } : null;
  });
  console.log('SCROLL:', JSON.stringify(scrollInfo));

  // Close modal, check search still working and table renders
  await p.locator('.ant-modal-footer button').filter({ hasText: 'Close' }).first().click({ force: true });
  await p.waitForTimeout(800);
  await search.fill('');
  await p.waitForTimeout(1200);
  const rowCount = await p.locator('.ant-table-tbody > tr.ant-table-row').count();
  console.log('LIST-ROWS-AFTER-CLOSE:', rowCount);

  // Loading bar: must be invisible when idle
  const barInfo = await p.evaluate(() => {
    const bar = document.querySelector('.erp-gradient-loading-bar');
    return bar ? { visible: bar.classList.contains('is-visible') } : { visible: 'no-bar' };
  });
  console.log('LOADING-BAR-IDLE-VISIBLE:', JSON.stringify(barInfo));

  await p.screenshot({ path: 'D:/ERP-MRP-PWI-2026/browser-qa-screenshots/p34-verify-final.png', fullPage: false });
  console.log('CONSOLE-ERRORS:', consoleErrors.length ? JSON.stringify(consoleErrors.slice(0, 5)) : 'none');
  console.log('NETWORK-ERRORS:', networkErrors.length ? JSON.stringify(networkErrors.slice(0, 5)) : 'none');
  await b.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
