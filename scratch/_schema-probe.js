const fs=require('fs'),path=require('path');
function loadEnv(){for(const p of [path.join(__dirname,'..','backend','.env.local'),path.join(__dirname,'..','backend','.env')]){if(!fs.existsSync(p))continue;for(const raw of fs.readFileSync(p,'utf8').split(/\r?\n/)){const l=raw.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<0)continue;const k=l.slice(0,e).trim();if(process.env[k]!==undefined)continue;process.env[k]=l.slice(e+1).trim().replace(/^["']|["']$/g,'');}}}
loadEnv();
const {Client}=require('pg');
(async()=>{
 const c=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:process.env.DB_SSL_REJECT_UNAUTHORIZED!=='false'}:false,connectionTimeoutMillis:20000});
 await c.connect();
 const locs=await c.query(`select l.location_code, l.name, l.status, l.is_active, d.division_code, l.id
   from locations l left join divisions d on d.id=l.division_id order by l.location_code`);
 console.log('LOCATIONS:');
 for(const r of locs.rows) console.log(`  ${(r.location_code||'?').padEnd(12)} ${r.status}/${r.is_active} div=${r.division_code}  ${r.name}  ${r.id}`);
 const emps=await c.query(`select e.employee_code, e.first_name, e.last_name, e.status, e.is_active, d.division_code, dep.name as dept
   from hr_employees e
   left join employee_divisions ed on ed.employee_id = e.id
   left join divisions d on d.id = ed.division_id
   left join hr_departments dep on dep.id = e.department_id
   limit 10`);
 console.log('\nEMPLOYEE DIV LINKS TABLES?');
 const t=await c.query("select table_name from information_schema.tables where table_schema='public' and table_name like '%division%' order by table_name");
 console.log(t.rows.map(r=>r.table_name).join(', '));
 await c.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
