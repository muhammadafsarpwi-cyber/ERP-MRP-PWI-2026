const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:3000';
const CHROME = [
  'C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));
let pass = 0, fail = 0;
const expect = (c, n, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' (' + x + ')' : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const resp = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }),
  });
  const j = await resp.json();
  await p.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.evaluate(({ token, refreshToken, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('erp_user', JSON.stringify(user));
  }, j);
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.goto(BASE + '/master-data/items', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForFunction(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length > 0, { timeout: 25000 });
  await p.waitForTimeout(1500);

  const viewBtn = p.locator('.ant-table-tbody > tr.ant-table-row').first().locator('button[aria-label^="View "]').first();
  await viewBtn.scrollIntoViewIfNeeded().catch(() => {});
  await viewBtn.click({ force: true });
  await p.waitForTimeout(1200);
  await p.waitForFunction(() => {
    const body = document.querySelector('.ant-modal .ant-modal-body');
    return body && !body.textContent.includes('Loading item');
  }, { timeout: 25000 });

  const wrap = p.locator('.erp-draggable-modal');

  // 1. Default position: wrapper should be roughly centered (translate 0,0 and box near viewport center)
  const bb = await wrap.boundingBox();
  const vw = 1600, vh = 1000;
  const centerX = bb.x + bb.width / 2, centerY = bb.y + bb.height / 2;
  expect(Math.abs(centerX - vw / 2) < 90, `modal opens roughly horizontally centered (centerX=${centerX.toFixed(0)})`);
  expect(Math.abs(centerY - vh / 2) < 60, `modal opens roughly vertically centered (centerY=${centerY.toFixed(0)})`);

  // 2. Drag by header: translate should change
  const header = wrap.locator('.ant-modal-header');
  const bx0 = await wrap.boundingBox();
  await p.mouse.move(bx0.x + bx0.width / 2, bx0.y + 20);
  await p.mouse.down();
  await p.mouse.move(bx0.x + bx0.width / 2 + 220, bx0.y + 20 + 140, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(400);
  const bb2 = await wrap.boundingBox();
  const moved = Math.abs(bb2.x - bx0.x) > 120 && Math.abs(bb2.y - bx0.y) > 80;
  expect(moved, `dragging header moves modal (dx=${(bb2.x - bx0.x).toFixed(0)}, dy=${(bb2.y - bx0.y).toFixed(0)})`);

  // 3. Modal stays on-screen after drag
  expect(bb2.x >= -bb2.width + 72 && bb2.x <= vw - 72, 'modal X stays within viewport after drag');
  expect(bb2.y >= -bb2.height + 72 && bb2.y <= vh - 72, 'modal Y stays within viewport after drag');

  // 4. Resize from bottom-right handle: size should increase
  const handle = wrap.locator('.erp-draggable-modal-resize-handle');
  const hb = await handle.boundingBox();
  await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await p.mouse.down();
  await p.mouse.move(hb.x + 160, hb.y + 120, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(400);
  const bb3 = await wrap.boundingBox();
  expect(bb3.width > bx0.width + 120 && bb3.height > bx0.height + 90,
    `resize handle grows modal (w ${bx0.width.toFixed(0)}->${bb3.width.toFixed(0)}, h ${bx0.height.toFixed(0)}->${bb3.height.toFixed(0)})`);

  // 5. Resize cannot exceed viewport
  expect(bb3.width <= vw - 24 && bb3.height <= vh - 24, 'resized modal stays within viewport');

  // 6. Dragging from the footer/close area must NOT move the modal (interactive exclusion)
  const before4 = await wrap.boundingBox();
  const footerBtn = wrap.locator('.ant-modal-footer button').first();
  const fb = await footerBtn.boundingBox();
  await p.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
  await p.mouse.down();
  await p.mouse.move(fb.x + 150, fb.y + 150, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  const after4 = await wrap.boundingBox();
  expect(Math.abs(after4.x - before4.x) < 8 && Math.abs(after4.y - before4.y) < 8,
    'dragging the footer button does not move the modal');

  await b.close();
  console.log('\n==== SUMMARY ====');
  console.log(`PASS: ${pass}  FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('AUDIT ERROR: ' + (e && e.stack ? e.stack : String(e))); process.exit(2); });