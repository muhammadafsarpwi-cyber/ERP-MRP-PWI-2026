import { chromium } from 'playwright';

const FRONTEND = 'http://localhost:3000';

async function main() {
  try {
    const statusResp = await fetch('http://localhost:3001/api/v1/status');
    console.log('Backend status:', JSON.stringify(await statusResp.json()));
  } catch (e) {
    console.log('Backend probe failed:', e.message);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  await context.addInitScript(() => {
    localStorage.setItem('token', 'dev-token');
    localStorage.setItem('erp_user', JSON.stringify({ id: 'dev', email: 'dev@erp-local.test', displayName: 'Dev', permissions: [] }));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
  });

  const page = await context.newPage();

  // Stub ALL authenticated API calls except /status (which is public and must be real).
  // Without this, the fake token triggers 401 redirects from api.ts interceptor -> /login.
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
  await page.waitForTimeout(5000);

  const url = page.url();
  console.log('Final URL:', url);

  // Text assertions BEFORE screenshot to avoid context-destroyed issues
  const bodyText = await page.textContent('body');
  const tags = await page.$$eval('.ant-tag', (els) => els.map((e) => e.textContent?.trim()).filter(Boolean));

  console.log('Status tags:', JSON.stringify(tags));

  const checks = ['CONNECTED', 'Frontend', 'Backend', 'Supabase', 'Database', 'Refresh / Recheck Status', 'Last checked'];
  for (const c of checks) {
    console.log(`${bodyText.includes(c) ? 'OK ' : 'MISS'} ${c}`);
  }

  if (url.includes('/login')) {
    console.log('RESULT: Redirected to login (ProtectedRoute) - page requires valid auth');
  } else if (bodyText.includes('Backend unavailable')) {
    console.log('RESULT: Backend reported as unavailable');
  } else if (tags.every((t) => t === 'CONNECTED')) {
    console.log('RESULT: ALL STATUSES CONNECTED');
  } else {
    console.log('RESULT: Mixed statuses -> ' + JSON.stringify(tags));
  }

  await page.screenshot({ path: 'screenshots/dev-status-all-connected.png', timeout: 30000 });
  console.log('Screenshot saved: screenshots/dev-status-all-connected.png');
}

main().catch((e) => { console.error('SCRIPT ERROR:', e.message); process.exit(1); });