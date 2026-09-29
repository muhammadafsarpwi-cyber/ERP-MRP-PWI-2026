const r = require('./j1.json');
const strip = (s) => (s || '').replace(/\u001b\[[0-9;]*m/g, '');
for (const s of r.testResults) {
  for (const t of s.assertionResults) {
    if (t.status === 'passed') continue;
    const m = strip(t.failureMessages[0] || '');
    if (!m.startsWith('Error: expect(element).toHaveTextContent')) continue;
    const head = m.split('Ignored nodes')[0].trimEnd();
    console.log('### ' + t.fullName.replace(/^VisitorManagement\s*/, '').slice(0, 80));
    console.log(head);
    console.log('---');
  }
}
