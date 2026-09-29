const r = require('./j1.json');
const strip = (s) => (s || '').replace(/\u001b\[[0-9;]*m/g, '');
let n = 0;
for (const s of r.testResults) {
  for (const t of s.assertionResults) {
    if (t.status === 'passed') continue;
    n++;
    const msg = strip(t.failureMessages[0] || '');
    // First meaningful line + locate root cause
    const firstLines = msg.split('\n').filter(Boolean).slice(0, 4).map(l => '    ' + l.slice(0, 160));
    // Find the "Ignored nodes" DOM boundary to keep dumps short
    const at = msg.indexOf('Ignored nodes');
    const dom = at >= 0 ? msg.slice(0, at) : '';
    console.log('[' + n + '] ' + t.fullName.replace(/^VisitorManagement\s*/, ''));
    console.log(firstLines.join('\n'));
    // Extract just any element bearing a data-testid from the dump
    const ids = [...msg.matchAll(/data-testid="([^"]+)"/g)].map(m => m[1]);
    const uniq = [...new Set(ids)];
    if (uniq.length) console.log('    testids present: ' + uniq.slice(0, 40).join(', '));
    const counts = {};
    for (const m of msg.matchAll(/aria-label="([^"]+)"/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
    const ar = Object.keys(counts);
    if (ar.length) console.log('    aria-labels: ' + ar.slice(0, 20).join(', '));
    console.log('');
  }
}
console.log('TOTAL FAILING: ' + n);
