const fs = require('fs');

let code = fs.readFileSync('src/pages/ai-assistant/reportGenerator.ts', 'utf8');

// 396
code = code.replace(
  /render: \(v: number\) => <span style=\{\{ color: '#10b981', fontWeight: 600 \}\}>\{formatQty\(v\)\}<\/span>/g,
  "render: (v: number) => React.createElement('span', { style: { color: '#10b981', fontWeight: 600 } }, formatQty(v))"
);

// 403
code = code.replace(
  /<span style=\{\{ color: r\?\.isGrandTotal \? \(isDark \? '#34d399' : '#059669'\) : '#3b82f6', fontWeight: 700 \}\}>\s*\{formatQty\(v\)\}\s*<\/span>/g,
  "React.createElement('span', { style: { color: r?.isGrandTotal ? (isDark ? '#34d399' : '#059669') : '#3b82f6', fontWeight: 700 } }, formatQty(v))"
);

// 413
code = code.replace(
  /<Tag color=\{v >= 100 \? 'green' : v >= 80 \? 'cyan' : v >= 60 \? 'orange' : 'volcano'\} style=\{\{ fontWeight: r\?\.isGrandTotal \? 800 : 600 \}\}>\s*\{v\}%\s*<\/Tag>/g,
  "React.createElement(Tag, { color: v >= 100 ? 'green' : v >= 80 ? 'cyan' : v >= 60 ? 'orange' : 'volcano', style: { fontWeight: r?.isGrandTotal ? 800 : 600 } }, v + '%')"
);

// 428
code = code.replace(
  /render: \(v: number\) => <Tag color=\{v > 3 \? 'volcano' : 'default'\}>\{v\}h<\/Tag>/g,
  "render: (v: number) => React.createElement(Tag, { color: v > 3 ? 'volcano' : 'default' }, v + 'h')"
);

// 434
code = code.replace(
  /render: \(v: number\) => <span style=\{\{ color: v > 0 \? '#ef4444' : 'inherit' \}\}>\{formatQty\(v\)\}<\/span>/g,
  "render: (v: number) => React.createElement('span', { style: { color: v > 0 ? '#ef4444' : 'inherit' } }, formatQty(v))"
);

// 589
code = code.replace(
  /\? <span style=\{\{ fontWeight: 800, color: isDark \? '#34d399' : '#059669' \}\}>🏛️ \{v\}<\/span>\s*: <strong style=\{\{ color: isDark \? '#93c5fd' : '#1d4ed8' \}\}>👤 \{v\}<\/strong>/g,
  "? React.createElement('span', { style: { fontWeight: 800, color: isDark ? '#34d399' : '#059669' } }, '🏛️ ' + v) : React.createElement('strong', { style: { color: isDark ? '#93c5fd' : '#1d4ed8' } }, '👤 ' + v)"
);

// 599
code = code.replace(
  /\? <span>\{v\}<\/span>\s*: <Tag color="blue" style=\{\{ fontWeight: 700 \}\}>⚙️ \{v\}<\/Tag>/g,
  "? v : React.createElement(Tag, { color: 'blue', style: { fontWeight: 700 } }, '⚙️ ' + v)"
);

// 608
code = code.replace(
  /render: \(v: number\) => <span style=\{\{ color: '#10b981', fontWeight: 600 \}\}>\{formatQty\(v\)\}<\/span>/g,
  "render: (v: number) => React.createElement('span', { style: { color: '#10b981', fontWeight: 600 } }, formatQty(v))"
);

// 625
code = code.replace(
  /<Tag color=\{v >= 100 \? 'green' : v >= 80 \? 'cyan' : 'orange'\} style=\{\{ fontWeight: r\?\.isGrandTotal \? 800 : 600 \}\}>\s*\{v\}%\s*<\/Tag>/g,
  "React.createElement(Tag, { color: v >= 100 ? 'green' : v >= 80 ? 'cyan' : 'orange', style: { fontWeight: r?.isGrandTotal ? 800 : 600 } }, v + '%')"
);

// 631
code = code.replace(
  /\{ title: 'Downtime', dataIndex: 'downtimeHours', key: 'downtimeHours', render: \(v: number\) => <Tag color=\{v > 2 \? 'volcano' : 'default'\}>\{v\}h<\/Tag> \}/g,
  "{ title: 'Downtime', dataIndex: 'downtimeHours', key: 'downtimeHours', render: (v: number) => React.createElement(Tag, { color: v > 2 ? 'volcano' : 'default' }, v + 'h') }"
);

// 758
code = code.replace(
  /\? <span style=\{\{ fontWeight: 800, color: isDark \? '#34d399' : '#059669' \}\}>🏛️ \{v\}<\/span>\s*: <strong style=\{\{ color: isDark \? '#93c5fd' : '#1d4ed8' \}\}>👤 \{v\}<\/strong>/g,
  "? React.createElement('span', { style: { fontWeight: 800, color: isDark ? '#34d399' : '#059669' } }, '🏛️ ' + v) : React.createElement('strong', { style: { color: isDark ? '#93c5fd' : '#1d4ed8' } }, '👤 ' + v)"
);

// 767
code = code.replace(
  /r\?\.isGrandTotal \? <span>\{v\}<\/span> : React\.createElement\(Tag, \{ color: 'purple' \}, '⏰ ' \+ v\)/g,
  "r?.isGrandTotal ? v : React.createElement(Tag, { color: 'purple' }, '⏰ ' + v)"
);

