import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Modal, Form, Input, Select, App, Card, InputNumber, Row, Col, Checkbox, Space, Button, Table, Tooltip, Tag,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined,
  MinusOutlined, FullscreenOutlined, FullscreenExitOutlined, DragOutlined, CloseOutlined,
  ApartmentOutlined, StarFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService, { describeRequestError } from '../../services/api';
import SaveResultDialog, { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import { formatDecimal, toNum } from '../../utils/numberFormat';

export interface RoutingInput {
  id?: string;
  itemId?: string;
  quantity?: number;
  uomId?: string;
  sourceWarehouseId?: string;
  scrapBasis?: string;
  isPrimary?: boolean;
  lineNumber?: number;
  item?: { name: string; itemCode: string };
}

export interface RoutingOutput {
  id?: string;
  itemId?: string;
  quantity?: number;
  uomId?: string;
  outputType?: string;
  yieldPercentage?: number;
  isPrimary?: boolean;
  lineNumber?: number;
  item?: { name: string; itemCode: string };
}

export interface RoutingOperation {
  id: string;
  sequenceNo: number;
  operationCode: string;
  operationName: string;
  description?: string;
  divisionId?: string;
  division?: { name: string; divisionCode: string };
  sectionId?: string;
  section?: { name: string; sectionCode: string };
  departmentId?: string;
  department?: { name: string; departmentCode: string };
  setupTimeMinutes: number;
  runTimeMinutes: number;
  queueTimeMinutes: number;
  waitTimeMinutes: number;
  laborRequired: boolean;
  machineRequired: boolean;
  machineId?: string;
  machine?: { machineCode: string; name: string };
  inputItemId?: string;
  inputItem?: { name: string; itemCode: string };
  outputItemId?: string;
  outputItem?: { name: string; itemCode: string };
  inputQuantity: number;
  outputQuantity: number;
  uomId?: string;
  uom?: { code: string };
  scrapPercentage: number;
  setupScrapPercentage: number;
  status: string;
  remarks?: string;
  inputs?: RoutingInput[];
  outputs?: RoutingOutput[];
}

export interface Routing {
  id: string;
  routingCode: string;
  name: string;
  description?: string;
  productId: string;
  product?: { id?: string; name: string; itemCode: string };
  bomId: string;
  bom?: { id?: string; bomCode: string; name: string };
  routeTypeId?: string;
  routeType?: { id?: string; routeCode: string; name: string };
  status: string;
  baseQuantity: number;
  estimatedTotalTime: number;
  isDefault: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  operations: RoutingOperation[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  createdByName?: string;
  updatedByName?: string;
}

export interface LookupItem { id: string; name: string; }
export interface Item extends LookupItem {
  itemCode: string;
  itemType?: string;
  departmentId?: string | null;
  departmentName?: string | null;
  uomId?: string;
  materialRoleUsage?: string | null;
}
export interface Division extends LookupItem { divisionCode: string; }
export interface Section extends LookupItem { sectionCode: string; divisionId: string; }
export interface Department extends LookupItem { departmentCode: string; divisionId?: string | null; sectionId?: string | null; }
export interface Uom extends LookupItem { code: string; }
export interface Machine extends LookupItem {
  machineCode: string;
  departmentId?: string | null;
  sectionId?: string | null;
  divisionId?: string | null;
  status?: string;
}
export interface Warehouse extends LookupItem { warehouseCode?: string; }

export interface OperationEditorLookups {
  items: Item[];
  divisions: Division[];
  sections: Section[];
  departments: Department[];
  uoms: Uom[];
  machines: Machine[];
  warehouses: Warehouse[];
}

interface OperationEditorProps {
  open: boolean;
  routing: Routing | null;
  operation: RoutingOperation | null;
  lookups: OperationEditorLookups;
  onClose: () => void;
  onSaved: () => void;
}

interface MachineTargetSummary {
  id: string;
  shift?: { id?: string; shiftCode: string; name: string } | null;
  item?: { id?: string; itemCode: string; name: string } | null;
  uom?: { id?: string; code: string } | null;
  machine?: { id?: string; machineCode: string; name: string } | null;
  standardHours: string | number;
  targetQuantity: string | number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  status?: string;
  itemId?: string;
  machineId?: string;
}

const fmtQty = (v: string | number | null | undefined): string => formatDecimal(toNum(v));

const DTO_PAYLOAD_FIELDS = [
  'sequenceNo',
  'operationCode',
  'operationName',
  'description',
  'divisionId',
  'sectionId',
  'departmentId',
  'setupTimeMinutes',
  'runTimeMinutes',
  'queueTimeMinutes',
  'waitTimeMinutes',
  'laborRequired',
  'machineRequired',
  'scrapPercentage',
  'setupScrapPercentage',
  'status',
  'remarks',
] as const;

const INPUT_MATERIAL_FIELDS = [
  'itemId',
  'quantity',
  'uomId',
  'sourceWarehouseId',
  'scrapBasis',
  'isPrimary',
  'lineNumber',
] as const;

const OUTPUT_PRODUCT_FIELDS = [
  'itemId',
  'quantity',
  'uomId',
  'outputType',
  'yieldPercentage',
  'isPrimary',
  'lineNumber',
] as const;

const pickFields = (row: Record<string, unknown> | undefined, fields: readonly string[]): Record<string, unknown> => {
  if (!row) return {};
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (row[f] !== undefined) out[f] = row[f];
  }
  return out;
};

const perHour = (t: MachineTargetSummary): string => {
  const hours = toNum(t.standardHours);
  if (hours <= 0) return '—';
  return `${fmtQty(toNum(t.targetQuantity) / hours)}${t.uom?.code ? ` ${t.uom.code}` : ''}/hour`;
};

const fmtDate = (iso?: string): string => {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('DD-MMM-YYYY') : iso;
};

const OperationEditor: React.FC<OperationEditorProps> = ({
  open,
  routing,
  operation,
  lookups,
  onClose,
  onSaved,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultPhase, setResultPhase] = useState<SaveResultPhase>('loading');
  const [result, setResult] = useState<SaveResultData | null>(null);
  const [resultError, setResultError] = useState<string>('');
  const [targets, setTargets] = useState<MachineTargetSummary[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [mtQuery, setMtQuery] = useState<{ required: boolean; machineId?: string }>({ required: false });

  // Window Controls State (Draggable, Maximize, Minimize)
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  // Dynamic catalog item search
  const [allItems, setAllItems] = useState<Item[]>(lookups.items);
  const [searchingItems, setSearchingItems] = useState(false);

  useEffect(() => {
    // Merge lookups.items and ensure existing input/output items from the operation are present
    const map = new Map<string, Item>();
    (lookups.items || []).forEach(i => map.set(i.id, i));
    if (operation) {
      (operation.inputs || []).forEach(inp => {
        if (inp.itemId && inp.item && !map.has(inp.itemId)) {
          map.set(inp.itemId, { id: inp.itemId, itemCode: inp.item.itemCode, name: inp.item.name } as Item);
        }
      });
      (operation.outputs || []).forEach(out => {
        if (out.itemId && out.item && !map.has(out.itemId)) {
          map.set(out.itemId, { id: out.itemId, itemCode: out.item.itemCode, name: out.item.name } as Item);
        }
      });
    }
    setAllItems(Array.from(map.values()));
  }, [lookups.items, operation]);

  const searchItemsRemote = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) return;
    setSearchingItems(true);
    try {
      const res = await apiService.get<any>('/master-data/items', { search: query.trim(), limit: 50 });
      const found = res?.data || [];
      if (Array.isArray(found) && found.length > 0) {
        setAllItems(prev => {
          const map = new Map(prev.map(i => [i.id, i]));
          found.forEach((item: Item) => map.set(item.id, item));
          return Array.from(map.values());
        });
      }
    } catch {}
    finally { setSearchingItems(false); }
  }, []);

  const watchedDivisionId = Form.useWatch('divisionId', form) || operation?.divisionId;
  const watchedSectionId = Form.useWatch('sectionId', form) || operation?.sectionId;
  const watchedDepartmentId = Form.useWatch('departmentId', form) || operation?.departmentId;
  const watchedMachineRequired = Form.useWatch('machineRequired', form) ?? operation?.machineRequired;

  const selectedDepartment = React.useMemo(() => {
    if (!watchedDepartmentId) return null;
    return lookups.departments.find(d => d.id === watchedDepartmentId) || null;
  }, [lookups.departments, watchedDepartmentId]);

  const [deptItems, setDeptItems] = useState<Item[]>([]);
  const [deptItemsLoading, setDeptItemsLoading] = useState<boolean>(false);
  const lookupsItemsRef = useRef(lookups.items);
  lookupsItemsRef.current = lookups.items;
  const operationRef = useRef(operation);
  operationRef.current = operation;

  useEffect(() => {
    if (!open || !watchedDepartmentId) {
      if (!watchedDepartmentId) setDeptItems([]);
      return;
    }
    let cancelled = false;
    setDeptItemsLoading(true);
    apiService
      .get<any>('/master-data/items', { departmentId: watchedDepartmentId, limit: 100 })
      .then(res => {
        if (cancelled) return;
        const raw = res?.data;
        const fetched: Item[] = Array.isArray(raw) ? raw : (Array.isArray(res) ? (res as any) : []);
        const map = new Map<string, Item>();
        fetched.forEach(i => map.set(i.id, i));
        (lookupsItemsRef.current || []).forEach(i => {
          if (i.departmentId === watchedDepartmentId) map.set(i.id, i);
        });
        (operationRef.current?.inputs || []).forEach(inp => {
          if (inp.itemId && inp.item && !map.has(inp.itemId)) {
            map.set(inp.itemId, {
              id: inp.itemId,
              itemCode: inp.item.itemCode,
              name: inp.item.name,
              departmentId: watchedDepartmentId,
            } as Item);
          }
        });
        setDeptItems(Array.from(map.values()));
      })
      .catch(() => {
        if (!cancelled) {
          const local = (lookupsItemsRef.current || []).filter(i => i.departmentId === watchedDepartmentId);
          setDeptItems(local);
        }
      })
      .finally(() => {
        if (!cancelled) setDeptItemsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, watchedDepartmentId]);

  // Output Department & Items State
  const [outputDeptId, setOutputDeptId] = useState<string | undefined>(undefined);
  const [outputDeptItems, setOutputDeptItems] = useState<Item[]>([]);
  const [outputDeptLoading, setOutputDeptLoading] = useState<boolean>(false);
  const [outputFilterScope, setOutputFilterScope] = useState<'DEPT' | 'FINISHED_WIP' | 'ALL_DIVISION'>('DEPT');

  // Auto-initialize outputDeptId when operation opens or watchedDepartmentId changes
  useEffect(() => {
    if (open) {
      if (watchedDepartmentId) {
        setOutputDeptId(watchedDepartmentId);
      } else if (lookups.departments.length > 0) {
        const divDepts = watchedDivisionId ? lookups.departments.filter(d => d.divisionId === watchedDivisionId) : lookups.departments;
        setOutputDeptId(divDepts[0]?.id || lookups.departments[0]?.id);
      }
    }
  }, [open, watchedDepartmentId, watchedDivisionId, lookups.departments]);

  // Load items belonging to outputDeptId
  useEffect(() => {
    if (!open || !outputDeptId) {
      if (!outputDeptId) setOutputDeptItems([]);
      return;
    }
    let cancelled = false;
    setOutputDeptLoading(true);
    apiService
      .get<any>('/master-data/items', { departmentId: outputDeptId, limit: 100 })
      .then(res => {
        if (cancelled) return;
        const raw = res?.data;
        const fetched: Item[] = Array.isArray(raw) ? raw : (Array.isArray(res) ? (res as any) : []);
        const map = new Map<string, Item>();
        fetched.forEach(i => map.set(i.id, i));
        (lookupsItemsRef.current || []).forEach(i => {
          if (i.departmentId === outputDeptId) map.set(i.id, i);
        });
        (operationRef.current?.outputs || []).forEach(out => {
          if (out.itemId && out.item && !map.has(out.itemId)) {
            map.set(out.itemId, {
              id: out.itemId,
              itemCode: out.item.itemCode,
              name: out.item.name,
              departmentId: outputDeptId,
            } as Item);
          }
        });
        setOutputDeptItems(Array.from(map.values()));
      })
      .catch(() => {
        if (!cancelled) {
          const local = (lookupsItemsRef.current || []).filter(i => i.departmentId === outputDeptId);
          setOutputDeptItems(local);
        }
      })
      .finally(() => {
        if (!cancelled) setOutputDeptLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, outputDeptId]);

  // Dragging handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    if ((e.target as HTMLElement).closest('button, .ant-modal-close, input, .ant-select')) return;
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: dragPosition.x,
      posY: dragPosition.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      setDragPosition({
        x: dragStartRef.current.posX + dx,
        y: dragStartRef.current.posY + dy,
      });
    };
    const handleMouseUp = () => {
      dragStartRef.current = null;
      setIsDragging(false);
    };
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!open) {
      setIsMinimized(false);
      setIsMaximized(false);
      setDragPosition({ x: 0, y: 0 });
      return;
    }
    if (operation) {
      form.setFieldsValue({
        sequenceNo: operation.sequenceNo,
        operationCode: operation.operationCode,
        operationName: operation.operationName,
        description: operation.description,
        divisionId: operation.divisionId,
        sectionId: operation.sectionId,
        departmentId: operation.departmentId,
        setupTimeMinutes: operation.setupTimeMinutes,
        runTimeMinutes: operation.runTimeMinutes,
        queueTimeMinutes: operation.queueTimeMinutes,
        waitTimeMinutes: operation.waitTimeMinutes,
        laborRequired: operation.laborRequired,
        machineRequired: operation.machineRequired,
        machineId: operation.machineId,
        inputs: (operation.inputs || []).map(i => ({
          itemId: i.itemId,
          quantity: i.quantity,
          uomId: i.uomId,
          sourceWarehouseId: i.sourceWarehouseId,
          scrapBasis: i.scrapBasis || 'WITH_SCRAP',
          isPrimary: i.isPrimary,
        })),
        outputs: (operation.outputs || []).map(o => ({
          itemId: o.itemId,
          quantity: o.quantity,
          uomId: o.uomId,
          outputType: o.outputType || 'MAIN',
          yieldPercentage: o.yieldPercentage,
          isPrimary: o.isPrimary,
        })),
        scrapPercentage: operation.scrapPercentage,
        setupScrapPercentage: operation.setupScrapPercentage,
        status: operation.status,
        remarks: operation.remarks,
      });
      setMtQuery({ required: Boolean(operation.machineRequired), machineId: operation.machineId });
    } else {
      form.resetFields();
      form.setFieldsValue({
        sequenceNo: ((routing?.operations?.length || 0) + 1) * 10,
        laborRequired: true,
        machineRequired: false,
        machineId: undefined,
        status: 'ACTIVE',
        inputs: [],
        outputs: [],
      });
      setMtQuery({ required: false, machineId: undefined });
    }
  }, [open, operation, routing, form]);

  useEffect(() => {
    if (!open || !mtQuery.required || !mtQuery.machineId) {
      setTargets([]);
      return;
    }
    let cancelled = false;
    setTargetsLoading(true);
    apiService
      .get<{ data: MachineTargetSummary[] }>('/production/machine-targets', { machineId: mtQuery.machineId, limit: 50 })
      .then(res => { if (!cancelled) setTargets(res.data || []); })
      .catch(() => { if (!cancelled) setTargets([]); })
      .finally(() => { if (!cancelled) setTargetsLoading(false); });
    return () => { cancelled = true; };
  }, [open, mtQuery.required, mtQuery.machineId]);

  const [materialRoleFilter, setMaterialRoleFilter] = useState<'PRIMARY' | 'COMPONENT' | 'ALL'>('PRIMARY');
  const [targetItemId, setTargetItemId] = useState<string | undefined>(undefined);
  const [machineFilterScope, setMachineFilterScope] = useState<'MATCHING' | 'DEPARTMENT' | 'ALL'>('DEPARTMENT');
  const [allDepartmentTargets, setAllDepartmentTargets] = useState<MachineTargetSummary[]>([]);
  const [allTargetsLoading, setAllTargetsLoading] = useState(false);

  // Watched form values
  const watchedInputs = Form.useWatch('inputs', form) || [];
  const watchedOutputs = Form.useWatch('outputs', form) || [];

  // Hierarchical cascading filters
  const filteredSections = lookups.sections.filter(s => !watchedDivisionId || s.divisionId === watchedDivisionId);

  const filteredDepartments = lookups.departments.filter(d => {
    if (watchedSectionId) {
      return d.sectionId === watchedSectionId;
    }
    if (watchedDivisionId) {
      return (
        d.divisionId === watchedDivisionId ||
        (d.sectionId != null && filteredSections.some(s => s.id === d.sectionId))
      );
    }
    return true;
  });

  // Material item filtering by MaterialRole / Use
  const primaryDeptMaterials = React.useMemo(() => {
    return deptItems.filter(i =>
      i.materialRoleUsage === 'Primary Production Materials' ||
      (i.itemType === 'RAW_MATERIAL' && i.materialRoleUsage !== 'Process Component Materials')
    );
  }, [deptItems]);

  const componentDeptMaterials = React.useMemo(() => {
    return deptItems.filter(i => i.materialRoleUsage === 'Process Component Materials');
  }, [deptItems]);

  const displayedMaterials = React.useMemo(() => {
    if (materialRoleFilter === 'PRIMARY') {
      return primaryDeptMaterials.length > 0 ? primaryDeptMaterials : deptItems;
    }
    if (materialRoleFilter === 'COMPONENT') {
      return componentDeptMaterials.length > 0 ? componentDeptMaterials : deptItems;
    }
    return deptItems;
  }, [deptItems, materialRoleFilter, primaryDeptMaterials, componentDeptMaterials]);

  // Scoped departments for division (for Output Product selection)
  const divisionDepartments = React.useMemo(() => {
    if (!watchedDivisionId) return lookups.departments;
    return lookups.departments.filter(d => d.divisionId === watchedDivisionId);
  }, [lookups.departments, watchedDivisionId]);

  // Output Products Scoped and Filtered by Department / Division
  const displayedOutputItems = React.useMemo(() => {
    let pool: Item[] = [];
    if (outputFilterScope === 'DEPT') {
      pool = outputDeptItems;
    } else if (outputFilterScope === 'FINISHED_WIP') {
      const divDeptIds = new Set(divisionDepartments.map(d => d.id));
      pool = allItems.filter(i =>
        (i.itemType === 'FINISHED_GOODS' || i.itemType === 'WIP' || (i as any).materialRoleUsage === 'Process Component Materials') &&
        (!i.departmentId || divDeptIds.has(i.departmentId))
      );
    } else {
      const divDeptIds = new Set(divisionDepartments.map(d => d.id));
      pool = allItems.filter(i => !i.departmentId || divDeptIds.has(i.departmentId));
    }

    // Ensure currently selected output items in form are included
    const existingOutputIds = (watchedOutputs || []).map((o: any) => o?.itemId).filter(Boolean);
    existingOutputIds.forEach((id: string) => {
      if (!pool.some(i => i.id === id)) {
        const found = allItems.find(i => i.id === id);
        if (found) pool = [found, ...pool];
      }
    });

    return pool;
  }, [outputFilterScope, outputDeptItems, divisionDepartments, allItems, watchedOutputs]);

  // Synchronize targetItemId default with output product or routing product
  useEffect(() => {
    const firstOutputId = watchedOutputs[0]?.itemId;
    if (firstOutputId) {
      setTargetItemId(firstOutputId);
    } else if (routing?.productId && !targetItemId) {
      setTargetItemId(routing.productId);
    }
  }, [watchedOutputs, routing?.productId]);

  // Fetch machine targets for the department / company
  useEffect(() => {
    if (!open || !watchedMachineRequired) return;
    let cancelled = false;
    setAllTargetsLoading(true);
    const params: any = { limit: 300 };
    if (watchedDepartmentId) params.departmentId = watchedDepartmentId;
    apiService
      .get<{ data: MachineTargetSummary[] }>('/production/machine-targets', params)
      .then(res => {
        if (!cancelled) setAllDepartmentTargets(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setAllDepartmentTargets([]);
      })
      .finally(() => {
        if (!cancelled) setAllTargetsLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, watchedMachineRequired, watchedDepartmentId]);

  // Find machines that have configured targets for targetItemId
  const matchingMachineTargets = React.useMemo(() => {
    if (!targetItemId) return [];
    return allDepartmentTargets.filter(t => (t.item?.id === targetItemId || (t as any).itemId === targetItemId));
  }, [allDepartmentTargets, targetItemId]);

  const matchingMachineIds = React.useMemo(() => {
    return new Set(matchingMachineTargets.map(t => t.machine?.id || (t as any).machineId).filter(Boolean));
  }, [matchingMachineTargets]);

  const departmentMachines = React.useMemo(() => {
    if (!watchedDepartmentId) return lookups.machines;
    const direct = lookups.machines.filter(m => m.departmentId === watchedDepartmentId);
    return direct.length > 0 ? direct : lookups.machines;
  }, [lookups.machines, watchedDepartmentId]);

  const displayedMachines = React.useMemo(() => {
    if (machineFilterScope === 'MATCHING' && matchingMachineIds.size > 0) {
      return departmentMachines.filter(m => matchingMachineIds.has(m.id));
    }
    if (machineFilterScope === 'DEPARTMENT') {
      return departmentMachines;
    }
    return lookups.machines;
  }, [machineFilterScope, matchingMachineIds, departmentMachines, lookups.machines]);

  const handleInputItemChange = (rowIndex: number, itemId: string) => {
    const it = deptItems.find(i => i.id === itemId) || allItems.find(i => i.id === itemId);
    if (it?.uomId) {
      form.setFieldValue(['inputs', rowIndex, 'uomId'], it.uomId);
    }
  };

  const handleOutputItemChange = (rowIndex: number, itemId: string) => {
    const it = displayedOutputItems.find(i => i.id === itemId) || allItems.find(i => i.id === itemId);
    if (it?.uomId) {
      form.setFieldValue(['outputs', rowIndex, 'uomId'], it.uomId);
    }
    if (rowIndex === 0 && itemId) {
      setTargetItemId(itemId);
    }
  };

  // Comprehensive Target Item pool for Step 5 Machine Target Link
  const targetItemOptions = React.useMemo(() => {
    const itemMap = new Map<string, { id: string; name: string; itemCode: string; type?: string }>();

    // 1. Output products from Step 4 (highest relevance for operation machine targets)
    (displayedOutputItems || []).forEach(i => {
      if (i?.id) itemMap.set(i.id, { id: i.id, name: i.name || i.itemCode, itemCode: i.itemCode, type: i.itemType });
    });
    (outputDeptItems || []).forEach(i => {
      if (i?.id && !itemMap.has(i.id)) itemMap.set(i.id, { id: i.id, name: i.name || i.itemCode, itemCode: i.itemCode, type: i.itemType });
    });

    // 2. Department items
    (deptItems || []).forEach(i => {
      if (i?.id && !itemMap.has(i.id)) itemMap.set(i.id, { id: i.id, name: i.name || i.itemCode, itemCode: i.itemCode, type: i.itemType });
    });

    // 3. Routing product
    if (routing?.productId) {
      const pName = (routing.product as any)?.name || (routing as any)?.productName || 'Routing Product';
      const pCode = (routing.product as any)?.itemCode || (routing as any)?.productCode || '';
      if (!itemMap.has(routing.productId)) {
        itemMap.set(routing.productId, { id: routing.productId, name: pName, itemCode: pCode });
      }
    }

    // 4. Machine targets items
    (allDepartmentTargets || []).forEach(t => {
      if (t.item && t.item.id && !itemMap.has(t.item.id)) {
        itemMap.set(t.item.id, { id: t.item.id, name: t.item.name || t.item.itemCode, itemCode: t.item.itemCode });
      }
    });

    // 5. General catalog items
    (allItems || []).forEach(i => {
      if (i?.id && !itemMap.has(i.id)) itemMap.set(i.id, { id: i.id, name: i.name || i.itemCode, itemCode: i.itemCode, type: i.itemType });
    });
    (lookups.items || []).forEach(i => {
      if (i?.id && !itemMap.has(i.id)) itemMap.set(i.id, { id: i.id, name: i.name || i.itemCode, itemCode: i.itemCode, type: i.itemType });
    });

    // 6. If targetItemId is set and still not in itemMap, see if operation outputs or inputs have it
    if (targetItemId && !itemMap.has(targetItemId)) {
      const fromOutputs = (operation?.outputs || []).find(o => o.itemId === targetItemId);
      if (fromOutputs?.item) {
        itemMap.set(targetItemId, { id: targetItemId, name: fromOutputs.item.name, itemCode: fromOutputs.item.itemCode });
      }
      const fromInputs = (operation?.inputs || []).find(i => i.itemId === targetItemId);
      if (fromInputs?.item) {
        itemMap.set(targetItemId, { id: targetItemId, name: fromInputs.item.name, itemCode: fromInputs.item.itemCode });
      }
    }

    return Array.from(itemMap.values()).map(i => ({
      value: i.id,
      label: i.name ? `${i.name} (${i.itemCode})` : i.itemCode,
      searchtext: `${i.name} ${i.itemCode} ${i.type || ''}`.toLowerCase(),
      name: i.name,
      code: i.itemCode,
    }));
  }, [displayedOutputItems, outputDeptItems, deptItems, routing?.product, routing?.productId, allDepartmentTargets, allItems, lookups.items, targetItemId, operation]);

  // If targetItemId is set but not resolved in allItems/targetItemOptions, fetch it directly
  useEffect(() => {
    if (!targetItemId) return;
    const exists = targetItemOptions.some(o => o.value === targetItemId && o.name);
    if (!exists) {
      apiService.get<any>(`/master-data/items/${targetItemId}`).then(res => {
        const item = res?.data || res;
        if (item && item.id) {
          setAllItems(prev => {
            if (prev.some(i => i.id === item.id)) return prev;
            return [item, ...prev];
          });
        }
      }).catch(() => {});
    }
  }, [targetItemId, targetItemOptions]);

  const machineOptions = displayedMachines
    .sort((a, b) => {
      const aMatch = matchingMachineIds.has(a.id) ? 1 : 0;
      const bMatch = matchingMachineIds.has(b.id) ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      return (a.name || a.machineCode || '').localeCompare(b.name || b.machineCode || '');
    })
    .map(m => {
      const matchTarget = matchingMachineTargets.find(t => (t.machine?.id || (t as any).machineId) === m.id);
      let labelSuffix = '';
      if (matchTarget) {
        labelSuffix = ` • Target: ${fmtQty(matchTarget.targetQuantity)} / ${matchTarget.standardHours}h`;
      }
      return {
        value: m.id,
        label: `${m.name} (${m.machineCode})${labelSuffix}`,
      };
    });

  const handleSave = async () => {
    if (saving) return;
    let values: any;
    try {
      values = await form.validateFields();
    } catch (err: any) {
      const fieldErrors = (err?.errorFields || [])
        .map((f: any) => `${Array.isArray(f.name) ? f.name.join(' → ') : f.name}: ${f.errors.join(', ')}`);
      const errorMsg = fieldErrors.length > 0
        ? `Please complete the required fields before saving:\n• ${fieldErrors.join('\n• ')}`
        : describeRequestError(err);
      setResult({
        title: 'Operation Validation Error',
        recordType: 'Operation Form',
        recordCode: form.getFieldValue('operationCode') || (operation ? operation.operationCode : 'OP-NEW'),
        recordName: form.getFieldValue('operationName') || (operation ? operation.operationName : 'New Operation'),
      });
      setResultError(errorMsg);
      setResultPhase('error');
      setResultOpen(true);
      return;
    }
    const inputs = values.inputs || [];
    const outputs = values.outputs || [];
    const primaryIn = inputs[0];
    const primaryOut = outputs[0];

    const payload: Record<string, unknown> = {};
    for (const key of DTO_PAYLOAD_FIELDS) {
      if (values[key] !== undefined) payload[key] = values[key];
    }
    payload.machineId = values.machineRequired ? (values.machineId ?? null) : null;
    payload.inputItemId = primaryIn?.itemId ?? values.inputItemId ?? null;
    payload.inputQuantity = primaryIn?.quantity ?? values.inputQuantity ?? 1;
    payload.outputItemId = primaryOut?.itemId ?? values.outputItemId ?? null;
    payload.outputQuantity = primaryOut?.quantity ?? values.outputQuantity ?? 1;
    payload.uomId = primaryIn?.uomId ?? values.uomId ?? null;

    payload.inputs = (inputs as Record<string, unknown>[]).map(r => pickFields(r, INPUT_MATERIAL_FIELDS));
    payload.outputs = (outputs as Record<string, unknown>[]).map(r => pickFields(r, OUTPUT_PRODUCT_FIELDS));

    setSaving(true);
    setResultPhase('loading');
    setResultOpen(true);
    try {
      let savedOp: { operationCode?: string; operationName?: string } | undefined;
      if (operation) {
        const res = (await apiService.put(`/production/routings/operations/${operation.id}`, payload)) as {
          data?: { operationCode?: string; operationName?: string };
        };
        savedOp = res?.data;
      } else {
        const res = (await apiService.post(`/production/routings/${routing!.id}/operations`, payload)) as {
          data?: { operations?: Array<{ id?: string; operationCode?: string; operationName?: string }> };
        };
        const ops = res?.data?.operations || [];
        savedOp =
          ops.find(o => o.operationCode === values.operationCode) ||
          ops.find(o => o.operationName === (values.operationName ?? values.operationCode)) ||
          ops.slice(-1)[0];
      }
      const code = savedOp?.operationCode ?? operation?.operationCode ?? values.operationCode;
      const name = savedOp?.operationName ?? operation?.operationName ?? values.operationName;
      setResult({
        title: operation ? 'Operation Updated Successfully' : 'Operation Saved Successfully',
        recordType: 'Operation Code',
        recordCode: code != null ? String(code).trim() : undefined,
        recordName: name != null ? String(name) : undefined,
      });
      setResultPhase('success');
    } catch (err: any) {
      setResult({
        title: operation ? 'Update Operation Failed' : 'Save Operation Failed',
        recordType: 'Operation Code',
        recordCode: form.getFieldValue('operationCode') || (operation ? operation.operationCode : 'OP-NEW'),
        recordName: form.getFieldValue('operationName') || (operation ? operation.operationName : 'New Operation'),
      });
      setResultError(describeRequestError(err));
      setResultPhase('error');
    } finally {
      setSaving(false);
    }
  };

  const targetColumns = [
    { title: 'Shift', key: 'shift', width: 140, render: (_: unknown, t: MachineTargetSummary) => t.shift ? `${t.shift.name} (${t.shift.shiftCode})` : '—' },
    { title: 'Item', key: 'item', width: 220, render: (_: unknown, t: MachineTargetSummary) => t.item ? `${t.item.name} (${t.item.itemCode})` : '—' },
    { title: 'UOM', key: 'uom', width: 70, render: (_: unknown, t: MachineTargetSummary) => t.uom?.code || '—' },
    { title: 'Std Hrs', key: 'hours', width: 80, align: 'right' as const, render: (_: unknown, t: MachineTargetSummary) => fmtQty(t.standardHours) },
    { title: 'Target', key: 'target', width: 100, align: 'right' as const, render: (_: unknown, t: MachineTargetSummary) => fmtQty(t.targetQuantity) },
    { title: 'Rate', key: 'rate', width: 110, render: (_: unknown, t: MachineTargetSummary) => perHour(t) },
    { title: 'Effective', key: 'eff', width: 150, render: (_: unknown, t: MachineTargetSummary) => t.effectiveTo ? `${fmtDate(t.effectiveFrom)} → ${fmtDate(t.effectiveTo)}` : `From ${fmtDate(t.effectiveFrom)}` },
    { title: 'Status', key: 'status', width: 80, render: (_: unknown, t: MachineTargetSummary) => String(t.status || 'ACTIVE') },
  ];

  const hasMachineTargets = (targets || []).length > 0;

  return (
    <>
      <Modal
        title={
          <div
            onMouseDown={handleMouseDown}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: isMaximized ? 'default' : 'move',
              userSelect: 'none',
              paddingRight: 4,
            }}
          >
            <Space align="center">
              {!isMaximized && <DragOutlined style={{ color: '#94a3b8', fontSize: 14 }} />}
              <span style={{ fontWeight: 700, fontSize: 16 }}>
                {operation ? `Edit Operation — ${operation.operationCode}` : 'Add New Operation'}
              </span>
            </Space>
            <Space size={4} onClick={e => e.stopPropagation()}>
              <Tooltip title="Minimize to bottom dock">
                <Button
                  size="small"
                  type="text"
                  icon={<MinusOutlined />}
                  onClick={() => setIsMinimized(true)}
                  style={{ color: '#64748b', width: 28, height: 28 }}
                />
              </Tooltip>
              <Tooltip title={isMaximized ? "Restore size" : "Maximize (Full Screen)"}>
                <Button
                  size="small"
                  type="text"
                  icon={isMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  onClick={() => {
                    setIsMaximized(!isMaximized);
                    if (!isMaximized) setDragPosition({ x: 0, y: 0 });
                  }}
                  style={{ color: '#64748b', width: 28, height: 28 }}
                />
              </Tooltip>
              <Tooltip title="Close">
                <Button
                  size="small"
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={onClose}
                  style={{ color: '#64748b', width: 28, height: 28 }}
                />
              </Tooltip>
            </Space>
          </div>
        }
        closable={false}
        wrapClassName="erp-operation-editor-wrap"
        open={open && !isMinimized}
        onCancel={onClose}
        width={isMaximized ? 'calc(100% - 24px)' : 1020}
        style={
          isMaximized
            ? { top: 12, maxWidth: 'calc(100% - 24px)', margin: '0 auto' }
            : { top: 24, maxWidth: 'calc(100% - 32px)', margin: '0 auto' }
        }
        styles={{
          body: {
            maxHeight: isMaximized ? 'calc(100vh - 120px)' : 'calc(88vh - 110px)',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '12px 16px',
          },
        }}
        modalRender={(modalNode) => (
          <div
            style={{
              transform: isMaximized ? 'none' : `translate(${dragPosition.x}px, ${dragPosition.y}px)`,
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
            }}
          >
            {modalNode}
          </div>
        )}
        destroyOnHidden={false}
        footer={[
          <Button key="cancel" onClick={onClose} disabled={saving}>Cancel</Button>,
          <Button key="save" type="primary" onClick={handleSave} loading={saving} disabled={saving} style={{ fontWeight: 600 }}>Save Operation</Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          {/* STEP 1: ORGANIZATIONAL HIERARCHY (Division -> Section -> Department) */}
          <Card
            size="small"
            title={
              <Space>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 11, background: '#e0f2fe', color: '#0284c7', fontWeight: 700, fontSize: 12 }}>1</span>
                <span style={{ fontWeight: 600, color: '#0284c7' }}>Organizational Structure (Hierarchy)</span>
              </Space>
            }
            style={{ marginBottom: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}
          >
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="divisionId" label="① Division" rules={[{ required: true, message: 'Please select division' }]}>
                  <Select
                    showSearch
                    allowClear
                    optionFilterProp="children"
                    placeholder="1. Select division..."
                    onChange={() => {
                      form.setFieldsValue({ sectionId: undefined, departmentId: undefined });
                    }}
                  >
                    {lookups.divisions.map(d => <Select.Option key={d.id} value={d.id}>{d.name} ({d.divisionCode})</Select.Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="sectionId" label="② Section (Filtered by Division)">
                  <Select
                    showSearch
                    allowClear
                    optionFilterProp="children"
                    placeholder={watchedDivisionId ? "2. Select section..." : "Select division first"}
                    onChange={(val) => {
                      if (!val) {
                        form.setFieldsValue({ departmentId: undefined });
                        return;
                      }
                      const depts = lookups.departments.filter(d => d.sectionId === val);
                      if (depts.length === 1) {
                        form.setFieldsValue({ departmentId: depts[0].id });
                      } else {
                        form.setFieldsValue({ departmentId: undefined });
                      }
                    }}
                  >
                    {filteredSections.map(s => <Select.Option key={s.id} value={s.id}>{s.name} ({s.sectionCode})</Select.Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="departmentId" label="③ Department (Filtered by Section)">
                  <Select
                    showSearch
                    allowClear
                    optionFilterProp="children"
                    placeholder={
                      watchedSectionId
                        ? (filteredDepartments.length === 0 ? "No departments in this section" : "3. Select department...")
                        : (watchedDivisionId ? "Select section first" : "Select division & section first")
                    }
                  >
                    {filteredDepartments.map(d => <Select.Option key={d.id} value={d.id}>{d.name} ({d.departmentCode})</Select.Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* STEP 2: OPERATION IDENTITY */}
          <Card
            size="small"
            title={
              <Space>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 11, background: '#f3e8ff', color: '#7e22ce', fontWeight: 700, fontSize: 12 }}>2</span>
                <span style={{ fontWeight: 600, color: '#7e22ce' }}>Operation Details</span>
              </Space>
            }
            style={{ marginBottom: 14 }}
          >
            <Row gutter={16}>
              <Col xs={24} sm={6}>
                <Form.Item name="sequenceNo" label="Sequence No" rules={[{ required: true, message: 'Sequence is required' }]}>
                  <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g. 10, 20" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={9}>
                <Form.Item name="operationCode" label="Operation Code" rules={[{ required: true, message: 'Operation Code is required' }]}>
                  <Input maxLength={50} placeholder="e.g. OP-001" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={9}>
                <Form.Item name="operationName" label="Operation Name" rules={[{ required: true, message: 'Operation Name is required' }]}>
                  <Input maxLength={255} placeholder="e.g. Wire Straightening" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="description" label="Description" style={{ marginBottom: 4 }}>
              <Input.TextArea rows={2} placeholder="Optional detailed instructions or notes for this operation..." />
            </Form.Item>
          </Card>

          {/* STEP 3: INPUT MATERIALS (Strictly Filtered by Selected Department & MaterialRole / Use) */}
          <Card
            size="small"
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <Space>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 11, background: '#ecfdf5', color: '#047857', fontWeight: 700, fontSize: 12 }}>3</span>
                  <span style={{ fontWeight: 600, color: '#047857' }}>Input Materials (Raw Materials & WIP Components)</span>
                </Space>
                <Space size={8} wrap>
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: '#f1f5f9', padding: '2px 4px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}>
                    <span style={{ color: '#64748b', marginRight: 6, fontWeight: 500 }}>MaterialRole / Use:</span>
                    <Button
                      size="small"
                      type={materialRoleFilter === 'PRIMARY' ? 'primary' : 'text'}
                      onClick={() => setMaterialRoleFilter('PRIMARY')}
                      style={{
                        height: 24,
                        padding: '0 8px',
                        fontSize: 11,
                        fontWeight: materialRoleFilter === 'PRIMARY' ? 700 : 500,
                        background: materialRoleFilter === 'PRIMARY' ? '#059669' : 'transparent',
                      }}
                    >
                      <StarFilled style={{ marginRight: 5, color: materialRoleFilter === 'PRIMARY' ? '#ffffff' : '#f59e0b' }} />
                      Primary Production Materials ({primaryDeptMaterials.length})
                    </Button>
                    <Button
                      size="small"
                      type={materialRoleFilter === 'COMPONENT' ? 'primary' : 'text'}
                      onClick={() => setMaterialRoleFilter('COMPONENT')}
                      style={{
                        height: 24,
                        padding: '0 8px',
                        fontSize: 11,
                        fontWeight: materialRoleFilter === 'COMPONENT' ? 700 : 500,
                      }}
                    >
                      Process Components ({componentDeptMaterials.length})
                    </Button>
                    <Button
                      size="small"
                      type={materialRoleFilter === 'ALL' ? 'primary' : 'text'}
                      onClick={() => setMaterialRoleFilter('ALL')}
                      style={{
                        height: 24,
                        padding: '0 8px',
                        fontSize: 11,
                        fontWeight: materialRoleFilter === 'ALL' ? 700 : 500,
                      }}
                    >
                      All Dept Items ({deptItems.length})
                    </Button>
                  </div>
                  {selectedDepartment ? (
                    <Tag color="blue" style={{ margin: 0, fontWeight: 500 }}>
                      Dept Filter: {selectedDepartment.departmentCode} - {selectedDepartment.name} ({displayedMaterials.length} shown)
                    </Tag>
                  ) : (
                    <Tag color="orange" style={{ margin: 0 }}>
                      Select department above to load materials
                    </Tag>
                  )}
                </Space>
              </div>
            }
            style={{ marginBottom: 14 }}
          >
            <Form.List name="inputs">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }, idx) => {
                    const rowItemId = watchedInputs[idx]?.itemId;
                    const rowItem = deptItems.find(i => i.id === rowItemId) || allItems.find(i => i.id === rowItemId);
                    const rowUomId = watchedInputs[idx]?.uomId || rowItem?.uomId;
                    const rowUomObj = lookups.uoms.find(u => u.id === rowUomId);
                    const rowUomCode = rowUomObj?.code || (rowItem ? 'KG' : 'Unit');

                    return (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          gap: 10,
                          alignItems: 'flex-start',
                          flexWrap: 'wrap',
                          padding: '10px 12px',
                          background: idx % 2 === 0 ? '#f8fafc' : '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 6,
                          marginBottom: 8,
                        }}
                      >
                        {/* Material Item with strictly department-scoped items and role badges */}
                        <Form.Item
                          {...restField}
                          name={[name, 'itemId']}
                          label={
                            idx === 0 ? (
                              <Space size={4}>
                                <span>Material Item (Department Scope)</span>
                                {materialRoleFilter === 'PRIMARY' && (
                                  <Tag color="green" style={{ margin: 0, fontSize: 11 }}>Primary Materials Only</Tag>
                                )}
                              </Space>
                            ) : undefined
                          }
                          rules={[{ required: true, message: 'Select material item' }]}
                          style={{ flex: '1 1 340px', minWidth: 260, marginBottom: 0 }}
                        >
                          <Select
                            showSearch
                            disabled={!watchedDepartmentId}
                            placeholder={
                              !watchedDepartmentId
                                ? "Select department first to view materials..."
                                : displayedMaterials.length === 0
                                ? (deptItemsLoading ? "Loading department materials..." : "No materials match the selected role filter")
                                : "Select material item..."
                            }
                            filterOption={(input, option: any) => {
                              const query = (input || '').toLowerCase();
                              const searchtext = String(option?.searchtext || option?.label || option?.value || '').toLowerCase();
                              return searchtext.includes(query);
                            }}
                            loading={deptItemsLoading || searchingItems}
                            onChange={(val) => handleInputItemChange(name, val)}
                          >
                            {displayedMaterials.map(i => {
                              const isPrimary = i.materialRoleUsage === 'Primary Production Materials' || (i.itemType === 'RAW_MATERIAL' && i.materialRoleUsage !== 'Process Component Materials');
                              const isComponent = i.materialRoleUsage === 'Process Component Materials';
                              return (
                                <Select.Option
                                  key={i.id}
                                  value={i.id}
                                  searchtext={`${i.itemCode} ${i.name} ${i.materialRoleUsage || ''}`}
                                  style={isPrimary ? { background: '#f0fdf4' } : undefined}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 0' }}>
                                    <div>
                                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{i.name}</span>
                                      <span style={{ color: '#475569', marginLeft: 6 }}>({i.itemCode})</span>
                                    </div>
                                    {isPrimary ? (
                                      <Tag color="green" style={{ margin: 0, fontSize: 11, fontWeight: 600, borderRadius: 4 }}>
                                        Primary Material
                                      </Tag>
                                    ) : isComponent ? (
                                      <Tag color="blue" style={{ margin: 0, fontSize: 11, fontWeight: 500, borderRadius: 4 }}>
                                        Process Component
                                      </Tag>
                                    ) : null}
                                  </div>
                                </Select.Option>
                              );
                            })}
                          </Select>
                        </Form.Item>

                        {/* Quantity with UOM addon */}
                        <Form.Item
                          {...restField}
                          name={[name, 'quantity']}
                          label={
                            idx === 0 ? (
                              <Space size={4}>
                                <span>Qty / Unit</span>
                                <Tag color="blue" style={{ margin: 0, fontWeight: 600, fontSize: 11 }}>{rowUomCode}</Tag>
                              </Space>
                            ) : undefined
                          }
                          tooltip={idx === 0 ? `Standard consumption quantity per unit of operation output (e.g. in ${rowUomCode})` : undefined}
                          style={{ width: 140, marginBottom: 0 }}
                        >
                          <InputNumber
                            min={0.000001}
                            placeholder="1.0"
                            addonAfter={rowUomCode}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>

                        {/* UOM */}
                        <Form.Item
                          {...restField}
                          name={[name, 'uomId']}
                          label={idx === 0 ? "UOM" : undefined}
                          style={{ width: 100, marginBottom: 0 }}
                        >
                          <Select allowClear placeholder="UOM" optionFilterProp="children">
                            {lookups.uoms.map(u => <Select.Option key={u.id} value={u.id}>{u.code}</Select.Option>)}
                          </Select>
                        </Form.Item>

                        {/* Warehouse */}
                        <Form.Item
                          {...restField}
                          name={[name, 'sourceWarehouseId']}
                          label={idx === 0 ? "Source Wh" : undefined}
                          style={{ width: 140, marginBottom: 0 }}
                        >
                          <Select allowClear showSearch optionFilterProp="children" placeholder="Warehouse">
                            {lookups.warehouses.map(w => <Select.Option key={w.id} value={w.id}>{w.warehouseCode || w.name}</Select.Option>)}
                          </Select>
                        </Form.Item>

                        {/* Scrap Basis */}
                        <Form.Item
                          {...restField}
                          name={[name, 'scrapBasis']}
                          label={idx === 0 ? "Scrap Basis" : undefined}
                          style={{ width: 130, marginBottom: 0 }}
                          initialValue="WITH_SCRAP"
                        >
                          <Select>
                            <Select.Option value="WITH_SCRAP">WITH_SCRAP</Select.Option>
                            <Select.Option value="GOOD_ONLY">GOOD_ONLY</Select.Option>
                          </Select>
                        </Form.Item>

                        {/* Primary */}
                        <Form.Item
                          {...restField}
                          name={[name, 'isPrimary']}
                          valuePropName="checked"
                          label={idx === 0 ? "Primary" : undefined}
                          style={{ marginBottom: 0, paddingTop: idx === 0 ? 4 : 4 }}
                        >
                          <Checkbox>Primary</Checkbox>
                        </Form.Item>

                        {/* Remove Button */}
                        <div style={{ paddingTop: idx === 0 ? 30 : 4 }}>
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => remove(name)}
                            title="Remove Material"
                          />
                        </div>
                      </div>
                    );
                  })}

                  <Button
                    type="dashed"
                    onClick={() => add({ scrapBasis: 'WITH_SCRAP', isPrimary: fields.length === 0 })}
                    block
                    icon={<PlusOutlined />}
                    style={{ marginTop: 4, height: 36, fontWeight: 500 }}
                  >
                    + Add Input Material
                  </Button>
                </>
              )}
            </Form.List>
          </Card>

          {/* STEP 4: OUTPUT PRODUCTS (Scoped to Division Departments & Output Filtering) */}
          <Card
            size="small"
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <Space>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 11, background: '#fef3c7', color: '#b45309', fontWeight: 700, fontSize: 12 }}>4</span>
                  <span style={{ fontWeight: 600, color: '#b45309' }}>Output Products (Finished Goods / Co-Products / By-Products)</span>
                </Space>
                <Space size={8} wrap>
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: '#fffbeb', padding: '2px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12 }}>
                    <span style={{ color: '#92400e', marginRight: 6, fontWeight: 600 }}>Output Dept:</span>
                    <Select
                      size="small"
                      value={outputDeptId}
                      onChange={val => setOutputDeptId(val)}
                      placeholder="Select Output Department..."
                      style={{ width: 190 }}
                      dropdownMatchSelectWidth={false}
                    >
                      {divisionDepartments.map(d => (
                        <Select.Option key={d.id} value={d.id}>
                          {d.name} ({d.departmentCode})
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: '#f1f5f9', padding: '2px 4px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}>
                    <Button
                      size="small"
                      type={outputFilterScope === 'DEPT' ? 'primary' : 'text'}
                      onClick={() => setOutputFilterScope('DEPT')}
                      style={{
                        height: 24,
                        padding: '0 8px',
                        fontSize: 11,
                        fontWeight: outputFilterScope === 'DEPT' ? 700 : 500,
                        background: outputFilterScope === 'DEPT' ? '#d97706' : 'transparent',
                      }}
                    >
                      <StarFilled style={{ marginRight: 5, color: outputFilterScope === 'DEPT' ? '#ffffff' : '#f59e0b' }} />
                      Dept Outputs ({outputDeptItems.length})
                    </Button>
                    <Button
                      size="small"
                      type={outputFilterScope === 'FINISHED_WIP' ? 'primary' : 'text'}
                      onClick={() => setOutputFilterScope('FINISHED_WIP')}
                      style={{
                        height: 24,
                        padding: '0 8px',
                        fontSize: 11,
                        fontWeight: outputFilterScope === 'FINISHED_WIP' ? 700 : 500,
                      }}
                    >
                      Finished Goods & WIP
                    </Button>
                    <Button
                      size="small"
                      type={outputFilterScope === 'ALL_DIVISION' ? 'primary' : 'text'}
                      onClick={() => setOutputFilterScope('ALL_DIVISION')}
                      style={{
                        height: 24,
                        padding: '0 8px',
                        fontSize: 11,
                        fontWeight: outputFilterScope === 'ALL_DIVISION' ? 700 : 500,
                      }}
                    >
                      All Division Items
                    </Button>
                  </div>
                </Space>
              </div>
            }
            style={{ marginBottom: 14 }}
          >
            <Form.List name="outputs">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }, idx) => {
                    const rowItemId = watchedOutputs[idx]?.itemId;
                    const rowItem = displayedOutputItems.find(i => i.id === rowItemId) || allItems.find(i => i.id === rowItemId);
                    const rowUomId = watchedOutputs[idx]?.uomId || rowItem?.uomId;
                    const rowUomObj = lookups.uoms.find(u => u.id === rowUomId);
                    const rowUomCode = rowUomObj?.code || (rowItem ? 'Unit' : 'Unit');

                    return (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          gap: 10,
                          alignItems: 'flex-start',
                          flexWrap: 'wrap',
                          padding: '10px 12px',
                          background: idx % 2 === 0 ? '#fffbeb' : '#ffffff',
                          border: '1px solid #fed7aa',
                          borderRadius: 6,
                          marginBottom: 8,
                        }}
                      >
                        <Form.Item
                          {...restField}
                          name={[name, 'itemId']}
                          label={
                            idx === 0 ? (
                              <Space size={4}>
                                <span>Output Product Item (Department Filtered)</span>
                                {outputFilterScope === 'DEPT' && (
                                  <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>Dept Scoped</Tag>
                                )}
                              </Space>
                            ) : undefined
                          }
                          rules={[{ required: true, message: 'Select product item' }]}
                          style={{ flex: '1 1 340px', minWidth: 260, marginBottom: 0 }}
                        >
                          <Select
                            showSearch
                            placeholder="Type code or name to search output product..."
                            filterOption={(input, option: any) => {
                              const query = (input || '').toLowerCase();
                              const searchtext = String(option?.searchtext || option?.label || option?.value || '').toLowerCase();
                              return searchtext.includes(query);
                            }}
                            onSearch={searchItemsRemote}
                            loading={outputDeptLoading || searchingItems}
                            onChange={(val) => handleOutputItemChange(name, val)}
                          >
                            {displayedOutputItems.map(i => {
                              const isFG = i.itemType === 'FINISHED_GOODS';
                              const isWIP = i.itemType === 'WIP' || (i as any).materialRoleUsage === 'Process Component Materials';
                              return (
                                <Select.Option
                                  key={i.id}
                                  value={i.id}
                                  searchtext={`${i.itemCode} ${i.name} ${i.itemType || ''}`}
                                  style={isFG ? { background: '#f5f3ff' } : isWIP ? { background: '#ecfeff' } : undefined}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 0' }}>
                                    <div>
                                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{i.name}</span>
                                      <span style={{ color: '#475569', marginLeft: 6 }}>({i.itemCode})</span>
                                    </div>
                                    {isFG ? (
                                      <Tag color="purple" style={{ margin: 0, fontSize: 11, fontWeight: 600, borderRadius: 4 }}>
                                        Finished Good
                                      </Tag>
                                    ) : isWIP ? (
                                      <Tag color="cyan" style={{ margin: 0, fontSize: 11, fontWeight: 500, borderRadius: 4 }}>
                                        WIP / Sub-Assembly
                                      </Tag>
                                    ) : (
                                      <Tag color="default" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>
                                        {i.itemType || 'Item'}
                                      </Tag>
                                    )}
                                  </div>
                                </Select.Option>
                              );
                            })}
                          </Select>
                        </Form.Item>

                        <Form.Item
                          {...restField}
                          name={[name, 'quantity']}
                          label={
                            idx === 0 ? (
                              <Space size={4}>
                                <span>Output Qty</span>
                                <Tag color="blue" style={{ margin: 0, fontWeight: 600, fontSize: 11 }}>{rowUomCode}</Tag>
                              </Space>
                            ) : undefined
                          }
                          style={{ width: 140, marginBottom: 0 }}
                        >
                          <InputNumber
                            min={0.000001}
                            placeholder="1.0"
                            addonAfter={rowUomCode}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>

                        <Form.Item
                          {...restField}
                          name={[name, 'uomId']}
                          label={idx === 0 ? "UOM" : undefined}
                          style={{ width: 100, marginBottom: 0 }}
                        >
                          <Select allowClear placeholder="UOM" optionFilterProp="children">
                            {lookups.uoms.map(u => <Select.Option key={u.id} value={u.id}>{u.code}</Select.Option>)}
                          </Select>
                        </Form.Item>

                        <Form.Item
                          {...restField}
                          name={[name, 'outputType']}
                          label={idx === 0 ? "Type" : undefined}
                          style={{ width: 130, marginBottom: 0 }}
                          initialValue="MAIN"
                        >
                          <Select>
                            <Select.Option value="MAIN">MAIN</Select.Option>
                            <Select.Option value="CO_PRODUCT">CO_PRODUCT</Select.Option>
                            <Select.Option value="BY_PRODUCT">BY_PRODUCT</Select.Option>
                          </Select>
                        </Form.Item>

                        <Form.Item
                          {...restField}
                          name={[name, 'isPrimary']}
                          valuePropName="checked"
                          label={idx === 0 ? "Primary" : undefined}
                          style={{ marginBottom: 0, paddingTop: idx === 0 ? 4 : 4 }}
                        >
                          <Checkbox>Primary</Checkbox>
                        </Form.Item>

                        <div style={{ paddingTop: idx === 0 ? 30 : 4 }}>
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => remove(name)}
                            title="Remove Output"
                          />
                        </div>
                      </div>
                    );
                  })}

                  <Button
                    type="dashed"
                    onClick={() => add({ outputType: 'MAIN', isPrimary: fields.length === 0 })}
                    block
                    icon={<PlusOutlined />}
                    style={{ marginTop: 4, height: 36, fontWeight: 500 }}
                  >
                    + Add Output Product
                  </Button>
                </>
              )}
            </Form.List>
          </Card>

          {/* STEP 5: MACHINE & WORK CENTER (Linked with Target Item & Machine Targets) */}
          <Card
            size="small"
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <Space>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 11, background: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: 12 }}>5</span>
                  <span style={{ fontWeight: 600, color: '#475569' }}>Machine & Work Center</span>
                </Space>
                {watchedMachineRequired && (
                  <Space size={6} wrap>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Show:</span>
                    {matchingMachineIds.size > 0 && (
                      <Button
                        size="small"
                        type={machineFilterScope === 'MATCHING' ? 'primary' : 'default'}
                        onClick={() => setMachineFilterScope('MATCHING')}
                        style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                      >
                        <StarFilled style={{ marginRight: 5, color: machineFilterScope === 'MATCHING' ? '#ffffff' : '#f59e0b' }} />
                        For Target Item ({matchingMachineIds.size})
                      </Button>
                    )}
                    <Button
                      size="small"
                      type={machineFilterScope === 'DEPARTMENT' ? 'primary' : 'default'}
                      onClick={() => setMachineFilterScope('DEPARTMENT')}
                      style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                    >
                      Department Machines ({departmentMachines.length})
                    </Button>
                    <Button
                      size="small"
                      type={machineFilterScope === 'ALL' ? 'primary' : 'default'}
                      onClick={() => setMachineFilterScope('ALL')}
                      style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                    >
                      All Machines ({lookups.machines.length})
                    </Button>
                  </Space>
                )}
              </div>
            }
            style={{ marginBottom: 14 }}
          >
            <Row gutter={16} align="middle">
              <Col xs={24} sm={5}>
                <Form.Item name="machineRequired" valuePropName="checked" style={{ marginBottom: 8 }}>
                  <Checkbox onChange={e => {
                    const req = e.target.checked;
                    setMtQuery(q => ({ ...q, required: req }));
                    if (!req) form.setFieldValue('machineId', undefined);
                  }}>
                    Requires Machine
                  </Checkbox>
                </Form.Item>
              </Col>

              {/* Target Item link to find configured machines */}
              <Col xs={24} sm={9}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>
                    Operation Target Item (Machine Target Link)
                  </div>
                  <Select
                    showSearch
                    allowClear
                    disabled={!watchedMachineRequired}
                    value={targetItemId}
                    placeholder="Select item to filter machines with targets..."
                    style={{ width: '100%' }}
                    onChange={(val) => setTargetItemId(val)}
                    optionFilterProp="searchtext"
                    filterOption={(input, option: any) => {
                      const query = (input || '').toLowerCase();
                      const searchtext = String(option?.searchtext || option?.label || option?.value || '').toLowerCase();
                      return searchtext.includes(query);
                    }}
                    options={targetItemOptions.map(o => ({
                      value: o.value,
                      label: o.label,
                      searchtext: o.searchtext,
                    }))}
                  />
                </div>
              </Col>

              {/* Assigned Machine dropdown with target tags */}
              <Col xs={24} sm={10}>
                <Form.Item
                  name="machineId"
                  label={
                    <Space size={4}>
                      <span>Assigned Machine</span>
                      {matchingMachineIds.size > 0 && targetItemId && (
                        <Tag color="green" style={{ margin: 0, fontSize: 11 }}>
                          {matchingMachineIds.size} configured for this item
                        </Tag>
                      )}
                    </Space>
                  }
                  rules={[{ required: watchedMachineRequired, message: 'Please select assigned machine' }]}
                  style={{ marginBottom: 8 }}
                >
                  <Select
                    allowClear
                    showSearch
                    disabled={!watchedMachineRequired}
                    placeholder={watchedMachineRequired ? "Select assigned machine..." : "Enable 'Requires Machine' checkbox first"}
                    options={machineOptions}
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes((input || '').toLowerCase())
                    }
                    onChange={val => setMtQuery(q => ({ ...q, machineId: val }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            {watchedMachineRequired && hasMachineTargets && (
              <div style={{ marginTop: 12 }}>
                <div style={{ color: '#64748b', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
                  Machine Target (read-only):
                </div>
                <Table
                  dataSource={targets}
                  columns={targetColumns}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  loading={targetsLoading || allTargetsLoading}
                />
              </div>
            )}
          </Card>

          {/* STEP 6: TIMES, LABOR & SCRAP */}
          <Card
            size="small"
            title={
              <Space>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 11, background: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: 12 }}>6</span>
                <span style={{ fontWeight: 600, color: '#475569' }}>Cycle Times, Scrap & Status</span>
              </Space>
            }
            style={{ marginBottom: 14 }}
          >
            <Row gutter={16}>
              <Col xs={12} sm={6}>
                <Form.Item name="setupTimeMinutes" label="Setup Time (min)" initialValue={0}>
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item name="runTimeMinutes" label="Run Time (min)" initialValue={0}>
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item name="queueTimeMinutes" label="Queue Time (min)" initialValue={0}>
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item name="waitTimeMinutes" label="Wait Time (min)" initialValue={0}>
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={12} sm={6}>
                <Form.Item name="scrapPercentage" label="Operation Scrap (%)" initialValue={0}>
                  <InputNumber min={0} max={100} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item name="setupScrapPercentage" label="Setup Scrap (%)" initialValue={0}>
                  <InputNumber min={0} max={100} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item name="laborRequired" valuePropName="checked" style={{ paddingTop: 28 }}>
                  <Checkbox>Labor Required</Checkbox>
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item name="status" label="Status" initialValue="ACTIVE">
                  <Select>
                    <Select.Option value="ACTIVE">ACTIVE</Select.Option>
                    <Select.Option value="DRAFT">DRAFT</Select.Option>
                    <Select.Option value="OBSOLETE">OBSOLETE</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="remarks" label="Remarks" style={{ marginBottom: 0 }}>
              <Input placeholder="Optional remarks or quality notes" />
            </Form.Item>
          </Card>
        </Form>
      </Modal>

      {/* MINIMIZED FLOATING DOCK PILL (survives minimizing so user can see background page) */}
      {open && isMinimized && (
        <div
          className="erp-minimized-dock-pill"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1100,
            background: '#0d1322',
            border: '1px solid #38bdf8',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.55)',
            borderRadius: 24,
            padding: '8px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <ApartmentOutlined style={{ color: '#38bdf8', fontSize: 18 }} />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 120 }}>
            <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>
              {operation ? `Edit Op: ${operation.operationCode || ''}` : 'Add Operation'}
            </span>
            <span style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.2, marginTop: 2 }}>
              {form.getFieldValue('operationName') || form.getFieldValue('operationCode') || 'Minimised — In Progress'}
            </span>
          </div>
          <Button
            type="primary"
            size="small"
            icon={<FullscreenExitOutlined />}
            onClick={() => setIsMinimized(false)}
            style={{ borderRadius: 12, fontWeight: 500 }}
          >
            Restore
          </Button>
          <Button
            size="small"
            type="text"
            icon={<CloseOutlined />}
            onClick={onClose}
            style={{ color: '#94a3b8' }}
            title="Discard & Close"
          />
        </div>
      )}

      <SaveResultDialog
        open={resultOpen}
        phase={resultPhase}
        result={result}
        errorMessage={resultError}
        onRetry={handleSave}
        onClose={() => {
          setResultOpen(false);
          if (resultPhase === 'success') {
            onSaved();
            onClose();
          }
        }}
      />
    </>
  );
};

export default OperationEditor;