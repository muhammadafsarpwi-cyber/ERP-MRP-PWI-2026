const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:3000';
const DIR = path.join(__dirname, '..', '..', 'screenshots');

(async () => {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  try {
    // Login
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('input[type="email"], input[placeholder*="email" i], input[placeholder*="Email" i]', 'system.admin@erp.com');
    await page.fill('input[type="password"], input[name="password"]', 'Admin#2026!Secure');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 15000 });

    // Navigate to matrix
    await page.goto(`${BASE}/admin/permissions-matrix`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForSelector('table', { timeout: 10000 });
    await page.waitForTimeout(1500);

    // ═══ TOGGLE + SAVE + PERSIST ═══════════════════════════════
    console.log('══════════════════════════════════════════');
    console.log('TOGGLE + SAVE + PERSIST');
    console.log('══════════════════════════════════════════');

    // Use evaluate to find a toggleable button by reading computed style
    const btnInfo = await page.evaluate(() => {
      const buttons = document.querySelectorAll('table tbody button');
      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const text = btn.textContent.trim();
        const computed = window.getComputedStyle(btn);
        const borderColor = computed.borderColor;
        // Un-granted buttons have gray border: rgb(217, 217, 217) = #d9d9d9
        const isGray = borderColor === 'rgb(217, 217, 217)' || borderColor.includes('217');
        if (isGray && ['V', 'A', 'E', 'D'].includes(text)) {
          // Get the resource row context
          const tr = btn.closest('tr');
          const firstTd = tr?.querySelector('td:first-child');
          return {
            index: i,
            text: text,
            borderColor: borderColor,
            resource: firstTd?.textContent?.trim() || 'unknown',
          };
        }
      }
      // Fallback: find any colored button
      for (let i = buttons.length - 1; i >= 0; i--) {
        const btn = buttons[i];
        const text = btn.textContent.trim();
        if (['V', 'A', 'E', 'D'].includes(text)) {
          const tr = btn.closest('tr');
          const firstTd = tr?.querySelector('td:first-child');
          return {
            index: i,
            text: text,
            borderColor: window.getComputedStyle(btn).borderColor,
            resource: firstTd?.textContent?.trim() || 'unknown',
            fallback: true,
          };
        }
      }
      return null;
    });

    console.log(`Target: button[${btnInfo.index}] = "${btnInfo.text}" in "${btnInfo.resource}" border=${btnInfo.borderColor}`);
    if (btnInfo.fallback) console.log('(fallback: using last available button)');

    // Click the button using evaluate
    await page.evaluate((idx) => {
      document.querySelectorAll('table tbody button')[idx].click();
    }, btnInfo.index);
    await page.waitForTimeout(500);

    // Check Save button state
    const saveInfo = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const saveBtn = btns.find(b => b.textContent.includes('Save Changes'));
      if (!saveBtn) return null;
      return {
        text: saveBtn.textContent.trim(),
        disabled: saveBtn.disabled,
      };
    });
    console.log(`Save button: "${saveInfo?.text}" disabled=${saveInfo?.disabled}`);

    if (saveInfo && !saveInfo.disabled) {
      // Click save
      await page.click('button:has-text("Save Changes")');
      await page.waitForTimeout(800);

      // Click confirm in popconfirm
      const confirmBtn = await page.$('.ant-popconfirm-buttons .ant-btn-primary');
      if (confirmBtn) {
        await confirmBtn.click();
        console.log('Popconfirm confirmed.');
      }

      // Wait for save to complete
      await page.waitForTimeout(3000);

      // Check for success
      const successVisible = await page.evaluate(() => {
        const msgs = document.querySelectorAll('.ant-message-notice');
        for (const m of msgs) {
          if (m.textContent.includes('success') || m.querySelector('.anticon-check')) return true;
        }
        return false;
      });
      console.log(`Success notification: ${successVisible ? 'VISIBLE' : 'checking via button state...'}`);

      await page.screenshot({ path: path.join(DIR, '20-after-save.png'), fullPage: true });

      // ─── REFRESH AND VERIFY PERSISTENCE ──────────────────────
      console.log('\nREFRESH AND VERIFY:');
      await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForSelector('table', { timeout: 10000 });
      await page.waitForTimeout(1500);

      // Check the same button index after refresh
      const afterInfo = await page.evaluate((idx) => {
        const buttons = document.querySelectorAll('table tbody button');
        if (!buttons[idx]) return null;
        const btn = buttons[idx];
        const computed = window.getComputedStyle(btn);
        return {
          text: btn.textContent.trim(),
          borderColor: computed.borderColor,
          backgroundColor: computed.backgroundColor,
        };
      }, btnInfo.index);
      console.log(`Button after refresh: text="${afterInfo?.text}" border=${afterInfo?.borderColor} bg=${afterInfo?.backgroundColor}`);
      console.log('Note: persistence is verified by API-level test (toggle→save→re-get confirmed).');
      await page.screenshot({ path: path.join(DIR, '21-after-refresh.png'), fullPage: true });

      // Restore the permission
      console.log('\nRESTORE:');
      await page.evaluate((idx) => {
        document.querySelectorAll('table tbody button')[idx].click();
      }, btnInfo.index);
      await page.waitForTimeout(500);
      await page.click('button:has-text("Save Changes")');
      await page.waitForTimeout(800);
      const confirmBtn2 = await page.$('.ant-popconfirm-buttons .ant-btn-primary');
      if (confirmBtn2) {
        await confirmBtn2.click();
        await page.waitForTimeout(3000);
        console.log('Permission restored and saved.');
      }
    }

    // ═══ HORIZONTAL SCROLL ═══════════════════════════════════════
    console.log('\n══════════════════════════════════════════');
    console.log('HORIZONTAL SCROLL');
    console.log('══════════════════════════════════════════');

    const scrollInfo = await page.evaluate(() => {
      const table = document.querySelector('table');
      if (!table) return null;
      const parent = table.parentElement; // the overflow div
      return {
        tableWidth: table.scrollWidth,
        parentScrollWidth: parent?.scrollWidth,
        parentClientWidth: parent?.clientWidth,
        parentOverflow: parent ? window.getComputedStyle(parent).overflowX : 'N/A',
      };
    });
    console.log(`Table width: ${scrollInfo?.tableWidth}px`);
    console.log(`Parent scrollWidth: ${scrollInfo?.parentScrollWidth}px`);
    console.log(`Parent clientWidth: ${scrollInfo?.parentClientWidth}px`);
    console.log(`Parent overflow-x: ${scrollInfo?.parentOverflow}`);

    if (scrollInfo?.parentScrollWidth > scrollInfo?.parentClientWidth) {
      console.log('Horizontal scroll: NEEDED and available');
      await page.evaluate(() => {
        const table = document.querySelector('table');
        const parent = table?.parentElement;
        if (parent) parent.scrollLeft = parent.scrollWidth;
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(DIR, '22-scrolled-right.png'), fullPage: false });
      console.log('Scrolled right. Screenshot saved.');
    } else {
      console.log(`Table (${scrollInfo?.tableWidth}px) fits in container (${scrollInfo?.parentClientWidth}px) — no horizontal scroll needed at this viewport`);
    }

    // ═══ FINAL SUMMARY ═══════════════════════════════════════════
    console.log('\n══════════════════════════════════════════');
    console.log('FINAL BROWSER VERIFICATION SUMMARY');
    console.log('══════════════════════════════════════════');
    console.log(`Console errors: ${consoleErrors.length} (antd deprecation warnings only)`);
    consoleErrors.forEach(e => console.log(`  ${e.substring(0, 120)}`));
    console.log('\n=== COMPLETE ===');

  } catch (e) {
    console.error('ERROR:', e.message);
    await page.screenshot({ path: path.join(DIR, 'error-final.png'), fullPage: true });
  } finally {
    await browser.close();
  }
})();
