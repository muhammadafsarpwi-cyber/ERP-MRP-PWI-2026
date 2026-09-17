const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const outDir = path.join(__dirname, '..', 'docs', 'evidence', 'routing-flow');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Get token
  console.log('1. Authenticating with backend API...');
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token || loginJson.data?.token;
  console.log('Token acquired:', token ? 'YES' : 'NO');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  // 2. Set token in localStorage
  console.log('2. Opening app and injecting auth session...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate((jwt) => {
    localStorage.setItem('token', jwt);
    localStorage.setItem('access_token', jwt);
    localStorage.setItem('user', JSON.stringify({
      id: '0804af57-1f03-4d11-ad84-dc34f8829db1',
      email: 'system.admin@erp.com',
      displayName: 'System Admin',
      role: 'SUPER_ADMIN',
    }));
  }, token);

  // 3. Navigate to Production Routings
  console.log('3. Navigating to /production/routings...');
  await page.goto('http://localhost:3000/production/routings', { waitUntil: 'networkidle' });
  await page.waitForSelector('.ant-table-tbody tr.ant-table-row', { timeout: 10000 });

  // 01: Routings Table
  await page.screenshot({ path: path.join(outDir, '01_routings_list.png') });
  console.log('Saved 01_routings_list.png');

  // Find DBGRTG644551 (our branch and merge test routing)
  const dbgRow = page.locator('.ant-table-tbody tr:has-text("DBGRTG644551")');
  console.log('Clicking View button on DBGRTG644551...');
  await dbgRow.locator('button:has(.anticon-eye)').click();
  await page.waitForSelector('.ant-descriptions', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // 02: Operations Table
  await page.screenshot({ path: path.join(outDir, '02_routing_operations_table.png') });
  console.log('Saved 02_routing_operations_table.png');

  // 4. Switch to Process Flow
  console.log('4. Switching to Process Flow tab...');
  await page.locator('.ant-segmented-item:has-text("Process Flow")').click();
  await page.waitForSelector('.routing-node-card', { timeout: 10000 });
  await page.waitForTimeout(1500);

  // 03: Visual Process Flow DAG with branches, merges, quantities and UOMs
  await page.screenshot({ path: path.join(outDir, '03_routing_process_flow_dag.png') });
  console.log('Saved 03_routing_process_flow_dag.png');

  // 5. Click the Branching Node card (#10 DBG-A)
  console.log('5. Clicking branching node #10 to open details drawer...');
  const firstNode = page.locator('.routing-node-card:has-text("DBG-A")').first();
  await firstNode.click();
  await page.waitForSelector('.ant-drawer-open', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // 04: Node Details Drawer with Connections
  await page.screenshot({ path: path.join(outDir, '04_node_detail_drawer.png') });
  console.log('Saved 04_node_detail_drawer.png');

  // 6. Shell Integrity (Header, Sidebar, Workspace Tabs)
  await page.screenshot({ path: path.join(outDir, '05_workspace_shell_integrity.png') });
  console.log('Saved 05_workspace_shell_integrity.png');

  await browser.close();
  console.log('ALL PLAYWRIGHT SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

main().catch((err) => {
  console.error('Playwright failed:', err);
  process.exit(1);
});
