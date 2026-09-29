const r = require('./j1.json');
const strip = (s) => (s || '').replace(/\u001b\[[0-9;]*m/g, '');
const which = process.argv[2] || 'division picker';
for (const s of r.testResults) {
  for (const t of s.assertionResults) {
    if (t.status === 'passed') continue;
    if (!t.fullName.includes(which)) continue;
    const msg = strip(t.failureMessages[0] || '');
    console.log('LEN=' + msg.length);
    console.log(msg);
  }
}
