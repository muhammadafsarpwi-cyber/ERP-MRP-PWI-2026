const pg = require('pg');
(async () => {
  const c = new pg.Client({ connectionString: 'postgresql://postgres.gnvobiwlzezostzjpqvu:pwiAfsar74()@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();

  // Drop old constraint
  await c.query("ALTER TABLE inventory_reservations DROP CONSTRAINT inventory_reservations_status_check");
  console.log('Dropped old constraint');

  // Add new constraint with RELEASED included
  await c.query("ALTER TABLE inventory_reservations ADD CONSTRAINT inventory_reservations_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'CONSUMED'::character varying, 'RELEASED'::character varying, 'CANCELLED'::character varying])::text[])))");
  console.log('Added new constraint with RELEASED');

  // Verify
  const r = await c.query("SELECT pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname = 'inventory_reservations_status_check'");
  console.log('New constraint:', JSON.stringify(r.rows));

  // Verify existing data is valid
  const d = await c.query("SELECT count(*) as c FROM inventory_reservations");
  console.log('Existing rows:', d.rows[0].c, '(all valid)');

  await c.end();
})();
