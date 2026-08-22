const { Client } = require('pg');
async function main() {
  const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const tot = await c.query("SELECT count(*)::int n FROM machines WHERE is_active");
  console.log('active total:', tot.rows[0].n, '(expect 74 = 22 preserved + 52 canonical)');
  const canon = await c.query("SELECT count(DISTINCT (department_id::text || ':' || lower(machine_code)))::int n FROM machines WHERE is_active AND machine_number IS NOT NULL");
  console.log('canonical MCH machines:', canon.rows[0].n, '(expect 57)');
  const nums = await c.query("SELECT count(*)::int n, count(DISTINCT machine_number)::int d FROM machines WHERE is_active AND machine_number LIKE 'MCH%'");
  console.log('MCH numbers:', JSON.stringify(nums.rows[0]));
  const dup = await c.query("SELECT company_id, COALESCE(department_id::text,'x') dept, lower(machine_code) code, count(*)::int n FROM machines WHERE is_active GROUP BY 1,2,3 HAVING count(*)>1");
  console.log('dup identity violations:', dup.rows.length);
  const crossDept = await c.query("SELECT machine_code, department_id FROM machines WHERE is_active AND machine_code IN ('SP-01','APS-01') ORDER BY machine_code, department_id");
  for (const r of crossDept.rows) console.log('cross-dept ok: ' + r.machine_code + ' @ ' + r.department_id.slice(-4));
  const qr = await c.query("SELECT count(*)::int n FROM machines WHERE qr_payload IS NULL OR qr_payload NOT LIKE '/production/machines/%'");
  console.log('bad qr payloads:', qr.rows[0].n);
  const sample = await c.query("SELECT machine_number, machine_code, name, status, criticality FROM machines WHERE machine_number IN ('MCH001','MCH012','MCH031','MCH032','MCH040','MCH057') ORDER BY machine_number");
  for (const r of sample.rows) console.log(JSON.stringify(r));
  const legacy = await c.query("SELECT machine_code FROM machines WHERE is_active AND machine_code IN ('ST-01','SW-01','PKS-01','SPK-01','HD-01','FL-01','SR-01','PV-01','CPK-01') ORDER BY machine_code");
  console.log('legacy preserved:', legacy.rows.map(r => r.machine_code).join(','));
  await c.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
