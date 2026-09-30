const fs=require('fs'),path=require('path');
const B='D:/ERP-MRP-PWI-2026/backend';
const jwt=require(path.join(B,'node_modules','jsonwebtoken'));
const env={};
for(const l of fs.readFileSync(path.join(B,'.env'),'utf8').split(/\r?\n/)){const m=/^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim());if(m)env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const token=jwt.sign({sub:'3c8bbf43-d64c-4bb6-b762-ea7b54cf8813',email:'Anasccd71@gmail.com',role:'authenticated',iss:'pwi-local-auth'},env.JWT_SECRET,{expiresIn:'1h'});
const BASE='http://localhost:3001/api/v1';
const SPD='d1000000-0000-0000-0000-000000000001',CCD='d1000000-0000-0000-0000-000000000002';
(async()=>{
 for(const [l,p] of [
  ['sales/orders NO division filter','/sales/orders?limit=200'],
  ['sales/orders ?divisionId=DIV-SPD (out of scope)','/sales/orders?divisionId='+SPD+'&limit=200'],
  ['sales/orders ?divisionId=DIV-CCD (in scope)','/sales/orders?divisionId='+CCD+'&limit=200'],
  ['production/entries ?divisionId=DIV-SPD (out of scope)','/production/entries?divisionId='+SPD+'&limit=200'],
  ['production/orders ?divisionId=DIV-SPD (out of scope)','/production/orders?divisionId='+SPD+'&limit=200'],
 ]){
  const r=await fetch(BASE+p,{headers:{Authorization:'Bearer '+token}});
  const t=await r.text(); let b;try{b=JSON.parse(t)}catch{b=t}
  const n=Array.isArray(b?.data)?b.data.length:'-';
  console.log(`${l.padEnd(48)} -> HTTP ${r.status}  rows=${n}  ${r.status>=400?JSON.stringify(b?.message||b).slice(0,80):''}`);
 }
})();
