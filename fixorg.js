const fs = require('fs');

// Fix 1: CompanyManagement.tsx - fix modal tag typo
let p1 = 'D:\\ERP-MRP-PWI-2026\\frontend\\src\\pages\\organization\\CompanyManagement.tsx';
let d1 = fs.readFileSync(p1, 'utf8');
let old1 = '<DraggableResizableModal';
let new1 = '<DraggableResizableModal';
let c1 = (d1.split(old1).length - 1);
console.log('CompanyManagement typo count:', c1);
d1 = d1.split(old1).join(new1);
fs.writeFileSync(p1, d1);
console.log('Fixed CompanyManagement.tsx');

// Fix 2: DivisionManagement.tsx - add missing imports
let p2 = 'D:\\ERP-MRP-PWI-2026\\frontend\\src\\pages\\organization\\DivisionManagement.tsx';
let d2 = fs.readFileSync(p2, 'utf8');

// Add Dropdown, Checkbox to antd import
let antdOld = "import { App, Table, Button, Space, Tag, Form, Input, Select, Card, Tree } from 'antd';";
let antdNew = "import { App, Table, Button, Space, Tag, Form, Input, Select, Card, Tree, Dropdown, Checkbox } from 'antd';";
if (d2.includes(antdOld)) {
  d2 = d2.split(antdOld).join(antdNew);
  console.log('Added Dropdown, Checkbox to antd import');
} else {
  console.log('antd import not found');
}

// Add AppstoreOutlined to icons import
let icOld = "import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined } from '@ant-design/icons';";
let icNew = "import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, AppstoreOutlined } from '@ant-design/icons';";
if (d2.includes(icOld)) {
  d2 = d2.split(icOld).join(icNew);
  console.log('Added AppstoreOutlined to icons import');
} else {
  console.log('icons import not found');
}

fs.writeFileSync(p2, d2);
console.log('Fixed DivisionManagement.tsx');