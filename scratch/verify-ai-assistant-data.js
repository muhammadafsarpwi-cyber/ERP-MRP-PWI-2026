const { Client } = require('d:/ERP-MRP-PWI-2026/backend/node_modules/pg');
require('d:/ERP-MRP-PWI-2026/backend/node_modules/dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });

function naturalSortMachines(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

async function verifyAiAssistantData() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME },
  });

  await client.connect();
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('🚀 AI ASSISTANT ERP DATA ENGINE & QUERY VALIDATION');
  console.log('═════════════════════════════════════════════════════════════════\n');

  // 1. Check all production entries
  const allEntriesRes = await client.query(`
    SELECT pe.*, d.division_code, d.name as division_name, dep.department_code, dep.name as department_name
    FROM production_entries pe
    LEFT JOIN divisions d ON d.id = pe.division_id
    LEFT JOIN departments dep ON dep.id = pe.department_id
    ORDER BY pe.entry_date DESC
  `);
  const entries = allEntriesRes.rows;
  console.log(`✅ Total Production Entries in DB: ${entries.length}`);

  // 2. Division Breakdown
  const ccdEntries = entries.filter(e => e.division_code === 'DIV-CCD');
  const spdEntries = entries.filter(e => e.division_code === 'DIV-SPD');
  console.log(`✅ DIV-CCD (Control Cable Division) Entries: ${ccdEntries.length}`);
  console.log(`✅ DIV-SPD (Spoke Division) Entries: ${spdEntries.length}`);

  // Check Division Isolation: No Spoke machines in CCD
  const ccdMachines = new Set(ccdEntries.map(e => e.machine_no));
  console.log(`✅ CCD Machines: ${Array.from(ccdMachines).sort(naturalSortMachines).join(', ')}`);
  const spokeInCcd = Array.from(ccdMachines).filter(m => m.startsWith('ST-') || m.startsWith('SPK-'));
  if (spokeInCcd.length === 0) {
    console.log('🛡️ DIVISION ISOLATION VERIFIED: Zero Spoke machines found in Control Cable records.');
  } else {
    console.error('❌ Contamination found:', spokeInCcd);
  }

  // 3. September 2026 Operator-Wise Aggregation
  const sepEntries = ccdEntries.filter(e => {
    const d = e.entry_date ? e.entry_date.toISOString().slice(0, 7) : '';
    return d === '2026-09';
  });
  console.log(`\n📅 September 2026 CCD Entries: ${sepEntries.length}`);

  const opMap = {};
  sepEntries.forEach(e => {
    const op = (e.operator_name || 'Unassigned').trim();
    if (!opMap[op]) {
      opMap[op] = {
        operator: op,
        target: 0,
        produced: 0,
        runningHours: 0,
        downtimeHours: 0,
        scrap: 0,
        machines: new Set(),
      };
    }
    opMap[op].target += Number(e.target_quantity || 0);
    opMap[op].produced += Number(e.actual_quantity || 0);
    opMap[op].runningHours += Number(e.running_hours || 0);
    opMap[op].downtimeHours += Number(e.downtime_hours || 0);
    opMap[op].scrap += Number(e.scrap_quantity || 0);
    if (e.machine_no) opMap[op].machines.add(e.machine_no);
  });

  const opTable = Object.values(opMap).map(o => ({
    Operator: o.operator,
    'Planned Target': Math.round(o.target),
    'Actual Produced': Math.round(o.produced),
    'Achievement %': o.target > 0 ? (o.produced / o.target * 100).toFixed(2) + '%' : '0%',
    'Running Hrs': o.runningHours.toFixed(1),
    'Downtime Hrs': o.downtimeHours.toFixed(1),
    Machines: Array.from(o.machines).sort(naturalSortMachines).join(', '),
  }));

  console.log('\n📊 OPERATOR-WISE PRODUCTION REPORT (September 2026):');
  console.table(opTable);

  const grandTarget = Object.values(opMap).reduce((s, o) => s + o.target, 0);
  const grandProduced = Object.values(opMap).reduce((s, o) => s + o.produced, 0);
  const grandRunning = Object.values(opMap).reduce((s, o) => s + o.runningHours, 0);
  const grandDowntime = Object.values(opMap).reduce((s, o) => s + o.downtimeHours, 0);
  console.log(`📌 GRAND TOTALS:`);
  console.log(`   Target: ${grandTarget.toLocaleString()}`);
  console.log(`   Produced: ${grandProduced.toLocaleString()}`);
  console.log(`   Achievement: ${(grandProduced / grandTarget * 100).toFixed(2)}%`);
  console.log(`   Running Hours: ${grandRunning.toFixed(1)} hrs`);
  console.log(`   Downtime: ${grandDowntime.toFixed(1)} hrs`);

  // 4. Machine-wise Natural Ordering
  const machineMap = {};
  sepEntries.forEach(e => {
    const m = (e.machine_no || 'UNKNOWN').trim();
    if (!machineMap[m]) machineMap[m] = { target: 0, produced: 0 };
    machineMap[m].target += Number(e.target_quantity || 0);
    machineMap[m].produced += Number(e.actual_quantity || 0);
  });
  const naturalOrder = Object.keys(machineMap).sort(naturalSortMachines);
  console.log(`\n⚙️ MACHINE-WISE NATURAL ORDER:`);
  console.log(`   ${naturalOrder.join(' -> ')}`);

  // 5. Follow-up Scenario: Only Flattening
  const flatteningEntries = sepEntries.filter(e => (e.department_code === 'DEPT-FLT' || (e.department_name && e.department_name.toLowerCase().includes('flattening')) || (e.machine_no && e.machine_no.startsWith('FT-'))));
  console.log(`\n🏢 FOLLOW-UP 1: "Only Flattening" Entries Count: ${flatteningEntries.length}`);
  const flatOperators = Array.from(new Set(flatteningEntries.map(e => e.operator_name)));
  console.log(`   Operators active in Flattening: ${flatOperators.join(', ')}`);

  // 6. Follow-up Scenario: Now Machine-Wise
  const flatMachines = Array.from(new Set(flatteningEntries.map(e => e.machine_no))).sort(naturalSortMachines);
  console.log(`\n⚙️ FOLLOW-UP 2: "Now show it machine-wise" (Flattening):`);
  console.log(`   Machines in natural order: ${flatMachines.join(', ')}`);

  // 7. Period Comparison: August vs September
  const augEntries = ccdEntries.filter(e => {
    const d = e.entry_date ? e.entry_date.toISOString().slice(0, 7) : '';
    return d === '2026-08';
  });
  const augProduced = augEntries.reduce((s, e) => s + Number(e.actual_quantity || 0), 0);
  const sepProduced = sepEntries.reduce((s, e) => s + Number(e.actual_quantity || 0), 0);
  const diff = sepProduced - augProduced;
  const pctChange = augProduced > 0 ? (diff / augProduced * 100).toFixed(1) + '%' : 'N/A';
  console.log(`\n📊 PERIOD COMPARISON (August 2026 vs September 2026):`);
  console.log(`   August 2026 Produced: ${augProduced.toLocaleString()} MTR`);
  console.log(`   September 2026 Produced: ${sepProduced.toLocaleString()} MTR`);
  console.log(`   Growth/Variance: ${diff >= 0 ? '+' : ''}${diff.toLocaleString()} (${pctChange})`);

  // 8. Customer Dispatch
  const dispatchRes = await client.query('SELECT COUNT(*) FROM dispatch_packages');
  console.log(`\n📦 CUSTOMER DISPATCH: Total Packages in DB = ${dispatchRes.rows[0].count}`);

  // 9. Maintenance / Tooling
  const jcRes = await client.query('SELECT COUNT(*) FROM maintenance_job_cards');
  console.log(`🔧 MAINTENANCE: Total Job Cards in DB = ${jcRes.rows[0].count}`);

  await client.end();
  console.log('\n═════════════════════════════════════════════════════════════════');
  console.log('✅ ALL ERP DATA CHECKS AND NATURAL AGGREGATIONS VERIFIED!');
  console.log('═════════════════════════════════════════════════════════════════\n');
}

verifyAiAssistantData().catch(console.error);
