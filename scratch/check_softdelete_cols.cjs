/* READ-ONLY: confirm which tables have a soft-delete (deleted_at) column. */
const fs = require('fs'); const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));
function loadEnv(){const p=path.join('D:','ERP-MRP-PWI-2026','backend','.env');const o={};for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=/^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim());if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
(async()=>{const e=loadEnv();const c=new Client({host:e.DB_HOST,port:Number(e.DB_PORT),user:e.DB_USERNAME,password:e.DB_PASSWORD,database:e.DB_DATABASE,ssl:{rejectUnauthorized:false}});await c.connect();
const r=await c.query(`SELECT table_name, column_name FROM information_schema.columns WHERE column_name='deleted_at' AND table_name IN ('items','inventory_balances','stock_ledger','production_entries','production_entry_items','warehouses') ORDER BY table_name`);
console.log('Tables WITH deleted_at among relevant:', r.rows.length ? r.rows : 'NONE');
const r2=await c.query(`SELECT table_name FROM information_schema.columns WHERE column_name='deleted_at' GROUP BY table_name ORDER BY table_name`);
console.log('All tables that HAVE deleted_at:', r2.rows.map(x=>x.table_name).join(', '));
await c.end();})().catch(e=>{console.error(e.message);process.exit(1);});
