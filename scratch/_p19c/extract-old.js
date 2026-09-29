const { execSync } = require('child_process');
const fs = require('fs');

// The "before" register is the one the redesign produced and #19C replaced. It
// is not in git (it was never committed), but it IS the removed line of the
// current diff, because #19C is the only thing that touched that handler.
const diff = execSync('git diff -U0 -- frontend/src/pages/visitor/VisitorManagement.tsx', {
  cwd: 'D:/ERP-MRP-PWI-2026',
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const removed = diff.split(/\r?\n/).filter((l) => l.startsWith('-') && !l.startsWith('---'));
const tableHtml = removed.find((l) => l.includes('const tableHtml ='));
if (!tableHtml) {
  console.log('removed lines: ' + removed.length);
  throw new Error('old tableHtml line not found in diff');
}
const body = tableHtml.slice(1);
fs.writeFileSync('scratch/_p19c/old-print-line.txt', body, 'utf8');
console.log('captured old tableHtml line, ' + body.length + ' chars');

const css = /<style>([\s\S]*?)<\/style>/.exec(body);
if (!css) throw new Error('no inline <style> in old template');
console.log('\n--- OLD register CSS ---');
console.log(css[1].replace(/}/g, '}\n'));
