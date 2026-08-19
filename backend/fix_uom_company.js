const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: process.env.DBPASS,
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
  connectionTimeoutMillis: 15000
});
c.connect()
  .then(async () => {
    // Add company_id to uoms if missing
    const hasCol = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'uoms' AND column_name = 'company_id'");
    if (hasCol.rows.length === 0) {
      await c.query("ALTER TABLE uoms ADD COLUMN company_id uuid REFERENCES companies(id)");
      console.log('Added company_id to uoms');
    } else {
      console.log('uoms.company_id already exists');
    }
    
    // Verify uoms columns
    const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'uoms' ORDER BY ordinal_position");
    console.log('UOMS COLUMNS:', cols.rows.map(r => r.column_name).join(', '));

    // Also check item_categories for the column names used by the entity
    const catCols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'item_categories' ORDER BY ordinal_position");
    console.log('ITEM_CATEGORIES COLUMNS:', catCols.rows.map(r => r.column_name).join(', '));

    await c.end();
  })
  .catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
