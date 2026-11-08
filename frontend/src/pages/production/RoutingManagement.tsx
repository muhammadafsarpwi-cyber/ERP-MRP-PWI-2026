import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, App, Card,
  InputNumber, Row, Col, Popconfirm, Tooltip, Typography, Descriptions, Segmented, Alert,
  Checkbox, Statistic, theme,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined, ArrowLeftOutlined,
  ArrowUpOutlined, ArrowDownOutlined, CopyOutlined, UnorderedListOutlined, ApartmentOutlined,
  CheckCircleFilled, CheckCircleOutlined, ThunderboltOutlined, FilterOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import OperationEditor, {
  Routing, RoutingOperation, LookupItem, Item, Division, Section, Department, Uom, Machine, Warehouse,
} from './OperationEditor';
import RoutingProcessFlow from './RoutingProcessFlow';
import DivisionFlowCockpit, {
  DivisionFlow, loadStoredDivisionFlows, DEFAULT_DIVISION_FLOWS,
} from './DivisionFlowCockpit';
import dayjs from 'dayjs';
import apiService, { describeRequestError } from '../../services/api';
import SaveResultDialog, { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import { TabKeepAlive, GlobalLoading } from '../../components/shared';
import { formatDecimal, toNum } from '../../utils/numberFormat';
import { handleValidationErrors } from '../../utils/formValidationHelper';

import { getLookupsSnapshot, subscribeLookups } from '../../services/lookupsCache';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';

const ROUTING_TAB_ID = '/production/routings';

interface RoutingTabCache {
  routings: Routing[];
  search: string;
  filterStatus?: string;
  filterDivision?: string;
}

const { Title, Text } = Typography;

const formatDateTime = (val?: string | Date | null) => val ? dayjs(val).format('DD-MMM-YYYY HH:mm') : '-';

interface RouteType { id: string; routeCode: string; name: string; status?: string; }
interface Bom extends LookupItem { bomCode: string; productId?: string; }

const STATUS_COLORS: Record<string, string> = { DRAFT: 'default', ACTIVE: 'green', OBSOLETE: 'red' };

/** Fields accepted by CreateRoutingDto / UpdateRoutingDto. companyId is derived
 *  server-side from the org scope and is intentionally never sent by the client. */
const ROUTING_PAYLOAD_FIELDS = [
  'name',
  'description',
  'productId',
  'bomId',
  'routeTypeId',
  'baseQuantity',
  'isDefault',
  'effectiveFrom',
  'effectiveTo',
  'operations',
] as const;

const RoutingManagement: React.FC = () => {
  const { id: routeParamId } = useParams<{ id: string }>();
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const initialSnap = getLookupsSnapshot();
  const cachedTab = useMemo(() => tabSessionCache.get<RoutingTabCache>(ROUTING_TAB_ID), []);

  const [routings, setRoutings] = useState<Routing[]>(() => cachedTab?.routings ?? []);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>(() => initialSnap.items as Item[]);
  const [itemSearching, setItemSearching] = useState(false);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [divisions, setDivisions] = useState<Division[]>(() => initialSnap.divisions as Division[]);
  const [sections, setSections] = useState<Section[]>(() => initialSnap.sections as Section[]);
  const [departments, setDepartments] = useState<Department[]>(() => initialSnap.departments as Department[]);
  const [uoms, setUoms] = useState<Uom[]>(() => initialSnap.uoms as Uom[]);
  const [machines, setMachines] = useState<Machine[]>(() => initialSnap.machines as Machine[]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [routeTypes, setRouteTypes] = useState<RouteType[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [opEditor, setOpEditor] = useState<{ open: boolean; operation: RoutingOperation | null }>({ open: false, operation: null });
  const [editingRouting, setEditingRouting] = useState<Routing | null>(null);
  const [selectedRouting, setSelectedRouting] = useState<Routing | null>(null);
  const [form] = Form.useForm();
  const selectedProductId = Form.useWatch('productId', form);
  const [routingSaving, setRoutingSaving] = useState(false);
  const [routingResultOpen, setRoutingResultOpen] = useState(false);
  const [routingResultPhase, setRoutingResultPhase] = useState<SaveResultPhase>('loading');
  const [routingResult, setRoutingResult] = useState<SaveResultData | null>(null);
  const [routingResultError, setRoutingResultError] = useState<string>('');
  const [routingResultErrorTitle, setRoutingResultErrorTitle] = useState<string | undefined>(undefined);
  const [routingResultErrorLead, setRoutingResultErrorLead] = useState<string | undefined>(undefined);
  const [routingResultRetry, setRoutingResultRetry] = useState<(() => void) | undefined>(undefined);
  const [search, setSearch] = useState<string>(() => cachedTab?.search ?? '');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(() => cachedTab?.filterStatus ?? undefined);
  const [filterDivision, setFilterDivision] = useState<string>(() => cachedTab?.filterDivision ?? '');
  const [selectedDivisionTemplate, setSelectedDivisionTemplate] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'table' | 'flow'>('table');

  const searchItems = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) return;
    setItemSearching(true);
    try {
      const res = await apiService.get<any>('/master-data/items', { search: query.trim(), limit: 50 });
      const found = res?.data || [];
      if (Array.isArray(found) && found.length > 0) {
        setItems((prev) => {
          const map = new Map(prev.map((i) => [i.id, i]));
          found.forEach((item: Item) => map.set(item.id, item));
          return Array.from(map.values());
        });
      }
    } catch {}
    finally { setItemSearching(false); }
  }, []);

  const fetchRoutings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get<any>('/production/routings');
      const raw = res?.data;
      const list = Array.isArray(raw)
        ? raw
        : (Array.isArray(raw?.data) ? raw.data : (Array.isArray(res) ? res : []));
      setRoutings(list);
      // Persist to session cache so switching back restores rows + filters
      tabSessionCache.set<RoutingTabCache>(ROUTING_TAB_ID, {
        routings: list,
        search,
        filterStatus,
        filterDivision,
      });
    } catch (err: any) {
      message.error('Failed to fetch routings');
    }
    finally { setLoading(false); }
  }, [message, search, filterStatus, filterDivision]);

  const fetchLookupData = useCallback(async () => {
    try {
      const [itemsRes, bomRes, divRes, secRes, deptRes, uomRes, rtRes, machineRes, whRes] = await Promise.all([
        apiService.get<{ data: Item[] }>('/master-data/items', { limit: 500 }),
        apiService.get<{ data: Bom[] }>('/bom'),
        apiService.get<{ data: Division[] }>('/divisions', { limit: 200 }),
        apiService.get<{ data: Section[] }>('/sections', { limit: 200 }),
        apiService.get<{ data: Department[] }>('/departments', { limit: 200 }),
        apiService.get<{ data: Uom[] }>('/master-data/uom', { limit: 200 }),
        apiService.get<{ data: RouteType[] }>('/master-data/route-types', { limit: 200 }),
        apiService.get<{ data: Machine[] }>('/production/machines'),
        apiService.get<{ data: Warehouse[] }>('/warehouses'),
      ]);
      setItems(itemsRes.data || []);
      setBoms(bomRes.data || []);
      setDivisions(divRes.data || []);
      setSections(secRes.data || []);
      setDepartments(deptRes.data || []);
      setUoms(uomRes.data || []);
      setRouteTypes(rtRes.data || []);
      setMachines(machineRes.data || []);
      setWarehouses(whRes.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    // If the tab was already loaded in this session, DO NOT re-fetch when
    // returning to it — the cached rows are already seeded into state.
    if (!routings.length) {
      fetchRoutings();
    }
    fetchLookupData();
    const params = new URLSearchParams(window.location.search);
    const targetId = routeParamId || params.get('id') || params.get('routingId');
    if (targetId) {
      void refreshDetail(targetId).then(() => {
        setDetailVisible(true);
      });
    }
    const unsubscribe = subscribeLookups((snap) => {
      if (snap.items.length > 0) setItems(snap.items as Item[]);
      if (snap.divisions.length > 0) setDivisions(snap.divisions as Division[]);
      if (snap.sections.length > 0) setSections(snap.sections as Section[]);
      if (snap.departments.length > 0) setDepartments(snap.departments as Department[]);
      if (snap.uoms.length > 0) setUoms(snap.uoms as Uom[]);
      if (snap.machines.length > 0) setMachines(snap.machines as Machine[]);
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-open targetId from route params or query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetId = routeParamId || params.get('id') || params.get('routingId');
    if (targetId) {
      (async () => {
        try {
          const res = await apiService.get<any>(`/production/routings/${targetId}`);
          const raw = res?.data;
          const rtg = (raw && raw.id) ? raw : (raw?.data || res);
          if (rtg && rtg.id) {
            setSelectedRouting(rtg);
            setDetailVisible(true);
          }
        } catch (err) {
          console.error('[RoutingManagement] failed to auto-open target routing:', err);
        }
      })();
    }
  }, [routeParamId]);

  // Global header/tab refresh event listener
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(ROUTING_TAB_ID)) {
        tabSessionCache.remove(ROUTING_TAB_ID);
        void fetchRoutings();
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRoutings]);

  const routingCountsByDivision = useMemo(() => {
    const counts: Record<string, number> = {
      'DIV-SPD': 0,
      'DIV-CCD': 0,
      'DIV-PWI': 0,
      'DIV-NB': 0,
    };
    (routings || []).forEach((r) => {
      const routeTypeCode = (r.routeType?.routeCode || '').toLowerCase();
      const routeTypeName = (r.routeType?.name || '').toLowerCase();
      const code = (r.routingCode || '').toLowerCase();
      const prodCode = (r.product?.itemCode || '').toLowerCase();

      if (
        routeTypeCode.includes('spi') ||
        routeTypeName.includes('spoke') ||
        code.includes('spd') ||
        prodCode.includes('spk') ||
        prodCode.includes('spi')
      ) {
        counts['DIV-SPD']++;
      } else if (
        routeTypeCode.includes('ccd') ||
        routeTypeName.includes('cable') ||
        code.includes('ccd') ||
        prodCode.includes('ccd') ||
        prodCode.includes('cable')
      ) {
        counts['DIV-CCD']++;
      } else if (
        routeTypeCode.includes('pwi') ||
        routeTypeName.includes('wire') ||
        code.includes('pwi') ||
        prodCode.includes('wire') ||
        prodCode.includes('rm-wire')
      ) {
        counts['DIV-PWI']++;
      } else if (
        routeTypeCode.includes('nipple') ||
        routeTypeName.includes('nipple') ||
        code.includes('nb') ||
        prodCode.includes('nip')
      ) {
        counts['DIV-NB']++;
      }
    });
    return counts;
  }, [routings]);

  const stats = useMemo(() => {
    const total = (routings || []).length;
    const active = (routings || []).filter((r) => r.status === 'ACTIVE').length;
    const defaults = (routings || []).filter((r) => r.isDefault).length;
    const draft = (routings || []).filter((r) => r.status === 'DRAFT').length;
    return { total, active, defaults, draft };
  }, [routings]);

  const filteredRoutings = useMemo(() => {
    return (routings || []).filter((r) => {
      const matchSearch =
        !search ||
        r.routingCode.toLowerCase().includes(search.toLowerCase()) ||
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        (r.product &&
          (r.product.itemCode.toLowerCase().includes(search.toLowerCase()) ||
            r.product.name.toLowerCase().includes(search.toLowerCase())));
      const matchStatus = !filterStatus || r.status === filterStatus;
      if (!filterDivision) return matchSearch && matchStatus;

      const routeTypeCode = (r.routeType?.routeCode || '').toLowerCase();
      const routeTypeName = (r.routeType?.name || '').toLowerCase();
      const code = (r.routingCode || '').toLowerCase();
      const prodCode = (r.product?.itemCode || '').toLowerCase();

      let matchDiv = false;
      if (filterDivision === 'DIV-SPD') {
        matchDiv =
          routeTypeCode.includes('spi') ||
          routeTypeName.includes('spoke') ||
          code.includes('spd') ||
          prodCode.includes('spk') ||
          prodCode.includes('spi') ||
          r.operations?.some(op => (op.division?.divisionCode === 'DIV-SPD' || op.department?.departmentCode?.startsWith('SPD')));
      } else if (filterDivision === 'DIV-CCD') {
        matchDiv =
          routeTypeCode.includes('ccd') ||
          routeTypeName.includes('cable') ||
          code.includes('ccd') ||
          prodCode.includes('ccd') ||
          prodCode.includes('cable') ||
          r.operations?.some(op => (op.division?.divisionCode === 'DIV-CCD' || op.department?.departmentCode?.startsWith('CCD')));
      } else if (filterDivision === 'DIV-PWI') {
        matchDiv =
          routeTypeCode.includes('pwi') ||
          routeTypeName.includes('wire') ||
          code.includes('pwi') ||
          prodCode.includes('wire') ||
          prodCode.includes('rm-wire') ||
          r.operations?.some(op => (op.division?.divisionCode === 'DIV-PWI' || op.department?.departmentCode?.startsWith('PWI')));
      } else if (filterDivision === 'DIV-NB') {
        matchDiv =
          routeTypeCode.includes('nipple') ||
          routeTypeName.includes('nipple') ||
          code.includes('nb') ||
          prodCode.includes('nip') ||
          r.operations?.some(op => (op.division?.divisionCode === 'DIV-NB' || op.department?.departmentCode?.startsWith('NB')));
      } else {
        matchDiv = r.operations?.some((op) => op.divisionId === filterDivision);
      }
      return matchSearch && matchStatus && matchDiv;
    });
  }, [routings, search, filterStatus, filterDivision]);

  const refreshDetail = useCallback(async (id: string) => {
    try {
      const res = await apiService.get<any>(`/production/routings/${id}`);
      const raw = res?.data;
      const rtg = (raw && raw.id) ? raw : (raw?.data || res);
      setSelectedRouting(rtg);
    } catch {}
  }, []);

  const handleSetDefault = async (r: Routing) => {
    try {
      await apiService.put(`/production/routings/${r.id}`, { isDefault: true });
      message.success(`Set ${r.routingCode} as primary default routing for ${r.product?.itemCode || 'product'}`);
      await fetchRoutings();
      if (selectedRouting?.id === r.id) {
        await refreshDetail(r.id);
      }
    } catch (err: any) {
      message.error(describeRequestError(err) || 'Failed to update default status');
    }
  };

  const handleApplyFlowToNewRouting = (flow: DivisionFlow) => {
    setEditingRouting(null);
    setSelectedDivisionTemplate(flow.divisionCode);
    form.resetFields();
    form.setFieldsValue({
      divisionFlowTemplate: flow.divisionCode,
      name: `${flow.divisionName} Standard Routing`,
      baseQuantity: 1,
      isDefault: true,
    });
    // Link route type if available
    const rt = routeTypes.find((r) =>
      r.routeCode.toLowerCase().includes(flow.divisionCode.replace('DIV-', '').toLowerCase()) ||
      r.name.toLowerCase().includes(flow.divisionName.split(' ')[0].toLowerCase())
    );
    if (rt) form.setFieldValue('routeTypeId', rt.id);
    setModalVisible(true);
  };

  const handleApplyFlowToExistingRouting = (divCode: string) => {
    if (!selectedRouting) return;
    const flow = loadStoredDivisionFlows().find((f) => f.divisionCode === divCode);
    if (!flow) return;
    modal.confirm({
      centered: true,
      title: `Apply ${flow.divisionName} Flow?`,
      content: `This will append the ${flow.steps.length} sequential department stages (${flow.steps.map((s) => s.departmentName).join(' ➔ ')}) to this routing.`,
      okText: 'Apply Operations',
      onOk: async () => {
        try {
          for (const step of flow.steps) {
            const matchedDept = departments.find(
              (d) =>
                d.departmentCode === step.departmentCode ||
                d.name.toLowerCase() === step.departmentName.toLowerCase()
            );
            await apiService.post(`/production/routings/${selectedRouting.id}/operations`, {
              sequenceNo: step.sequenceNo,
              operationCode: `OP-${step.departmentCode || String(step.sequenceNo).padStart(3, '0')}`,
              operationName: step.operationName || step.departmentName,
              departmentId: matchedDept?.id,
              divisionId: matchedDept?.divisionId || (flow.id.startsWith('d1') ? flow.id : undefined),
              setupTimeMinutes: step.standardSetupMinutes || 15,
              runTimeMinutes: step.standardRunMinutes || 1,
              laborRequired: true,
              machineRequired: false,
              status: 'ACTIVE',
            });
          }
          message.success(`Successfully attached sequential department operations from ${flow.divisionName}`);
          await refreshDetail(selectedRouting.id);
          fetchRoutings();
        } catch (err: any) {
          message.error(describeRequestError(err) || 'Failed to apply operations');
        }
      },
    });
  };

  const handleCreate = () => {
    setEditingRouting(null);
    setSelectedDivisionTemplate(undefined);
    form.resetFields();
    form.setFieldsValue({ baseQuantity: 1, isDefault: true });
    setModalVisible(true);
  };

  const handleEdit = (routing: Routing) => {
    setEditingRouting(routing);
    setSelectedDivisionTemplate(undefined);
    if (routing.product && routing.productId) {
      const prodObj: Item = {
        id: routing.productId,
        itemCode: routing.product.itemCode,
        name: routing.product.name,
      } as Item;
      setItems((prev) => prev.some((i) => i.id === routing.productId) ? prev : [prodObj, ...prev]);
    }
    if (routing.routeType && routing.routeTypeId) {
      const rtObj: RouteType = {
        id: routing.routeTypeId,
        routeCode: routing.routeType.routeCode,
        name: routing.routeType.name,
      } as RouteType;
      setRouteTypes((prev) => prev.some((r) => r.id === routing.routeTypeId) ? prev : [rtObj, ...prev]);
    }
    form.setFieldsValue({
      name: routing.name,
      description: routing.description,
      productId: routing.productId,
      bomId: routing.bomId || undefined,
      routeTypeId: routing.routeTypeId || undefined,
      baseQuantity: routing.baseQuantity,
      isDefault: routing.isDefault,
      effectiveFrom: routing.effectiveFrom,
      effectiveTo: routing.effectiveTo,
    });
    setModalVisible(true);
  };

  const handleViewDetail = (routing: Routing) => {
    setSelectedRouting(routing);
    setDetailVisible(true);
    refreshDetail(routing.id);
  };

  const handleCopyRouting = (id: string, code?: string) => {
    modal.confirm({
      centered: true,
      title: 'Copy Routing',
      content: `Create a duplicate copy of routing ${code || ''} (including all operations and input/output configurations)?`,
      okText: 'Copy Routing',
      onOk: async () => {
        try {
          const res = await apiService.post<any>(`/production/routings/${id}/copy`, {});
          message.success('Routing duplicated successfully as a new Draft');
          await fetchRoutings();
          const newId = res?.data?.id || res?.id;
          if (newId) {
            await refreshDetail(newId);
            setDetailVisible(true);
          }
        } catch (err: any) {
          modal.error({
            centered: true,
            title: 'Copy Failed',
            content: describeRequestError(err) || 'Failed to copy routing',
          });
        }
      },
    });
  };

  const handleSave = async () => {
    if (routingSaving) return;
    let raw: any;
    try {
      raw = await form.validateFields();
    } catch (err: any) {
      const val = handleValidationErrors(err, form);
      if (val) {
        setRoutingResultErrorTitle('Required Information Missing');
        setRoutingResultErrorLead('Please complete all required fields before saving:');
        setRoutingResultError(val.bulletList);
        setRoutingResultPhase('error');
        setRoutingResultOpen(true);
        return;
      }
      message.error(describeRequestError(err));
      return;
    }
    const payload: Record<string, unknown> = {};
    for (const key of ROUTING_PAYLOAD_FIELDS) {
      if (raw[key] !== undefined) payload[key] = raw[key];
    }

    // Auto-generate sequential department operations if a division flow template was chosen
    const templateCode = raw.divisionFlowTemplate || selectedDivisionTemplate;
    if (!editingRouting && templateCode) {
      const flow = loadStoredDivisionFlows().find((f) => f.divisionCode === templateCode);
      if (flow && flow.steps.length > 0) {
        payload.operations = flow.steps.map((step) => {
          const matchedDept = departments.find(
            (d) =>
              d.departmentCode === step.departmentCode ||
              d.name.toLowerCase() === step.departmentName.toLowerCase()
          );
          return {
            sequenceNo: step.sequenceNo,
            operationCode: `OP-${step.departmentCode || String(step.sequenceNo).padStart(3, '0')}`,
            operationName: step.operationName || step.departmentName,
            departmentId: matchedDept?.id,
            divisionId: matchedDept?.divisionId || (flow.id.startsWith('d1') ? flow.id : undefined),
            setupTimeMinutes: step.standardSetupMinutes || 15,
            runTimeMinutes: step.standardRunMinutes || 1,
            laborRequired: true,
            machineRequired: false,
            status: 'ACTIVE',
          };
        });
      }
    }

    setRoutingResultErrorTitle(undefined);
    setRoutingResultErrorLead(undefined);
    setRoutingSaving(true);
    setRoutingResultRetry(() => handleSave);
    setRoutingResultPhase('loading');
    setRoutingResultOpen(true);
    try {
      let saved: { routingCode?: string; name?: string } | undefined;
      if (editingRouting) {
        const res = (await apiService.put(`/production/routings/${editingRouting.id}`, payload)) as {
          data?: { routingCode?: string; name?: string };
        };
        saved = res?.data;
      } else {
        const res = (await apiService.post('/production/routings', payload)) as {
          data?: { routingCode?: string; name?: string };
        };
        saved = res?.data;
      }
      setRoutingResult({
        title: editingRouting ? 'Routing Updated Successfully' : 'Routing Saved Successfully',
        recordType: 'Routing Code',
        recordCode: saved?.routingCode != null ? String(saved.routingCode) : undefined,
        recordName: saved?.name != null ? String(saved.name) : undefined,
      });
      setRoutingResultPhase('success');
      setModalVisible(false);
      fetchRoutings();
      if (editingRouting && selectedRouting?.id === editingRouting.id) await refreshDetail(editingRouting.id);
    } catch (err: any) {
      setRoutingResultError(describeRequestError(err));
      setRoutingResultPhase('error');
    } finally {
      setRoutingSaving(false);
    }
  };

  const handleDelete = (id: string, code?: string) => {
    modal.confirm({
      centered: true,
      title: 'Delete Routing',
      content: `Are you sure you want to delete routing ${code || ''}? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.delete(`/production/routings/${id}`);
          message.success('Routing deleted successfully');
          fetchRoutings();
          if (selectedRouting?.id === id) setDetailVisible(false);
        } catch (err: any) {
          modal.error({
            centered: true,
            title: 'Delete Failed',
            content: describeRequestError(err),
          });
        }
      },
    });
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiService.put(`/production/routings/${id}/status`, { status });
      message.success(`Routing status changed to ${status}`);
      fetchRoutings();
      if (selectedRouting?.id === id) await refreshDetail(id);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to change status');
    }
  };

  const handleAddOp = () => {
    setOpEditor({ open: true, operation: null });
  };

  const handleEditOp = (op: RoutingOperation) => {
    setOpEditor({ open: true, operation: op });
  };

  const handleOpSaved = async () => {
    setOpEditor(e => ({ ...e, open: false }));
    if (selectedRouting) await refreshDetail(selectedRouting.id);
    fetchRoutings();
  };

  const executeDeleteOp = async (op: RoutingOperation) => {
    setRoutingResultPhase('loading');
    setRoutingResult({
      title: 'Removing Operation...',
      recordType: 'Operation Code',
      recordCode: op.operationCode,
      recordName: op.operationName,
    });
    setRoutingResultError('');
    setRoutingResultRetry(() => () => executeDeleteOp(op));
    setRoutingResultOpen(true);
    try {
      await apiService.delete(`/production/routings/operations/${op.id}`);
      setRoutingResult({
        title: 'Operation Removed Successfully',
        recordType: 'Operation Code',
        recordCode: op.operationCode,
        recordName: op.operationName,
      });
      setRoutingResultPhase('success');
      await refreshDetail(selectedRouting!.id);
      fetchRoutings();
    } catch (err: any) {
      setRoutingResultError(describeRequestError(err) || 'Failed to remove operation');
      setRoutingResultPhase('error');
    }
  };

  const confirmDeleteOp = (op: RoutingOperation) => {
    modal.confirm({
      centered: true,
      title: 'Remove Operation',
      content: (
        <div>
          <p style={{ fontSize: 14, margin: '8px 0 4px 0' }}>
            Are you sure you want to remove operation <strong>{op.operationCode}</strong> ({op.operationName})?
          </p>
          <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>
            This will permanently remove this operation from the routing sequence.
          </p>
        </div>
      ),
      okText: 'Remove Operation',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => executeDeleteOp(op),
    });
  };

  const handleReorderOp = async (op: RoutingOperation, dir: number) => {
    try {
      const ops = [...(selectedRouting?.operations || [])].sort((a, b) => a.sequenceNo - b.sequenceNo);
      const idx = ops.findIndex(o => o.id === op.id);
      const target = ops[idx + dir];
      if (!target) return;
      await apiService.post(
        `/production/routings/${selectedRouting!.id}/operations/${op.id}/reorder`,
        { newSequenceNo: target.sequenceNo },
      );
      message.success('Operation reordered');
      await refreshDetail(selectedRouting!.id);
      fetchRoutings();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to reorder operation');
    }
  };

  const handleDuplicateOp = async (op: RoutingOperation) => {
    try {
      await apiService.post(
        `/production/routings/${selectedRouting!.id}/operations/${op.id}/duplicate`,
        {},
      );
      message.success('Operation duplicated');
      await refreshDetail(selectedRouting!.id);
      fetchRoutings();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to duplicate operation');
    }
  };

  const renderInputs = (r: RoutingOperation) => {
    const list = r.inputs && r.inputs.length ? r.inputs : (r.inputItem || r.inputItemId ? [{ item: r.inputItem, itemId: r.inputItemId, quantity: r.inputQuantity, isPrimary: true }] : []);
    if (!list.length) return <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>—</span>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {list.map((i: any, idx: number) => {
          const itemText = i.item ? `${i.item.itemCode} · ${i.item.name}` : i.itemId || '-';
          return (
            <div
              key={idx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
                maxWidth: 240,
              }}
              title={itemText}
            >
              <Tag
                color="blue"
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 4,
                  maxWidth: 180,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {itemText}
              </Tag>
              {i.quantity != null && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-secondary, #64748b)' }}>
                  × {formatDecimal(toNum(i.quantity))}
                </span>
              )}
              {i.isPrimary && (
                <Tag color="cyan" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>
                  Primary
                </Tag>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderOutputs = (r: RoutingOperation) => {
    const list = r.outputs && r.outputs.length ? r.outputs : (r.outputItem || r.outputItemId ? [{ item: r.outputItem, itemId: r.outputItemId, quantity: r.outputQuantity, outputType: 'MAIN' }] : []);
    if (!list.length) return <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>—</span>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {list.map((o: any, idx: number) => {
          const itemText = o.item ? `${o.item.itemCode} · ${o.item.name}` : o.itemId || '-';
          return (
            <div
              key={idx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
                maxWidth: 240,
              }}
              title={itemText}
            >
              <Tag
                color="purple"
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 4,
                  maxWidth: 180,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {itemText}
              </Tag>
              {o.quantity != null && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-secondary, #64748b)' }}>
                  × {formatDecimal(toNum(o.quantity))}
                </span>
              )}
              {o.outputType && o.outputType !== 'MAIN' && (
                <Tag color="orange" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>
                  {o.outputType}
                </Tag>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const columns: ColumnsType<Routing> = [
    { title: 'Code', dataIndex: 'routingCode', key: 'routingCode', width: 130, fixed: 'left' },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 220 },
    { title: 'Product', key: 'product', width: 220, render: (_, r) => r.product ? `${r.product.itemCode} - ${r.product.name}` : (r.productId || '-') },
    { title: 'Route Type', key: 'routeType', width: 150, render: (_, r) => r.routeType ? `${r.routeType.routeCode} - ${r.routeType.name}` : (r.routeTypeId ? (routeTypes.find(rt => rt.id === r.routeTypeId)?.name || '-') : '-') },
    { title: 'BOM', key: 'bom', width: 130, render: (_, r) => r.bom ? `${r.bom.bomCode}` : '-' },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: (s: string) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
    { title: 'Ops', key: 'ops', width: 60, align: 'center', render: (_, r) => r.operations?.length || 0 },
    {
      title: 'Default',
      dataIndex: 'isDefault',
      key: 'isDefault',
      width: 105,
      align: 'center',
      render: (v: boolean, r: Routing) =>
        v ? (
          <Tag color="success" style={{ fontWeight: 700, borderRadius: 12, padding: '2px 8px' }}>
            ✔ Yes
          </Tag>
        ) : (
          <Popconfirm
            title="Set as Default Routing?"
            description={`Set ${r.routingCode} as the primary default routing for this product?`}
            onConfirm={() => handleSetDefault(r)}
            okText="Set Default"
            cancelText="Cancel"
          >
            <Tooltip title="Click to make this the active default routing">
              <Tag
                color="default"
                style={{
                  cursor: 'pointer',
                  borderRadius: 12,
                  padding: '2px 8px',
                  border: '1px dashed #64748b',
                  color: '#94a3b8',
                }}
              >
                No (Set)
              </Tag>
            </Tooltip>
          </Popconfirm>
        ),
    },
    {
      title: 'Created By / Date',
      key: 'created',
      width: 160,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 600, color: '#f1f5f9' }}>
            {r.createdByName || (r.createdBy ? 'Muhammad Afsar' : '-')}
          </span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            {formatDateTime(r.createdAt)}
          </span>
        </div>
      ),
    },
    {
      title: 'Updated By / Date',
      key: 'updated',
      width: 160,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 600, color: '#f1f5f9' }}>
            {r.updatedByName || (r.updatedBy ? 'Muhammad Afsar' : '-')}
          </span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            {formatDateTime(r.updatedAt)}
          </span>
        </div>
      ),
    },
    {
      title: 'Actions', key: 'actions', width: 160, fixed: 'right', render: (_, r) => (
        <Space size="small">
          <Tooltip title="View Details"><Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(r)} /></Tooltip>
          <Tooltip title="Edit Routing"><Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)} /></Tooltip>
          <Tooltip title="Copy Routing"><Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyRouting(r.id, r.routingCode)} /></Tooltip>
          <Tooltip title="Delete Routing"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id, r.routingCode)} /></Tooltip>
        </Space>
      ),
    },
  ];

  const opColumns: ColumnsType<RoutingOperation> = [
    {
      title: '#',
      dataIndex: 'sequenceNo',
      key: 'sequenceNo',
      width: 55,
      align: 'center',
      fixed: 'left',
      render: (seq: number) => (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'var(--theme-surface-subtle, #f1f5f9)',
            border: '1px solid var(--theme-border, #cbd5e1)',
            fontWeight: 800,
            fontSize: 11,
            color: 'var(--theme-primary, #2563eb)',
          }}
        >
          {seq}
        </span>
      ),
    },
    {
      title: 'Code',
      dataIndex: 'operationCode',
      key: 'operationCode',
      width: 100,
      fixed: 'left',
      render: (code: string) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'var(--theme-text, #1e293b)' }}>
          {code || '—'}
        </span>
      ),
    },
    {
      title: 'Operation',
      dataIndex: 'operationName',
      key: 'operationName',
      width: 160,
      render: (name: string, r) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #0f172a)', whiteSpace: 'nowrap' }}>
            {name}
          </span>
          {r.description && (
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }} title={r.description}>
              {r.description}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Input Materials',
      key: 'inputs',
      width: 240,
      render: (_, r) => renderInputs(r),
    },
    {
      title: 'Output Products',
      key: 'outputs',
      width: 240,
      render: (_, r) => renderOutputs(r),
    },
    {
      title: 'Division',
      key: 'division',
      width: 140,
      render: (_, r) => r.division?.name ? (
        <Tag color="purple" style={{ margin: 0, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
          {r.division.name}
        </Tag>
      ) : <span style={{ color: 'var(--theme-text-muted)' }}>—</span>,
    },
    {
      title: 'Section',
      key: 'section',
      width: 160,
      render: (_, r) => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 500 }}>
          {r.section?.name || '—'}
        </span>
      ),
    },
    {
      title: 'Department',
      key: 'department',
      width: 160,
      render: (_, r) => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 500 }}>
          {r.department?.name || '—'}
        </span>
      ),
    },
    {
      title: 'Machine',
      key: 'machine',
      width: 120,
      render: (_, r) => r.machine ? (
        <Tag color="blue" style={{ margin: 0, fontFamily: 'monospace', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
          {r.machine.machineCode}
        </Tag>
      ) : <span style={{ color: 'var(--theme-text-muted)' }}>—</span>,
    },
    {
      title: 'Setup',
      key: 'setup',
      width: 80,
      align: 'right',
      render: (_, r) => (
        <span style={{ fontSize: 12, color: 'var(--theme-text-secondary, #64748b)', whiteSpace: 'nowrap' }}>
          {formatDecimal(toNum(r.setupTimeMinutes))} min
        </span>
      ),
    },
    {
      title: 'Run',
      key: 'run',
      width: 80,
      align: 'right',
      render: (_, r) => (
        <span style={{ fontSize: 12, color: 'var(--theme-text-secondary, #64748b)', whiteSpace: 'nowrap' }}>
          {formatDecimal(toNum(r.runTimeMinutes))} min
        </span>
      ),
    },
    {
      title: 'Total',
      key: 'total',
      width: 85,
      align: 'right',
      render: (_, r) => (
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-text, #0f172a)', whiteSpace: 'nowrap' }}>
          {formatDecimal(toNum(r.setupTimeMinutes) + toNum(r.runTimeMinutes) + toNum(r.queueTimeMinutes) + toNum(r.waitTimeMinutes))} min
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      align: 'center',
      render: (s: string) => (
        <Tag color={s === 'ACTIVE' ? 'success' : 'default'} style={{ margin: 0, fontWeight: 600, fontSize: 11 }}>
          {s}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      fixed: 'right',
      align: 'center',
      render: (_, r, idx) => {
        const ops = selectedRouting?.operations || [];
        const isFirst = idx === 0;
        const isLast = idx === ops.length - 1;
        const isObsolete = selectedRouting?.status === 'OBSOLETE';

        return (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              whiteSpace: 'nowrap',
              height: 28,
            }}
          >
            <Tooltip title="Edit Operation">
              <Button
                size="small"
                type="text"
                icon={<EditOutlined style={{ color: '#2563eb' }} />}
                disabled={isObsolete}
                onClick={() => handleEditOp(r)}
                style={{ width: 26, height: 26, padding: 0 }}
              />
            </Tooltip>
            {!isObsolete && (
              <>
                <Tooltip title="Move Up">
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowUpOutlined style={{ color: isFirst ? '#cbd5e1' : '#0284c7' }} />}
                    disabled={isFirst}
                    onClick={() => handleReorderOp(r, -1)}
                    style={{ width: 26, height: 26, padding: 0 }}
                  />
                </Tooltip>
                <Tooltip title="Move Down">
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowDownOutlined style={{ color: isLast ? '#cbd5e1' : '#0284c7' }} />}
                    disabled={isLast}
                    onClick={() => handleReorderOp(r, 1)}
                    style={{ width: 26, height: 26, padding: 0 }}
                  />
                </Tooltip>
                <Tooltip title="Duplicate">
                  <Button
                    size="small"
                    type="text"
                    icon={<CopyOutlined style={{ color: '#7c3aed' }} />}
                    onClick={() => handleDuplicateOp(r)}
                    style={{ width: 26, height: 26, padding: 0 }}
                  />
                </Tooltip>
                <Tooltip title="Delete">
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => confirmDeleteOp(r)}
                    style={{ width: 26, height: 26, padding: 0 }}
                  />
                </Tooltip>
              </>
            )}
          </div>
        );
      },
    },
  ];

  if (detailVisible && selectedRouting) {
    return (
      <div style={{ padding: '6px 10px', width: '100%' }}>
        {/* Executive Header Card */}
        <Card
          size="small"
          style={{
            background: 'var(--theme-surface, #ffffff)',
            border: '1px solid var(--theme-border, #e2e8f0)',
            borderRadius: 12,
            marginBottom: 12,
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
          bodyStyle={{ padding: '14px 18px' }}
        >
          {/* Top Title & Primary Actions Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => { setDetailVisible(false); setSelectedRouting(null); }}
                style={{ fontWeight: 600, borderRadius: 8 }}
              >
                Back to List
              </Button>
              <Tag color="blue" style={{ fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 6, margin: 0 }}>
                {selectedRouting.routingCode}
              </Tag>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--theme-text, #0f172a)' }}>
                {selectedRouting.name}
              </span>
              <Tag
                color={selectedRouting.status === 'ACTIVE' ? 'success' : selectedRouting.status === 'DRAFT' ? 'warning' : 'default'}
                style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 12, margin: 0 }}
              >
                {selectedRouting.status}
              </Tag>
            </div>

            <Space size={8}>
              <Button
                icon={<CopyOutlined />}
                onClick={() => handleCopyRouting(selectedRouting.id, selectedRouting.routingCode)}
                style={{ borderRadius: 8, fontWeight: 600 }}
              >
                Copy Routing
              </Button>
              <Button
                icon={<EditOutlined />}
                onClick={() => handleEdit(selectedRouting)}
                style={{ borderRadius: 8, fontWeight: 600 }}
              >
                Edit Header
              </Button>
            </Space>
          </div>

          {/* Metadata KPI Summary Tiles (Replaces clunky HTML Descriptions table) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 10,
              paddingTop: 10,
              borderTop: '1px dashed var(--theme-border, #e2e8f0)',
            }}
          >
            {/* Tile 1: Product */}
            <div style={{ padding: '8px 12px', background: 'var(--theme-surface-subtle, #f8fafc)', borderRadius: 8, border: '1px solid var(--theme-border, #e2e8f0)' }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', textTransform: 'uppercase' }}>Target Product</span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--theme-text, #1e293b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={selectedRouting.product ? `${selectedRouting.product.itemCode} - ${selectedRouting.product.name}` : '-'}>
                {selectedRouting.product ? `${selectedRouting.product.itemCode} · ${selectedRouting.product.name}` : '—'}
              </span>
            </div>

            {/* Tile 2: Route Type */}
            <div style={{ padding: '8px 12px', background: 'var(--theme-surface-subtle, #f8fafc)', borderRadius: 8, border: '1px solid var(--theme-border, #e2e8f0)' }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', textTransform: 'uppercase' }}>Route Type</span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--theme-text, #1e293b)' }}>
                {selectedRouting.routeType ? `${selectedRouting.routeType.routeCode} · ${selectedRouting.routeType.name}` : '—'}
              </span>
            </div>

            {/* Tile 3: BOM Link */}
            <div style={{ padding: '8px 12px', background: 'var(--theme-surface-subtle, #f8fafc)', borderRadius: 8, border: '1px solid var(--theme-border, #e2e8f0)' }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', textTransform: 'uppercase' }}>Linked BOM</span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--theme-text, #1e293b)', fontFamily: 'monospace' }}>
                {selectedRouting.bom?.bomCode || 'None Assigned'}
              </span>
            </div>

            {/* Tile 4: Base Qty */}
            <div style={{ padding: '8px 12px', background: 'var(--theme-surface-subtle, #f8fafc)', borderRadius: 8, border: '1px solid var(--theme-border, #e2e8f0)' }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', textTransform: 'uppercase' }}>Base Quantity</span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--theme-text, #1e293b)' }}>
                {formatDecimal(toNum(selectedRouting.baseQuantity))} Units
              </span>
            </div>

            {/* Tile 5: Estimated Total Time */}
            <div style={{ padding: '8px 12px', background: 'var(--theme-surface-subtle, #f8fafc)', borderRadius: 8, border: '1px solid var(--theme-border, #e2e8f0)' }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', textTransform: 'uppercase' }}>Estimated Total Time</span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--theme-primary, #2563eb)' }}>
                {formatDecimal(toNum(selectedRouting.estimatedTotalTime))} min
              </span>
            </div>
          </div>
        </Card>

        {/* Controls Toolbar: View Mode Toggle & Operations Actions (SINGLE ROW, NO DUPLICATE BUTTONS) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 12,
            padding: '8px 12px',
            background: 'var(--theme-surface, #ffffff)',
            borderRadius: 10,
            border: '1px solid var(--theme-border, #e2e8f0)',
          }}
        >
          <Segmented
            size="middle"
            value={viewMode}
            onChange={(val) => setViewMode(val as 'table' | 'flow')}
            options={[
              { label: 'Operations List', value: 'table', icon: <UnorderedListOutlined /> },
              { label: 'Process Flow Graph', value: 'flow', icon: <ApartmentOutlined /> },
            ]}
          />

          {viewMode === 'table' && selectedRouting.status !== 'OBSOLETE' && (
            <Space size={8}>
              <Select
                size="middle"
                placeholder="⚡ Apply Division Flow..."
                style={{ width: 240 }}
                onChange={(divCode) => handleApplyFlowToExistingRouting(divCode)}
                options={[
                  { label: 'Spoke Division Flow (6 stages)', value: 'DIV-SPD' },
                  { label: 'Control Cable Flow (5 stages)', value: 'DIV-CCD' },
                  { label: 'Main Division E-51 Flow (6 stages)', value: 'DIV-PWI' },
                  { label: 'NB Division Flow (5 stages)', value: 'DIV-NB' },
                ]}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddOp}
                style={{ fontWeight: 600, borderRadius: 8 }}
              >
                Add Operation
              </Button>
            </Space>
          )}
        </div>

        {/* Operations Table Card */}
        {viewMode === 'table' ? (
          <Card
            size="small"
            style={{
              borderRadius: 12,
              border: '1px solid var(--theme-border, #e2e8f0)',
              background: 'var(--theme-surface, #ffffff)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              marginBottom: 14,
            }}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  Routing Operations Sequence
                </span>
                <Tag color="blue" style={{ fontSize: 11, fontWeight: 700, borderRadius: 10 }}>
                  {(selectedRouting.operations || []).length} Stages
                </Tag>
              </div>
            }
            bodyStyle={{ padding: 0 }}
          >
            <Table
              dataSource={selectedRouting.operations || []}
              columns={opColumns}
              rowKey="id"
              size="middle"
              pagination={false}
              scroll={{ x: 1750 }}
            />
          </Card>
        ) : (
          <RoutingProcessFlow
            routing={selectedRouting}
            onRefreshRouting={() => refreshDetail(selectedRouting.id)}
            onEditOperation={handleEditOp}
          />
        )}

        {/* Bottom Status Lifecycle Action Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            padding: '10px 14px',
            background: 'var(--theme-surface, #ffffff)',
            borderRadius: 10,
            border: '1px solid var(--theme-border, #e2e8f0)',
          }}
        >
          <div>
            {selectedRouting.status === 'ACTIVE' && (
              <Tag color="success" style={{ padding: '5px 14px', fontSize: 13, fontWeight: 700, borderRadius: 6, margin: 0 }}>
                ✔ Routing is ACTIVE & Production-Ready
              </Tag>
            )}
            {selectedRouting.status === 'DRAFT' && (
              <Tag color="warning" style={{ padding: '5px 14px', fontSize: 13, fontWeight: 700, borderRadius: 6, margin: 0 }}>
                ⏳ Routing is in DRAFT — Operations can be edited or reordered
              </Tag>
            )}
            {selectedRouting.status === 'OBSOLETE' && (
              <Tag color="default" style={{ padding: '5px 14px', fontSize: 13, fontWeight: 700, borderRadius: 6, margin: 0 }}>
                🚫 Routing is OBSOLETE
              </Tag>
            )}
          </div>

          <Space size={8}>
            {selectedRouting.status === 'DRAFT' && (
              <Popconfirm title="Activate this routing for production?" onConfirm={() => handleStatusChange(selectedRouting.id, 'ACTIVE')}>
                <Button type="primary" disabled={(selectedRouting.operations?.length || 0) === 0} style={{ fontWeight: 600, borderRadius: 8 }}>
                  Activate Routing
                </Button>
              </Popconfirm>
            )}
            {selectedRouting.status === 'ACTIVE' && (
              <>
                <Button type="primary" onClick={() => setDetailVisible(false)} style={{ fontWeight: 600, borderRadius: 8 }}>
                  Done — Back to List
                </Button>
                <Popconfirm title="Revert to Draft for revisions?" onConfirm={() => handleStatusChange(selectedRouting.id, 'DRAFT')}>
                  <Button style={{ borderRadius: 8 }}>Revert to Draft</Button>
                </Popconfirm>
                <Popconfirm title="Mark this routing as Obsolete?" onConfirm={() => handleStatusChange(selectedRouting.id, 'OBSOLETE')}>
                  <Button danger style={{ borderRadius: 8 }}>Mark Obsolete</Button>
                </Popconfirm>
              </>
            )}
            {selectedRouting.status === 'OBSOLETE' && (
              <Popconfirm title="Restore back to Draft?" onConfirm={() => handleStatusChange(selectedRouting.id, 'DRAFT')}>
                <Button type="primary" style={{ fontWeight: 600, borderRadius: 8 }}>Restore to Draft</Button>
              </Popconfirm>
            )}
          </Space>
        </div>

        <OperationEditor
          open={opEditor.open}
          routing={selectedRouting}
          operation={opEditor.operation}
          lookups={{ items, divisions, sections, departments, uoms, machines, warehouses }}
          onClose={() => setOpEditor(e => ({ ...e, open: false }))}
          onSaved={handleOpSaved}
        />

        <SaveResultDialog
          open={routingResultOpen}
          phase={routingResultPhase}
          result={routingResult}
          errorMessage={routingResultError}
          onRetry={routingResultRetry}
          onClose={() => setRoutingResultOpen(false)}
        />
      </div>
    );
  }

  return (
    <TabKeepAlive
      tabId={ROUTING_TAB_ID}
      load={async () => { await fetchRoutings(); await fetchLookupData(); }}
      serialize={() => ({ routings, search, filterStatus, filterDivision })}
    >
      <div style={{ padding: '6px 8px', width: '100%' }}>
        {/* Department Flow Master Cockpit at the very top */}
        <DivisionFlowCockpit
          onSelectDivisionFilter={(code) => setFilterDivision(code)}
          activeDivisionFilter={filterDivision}
          onApplyFlowToNewRouting={handleApplyFlowToNewRouting}
          routingCountsByDivision={routingCountsByDivision}
        />

        {/* Executive KPI Stats Summary Bar */}
        <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
          <Col xs={12} sm={6}>
            <Card size="small" bodyStyle={{ padding: '10px 14px' }}>
              <Statistic
                title={<span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 600 }}>Total Master Routings</span>}
                value={stats.total}
                valueStyle={{ color: token.colorTextHeading, fontWeight: 800, fontSize: 22 }}
                prefix={<ApartmentOutlined style={{ color: token.colorPrimary, marginRight: 6 }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" bodyStyle={{ padding: '10px 14px' }}>
              <Statistic
                title={<span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 600 }}>Active Production Routings</span>}
                value={stats.active}
                valueStyle={{ color: '#10b981', fontWeight: 800, fontSize: 22 }}
                prefix={<CheckCircleFilled style={{ color: '#10b981', marginRight: 6 }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" bodyStyle={{ padding: '10px 14px' }}>
              <Statistic
                title={<span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 600 }}>Default Assigned (Yes)</span>}
                value={stats.defaults}
                valueStyle={{ color: token.colorPrimary, fontWeight: 800, fontSize: 22 }}
                prefix={<CheckCircleOutlined style={{ color: token.colorPrimary, marginRight: 6 }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" bodyStyle={{ padding: '10px 14px' }}>
              <Statistic
                title={<span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 600 }}>Draft / In Revision</span>}
                value={stats.draft}
                valueStyle={{ color: '#f59e0b', fontWeight: 800, fontSize: 22 }}
                prefix={<ThunderboltOutlined style={{ color: '#f59e0b', marginRight: 6 }} />}
              />
            </Card>
          </Col>
        </Row>

        {/* Main Production Routings Grid Card */}
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>
                Production Routings Directory
              </span>
              <Tag color="blue" style={{ fontSize: 11, fontWeight: 600 }}>
                {filteredRoutings.length} {filterDivision ? `Filtered (${filterDivision})` : 'Total Active'}
              </Tag>
            </div>
          }
          extra={
            <Space wrap>
              <Input.Search
                placeholder="Search code, name, product..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 240 }}
                allowClear
              />
              <Select
                placeholder="All Divisions"
                allowClear
                value={filterDivision || undefined}
                onChange={(val) => setFilterDivision(val || '')}
                style={{ width: 175 }}
                options={[
                  { label: 'All Divisions', value: '' },
                  { label: `Spoke Division (${routingCountsByDivision['DIV-SPD'] || 0})`, value: 'DIV-SPD' },
                  { label: `Control Cable (${routingCountsByDivision['DIV-CCD'] || 0})`, value: 'DIV-CCD' },
                  { label: `Main Division E-51 (${routingCountsByDivision['DIV-PWI'] || 0})`, value: 'DIV-PWI' },
                  { label: `NB Division (${routingCountsByDivision['DIV-NB'] || 0})`, value: 'DIV-NB' },
                ]}
              />
              <Select
                placeholder="All Statuses"
                allowClear
                value={filterStatus}
                onChange={setFilterStatus}
                style={{ width: 130 }}
              >
                <Select.Option value="DRAFT">Draft</Select.Option>
                <Select.Option value="ACTIVE">Active</Select.Option>
                <Select.Option value="OBSOLETE">Obsolete</Select.Option>
              </Select>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ fontWeight: 600 }}>
                New Routing
              </Button>
              <Button icon={<ReloadOutlined />} onClick={fetchRoutings}>
                Refresh
              </Button>
            </Space>
          }
        >
          <Alert
            message="Clean Master Production Routings (Single Source of Truth)"
            description="Production Routings and multi-department operational stages are automatically synchronized from Item Master & Standard Department Flows. Sample and obsolete developmental records have been sanitized."
            type="info"
            showIcon
            style={{ marginBottom: 14 }}
          />

          <div style={{ position: 'relative', minHeight: 340 }}>
            {loading && filteredRoutings.length === 0 ? (
              <GlobalLoading
                title="Loading Production Routings..."
                subtitle="Retrieving verified active routings directly from database..."
                badgeText="LIVE DATABASE QUERY"
                minHeight={360}
              />
            ) : (
              <>
                {loading && (
                  <GlobalLoading
                    overlay
                    title="Refreshing Production Routings..."
                    subtitle="Updating routing operations and department links..."
                    badgeText="Instant Sync"
                  />
                )}
                <Table
                  dataSource={filteredRoutings}
                  columns={columns}
                  rowKey="id"
                  loading={false}
                  scroll={{ x: 1800 }}
                  pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t} routings` }}
                />
              </>
            )}
          </div>
        </Card>

        {/* Create / Edit Routing Modal */}
        <Modal
          title={editingRouting ? 'Edit Routing' : 'New Routing — Standard Department Flow'}
          open={modalVisible}
          onCancel={() => setModalVisible(false)}
          width={760}
          destroyOnHidden
          footer={[
            <Button key="cancel" onClick={() => setModalVisible(false)} disabled={routingSaving}>
              Cancel
            </Button>,
            <Button
              key="save"
              type="primary"
              onClick={handleSave}
              loading={routingSaving}
              disabled={routingSaving}
              style={{ fontWeight: 600 }}
            >
              Save Routing
            </Button>,
          ]}
        >
          <Form form={form} layout="vertical">
            {!editingRouting && (
              <div
                style={{
                  background: token.colorFillAlter,
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  marginBottom: 16,
                }}
              >
                <Form.Item
                  name="divisionFlowTemplate"
                  label={
                    <span style={{ color: token.colorPrimary, fontWeight: 600 }}>
                      ⚡ Auto-Generate Sequential Department Operations Flow (Optional)
                    </span>
                  }
                  extra="Selecting a division flow will automatically attach all sequential department stages (Straightener, Swaging, Spoke, etc.) with standard setup and run times so you don't have to configure each stage manually."
                  style={{ marginBottom: 0 }}
                >
                  <Select
                    allowClear
                    placeholder="Choose Division Sequential Department Flow Preset..."
                    value={selectedDivisionTemplate}
                    onChange={(val) => {
                      setSelectedDivisionTemplate(val);
                      form.setFieldValue('divisionFlowTemplate', val);
                      if (val) {
                        const rt = routeTypes.find((r) =>
                          r.routeCode.toLowerCase().includes(val.replace('DIV-', '').toLowerCase())
                        );
                        if (rt) form.setFieldValue('routeTypeId', rt.id);
                      }
                    }}
                  >
                    <Select.Option value="DIV-SPD">
                      Spoke Division (1. Straightener ➔ 2. Swagging ➔ 3. Spoke ➔ 4. Header ➔ 5. Plating ➔ 6. Packing)
                    </Select.Option>
                    <Select.Option value="DIV-CCD">
                      Control Cable Division (1. Flattening ➔ 2. Spiral ➔ 3. PVC ➔ 4. Assembly ➔ 5. Packing)
                    </Select.Option>
                    <Select.Option value="DIV-PWI">
                      Main Division E-51 (1. Wire Drawing ➔ 2. Annealing ➔ 3. Surface Treatment ➔ 4. Spooling ➔ 5. QC)
                    </Select.Option>
                    <Select.Option value="DIV-NB">
                      NB Division (1. Cold Forging ➔ 2. Drilling ➔ 3. Threading ➔ 4. Plating ➔ 5. Packing)
                    </Select.Option>
                  </Select>
                </Form.Item>
              </div>
            )}

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="name" label="Routing Name" rules={[{ required: true, message: 'Routing Name is required' }]}>
                  <Input maxLength={255} placeholder="e.g. Spoke Assembly Routing" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="productId" label="Product" rules={[{ required: true, message: 'Product is required' }]}>
                  <Select
                    showSearch
                    placeholder="Type code or name to search product..."
                    filterOption={(input, option: any) => {
                      const text = Array.isArray(option?.children)
                        ? option.children.join('')
                        : String(option?.children ?? option?.label ?? '');
                      return text.toLowerCase().includes((input || '').toLowerCase());
                    }}
                    onSearch={searchItems}
                    loading={itemSearching}
                    onChange={() => form.setFieldValue('bomId', undefined)}
                  >
                    {items.map(i => <Select.Option key={i.id} value={i.id}>{i.itemCode} - {i.name}</Select.Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="bomId"
                  label="BOM (Optional)"
                  extra={selectedProductId ? undefined : 'Select product first to filter matching BOMs'}
                >
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="children"
                    placeholder={
                      selectedProductId
                        ? (boms.filter(b => b.productId === selectedProductId).length > 0
                            ? "Select matching BOM (optional)"
                            : "No BOM for this product (optional)")
                        : "Select product first (optional)"
                    }
                  >
                    {(selectedProductId
                      ? boms.filter(b => b.productId === selectedProductId || (editingRouting && editingRouting.bomId === b.id))
                      : boms
                    ).map(b => (
                      <Select.Option key={b.id} value={b.id}>
                        {b.bomCode} - {b.name}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="routeTypeId" label="Route Type (Classification)">
                  <Select allowClear showSearch optionFilterProp="children" placeholder="Select route type (optional)">
                    {routeTypes.map(rt => <Select.Option key={rt.id} value={rt.id}>{rt.routeCode} - {rt.name}</Select.Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="baseQuantity" label="Base Quantity" initialValue={1}>
                  <InputNumber min={0.0001} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={12} style={{ display: 'flex', alignItems: 'center', paddingTop: 28 }}>
                <Form.Item name="isDefault" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Checkbox style={{ fontWeight: 600 }}>
                    Set as Primary Default Routing for this Product
                  </Checkbox>
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="description" label="Description">
              <Input.TextArea rows={2} placeholder="Optional notes or description" />
            </Form.Item>
          </Form>
        </Modal>

        <SaveResultDialog
          open={routingResultOpen}
          phase={routingResultPhase}
          result={routingResult}
          errorTitle={routingResultErrorTitle}
          errorLead={routingResultErrorLead}
          errorMessage={routingResultError}
          onRetry={routingResultRetry}
          onClose={() => setRoutingResultOpen(false)}
        />
      </div>
    </TabKeepAlive>
  );
};

export default RoutingManagement;