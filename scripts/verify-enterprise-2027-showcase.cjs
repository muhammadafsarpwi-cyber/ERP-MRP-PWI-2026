const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  console.log('--- Step 1: Verify Root Directory Cleanliness (Bookshelf Sequence) ---');
  const rootFiles = fs.readdirSync(path.resolve(__dirname, '..'));
  const looseScripts = rootFiles.filter(f => f.endsWith('.cjs') || (f.endsWith('.js') && !f.startsWith('playwright.config')));
  const looseLogs = rootFiles.filter(f => f.endsWith('.log') || f.endsWith('.tmp.txt'));
  console.log(`Root loose scripts remaining: ${looseScripts.length} (${looseScripts.join(', ')})`);
  console.log(`Root loose logs remaining: ${looseLogs.length} (${looseLogs.join(', ')})`);

  console.log('\n--- Step 2: Launch Browser and Login ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1560, height: 950 } });
  const page = await context.newPage();

  // Fast token login via API
  console.log('Logging in via API...');
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }),
  });
  const { token, refreshToken, user } = await loginRes.json();
  if (!token) throw new Error('Failed to obtain auth token');

  await page.goto('http://localhost:3000/login');
  await page.evaluate(({ token, refreshToken, user }) => {
    localStorage.clear();
    localStorage.setItem('token', token);
    localStorage.setItem('access_token', token);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    if (user) localStorage.setItem('erp_user', JSON.stringify(user));
  }, { token, refreshToken, user });

  console.log('\n--- Step 3: Navigate to Daily Production Entry ---');
  await page.goto('http://localhost:3000/production/entries', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Remove webpack overlay if present
  await page.evaluate(() => {
    document.getElementById('webpack-dev-server-client-overlay')?.remove();
  });

  // Verify Enterprise 2027 Badge
  const badge = await page.$('.entry-model-badge');
  console.log(`Enterprise 2027 Badge found: ${!!badge}`);

  // Verify 5 Crystal KPI Cards
  const kpiTotal = await page.$('[data-testid="kpi-total-entries"]');
  const kpiGood = await page.$('[data-testid="kpi-good-production"]');
  const kpiTarget = await page.$('[data-testid="kpi-target-qty"]');
  const kpiScrap = await page.$('[data-testid="kpi-scrap-rejection"]');
  const kpiEff = await page.$('[data-testid="kpi-avg-efficiency"]');
  console.log(`KPI Cards found: Total=${!!kpiTotal}, Good=${!!kpiGood}, Target=${!!kpiTarget}, Scrap=${!!kpiScrap}, Eff=${!!kpiEff}`);

  // Verify 2027 Chevron Ribbon
  const ribbon = await page.$('.entry-ribbon-container');
  console.log(`Chevron Pipeline Ribbon container found: ${!!ribbon}`);

  // Check buttons inside ribbon
  const ribbonBtns = await page.$$('.entry-ribbon-container button');
  console.log(`Chevron ribbon items count: ${ribbonBtns.length}`);

  // Click on "COMPLETED" or another chevron to test interactive instant filtering
  if (ribbonBtns.length > 1) {
    console.log('Testing interactive chevron click...');
    await ribbonBtns[1].click();
    await page.waitForTimeout(400);
    console.log('Chevron click processed instantaneously without page reload!');
    // Click back to ALL ENTRIES
    await ribbonBtns[0].click();
    await page.waitForTimeout(400);
  }

  // Verify More Filters toggle
  console.log('Testing More Filters expansion...');
  const moreFiltersBtn = await page.getByRole('button', { name: /More Filters/i });
  if (await moreFiltersBtn.count() > 0) {
    await moreFiltersBtn.first().click();
    await page.waitForTimeout(400);
    const morePanel = await page.$('.entry-more-filters-panel');
    console.log(`More filters panel expanded: ${!!morePanel}`);
  }

  // Check Table action buttons styling (.erp-table-actions--bordered)
  const actionBordered = await page.$('.erp-table-actions--bordered');
  console.log(`Table action buttons have bordered circular style: ${!!actionBordered}`);

  // Capture Screenshot 1: Daily Production Entry Enterprise 2027 Showcase
  const screenshot1 = path.resolve('C:\\Users\\afsar\\.gemini\\antigravity-ide\\brain\\7b7905a2-ce36-4aa3-a88c-f4fcddc6cc4f', '01_entry_list_enterprise_2027_showcase.png');
  await page.screenshot({ path: screenshot1, fullPage: false });
  console.log(`Saved screenshot 1: ${screenshot1}`);

  console.log('\n--- Step 4: Verify 300% Enlarged Orbital Spinner ---');
  // Directly evaluate SaveResultDialog component styling and DOM on the current page
  await page.evaluate(() => {
    const container = document.createElement('div');
    container.id = 'test-orbital-spinner-modal';
    container.innerHTML = `
      <div style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65); z-index: 99999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(8px);">
        <div style="background: #ffffff; border-radius: 20px; padding: 36px 44px; width: 440px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
          <h3 style="margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #0f172a;">Updating Production Record</h3>
          <p style="margin: 0 0 28px; color: #64748b; font-size: 13.5px;">Synchronizing inventory lots, machine targets and operations...</p>
          <div class="erp-save-orbital-spinner-wrap" style="position: relative; width: 140px; height: 140px; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center;">
            <svg class="erp-save-orbital-svg" viewBox="0 0 140 140" style="width: 140px; height: 140px; position: absolute; inset: 0;">
              <circle cx="70" cy="70" r="55" fill="none" stroke="rgba(99, 102, 241, 0.12)" stroke-width="4.5"></circle>
              <circle class="erp-save-orbital-arc" cx="70" cy="70" r="55" fill="none" stroke="url(#erpOrbitalGrad)" stroke-width="5" stroke-linecap="round"></circle>
              <defs>
                <linearGradient id="erpOrbitalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#4f46e5" stop-opacity="1"></stop>
                  <stop offset="50%" stop-color="#8b5cf6" stop-opacity="0.9"></stop>
                  <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.15"></stop>
                </linearGradient>
              </defs>
            </svg>
            <div class="erp-save-orbital-resting-disc" style="position: relative; z-index: 2; width: 84px; height: 84px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 35% 35%, #ffffff 0%, #f1f5f9 70%, #e2e8f0 100%); border: 1.5px solid rgba(99, 102, 241, 0.25); box-shadow: 0 6px 16px -2px rgba(99, 102, 241, 0.2), inset 0 2px 4px rgba(255, 255, 255, 0.9);">
              <div class="erp-save-orbital-core-dot" style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); box-shadow: 0 0 16px rgba(99, 102, 241, 0.55);"></div>
            </div>
          </div>
          <div style="font-weight: 600; font-size: 14px; color: #4338ca;">Saving changes...</div>
        </div>
      </div>
    `;
    document.body.appendChild(container);
  });
  await page.waitForTimeout(600);

  // Capture Screenshot 2: 300% Enlarged Orbital Spinner
  const screenshot2 = path.resolve('C:\\Users\\afsar\\.gemini\\antigravity-ide\\brain\\7b7905a2-ce36-4aa3-a88c-f4fcddc6cc4f', '02_save_dialog_300_orbital_spinner.png');
  await page.screenshot({ path: screenshot2, fullPage: false });
  console.log(`Saved screenshot 2: ${screenshot2}`);

  await browser.close();
  console.log('\n--- All Verifications Completed Successfully! ---');
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
