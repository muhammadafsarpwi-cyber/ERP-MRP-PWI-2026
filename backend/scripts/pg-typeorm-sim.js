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

  // Check items table structure - is company_id NOT NULL?
  const cols = await c.query(`
    SELECT column_name, is_nullable, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'items' 
    ORDER BY ordinal_position
  `);
  console.log('=== ITEMS TABLE COLUMNS ===');
  cols.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type} nullable=${r.is_nullable}`));

  // Simulate the EXACT query TypeORM generates
  // TypeORM uses schema public and creates query like:
  // SELECT "item"."id" AS "item_id", "item"."item_code" AS "item_item_code", ...
  // FROM "public"."items" "item"
  // LEFT JOIN ...
  // Check if schema prefix matters
  console.log('\n=== TEST: Query with schema prefix ===');
  const r1 = await c.query(`SELECT COUNT(*)::int AS cnt FROM "public"."items"`);
  console.log('Count with "public"."items":', r1.rows[0].cnt);

  // Check if there are multiple schemas with items table
  const schemas = await c.query(`SELECT schemaname FROM pg_tables WHERE tablename = 'items'`);
  console.log('\n=== SCHEMAS containing items ===');
  console.table(schemas.rows);

  // Try TypeORM-style query with quoted identifiers
  console.log('\n=== TEST: TypeORM-style query ===');
  const r2 = await c.query(`
    SELECT "item"."id" AS "item_id",
           "item"."item_code" AS "item_item_code",
           "item"."name" AS "item_name",
           "item"."item_type" AS "item_item_type",
           "item"."status" AS "item_status",
           "item"."company_id" AS "item_company_id"
    FROM "public"."items" "item"
    LEFT JOIN "public"."item_categories" "category" ON "category"."id" = "item"."category_id"
    LEFT JOIN "public"."uoms" "baseUom" ON "baseUom"."id" = "item"."base_uom_id"
    LEFT JOIN "public"."companies" "company" ON "company"."id" = "item"."company_id"
    LEFT JOIN "public"."divisions" "division" ON "division"."id" = "item"."division_id"
    LEFT JOIN "public"."sections" "section" ON "section"."id" = "item"."section_id"
    LEFT JOIN "public"."departments" "department" ON "department"."id" = "item"."department_id"
    ORDER BY "item"."item_code" ASC
    LIMIT 20 OFFSET 0
  `);
  console.log('Rows returned:', r2.rows.length);
  if (r2.rows.length > 0) {
    console.log('First row:', r2.rows[0]);
  }

  await c.end();
  console.log('\nDONE');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
