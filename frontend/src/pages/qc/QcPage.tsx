import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  App,
  Row,
  Col,
  Tag,
  Tabs,
  Statistic,
  Typography,
  Segmented,
  Drawer,
  Divider,
  theme,
} from 'antd';
import {
  PlusOutlined,
  CheckOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  PrinterOutlined,
  WhatsAppOutlined,
  SettingOutlined,
  ReloadOutlined,
  FilePdfOutlined,
  HistoryOutlined,
  EditOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader } from '../../components/shared';
import { QmsInProcessInspection, ItemQcSpecification, InspectionSampleRow, AttributeCheckItem } from './types';
import {
  loadInProcessInspections,
  saveInProcessInspections,
  loadAllSpecs,
  saveAllSpecs,
} from './qcSpecsStore';
import { InProcessInspectionModal } from './InProcessInspectionModal';
import { QmsPrintableSheet } from './QmsPrintableSheet';
import { ItemQcSpecsMaster } from './ItemQcSpecsMaster';
import { exportQmsToPdf } from './exportQmsPdf';
import { RunningInspectionsHistoryModal } from './RunningInspectionsHistoryModal';

interface LegacyInspection {
  id: string;
  inspectionNo: string;
  inspectionType: string;
  result: string;
  status: string;
  quantity?: number;
}

// Authoritative PWI Divisions
const PWI_DIVISIONS = [
  { id: 'd1000000-0000-0000-0000-000000000001', code: 'DIV-SPD', name: 'Spoke Division' },
  { id: 'd1000000-0000-0000-0000-000000000002', code: 'DIV-CCD', name: 'Control Cable Division' },
  { id: '50824516-9c24-4122-86e7-c8e6fa1c5869', code: 'DIV-001', name: 'Manufacturing Division' },
];

// Authoritative Departments per Division
const PWI_DEPARTMENTS: Record<string, Array<{ id: string; code: string; name: string }>> = {
  'DIV-SPD': [
    { id: 'd3000000-0000-0000-0000-000000000003', code: 'SPD-DEPT003', name: 'Spoke' },
    { id: 'd3000000-0000-0000-0000-000000000001', code: 'SPD-DEPT001', name: 'Straightener' },
    { id: 'd3000000-0000-0000-0000-000000000002', code: 'SPD-DEPT002', name: 'Swagging' },
    { id: 'd3000000-0000-0000-0000-000000000004', code: 'SPD-DEPT004', name: 'Header' },
    { id: 'd3000000-0000-0000-0000-000000000005', code: 'SPD-DEPT005', name: 'Nipple' },
    { id: 'd3000000-0000-0000-0000-000000000006', code: 'SPD-DEPT006', name: 'Spoke Plating' },
    { id: 'd3000000-0000-0000-0000-000000000008', code: 'SPD-DEPT008', name: 'Spoke Packing' },
  ],
  'DIV-CCD': [
    { id: 'd3000000-0000-0000-0000-000000000010', code: 'CCD-DEPT001', name: 'Flattening' },
    { id: 'd3000000-0000-0000-0000-000000000011', code: 'CCD-DEPT002', name: 'Spiral' },
    { id: 'd3000000-0000-0000-0000-000000000012', code: 'CCD-DEPT003', name: 'PVC' },
    { id: '5676c09a-f334-43a8-8309-f43d99e01320', code: 'CCD-DEPT005', name: 'Cutting & Packing' },
  ],
  'DIV-001': [
    { id: 'cfac6089-9a19-403a-b37d-7b2622c2d01c', code: 'DEPT-001', name: 'Production' },
    { id: '8a7f2b26-194d-4e78-af3b-4a851fb1719e', code: 'DEPT-005', name: 'Quality Control' },
  ],
};

