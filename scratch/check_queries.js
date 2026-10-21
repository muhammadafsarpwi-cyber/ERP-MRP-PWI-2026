const { Client } = require('pg');
async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:postgres@localhost:5432/erp_mrp_pwi"
  });
  await client.connect();
  const res = await client.query("SELECT pid, now() - query_start AS duration, query, state FROM pg_stat_activity WHERE state != 'idle' AND pid <> pg_backend_pid()");
  console.log("Active queries:", JSON.stringify(res.rows, null, 2));
  await client.end();
}
run().catch(console.error);
