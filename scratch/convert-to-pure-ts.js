const fs = require('fs');

let code = fs.readFileSync('src/pages/ai-assistant/reportGenerator.tsx', 'utf8');

// Replace JSX tags with React.createElement equivalents
// 1. Tag helpers
// <Tag color="blue">⚙️ {v}</Tag> -> React.createElement(Tag, { color: 'blue' }, '⚙️ ' + v)
// <Tag color="green">{v}</Tag> -> React.createElement(Tag, { color: 'green' }, v)

// Replace Tag renders
code = code.replace(/<Tag color="blue">⚙️ \{v\}<\/Tag>/g, "React.createElement(Tag, { color: 'blue' }, '⚙️ ' + v)");
code = code.replace(/<Tag color="green">\{v\}<\/Tag>/g, "React.createElement(Tag, { color: 'green' }, v)");
code = code.replace(/<Tag color="orange">\{v\}<\/Tag>/g, "React.createElement(Tag, { color: 'orange' }, v)");
code = code.replace(/<Tag color="geekblue">🔖 \{v\}<\/Tag>/g, "React.createElement(Tag, { color: 'geekblue' }, '🔖 ' + v)");
code = code.replace(/<Tag color="purple">⏰ \{v\}<\/Tag>/g, "React.createElement(Tag, { color: 'purple' }, '⏰ ' + v)");
code = code.replace(/<Tag color="purple">🎫 \{v\}<\/Tag>/g, "React.createElement(Tag, { color: 'purple' }, '🎫 ' + v)");
code = code.replace(/<Tag color="blue">\{v\} pkgs<\/Tag>/g, "React.createElement(Tag, { color: 'blue' }, v + ' pkgs')");
code = code.replace(/<Tag color="green">\{v\}%<\/Tag>/g, "React.createElement(Tag, { color: 'green' }, v + '%')");

// Operator render (Line 377-383)
code = code.replace(
  /if \(r\?\.isGrandTotal\) \{\s*return <span style=\{\{ fontWeight: 800, color: isDark \? '#34d399' : '#059669', fontSize: 13 \}\}>🏛️ \{v\}<\/span>;\s*\}\s*return <strong style=\{\{ color: isDark \? '#93c5fd' : '#1d4ed8', fontSize: 13 \}\}>👤 \{v\}<\/strong>;/g,
  "if (r?.isGrandTotal) {\n          return React.createElement('span', { style: { fontWeight: 800, color: isDark ? '#34d399' : '#059669', fontSize: 13 } }, '🏛️ ' + v);\n        }\n        return React.createElement('strong', { style: { color: isDark ? '#93c5fd' : '#1d4ed8', fontSize: 13 } }, '👤 ' + v);"
);

// Machine list render (Line 388-392)
code = code.replace(
  /<span style=\{\{ fontSize: 12, color: r\?\.isGrandTotal \? \(isDark \? '#34d399' : '#059669'\) : \(isDark \? '#cbd5e1' : '#475569'\) \}\}>\s*\{v\}\s*<\/span>/g,
  "React.createElement('span', { style: { fontSize: 12, color: r?.isGrandTotal ? (isDark ? '#34d399' : '#059669') : (isDark ? '#cbd5e1' : '#475569') } }, v)"
);

// Achievement render (Line 411-419)
code = code.replace(
  /<Tag\s*color=\{v >= 90 \? 'green' : v >= 75 \? 'orange' : 'red'\}\s*style=\{\{ fontWeight: r\?\.isGrandTotal \? 800 : 600 \}\}\s*>\s*\{v\}%\s*<\/Tag>/g,
  "React.createElement(Tag, { color: v >= 90 ? 'green' : v >= 75 ? 'orange' : 'red', style: { fontWeight: r?.isGrandTotal ? 800 : 600 } }, v + '%')"
);

