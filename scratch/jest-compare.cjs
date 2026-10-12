const fs = require('fs');
const path = require('path');
const base = JSON.parse(fs.readFileSync(path.join('D:', 'ERP-MRP-PWI-2026', 'scratch', 'jest-base.json'), 'utf8'));
const after = JSON.parse(fs.readFileSync(path.join('D:', 'ERP-MRP-PWI-2026', 'scratch', 'jest-after.json'), 'utf8'));

const fails = (r) => {
  const out = [];
  for (const s of r.testResults) for (const a of s.assertionResults ?? []) if (a.status === 'failed') out.push(a.fullName);
  return out;
};

const b = fails(base), a = fails(after);
console.log('BASELINE failures (' + b.length + '):');
b.forEach((n) => console.log('  - ' + n));
console.log('\nAFTER failures (' + a.length + '):');
a.forEach((n) => console.log('  - ' + n));
console.log('\nNEWLY PASSING:');
b.filter((n) => !a.includes(n)).forEach((n) => console.log('  + ' + n));
console.log('\nNEWLY FAILING:');
a.filter((n) => !b.includes(n)).forEach((n) => console.log('  ! ' + n));
