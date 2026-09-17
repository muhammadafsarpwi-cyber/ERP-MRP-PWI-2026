// @ts-check
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 30000 });
  const emailInput = page.locator('input[type="email"], input#email, input[placeholder*="email" i]').first();
  if (await emailInput.isVisible()) {
    await emailInput.fill('system.admin@erp.com');
    const pwdInput = page.locator('input[type="password"]').first();
    await pwdInput.fill('Admin#2026!Secure');
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")').first();
    await submitBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  }

  await page.waitForSelector('.erp-desktop-sider', { timeout: 15000 });
  await page.goto('http://localhost:3000/production/routings', { waitUntil: 'networkidle', timeout: 20000 });

  // 1. Check Breadcrumb text
  const bcText = await page.locator('.ant-breadcrumb').innerText();
  console.log('Breadcrumb text:', bcText.replace(/\n/g, ' / '));

  // 2. Check sidebar scrolling
  const scrollable = page.locator('.erp-sidebar-menu-scrollable');
  const initialScrollTop = await scrollable.evaluate((el) => el.scrollTop);
  await scrollable.evaluate((el) => { el.scrollTop = 300; });
  await page.waitForTimeout(200);
  const scrolledScrollTop = await scrollable.evaluate((el) => el.scrollTop);
  console.log(`Sidebar scroll test: initial=${initialScrollTop}, afterScroll=${scrolledScrollTop}`);

  // 3. Take screenshot
  await page.screenshot({ path: 'D:\\ERP-MRP-PWI-2026\\docs\\evidence\\sidebar_and_routing_nav.png' });
  console.log('Screenshot saved to docs/evidence/sidebar_and_routing_nav.png');

  await browser.close();
}
main().catch(console.error);