// Efficiency render (Line 424-428)
code = code.replace(
  /<Tag color=\{v >= 90 \? 'green' : 'orange'\} style=\{\{ fontWeight: r\?\.isGrandTotal \? 800 : 600 \}\}>\s*\{v\}%\s*<\/Tag>/g,
  "React.createElement(Tag, { color: v >= 90 ? 'green' : 'orange', style: { fontWeight: r?.isGrandTotal ? 800 : 600 } }, v + '%')"
);

// Downtime render (Line 438)
code = code.replace(
  /render: \(v: number\) => <Tag color=\{v > 4 \? 'volcano' : 'default'\}>\{v\} hrs<\/Tag>/g,
  "render: (v: number) => React.createElement(Tag, { color: v > 4 ? 'volcano' : 'default' }, v + ' hrs')"
);

// Machine Code tag
code = code.replace(
  /render: \(v: string\) => <Tag color="blue">⚙️ \{v\}<\/Tag>/g,
  "render: (v: string) => React.createElement(Tag, { color: 'blue' }, '⚙️ ' + v)"
);

// Product Name strong
code = code.replace(
  /render: \(v: string\) => <strong>📦 \{v\}<\/strong>/g,
  "render: (v: string) => React.createElement('strong', null, '📦 ' + v)"
);

// Department strong
code = code.replace(
  /r\?\.isGrandTotal \? <span style=\{\{ fontWeight: 800, color: isDark \? '#34d399' : '#059669' \}\}>🏛️ \{v\}<\/span> : <strong>🏢 \{v\}<\/strong>/g,
  "r?.isGrandTotal ? React.createElement('span', { style: { fontWeight: 800, color: isDark ? '#34d399' : '#059669' } }, '🏛️ ' + v) : React.createElement('strong', null, '🏢 ' + v)"
);

// Component strong
code = code.replace(
  /render: \(v: string\) => <strong>🔧 \{v\}<\/strong>/g,
  "render: (v: string) => React.createElement('strong', null, '🔧 ' + v)"
);

// Customer strong
code = code.replace(
  /render: \(v: string\) => <strong>🏢 \{v\}<\/strong>/g,
  "render: (v: string) => React.createElement('strong', null, '🏢 ' + v)"
);

// Date strong
code = code.replace(
  /render: \(v: string\) => <strong>📅 \{dayjs\(v\)\.format\('DD-MMM-YYYY \(ddd\)'\)\}<\/strong>/g,
  "render: (v: string) => React.createElement('strong', null, '📅 ' + dayjs(v).format('DD-MMM-YYYY (ddd)'))"
);
code = code.replace(
  /render: \(v: string\) => <strong>📅 \{v\}<\/strong>/g,
  "render: (v: string) => React.createElement('strong', null, '📅 ' + v)"
);

// Item name strong
code = code.replace(
  /render: \(v: string\) => <strong>\{v\}<\/strong>/g,
  "render: (v: string) => React.createElement('strong', null, v)"
);

// Division column render
code = code.replace(
  /<div>\s*<strong style=\{\{ color: isDark \? '#f8fafc' : '#0f172a' \}\}>\{v\}<\/strong>\s*<div style=\{\{ fontSize: 11, color: isDark \? '#94a3b8' : '#64748b' \}\}>\{r\.code\}<\/div>\s*<\/div>/g,
  "React.createElement('div', null, React.createElement('strong', { style: { color: isDark ? '#f8fafc' : '#0f172a' } }, v), React.createElement('div', { style: { fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' } }, r.code))"
);

// Division UOM tag
code = code.replace(
  /<Tag color=\{r\.code === 'DIV-SPD' \? 'cyan' : r\.code === 'DIV-CCD' \? 'green' : 'orange'\}>\{u\}<\/Tag>/g,
  "React.createElement(Tag, { color: r.code === 'DIV-SPD' ? 'cyan' : r.code === 'DIV-CCD' ? 'green' : 'orange' }, u)"
);

