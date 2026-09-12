// @ts-check
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://127.0.0.1:3000';
const API = 'http://127.0.0.1:3001/api/v1';

let results = [];
const PASS = (n) => { results.push({ n, s: 'PASS' }); console.log(`  [PASS] ${n}`); };
const FAIL = (n, r) => { results.push({ n, s: 'FAIL', r }); console.log(`  [FAIL] ${n} - ${r}`); };
const INFO = (n, d) => { results.push({ n, s: 'INFO', d }); console.log(`  [INFO] ${n} - ${d}`); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('\n========================================');
  console.log('  TARGET VIEW LAYOUT VERIFICATION');
  console.log('========================================\n');

  // Login
  try {
    const lr = await page.request.post(API + '/auth/login', { data: { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' } });
    const ld = await lr.json();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(({ token, user }) => { localStorage.setItem('token', token); localStorage.setItem('erp_user', JSON.stringify(user)); }, { token: ld.token, user: ld.user });
    PASS('Login');
  } catch (e) { FAIL('Login', e.message); await browser.close(); return; }

  await page.goto(BASE + '/production/targets', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('table tbody tr.ant-table-row', { timeout: 15000 });
  await page.waitForTimeout(2000);
  PASS('Navigation');

  // Open View modal
  const viewBtn = await page.$('table tbody tr.ant-table-row td:last-child button:first-child');
  if (viewBtn) { await viewBtn.click(); await page.waitForTimeout(2000); }

  // 1. Check field direction (should be column = label above value)
  console.log('\n--- FIELD DIRECTION ---');
  const fieldDir = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) { if (getComputedStyle(w).display !== 'none') { modal = w; break; } }
    if (!modal) return null;
    const fields = modal.querySelectorAll('.tv-field');
    return Array.from(fields).map(f => ({
      label: f.querySelector('.tv-field-label')?.textContent,
      direction: getComputedStyle(f).flexDirection,
    }));
  });
  if (fieldDir) {
    const allColumn = fieldDir.every(f => f.direction === 'column');
    if (allColumn) PASS('All fields use flex-direction: column (label above value)');
    else FAIL('Field direction', fieldDir.filter(f => f.direction !== 'column').map(f => `${f.label}: ${f.direction}`).join(', '));
  }

  // 2. Check two-column grid
  console.log('\n--- GRID LAYOUT ---');
  const gridInfo = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) { if (getComputedStyle(w).display !== 'none') { modal = w; break; } }
    if (!modal) return null;
    const container = modal.querySelector('.tv-fields');
    if (!container) return null;
    const cs = getComputedStyle(container);
    const fields = container.querySelectorAll('.tv-field');
    const positions = Array.from(fields).map(f => ({
      label: f.querySelector('.tv-field-label')?.textContent,
      x: Math.round(f.getBoundingClientRect().x),
      y: Math.round(f.getBoundingClientRect().y),
    }));
    const rows = {};
    for (const p of positions) {
      const key = p.y;
      if (!rows[key]) rows[key] = [];
      rows[key].push(p.label);
    }
    return {
      gridTemplateColumns: cs.gridTemplateColumns,
      columnGap: cs.columnGap,
      fieldCount: fields.length,
      rows: Object.values(rows),
    };
  });
  if (gridInfo) {
    const isTwoCol = gridInfo.rows.every(r => r.length === 2);
    if (isTwoCol) PASS('Two-column grid layout');
    else FAIL('Grid layout', JSON.stringify(gridInfo.rows));
    INFO('Grid columns', gridInfo.gridTemplateColumns);
    INFO('Column gap', gridInfo.columnGap);
  }

  // 3. Check label/value vertical alignment within each column
  console.log('\n--- ALIGNMENT ---');
  const alignment = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) { if (getComputedStyle(w).display !== 'none') { modal = w; break; } }
    if (!modal) return null;
    const container = modal.querySelector('.tv-fields');
    if (!container) return null;
    const fields = container.querySelectorAll('.tv-field');
    const data = Array.from(fields).map(f => {
      const label = f.querySelector('.tv-field-label');
      const value = f.querySelector('.tv-field-value');
      const lr = label?.getBoundingClientRect();
      const vr = value?.getBoundingClientRect();
      return {
        labelText: label?.textContent,
        x: lr ? Math.round(lr.x) : 0,
        labelTop: lr ? Math.round(lr.y) : 0,
        valueTop: vr ? Math.round(vr.y) : 0,
        valueX: vr ? Math.round(vr.x) : 0,
      };
    });
    // Group by approximate x position to find left/right columns
    const leftCol = data.filter(d => d.x < 900);
    const rightCol = data.filter(d => d.x >= 900);
    const leftAligned = leftCol.length > 0 && leftCol.every(d => d.x === leftCol[0].x);
    const rightAligned = rightCol.length > 0 && rightCol.every(d => d.x === rightCol[0].x);
    return { leftAligned, rightAligned, leftCount: leftCol.length, rightCount: rightCol.length, data };
  });
  if (alignment) {
    if (alignment.leftAligned) PASS('Left column labels aligned');
    else INFO('Left column alignment', 'Labels may not be perfectly aligned');
    if (alignment.rightAligned) PASS('Right column labels aligned');
    else INFO('Right column alignment', 'Labels may not be perfectly aligned');
    INFO('Column distribution', `Left: ${alignment.leftCount}, Right: ${alignment.rightCount}`);
  }

  // 4. Check field values
  console.log('\n--- FIELD VALUES ---');
  const fieldValues = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) { if (getComputedStyle(w).display !== 'none') { modal = w; break; } }
    if (!modal) return [];
    const fields = modal.querySelectorAll('.tv-fields .tv-field');
    return Array.from(fields).map(f => ({
      label: f.querySelector('.tv-field-label')?.textContent,
      value: f.querySelector('.tv-field-value')?.textContent?.trim(),
    }));
  });
  fieldValues.forEach(f => console.log(`    ${f.label}: ${f.value}`));

  const machineField = fieldValues.find(f => f.label?.includes('Machine'));
  if (machineField && machineField.value?.includes('MCH')) PASS('Machine ID/Code displays MCH###');
  else INFO('Machine ID/Code', machineField?.value);

  const itemField = fieldValues.find(f => f.label === 'Item');
  if (itemField && itemField.value?.includes('·')) PASS('Item shows code · name format');
  else INFO('Item field', itemField?.value);

  // 5. Check label visual style (lighter/smaller than value)
  console.log('\n--- LABEL STYLE ---');
  const labelStyle = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) { if (getComputedStyle(w).display !== 'none') { modal = w; break; } }
    if (!modal) return null;
    const label = modal.querySelector('.tv-field-label');
    const value = modal.querySelector('.tv-field-value');
    if (!label || !value) return null;
    const ls = getComputedStyle(label);
    const vs = getComputedStyle(value);
    return {
      labelSize: parseFloat(ls.fontSize),
      valueSize: parseFloat(vs.fontSize),
      labelWeight: ls.fontWeight,
      valueWeight: vs.fontWeight,
      labelColor: ls.color,
      valueColor: vs.color,
    };
  });
  if (labelStyle) {
    if (labelStyle.labelSize < labelStyle.valueSize) PASS('Label smaller than value');
    else INFO('Label size', `${labelStyle.labelSize}px vs value ${labelStyle.valueSize}px`);
    if (parseInt(labelStyle.labelWeight) <= parseInt(labelStyle.valueWeight)) PASS('Label weight appropriate');
    else INFO('Label weight', `${labelStyle.labelWeight} vs value ${labelStyle.valueWeight}`);
  }

  // 6. Check responsive
  console.log('\n--- RESPONSIVE ---');
  await page.setViewportSize({ width: 500, height: 800 });
  await page.waitForTimeout(500);
  const mobileGrid = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) { if (getComputedStyle(w).display !== 'none') { modal = w; break; } }
    if (!modal) return null;
    const container = modal.querySelector('.tv-fields');
    if (!container) return null;
    return { gridTemplateColumns: getComputedStyle(container).gridTemplateColumns };
  });
  if (mobileGrid?.gridTemplateColumns === '1fr') PASS('Mobile: single column');
  else INFO('Mobile grid', mobileGrid?.gridTemplateColumns);
  await page.setViewportSize({ width: 1920, height: 1080 });

  // 7. Check no overflow
  console.log('\n--- OVERFLOW ---');
  const overflow = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.ant-modal-wrap');
    let modal = null;
    for (const w of wraps) { if (getComputedStyle(w).display !== 'none') { modal = w; break; } }
    if (!modal) return null;
    const body = modal.querySelector('.ant-modal-body');
    if (!body) return null;
    return { hasHorizontalScroll: body.scrollWidth > body.clientWidth + 2 };
  });
  if (overflow && !overflow.hasHorizontalScroll) PASS('No horizontal overflow');
  else INFO('Overflow', JSON.stringify(overflow));

  // Screenshot
  await page.screenshot({ path: 'C:/Users/afsar/AppData/Local/Temp/opencode/target-view-final.png', fullPage: false });

  await browser.close();

  console.log('\n========================================');
  console.log('  SUMMARY');
  console.log('========================================');
  const p = results.filter(r => r.s === 'PASS').length;
  const f = results.filter(r => r.s === 'FAIL').length;
  const i = results.filter(r => r.s === 'INFO').length;
  console.log(`  PASS: ${p}  FAIL: ${f}  INFO: ${i}`);
  console.log('========================================\n');
  if (f > 0) { results.filter(r => r.s === 'FAIL').forEach(r => console.log(`  - ${r.n}: ${r.r}`)); }
  fs.writeFileSync('C:/Users/afsar/AppData/Local/Temp/opencode/target-view-final.json', JSON.stringify(results, null, 2));
})();
