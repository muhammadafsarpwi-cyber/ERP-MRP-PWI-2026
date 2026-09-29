const fs = require('fs');
const d = fs.readFileSync('scratch/_p19c/vm.diff', 'utf8').split(/\r?\n/);
console.log('diff lines: ' + d.length);
for (const tok of ['tableHtml', 'window.open', 'Visitor Register', 'printHtmlContent', '--- ', '@page']) {
  const hits = d.map((l, i) => [i + 1, l]).filter(([, l]) => l.includes(tok));
  console.log('  ' + tok + ': ' + hits.length + ' -> ' + hits.slice(0, 6).map(([n, l]) => n + '(len ' + l.length + ')').join(', '));
}
const longest = d.map((l, i) => [i + 1, l.length]).sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log('longest diff lines: ' + JSON.stringify(longest));
