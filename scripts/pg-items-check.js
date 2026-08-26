const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' },
});

(async () => {
  await c.connect();

  // All items grouped by itemType
  const all = await c.query(`
    SELECT "itemCode", "name", "itemType", "status", "isManufacturable"
    FROM items
    ORDER BY "itemType", "itemCode"
    LIMIT 80
  `);
  console.log('=== ALL ITEMS IN DB (up to 80) ===');
  console.table(all.rows);

  // Count by itemType
  const counts = await c.query(`SELECT "itemType", COUNT(*) as cnt FROM items GROUP BY "itemType" ORDER BY "itemType"`);
  console.log('=== COUNT BY ITEM TYPE ===');
  console.table(counts.rows);

  // Count by status
  const statusCounts = await c.query(`SELECT "status", COUNT(*) as cnt FROM items GROUP BY "status" ORDER BY "status"`);
  console.log('=== COUNT BY STATUS ===');
  console.table(statusCounts.rows);

  // Items with 'cable' or 'Cable' in name or code
  const cables = await c.query(`SELECT "itemCode", "name", "itemType", "status" FROM items WHERE "itemCode" ILIKE '%cable%' OR "name" ILIKE '%cable%'`);
  console.log('=== CABLE ITEMS (by code or name) ===');
  console.table(cables.rows);

  // Check items table policies
  const policies = await c.query(`SELECT policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = 'items'`);
  console.log('=== RLS POLICIES ON items TABLE ===');
  console.table(policies.rows);

  // Check if RLS is enabled
  const rls = await c.query(`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'items'`);
  console.log('=== RLS STATUS ===');
  console.table(rls.rows);

  await c.end();
})();
