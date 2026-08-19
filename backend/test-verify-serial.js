const pg = require('pg');
const c = new pg.Client({
  connectionString: 'postgresql://postgres.gnvobiwlzezostzjpqvu:pwiAfsar74()@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();

  // 1. Table exists?
  const tbl = await c.query(`SELECT tablename FROM pg_tables WHERE tablename='serial_numbers' AND schemaname='public'`);
  console.log('Table exists:', tbl.rows.length > 0 ? 'YES' : 'NO');

  // 2. Count existing triggers
  const trig = await c.query(`
    SELECT t.tgname as trigger_name, c.relname as table_name
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relname = 'serial_numbers' AND n.nspname = 'public' AND NOT t.tgisinternal
  `);
  console.log('Triggers on serial_numbers:', trig.rows.length);
  trig.rows.forEach(r => console.log(`  - ${r.trigger_name}`));

  // 3. Check data preserved
  const data = await c.query('SELECT count(*) as c FROM serial_numbers');
  console.log('Data rows:', data.rows[0].c);

  // 4. Check indexes
  const idx = await c.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'serial_numbers' AND schemaname = 'public'
  `);
  console.log('Indexes:', idx.rows.length);
  idx.rows.forEach(r => console.log(`  - ${r.indexname}: ${r.indexdef}`));

  // 5. Check foreign keys
  const fk = await c.query(`
    SELECT conname, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conrelid = 'serial_numbers'::regclass AND contype = 'f'
  `);
  console.log('Foreign keys:', fk.rows.length);
  fk.rows.forEach(r => console.log(`  - ${r.conname}: ${r.def}`));

  await c.end();
})();
