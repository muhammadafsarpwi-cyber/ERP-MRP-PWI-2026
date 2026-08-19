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
const tables = [
  'companies', 'divisions', 'departments', 'roles', 'permissions',
  'erp_users', 'user_roles', 'role_permissions',
  'items', 'item_categories', 'uoms', 'uom_conversions',
  'item_barcodes', 'item_attribute_definitions', 'item_attribute_values',
  'item_specifications', 'item_documents',
  'organizations', 'suppliers', 'warehouses', 'locations'
];
c.connect()
  .then(async () => {
    for (const t of tables) {
      try {
        const r = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = '" + t + "' ORDER BY ordinal_position");
        if (r.rows.length > 0) {
          console.log(t + ': ' + r.rows.map(x => x.column_name).join(', '));
        } else {
          console.log(t + ': DOES NOT EXIST');
        }
      } catch(e) {
        console.log(t + ': ERROR - ' + e.message);
      }
    }
    await c.end();
  })
  .catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
