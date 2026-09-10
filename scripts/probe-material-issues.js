const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:3000';

(async () => {
  let browser;
  try { browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true }); }
  catch (e) { browser = await chromium.launch({ headless: true }); }
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const log = [];
  page.on('console', m => log.push('CONSOLE ' + m.type() + ': ' + m.text().slice(0, 300)));
  page.on('pageerror', e => log.push('PAGEERR: ' + String(e).slice(0, 300)));
  page.on('requestfailed', r => log.push('REQFAIL: ' + r.url().slice(0, 200) + ' ' + (r.failure() ? r.failure().errorText : '')));
  page.on('request', r => { if (r.url().includes('3001')) log.push('REQ: ' + r.method() + ' ' + r.url().replace('http://localhost:3001/api/v1', '')); });

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input#email, input[autocomplete="username"]', 'dev@erp-local.test');
  await page.fill('input[autocomplete="current-password"]', 'Dev#2026Test');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20000 });

  console.log('navigating to /store/material-issues...');
  let done = false;
  const hardTimeout = setTimeout(() => { if (!done) { done = true; console.log('>>> HARD TIMEOUT after 45s'); } }, 45000);
  try {
    const resp = await page.goto(BASE + '/store/material-issues', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('goto resolved, status=' + (resp ? resp.status() : 'null'));
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    console.log('body text len=' + body.length + ' preview=' + body.slice(0, 400).replace(/\n/g, ' | '));
  } catch (e) {
    console.log('goto/wait threw: ' + String(e).slice(0, 500));
  } finally {
    clearTimeout(hardTimeout);
  }
  done = true;
  console.log('URL now: ' + page.url());
  console.log('\n-- events --');
  log.forEach(l => console.log(l));
  await browser.close();
})();