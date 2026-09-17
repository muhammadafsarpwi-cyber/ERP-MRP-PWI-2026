const fs = require('fs');
const path = require('path');

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'build') scanDir(full);
    } else if (/\.(tsx|ts)$/.test(f)) {
      const content = fs.readFileSync(full, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (/icon=\{/.test(line) && /[✓✔⚡✅❌💡★➔➜⛭⚙📥📤]/.test(line)) {
          console.log(full + ':' + (idx + 1) + ' -> ' + line.trim());
        }
      });
    }
  }
}

scanDir('d:/ERP-MRP-PWI-2026/frontend/src');
