require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, ssl: { rejectUnauthorized: false },
});
(async () => {
  const q = async (sql, p) => (await pool.query(sql, p)).rows;
  const cols = await q(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='production_entries'
    ORDER BY ordinal_position`);
  console.log('COLUMNS:', cols.map((c) => `${c.column_name}:${c.data_type}${c.is_nullable === 'NO' ? '!' : ''}`).join('\n  '));
  console.log('total entries:', (await q(`SELECT COUNT(*) c FROM production_entries`))[0].c);
  const idx = await q(`SELECT indexname FROM pg_indexes WHERE tablename='production_entries'`);
  console.log('indexes:', idx.map((r) => r.indexname).join(', '));
  // item-scoped vs legacy targets
  console.log('targets total:', (await q(`SELECT COUNT(*) c FROM machine_targets`))[0].c,
    '| with item:', (await q(`SELECT COUNT(*) c FROM machine_targets WHERE item_id IS NOT NULL`))[0].c,
    '| legacy null-item:', (await q(`SELECT COUNT(*) c FROM machine_targets WHERE item_id IS NULL`))[0].c);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
