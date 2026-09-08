const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  
  const url = page.url();
  console.log('URL:', url);
  
  // Get all input elements
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(e => ({
      type: e.type, name: e.name, placeholder: e.placeholder, id: e.id
    }));
  });
  console.log('Inputs:', JSON.stringify(inputs, null, 2));
  
  // Get all buttons
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(e => ({
      text: e.textContent.trim().substring(0, 50), type: e.type
    }));
  });
  console.log('Buttons:', JSON.stringify(buttons, null, 2));
  
  // Get page HTML structure
  const html = await page.evaluate(() => {
    return document.body.innerHTML.substring(0, 5000);
  });
  console.log('Body HTML (first 5000):', html);
  
  await page.screenshot({ path: 'D:/ERP-MRP-PWI-2026/backend/login-debug.png', fullPage: true });
  await browser.close();
})();
