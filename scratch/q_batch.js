require('dotenv').config({path:'d:/ERP-MRP-PWI-2026/backend/.env'});
const { Client } = require('pg');
const c = new Client({host:process.env.DB_HOST,port:+process.env.DB_PORT,user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,ssl:{rejectUnauthorized:false}});
(async()=>{ await c.connect();
 const r = await c.query("select pe.id, pe.entry_number, pe.actual_quantity, pe.remarks from production_entries pe where pe.remarks like '%PKG-2026-0961%'");
 console.log(r.rows);
 await c.end();})();
