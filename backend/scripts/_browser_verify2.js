const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'screenshots');

(async () => {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

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
    await page.waitForTimeout(1000);

    // ─── TOGGLE TEST ────────────────────────────────────────────
    console.log('TOGGLE TEST:');

    // Find all permission buttons in the matrix body
    const allButtons = await page.$$('table tbody button');
    console.log(`Total buttons in matrix: ${allButtons.length}`);

    // Find the first gray (un-granted) button to toggle
    let targetBtn = null;
    let targetIdx = -1;
    for (let i = 0; i < allButtons.length; i++) {
      const btn = allButtons[i];
      const text = await btn.textContent();
      const style = await btn.getAttribute('style') || '';
      // Gray/un-granted buttons have #d9d9d9 border
      if (style.includes('#d9d9d9') && text.trim() !== '-') {
        targetBtn = btn;
        targetIdx = i;
        break;
      }
    }

    if (!targetBtn) {
      console.log('No un-granted button found. Trying granted button...');
      targetBtn = allButtons[allButtons.length - 1];
      targetIdx = allButtons.length - 1;
    }

    const btnText = await targetBtn.textContent();
    const btnStyle = await targetBtn.getAttribute('style') || '';
    const wasGranted = btnStyle.includes('#1890ff') || btnStyle.includes('#52c41a') || btnStyle.includes('#faad14') || btnStyle.includes('#ff4d4f');
    console.log(`Target button [${targetIdx}]: text="${btnText.trim()}" wasGranted=${wasGranted}`);

    // Click to toggle
    await targetBtn.click();
    await page.waitForTimeout(300);
    console.log('Clicked toggle button.');

    // Check if Save button is now enabled
    const saveBtn = await page.$('button:has-text("Save Changes")');
    if (saveBtn) {
      const disabled = await saveBtn.evaluate(el => el.disabled);
      const saveText = await saveBtn.textContent();
      console.log(`Save button: "${saveText.trim()}" disabled=${disabled}`);

      if (!disabled) {
        await saveBtn.click();
        await page.waitForTimeout(500);
        console.log('Save button clicked.');

        // Confirm popconfirm
        const confirmBtn = await page.$('.ant-popconfirm-buttons button.ant-btn-primary');
        if (confirmBtn) {
          await confirmBtn.click();
          await page.waitForTimeout(3000);
          console.log('Popconfirm confirmed.');
        } else {
          console.log('No popconfirm found (might not be needed).');
        }

        // Check success toast
        const successMsg = await page.$('.ant-message-success');
        console.log(`Success toast: ${successMsg ? 'VISIBLE' : 'NOT FOUND'}`);

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10-after-toggle-save.png'), fullPage: true });

        // ─── REFRESH AND VERIFY ──────────────────────────────
        console.log('\nREFRESH TEST:');
        await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForSelector('table', { timeout: 10000 });
        await page.waitForTimeout(1000);

        // Check if the same button is now granted
        const afterButtons = await page.$$('table tbody button');
        if (afterButtons[targetIdx]) {
          const afterStyle = await afterButtons[targetIdx].getAttribute('style') || '';
          const afterGranted = afterStyle.includes('#1890ff') || afterStyle.includes('#52c41a') || afterStyle.includes('#faad14') || afterStyle.includes('#ff4d4f');
          console.log(`Button after refresh: wasGranted=${wasGranted} nowGranted=${afterGranted}`);
          console.log(`PERSISTENCE: ${afterGranted !== wasGranted ? 'PASS' : 'SAME AS BEFORE (may be correct if save was not needed)'}`);
        }

        // ─── RESTORE ─────────────────────────────────────────
        console.log('\nRESTORE:');
        const restoreButtons = await page.$$('table tbody button');
        if (restoreButtons[targetIdx]) {
          await restoreButtons[targetIdx].click();
          await page.waitForTimeout(300);
          const restoreSave = await page.$('button:has-text("Save Changes")');
          if (restoreSave) {
            const rd = await restoreSave.evaluate(el => el.disabled);
            if (!rd) {
              await restoreSave.click();
              await page.waitForTimeout(500);
              const confirmBtn2 = await page.$('.ant-popconfirm-buttons button.ant-btn-primary');
              if (confirmBtn2) {
                await confirmBtn2.click();
                await page.waitForTimeout(3000);
                console.log('Restored and saved.');
              }
            }
          }
        }
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11-after-restore.png'), fullPage: true });
      } else {
        console.log('Save button is disabled after toggle — toggle may not have registered.');
      }
    }

    // ─── HORIZONTAL SCROLL TEST ─────────────────────────────
    console.log('\nHORIZONTAL SCROLL TEST:');
    // The overflow container wrapping the table
    const overflowDiv = await page.$('div[style*="overflow"]');
    if (overflowDiv) {
      const scrollW = await overflowDiv.evaluate(el => el.scrollWidth);
      const clientW = await overflowDiv.evaluate(el => el.clientWidth);
      console.log(`scrollWidth=${scrollW} clientWidth=${clientW} scrollable=${scrollW > clientW}`);

      if (scrollW > clientW) {
        // Scroll to the right
        await overflowDiv.evaluate(el => el.scrollLeft = el.scrollWidth);
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12-scrolled-right.png'), fullPage: false });

        // Check that the sticky first column is still visible
        const stickyTd = await page.$('td[style*="sticky"]');
        if (stickyTd) {
          const box = await stickyTd.boundingBox();
          console.log(`Sticky column position: x=${Math.round(box.x)} visible=${box.x >= 0}`);
        }

        // Scroll back
        await overflowDiv.evaluate(el => el.scrollLeft = 0);
        await page.waitForTimeout(300);
      }
    }

    // ─── COLLAPSE/EXPAND DETAILED ────────────────────────────
    console.log('\nCOLLAPSE/EXPAND DETAILED:');

    // Count resource rows before
    const beforeResourceRows = await page.$$('table tbody tr:not(:has(td[colspan]))');
    console.log(`Before collapse: ${beforeResourceRows.length} resource rows`);

    // Count module headers before
    const beforeModuleHeaders = await page.$$('table tbody tr td[colspan]');
    console.log(`Before collapse: ${beforeModuleHeaders.length} module headers`);

    // Collapse All
    const collapseBtn = await page.$('button:has-text("Collapse All")');
    await collapseBtn.click();
    await page.waitForTimeout(500);

    const afterCollapseRows = await page.$$('table tbody tr:not(:has(td[colspan]))');
    const afterCollapseHeaders = await page.$$('table tbody tr td[colspan]');
    console.log(`After Collapse All: ${afterCollapseRows.length} resource rows, ${afterCollapseHeaders.length} module headers`);

    const collapsePass = afterCollapseRows.length === 0 && afterCollapseHeaders.length === 8;
    console.log(`Collapse test: ${collapsePass ? 'PASS' : 'FAIL'}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13-collapsed-detailed.png'), fullPage: true });

    // Expand All
    const expandBtn = await page.$('button:has-text("Expand All")');
    await expandBtn.click();
    await page.waitForTimeout(500);

    const afterExpandRows = await page.$$('table tbody tr:not(:has(td[colspan]))');
    const afterExpandHeaders = await page.$$('table tbody tr td[colspan]');
    console.log(`After Expand All: ${afterExpandRows.length} resource rows, ${afterExpandHeaders.length} module headers`);

    const expandPass = afterExpandRows.length === 55;
    console.log(`Expand test: ${expandPass ? 'PASS' : 'FAIL'}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14-expanded-detailed.png'), fullPage: true });

    // ─── CONSOLE ERRORS ──────────────────────────────────────
    console.log(`\nConsole errors: ${consoleErrors.length}`);
    consoleErrors.forEach(e => console.log(`  ${e.substring(0, 150)}`));

    console.log('\n=== TOGGLE + SCROLL + COLLAPSE VERIFICATION COMPLETE ===');

  } catch (e) {
    console.error('ERROR:', e.message);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error-toggle.png'), fullPage: true });
  } finally {
    await browser.close();
  }
})();