// Priority tag
code = code.replace(
  /<Tag color=\{v === 'CRITICAL' \|\| v === 'HIGH' \? 'red' : 'gold'\}>\{v\}<\/Tag>/g,
  "React.createElement(Tag, { color: v === 'CRITICAL' || v === 'HIGH' ? 'red' : 'gold' }, v)"
);

// Any remaining <span>{formatQty(v)}</span>
code = code.replace(/render: \(v: number\) => <span>\{formatQty\(v\)\}<\/span>/g, "render: (v: number) => formatQty(v)");
code = code.replace(/render: \(v: number\) => <span>\{formatQty\(v\)\} KG<\/span>/g, "render: (v: number) => formatQty(v) + ' KG'");
code = code.replace(/render: \(v: number\) => <span>\{v\}h<\/span>/g, "render: (v: number) => v + 'h'");
code = code.replace(/render: \(v: number\) => <span>\{v\} units<\/span>/g, "render: (v: number) => v + ' units'");
code = code.replace(/render: \(v: number\) => <span>\{v\} staff<\/span>/g, "render: (v: number) => v + ' staff'");
code = code.replace(/render: \(v: any\) => <span>\{v\.size\} machines<\/span>/g, "render: (v: any) => v.size + ' machines'");
code = code.replace(/render: \(v: any\) => <span>\{v\}<\/span>/g, "render: (v: any) => v");

// Production color span
code = code.replace(
  /<span style=\{\{ color: '#3b82f6', fontWeight: 700 \}\}>\{formatQty\(v\)\}<\/span>/g,
  "React.createElement('span', { style: { color: '#3b82f6', fontWeight: 700 } }, formatQty(v))"
);
code = code.replace(
  /<span style=\{\{ fontWeight: 700, color: '#3b82f6' \}\}>\s*\{formatQty\(v\)\} <span style=\{\{ fontSize: 11, fontWeight: 400 \}\}>\{r\.uom\}<\/span>\s*<\/span>/g,
  "React.createElement('span', { style: { fontWeight: 700, color: '#3b82f6' } }, formatQty(v) + ' ' + r.uom)"
);
code = code.replace(
  /render: \(v: number, r: any\) => <span>\{formatQty\(v\)\} \{r\.uom\}<\/span>/g,
  "render: (v: number, r: any) => formatQty(v) + ' ' + r.uom"
);

// Tags in various tables
code = code.replace(/<Tag color=\{v >= 90 \? 'green' : 'orange'\}>\{v\}%<\/Tag>/g, "React.createElement(Tag, { color: v >= 90 ? 'green' : 'orange' }, v + '%')");
code = code.replace(/<Tag color=\{v > 5 \? 'volcano' : 'default'\}>\{v\}h<\/Tag>/g, "React.createElement(Tag, { color: v > 5 ? 'volcano' : 'default' }, v + 'h')");
code = code.replace(/<Tag color=\{v > 5 \? 'volcano' : 'default'\}>\{v\} hrs<\/Tag>/g, "React.createElement(Tag, { color: v > 5 ? 'volcano' : 'default' }, v + ' hrs')");
code = code.replace(/<Tag color=\{v > 2 \? 'volcano' : 'default'\}>\{v\.toFixed\(1\)\}h<\/Tag>/g, "React.createElement(Tag, { color: v > 2 ? 'volcano' : 'default' }, v.toFixed(1) + 'h')");
code = code.replace(/<Tag color=\{r\?\.isGrandTotal \? 'cyan' : r\?\.isSubtotal \? 'blue' : 'gold'\}>/g, "React.createElement(Tag, { color: r?.isGrandTotal ? 'cyan' : r?.isSubtotal ? 'blue' : 'gold' }, ");

fs.writeFileSync('src/pages/ai-assistant/reportGenerator.ts', code);
fs.writeFileSync('src/pages/ai-assistant/reportGenerator.tsx', code);
console.log('Successfully wrote both reportGenerator.ts and reportGenerator.tsx');
