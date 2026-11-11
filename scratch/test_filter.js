require('dotenv').config({path:'d:/ERP-MRP-PWI-2026/backend/.env'});
const { Client } = require('pg');
const c = new Client({host:process.env.DB_HOST,port:+process.env.DB_PORT,user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,ssl:{rejectUnauthorized:false}});
(async()=>{ await c.connect();
 const res = await c.query(`
   SELECT 
     sl.transaction_type, sl.direction, sl.quantity,
     (
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
     ) as passed_filter
   FROM stock_ledger sl
   JOIN items i ON i.id = sl.item_id
   WHERE i.item_code = 'FG-NP-005'
     AND sl.reference_number = 'PE-2026-02003'
 `);
 console.table(res.rows);
 await c.end();})();
