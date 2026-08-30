import { chromium } from 'playwright';

const FRONTEND = 'http://localhost:3000';
const SHOT = process.argv[2] || 'screenshots/dev-status-offline.png';

async function main() {
  // Expect backend to be DOWN for this capture
  try {
    const r = await fetch('http://localhost:3001/api/v1/status', { signal: AbortSignal.timeout(3000) });
    console.log('WARNING: backend responded', r.status, '- expected DOWN. Exiting.');
    process.exit(2);
  } catch (e) {
    console.log('Backend confirmed DOWN:', e.cause?.code || e.name);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  await context.addInitScript(() => {
    localStorage.setItem('token', 'dev-token');
    localStorage.setItem('erp_user', JSON.stringify({ id: 'dev', email: 'dev@erp-local.test', displayName: 'Dev', permissions: [] }));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
  });

  const page = await context.newPage();

  // Stub all authenticated API calls (backend is down anyway).
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/status')) {
      return route.continue();
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { id: 'dev', email: 'dev@erp-local.test', displayName: 'Dev', permissions: [] } }),
    });
  });

  await page.goto(`${FRONTEND}/development/status`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000); // status call times out at 8s -> catch path

  const url = page.url();
  const bodyText = await page.textContent('body');
  const tags = await page.$$eval('.ant-tag', (els) => els.map((e) => e.textContent?.trim()).filter(Boolean));

  console.log('Final URL:', url);
  console.log('Status tags:', JSON.stringify(tags));

  const expectations = ['Backend', 'NOT TESTED', 'Backend unavailable', 'Cannot reach API server', 'ERROR', 'Refresh / Recheck Status'];
  for (const c of expectations) {
    console.log(`${bodyText.includes(c) ? 'OK ' : 'MISS'} ${c}`);
  }

  const hasBackendError = tags.some((t) => t === 'ERROR');
  const notTestedCount = tags.filter((t) => t === 'NOT TESTED').length;
  console.log(`RESULT: backend ERROR=${hasBackendError}, NOT TESTED count=${notTestedCount}`);

  await page.screenshot({ path: SHOT, timeout: 30000 });
  console.log('Screenshot saved:', SHOT);

  await browser.close();
}

main().catch((e) => { console.error('SCRIPT ERROR:', e.message); process.exit(1); });