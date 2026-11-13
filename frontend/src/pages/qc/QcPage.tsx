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
  fetchDbInProcessInspections,
  saveDbInProcessInspection,
  deleteDbInspection,
  fetchDbSpecs,
  saveDbSpecs,
  resolveCompanyId,
} from './qcSpecsStore';
import { InProcessInspectionModal } from './InProcessInspectionModal';
import { QmsPrintableSheet } from './QmsPrintableSheet';
import { ItemQcSpecsMaster } from './ItemQcSpecsMaster';
import { exportQmsToPdf } from './exportQmsPdf';
import { shareQmsOnWhatsApp } from './exportQmsWhatsApp';
import { RunningInspectionsHistoryModal } from './RunningInspectionsHistoryModal';
import { RunningInspectionsRegister } from './RunningInspectionsRegister';
import './qcPage.css';

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

// Authoritative Fallback Departments per Division (Synchronized with Supabase DB)
const PWI_DEPARTMENTS: Record<string, Array<{ id: string; code: string; name: string }>> = {
  'DIV-SPD': [
    { id: 'd3000000-0000-0000-0000-000000000003', code: 'SPD-DEPT003', name: 'Spoke' },
    { id: 'd3000000-0000-0000-0000-000000000001', code: 'SPD-DEPT001', name: 'Straightener' },
    { id: 'd3000000-0000-0000-0000-000000000002', code: 'SPD-DEPT002', name: 'Swagging' },
    { id: 'd3000000-0000-0000-0000-000000000004', code: 'SPD-DEPT004', name: 'Header' },
    { id: 'd3000000-0000-0000-0000-000000000005', code: 'SPD-DEPT005', name: 'Nipple' },
    { id: 'd3000000-0000-0000-0000-000000000006', code: 'SPD-DEPT006', name: 'Spoke Plating' },
    { id: 'd3000000-0000-0000-0000-000000000007', code: 'SPD-DEPT007', name: 'Nipple Plating' },
    { id: 'd3000000-0000-0000-0000-000000000008', code: 'SPD-DEPT008', name: 'Spoke Packing' },
  ],
  'DIV-CCD': [
    { id: 'd3000000-0000-0000-0000-000000000010', code: 'CCD-DEPT001', name: 'Flattening' },
    { id: 'd3000000-0000-0000-0000-000000000011', code: 'CCD-DEPT002', name: 'Spiral' },
    { id: 'd3000000-0000-0000-0000-000000000012', code: 'CCD-DEPT003', name: 'PVC' },
    { id: 'd3000000-0000-0000-0000-000000000013', code: 'CCD-DEPT004', name: 'Packing' },
  ],
  'DIV-001': [
    { id: 'cfac6089-9a19-403a-b37d-7b2622c2d01c', code: 'DEPT-001', name: 'Production' },
    { id: '8a7f2b26-194d-4e78-af3b-4a851fb1719e', code: 'DEPT-005', name: 'Quality Control' },
  ],
};

