// Canonical item type order (business-driven, NOT alphabetical and NOT DB
// insertion order). Used by the item master navigation, filter dropdowns and
// forms so the item hierarchy is always presented identically everywhere.
export const ITEM_TYPES = [
  { value: 'RAW_MATERIAL', label: 'Raw Material' },
  { value: 'WORK_IN_PROGRESS', label: 'Work in Progress' },
  { value: 'SEMI_FINISHED', label: 'Semi-Finished' },
  { value: 'FINISHED_GOOD', label: 'Finished Good' },
  { value: 'PACKAGING_MATERIAL', label: 'Packaging Material' },
  { value: 'CONSUMABLE', label: 'Consumable' },
  { value: 'SPARE_PART', label: 'Spare Part' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'ASSET', label: 'Asset' },
  { value: 'OTHER', label: 'Other' },
];

export const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'DISCONTINUED'];

export const ROUTE_TYPES = [
  { value: 'DIRECT_SPOKE', label: 'Direct Spoke' },
  { value: 'STANDARD_SPD', label: 'Standard SPD' },
  { value: 'NIPPLE', label: 'Nipple' },
  { value: 'CCD', label: 'CCD' },
  { value: 'CUSTOM', label: 'Custom' },
];

export const statusColorMap: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'red',
  DISCONTINUED: 'orange',
};

export const TRACKING_SWITCHES = [
  { name: 'isPurchasable', label: 'Purchasable' },
  { name: 'isSellable', label: 'Sellable' },
  { name: 'isManufacturable', label: 'Manufacturable' },
  { name: 'isStockItem', label: 'Stock Item' },
  { name: 'trackInventory', label: 'Track Inventory' },
  { name: 'batchTracked', label: 'Batch Tracked' },
  { name: 'serialTracked', label: 'Serial Tracked' },
  { name: 'expiryTracked', label: 'Expiry Tracked' },
] as const;

export const routeColorMap: Record<string, string> = {
  DIRECT_SPOKE: 'green',
  STANDARD_SPD: 'blue',
  NIPPLE: 'purple',
  CCD: 'orange',
  CUSTOM: 'default',
  CONTROL_CABLE: 'cyan',
  SPOKE: 'geekblue',
};

export interface ProcessStep {
  sequence: number;
  name: string;
}

export interface Item {
  id: string;
  companyId?: string;
  itemCode: string;
  sku?: string | null;
  name: string;
  shortName?: string | null;
  description?: string | null;
  notes?: string | null;
  itemType: string;
  categoryId?: string | null;
  categoryName?: string | null;
  category?: { id: string; categoryCode?: string; name: string } | null;
  company?: { id: string; companyCode?: string; legalName?: string | null; tradeName?: string | null } | null;
  barcode?: string | null;
  manufacturerPartNumber?: string | null;
  brand?: string | null;
  model?: string | null;
  baseUomId?: string | null;
  baseUomName?: string | null;
  baseUom?: { id: string; code?: string; name?: string } | null;
  purchaseUomId?: string | null;
  purchaseUom?: { id: string; code?: string; name?: string } | null;
  salesUomId?: string | null;
  salesUom?: { id: string; code?: string; name?: string } | null;
  divisionId?: string | null;
  sectionId?: string | null;
  departmentId?: string | null;
  divisionName?: string | null;
  sectionName?: string | null;
  departmentName?: string | null;
  division?: { id: string; divisionCode: string; name: string } | null;
  section?: { id: string; sectionCode: string; name: string } | null;
  department?: { id: string; departmentCode: string; name: string } | null;
  wireSizeMm?: number | null;
  diameterMm?: number | null;
  thicknessMm?: number | null;
  widthMm?: number | null;
  routeType?: string | null;
  routeTypeId?: string | null;
  routeTypeRef?: { id: string; routeCode: string; name: string } | null;
  process1?: string | null;
  process2?: string | null;
  process3?: string | null;
  process4?: string | null;
  process5?: string | null;
  process6?: string | null;
  processes?: ProcessStep[] | null;
  finalProduct?: string | null;
  packingNextStep?: string | null;
  weightPerPiece?: number | null;
  piecesPerKg?: number | null;
  weightPerMeter?: number | null;
  lengthPerPiece?: number | null;
  isStockItem?: boolean;
  trackInventory?: boolean;
  batchTracked?: boolean;
  serialTracked?: boolean;
  expiryTracked?: boolean;
  isPurchasable?: boolean;
  isSellable?: boolean;
  isManufacturable?: boolean;
  minimumStockLevel?: number | null;
  maximumStockLevel?: number | null;
  reorderLevel?: number | null;
  safetyStockLevel?: number | null;
  leadTimeDays?: number | null;
  costPrice?: number | null;
  sellingPrice?: number | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  barcodes?: Array<{ id: string; barcodeType?: string; barcode?: string; status?: string }>;
  // TASK #33: Production Flow Mapping
  productionInItemId?: string | null;
  productionInItem?: { id: string; itemCode: string; name: string; wireSizeMm?: number | null; diameterMm?: number | null; lengthPerPiece?: number | null; departmentId?: string | null; itemType?: string; baseUomName?: string | null } | null;
  productionOutItem?: { id: string; itemCode: string; name: string; wireSizeMm?: number | null; diameterMm?: number | null; lengthPerPiece?: number | null; departmentId?: string | null; itemType?: string; baseUomName?: string | null } | null;
}