// Authoritative Machines per Department (Exact Supabase mapping)
const DEPARTMENT_MACHINES: Record<string, Array<{ code: string; name: string }>> = {
  // Spoke Division
  'SPD-DEPT003': [
    { code: 'SPK-01', name: 'SPK-01 (Machine 01)' },
    { code: 'SPK-02', name: 'SPK-02 (Machine 02)' },
    { code: 'SPK-03', name: 'SPK-03 (Machine 03)' },
    { code: 'SPK-04', name: 'SPK-04 (Machine 04)' },
    { code: 'SPK-05', name: 'SPK-05 (Machine 05)' },
    { code: 'SPK-06', name: 'SPK-06 (Machine 06)' },
    { code: 'SPK-07', name: 'SPK-07 (Machine 07)' },
  ],
  'SPD-DEPT001': [
    { code: 'ST-01', name: 'ST-01 (Straightener Machine 01)' },
    { code: 'ST-02', name: 'ST-02 (Straightener Machine 02)' },
    { code: 'ST-03', name: 'ST-03 (Straightener Machine 03)' },
    { code: 'ST-04', name: 'ST-04 (Straightener Machine 04)' },
    { code: 'ST-05', name: 'ST-05 (Straightener Machine 05)' },
  ],
  'SPD-DEPT002': [
    { code: 'SW-01', name: 'SW-01 (Swagging Machine 01)' },
    { code: 'SW-02', name: 'SW-02 (Swagging Machine 02)' },
    { code: 'SW-03', name: 'SW-03 (Swagging Machine 03)' },
    { code: 'SW-04', name: 'SW-04 (Swagging Machine 04)' },
    { code: 'SW-05', name: 'SW-05 (Swagging Machine 05)' },
    { code: 'SW-06', name: 'SW-06 (Swagging Machine 06)' },
  ],
  'SPD-DEPT004': [
    { code: 'HD-01', name: 'HD-01 (Header Machine 01)' },
    { code: 'HD-02', name: 'HD-02 (Header Machine 02)' },
  ],
  'SPD-DEPT005': [
    { code: 'NP-01', name: 'NP-01 (Nipple Machine 01)' },
    { code: 'NP-02', name: 'NP-02 (Nipple Machine 02)' },
  ],
  'SPD-DEPT006': [
    { code: 'SPL-01', name: 'SPL-01 (Spoke Plating Line 01)' },
    { code: 'BL-01', name: 'BL-01 (Barrel Machine 01)' },
    { code: 'BL-02', name: 'BL-02 (Barrel Machine 02)' },
    { code: 'BL-03', name: 'BL-03 (Barrel Machine 03)' },
    { code: 'BL-04', name: 'BL-04 (Barrel Machine 04)' },
  ],
  'SPD-DEPT008': [
    { code: 'PKS-01', name: 'PKS-01 (Spoke Packing Station 01)' },
    { code: 'PKS-02', name: 'PKS-02 (Spoke Packing Station 02)' },
  ],
  // Control Cable Division
  'CCD-DEPT001': [
    { code: 'FL-01', name: 'FL-01 (Flattening Machine 01)' },
    { code: 'FL-02', name: 'FL-02 (Flattening Machine 02)' },
    { code: 'FT-01', name: 'FT-01 (Flattening Machine FT-01)' },
    { code: 'FT-02', name: 'FT-02 (Flattening Machine FT-02)' },
    { code: 'FT-03', name: 'FT-03 (Flattening Machine FT-03)' },
    { code: 'FT-04', name: 'FT-04 (Flattening Machine FT-04)' },
  ],
  'CCD-DEPT004': [
    { code: 'CPK-01', name: 'CPK-01 (CCD Packing Station 01)' },
    { code: 'PK-01', name: 'PK-01 (Packing Station PK-01)' },
    { code: 'PK-02', name: 'PK-02 (Packing Station PK-02)' },
  ],
  'CCD-DEPT003': [
    { code: 'PV-01', name: 'PV-01 (PVC Coating Line 01)' },
  ],
};

const DEFAULT_OPERATORS = [
  { value: 'Ashfaq', label: 'Ashfaq' },
  { value: 'Ali Asghar', label: 'Ali Asghar' },
  { value: 'Afroze', label: 'Afroze' },
  { value: 'Amjad Ali', label: 'Amjad Ali' },
  { value: 'Arsalan', label: 'Arsalan' },
  { value: 'Sajeel', label: 'Sajeel' },
];

const SHIFT_OPTIONS = [
  { value: 'G', label: 'Shift G (General)' },
  { value: 'A', label: 'Shift A (Morning)' },
  { value: 'B', label: 'Shift B (Evening)' },
  { value: 'C', label: 'Shift C (Night)' },
];

const QcPage: React.FC = () => {
  const { token } = theme.useToken();
  const { message } = App.useApp();

  // Cascading Division & Department state
  const [selectedDivisionCode, setSelectedDivisionCode] = useState<string>('DIV-SPD');
  const [selectedDepartmentCode, setSelectedDepartmentCode] = useState<string>('SPD-DEPT003');

  // Specs & In-Process Inspections
  const [specs, setSpecs] = useState<ItemQcSpecification[]>([]);
  const [inProcessInspections, setInProcessInspections] = useState<QmsInProcessInspection[]>([]);
  const [activeInspectionId, setActiveInspectionId] = useState<string>('');

  // Modals & Drawers
  const [runningModalVisible, setRunningModalVisible] = useState(false);
  const [sheetModalVisible, setSheetModalVisible] = useState(false);
  const [historyDrawerVisible, setHistoryDrawerVisible] = useState(false);
  const [selectedInspectionForSheet, setSelectedInspectionForSheet] = useState<QmsInProcessInspection | null>(null);

  // Filter state for In-Process inspections
  const [filterShift, setFilterShift] = useState<string>('ALL');
  const [filterMachine, setFilterMachine] = useState<string>('ALL');
  const [filterResult, setFilterResult] = useState<string>('ALL');

  // Legacy data state (Incoming / GRN inspections, NCR, CAPA)
  const [legacyData, setLegacyData] = useState<LegacyInspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [companyId, setCompanyId] = useState('');
  const [plans, setPlans] = useState<Array<{ id: string; planCode: string; planName: string }>>([]);
  const [items, setItems] = useState<Array<{ id: string; itemCode: string; name: string }>>([]);
  const [ncrData, setNcrData] = useState<any[]>([]);
  const [capaData, setCapaData] = useState<any[]>([]);

  // Load user & initialize store
  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try {
        const p = JSON.parse(erpUser);
        if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId);
      } catch {
        /* ignore */
      }
    }
    const loadedSpecs = loadAllSpecs();
    setSpecs(loadedSpecs);
    const loadedInsps = loadInProcessInspections();
    setInProcessInspections(loadedInsps);
    if (loadedInsps.length > 0) {
      setActiveInspectionId(loadedInsps[0].id);
    }
  }, []);

  // Fetch legacy backend QC data
  const fetchData = useCallback(
    async (pageNum = 1) => {
      if (!companyId) return;
      setLoading(true);
      try {
        const res = await apiService.get<{ data: LegacyInspection[]; total: number }>('/qc/inspections', {
          companyId,
          page: pageNum,
          limit: 20,
        });
        setLegacyData(res.data || []);
        setTotal(res.total || 0);

        const n = await apiService.get<{ data: any[] }>('/qc/ncr', { companyId, limit: 20 });
        setNcrData(n.data || []);

        const c = await apiService.get<{ data: any[] }>('/qc/capa', { companyId, limit: 20 });
        setCapaData(c.data || []);
      } catch {
        // Soft fallback
      } finally {
        setLoading(false);
      }
    },
    [companyId],
  );

  useEffect(() => {
    if (!companyId) return;
    fetchData(page);

    (async () => {
      try {
        const p = await apiService.get<{ data: Array<{ id: string; planCode: string; planName: string }> }>('/qc/plans', { companyId });
        setPlans(p.data || []);
      } catch {
        /* ignore */
      }
    })();
  }, [companyId, fetchData, page]);

  // Active division, departments, machines cascading resolution
  const activeDivision = useMemo(() => {
    return PWI_DIVISIONS.find((d) => d.code === selectedDivisionCode) || PWI_DIVISIONS[0];
  }, [selectedDivisionCode]);

  // Dynamically fetch items for active division (loads up to 2000 items, cleans cross-division)
  const fetchItemsForDivision = useCallback(async (divId?: string, divCode?: string) => {
    try {
      const targetDiv = divId || activeDivision?.id;
      const res = await apiService.get<{ data: Array<{ id: string; itemCode: string; name: string; divisionId?: string }> }>(
        '/master-data/items',
        { divisionId: targetDiv, limit: 2000 }
      );
      let list = res.data || [];
      const code = divCode || selectedDivisionCode;
      if (code === 'DIV-SPD') {
        list = list.filter(
          (i) => !i.itemCode?.toUpperCase().startsWith('CCD-') && !i.itemCode?.toUpperCase().startsWith('FLAT')
        );
      } else if (code === 'DIV-CCD') {
        list = list.filter(
          (i) =>
            !i.itemCode?.toUpperCase().startsWith('WIP-SPK') &&
            !i.itemCode?.toUpperCase().startsWith('WIP-ST') &&
            !i.itemCode?.toUpperCase().startsWith('WIP-SW') &&
            !i.itemCode?.toUpperCase().startsWith('WIP-HD') &&
            !i.itemCode?.toUpperCase().startsWith('WIP-NPL') &&
            !i.itemCode?.toUpperCase().startsWith('WIP-SPL')
        );
      }
      setItems(list);
    } catch {
      // Soft fallback
    }
  }, [activeDivision?.id, selectedDivisionCode]);

  useEffect(() => {
    if (activeDivision?.id) {
      fetchItemsForDivision(activeDivision.id, activeDivision.code);
    }
  }, [activeDivision?.id, activeDivision?.code, fetchItemsForDivision]);

  const activeDepartmentsList = useMemo(() => {
    return PWI_DEPARTMENTS[selectedDivisionCode] || [];
  }, [selectedDivisionCode]);

  const activeDepartment = useMemo(() => {
    return activeDepartmentsList.find((d) => d.code === selectedDepartmentCode) || activeDepartmentsList[0];
  }, [activeDepartmentsList, selectedDepartmentCode]);

  // Cascading machines list strictly for the selected department
  const activeMachinesList = useMemo(() => {
    return DEPARTMENT_MACHINES[selectedDepartmentCode] || [
      { code: '01', name: 'Machine 01' },
      { code: '02', name: 'Machine 02' },
    ];
  }, [selectedDepartmentCode]);

  // Handle cascading division change
  const handleDivisionChange = (divCode: string) => {
    setSelectedDivisionCode(divCode);
    const depts = PWI_DEPARTMENTS[divCode] || [];
    if (depts.length > 0) {
      const firstDeptCode = depts[0].code;
      setSelectedDepartmentCode(firstDeptCode);
      // Reset machine filter when department changes
      setFilterMachine('ALL');
    }
  };

  // Handle department change
  const handleDepartmentChange = (deptCode: string) => {
    setSelectedDepartmentCode(deptCode);
    setFilterMachine('ALL');
  };

  // Currently active hero inspection displayed in the mockup view
  const currentHeroInspection: QmsInProcessInspection | null = useMemo(() => {
    if (inProcessInspections.length === 0) return null;
    const found = inProcessInspections.find((i) => i.id === activeInspectionId);
    return found || inProcessInspections[0];
  }, [inProcessInspections, activeInspectionId]);

  // Filtered in-process inspections for audit drawer
  const filteredInspections = useMemo(() => {
    return inProcessInspections.filter((insp) => {
      if (filterShift !== 'ALL' && insp.shift !== filterShift) return false;
      if (filterMachine !== 'ALL' && !insp.machineNo.includes(filterMachine)) return false;
      if (filterResult !== 'ALL' && insp.overallResult !== filterResult) return false;
      return true;
    });
  }, [inProcessInspections, filterShift, filterMachine, filterResult]);

  // Save new/edited inspection
  const handleSaveInspection = (newInsp: QmsInProcessInspection) => {
    const existingIdx = inProcessInspections.findIndex((i) => i.id === newInsp.id);
    let updated: QmsInProcessInspection[];
    if (existingIdx >= 0) {
      updated = inProcessInspections.map((i) => (i.id === newInsp.id ? newInsp : i));
    } else {
      updated = [newInsp, ...inProcessInspections];
    }
    setInProcessInspections(updated);
    saveInProcessInspections(updated);
    setActiveInspectionId(newInsp.id);

    // Also attempt saving to backend /qc/inspections
    if (companyId) {
      apiService
        .post('/qc/inspections', {
          companyId,
          inspectionType: 'IN_PROCESS',
          inspectionDate: newInsp.inspectionDate,
          remarks: JSON.stringify({
            docRef: newInsp.docRef,
            revNo: newInsp.revNo,
            shift: newInsp.shift,
            machineNo: newInsp.machineNo,
            operatorName: newInsp.operatorName,
            itemCode: newInsp.itemCode,
            itemName: newInsp.itemName,
            inspectorName: newInsp.inspectorName,
            overallResult: newInsp.overallResult,
            samplesCount: newInsp.samples.length,
          }),
        })
        .catch(() => {
          /* soft fallback */
        });
    }
  };

  // Open QMS printable sheet
  const handleOpenSheet = (insp: QmsInProcessInspection | null) => {
    if (!insp) return;
    setSelectedInspectionForSheet(insp);
    setSheetModalVisible(true);
  };

  // Quick WhatsApp Share for active inspection
  const handleShareActiveWhatsApp = () => {
    if (!currentHeroInspection) return;
    const lines: string[] = [];
    lines.push('🏭 *PAKISTAN WIRE INDUSTRIES (PVT.) LTD*');
    lines.push('📋 *IN-PROCESS QUALITY INSPECTION REPORT (QMS)*');
    lines.push(`📄 *Doc Ref:* ${currentHeroInspection.docRef} | *Rev:* ${currentHeroInspection.revNo} | *Date:* ${currentHeroInspection.issueDate}`);
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🏢 *Division:* ${currentHeroInspection.divisionName}`);
    lines.push(`🏭 *Department:* ${currentHeroInspection.departmentName}`);
    lines.push(`📅 *Date:* ${currentHeroInspection.inspectionDate} | *Shift:* ${currentHeroInspection.shift}`);
    lines.push(`⚙️ *Machine:* ${currentHeroInspection.machineNo} | *Operator:* ${currentHeroInspection.operatorName}`);
    lines.push(`📦 *Part / Item:* *${currentHeroInspection.itemName}* (${currentHeroInspection.itemCode})`);
    lines.push(`👨‍🔬 *Prepared By:* ${currentHeroInspection.inspectorName}`);
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('📏 *DIMENSIONAL CHECKS (5 SAMPLES):*');
    currentHeroInspection.samples.forEach((s, idx) => {
      const tolStr = `(±${s.tolPlus}${s.unit})`;
      lines.push(`${idx + 1}. *${s.charName}* [Dimension: ${s.nominal} ${tolStr}]`);
      lines.push(`   Samples: [${[s.s1, s.s2, s.s3, s.s4, s.s5].filter((v) => v !== undefined && v !== null).join(', ')}]`);
      lines.push(`   Avg: *${s.average} ${s.unit}* ➔ *${s.status}*`);
    });
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('👁️ *ATTRIBUTE / VISUAL CHECKS:*');
    currentHeroInspection.attributes.forEach((a) => {
      lines.push(`• *${a.checkName}:* [${a.checkedQty}/${a.defectsQty}] ➔ *${a.status}*`);
    });
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🏆 *OVERALL RESULT:* *${currentHeroInspection.overallResult}*`);
    if (currentHeroInspection.remarks) {
      lines.push(`📝 *Remarks:* ${currentHeroInspection.remarks}`);
    }
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('📱 _Verified via PWI ERP QMS System_');

    const text = lines.join('\n');
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Direct PDF Download
  const handleDownloadActivePdf = () => {
    if (!currentHeroInspection) return;
    try {
      const fname = exportQmsToPdf(currentHeroInspection);
      message.success(`Official QMS PDF generated: ${fname}`);
    } catch {
      message.error('Failed to generate PDF');
    }
  };

  // Direct Clean Print
  const handlePrintActiveSheet = () => {
    if (!currentHeroInspection) return;
    handleOpenSheet(currentHeroInspection);
  };

  // Render the Hero In-Process Inspection Sheet (matching mockup image)
  const renderHeroInspectionSheet = () => {
    if (!currentHeroInspection) {
      return (
        <Card style={{ textAlign: 'center', padding: '40px' }}>
          <Typography.Text type="secondary">No running production inspections recorded yet.</Typography.Text>
          <div style={{ marginTop: '16px' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setRunningModalVisible(true)}>
              Create First Inspection
            </Button>
          </div>
        </Card>
      );
    }

    const insp = currentHeroInspection;

    return (
      <Card
        style={{
          borderRadius: '12px',
          backgroundColor: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          padding: '6px',
        }}
      >
        {/* Document Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: `2px solid ${token.colorBorderSecondary}`,
            paddingBottom: '14px',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: token.colorTextHeading, letterSpacing: '0.5px' }}>
              PAKISTAN WIRE INDUSTRIES (PVT.) LTD.
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: token.colorPrimary, marginTop: '2px' }}>
              IN-PROCESS QUALITY INSPECTION REPORT (QMS) — {activeDivision.name.toUpperCase()}
            </div>
            <div style={{ fontSize: '12px', color: token.colorTextSecondary, marginTop: '2px' }}>
              Manufacturing &amp; Quality Management System • Department: <strong>{activeDepartment?.name || 'Spoke'}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              style={{
                textAlign: 'right',
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 700, color: token.colorText }}>
                Doc Ref: <span style={{ color: token.colorPrimary }}>{insp.docRef}</span>
              </div>
              <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>
                Revision No: <strong>{insp.revNo}</strong> | Issue: <strong>{insp.issueDate}</strong>
              </div>
            </div>

            <Button icon={<HistoryOutlined />} onClick={() => setHistoryDrawerVisible(true)}>
              History ({inProcessInspections.length})
            </Button>
            <Button icon={<PrinterOutlined />} onClick={handlePrintActiveSheet}>
              Print Sheet
            </Button>
            <Button danger icon={<FilePdfOutlined />} onClick={handleDownloadActivePdf}>
              Export PDF
            </Button>
            <Button
              style={{ color: '#25D366', borderColor: '#25D366' }}
              icon={<WhatsAppOutlined />}
              onClick={handleShareActiveWhatsApp}
            >
              WhatsApp
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setRunningModalVisible(true)}>
              + New Running Inspection
            </Button>
          </div>
        </div>

        {/* Prominent Metadata Strip (Responsive Grid) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            padding: '14px 16px',
            backgroundColor: token.colorFillAlter,
            borderRadius: '8px',
            marginBottom: '18px',
            border: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: token.colorTextSecondary, textTransform: 'uppercase' }}>Inspection Date:</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorText }}>{insp.inspectionDate}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: token.colorTextSecondary, textTransform: 'uppercase' }}>Shift:</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorText }}>Shift {insp.shift}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: token.colorTextSecondary, textTransform: 'uppercase' }}>Machine No:</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorText }}>{insp.machineNo}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: token.colorTextSecondary, textTransform: 'uppercase' }}>Operator:</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorText }}>{insp.operatorName}</div>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ fontSize: '11px', color: token.colorTextSecondary, textTransform: 'uppercase' }}>Part / Item Name:</div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: token.colorPrimary }}>
              {insp.itemName} <span style={{ fontSize: '12px', color: token.colorTextSecondary }}>({insp.itemCode})</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: token.colorTextSecondary, textTransform: 'uppercase' }}>Prepared By:</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorText }}>{insp.inspectorName || 'Mairaj'}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: token.colorTextSecondary, textTransform: 'uppercase' }}>Status:</div>
            <div>
              <Tag
                color={insp.overallResult === 'PASS' ? 'success' : 'error'}
                style={{ fontSize: '12px', fontWeight: 800, padding: '2px 10px' }}
              >
                {insp.overallResult} / ACCEPTED
              </Tag>
            </div>
          </div>
        </div>

        {/* 5-Sample Dimensional Table (Centerpiece) */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: token.colorTextHeading, letterSpacing: '0.3px' }}>
              DIMENSIONAL INSPECTION DATA (5 SAMPLES PER SHIFT)
            </span>
            <span style={{ fontSize: '12px', color: token.colorTextSecondary }}>
              Auto-calculates Mean (Average) &amp; dynamically flags Out-of-Spec deviations
            </span>
          </div>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
              border: `1px solid ${token.colorBorder}`,
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: token.colorFillAlter, textAlign: 'left' }}>
                <th style={{ padding: '10px 8px', border: `1px solid ${token.colorBorder}`, width: '35px', textAlign: 'center' }}>#</th>
                <th style={{ padding: '10px 10px', border: `1px solid ${token.colorBorder}` }}>Characteristic</th>
                <th style={{ padding: '10px 10px', border: `1px solid ${token.colorBorder}` }}>Dimension Requirement (Nominal &amp; Tol)</th>
                <th style={{ padding: '10px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>Sample 1</th>
                <th style={{ padding: '10px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>Sample 2</th>
                <th style={{ padding: '10px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>Sample 3</th>
                <th style={{ padding: '10px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>Sample 4</th>
                <th style={{ padding: '10px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>Sample 5</th>
                <th style={{ padding: '10px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center', width: '90px' }}>Average</th>
                <th style={{ padding: '10px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center', width: '80px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {insp.samples.map((s, idx) => (
                <tr key={s.id || idx}>
                  <td style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                  <td style={{ padding: '8px 10px', border: `1px solid ${token.colorBorder}`, fontWeight: 700 }}>{s.charName}</td>
                  <td style={{ padding: '8px 10px', border: `1px solid ${token.colorBorder}` }}>
                    <span style={{ fontWeight: 600 }}>{s.nominal}</span> (±{s.tolPlus} {s.unit})
                  </td>
                  <td style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>{s.s1 ?? '-'}</td>
                  <td style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>{s.s2 ?? '-'}</td>
                  <td style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>{s.s3 ?? '-'}</td>
                  <td style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>{s.s4 ?? '-'}</td>
                  <td style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>{s.s5 ?? '-'}</td>
                  <td style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center', fontWeight: 800 }}>
                    {s.average ? `${s.average} ${s.unit}` : '-'}
                  </td>
                  <td style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>
                    <Tag color={s.status === 'PASS' ? 'success' : 'error'} style={{ fontWeight: 700 }}>
                      {s.status}
                    </Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Visual / Go-NoGo Attributes Section */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: token.colorTextHeading }}>
            VISUAL / FUNCTIONAL ATTRIBUTE CHECKS (GO / NO-GO)
          </div>
          <Row gutter={12}>
            {insp.attributes.map((a, idx) => (
              <Col xs={24} sm={8} key={a.id || idx}>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: `1px solid ${token.colorBorderSecondary}`,
                    backgroundColor: token.colorFillAlter,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorText }}>{a.checkName}</div>
                    <div style={{ fontSize: '12px', color: token.colorTextSecondary }}>
                      Sample: <strong>{a.checkedQty}</strong> | Defects: <strong>{a.defectsQty}</strong>
                    </div>
                  </div>
                  <Tag color={a.status === 'PASS' ? 'success' : 'error'} style={{ fontWeight: 800, padding: '2px 8px' }}>
                    {a.status === 'PASS' ? 'OK (10/0)' : 'DEFECT'}
                  </Tag>
                </div>
              </Col>
            ))}
          </Row>
        </div>

        {/* Remarks and Sign-off Blocks */}
        <div
          style={{
            marginTop: '16px',
            borderTop: `2px solid ${token.colorBorderSecondary}`,
            paddingTop: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ fontSize: '12px', color: token.colorTextSecondary }}>Remarks / Quality Assessment:</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: token.colorText, marginTop: '4px' }}>
              {insp.remarks || 'Ok - All dimensional parameters within standard tolerance.'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '32px' }}>
            <div style={{ textAlign: 'center', minWidth: '140px' }}>
              <div style={{ borderBottom: `1px solid ${token.colorBorder}`, height: '28px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorText, marginTop: '4px' }}>
                {insp.inspectorName || 'Mairaj'}
              </div>
              <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>QC Inspector (Prepared By)</div>
            </div>

            <div style={{ textAlign: 'center', minWidth: '160px' }}>
              <div style={{ borderBottom: `1px solid ${token.colorBorder}`, height: '28px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorText, marginTop: '4px' }}>
                {insp.approvedBy || 'Quality Control Incharge'}
              </div>
              <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>Approved / Verified By</div>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  // Tab definitions
  const tabItems = [
    {
      key: 'running',
      label: (
        <span>
          <CheckCircleOutlined /> Running Production Inspection (SPD/QMS/05)
        </span>
      ),
      children: renderHeroInspectionSheet(),
    },
    {
      key: 'specs',
      label: (
        <span>
          <SettingOutlined /> Item QC Specs Master (Excel Import / Export)
        </span>
      ),
      children: (
        <ItemQcSpecsMaster
          specs={specs}
          onSpecsChange={setSpecs}
          divisionName={activeDivision.name}
          departmentName={activeDepartment?.name || 'Spoke'}
          divisionCode={activeDivision.code}
          departmentCode={activeDepartment?.code || 'SPD-DEPT003'}
          itemsList={items}
        />
      ),
    },
    {
      key: 'general',
      label: 'General Inspections (GRN / Incoming / Final)',
      children: (
        <Table
          size="small"
          columns={[
            { title: 'Inspection #', dataIndex: 'inspectionNo', key: 'no', width: 130 },
            { title: 'Type', dataIndex: 'inspectionType', key: 'type', width: 110 },
            { title: 'Qty', dataIndex: 'quantity', key: 'qty', width: 80 },
            {
              title: 'Result',
              dataIndex: 'result',
              key: 'result',
              width: 100,
              render: (r: string) => (
                <Tag color={r === 'PASS' ? 'green' : r === 'FAIL' ? 'red' : 'default'}>{r}</Tag>
              ),
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              width: 110,
              render: (s: string) => <Tag color={s === 'COMPLETED' ? 'green' : 'blue'}>{s}</Tag>,
            },
          ]}
          dataSource={legacyData}
          rowKey="id"
          loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage }}
        />
      ),
    },
    {
      key: 'ncr',
      label: 'NCR & CAPA',
      children: (
        <div>
          <Typography.Title level={5}>Non-Conformance Reports (NCR)</Typography.Title>
          <Table
            size="small"
            columns={[
              { title: 'NCR #', dataIndex: 'ncrNo', key: 'no', width: 120 },
              { title: 'Description', dataIndex: 'description', key: 'desc', ellipsis: true },
              {
                title: 'Disposition',
                dataIndex: 'disposition',
                key: 'disp',
                width: 110,
                render: (d: string) => <Tag>{d}</Tag>,
              },
              {
                title: 'Status',
                dataIndex: 'status',
                key: 'status',
                width: 90,
                render: (s: string) => <Tag color={s === 'OPEN' ? 'red' : 'green'}>{s}</Tag>,
              },
            ]}
            dataSource={ncrData}
            rowKey="id"
            pagination={false}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<CheckOutlined />}
        title="Quality Control &amp; Assurance"
        showBreadcrumbs
        subtitle="In-Process Manufacturing QMS, Dimensional Inspections &amp; Defect Analysis"
        extra={
          <Space>
            <Button icon={<HistoryOutlined />} onClick={() => setHistoryDrawerVisible(true)}>
              Inspection History ({inProcessInspections.length})
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setRunningModalVisible(true)}>
              + New Running Inspection
            </Button>
          </Space>
        }
      />

      {/* Top Scope Card: Division Switcher + Cascading Department & Machine Filter */}
      <Card
        size="small"
        style={{
          marginTop: 12,
          marginBottom: 14,
          borderRadius: '10px',
          backgroundColor: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Row 1: Division Segmented Switcher (matching mockup pill aesthetics) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: token.colorTextSecondary }}>
                DIVISION:
              </span>
              <Segmented
                value={selectedDivisionCode}
                onChange={(val) => handleDivisionChange(String(val))}
                options={PWI_DIVISIONS.map((d) => ({
                  value: d.code,
                  label: d.name,
                }))}
              />
            </div>

            <div>
              <Tag color="cyan" style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '4px' }}>
                Standard QMS Reference: <strong>SPD/QMS/05 (Rev: 02)</strong>
              </Tag>
            </div>
          </div>

          <Divider style={{ margin: '4px 0' }} />

          {/* Row 2: Cascading Department -> Machine -> Shift Filters */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <Space size="middle" wrap>
              <div>
                <span style={{ fontSize: '11px', color: token.colorTextSecondary, display: 'block', marginBottom: '2px' }}>
                  1. Department ({activeDivision.name}):
                </span>
                <Select
                  value={selectedDepartmentCode}
                  onChange={handleDepartmentChange}
                  style={{ width: '180px', fontWeight: 600 }}
                  options={activeDepartmentsList.map((dept) => ({
                    value: dept.code,
                    label: dept.name,
                  }))}
                />
              </div>

              <div>
                <span style={{ fontSize: '11px', color: token.colorTextSecondary, display: 'block', marginBottom: '2px' }}>
                  2. Machine (Filtered to {activeDepartment?.name || 'Dept'}):
                </span>
                <Select
                  value={filterMachine}
                  onChange={setFilterMachine}
                  style={{ width: '220px', fontWeight: 600 }}
                  options={[
                    { value: 'ALL', label: `All Machines (${activeMachinesList.length})` },
                    ...activeMachinesList.map((m) => ({
                      value: m.code,
                      label: m.name,
                    })),
                  ]}
                />
              </div>

              <div>
                <span style={{ fontSize: '11px', color: token.colorTextSecondary, display: 'block', marginBottom: '2px' }}>
                  3. Production Shift:
                </span>
                <Select
                  value={filterShift}
                  onChange={setFilterShift}
                  style={{ width: '150px' }}
                  options={[{ value: 'ALL', label: 'All Shifts' }, ...SHIFT_OPTIONS]}
                />
              </div>

              <div>
                <span style={{ fontSize: '11px', color: token.colorTextSecondary, display: 'block', marginBottom: '2px' }}>
                  4. Compliance Result:
                </span>
                <Select
                  value={filterResult}
                  onChange={setFilterResult}
                  style={{ width: '130px' }}
                  options={[
                    { value: 'ALL', label: 'All Results' },
                    { value: 'PASS', label: 'PASS Only' },
                    { value: 'FAIL', label: 'Out of Spec' },
                  ]}
                />
              </div>
            </Space>

            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => setInProcessInspections(loadInProcessInspections())}>
                Reset Filter
              </Button>
            </Space>
          </div>
        </div>
      </Card>

      {/* Main Tabs Container */}
      <Tabs items={tabItems} defaultActiveKey="running" />

      {/* Running Inspections History Modal (Centered Popup) */}
      <RunningInspectionsHistoryModal
        visible={historyDrawerVisible}
        onClose={() => setHistoryDrawerVisible(false)}
        inspections={inProcessInspections}
        onSelectInspection={(insp) => {
          setActiveInspectionId(insp.id);
        }}
        onOpenSheet={(insp) => {
          handleOpenSheet(insp);
        }}
      />

      {/* In-Process Inspection Modal (Add / Edit) */}
      <InProcessInspectionModal
        visible={runningModalVisible}
        onClose={() => setRunningModalVisible(false)}
        onSave={handleSaveInspection}
        divisionName={activeDivision.name}
        departmentName={activeDepartment?.name || 'Spoke'}
        divisionCode={activeDivision.code}
        departmentCode={activeDepartment?.code || 'SPD-DEPT003'}
        itemsList={items}
      />

      {/* QMS Printable Sheet Modal */}
      <QmsPrintableSheet
        visible={sheetModalVisible}
        onClose={() => setSheetModalVisible(false)}
        inspection={selectedInspectionForSheet}
      />
    </div>
  );
};

export default QcPage;
