const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres.gnvobiwlzezostzjpqvu', password: 'pwiAfsar74()', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (s) => (await c.query(s)).rows;
  const sample = await q("SELECT pr.routing_code, ro.sequence_no, ro.operation_code, (ro.operation_id IS NOT NULL) AS linked FROM routing_operations ro JOIN production_routings pr ON pr.id = ro.routing_id WHERE pr.routing_code = 'RTG-SMP-005' ORDER BY ro.sequence_no");
  console.log('RTG-SMP-005:', JSON.stringify(sample));
  const ops = await q("SELECT operation_code, operation_name, status FROM operations WHERE operation_code LIKE 'OP-SMP%' ORDER BY operation_code");
  console.log('OP-SMP masters:', JSON.stringify(ops));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });