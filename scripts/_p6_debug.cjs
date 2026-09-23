const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  p.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text().slice(0, 300)); });
  p.on('pageerror', (e) => console.log('PAGE EXCEPTION:', String(e).slice(0, 500)));

  await p.addInitScript(() => sessionStorage.setItem('pwi_welcome_passed', 'true'));
  await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await p.fill('input#login_email', 'system.admin@erp.com');
  await p.fill('input#login_password', 'Admin#2026!Secure');
  await p.click('button[type="submit"]');
  await p.waitForURL(/dashboard/, { timeout: 30000 });
  console.log('logged in');

  await p.goto('http://localhost:3000/organization/locations', { waitUntil: 'networkidle' });
  await p.waitForSelector('tr:has(td:text-is("CCD-C01"))', { timeout: 20000 });
  console.log('table loaded');

  await p.locator('tr:has(td:text-is("CCD-C01")) button[title="Edit Location"]').click();
  await p.waitForTimeout(3000);

  const dump = await p.evaluate(() => ({
    wraps: Array.from(document.querySelectorAll('.ant-modal-wrap')).map((e) => ({
      cls: e.className,
      display: getComputedStyle(e).display,
      title: e.querySelector('.ant-modal-title')?.textContent,
    })),
    modals: Array.from(document.querySelectorAll('.ant-modal')).map((e) => ({
      title: e.querySelector('.ant-modal-title')?.textContent,
      cls: e.className,
    })),
    formItems: Array.from(document.querySelectorAll('.ant-form-item')).map((fi) => ({
      label: fi.querySelector('label')?.textContent,
      selItem: fi.querySelector('.ant-select-selection-item')?.textContent || null,
      selPlaceholder: fi.querySelector('.ant-select-selection-placeholder')?.textContent || null,
      inputValue: fi.querySelector('input:not([type=hidden])')?.value ?? null,
      textarea: fi.querySelector('textarea')?.value ?? null,
    })),
  }));
  console.log(JSON.stringify(dump, null, 2));

  await p.screenshot({ path: 'browser-qa-screenshots/p6-debug-edit.png' });
  await b.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
