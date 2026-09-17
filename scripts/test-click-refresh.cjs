const { chromium } = require('playwright');
const fs = require('fs');

async function test() {
  const auth = JSON.parse(fs.readFileSync('scripts/test-token.json'));
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  p.on('request', req => {
    console.log('REQ:', req.method(), req.url());
  });
  p.on('response', r => {
    console.log('RESP:', r.status(), r.url());
  });
  p.on('requestfailed', req => {
    console.log('REQ FAILED:', req.url(), req.failure());
  });
  p.on('console', m => console.log('BROWSER LOG:', m.type(), m.text()));

  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await p.evaluate(a => {
    localStorage.clear();
    localStorage.setItem('token', a.token);
    localStorage.setItem('access_token', a.token);
    localStorage.setItem('erp_user', JSON.stringify(a.user));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
  }, auth);

  await p.goto('http://localhost:3000/production/routings', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);

  console.log('1. Checking initial rows...');
  console.log('Initial rows:', await p.locator('.ant-table-row').count());

  console.log('2. Clicking Refresh button...');
  const btn = p.locator('button:has-text("Refresh")');
  await btn.click();
  await p.waitForTimeout(4000);

  console.log('Rows after Refresh click:', await p.locator('.ant-table-row').count());
  await b.close();
}

test().catch(console.error);
