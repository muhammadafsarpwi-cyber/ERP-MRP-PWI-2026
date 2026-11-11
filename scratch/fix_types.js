const fs = require('fs');
const path = 'backend/src/modules/production/services/production-entry.service.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace('entry.actualQuantity = String(remainingPcs);', 'entry.actualQuantity = Number(remainingPcs);');
code = code.replace('actualQuantity: String(deductedPcs),', 'actualQuantity: Number(deductedPcs),');
code = code.replace('}\n\n/**\nexport async function getOperatorDailySummary', '}\n\n/**\n * Standalone TypeORM helper for extracting de-duplicated operator daily summary.\n */\nexport async function getOperatorDailySummary');

fs.writeFileSync(path, code, 'utf8');
console.log('Fixed types and comment');
