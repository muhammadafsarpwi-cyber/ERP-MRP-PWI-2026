require('dotenv').config({path:'d:/ERP-MRP-PWI-2026/backend/.env'});
const { Client } = require('pg');
const c = new Client({host:process.env.DB_HOST,port:+process.env.DB_PORT,user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,ssl:{rejectUnauthorized:false}});
(async()=>{ await c.connect();
 // Test exact query
 const itemRes = await c.query("select id from items where item_code='FG-NP-005'");
 const itemId = itemRes.rows[0].id;
 const start = '2026-11-05T19:00:00.000Z';
 const end = '2026-11-06T19:00:00.000Z';
 const sql = `
   SELECT
     COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transaction_type NOT IN ('PRODUCTION_SCRAP', 'PRODUCTION_REVERSAL') AND sl.transaction_date >= $2 AND sl.transaction_date < $3 THEN sl.quantity WHEN sl.direction = 'IN' AND sl.transaction_type = 'PRODUCTION_REVERSAL' AND sl.transaction_date >= $2 AND sl.transaction_date < $3 THEN -sl.quantity ELSE 0 END), 0) as "rangeOut",
     COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transaction_type IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_ISSUE') AND sl.transaction_date >= $2 AND sl.transaction_date < $3 THEN sl.quantity WHEN sl.direction = 'IN' AND sl.transaction_type = 'PRODUCTION_REVERSAL' AND sl.transaction_date >= $2 AND sl.transaction_date < $3 THEN -sl.quantity ELSE 0 END), 0) as "consumed"
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
               OR sl.transaction_type IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_ISSUE', 'PRODUCTION_REVERSAL')
             )
         )
       )
     )
 `;
 const r = await c.query(sql, [itemId, start, end]);
 console.log('Exact SQL result:', r.rows);
 await c.end();})();