export interface DivisionOption { id: string; divisionCode: string; name: string; }
export interface SectionOption { id: string; sectionCode: string; name: string; divisionId: string | null; }
export interface DepartmentOption { id: string; departmentCode: string; name: string; divisionId: string | null; sectionId: string | null; }
export interface UomOption { id: string; code: string; name: string; }
export interface SimpleOption { id: string; name: string; }
export interface CategoryOption { id: string; code?: string; name: string; children?: CategoryOption[]; }

export interface ConversionInfo {
  supportedConversions: Array<{ from: string; to: string; available: boolean }>;
}

export type ImportRowStatus = 'VALID' | 'DUPLICATE' | 'INVALID';

export interface ImportRow {
  rowNumber: number;
  data: Record<string, string>;
  payload?: Record<string, unknown>;
  status: ImportRowStatus;
  errors: string[];
}

export const REQUIRED_IMPORT_COLUMNS = ['itemCode', 'name', 'itemType', 'uomCode'] as const;

// Production Flow types (Previous → Current → Next)
export interface ProductionFlowItemSummary {
  id: string;
  itemCode: string;
  name: string;
  itemType: string;
  wireSizeMm?: number | null;
  diameterMm?: number | null;
  thicknessMm?: number | null;
  widthMm?: number | null;
  lengthPerPiece?: number | null;
  baseUomId?: string | null;
  baseUomName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
  sectionId?: string | null;
  sectionName?: string | null;
  sku?: string | null;
  barcode?: string | null;
}

export interface ProductionFlowFullItem extends ProductionFlowItemSummary {
  status: string;
  weightPerPiece?: number | null;
  weightPerMeter?: number | null;
  piecesPerKg?: number | null;
  routeType?: string | null;
  routeTypeId?: string | null;
  routeTypeName?: string | null;
  processes?: Array<{ sequence: number; name: string }>;
  finalProduct?: string | null;
  packingNextStep?: string | null;
}

export interface ProductionFlowRouteStage {
  stageOrder: number;
  stageName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  departmentName?: string | null;
  wireSizeMm?: number | null;
  diameterMm?: number | null;
  thicknessMm?: number | null;
  widthMm?: number | null;
  lengthPerPiece?: number | null;
  baseUomName?: string | null;
  operationName?: string | null;
  isCurrent: boolean;
}

