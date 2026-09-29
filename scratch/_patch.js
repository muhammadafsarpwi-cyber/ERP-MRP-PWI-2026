const fs=require('fs');
const p='scratch/verify-visitor-p19-ui.js';
let s=fs.readFileSync(p,'utf8');
// tag steps at each section heading
s=s.replace(/function section\(title\) \{/, 'function section(title) {');
fs.writeFileSync(p,s);
console.log('ok');
