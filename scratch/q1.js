require('dotenv').config({path:'d:/ERP-MRP-PWI-2026/backend/.env'});
const { Client } = require('pg');
const c = new Client({host:process.env.DB_HOST,port:+process.env.DB_PORT,user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,ssl:{rejectUnauthorized:false}});
(async()=>{ await c.connect();
 const q=async(t,sql)=>{console.log('--',t);try{const r=await c.query(sql);r.rows.forEach(x=>console.log(JSON.stringify(x)))}catch(e){console.log(e.message)}};
 await q('without-nipple entries: nipple net deduction',`select pe.entry_number, pe.entry_date::date d, pe.actual_quantity::int qty,
   coalesce(sum(case when sl.direction='OUT' and sl.transaction_type='PRODUCTION_CONSUMPTION' then sl.quantity end),0)::int np_out,
   coalesce(sum(case when sl.direction='IN' and sl.transaction_type='PRODUCTION_REVERSAL' then sl.quantity end),0)::int np_rev
  from production_entries pe
  left join stock_ledger sl on sl.reference_number=pe.entry_number and sl.item_id in (select id from items where item_code like 'FG-NP-%' or lower(name) like '%nipple%')
  where pe.packing_mode='WITHOUT_NIPPLE' group by pe.entry_number, pe.entry_date, pe.actual_quantity order by pe.entry_date desc limit 40`);
 await c.end();})();