// 776
code = code.replace(
  /<span style=\{\{ color: r\?\.isGrandTotal \? '#10b981' : '#3b82f6', fontWeight: 700 \}\}>\{formatQty\(v\)\}<\/span>/g,
  "React.createElement('span', { style: { color: r?.isGrandTotal ? '#10b981' : '#3b82f6', fontWeight: 700 } }, formatQty(v))"
);

// 867-868
code = code.replace(
  /\{ title: 'Operator', dataIndex: 'operator', key: 'operator', render: \(v: string\) => <strong>👤 \{v\}<\/strong> \}/g,
  "{ title: 'Operator', dataIndex: 'operator', key: 'operator', render: (v: string) => React.createElement('strong', null, '👤 ' + v) }"
);
code = code.replace(
  /\{ title: 'Product \/ Item Name', dataIndex: 'item', key: 'item', render: \(v: string\) => <span>📦 \{v\}<\/span> \}/g,
  "{ title: 'Product / Item Name', dataIndex: 'item', key: 'item', render: (v: string) => '📦 ' + v }"
);

// 912
code = code.replace(
  /\{ title: 'Operator', dataIndex: 'operator', key: 'operator', render: \(v: string\) => <span>👤 \{v\}<\/span> \}/g,
  "{ title: 'Operator', dataIndex: 'operator', key: 'operator', render: (v: string) => '👤 ' + v }"
);

// 954-955
code = code.replace(
  /\{ title: 'Month', dataIndex: 'ym', key: 'ym', render: \(v: string\) => <strong>📅 \{dayjs\(v\)\.format\('MMMM YYYY'\)\}<\/strong> \}/g,
  "{ title: 'Month', dataIndex: 'ym', key: 'ym', render: (v: string) => React.createElement('strong', null, '📅 ' + dayjs(v).format('MMMM YYYY')) }"
);
code = code.replace(
  /\{ title: 'Operator', dataIndex: 'operator', key: 'operator', render: \(v: string\) => <span>👤 \{v\}<\/span> \}/g,
  "{ title: 'Operator', dataIndex: 'operator', key: 'operator', render: (v: string) => '👤 ' + v }"
);

// 1141-1146
code = code.replace(
  /if \(r\?\.isGrandTotal\) \{\s*return <span style=\{\{ fontWeight: 800, color: isDark \? '#34d399' : '#059669', fontSize: 13 \}\}>🏛️ \{v\}<\/span>;\s*\}\s*if \(r\?\.isSubtotal\) \{\s*return <span style=\{\{ fontWeight: 700, color: isDark \? '#93c5fd' : '#1d4ed8', fontSize: 12\.5 \}\}>📊 \{v\}<\/span>;\s*\}\s*return <strong style=\{\{ color: isDark \? '#93c5fd' : '#1d4ed8', fontSize: 13 \}\}>\{v\}<\/strong>;/g,
  "if (r?.isGrandTotal) {\n          return React.createElement('span', { style: { fontWeight: 800, color: isDark ? '#34d399' : '#059669', fontSize: 13 } }, '🏛️ ' + v);\n        }\n        if (r?.isSubtotal) {\n          return React.createElement('span', { style: { fontWeight: 700, color: isDark ? '#93c5fd' : '#1d4ed8', fontSize: 12.5 } }, '📊 ' + v);\n        }\n        return React.createElement('strong', { style: { color: isDark ? '#93c5fd' : '#1d4ed8', fontSize: 13 } }, v);"
);

// 1154
code = code.replace(
  /<span style=\{\{ fontSize: 12, color: r\?\.isGrandTotal \|\| r\?\.isSubtotal \? 'inherit' : \(isDark \? '#cbd5e1' : '#475569'\) \}\}>\s*\{v\}\s*<\/span>/g,
  "React.createElement('span', { style: { fontSize: 12, color: r?.isGrandTotal || r?.isSubtotal ? 'inherit' : (isDark ? '#cbd5e1' : '#475569') } }, v)"
);

// 1164
code = code.replace(
  /<span style=\{\{ color: '#10b981', fontWeight: r\?\.isGrandTotal \|\| r\?\.isSubtotal \? 800 : 600 \}\}>\{formatQty\(v\)\}<\/span>/g,
  "React.createElement('span', { style: { color: '#10b981', fontWeight: r?.isGrandTotal || r?.isSubtotal ? 800 : 600 } }, formatQty(v))"
);

// 1693
code = code.replace(
  /\{ title: 'Downtime \(hrs\)', dataIndex: 'downtime', key: 'downtime', render: \(v: number\) => <span>\{v\.toFixed\(1\)\}h<\/span> \}/g,
  "{ title: 'Downtime (hrs)', dataIndex: 'downtime', key: 'downtime', render: (v: number) => v.toFixed(1) + 'h' }"
);

// 1813
code = code.replace(
  /<span style=\{\{ color: v >= 0 \? '#10b981' : '#ef4444', fontWeight: 700 \}\}>\s*\{v >= 0 \? '\+' : ''\}\{formatQty\(v\)\}\s*<\/span>/g,
  "React.createElement('span', { style: { color: v >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 } }, (v >= 0 ? '+' : '') + formatQty(v))"
);

// 1823
code = code.replace(
  /<Tag color=\{v >= 0 \? 'green' : 'red'\}>\s*\{v >= 0 \? '\+' : ''\}\{v\}%\s*<\/Tag>/g,
  "React.createElement(Tag, { color: v >= 0 ? 'green' : 'red' }, (v >= 0 ? '+' : '') + v + '%')"
);

fs.writeFileSync('src/pages/ai-assistant/reportGenerator.ts', code);
fs.writeFileSync('src/pages/ai-assistant/reportGenerator.tsx', code);
console.log('Finished pass 2!');
