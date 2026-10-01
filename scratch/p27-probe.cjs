const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('erp_user', JSON.stringify({ id: 'a', displayName: 'A', permissions: ['admin.users.view', 'admin.users.create', 'admin.users.update', 'admin.users.assign_roles', 'admin.users.manage_scope', 'admin.users.deactivate', 'admin.users.activate'] }));
    localStorage.setItem('erp_permissions_ts', String(Date.now()));
    localStorage.setItem('pwi_erp_workspace_tabs_v1', JSON.stringify({ state: { tabs: [
      { id: '/dashboard', route: '/dashboard', pathname: '/dashboard', title: 'D', closable: false, timestamp: 0 },
      { id: '/admin/users', route: '/admin/users', pathname: '/admin/users', title: 'Users', closable: true, timestamp: 1 },
    ], activeTabId: '/admin/users' }, version: 0 }));
  });
  await page.route('**/api/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, success: true }) }));
  const U = [{ id: 'u1', displayName: 'Junaid Ahmed', username: 'junaid', email: 'j@pwi.com', phone: '1', employeeId: 'E1', status: 'ACTIVE', defaultCompany: { tradeName: 'C' }, userRoles: [], organizationScopes: [], createdAt: '2026-09-10T10:00:00Z', lastLoginAt: null }];
  await page.route('**/api/v1/admin/users**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: U, total: 1 }) }));
  await page.route('**/api/v1/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'a', permissions: ['admin.users.view', 'admin.users.create', 'admin.users.update', 'admin.users.assign_roles', 'admin.users.manage_scope', 'admin.users.deactivate', 'admin.users.activate'] } }) }));
  await page.goto('http://localhost:3000/admin/users', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length > 0, null, { timeout: 90000 });
  await page.waitForTimeout(800);

  const out = await page.evaluate(() => {
    const cs = (el) => { const s = getComputedStyle(el); return { w: s.width, h: s.height, pad: s.padding, box: s.boxSizing, minW: s.minWidth, pos: s.position, right: s.right }; };
    const btn = document.querySelector('.um-action-btn');
    const rules = [];
    for (const sh of document.styleSheets) {
      let rs; try { rs = sh.rules; } catch (e) { continue; }
      for (const r of rs) {
        if (r.selectorText && r.selectorText.includes('um-action-btn') && r.style.width) rules.push(r.selectorText + ' {width:' + r.style.width + '}');
      }
    }
    const scroller = document.querySelector('.user-management-container .ant-table-content');
    const table = document.querySelector('.user-management-container .ant-table');
    const fixCell = document.querySelector('tr.ant-table-row td.ant-table-cell-fix-right');
    const sr = scroller.getBoundingClientRect();
    scroller.scrollLeft = scroller.scrollWidth;
    const fr = fixCell.getBoundingClientRect();
    return {
      btnCSS: cs(btn), btnRules: rules,
      scroller: { clientW: scroller.clientWidth, scrollW: scroller.scrollWidth, rectR: Math.round(sr.right), csOverflowX: getComputedStyle(scroller).overflowX },
      tableW: table.offsetWidth,
      fixInlineRight: fixCell.style.right, fixCSS: cs(fixCell),
      fixOffsetLeft: fixCell.offsetLeft, fixOffsetW: fixCell.offsetWidth,
      gap: Math.round(sr.right - fr.right),
      afterShadow: getComputedStyle(fixCell, '::after').boxShadow,
    };
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
