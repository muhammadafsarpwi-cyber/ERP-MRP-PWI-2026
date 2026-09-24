/** Run the harness, prefixing each stdout/stderr line with elapsed ms. Does not modify the harness. */
const { spawn } = require('child_process');
const phase = process.argv[2] || 'after';
const t0 = Date.now();
const child = spawn(process.execPath, ['scripts/prompt6-warehouse-location.cjs', phase], { stdio: ['ignore', 'pipe', 'pipe'] });
const stamp = (chunk, isErr) => {
  const el = String(Date.now() - t0);
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (line.trim()) (isErr ? process.stderr : process.stdout).write(`+${el.padStart(7)}ms | ${line}\n`);
  }
};
child.stdout.on('data', (c) => stamp(c, false));
child.stderr.on('data', (c) => stamp(c, true));
child.on('exit', (code) => { console.log(`+${Date.now() - t0}ms | harness exit code ${code}`); process.exit(code ?? 1); });
