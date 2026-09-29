const r = require('./j1.json');
const strip = (s) => (s || '').replace(/\u001b\[[0-9;]*m/g, '');
for (const s of r.testResults) {
  for (const t of s.assertionResults) {
    if (t.status === 'passed') continue;
    if (!t.fullName.includes('division picker')) continue;
    const msg = strip(t.failureMessages[0] || '');
    let i = msg.indexOf('new-visitor-button');
    while (i >= 0) {
      console.log('---- context @' + i + ' ----');
      console.log(msg.slice(Math.max(0, i - 700), i + 260));
      console.log('');
      i = msg.indexOf('new-visitor-button', i + 1);
    }
    console.log('#### message length: ' + msg.length);
  }
}
