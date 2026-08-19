const {Pool}=require('pg');const fs=require('fs');const env={};
fs.readFileSync('D:/ERP-MRP-PWI-2026/backend/.env','utf8').split('\n').forEach(l=>{const t=l.trim();if(!t||t.startsWith('#'))return;const i=t.indexOf('=');if(i>0)env[t.substring(0,i).trim()]=t.substring(i+1).trim()});
const p=new Pool({host:env.DB_HOST,port:parseInt(env.DB_PORT||'5432'),user:env.DB_USERNAME,password:env.DB_PASSWORD,database:env.DB_DATABASE,ssl:env.DB_SSL==='true'?{rejectUnauthorized:false}:false,max:1});
p.query("DELETE FROM items WHERE item_code LIKE 'E2E-%'").then(r=>{console.log('Cleaned E2E items:',r.rowCount);p.end()}).catch(e=>{console.log('ERR:',e.message);p.end()});