// PROMPT-35: six-stage production flow (RAW → FLATTENING → SPIRAL)
export interface ProductionFlowStage {
  sequence: number;
  kind: 'process' | 'output';
  stageKey: string;
  title: string;
  itemId: string | null;
  itemCode: string | null;
  itemName: string | null;
  itemType: string | null;
  wireSizeMm?: number | null;
  diameterMm?: number | null;
  thicknessMm?: number | null;
  widthMm?: number | null;
  lengthPerPiece?: number | null;
  baseUomName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  operationCode?: string | null;
  operationName?: string | null;
  isCurrent: boolean;
  configured: boolean;
}

export interface ProductionFlowResponse {
  previous: ProductionFlowItemSummary | null;
  current: ProductionFlowFullItem;
  currentOperation: string | null;
  next: {
    items: ProductionFlowItemSummary[];
    operationName: string | null;
  };
  fullRoute: ProductionFlowRouteStage[];
  stages: ProductionFlowStage[];
}

// TASK 12: dynamic stage title for the NEXT PROCESS / NEXT OUTPUT stages,
// derived from the actual next-step operation text. The existing RAW →
// FLATTENING → SPIRAL terminology is preserved whenever the operation is
// spiral-related; other operations receive their own operation-based stage name
// so no stage hard-codes "SPIRAL" for a non-spiral next step.
export const deriveNextStageTitle = (
  text: string,
  kind: 'process' | 'output',
): string => {
  const lower = (text || '').toLowerCase();
  if (lower.includes('spiral')) return kind === 'process' ? 'SPIRAL' : 'SPIRAL OUTPUT';
  if (lower.includes('pvc')) return kind === 'process' ? 'PVC EXTRUSION' : 'PVC OUTPUT';
  if (lower.includes('flatten') || lower.includes('flat')) return kind === 'process' ? 'FLATTENING' : 'FLATTENING OUTPUT';
  if (lower.includes('pack')) return kind === 'process' ? 'PACKING' : 'PACKING OUTPUT';
  if (lower.includes('draw')) return kind === 'process' ? 'WIRE DRAWING' : 'DRAWING OUTPUT';
  return kind === 'process' ? 'NEXT PROCESS' : 'NEXT OUTPUT';
};

export const isEmptyValue = (v?: string | null): boolean =>
  v == null || String(v).trim() === '';

export const IMPORT_COLUMNS = [
  'itemCode', 'name', 'sku', 'shortName', 'itemType', 'uomCode', 'categoryName',
  'divisionCodeOrName', 'sectionCodeOrName', 'departmentCodeOrName', 'wireSizeMm',
  'thicknessMm', 'widthMm', 'routeType', 'process1', 'process2', 'process3',
  'process4', 'process5', 'finalProduct', 'packingNextStep', 'weightPerPiece',
  'piecesPerKg', 'weightPerMeter', 'lengthPerPiece', 'barcode', 'remarks',
];

export const TEMPLATE_CSV =
  'itemCode,name,sku,shortName,itemType,uomCode,categoryName,divisionCodeOrName,sectionCodeOrName,departmentCodeOrName,wireSizeMm,thicknessMm,widthMm,routeType,process1,process2,process3,process4,process5,finalProduct,packingNextStep,weightPerPiece,piecesPerKg,weightPerMeter,lengthPerPiece,barcode,remarks\n' +
  'WIRE-3MM-001,Wire Rod 3mm,,W3,RAW_MATERIAL,KG,,,Spoke,Wire Drawing,3,,,DIRECT_SPOKE,Drawing,Annealing,Packing,,,,,0.0555,18.02,,,,Sample remark\n' +
  'FLAT-040-260-001,0.40 x 2.60 mm Flat Wire [SAMPLE],,FLAT,SEMI_FINISHED,KG,,,Flat Wire,,,0.40,2.60,CCD,Flattening,Spiral,PVC,,,,,0.1150,8.70,,,,Sample remark\n';

