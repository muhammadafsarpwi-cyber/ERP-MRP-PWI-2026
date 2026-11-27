import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Tabs,
  App,
  Popconfirm,
  DatePicker,
  Row,
  Col,
  Typography,
  Divider,
  Alert,
  Tooltip,
  AutoComplete,
  Dropdown,
  Descriptions,
  theme,
} from 'antd';
import {
  PlusOutlined,
  CheckOutlined,
  ExportOutlined,
  RollbackOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  ApartmentOutlined,
  ShopOutlined,
  InfoCircleOutlined,
  CalendarOutlined,
  FileTextOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  PrinterOutlined,
  FilePdfOutlined,
  EyeOutlined,
  EditOutlined,
  UserOutlined,
  CloseOutlined,
  FileExcelOutlined,
  DownloadOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { isValidUUID } from '../../utils/uuid';
import { usePermission } from '../../hooks/usePermission';
import { useUserStore } from '../../store/userStore';
import PageHeader from '../../components/shared/PageHeader';
import { ConfirmAndSuccessModal, type ConfirmAndSuccessPhase } from '../../components/shared';
import TableColumnSelector, { useColumnVisibility } from '../../components/shared/TableColumnSelector';
import StoreLineItemsEditor, { StoreLineItem } from './components/StoreLineItemsEditor';
import StoreVoucherPrintModal, {
  StoreVoucherData,
  printStoreVoucherHtml,
  downloadStoreVoucherPdf,
} from './components/StoreVoucherPrintModal';
import StoreMaterialLifecycleModal from './components/lifecycle/StoreMaterialLifecycleModal';
import { storeIssuesCache } from './storeIssuesCache';
import { getLogoUrl, printHtmlContent } from '../../utils/printTemplates';
import { shareStoreIssueOnWhatsApp } from '../../utils/storeIssueWhatsApp';
import {
  buildStoreIssuesXlsxBlob,
  buildStoreIssuesCsv,
  triggerDownloadBlob,
  type StoreIssueExportRow,
} from '../../utils/storeIssueExport';
import './storeResponsive.css';

interface MaterialIssue {
  id: string;
  issueNumber: string;
  issueDate: string;
  storeId: string;
  storeName?: string;
  requestNumber?: string;
  departmentId?: string;
  divisionId?: string;
  sectionId?: string;
  issuedToDepartmentId?: string;
  purpose?: string;
  referenceDocument?: string;
  remarks?: string;
  operatorName?: string;
  shiftInchargeName?: string;
  issuedByName?: string;
  status: string;
  createdAt?: string;
  lines?: any[];
}

interface StoreOption {
  id: string;
  storeCode: string;
  storeName: string;
  storeType?: string;
  divisionId?: string | null;
  departmentId?: string | null;
  sectionId?: string | null;
}

interface DivisionOption {
  id: string;
  divisionCode?: string;
  divisionName?: string;
  name?: string;
  code?: string;
}

interface SectionOption {
  id: string;
  sectionCode?: string;
  sectionName?: string;
  name?: string;
  code?: string;
  divisionId?: string;
}

interface DepartmentOption {
  id: string;
  departmentCode?: string;
  departmentName?: string;
  name?: string;
  code?: string;
  divisionId?: string;
  sectionId?: string;
}

interface MachineOption {
  id: string;
  machineCode: string;
  machineName: string;
  machineType?: string;
  departmentId?: string;
  sectionId?: string;
  divisionId?: string;
}

const StoreIssues: React.FC = () => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { can } = usePermission();
  const currentUser = useUserStore((s) => s.user);
  const currentUserDisplayName = useMemo(() => {
    if (!currentUser) return 'Store Keeper';
    const full = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
    return full || (currentUser as any).displayName || currentUser.username || currentUser.email || 'Store Keeper';
  }, [currentUser]);
  const canCreate = can('store.issue.create');
  const canUpdate = can('store.issue.update');
  const canPost = can('store.issue.post');

  // Main data states
  const [data, setData] = useState<MaterialIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog & Form states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [editingIssueStatus, setEditingIssueStatus] = useState<string | null>(null);
  const [editingOriginalLineQtyMap, setEditingOriginalLineQtyMap] = useState<Record<string, number>>({});
  const [viewRecord, setViewRecord] = useState<MaterialIssue | null>(null);
  const [loadingView, setLoadingView] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const watchedMachineSelection = Form.useWatch('machineSelection', form);
  const watchedIssueDate = Form.useWatch('issueDate', form);
  const [lineItems, setLineItems] = useState<StoreLineItem[]>([]);
  const [lifecycleModalItem, setLifecycleModalItem] = useState<{ itemId: string; itemCode?: string; itemName?: string } | null>(null);
  const [operatorSuggestions, setOperatorSuggestions] = useState<string[]>([]);
  const [shiftInchargeSuggestions, setShiftInchargeSuggestions] = useState<string[]>([]);

  // Selected store and active division for scoping items
  const [selectedSourceStoreId, setSelectedSourceStoreId] = useState<string | undefined>(undefined);
  const [activeDivisionId, setActiveDivisionId] = useState<string | undefined>(undefined);

  // Lookups
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeMap, setStoreMap] = useState<Record<string, string>>({});
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);
  const [divisionMap, setDivisionMap] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [sectionMap, setSectionMap] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [deptMap, setDeptMap] = useState<Record<string, string>>({});

  // Dynamic Machines list for selected department
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(false);

  // Form Cascading Filter States
  const [destDivisionId, setDestDivisionId] = useState<string | undefined>(undefined);
  const [destSectionId, setDestSectionId] = useState<string | undefined>(undefined);
  const [destDepartmentId, setDestDepartmentId] = useState<string | undefined>(undefined);

  // Responsive state
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 1. Initial Load of Master Data & Stores (with sticky cache)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const lookups = await storeIssuesCache.getOrFetch(
          storeIssuesCache.keys.lookups(),
          async () => {
            const [sRes, divRes, secRes, deptRes] = await Promise.allSettled([
              apiService.get<any>('/store/stores', { status: 'ACTIVE' }, { useEtag: true }),
              apiService.get<any>('/divisions', { limit: 100, status: 'ACTIVE' }, { useEtag: true }),
              apiService.get<any>('/sections', { limit: 200, status: 'ACTIVE' }, { useEtag: true }),
              apiService.get<any>('/departments', { limit: 500, status: 'ACTIVE' }, { useEtag: true }),
            ]);
            const storesList: StoreOption[] =
              sRes.status === 'fulfilled'
                ? Array.isArray(sRes.value)
                  ? sRes.value
                  : sRes.value?.data || []
                : [];
            const divList: DivisionOption[] =
              divRes.status === 'fulfilled'
                ? Array.isArray(divRes.value)
                  ? divRes.value
                  : divRes.value?.data || []
                : [];
            const secList: SectionOption[] =
              secRes.status === 'fulfilled'
                ? Array.isArray(secRes.value)
                  ? secRes.value
                  : secRes.value?.data || []
                : [];
            const deptList: DepartmentOption[] =
              deptRes.status === 'fulfilled'
                ? Array.isArray(deptRes.value)
                  ? deptRes.value
                  : deptRes.value?.data || []
                : [];
            return { storesList, divList, secList, deptList };
          },
          storeIssuesCache.ttls.lookup,
        );

        if (!active) return;

        setStores(lookups.storesList);
        setStoreMap(
          Object.fromEntries(lookups.storesList.map((st) => [st.id, `${st.storeCode} — ${st.storeName}`])),
        );

        setDivisions(lookups.divList);
        const dMap: Record<string, string> = {};
        lookups.divList.forEach((d) => {
          dMap[d.id] = d.name || d.divisionName || d.code || d.divisionCode || 'Division';
        });
        setDivisionMap(dMap);

        setSections(lookups.secList);
        const secMap: Record<string, string> = {};
        lookups.secList.forEach((s) => {
          secMap[s.id] = s.name || s.sectionName || s.code || s.sectionCode || 'Section';
        });
        setSectionMap(secMap);

        setDepartments(lookups.deptList);
        const dpMap: Record<string, string> = {};
        lookups.deptList.forEach((d) => {
          dpMap[d.id] = d.name || d.departmentName || d.code || d.departmentCode || 'Dept';
        });
        setDeptMap(dpMap);
      } catch {
        console.warn('[StoreIssues] Failed to load organizational master data');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 2. Fetch issues list (sticky client cache until mutation or explicit Refresh)
  const fetchData = useCallback(async (forceRefresh = false) => {
    const cacheKey = storeIssuesCache.keys.issuesList('default');
    if (forceRefresh) {
      storeIssuesCache.invalidateIssues();
    } else {
      const cached = storeIssuesCache.getCached<MaterialIssue[]>(cacheKey);
      if (cached) {
        setData(cached);
        return;
      }
    }

    setLoading(true);
    try {
      const list = await storeIssuesCache.getOrFetch(
        cacheKey,
        async () => {
          const response = await apiService.get<MaterialIssue[]>(
            '/store/material-issues',
            forceRefresh ? { nocache: '1' } : undefined,
            { useEtag: !forceRefresh },
          );
          return Array.isArray(response) ? response : [];
        },
        storeIssuesCache.ttls.issues,
      );
      setData(list);
    } catch {
      message.error('Failed to load store issue notes');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  // 3. Dynamic machine loader when Destination Department changes (cached)
  const loadMachinesForDepartment = useCallback(async (deptId?: string) => {
    if (!deptId || !isValidUUID(deptId)) {
      setMachines([]);
      return;
    }
    setLoadingMachines(true);
    try {
      const list = await storeIssuesCache.getOrFetch(
        storeIssuesCache.keys.machines(deptId),
        async () => {
          const res = await apiService.get<any>(
            '/machines',
            {
              departmentId: deptId,
              limit: 100,
              status: 'ACTIVE',
            },
            { useEtag: true },
          );
          return Array.isArray(res) ? res : res?.data || [];
        },
        storeIssuesCache.ttls.lookup,
      );
      setMachines(list);
    } catch {
      setMachines([]);
    } finally {
      setLoadingMachines(false);
    }
  }, []);

  // Cascaded operational sections based on destination division (excluding Store sections)
  const filteredSections = useMemo(() => {
    const storeSecIds = new Set(stores.map((st) => st.sectionId).filter(Boolean));
    return sections.filter((s) => {
      if (destDivisionId && s.divisionId !== destDivisionId) return false;
      const sName = String(s.name || s.sectionName || '').toLowerCase();
      if (storeSecIds.has(s.id) || sName.includes('store')) return false;
      return true;
    });
  }, [sections, destDivisionId, stores]);

  // Cascaded operational/production departments based on destination division & section (excluding Store & unrelated office departments)
  const filteredDepartments = useMemo(() => {
    const storeDeptIds = new Set(stores.map((st) => st.departmentId).filter(Boolean));
    return departments.filter((d) => {
      if (destDivisionId && d.divisionId !== destDivisionId) return false;
      if (destSectionId && d.sectionId !== destSectionId) return false;
      const dName = String(d.name || d.departmentName || '').toLowerCase();
      if (
        storeDeptIds.has(d.id) ||
        dName.includes('store') ||
        dName.includes('raw material')
      ) {
        return false;
      }
      return true;
    });
  }, [departments, destDivisionId, destSectionId, stores]);

  // Filtered stores strictly based on active division
  const filteredStores = useMemo(() => {
    if (!activeDivisionId) return stores;
    return stores.filter((s) => !s.divisionId || s.divisionId === activeDivisionId);
  }, [stores, activeDivisionId]);

  // Load operator & shift incharge suggestions for the selected department / machine (cached)
  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    const machineKey = watchedMachineSelection && watchedMachineSelection !== 'OTHER_GENERAL' ? watchedMachineSelection : undefined;
    (async () => {
      try {
        const d = await storeIssuesCache.getOrFetch(
          storeIssuesCache.keys.personnel(destDepartmentId, machineKey),
          async () => {
            const res = await apiService.get<any>(
              '/store/issues/personnel-suggestions',
              {
                ...(destDepartmentId ? { departmentId: destDepartmentId } : {}),
                ...(machineKey ? { machineId: machineKey } : {}),
              },
              { useEtag: true },
            );
            return res?.data || res || {};
          },
          storeIssuesCache.ttls.lookup,
        );
        if (!cancelled) {
          setOperatorSuggestions(Array.isArray(d.operators) ? d.operators : []);
          setShiftInchargeSuggestions(Array.isArray(d.shiftIncharges) ? d.shiftIncharges : []);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, destDepartmentId, watchedMachineSelection]);

  // Open Create Dialog
  const handleCreate = () => {
    setEditingIssueId(null);
    setEditingIssueStatus(null);
    setEditingOriginalLineQtyMap({});
    form.resetFields();
    const autoIssueNum = `SIN-${dayjs().format('YYYYMMDD')}-${Math.floor(1000 + Math.random() * 9000)}`;
    form.setFieldsValue({
      issueNumber: autoIssueNum,
      issueDate: dayjs(),
      machineSelection: 'OTHER_GENERAL',
      issuedByName: currentUserDisplayName,
    });
    setDestDivisionId(undefined);
    setDestSectionId(undefined);
    setDestDepartmentId(undefined);
    setSelectedSourceStoreId(undefined);
    setActiveDivisionId(undefined);
    setMachines([]);
    setLineItems([]);
    setModalOpen(true);
  };

  // Open Edit Dialog for DRAFT or POSTED issue
  const handleEditDraft = async (record: MaterialIssue) => {
    try {
      const detail = await apiService.get<any>(`/store/material-issues/${record.id}`);
      const d: MaterialIssue = detail?.data || detail || record;
      setEditingIssueId(record.id);
      const st = d.status || record.status || 'DRAFT';
      setEditingIssueStatus(st);
      const deptId = d.issuedToDepartmentId || d.departmentId || undefined;
      setActiveDivisionId(d.divisionId || undefined);
      setDestDivisionId(d.divisionId || undefined);
      setDestSectionId(d.sectionId || undefined);
      setDestDepartmentId(deptId);
      setSelectedSourceStoreId(d.storeId || undefined);

      let loadedMachines: MachineOption[] = [];
      if (deptId && isValidUUID(deptId)) {
        try {
          loadedMachines = await storeIssuesCache.getOrFetch(
            storeIssuesCache.keys.machines(deptId),
            async () => {
              const mRes = await apiService.get<any>(
                '/machines',
                {
                  departmentId: deptId,
                  limit: 100,
                  status: 'ACTIVE',
                },
                { useEtag: true },
              );
              return Array.isArray(mRes) ? mRes : mRes?.data || [];
            },
            storeIssuesCache.ttls.lookup,
          );
          setMachines(loadedMachines);
        } catch {
          setMachines([]);
        }
      } else {
        setMachines([]);
      }

      let matchedMachineId = 'OTHER_GENERAL';
      if (d.referenceDocument && d.referenceDocument.toLowerCase().includes('machine:')) {
        const refText = d.referenceDocument.replace(/^Machine:\s*/i, '').trim();
        const codePart = refText.split('—')[0].trim().toLowerCase();
        const foundMachine = loadedMachines.find(
          (m) => m.machineCode?.toLowerCase() === codePart || refText.toLowerCase().includes(m.machineCode?.toLowerCase() || ''),
        );
        if (foundMachine) {
          matchedMachineId = foundMachine.id;
        }
      }

      form.setFieldsValue({
        divisionId: d.divisionId || undefined,
        storeId: d.storeId,
        issueNumber: d.issueNumber,
        issueDate: d.issueDate ? dayjs(d.issueDate) : dayjs(),
        sectionId: d.sectionId || undefined,
        departmentId: deptId,
        machineSelection: matchedMachineId,
        operatorName: d.operatorName || undefined,
        shiftInchargeName: d.shiftInchargeName || undefined,
        issuedByName: d.issuedByName || currentUserDisplayName,
        purpose: d.purpose || undefined,
        remarks: d.remarks || undefined,
      });

      const rawLines = Array.isArray(d.lines) ? d.lines : [];
      const origQtyMap: Record<string, number> = {};
      if (st === 'POSTED') {
        rawLines.forEach((l: any) => {
          if (l.itemId) {
            origQtyMap[l.itemId] = (origQtyMap[l.itemId] || 0) + Number(l.quantity || 0);
          }
        });
      }
      setEditingOriginalLineQtyMap(origQtyMap);

      setLineItems(
        rawLines.map((l: any, idx: number) => ({
          key: l.id || `edit-${idx}-${Date.now()}`,
          itemId: l.itemId,
          itemCode: l.itemCode || '',
          itemName: l.itemName || '',
          itemType: l.itemType || '',
          uomId: l.uomId,
          uomCode: l.uomCode || '',
          quantity: Number(l.quantity || 1),
          availableStock: l.remainingStock != null ? Number(l.remainingStock) : undefined,
          oldItemReturnedQty: Number(l.oldItemReturnedQty || 0),
          remarks: l.remarks || undefined,
        })),
      );
      setModalOpen(true);
    } catch {
      message.error('Failed to load store issue note for editing');
    }
  };

  // When Primary Division changes
  const handleDivisionChange = (divId?: string) => {
    setActiveDivisionId(divId);
    setDestDivisionId(divId);
    setDestSectionId(undefined);
    setDestDepartmentId(undefined);
    form.setFieldsValue({
      sectionId: undefined,
      departmentId: undefined,
      machineSelection: 'OTHER_GENERAL',
    });
    setMachines([]);

    // Align source store to the newly selected division
    const matchingStores = divId ? stores.filter((s) => !s.divisionId || s.divisionId === divId) : stores;
    if (selectedSourceStoreId && !matchingStores.some((s) => s.id === selectedSourceStoreId)) {
      if (matchingStores.length > 0) {
        setSelectedSourceStoreId(matchingStores[0].id);
        form.setFieldsValue({ storeId: matchingStores[0].id });
      } else {
        setSelectedSourceStoreId(undefined);
        form.setFieldsValue({ storeId: undefined });
      }
    } else if (!selectedSourceStoreId && matchingStores.length > 0) {
      setSelectedSourceStoreId(matchingStores[0].id);
      form.setFieldsValue({ storeId: matchingStores[0].id });
    }
  };

  const handleSectionChange = (secId?: string) => {
    setDestSectionId(secId);
    setDestDepartmentId(undefined);
    form.setFieldsValue({ departmentId: undefined, machineSelection: 'OTHER_GENERAL' });
    setMachines([]);
  };

  const handleDepartmentChange = (deptId?: string) => {
    setDestDepartmentId(deptId);
    const deptObj = departments.find((d) => d.id === deptId);
    if (deptObj?.sectionId && !destSectionId) {
      setDestSectionId(deptObj.sectionId);
      form.setFieldsValue({ sectionId: deptObj.sectionId, machineSelection: 'OTHER_GENERAL' });
    } else {
      form.setFieldsValue({ machineSelection: 'OTHER_GENERAL' });
    }
    if (deptId) {
      loadMachinesForDepartment(deptId);
    } else {
      setMachines([]);
    }
  };

  const handleSourceStoreChange = (storeId?: string) => {
    setSelectedSourceStoreId(storeId);
    const storeObj = stores.find((s) => s.id === storeId);
    // If store has division and user hasn't set division yet, auto-set division
    if (storeObj?.divisionId && !activeDivisionId) {
      setActiveDivisionId(storeObj.divisionId);
      setDestDivisionId(storeObj.divisionId);
      form.setFieldsValue({ divisionId: storeObj.divisionId });
    }
  };

  // 3-Step Confirmation & Animated Success Modal state
  const [issueConfirmPhase, setIssueConfirmPhase] = useState<ConfirmAndSuccessPhase>('idle');
  const [pendingIssuePayload, setPendingIssuePayload] = useState<any>(null);
  const [issueFeedbackMeta, setIssueFeedbackMeta] = useState<{
    refNum: string;
    lineCount: number;
    storeName: string;
    errorMessage?: string;
    savedRecord?: MaterialIssue;
  }>({ refNum: '', lineCount: 0, storeName: '' });

  // Submit / Validate Material Issue -> Open Step 1 Confirmation
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Please add at least one line item');
        return;
      }
      if (values.storeId && !isValidUUID(values.storeId)) {
        message.error('Please select a valid source store');
        return;
      }

      for (const line of lineItems) {
        if (!line.itemId || !isValidUUID(line.itemId)) {
          message.error(`Please select a valid item for line "${line.itemName || 'unknown'}"`);
          return;
        }
        if (!line.uomId || !isValidUUID(line.uomId)) {
          message.error(`Please select a valid UOM for line "${line.itemCode || line.itemName || 'item'}"`);
          return;
        }
        const qty = Number(line.quantity || 0);
        const avail = Number(line.availableStock ?? 0);
        const priorPostedQty = editingIssueStatus === 'POSTED' && line.itemId ? Number(editingOriginalLineQtyMap[line.itemId] || 0) : 0;
        const effectiveAvail = avail + priorPostedQty;
        if (qty <= 0) {
          message.error(`Quantity must be greater than zero for line "${line.itemCode || 'item'}"`);
          return;
        }
        if (effectiveAvail <= 0) {
          message.error(`Cannot issue item "${line.itemCode}": This item is currently Out of Stock (0 available in store).`);
          return;
        }
        if (qty > effectiveAvail) {
          message.error(`Cannot issue item "${line.itemCode}": Requested quantity (${qty}) exceeds available stock (${effectiveAvail}) in store.`);
          return;
        }
      }

      // Resolve machine name for reference document
      let machineRef = 'General / Plant Allocation';
      if (values.machineSelection && values.machineSelection !== 'OTHER_GENERAL') {
        const found = machines.find((m) => m.id === values.machineSelection);
        if (found) {
          const mName = (found as any).machineName || (found as any).name || '';
          machineRef = mName ? `Machine: ${found.machineCode} — ${mName}` : `Machine: ${found.machineCode}`;
        }
      }

      const payload = {
        issueNumber: values.issueNumber,
        issueDate: values.issueDate ? values.issueDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        storeId: values.storeId,
        divisionId: values.divisionId || activeDivisionId || undefined,
        sectionId: values.sectionId || undefined,
        departmentId: values.departmentId || undefined,
        issuedToDepartmentId: values.departmentId || undefined,
        purpose: values.purpose || undefined,
        referenceDocument: machineRef,
        remarks: values.remarks || undefined,
        operatorName: values.operatorName ? String(values.operatorName).trim() : undefined,
        shiftInchargeName: values.shiftInchargeName ? String(values.shiftInchargeName).trim() : undefined,
        issuedByName: values.issuedByName ? String(values.issuedByName).trim() : currentUserDisplayName,
        lines: lineItems.map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.quantity || 0),
          oldItemReturnedQty: Number(l.oldItemReturnedQty || 0),
          uomId: l.uomId,
          remarks:
            l.remarks && l.partUsageSnapshot && !String(l.remarks).includes(l.partUsageSnapshot)
              ? `${l.remarks} | ${l.partUsageSnapshot}`
              : l.partUsageSnapshot || l.remarks || undefined,
        })),
      };

      const storeObj = stores.find((s) => s.id === values.storeId);
      setPendingIssuePayload(payload);
      setIssueFeedbackMeta({
        refNum: String(values.issueNumber || ''),
        lineCount: lineItems.length,
        storeName: storeObj?.storeName || 'Selected Store',
        savedRecord: undefined,
      });
      setIssueConfirmPhase('confirm');
    } catch {
      // form.validateFields handles field errors
    }
  };

  const executeIssueSave = async () => {
    if (!pendingIssuePayload) return;
    setIssueConfirmPhase('saving');
    setSubmitting(true);
    try {
      const res = editingIssueId
        ? await apiService.put<any>(`/store/material-issues/${editingIssueId}`, pendingIssuePayload)
        : await apiService.post<any>('/store/material-issues', pendingIssuePayload);
      const savedObj: MaterialIssue | undefined = res?.data || res;
      const savedRef = savedObj?.issueNumber || issueFeedbackMeta.refNum;
      storeIssuesCache.invalidateIssues();
      setIssueFeedbackMeta((prev) => ({
        ...prev,
        refNum: savedRef,
        savedRecord: savedObj?.id ? savedObj : undefined,
      }));
      setIssueConfirmPhase('success');
      setModalOpen(false);
      setEditingIssueId(null);
      setPendingIssuePayload(null);
      fetchData(true);
    } catch (err: any) {
      const msg: any =
        err?.response?.data?.message ||
        err?.message ||
        (editingIssueId ? 'Failed to update draft Store Issue Note' : 'Failed to create Store Issue Note');
      setIssueFeedbackMeta((prev) => ({
        ...prev,
        errorMessage: Array.isArray(msg) ? msg[0] : String(msg),
      }));
      setIssueConfirmPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  const [rowActionState, setRowActionState] = useState<{
    phase: ConfirmAndSuccessPhase;
    action: 'post' | 'cancel' | 'delete';
    record: MaterialIssue | null;
    errorMessage?: string;
  }>({ phase: 'idle', action: 'post', record: null });

  const openRowActionConfirm = (action: 'post' | 'cancel' | 'delete', record: MaterialIssue) => {
    setRowActionState({ phase: 'confirm', action, record });
  };

  const executeRowAction = async () => {
    const { action, record } = rowActionState;
    if (!record) return;
    setRowActionState((prev) => ({ ...prev, phase: 'saving', errorMessage: undefined }));
    try {
      if (action === 'post') {
        await apiService.post(`/store/material-issues/${record.id}/post`);
      } else if (action === 'cancel') {
        await apiService.post(`/store/material-issues/${record.id}/cancel`);
      } else if (action === 'delete') {
        await apiService.delete(`/store/material-issues/${record.id}`);
      }
      storeIssuesCache.invalidateIssues();
      setRowActionState((prev) => ({ ...prev, phase: 'success' }));
      fetchData(true);
    } catch (err: any) {
      const msg: any = err?.response?.data?.message || err?.message || `Failed to ${action} Store Issue Note`;
      setRowActionState((prev) => ({
        ...prev,
        phase: 'error',
        errorMessage: Array.isArray(msg) ? msg.join(', ') : String(msg),
      }));
    }
  };

  const [printVoucher, setPrintVoucher] = useState<StoreVoucherData | null>(null);

  const buildVoucherDataFromIssue = async (record: MaterialIssue): Promise<StoreVoucherData> => {
    const detail = await apiService.get<any>(`/store/material-issues/${record.id}`);
    const d = detail?.data || detail || record;
    const lines = Array.isArray(d.lines) ? d.lines : [];
    const refDoc = d.referenceDocument || record.referenceDocument || '';
    const machineName = refDoc.replace(/^Machine:\s*/i, '') || 'General / Plant Allocation';
    return {
      type: 'MIV',
      documentNumber: d.issueNumber || record.issueNumber,
      date: (d.issueDate || record.issueDate) ? String(d.issueDate || record.issueDate).slice(0, 10) : undefined,
      status: d.status || record.status,
      divisionName: (d.divisionId || record.divisionId) ? divisionMap[d.divisionId || record.divisionId!] : undefined,
      storeName: record.storeName || ((d.storeId || record.storeId) ? storeMap[d.storeId || record.storeId] : undefined),
      sectionName: (d.sectionId || record.sectionId) ? sectionMap[d.sectionId || record.sectionId!] : undefined,
      departmentName: (d.issuedToDepartmentId || record.issuedToDepartmentId)
        ? deptMap[d.issuedToDepartmentId || record.issuedToDepartmentId!]
        : (d.departmentId || record.departmentId)
          ? deptMap[d.departmentId || record.departmentId!]
          : undefined,
      machineName,
      operatorName: d.operatorName || record.operatorName || undefined,
      shiftInchargeName: d.shiftInchargeName || record.shiftInchargeName || undefined,
      issuedByName: d.issuedByName || record.issuedByName || currentUserDisplayName,
      purpose: d.purpose || record.purpose || undefined,
      remarks: d.remarks || record.remarks || undefined,
      lines: lines.map((l: any, idx: number) => ({
        key: l.id || idx,
        lineNumber: idx + 1,
        itemCode: l.itemCode,
        itemName: l.itemName || l.itemId,
        uomCode: l.uomCode,
        quantity: Number(l.quantity || 0),
        returnedQty: Number(l.oldItemReturnedQty || 0),
        lastIssuedInfo: l.lastIssuedSummary || undefined,
        remainingStock: l.remainingStock != null ? Number(l.remainingStock) : undefined,
        remainingStockUom: l.uomCode || undefined,
        remarks: l.remarks || undefined,
      })),
    };
  };

  const openPrintModal = async (record: MaterialIssue) => {
    try {
      const voucherData = await buildVoucherDataFromIssue(record);
      setPrintVoucher(voucherData);
    } catch {
      message.error('Failed to load issue details for printing');
    }
  };

  const handleDirectPrint = async (record: MaterialIssue) => {
    try {
      const voucherData = await buildVoucherDataFromIssue(record);
      printStoreVoucherHtml(voucherData);
    } catch {
      message.error('Failed to load issue details for printing');
    }
  };

  const handleDirectDownloadPdf = async (record: MaterialIssue) => {
    try {
      const voucherData = await buildVoucherDataFromIssue(record);
      downloadStoreVoucherPdf(voucherData);
      message.success(`Downloaded PDF for ${voucherData.documentNumber}`);
    } catch {
      message.error('Failed to generate PDF for this Store Issue Note');
    }
  };

  const handleViewDetails = async (record: MaterialIssue) => {
    setViewRecord(record);
    setLoadingView(true);
    try {
      const detail = await apiService.get<any>(`/store/material-issues/${record.id}`);
      const d = detail?.data || detail || record;
      setViewRecord(d);
    } catch {
      // Keep summary record in modal if detail fetch fails
    } finally {
      setLoadingView(false);
    }
  };

  const handleShareRowWhatsApp = async (record: MaterialIssue) => {
    try {
      const existingLines = Array.isArray(record.lines) ? record.lines : [];
      const needsFetch =
        existingLines.length === 0 ||
        existingLines.some((l: any) => l.remainingStock === undefined || l.lastIssuedSummary === undefined);

      let source: any = record;
      if (needsFetch) {
        const detail = await apiService.get<any>(`/store/material-issues/${record.id}`);
        source = detail?.data || detail || record;
      }

      const lines = Array.isArray(source.lines) ? source.lines : [];
      const deptId = source.issuedToDepartmentId || source.departmentId || record.issuedToDepartmentId || record.departmentId;
      const divId = source.divisionId || record.divisionId;
      const secId = source.sectionId || record.sectionId;
      const refDoc = source.referenceDocument || record.referenceDocument || '';
      const machineLabel = refDoc.replace(/^Machine:\s*/i, '') || 'General / Plant Allocation';

      shareStoreIssueOnWhatsApp({
        sinNumber: source.issueNumber || record.issueNumber,
        date: source.issueDate || record.issueDate,
        divisionName: divId ? divisionMap[divId] : undefined,
        sectionName: secId ? sectionMap[secId] : deptId ? deptMap[deptId] : undefined,
        machineName: machineLabel,
        operatorName: source.operatorName || record.operatorName,
        shiftInchargeName: source.shiftInchargeName || record.shiftInchargeName,
        issuedByName: source.issuedByName || record.issuedByName || currentUserDisplayName,
        purpose: source.purpose || record.purpose,
        remarks: source.remarks || record.remarks,
        lines: lines.map((l: any) => ({
          itemCode: l.itemCode,
          itemName: l.itemName || l.itemId,
          quantity: Number(l.quantity || 0),
          uomCode: l.uomCode,
          oldItemReturnedQty: Number(l.oldItemReturnedQty || 0),
          lastIssuedSummary: l.lastIssuedSummary,
          remainingStock: l.remainingStock != null ? Number(l.remainingStock) : undefined,
          remainingStockUom: l.uomCode,
          remarks: l.remarks,
        })),
      });
      message.success('WhatsApp Store Issue message opened and copied to clipboard');
    } catch {
      message.error('Failed to prepare WhatsApp message for this Store Issue Note');
    }
  };

  const handleShareFormWhatsApp = () => {
    const values = form.getFieldsValue();
    if (lineItems.length === 0) {
      message.warning('Please add at least one line item before sharing via WhatsApp');
      return;
    }
    let machineLabel = 'General / Plant Allocation';
    if (values.machineSelection && values.machineSelection !== 'OTHER_GENERAL') {
      const found = machines.find((m) => m.id === values.machineSelection);
      if (found) {
        const mName = (found as any).machineName || (found as any).name || '';
        machineLabel = mName ? `${found.machineCode} — ${mName}` : found.machineCode;
      }
    }
    const divId = values.divisionId || activeDivisionId;
    const secId = values.sectionId || destSectionId;
    const deptId = values.departmentId || destDepartmentId;

    shareStoreIssueOnWhatsApp({
      sinNumber: values.issueNumber || 'DRAFT',
      date: values.issueDate ? values.issueDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      divisionName: divId ? divisionMap[divId] : undefined,
      sectionName: secId ? sectionMap[secId] : deptId ? deptMap[deptId] : undefined,
      machineName: machineLabel,
      operatorName: values.operatorName ? String(values.operatorName).trim() : undefined,
      shiftInchargeName: values.shiftInchargeName ? String(values.shiftInchargeName).trim() : undefined,
      issuedByName: values.issuedByName ? String(values.issuedByName).trim() : currentUserDisplayName,
      purpose: values.purpose,
      remarks: values.remarks,
      lines: lineItems.map((l) => ({
        itemCode: l.itemCode,
        itemName: l.itemName,
        quantity: Number(l.quantity || 0),
        uomCode: l.uomCode,
        oldItemReturnedQty: Number(l.oldItemReturnedQty || 0),
        lastIssuedSummary: l.partUsageSnapshot || 'First time issuing this part to this machine',
        remainingStock:
          l.availableStock !== undefined
            ? Math.max(0, Number(l.availableStock || 0) - Number(l.quantity || 0))
            : undefined,
        remainingStockUom: l.uomCode,
        remarks: l.remarks,
      })),
    });
    message.success('WhatsApp Store Issue message opened and copied to clipboard');
  };

  // Delete Issue
  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/store/material-issues/${id}`);
      storeIssuesCache.invalidateIssues();
      message.success('Store Issue Note deleted successfully');
      fetchData(true);
    } catch (err: any) {
      const msg: any = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to delete Store Issue Note');
    }
  };

  // Filtered list based on status and search query
  const storeObjMap = useMemo(() => {
    const map: Record<string, StoreOption> = {};
    stores.forEach((st) => {
      map[st.id] = st;
    });
    return map;
  }, [stores]);

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      if (activeTab !== 'ALL' && item.status !== activeTab) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const matchNum = item.issueNumber?.toLowerCase().includes(q);
      const matchPurpose = item.purpose?.toLowerCase().includes(q);
      const matchRef = item.referenceDocument?.toLowerCase().includes(q);
      const matchStore = storeMap[item.storeId]?.toLowerCase().includes(q);
      const matchRemarks = item.remarks?.toLowerCase().includes(q);
      const matchOperator = item.operatorName?.toLowerCase().includes(q);
      const matchIncharge = item.shiftInchargeName?.toLowerCase().includes(q);
      const matchIssuedBy = item.issuedByName?.toLowerCase().includes(q);
      const matchLines = (item.lines || []).some(
        (ln: any) =>
          String(ln.itemCode || '').toLowerCase().includes(q) ||
          String(ln.itemName || '').toLowerCase().includes(q),
      );
      return (
        matchNum ||
        matchPurpose ||
        matchRef ||
        matchStore ||
        matchRemarks ||
        matchOperator ||
        matchIncharge ||
        matchIssuedBy ||
        matchLines
      );
    });
  }, [data, activeTab, searchQuery, storeMap]);

  // Statistics
  const draftCount = data.filter((d) => d.status === 'DRAFT').length;
  const postedCount = data.filter((d) => d.status === 'POSTED').length;
  const cancelledCount = data.filter((d) => d.status === 'CANCELLED').length;

  const renderIssuedItemStack = (line: any) => {
    const codeStr = String(line.itemCode || '').trim();
    const rawName = String(line.itemName || codeStr || '—').trim();
    const parenIdx = rawName.indexOf('(');
    const mainName = parenIdx > 0 ? rawName.slice(0, parenIdx).trim() : rawName;
    const specPart = parenIdx > 0 ? rawName.slice(parenIdx).trim() : '';
    const qtyNum = Number(line.quantity || 0);
    const qtyLabel = `${Number.isInteger(qtyNum) ? qtyNum.toLocaleString('en-US') : Number(qtyNum.toFixed(2)).toLocaleString('en-US')}${line.uomCode ? ` ${line.uomCode}` : ''}`;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        {/* Line 1 (Top): Bold Orange Item Code pill + Quantity badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {codeStr && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                color: '#EA580C',
                background: '#FFF7ED',
                border: '1px solid #FED7AA',
                fontWeight: 700,
                fontSize: 12,
                lineHeight: '18px',
                padding: '0 7px',
                borderRadius: 5,
                letterSpacing: '0.02em',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {codeStr}
            </span>
          )}
          <Tag
            color="blue"
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: 11,
              lineHeight: '18px',
              padding: '0 7px',
              borderRadius: 10,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {qtyLabel}
          </Tag>
        </div>

        {/* Line 2 (Middle): Main Item Name before '(' */}
        <span
          style={{
            fontWeight: 700,
            fontSize: 13,
            lineHeight: 1.3,
            color: token.colorText,
            whiteSpace: 'normal',
            wordBreak: 'break-word',
          }}
        >
          {mainName}
        </span>

        {/* Line 3 (Bottom): Full bracketed specification starting at '(' */}
        {specPart && (
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              lineHeight: 1.3,
              color: token.colorTextSecondary,
              whiteSpace: 'normal',
              wordBreak: 'break-word',
            }}
          >
            {specPart}
          </span>
        )}
      </div>
    );
  };

  const buildExportRows = useCallback((): StoreIssueExportRow[] => {
    return filteredData.map((r) => {
      const deptId = r.issuedToDepartmentId || r.departmentId;
      const lines = Array.isArray(r.lines) ? r.lines : [];
      const itemSummary = lines
        .map((ln: any) => `${ln.itemCode || ''} ${ln.itemName || ''} (${Number(ln.quantity || 0)} ${ln.uomCode || ''})`.trim())
        .filter(Boolean)
        .join(' | ');
      return {
        issueNumber: r.issueNumber,
        issueDate: r.issueDate ? dayjs(r.issueDate).format('YYYY-MM-DD') : '',
        status: r.status,
        divisionName: r.divisionId ? divisionMap[r.divisionId] || '' : '',
        storeName: r.storeName || (r.storeId ? storeMap[r.storeId] || '' : ''),
        sectionName: r.sectionId ? sectionMap[r.sectionId] || '' : '',
        departmentName: deptId ? deptMap[deptId] || '' : '',
        machineAllocation: (r.referenceDocument || 'General Allocation').replace(/^Machine:\s*/i, ''),
        operatorName: r.operatorName || '',
        shiftInchargeName: r.shiftInchargeName || '',
        storeInchargeName: r.issuedByName || currentUserDisplayName,
        totalOldReturnedQty: lines.reduce((acc: number, ln: any) => acc + Number(ln.oldItemReturnedQty || 0), 0),
        purpose: r.purpose || '',
        remarks: r.remarks || '',
        lineCount: lines.length,
        itemSummary,
        lines: lines.map((ln: any, idx: number) => ({
          lineNumber: ln.lineNumber ?? idx + 1,
          itemCode: ln.itemCode,
          itemName: ln.itemName,
          quantity: Number(ln.quantity || 0),
          uomCode: ln.uomCode,
          oldItemReturnedQty: Number(ln.oldItemReturnedQty || 0),
          unitCost: ln.unitCost != null ? Number(ln.unitCost) : null,
          totalCost: ln.totalCost != null ? Number(ln.totalCost) : null,
          remarks: ln.remarks,
        })),
      };
    });
  }, [filteredData, divisionMap, storeMap, sectionMap, deptMap, currentUserDisplayName]);

  const handleExportExcel = (format: 'xlsx' | 'csv') => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      message.warning('No Store Issue Notes match the current filter to export');
      return;
    }
    const stamp = dayjs().format('YYYYMMDD_HHmm');
    if (format === 'csv') {
      const csv = buildStoreIssuesCsv(rows);
      triggerDownloadBlob(
        new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
        `Store_Issue_Notes_${stamp}.csv`,
      );
      message.success(`Exported ${rows.length} Store Issue Notes to CSV`);
      return;
    }
    const blob = buildStoreIssuesXlsxBlob(rows);
    triggerDownloadBlob(blob, `Store_Issue_Notes_${stamp}.xlsx`);
    message.success(`Exported ${rows.length} Store Issue Notes to Excel (.xlsx)`);
  };

  const handlePrintDirectory = () => {
    const rows = buildExportRows();
    const esc = (v?: string | number | null) =>
      String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const rowsHtml = rows
      .map(
        (r, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td style="font-family:monospace;font-weight:700;white-space:nowrap;">${esc(r.issueNumber)}<div style="font-size:10px;color:#475569;">${esc(r.issueDate)}</div></td>
        <td>${esc(r.status)}</td>
        <td>${esc(r.storeName)}</td>
        <td>${esc([r.sectionName, r.departmentName].filter(Boolean).join(' / ') || '—')}<div style="font-size:10px;color:#1d4ed8;">${esc(r.machineAllocation)}</div></td>
        <td>${esc(r.itemSummary || '—')}</td>
        <td style="white-space:nowrap;">Op: ${esc(r.operatorName || '—')}<br/>SI: ${esc(r.shiftInchargeName || '—')}<br/>SK: ${esc(r.storeInchargeName || '—')}</td>
        <td style="text-align:right;">${Number(r.totalOldReturnedQty || 0).toLocaleString()}</td>
        <td>${esc(r.purpose || r.remarks || '—')}</td>
      </tr>`,
      )
      .join('');

    const html = `
      <div class="company-header">
        <div class="company-logo-info">
          <img class="company-logo" src="${getLogoUrl()}" alt="PWI Logo" onerror="this.style.display='none'" />
          <div>
            <div class="company-name">Pakistan Wire Industries (Pvt.) LTD</div>
            <div class="company-sub">Plot 179, Block E, SITE Superhighway, Karachi, Pakistan</div>
            <div class="company-tax">Store Department · Status Filter: ${esc(activeTab)}${searchQuery ? ` · Search: "${esc(searchQuery)}"` : ''} · Records: ${rows.length}</div>
          </div>
        </div>
        <div class="doc-badge-box">
          <div class="doc-badge">STORE ISSUE NOTES REGISTER</div>
          <div class="doc-badge-sub">Printed ${dayjs().format('DD-MMM-YYYY HH:mm')}</div>
        </div>
      </div>
      <table class="print-table">
        <thead>
          <tr>
            <th style="width:28px;text-align:center;">#</th>
            <th>SIN # / Date</th>
            <th>Status</th>
            <th>Source Store</th>
            <th>Section / Dept / Machine</th>
            <th>Issued Item(s)</th>
            <th>Personnel</th>
            <th style="text-align:right;">Scrap Ret.</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="9" style="text-align:center;padding:14px;">No Store Issue Notes found</td></tr>'}
        </tbody>
      </table>
    `;
    printHtmlContent('Store Issue Notes Register', html);
  };

  const columns: ColumnsType<MaterialIssue> = [
    {
      title: 'SIN #',
      dataIndex: 'issueNumber',
      key: 'issueNumber',
      width: 165,
      fixed: 'left',
      className: 'pwi-sin-nowrap-cell pwi-sin-tabular',
      onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v: string, r) => (
        <div>
          <Typography.Text strong style={{ color: token.colorPrimary, display: 'block', whiteSpace: 'nowrap' }}>
            {v}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
            {r.issueDate ? dayjs(r.issueDate).format('YYYY-MM-DD') : '—'}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Source Store',
      dataIndex: 'storeId',
      key: 'storeId',
      width: 180,
      className: 'pwi-sin-nowrap-cell',
      onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (id: string, r) => {
        const st = storeObjMap[id];
        const fallbackLabel = storeMap[id] || r.storeName || id || '—';
        const parts = String(fallbackLabel).split(/\s*[—–]\s*/);
        const storeCode = st?.storeCode || (parts.length > 1 ? parts[0].trim() : fallbackLabel);
        const storeName = st?.storeName || (parts.length > 1 ? parts.slice(1).join(' — ').trim() : '');
        const combinedLower = `${storeCode} ${storeName}`.toLowerCase();
        const isGeneral =
          st?.storeType === 'GENERAL' ||
          combinedLower.includes('general') ||
          combinedLower.includes('gs');

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.3 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: token.colorText }}>
              {storeCode}
            </span>
            {storeName && (
              <span style={{ fontSize: 12, fontWeight: 500, color: token.colorTextSecondary }}>
                {storeName}
              </span>
            )}
            {isGeneral && (
              <Tag
                color="green"
                style={{ fontSize: '10.5px', fontWeight: 600, width: 'fit-content', margin: 0, borderRadius: 5 }}
              >
                General Store
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: 'Issued Item(s)',
      key: 'issuedItems',
      width: 280,
      onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (_: any, r: MaterialIssue) => {
        const lines = Array.isArray(r.lines) ? r.lines : [];
        if (lines.length === 0) {
          return <Typography.Text type="secondary">—</Typography.Text>;
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lines.map((ln: any, idx: number) => (
              <div
                key={ln.id || `${r.id}-ln-${idx}`}
                style={
                  idx > 0
                    ? { paddingTop: 7, borderTop: `1px dashed ${token.colorBorderSecondary}` }
                    : undefined
                }
              >
                {renderIssuedItemStack(ln)}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      title: 'Destination Dept & Machine',
      key: 'destination',
      width: 245,
      className: 'pwi-sin-nowrap-cell',
      onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (_: any, r: MaterialIssue) => {
        const deptId = r.issuedToDepartmentId || r.departmentId;
        const deptName = deptId ? deptMap[deptId] || 'Department' : 'Factory Dept';
        const secName = r.sectionId ? sectionMap[r.sectionId] : undefined;
        const machineRef = r.referenceDocument || 'General Allocation';
        const isSpecificMachine = machineRef.toLowerCase().includes('machine:');

        return (
          <Space direction="vertical" size={3}>
            <Space size={4}>
              <ApartmentOutlined style={{ color: token.colorPrimary }} />
              <Typography.Text strong style={{ fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                {secName ? `${secName} · ${deptName}` : deptName}
              </Typography.Text>
            </Space>
            {isSpecificMachine ? (
              <Tag color="geekblue" icon={<SettingOutlined />} style={{ fontSize: '11px', margin: 0, whiteSpace: 'nowrap' }}>
                {machineRef.replace(/^Machine:\s*/i, '')}
              </Tag>
            ) : (
              <Tag style={{ fontSize: '11px', margin: 0, whiteSpace: 'nowrap' }}>
                {machineRef}
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Personnel (Operator / Incharge)',
      key: 'personnel',
      width: 225,
      className: 'pwi-sin-nowrap-cell',
      onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (_: any, r: MaterialIssue) => (
        <Space direction="vertical" size={2}>
          <div style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
            <Typography.Text type="secondary" style={{ fontSize: '11px' }}>Operator: </Typography.Text>
            <Typography.Text strong style={{ fontSize: '12px' }}>
              {r.operatorName || '—'}
            </Typography.Text>
          </div>
          <div style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
            <Typography.Text type="secondary" style={{ fontSize: '11px' }}>Shift Incharge: </Typography.Text>
            <Typography.Text style={{ fontSize: '12px' }}>
              {r.shiftInchargeName || '—'}
            </Typography.Text>
          </div>
          <div style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
            <Typography.Text type="secondary" style={{ fontSize: '11px' }}>Store Incharge: </Typography.Text>
            <Tag color="orange" style={{ fontSize: '10px', margin: 0, lineHeight: '16px', padding: '0 6px' }}>
              {r.issuedByName || currentUserDisplayName}
            </Tag>
          </div>
        </Space>
      ),
    },
    {
      title: 'Purpose / Remarks',
      dataIndex: 'purpose',
      key: 'purpose',
      width: 190,
      ellipsis: true,
      onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v: string, r) => (
        <Tooltip title={r.remarks ? `${v || 'No purpose'} | Remarks: ${r.remarks}` : v}>
          <span>{v || r.remarks || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 105,
      className: 'pwi-sin-nowrap-cell',
      onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v: string) => {
        const colors: Record<string, string> = { DRAFT: 'blue', POSTED: 'success', CANCELLED: 'volcano' };
        return <Tag color={colors[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 245,
      fixed: 'right',
      className: 'pwi-sin-nowrap-cell',
      onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (_: any, record: MaterialIssue) => (
        <Space size={4} wrap={false}>
          <Tooltip title="View Details">
            <Button
              size="small"
              icon={<EyeOutlined />}
              aria-label="View Details"
              onClick={() => handleViewDetails(record)}
            />
          </Tooltip>
          {canUpdate && record.status !== 'CANCELLED' && (
            <Tooltip title="Edit SIN">
              <Button
                size="small"
                icon={<EditOutlined />}
                aria-label="Edit SIN"
                onClick={() => handleEditDraft(record)}
                style={{ borderColor: '#f97316', color: '#ea580c' }}
              />
            </Tooltip>
          )}
          <Tooltip title="Print SIN Slip">
            <Button
              size="small"
              icon={<PrinterOutlined />}
              aria-label="Print SIN Slip"
              onClick={() => handleDirectPrint(record)}
            />
          </Tooltip>
          <Tooltip title="Download PDF">
            <Button
              size="small"
              icon={<FilePdfOutlined />}
              aria-label="Download PDF"
              onClick={() => handleDirectDownloadPdf(record)}
            />
          </Tooltip>
          <Tooltip title="Share via WhatsApp">
            <Button
              size="small"
              icon={<WhatsAppOutlined />}
              aria-label="Share via WhatsApp"
              onClick={() => handleShareRowWhatsApp(record)}
              style={{ color: '#16a34a', borderColor: '#86efac' }}
            />
          </Tooltip>
          {record.status === 'DRAFT' && canPost && (
            <Tooltip title="Post to Stock">
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                aria-label="Post to Stock"
                onClick={() => openRowActionConfirm('post', record)}
              />
            </Tooltip>
          )}
          {record.status === 'DRAFT' && (
            <Tooltip title="Cancel Draft">
              <Button
                size="small"
                icon={<RollbackOutlined />}
                aria-label="Cancel Draft"
                onClick={() => openRowActionConfirm('cancel', record)}
              />
            </Tooltip>
          )}
          {(record.status === 'DRAFT' || record.status === 'CANCELLED') && (
            <Tooltip title="Delete SIN">
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                aria-label="Delete SIN"
                onClick={() => openRowActionConfirm('delete', record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const { visibleColumns, selectorProps } = useColumnVisibility(
    'pwi_cols_store_issues',
    columns,
    { lockedKeys: ['issueNumber', 'actions'] },
  );

  const tabItems = [
    { key: 'ALL', label: `All Issues (${data.length})` },
    { key: 'DRAFT', label: `Draft (${draftCount})` },
    { key: 'POSTED', label: `Posted (${postedCount})` },
    { key: 'CANCELLED', label: `Cancelled (${cancelledCount})` },
  ];

  const activeDivisionName = activeDivisionId ? divisionMap[activeDivisionId] : undefined;

  return (
    <div>
      <PageHeader
        icon={<ExportOutlined />}
        title="Store Issue Notes (SIN)"
        subtitle="Issue spare parts, tools, and consumables to factory departments and machines"
        extra={
          <Space wrap size={8}>
            <Button icon={<PrinterOutlined />} onClick={handlePrintDirectory}>
              Print View
            </Button>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'xlsx',
                    label: 'Export Excel (.xlsx)',
                    icon: <FileExcelOutlined />,
                    onClick: () => handleExportExcel('xlsx'),
                  },
                  {
                    key: 'csv',
                    label: 'Export CSV (.csv)',
                    icon: <FileTextOutlined />,
                    onClick: () => handleExportExcel('csv'),
                  },
                ],
              }}
            >
              <Button icon={<DownloadOutlined />}>
                Export Excel
              </Button>
            </Dropdown>
            <Button icon={<ReloadOutlined />} onClick={() => fetchData(true)} loading={loading}>
              Refresh
            </Button>
            {canCreate && (
              <Button type="primary" size="middle" icon={<PlusOutlined />} onClick={handleCreate}>
                Create Store Issue Note
              </Button>
            )}
          </Space>
        }
      />

      <div style={{ padding: '0 24px 24px' }}>
        {/* Quick summary tiles */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>Total SIN Vouchers</Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0' }}>{data.length}</Typography.Title>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>Draft / Pending Post</Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0', color: token.colorPrimary }}>{draftCount}</Typography.Title>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>Posted to Stock</Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0', color: token.colorSuccess }}>{postedCount}</Typography.Title>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>Configured Stores</Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0' }}>{stores.length}</Typography.Title>
            </Card>
          </Col>
        </Row>

        <Card styles={{ body: { padding: 16 } }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} style={{ marginBottom: 0 }} />
            <Space wrap>
              <Input
                placeholder="Search SIN #, Item Code, Item Name, Machine..."
                prefix={<SearchOutlined />}
                allowClear
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 300 }}
              />
              <TableColumnSelector {...selectorProps} />
            </Space>
          </div>

          <Table
            className="pwi-sin-compact-table"
            columns={visibleColumns}
            dataSource={filteredData}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 12, showTotal: (t) => `Total ${t} issues` }}
            scroll={{ x: 'max-content' }}
            size="small"
          />
        </Card>
  
    </div>

      {/* CREATE / EDIT MATERIAL ISSUE MODAL — SIGNATURE DOUBLE-BORDER ORANGE WIZARD */}
      <Modal
        title={null}
        footer={null}
        closable={false}
        open={modalOpen}
        zIndex={1050}
        onCancel={() => {
          setModalOpen(false);
          setEditingIssueId(null);
        }}
        width={isMaximized ? '98vw' : isMobile ? '100%' : 1080}
        style={
          isMaximized
            ? { top: 10, margin: '0 auto', maxWidth: '98vw', padding: 0 }
            : isMobile
              ? { top: 10, margin: '0 auto', maxWidth: '100vw' }
              : { top: 20, maxWidth: 1120 }
        }
        styles={{
          content: {
            padding: 0,
            background: 'transparent',
            boxShadow: 'none',
          },
          body: {
            padding: 0,
          },
        }}
        destroyOnHidden
      >
        <div
          style={{
            padding: 7,
            borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.22), rgba(148, 163, 184, 0.20))',
            border: '1px solid rgba(249, 115, 22, 0.35)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.28)',
          }}
        >
          <div
            style={{
              borderRadius: 14,
              background: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              overflow: 'hidden',
            }}
          >
            {/* WIZARD HEADER */}
            <div
              style={{
                padding: '16px 22px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 11,
                    background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 20,
                    boxShadow: '0 6px 16px rgba(234, 88, 12, 0.28)',
                  }}
                >
                  {editingIssueId ? <EditOutlined /> : <ExportOutlined />}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      color: '#ea580c',
                    }}
                  >
                    STORE DEPARTMENT · STORE ISSUE NOTE (SIN)
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: token.colorText }}>
                    {editingIssueId
                      ? editingIssueStatus === 'POSTED'
                        ? 'Edit Posted Store Issue Note'
                        : 'Edit Draft Store Issue Note'
                      : 'Create Store Issue Note'}
                  </div>
                </div>
              </div>

              <Space size={8}>
                {editingIssueId && (
                  <Tag color={editingIssueStatus === 'POSTED' ? 'volcano' : 'orange'} style={{ fontWeight: 700, margin: 0 }}>
                    {editingIssueStatus === 'POSTED' ? 'EDITING POSTED SIN' : 'EDITING DRAFT'}
                  </Tag>
                )}
                <Tooltip title={isMaximized ? 'Restore Default Size' : 'Maximize / Fullscreen'}>
                  <Button
                    type="text"
                    size="small"
                    icon={isMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                    onClick={() => setIsMaximized(!isMaximized)}
                    style={{ color: token.colorTextSecondary }}
                  />
                </Tooltip>
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  onClick={() => {
                    setModalOpen(false);
                    setEditingIssueId(null);
                  }}
                  style={{ color: token.colorTextSecondary }}
                />
              </Space>
            </div>

            {/* WIZARD BODY */}
            <div
              style={{
                padding: '18px 22px',
                maxHeight: isMaximized ? 'calc(92vh - 148px)' : 'calc(82vh - 148px)',
                overflowY: 'auto',
              }}
            >
              <Alert
                type="info"
                showIcon
                icon={<InfoCircleOutlined />}
                message="Factory Store Issue Note (SIN) Voucher"
                description="Select the source store, destination department/machine, operator, and shift incharge. Item selection and live machine lifecycle tracking are strictly scoped to the chosen division."
                style={{ marginBottom: 16 }}
              />

              <Form form={form} layout="vertical">
                {/* SECTION 1: DIVISION & SOURCE STORE HEADER */}
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorFillAlter,
                    marginBottom: 16,
                  }}
                >
                  <Typography.Text strong style={{ display: 'block', marginBottom: 12, color: '#ea580c' }}>
                    <ShopOutlined style={{ marginRight: 6 }} />
                    1. Division & Source Store Header
                  </Typography.Text>
                  <Row gutter={[16, 12]}>
                    <Col xs={24} sm={12} md={6}>
                      <Form.Item
                        name="divisionId"
                        label="Division"
                        rules={[{ required: true, message: 'Please select division' }]}
                        style={{ marginBottom: 4 }}
                      >
                        <Select
                          showSearch
                          allowClear
                          optionFilterProp="label"
                          placeholder="Select Division"
                          onChange={handleDivisionChange}
                          options={divisions.map((d) => ({
                            value: d.id,
                            label: `${d.code || d.divisionCode || 'DIV'} — ${d.name || d.divisionName}`,
                          }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                      <Form.Item
                        name="storeId"
                        label="Source Store"
                        rules={[{ required: true, message: 'Select source store' }]}
                        style={{ marginBottom: 4 }}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder={activeDivisionId ? 'Select Store' : 'Select Division first'}
                          onChange={handleSourceStoreChange}
                          disabled={!activeDivisionId && stores.length > 0}
                          options={filteredStores.map((s) => ({
                            value: s.id,
                            label: `${s.storeCode} — ${s.storeName}`,
                          }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                      <Form.Item
                        name="issueNumber"
                        label="SIN Number"
                        rules={[{ required: true, message: 'SIN # is required' }]}
                        style={{ marginBottom: 4 }}
                      >
                        <Input
                          prefix={<FileTextOutlined style={{ color: token.colorTextTertiary }} />}
                          placeholder="SIN-2026-0001"
                          disabled={Boolean(editingIssueId)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                      <Form.Item
                        name="issueDate"
                        label="SIN Date"
                        rules={[{ required: true, message: 'Date is required' }]}
                        style={{ marginBottom: 4 }}
                      >
                        <DatePicker
                          prefix={<CalendarOutlined style={{ color: token.colorTextTertiary }} />}
                          style={{ width: '100%' }}
                          format="YYYY-MM-DD"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>

                {/* SECTION 2: DESTINATION HIERARCHY, MACHINE & RECEIVING PERSONNEL */}
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorFillAlter,
                    marginBottom: 16,
                  }}
                >
                  <Typography.Text strong style={{ display: 'block', marginBottom: 12, color: '#ea580c' }}>
                    <ApartmentOutlined style={{ marginRight: 6 }} />
                    2. Destination Department, Machine & Receiving Personnel
                  </Typography.Text>
                  <Row gutter={[16, 12]}>
                    <Col xs={24} sm={12}>
                      <Form.Item name="sectionId" label="Destination Section" style={{ marginBottom: 8 }}>
                        <Select
                          showSearch
                          allowClear
                          optionFilterProp="label"
                          placeholder="Select Section"
                          onChange={handleSectionChange}
                          disabled={!activeDivisionId && filteredSections.length === 0}
                          options={filteredSections.map((s) => ({
                            value: s.id,
                            label: `${s.code || s.sectionCode || 'SEC'} — ${s.name || s.sectionName}`,
                          }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="departmentId"
                        label="Issued To Department"
                        rules={[{ required: true, message: 'Please select destination department' }]}
                        style={{ marginBottom: 8 }}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Select Department"
                          onChange={handleDepartmentChange}
                          disabled={!activeDivisionId && filteredDepartments.length === 0}
                          options={filteredDepartments.map((d) => ({
                            value: d.id,
                            label: `${d.code || d.departmentCode || 'DEPT'} — ${d.name || d.departmentName}`,
                          }))}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* DYNAMIC MACHINE SELECTION */}
                  <Row gutter={[16, 12]}>
                    <Col xs={24}>
                      <Form.Item
                        name="machineSelection"
                        style={{ marginBottom: 12 }}
                        label={
                          <Space size={6}>
                            <SettingOutlined style={{ color: '#ea580c' }} />
                            <span>Machine / Equipment Selection</span>
                            <Typography.Text type="secondary" style={{ fontSize: '11px' }}>
                              (Allocated to specific factory machine, or General Allocation if non-machine)
                            </Typography.Text>
                          </Space>
                        }
                        rules={[{ required: true, message: 'Please select a machine or General' }]}
                      >
                        <Select
                          showSearch
                          loading={loadingMachines}
                          placeholder="Select machine (e.g. SPK-01, FT-01) or General Allocation"
                          optionFilterProp="label"
                          options={[
                            {
                              value: 'OTHER_GENERAL',
                              label: '⚙️ General / Plant Allocation (No Specific Machine)',
                            },
                            ...machines.map((m) => {
                              const mName = (m as any).machineName || (m as any).name || '';
                              return {
                                value: m.id,
                                label: mName
                                  ? `⚙️ ${m.machineCode} — ${mName} (${m.machineType || 'Machine'})`
                                  : `⚙️ ${m.machineCode} (${m.machineType || 'Machine'})`,
                              };
                            }),
                          ]}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* OPERATOR, SHIFT INCHARGE & ISSUED BY */}
                  <Row gutter={[16, 12]}>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        name="operatorName"
                        style={{ marginBottom: 4 }}
                        label={
                          <Space size={5}>
                            <UserOutlined style={{ color: '#ea580c' }} />
                            <span>Operator Name (Receiver)</span>
                          </Space>
                        }
                      >
                        <AutoComplete
                          allowClear
                          placeholder="Select or type Operator Name"
                          options={operatorSuggestions.map((name) => ({ value: name, label: name }))}
                          filterOption={(inputValue, option) =>
                            String(option?.value || '')
                              .toLowerCase()
                              .includes(inputValue.toLowerCase())
                          }
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        name="shiftInchargeName"
                        style={{ marginBottom: 4 }}
                        label={
                          <Space size={5}>
                            <UserOutlined style={{ color: token.colorPrimary }} />
                            <span>Shift Incharge / Dept. Head</span>
                          </Space>
                        }
                      >
                        <AutoComplete
                          allowClear
                          placeholder="Select or type Shift Incharge"
                          options={shiftInchargeSuggestions.map((name) => ({ value: name, label: name }))}
                          filterOption={(inputValue, option) =>
                            String(option?.value || '')
                              .toLowerCase()
                              .includes(inputValue.toLowerCase())
                          }
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        name="issuedByName"
                        style={{ marginBottom: 4 }}
                        label={
                          <Space size={5}>
                            <UserOutlined style={{ color: token.colorSuccess }} />
                            <span>Issued By (Store Incharge)</span>
                          </Space>
                        }
                      >
                        <Input
                          prefix={<UserOutlined style={{ color: token.colorTextTertiary }} />}
                          placeholder="Issued By (Store Incharge)"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>

                {/* SECTION 3: PURPOSE & REMARKS */}
                <Row gutter={[16, 12]}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="purpose" label="Purpose / Reason for Issue">
                      <Input placeholder="e.g. Preventive maintenance, Bearing replacement, Tool changeover" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="remarks" label="Remarks / Special Instructions">
                      <Input placeholder="Optional additional remarks" />
                    </Form.Item>
                  </Col>
                </Row>

                <Divider style={{ margin: '10px 0 16px' }} />

                {/* SECTION 4: ISSUED ITEMS STRICTLY FILTERED BY DIVISION */}
                <StoreLineItemsEditor
                  mode="issue"
                  value={lineItems}
                  onChange={setLineItems}
                  storeId={selectedSourceStoreId}
                  divisionId={activeDivisionId}
                  divisionName={activeDivisionName}
                  excludeFinishedGoods={true}
                  label="Issued Store Items"
                  machineId={watchedMachineSelection}
                  issueDate={watchedIssueDate ? watchedIssueDate.format('YYYY-MM-DD') : undefined}
                  excludeIssueId={editingIssueId || undefined}
                  onInspectLifecycle={setLifecycleModalItem}
                />
              </Form>
            </div>

            {/* WIZARD FOOTER */}
            <div
              style={{
                padding: '14px 22px',
                borderTop: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Issued By: <strong style={{ color: token.colorText }}>{currentUserDisplayName}</strong> · Line Items:{' '}
                <strong style={{ color: '#ea580c' }}>{lineItems.length}</strong>
              </Typography.Text>
              <Space size={10}>
                <Button
                  icon={<WhatsAppOutlined />}
                  onClick={handleShareFormWhatsApp}
                  disabled={lineItems.length === 0}
                  style={{ color: '#16a34a', borderColor: '#86efac', fontWeight: 600 }}
                >
                  WhatsApp
                </Button>
                <Button
                  onClick={() => {
                    setModalOpen(false);
                    setEditingIssueId(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="primary"
                  loading={submitting}
                  onClick={handleSave}
                  icon={editingIssueId ? <EditOutlined /> : <CheckOutlined />}
                  style={{
                    background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                    borderColor: '#ea580c',
                    fontWeight: 700,
                    paddingInline: 20,
                  }}
                >
                  {editingIssueId
                    ? editingIssueStatus === 'POSTED'
                      ? 'Save & Reconcile Stock'
                      : 'Save Draft Changes'
                    : 'Create Store Issue Note'}
                </Button>
              </Space>
            </div>
          </div>
        </div>
      </Modal>

      <StoreMaterialLifecycleModal
        open={Boolean(lifecycleModalItem)}
        itemId={lifecycleModalItem?.itemId}
        initialItemCode={lifecycleModalItem?.itemCode}
        initialItemName={lifecycleModalItem?.itemName}
        initialStoreId={selectedSourceStoreId}
        initialTab="Issues"
        onClose={() => setLifecycleModalItem(null)}
      />

      <StoreVoucherPrintModal
        open={!!printVoucher}
        onClose={() => setPrintVoucher(null)}
        voucher={printVoucher}
      />

      {/* VIEW STORE ISSUE NOTE DETAILS MODAL */}
      <Modal
        open={!!viewRecord}
        onCancel={() => setViewRecord(null)}
        footer={null}
        centered
        width={960}
        closable={false}
        styles={{
          content: {
            padding: 7,
            borderRadius: 20,
            background: token.colorFillSecondary,
            border: `1px solid ${token.colorBorder}`,
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.28)',
          },
          body: { padding: 0 },
        }}
      >
        {viewRecord && (
          <div
            style={{
              borderRadius: 14,
              background: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                background: token.colorFillAlter,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <Space size={10}>
                <Typography.Text strong style={{ fontSize: 16 }}>
                  Store Issue Note — {viewRecord.issueNumber}
                </Typography.Text>
                <Tag
                  color={
                    viewRecord.status === 'POSTED'
                      ? 'success'
                      : viewRecord.status === 'CANCELLED'
                        ? 'volcano'
                        : 'blue'
                  }
                >
                  {viewRecord.status}
                </Tag>
              </Space>
              <Space size={8}>
                <Button
                  size="small"
                  icon={<WhatsAppOutlined />}
                  onClick={() => handleShareRowWhatsApp(viewRecord)}
                  style={{ color: '#16a34a', borderColor: '#86efac', fontWeight: 600 }}
                >
                  WhatsApp
                </Button>
                <Button
                  size="small"
                  icon={<FilePdfOutlined />}
                  onClick={() => handleDirectDownloadPdf(viewRecord)}
                >
                  PDF
                </Button>
                <Button
                  size="small"
                  type="primary"
                  icon={<PrinterOutlined />}
                  onClick={() => handleDirectPrint(viewRecord)}
                >
                  Print
                </Button>
                {canUpdate && viewRecord.status !== 'CANCELLED' && (
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      const rec = viewRecord;
                      setViewRecord(null);
                      handleEditDraft(rec);
                    }}
                    style={{ borderColor: '#f97316', color: '#ea580c', fontWeight: 600 }}
                  >
                    Edit
                  </Button>
                )}
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setViewRecord(null)} />
              </Space>
            </div>

            <div style={{ padding: 20, maxHeight: '76vh', overflowY: 'auto' }}>
              <Descriptions
                bordered
                size="small"
                column={{ xs: 1, sm: 2, md: 3 }}
                style={{ marginBottom: 16 }}
              >
                <Descriptions.Item label="SIN #">
                  <Typography.Text strong style={{ fontFamily: 'monospace' }}>
                    {viewRecord.issueNumber}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="Issue Date">
                  {viewRecord.issueDate ? dayjs(viewRecord.issueDate).format('DD-MMM-YYYY') : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Division">
                  {viewRecord.divisionId ? divisionMap[viewRecord.divisionId] || '—' : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Source Store">
                  {viewRecord.storeName || (viewRecord.storeId ? storeMap[viewRecord.storeId] || '—' : '—')}
                </Descriptions.Item>
                <Descriptions.Item label="Destination Section">
                  {viewRecord.sectionId ? sectionMap[viewRecord.sectionId] || '—' : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Department">
                  {(viewRecord.issuedToDepartmentId || viewRecord.departmentId)
                    ? deptMap[viewRecord.issuedToDepartmentId || viewRecord.departmentId!] || '—'
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Machine / Allocation" span={2}>
                  {(viewRecord.referenceDocument || 'General / Plant Allocation').replace(/^Machine:\s*/i, '')}
                </Descriptions.Item>
                <Descriptions.Item label="Store Incharge">
                  {viewRecord.issuedByName || currentUserDisplayName}
                </Descriptions.Item>
                <Descriptions.Item label="Operator">
                  {viewRecord.operatorName || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Shift Incharge">
                  {viewRecord.shiftInchargeName || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Purpose">
                  {viewRecord.purpose || '—'}
                </Descriptions.Item>
                {viewRecord.remarks && (
                  <Descriptions.Item label="Remarks" span={3}>
                    {viewRecord.remarks}
                  </Descriptions.Item>
                )}
              </Descriptions>

              <Table
                size="small"
                bordered
                loading={loadingView}
                pagination={false}
                rowKey={(r: any, idx?: number) => String(r.id || idx)}
                dataSource={Array.isArray(viewRecord.lines) ? viewRecord.lines : []}
                scroll={{ x: 'max-content' }}
                columns={[
                  { title: '#', key: 'ln', width: 42, align: 'center', render: (_: any, r: any, i: number) => r.lineNumber ?? i + 1 },
                  {
                    title: 'Item Code',
                    dataIndex: 'itemCode',
                    key: 'itemCode',
                    width: 120,
                    render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{v || '—'}</span>,
                  },
                  { title: 'Item Description', dataIndex: 'itemName', key: 'itemName', width: 220 },
                  { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 65, align: 'center' },
                  {
                    title: 'Issued Qty',
                    dataIndex: 'quantity',
                    key: 'quantity',
                    width: 90,
                    align: 'right' as const,
                    render: (v: number) => <strong>{Number(v || 0).toLocaleString()}</strong>,
                  },
                  {
                    title: 'Old Scrap Ret.',
                    dataIndex: 'oldItemReturnedQty',
                    key: 'oldItemReturnedQty',
                    width: 105,
                    align: 'right' as const,
                    render: (v: number) => Number(v || 0).toLocaleString(),
                  },
                  {
                    title: 'Remaining Store Stock',
                    key: 'remainingStock',
                    width: 140,
                    align: 'right' as const,
                    render: (_: any, r: any) =>
                      r.remainingStock !== undefined && r.remainingStock !== null
                        ? `${Number(r.remainingStock).toLocaleString()} ${r.uomCode || ''}`.trim()
                        : '—',
                  },
                  {
                    title: 'Last Issued Info',
                    dataIndex: 'lastIssuedSummary',
                    key: 'lastIssuedSummary',
                    width: 240,
                    render: (v?: string) => <span style={{ fontSize: 11.5 }}>{v || '—'}</span>,
                  },
                ]}
              />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmAndSuccessModal
        open={issueConfirmPhase !== 'idle'}
        phase={issueConfirmPhase}
        confirmTitle={
          editingIssueId
            ? editingIssueStatus === 'POSTED'
              ? 'Confirm Posted SIN Update'
              : 'Confirm Draft Update'
            : 'Confirm Store Issue Note (SIN)'
        }
        confirmDescription={
          editingIssueId
            ? editingIssueStatus === 'POSTED'
              ? 'Saving changes to a Posted Store Issue Note will atomically reverse previous stock deductions and re-post the updated quantities.'
              : 'Please verify the updated header details and line items before saving draft changes.'
            : 'Please verify the store, personnel, and line items before creating this Store Issue Note.'
        }
        confirmText={
          editingIssueId
            ? editingIssueStatus === 'POSTED'
              ? 'Confirm & Reconcile SIN'
              : 'Confirm & Update Draft'
            : 'Confirm & Create SIN'
        }
        savingText="Saving..."
        savingSubtext={editingIssueId ? 'Updating draft Store Issue Note' : 'Creating Store Issue Note (SIN)'}
        referenceNumber={issueFeedbackMeta.refNum}
        successMessage={`Store Issue Note saved (${issueFeedbackMeta.lineCount} ${issueFeedbackMeta.lineCount === 1 ? 'item' : 'items'}).`}
        errorMessage={issueFeedbackMeta.errorMessage}
        summaryRows={[
          { label: 'SIN #', value: issueFeedbackMeta.refNum || 'Auto' },
          { label: 'Source Store', value: issueFeedbackMeta.storeName },
          { label: 'Line Items', value: issueFeedbackMeta.lineCount, highlight: true },
        ]}
        extraSuccessAction={
          issueFeedbackMeta.savedRecord
            ? {
                label: 'Print / View SIN',
                onClick: () => {
                  const rec = issueFeedbackMeta.savedRecord!;
                  setIssueConfirmPhase('idle');
                  openPrintModal(rec);
                },
              }
            : undefined
        }
        onConfirm={executeIssueSave}
        onCancel={() => setIssueConfirmPhase('idle')}
        onOk={() => setIssueConfirmPhase('idle')}
      />
      <ConfirmAndSuccessModal
        open={rowActionState.phase !== 'idle'}
        phase={rowActionState.phase}
        confirmTitle={
          rowActionState.action === 'post'
            ? 'Confirm Post Store Issue Note'
            : rowActionState.action === 'cancel'
            ? 'Confirm Cancel Store Issue Note'
            : 'Confirm Delete Store Issue Note'
        }
        confirmDescription={
          rowActionState.action === 'post'
            ? 'Posting will finalize this Store Issue Note and deduct inventory stock immediately.'
            : rowActionState.action === 'cancel'
            ? 'Are you sure you want to cancel this draft Store Issue Note?'
            : 'This will permanently delete the selected Store Issue Note record.'
        }
        confirmText={
          rowActionState.action === 'post'
            ? 'Confirm & Post'
            : rowActionState.action === 'cancel'
            ? 'Confirm Cancel'
            : 'Confirm Delete'
        }
        savingText={rowActionState.action === 'post' ? 'Posting...' : 'Processing...'}
        savingSubtext={rowActionState.action === 'post' ? 'Deducting store stock & recording ledger' : 'Updating Store Issue Note'}
        referenceNumber={rowActionState.record?.issueNumber}
        successMessage={
          rowActionState.action === 'post'
            ? 'Store Issue Note posted and stock deducted successfully.'
            : rowActionState.action === 'cancel'
            ? 'Store Issue Note cancelled successfully.'
            : 'Store Issue Note deleted successfully.'
        }
        errorMessage={rowActionState.errorMessage}
        summaryRows={
          rowActionState.record
            ? [
                { label: 'SIN #', value: rowActionState.record.issueNumber },
                { label: 'Store', value: rowActionState.record.storeName || storeMap[rowActionState.record.storeId] || '—' },
                { label: 'Status', value: rowActionState.record.status, highlight: true },
              ]
            : []
        }
        onConfirm={executeRowAction}
        onCancel={() => setRowActionState((prev) => ({ ...prev, phase: 'idle' }))}
        onOk={() => setRowActionState((prev) => ({ ...prev, phase: 'idle' }))}
      />
    </div>
  );
};

export default StoreIssues;
