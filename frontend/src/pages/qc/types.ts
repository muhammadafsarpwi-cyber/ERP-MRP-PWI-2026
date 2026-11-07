export interface DimensionalCharacteristic {
  id: string;
  charName: string;
  nominal: number;
  tolPlus: number;
  tolMinus: number;
  unit: string;
  isCritical?: boolean;
}

export interface InspectionSampleRow extends DimensionalCharacteristic {
  s1?: number | null;
  s2?: number | null;
  s3?: number | null;
  s4?: number | null;
  s5?: number | null;
  average?: number | null;
  status: 'PASS' | 'FAIL' | 'PENDING';
  deviation?: string;
}

export interface AttributeCheckItem {
  id: string;
  checkName: string;
  checkedQty: number;
  defectsQty: number;
  status: 'PASS' | 'FAIL';
  remarks?: string;
}

export interface QmsInProcessInspection {
  id: string;
  inspectionNo: string;
  docRef: string; // e.g. 'SPD/QMS/05'
  revNo: string; // e.g. '02'
  issueDate: string; // e.g. '09-Jun-2022'
  inspectionDate: string; // 'YYYY-MM-DD'
  shift: string; // 'G', 'A', 'B', 'C'
  divisionId?: string;
  divisionName: string; // e.g. 'Spoke Division'
  departmentId?: string;
  departmentName: string; // e.g. 'Spoke'
  machineNo: string; // e.g. '01' / 'SPK-01'
  operatorName: string; // e.g. 'Ashfaq'
  itemId?: string;
  itemCode: string; // e.g. 'WIP-SPK-014'
  itemName: string; // e.g. 'S9 (Outer)'
  inspectorName: string; // e.g. 'Mairaj'
  approvedBy?: string; // e.g. 'Quality Control Incharge'
  overallResult: 'PASS' | 'FAIL' | 'PENDING';
  remarks?: string;
  samples: InspectionSampleRow[];
  attributes: AttributeCheckItem[];
  createdAt: string;
}

export interface ItemQcSpecification {
  id: string;
  divisionCode: string;
  departmentCode: string;
  itemId?: string;
  itemCode: string;
  itemName: string;
  docRef: string;
  revNo: string;
  issueDate: string;
  characteristics: DimensionalCharacteristic[];
  attributes: Array<{
    id: string;
    checkName: string;
    sampleSize: number;
    maxAllowedDefects: number;
  }>;
  updatedAt: string;
}

