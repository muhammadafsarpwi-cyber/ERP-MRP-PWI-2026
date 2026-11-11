const fs = require('fs');
const path = 'frontend/src/pages/production/packing/HandPackingEntry.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add state addNippleCartons
code = code.replace(
  'const [addNippleWarehouseId, setAddNippleWarehouseId] = useState<string>',
  'const [addNippleCartons, setAddNippleCartons] = useState<number>(0);\n  const [addNippleWarehouseId, setAddNippleWarehouseId] = useState<string>'
);

// 2. In handleOpenAddNippleModal set addNippleCartons
code = code.replace(
  'setAddNippleTargetBatch(r);\n    setAddNippleDate(dayjs());',
  'setAddNippleTargetBatch(r);\n    setAddNippleCartons(r.cartons || 1);\n    setAddNippleDate(dayjs());'
);

// 3. In handleAddNippleSubmit send completedCartons
code = code.replace(
  'const res: any = await apiService.post(`/production/entries/${entryId}/complete-nipple`, {\n          warehouseId: addNippleWarehouseId,\n          completionDate: completionDateStr,\n        });',
  'const res: any = await apiService.post(`/production/entries/${entryId}/complete-nipple`, {\n          warehouseId: addNippleWarehouseId,\n          completionDate: completionDateStr,\n          completedCartons: addNippleCartons,\n        });'
);

fs.writeFileSync(path, code, 'utf8');
console.log('Step 1 applied successfully');
