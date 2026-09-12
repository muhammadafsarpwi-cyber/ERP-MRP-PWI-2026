const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({headless:true});
  const ctx = await b.newContext({viewport:{width:1920,height:1080}});
  const p = await ctx.newPage();
  const lr = await p.request.post('http://127.0.0.1:3001/api/v1/auth/login', { data: { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' } });
  const ld = await lr.json();
  await p.goto('http://127.0.0.1:3000', {waitUntil:'domcontentloaded',timeout:15000});
  await p.evaluate(({t,u})=>{localStorage.setItem('token',t);localStorage.setItem('erp_user',JSON.stringify(u))},{t:ld.token,u:ld.user});
  await p.goto('http://127.0.0.1:3000/production/targets',{waitUntil:'domcontentloaded',timeout:15000});
  await p.waitForTimeout(5000);
  const rows = await p.$$eval('table tbody tr', trs=>trs.map((tr,i)=>({
    idx:i,
    cells: tr.querySelectorAll('td').length,
    text: tr.textContent?.trim().substring(0,100),
    classes: tr.className.substring(0,80)
  })));
  console.log('Total rows:',rows.length);
  rows.forEach(r=>console.log(`Row ${r.idx}: cells=${r.cells} class="${r.classes}" text="${r.text}"`));
  
  // Also check audit column content
  const firstRow = rows[0];
  if (firstRow) {
    console.log('\n--- AUDIT CHECK ---');
    const auditCells = await p.$$eval('table tbody tr:first-child td', tds => tds.map((td, i) => ({
      idx: i,
      text: td.textContent?.trim().substring(0, 60)
    })));
    auditCells.forEach(c => console.log(`  Cell ${c.idx}: "${c.text}"`));
  }
  
  await b.close();
})();