// Authoritative Fallback Machines per Department (Exact 60 Supabase machines)
const DEPARTMENT_MACHINES: Record<string, Array<{ code: string; name: string }>> = {
  // Spoke Division
  'SPD-DEPT003': [
    { code: 'SPK-01', name: 'SPK-01 (Spoke Machine SPK-01)' },
    { code: 'SPK-02', name: 'SPK-02 (Spoke Machine SPK-02)' },
    { code: 'SPK-03', name: 'SPK-03 (Spoke Machine SPK-03)' },
    { code: 'SPK-04', name: 'SPK-04 (Spoke Machine SPK-04)' },
    { code: 'SPK-05', name: 'SPK-05 (Spoke Machine SPK-05)' },
    { code: 'SPK-06', name: 'SPK-06 (Spoke Machine SPK-06)' },
    { code: 'SPK-07', name: 'SPK-07 (Spoke Machine SPK-07)' },
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
    { code: 'BL-01', name: 'BL-01 (Barrel Machine BL-01)' },
    { code: 'BL-02', name: 'BL-02 (Barrel Machine BL-02)' },
    { code: 'BL-03', name: 'BL-03 (Barrel Machine BL-03)' },
    { code: 'BL-04', name: 'BL-04 (Barrel Machine BL-04)' },
    { code: 'BL-05', name: 'BL-05 (Barrel Machine BL-05)' },
    { code: 'BL-06', name: 'BL-06 (Barrel Machine BL-06)' },
    { code: 'BL-07', name: 'BL-07 (Barrel Machine BL-07)' },
    { code: 'BL-08', name: 'BL-08 (Barrel Machine BL-08)' },
    { code: 'BL-09', name: 'BL-09 (Barrel Machine BL-09)' },
  ],
  'SPD-DEPT007': [
    { code: 'NPL-01', name: 'NPL-01 (Nipple Plating Line 01)' },
    { code: 'BL-10', name: 'BL-10 (Barrel Machine BL-10)' },
    { code: 'BL-11', name: 'BL-11 (Barrel Machine BL-11)' },
    { code: 'BL-12', name: 'BL-12 (Barrel Machine BL-12)' },
  ],
  'SPD-DEPT008': [
    { code: 'PKS-01', name: 'PKS-01 (Spoke Packing Station 01)' },
    { code: 'PKS-02', name: 'PKS-02 (Spoke Packing Station 02)' },
  ],
  // Control Cable Division
  'CCD-DEPT001': [
    { code: 'FT-01', name: 'FT-01 (Flattening Machine FT-01)' },
    { code: 'FT-02', name: 'FT-02 (Flattening Machine FT-02)' },
    { code: 'FT-03', name: 'FT-03 (Flattening Machine FT-03)' },
    { code: 'FT-04', name: 'FT-04 (Flattening Machine FT-04)' },
    { code: 'FT-05', name: 'FT-05 (Flattening Machine FT-05)' },
  ],
  'CCD-DEPT002': [
    { code: 'SP-01', name: 'SP-01 (Spiral Machine SP-01)' },
    { code: 'SP-02', name: 'SP-02 (Spiral Machine SP-02)' },
    { code: 'SP-03', name: 'SP-03 (Spiral Machine SP-03)' },
    { code: 'SP-04', name: 'SP-04 (Spiral Machine SP-04)' },
    { code: 'SP-05', name: 'SP-05 (Spiral Machine SP-05)' },
    { code: 'SP-06', name: 'SP-06 (Spiral Machine SP-06)' },
    { code: 'SP-07', name: 'SP-07 (Spiral Machine SP-07)' },
    { code: 'SP-08', name: 'SP-08 (Spiral Machine SP-08)' },
    { code: 'SP-09', name: 'SP-09 (Spiral Machine SP-09)' },
    { code: 'SP-10', name: 'SP-10 (Spiral Machine SP-10)' },
    { code: 'SP-11', name: 'SP-11 (Spiral Machine SP-11)' },
    { code: 'SP-12', name: 'SP-12 (Spiral Machine SP-12)' },
    { code: 'SP-13', name: 'SP-13 (Spiral Machine SP-13)' },
    { code: 'SP-14', name: 'SP-14 (Spiral Machine SP-14)' },
  ],
  'CCD-DEPT003': [
    { code: 'PVC-01', name: 'PVC-01 (PVC Coating Line PVC-01)' },
    { code: 'PVC -02', name: 'PVC -02 (PVC Coating Line PVC -02)' },
  ],
  'CCD-DEPT004': [
    { code: 'PK-01', name: 'PK-01 (CCD Packing Station PK-01)' },
    { code: 'PK-02', name: 'PK-02 (CCD Packing Station PK-02)' },
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

  // Live hierarchy metadata loaded dynamically from Supabase database
  const [dbDivisions, setDbDivisions] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [dbDepartments, setDbDepartments] = useState<Record<string, Array<{ id: string; code: string; name: string }>>>({});
  const [dbMachinesByDept, setDbMachinesByDept] = useState<Record<string, Array<{ code: string; name: string }>>>({});
  const [dbMachinesByDeptId, setDbMachinesByDeptId] = useState<Record<string, Array<{ code: string; name: string }>>>({});

  // Specs & In-Process Inspections
  const [specs, setSpecs] = useState<ItemQcSpecification[]>([]);
  const [inProcessInspections, setInProcessInspections] = useState<QmsInProcessInspection[]>([]);
  const [activeInspectionId, setActiveInspectionId] = useState<string>('');

  // Modals & Drawers
  const [runningModalVisible, setRunningModalVisible] = useState(false);
  const [sheetModalVisible, setSheetModalVisible] = useState(false);
  const [historyDrawerVisible, setHistoryDrawerVisible] = useState(false);
  const [selectedInspectionForSheet, setSelectedInspectionForSheet] = useState<QmsInProcessInspection | null>(null);
  const [batchInspectionsForSheet, setBatchInspectionsForSheet] = useState<QmsInProcessInspection[]>([]);
  const [editingInspection, setEditingInspection] = useState<QmsInProcessInspection | null>(null);
  const [activeTabKey, setActiveTabKey] = useState('running');

  const renderSolidStatusBadge = (status: 'PASS' | 'FAIL' | 'PENDING' | string) => {
    const isFail = status === 'FAIL';
    const isPass = status === 'PASS';
    const bg = isFail ? '#ef4444' : isPass ? '#10b981' : '#2563eb';
    return (
      <span
        style={{
          display: 'inline-block',
          backgroundColor: bg,
          color: '#ffffff',
          fontWeight: 800,
          fontSize: '11px',
          padding: '3px 10px',
          borderRadius: '4px',
          letterSpacing: '0.5px',
          minWidth: '58px',
          textAlign: 'center',
          boxShadow: `0 1px 3px ${isFail ? 'rgba(239, 68, 68, 0.4)' : isPass ? 'rgba(16, 185, 129, 0.4)' : 'rgba(37, 99, 235, 0.4)'}`,
        }}
      >
        {status || 'PENDING'}
      </span>
    );
  };

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
  const [refreshing, setRefreshing] = useState(false);

  // Load user & initialize store from database
  useEffect(() => {
    const compId = resolveCompanyId(companyId);
    setCompanyId(compId);

    // 1. Immediate offline cache display (0ms)
    const cachedSpecs = loadAllSpecs();
    setSpecs(cachedSpecs);
    const cachedInsps = loadInProcessInspections();
    setInProcessInspections(cachedInsps);
    if (cachedInsps.length > 0) {
      setActiveInspectionId(cachedInsps[0].id);
    }

    // 2. Fetch latest shared data from PostgreSQL database
    (async () => {
      try {
        const [dbSpecs, dbInsps] = await Promise.all([
          fetchDbSpecs(compId),
          fetchDbInProcessInspections(compId, cachedSpecs),
        ]);
        if (dbSpecs && dbSpecs.length > 0) setSpecs(dbSpecs);
        if (dbInsps && dbInsps.length > 0) {
          setInProcessInspections(dbInsps);
          setActiveInspectionId(dbInsps[0].id);
        }
      } catch (e) {
        console.warn('Initial QC DB sync failed, using cached store:', e);
      }
    })();
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

  // Refresh all QC data from database
  const handleRefreshAll = useCallback(
    async (showFeedback = false) => {
      setRefreshing(true);
      try {
        let currentCompany = companyId;
        if (!currentCompany) {
          const erpUser = localStorage.getItem('erp_user');
          if (erpUser) {
            try {
              currentCompany = JSON.parse(erpUser)?.defaultCompanyId || '';
            } catch {}
          }
        }

        if (currentCompany) {
          const [loadedSpecs, loadedInsps] = await Promise.all([
            fetchDbSpecs(currentCompany),
            fetchDbInProcessInspections(currentCompany, specs),
            fetchData(page),
          ]);

          if (loadedSpecs && loadedSpecs.length > 0) {
            setSpecs(loadedSpecs);
          }
          if (loadedInsps && loadedInsps.length > 0) {
            setInProcessInspections(loadedInsps);
            if (!activeInspectionId || !loadedInsps.some((i) => i.id === activeInspectionId)) {
              setActiveInspectionId(loadedInsps[0].id);
            }
          }
          if (showFeedback) {
            message.success(`QC data refreshed from database (${loadedInsps.length} inspections)`);
          }
        } else {
          if (showFeedback) message.info('No company context available for refresh');
        }
      } catch (err) {
        console.error('Refresh error:', err);
        if (showFeedback) message.error('Failed to refresh data from server');
      } finally {
        setRefreshing(false);
      }
    },
    [companyId, page, specs, activeInspectionId, fetchData],
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

  // Dynamically load live divisions, departments, and machines directly from Supabase database
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [divsRes, deptsRes, machsRes] = await Promise.all([
          apiService.get<any>('/divisions?limit=50&status=ACTIVE').catch(() => null),
          apiService.get<any>('/departments?limit=100&status=ACTIVE&departmentType=PRODUCTION').catch(() => null),
          apiService.get<any>('/machines?limit=500').catch(() => null),
        ]);

        if (!isMounted) return;

        // Process live divisions
        const rawDivs = Array.isArray(divsRes?.data) ? divsRes.data : Array.isArray(divsRes) ? divsRes : [];
        if (rawDivs.length > 0) {
          const parsedDivs = rawDivs
            .map((d: any) => ({
              id: d.id,
              code: d.divisionCode || d.code || '',
              name: d.name || d.divisionName || '',
            }))
            .filter((d: any) => d.code && d.name);
          if (parsedDivs.length > 0) setDbDivisions(parsedDivs);
        }

        // Process live departments
        const rawDepts = Array.isArray(deptsRes?.data) ? deptsRes.data : Array.isArray(deptsRes) ? deptsRes : [];
        if (rawDepts.length > 0) {
          const deptsByDiv: Record<string, Array<{ id: string; code: string; name: string }>> = {};
          rawDepts.forEach((dept: any) => {
            const divCode = dept.division?.divisionCode || dept.division?.code || '';
            const divId = dept.divisionId || dept.division?.id || '';
            const item = {
              id: dept.id,
              code: dept.departmentCode || dept.code || '',
              name: dept.name || dept.departmentName || '',
            };
            if (divCode) {
              if (!deptsByDiv[divCode]) deptsByDiv[divCode] = [];
              if (!deptsByDiv[divCode].some((existing) => existing.code === item.code)) {
                deptsByDiv[divCode].push(item);
              }
            }
            if (divId) {
              if (!deptsByDiv[divId]) deptsByDiv[divId] = [];
              if (!deptsByDiv[divId].some((existing) => existing.code === item.code)) {
                deptsByDiv[divId].push(item);
              }
            }
          });
          setDbDepartments(deptsByDiv);
        }

        // Process live machines
        const rawMachs = Array.isArray(machsRes?.data) ? machsRes.data : Array.isArray(machsRes) ? machsRes : [];
        if (rawMachs.length > 0) {
          const machsByDeptCode: Record<string, Array<{ code: string; name: string }>> = {};
          const machsByDeptIdMap: Record<string, Array<{ code: string; name: string }>> = {};

          rawMachs.forEach((m: any) => {
            const mCode = m.machineCode || m.machineNumber || m.code || '';
            const mName = m.name || m.machineName || mCode;
            const entry = { code: mCode, name: `${mCode} (${mName})` };

            const dCode = m.department?.departmentCode || m.department?.code || '';
            const dId = m.departmentId || m.department?.id || '';

            if (dCode) {
              if (!machsByDeptCode[dCode]) machsByDeptCode[dCode] = [];
              if (!machsByDeptCode[dCode].some((existing) => existing.code === entry.code)) {
                machsByDeptCode[dCode].push(entry);
              }
            }
            if (dId) {
              if (!machsByDeptIdMap[dId]) machsByDeptIdMap[dId] = [];
              if (!machsByDeptIdMap[dId].some((existing) => existing.code === entry.code)) {
                machsByDeptIdMap[dId].push(entry);
              }
            }
          });

          setDbMachinesByDept(machsByDeptCode);
          setDbMachinesByDeptId(machsByDeptIdMap);
        }
      } catch (err) {
        console.warn('Failed to fetch live hierarchy metadata from DB:', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Active division resolution (live DB prioritized over fallback)
  const activeDivisionsList = useMemo(() => {
    if (dbDivisions && dbDivisions.length > 0) {
      const recognized = PWI_DIVISIONS.map((fb) => {
        const live = dbDivisions.find((d) => d.code === fb.code);
        return live || fb;
      });
      return recognized;
    }
    return PWI_DIVISIONS;
  }, [dbDivisions]);

  const activeDivision = useMemo(() => {
    return activeDivisionsList.find((d) => d.code === selectedDivisionCode) || activeDivisionsList[0];
  }, [activeDivisionsList, selectedDivisionCode]);

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

  // Active departments list (live DB prioritized over fallback)
  const activeDepartmentsList = useMemo(() => {
    const liveList = dbDepartments[selectedDivisionCode] || (activeDivision?.id ? dbDepartments[activeDivision.id] : null);
    if (liveList && liveList.length > 0) {
      return liveList;
    }
    return PWI_DEPARTMENTS[selectedDivisionCode] || [];
  }, [dbDepartments, selectedDivisionCode, activeDivision?.id]);

  const activeDepartment = useMemo(() => {
    return activeDepartmentsList.find((d) => d.code === selectedDepartmentCode) || activeDepartmentsList[0];
  }, [activeDepartmentsList, selectedDepartmentCode]);

  // Cascading machines list strictly for the selected department (live DB prioritized over fallback)
  const activeMachinesList = useMemo(() => {
    const fromCode = dbMachinesByDept[selectedDepartmentCode];
    if (fromCode && fromCode.length > 0) return fromCode;

    const fromId = activeDepartment?.id ? dbMachinesByDeptId[activeDepartment.id] : null;
    if (fromId && fromId.length > 0) return fromId;

    return DEPARTMENT_MACHINES[selectedDepartmentCode] || [
      { code: '01', name: 'Machine 01' },
      { code: '02', name: 'Machine 02' },
    ];
  }, [dbMachinesByDept, dbMachinesByDeptId, selectedDepartmentCode, activeDepartment?.id]);

  // Handle cascading division change
  const handleDivisionChange = (divCode: string) => {
    setSelectedDivisionCode(divCode);
    const liveDepts = dbDepartments[divCode] || PWI_DEPARTMENTS[divCode] || [];
    if (liveDepts.length > 0) {
      const firstDeptCode = liveDepts[0].code;
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
  const handleSaveInspection = async (newInsp: QmsInProcessInspection) => {
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

    // Persist full inspection to PostgreSQL database via API
    if (companyId) {
      try {
        const savedData = await saveDbInProcessInspection(companyId, newInsp);
        if (savedData?.inspectionNo) {
          newInsp.inspectionNo = savedData.inspectionNo;
          newInsp.id = savedData.id;
          message.success(`Official inspection saved: ${savedData.inspectionNo}`);
        } else {
          message.success(`Inspection sheet saved: ${newInsp.inspectionNo}`);
        }
        // Re-fetch database inspections so all users have synchronized data
        const reloaded = await fetchDbInProcessInspections(companyId, specs);
        setInProcessInspections(reloaded);
        if (reloaded.length > 0 && !activeInspectionId) {
          setActiveInspectionId(reloaded[0].id);
        }
      } catch (err) {
        console.warn('Backend sync failed, saved locally:', err);
        message.success(`Inspection sheet saved locally: ${newInsp.inspectionNo}`);
      }
    } else {
      message.success(`Inspection sheet saved: ${newInsp.inspectionNo}`);
    }
  };

  // Delete In-Process inspection from local state and database
  const handleDeleteInspection = async (target: QmsInProcessInspection) => {
    try {
      const updated = inProcessInspections.filter(
        (i) => i.id !== target.id && i.inspectionNo !== target.inspectionNo
      );
      setInProcessInspections(updated);
      saveInProcessInspections(updated);

      if (activeInspectionId === target.id) {
        setActiveInspectionId(updated[0]?.id || '');
      }

      // If stored in database, delete from Supabase PostgreSQL
      if (companyId && target.id) {
        await deleteDbInspection(target.id);
      }

      message.success(`Inspection "${target.inspectionNo}" deleted successfully`);
    } catch (err) {
      console.error('Delete inspection error:', err);
      message.error('Failed to delete inspection');
    }
  };

  // Update Item QC Specifications state + local cache.
  // The database write is performed (and awaited, with error feedback) inside ItemQcSpecsMaster.
  const handleSpecsChange = (updated: ItemQcSpecification[]) => {
    setSpecs(updated);
    saveAllSpecs(updated);
  };

  // Open QMS printable sheet
  const handleOpenSheet = (insp: QmsInProcessInspection | null, batchList?: QmsInProcessInspection[]) => {
    if (!insp) return;
    setSelectedInspectionForSheet(insp);
    setBatchInspectionsForSheet(batchList && batchList.length > 0 ? batchList : [insp]);
    setSheetModalVisible(true);
  };

  // Quick WhatsApp Share for active inspection
  const handleShareActiveWhatsApp = () => {
    if (!currentHeroInspection) return;
    shareQmsOnWhatsApp(currentHeroInspection);
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
        id="qc-hero-sheet-top"
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <img
              src="/logo.png"
              alt="PWI Logo"
              style={{
                width: '46px',
                height: '46px',
                objectFit: 'contain',
                borderRadius: '8px',
                padding: '2px',
                backgroundColor: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
              }}
            />
            <div>
              <div className="qc-report-title" style={{ fontSize: '20px', fontWeight: 800, color: token.colorTextHeading, letterSpacing: '0.5px' }}>
                PAKISTAN WIRE INDUSTRIES (PVT.) LTD.
              </div>
              <div className="qc-report-subtitle" style={{ fontSize: '15px', fontWeight: 700, color: token.colorPrimary, marginTop: '2px' }}>
                IN-PROCESS QUALITY INSPECTION REPORT (QMS) — {activeDivision.name.toUpperCase()}
              </div>
              <div style={{ fontSize: '12px', color: token.colorTextSecondary, marginTop: '2px' }}>
                Manufacturing &amp; Quality Management System • Department: <strong>{activeDepartment?.name || 'Spoke'}</strong>
              </div>
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
            <Button
              icon={<EditOutlined />}
              onClick={() => {
                setEditingInspection(insp);
                setRunningModalVisible(true);
              }}
            >
              Edit / Revise
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
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingInspection(null);
                setRunningModalVisible(true);
              }}
            >
              + New Running Inspection
            </Button>
          </div>
        </div>

        {/* Prominent Metadata Strip (Responsive Grid) */}
        <div
          className="qc-metadata-grid"
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
          <div className="qc-meta-fullwidth" style={{ gridColumn: 'span 2' }}>
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
            <div style={{ marginTop: '2px' }}>
              {renderSolidStatusBadge(insp.overallResult)}
            </div>
          </div>
        </div>

        {/* 5-Sample Dimensional Table (Centerpiece) */}
        <div style={{ marginBottom: '18px', width: '100%', maxWidth: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: token.colorTextHeading, letterSpacing: '0.3px' }}>
              DIMENSIONAL INSPECTION DATA (5 SAMPLES PER SHIFT)
            </span>
            <span style={{ fontSize: '12px', color: token.colorTextSecondary }}>
              Auto-calculates Mean (Average) &amp; dynamically flags Out-of-Spec deviations
            </span>
          </div>

          <div style={{ marginBottom: '6px' }}>
            <Tag color="blue" className="qc-swipe-indicator" style={{ fontSize: '11px', margin: 0, padding: '2px 8px' }}>
              ↔ Swipe table horizontally to view all 5 sample columns
            </Tag>
          </div>

          <div className="qc-responsive-table-box" style={{ border: `1px solid ${token.colorBorder}` }}>
            <table
              style={{
                width: '100%',
                minWidth: '780px',
                borderCollapse: 'collapse',
                fontSize: '13px',
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
                      {renderSolidStatusBadge(s.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  {renderSolidStatusBadge(a.status)}
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
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top: Official In-Process Hero Inspection Sheet */}
          {renderHeroInspectionSheet()}

          {/* Bottom: Inline Running Inspections Register & History (Directly below sheet - NO popup required) */}
          <RunningInspectionsRegister
            inspections={inProcessInspections}
            activeInspectionId={activeInspectionId}
            onSelectInspection={(insp) => {
              setActiveInspectionId(insp.id);
              const el = document.getElementById('qc-hero-sheet-top');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            onOpenSheet={(insp, batchList) => handleOpenSheet(insp, batchList)}
            onEditInspection={(insp) => {
              setEditingInspection(insp);
              setRunningModalVisible(true);
            }}
            onDeleteInspection={(insp) => handleDeleteInspection(insp)}
            onRefresh={() => handleRefreshAll(true)}
          />
        </div>
      ),
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
          onSpecsChange={handleSpecsChange}
          divisionName={activeDivision.name}
          departmentName={activeDepartment?.name || 'Spoke'}
          divisionCode={activeDivision.code}
          departmentCode={activeDepartment?.code || 'SPD-DEPT003'}
          itemsList={items}
          companyId={companyId}
        />
      ),
    },
    {
      key: 'general',
      label: 'General Inspections (GRN / Incoming / Final)',
      children: (
        <Table
          size="small"
          scroll={{ x: 650 }}
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
            scroll={{ x: 650 }}
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
    <div className="qc-page-container">
      <PageHeader
        icon={<CheckOutlined />}
        title="Quality Control &amp; Assurance"
        showBreadcrumbs
        subtitle="In-Process Manufacturing QMS, Dimensional Inspections &amp; Defect Analysis"
        extra={
          <div className="qc-header-actions">
            <Button
              icon={<ReloadOutlined spin={refreshing} />}
              onClick={() => handleRefreshAll(true)}
              loading={refreshing}
            >
              Refresh
            </Button>
            <Button
              icon={<HistoryOutlined />}
              onClick={() => {
                setActiveTabKey('running');
                setTimeout(() => {
                  const el = document.getElementById('qc-inspections-register');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 50);
              }}
            >
              Inspection Register ({inProcessInspections.length})
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setRunningModalVisible(true)}>
              + New Running Inspection
            </Button>
          </div>
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
          {/* Row 1: Division Button-Tabs Switcher (Top line on click, bottom open / seamless) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div className="qc-division-segmented-wrapper" style={{ gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: token.colorTextSecondary, flexShrink: 0 }}>
                DIVISION:
              </span>
              <div className="qc-division-tabs-bar">
                {activeDivisionsList.map((d) => {
                  const isActive = selectedDivisionCode === d.code;
                  return (
                    <button
                      key={d.code}
                      type="button"
                      className={`qc-division-tab-btn ${isActive ? 'active' : ''}`}
                      onClick={() => handleDivisionChange(d.code)}
                    >
                      {d.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Tag color="cyan" style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '4px' }}>
                Standard QMS Reference: <strong>SPD/QMS/05 (Rev: 02)</strong>
              </Tag>
            </div>
          </div>

          <Divider style={{ margin: '4px 0' }} />

          {/* Row 2: Cascading Department -> Machine -> Shift Filters */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '10px',
              alignItems: 'flex-end',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', color: token.colorTextSecondary, display: 'block', marginBottom: '2px' }}>
                1. Department ({activeDivision.name}):
              </span>
              <Select
                value={selectedDepartmentCode}
                onChange={handleDepartmentChange}
                size="middle"
                style={{ width: '100%', fontWeight: 700 }}
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
                style={{ width: '100%', fontWeight: 600 }}
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
                style={{ width: '100%' }}
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
                style={{ width: '100%' }}
                options={[
                  { value: 'ALL', label: 'All Results' },
                  { value: 'PASS', label: 'PASS Only' },
                  { value: 'FAIL', label: 'Out of Spec' },
                ]}
              />
            </div>

            <div>
              <Button
                style={{ width: '100%' }}
                icon={<ReloadOutlined />}
                onClick={() => {
                  setFilterMachine('ALL');
                  setFilterShift('ALL');
                  setFilterResult('ALL');
                  handleRefreshAll(false);
                }}
              >
                Reset Filter
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Tabs Container (Folder Tab with Top Accent Line & Bottom Open/Seamless) */}
      <Tabs type="card" className="qc-folder-tabs" items={tabItems} activeKey={activeTabKey} onChange={setActiveTabKey} />

      {/* Running Inspections History Modal (Centered Popup) */}
      <RunningInspectionsHistoryModal
        visible={historyDrawerVisible}
        onClose={() => setHistoryDrawerVisible(false)}
        inspections={inProcessInspections}
        onRefresh={() => handleRefreshAll(true)}
        onSelectInspection={(insp) => {
          setActiveInspectionId(insp.id);
        }}
        onOpenSheet={(insp, batchList) => {
          handleOpenSheet(insp, batchList);
        }}
        onEditInspection={(insp) => {
          setEditingInspection(insp);
          setRunningModalVisible(true);
        }}
        onDeleteInspection={handleDeleteInspection}
      />

      {/* In-Process Inspection Modal (Add / Edit / Revise) */}
      <InProcessInspectionModal
        visible={runningModalVisible}
        onClose={() => {
          setRunningModalVisible(false);
          setEditingInspection(null);
        }}
        onSave={handleSaveInspection}
        initialInspection={editingInspection}
        divisionName={activeDivision.name}
        departmentName={activeDepartment?.name || 'Spoke'}
        divisionCode={activeDivision.code}
        departmentCode={activeDepartment?.code || 'SPD-DEPT003'}
        machinesList={activeMachinesList}
        itemsList={items}
        companyId={companyId}
      />

      {/* QMS Printable Sheet Modal */}
      <QmsPrintableSheet
        visible={sheetModalVisible}
        onClose={() => {
          setSheetModalVisible(false);
          setBatchInspectionsForSheet([]);
        }}
        inspection={selectedInspectionForSheet}
        batchInspections={batchInspectionsForSheet}
      />
    </div>
  );
};

export default QcPage;
