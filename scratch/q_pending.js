require('dotenv').config({path:'d:/ERP-MRP-PWI-2026/backend/.env'});
const { Client } = require('pg');
const c = new Client({host:process.env.DB_HOST,port:+process.env.DB_PORT,user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,ssl:{rejectUnauthorized:false}});
(async()=>{ await c.connect();
 const r = await c.query("select pe.id, pe.entry_number, pe.actual_quantity, pe.remarks from production_entries pe where pe.remarks like '%Status: WITHOUT_NIPPLE%' or pe.remarks like '%SpokePackingMode: WITHOUT_NIPPLE%' and pe.remarks not like '%Status: COMPLETED%' order by pe.created_at desc limit 10");
 r.rows.forEach(x => console.log(x.entry_number, x.remarks.match(/Batch:\s*([^\s|]+)/)?.[1], x.remarks.match(/Cartons:\s*([^\s|]+)/)?.[1], x.remarks.match(/Customer:\s*([^|]+)/)?.[1]));
 await c.end();})();
