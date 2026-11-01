const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });

(async () => {
  const c = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME },
  });
  await c.connect();

  const res = await c.query(`
    SELECT pe.entry_date::text, 
           count(*) as total_entries,
           count(distinct pe.shift_id) as distinct_shifts,
           count(distinct pe.machine_no) as distinct_machines,
           array_agg(distinct pe.target_quantity) as distinct_targets,
           max(pe.target_quantity) as max_target,
           sum(pe.target_quantity) as sum_target,
           sum(pe.actual_quantity) as sum_actual
    FROM production_entries pe
    WHERE pe.is_active = true 
      AND pe.department_id = 'd3000000-0000-0000-0000-000000000008'
      AND pe.entry_date >= '2026-10-01' AND pe.entry_date <= '2026-10-31'
    GROUP BY pe.entry_date
    ORDER BY pe.entry_date
  `);
  console.table(res.rows);
  await c.end();
})().catch(console.error);
