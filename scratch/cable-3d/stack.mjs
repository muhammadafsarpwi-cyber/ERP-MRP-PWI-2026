import { chromium } from 'playwright';
const b = await chromium.launch({ headless:true, args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-sandbox'] });
const p = await b.newPage({ viewport:{width:800,height:450} });
p.on('pageerror', e => console.log('PAGEERROR:\n' + e.stack));
await p.goto('http://127.0.0.1:8611/index.html', { waitUntil:'load' });
await p.waitForTimeout(6000);
await b.close();
