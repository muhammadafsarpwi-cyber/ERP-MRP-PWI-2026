(async()=>{
  const BASE='http://localhost:3001/api/v1';
  const r=await fetch(BASE+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'system.admin@erp.com',password:'Admin#2026!Secure'})});
  const j=await r.json(); const t=j.token||j.data?.token;
  const DIV='d1000000-0000-0000-0000-000000000002';
  for (const q of [
    `/locations?divisionId=${DIV}&status=ACTIVE&limit=500`,
    `/locations?divisionId=${DIV}&limit=500`,
    `/locations?limit=500&status=ACTIVE`,
    `/locations?limit=500`,
    `/visitor/hosts?divisionId=${DIV}&limit=100`,
  ]) {
    const res=await fetch(BASE+q,{headers:{Authorization:'Bearer '+t}});
    const body=await res.json();
    const d=body.data||body;
    console.log(`${res.status} ${q}`);
    console.log('   ', JSON.stringify(Array.isArray(d)? d.slice(0,4).map(x=>({id:x.id,code:x.locationCode,name:x.name,status:x.status,div:x.divisionId,nm:x.name,ec:x.employeeCode})) : d).slice(0,600));
  }
})().catch(e=>{console.error(e.message);process.exit(1)});
