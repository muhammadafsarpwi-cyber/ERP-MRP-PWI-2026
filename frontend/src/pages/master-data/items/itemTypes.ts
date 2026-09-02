export const ITEM_TYPES = [
  { value: 'RAW_MATERIAL', label: 'Raw Material' },
  { value: 'PACKAGING_MATERIAL', label: 'Packaging Material' },
  { value: 'CONSUMABLE', label: 'Consumable' },
  { value: 'SEMI_FINISHED', label: 'Semi-Finished' },
  { value: 'FINISHED_GOOD', label: 'Finished Good' },
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
  barcode?: string | null;
  manufacturerPartNumber?: string | null;
  brand?: string | null;
  model?: string | null;
  baseUomId?: string | null;
  baseUomName?: string | null;
  purchaseUomId?: string | null;
  salesUomId?: string | null;
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
  thicknessMm?: number | null;
  widthMm?: number | null;
  routeType?: string | null;
  routeTypeId?: string | null;
  routeTypeRef?: { id: string; routeCode: string; name: string } | null;
  process1?: string | null;
  process2?: string | null;
  process3?: string | null;
  process4?: string | null;
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
  status: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  barcodes?: Array<{ id: string; barcodeType?: string; barcodeValue?: string; status?: string }>;
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

export const IMPORT_COLUMNS = [
  'itemCode', 'name', 'sku', 'shortName', 'itemType', 'uomCode', 'categoryName',
  'divisionCodeOrName', 'sectionCodeOrName', 'departmentCodeOrName', 'wireSizeMm',
  'routeType', 'process1', 'process2', 'process3', 'process4', 'finalProduct',
  'packingNextStep', 'weightPerPiece', 'piecesPerKg', 'weightPerMeter',
  'lengthPerPiece', 'barcode', 'remarks',
];

export const TEMPLATE_CSV =
  'itemCode,name,sku,shortName,itemType,uomCode,categoryName,divisionCodeOrName,sectionCodeOrName,departmentCodeOrName,wireSizeMm,thicknessMm,widthMm,routeType,process1,process2,process3,process4,finalProduct,packingNextStep,weightPerPiece,piecesPerKg,weightPerMeter,lengthPerPiece,barcode,remarks\n' +
  'WIRE-3MM-001,Wire Rod 3mm,,W3,RAW_MATERIAL,KG,,,Spoke,Wire Drawing,3,,,DIRECT_SPOKE,Drawing,Annealing,Packing,,,,0.0555,18.02,,,,Sample remark\n' +
  'FLAT-040-260-001,0.40 x 2.60 mm Flat Wire [SAMPLE],,FLAT,SEMI_FINISHED,KG,,,Flat Wire,,,0.40,2.60,CCD,Flattening,Spiral,PVC,,,,0.1150,8.70,,,,Sample remark\n';
