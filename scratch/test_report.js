require('dotenv').config({path:'d:/ERP-MRP-PWI-2026/backend/.env'});
const { Client } = require('pg');
const c = new Client({host:process.env.DB_HOST,port:+process.env.DB_PORT,user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,ssl:{rejectUnauthorized:false}});
(async()=>{ await c.connect();
 const res = await c.query(`
   SELECT 
     sl.transaction_date::date as day,
     i.item_code,
     sl.transaction_type,
     sl.direction,
     sl.quantity,
     sl.reference_number
   FROM stock_ledger sl
   JOIN items i ON i.id = sl.item_id
   WHERE i.item_code = 'FG-NP-005'
     AND sl.transaction_date >= '2026-11-05'
     AND sl.transaction_date <= '2026-11-07'
   ORDER BY sl.transaction_date, sl.created_at
 `);
 console.table(res.rows);
 await c.end();})();
