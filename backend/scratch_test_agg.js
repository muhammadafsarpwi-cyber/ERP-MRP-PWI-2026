const { DataSource } = require('./node_modules/typeorm');
require('./node_modules/dotenv').config();

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'pwi_erp',
});

async function run() {
  await ds.initialize();
  const itemId = '94831f9f-c358-4da1-b570-fe1daa0092b9';

  // Let's check why the 4 PRODUCTION_CONSUMPTION rows:
  const consumptions = await ds.query(`
    SELECT sl.id, sl.reference_id, sl.transaction_type, sl.quantity,
           pe.id as pe_exists, pe.is_active, pe.deleted_at, pe.item_id as pe_item_id
    FROM stock_ledger sl
    LEFT JOIN production_entries pe ON pe.id = sl.reference_id
    WHERE sl.item_id = $1 AND sl.transaction_type = 'PRODUCTION_CONSUMPTION'
  `, [itemId]);
  console.log('CONSUMPTIONS:', JSON.stringify(consumptions, null, 2));

  // Let's test the exact aggregate query from production-inventory-report.service.ts
  const aggTest = await ds.query(`
    SELECT
      sl.item_id,
      COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND sl.transaction_type <> 'PRODUCTION_SCRAP' THEN sl.quantity ELSE 0 END), 0) as "openingIn",
      COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transaction_type <> 'PRODUCTION_SCRAP' THEN sl.quantity ELSE 0 END), 0) as "openingOut",
      COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transaction_type IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_ISSUE') THEN sl.quantity ELSE 0 END), 0) as "consumed"
    FROM stock_ledger sl
    WHERE sl.item_id = $1
      AND (
        UPPER(COALESCE(sl.reference_type, '')) <> 'PRODUCTION_ENTRY'
        OR sl.reference_id IS NULL
        OR (
          NOT EXISTS (
            SELECT 1 FROM production_entries pe_chk
            WHERE pe_chk.id = sl.reference_id
              AND (pe_chk.is_active = false OR pe_chk.deleted_at IS NOT NULL)
          )
          AND EXISTS (
            SELECT 1 FROM production_entries pe_rel
            LEFT JOIN production_entry_items pei_rel ON pei_rel.production_entry_id = pe_rel.id
            WHERE pe_rel.id = sl.reference_id
              AND (
                pe_rel.item_id = sl.item_id 
                OR pei_rel.item_id = sl.item_id
                OR sl.transaction_type IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_ISSUE')
              )
          )
        )
      )
    GROUP BY sl.item_id
  `, [itemId]);
  console.log('AGG TEST:', JSON.stringify(aggTest, null, 2));

  await ds.destroy();
}
run().catch(console.error);
