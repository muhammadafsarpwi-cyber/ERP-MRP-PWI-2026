import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App as AntApp,
  Badge,
  Button,
  Col,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Typography,
} from 'antd';
import {
  AuditOutlined,
  BuildOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FileTextOutlined,
  FilterOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  HistoryOutlined,
  LockOutlined,
  MinusOutlined,
  PaperClipOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RollbackOutlined,
  StopOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UserOutlined,
  WarningOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { StatusBadge } from '../../components/shared';
import { buildJobCardWhatsAppMessage, openWhatsAppShare, JobCardShareData } from '../../utils/jobCardShare';
import {
  JOB_CARD_BASE,
  NEXT_ACTION_LABEL,
  STATUS_DESCRIPTION,
  JobCard,
  OrgOption,
  JobCardPartRequest,
  JobCardCompletePayload,
  errorText,
  label,
  rowsOf,
} from './jobCards.types';
import './maintTheme.css';
import { maintenanceCache } from './maintenanceCache';
import './jobCardCreate.css';

const uName = (u: any) => (u && (u.displayName || u.fullName || u.firstName || u.email || u.userName)) || '—';
const companyName = (c: any) => (c && (c.legalName || c.tradeName || c.companyCode || c.name)) || 'Company unavailable';
const techLabel = (r: any) => {
  const master = r?.technician;
  if (master) {
    return master.technicianName || 'Technician';
  }
  return uName(r?.technicianUser);
};
const fmtDt = (iso?: string) => (iso ? dayjs(iso).format('DD/MM/YYYY, hh:mm a') : '—');

export type WorkflowModalMode = 'start' | 'close' | 'parts' | 'review' | 'rework' | 'view';


interface JobCardWorkflowModalProps {
  open: boolean;
  mode: WorkflowModalMode;
  card: JobCard | null;
  technicians?: any[];
  rootCategories?: OrgOption[];
  failureCategories?: OrgOption[];
  allOpenCards?: JobCard[];
  onClose: () => void;
  onSuccess: (action: string, cardId: string) => void;
}

// Quick shop-floor presets for Start remarks
const START_QUICK_CHIPS = [
  '⚡ Power isolated & Lockout-Tagout done',
  '🔍 Initial visual fault diagnosis started',
  '🔧 Mechanical dismantle in progress',
  '🧰 Tools & safety PPE verified ready',
  '⚠️ Awaiting machine cool-down before work',
];

// Quick shop-floor presets for Close diagnosis
const CLOSE_DIAGNOSIS_CHIPS = [
  '💥 Burned contactor/relay replaced',
  '⚙️ Bearing seized - new bearing fitted & greased',
  '📏 Drive belt aligned & tension calibrated',
  '💧 Hydraulic seal replaced & oil refilled',
  '🔌 Wiring short-circuit traced & insulated',
  '🔄 Proximity switch realigned & tested',
];

// Quick shop-floor presets for Close corrective actions
const CLOSE_CORRECTIVE_CHIPS = [
  'Replaced damaged component with new OEM spare from store.',
  'Dismantled, cleaned carbon residue, reassembled and calibrated.',
  'Lubricated bearings, adjusted chain tension, and test ran under load.',
  'Tightened loose electrical terminals and verified phase voltages.',
];

// Quick shop-floor presets for Waiting for Parts reasons
const PARTS_REASON_CHIPS = [
  '📦 Out of stock in main maintenance store',
  '🚚 Purchase order placed - awaiting supplier shipment',
  '🛠️ Non-standard size - custom lathe fabrication required',
  '🚨 Critical OEM electronic module ordered on emergency basis',
];

export const JobCardWorkflowModal: React.FC<JobCardWorkflowModalProps> = ({
  open,
  mode,
  card: propCard,
  technicians = [],
  rootCategories = [],
  failureCategories = [],
  allOpenCards = [],
  onClose,
  onSuccess,
}) => {
  const { message } = AntApp.useApp();

  // Active mode state (can switch dynamically between view and action)
  const [currentMode, setCurrentMode] = useState<WorkflowModalMode>(mode);
  const [viewLayout, _setViewLayout] = useState<'detail' | 'split'>('detail');

  // Active card state (can be switched if mode === 'start' and card wasn't locked)
  const [selectedCardId, setSelectedCardId] = useState<string>(propCard?.id || '');
  const [activeCard, setActiveCard] = useState<JobCard | null>(propCard || null);
  const [loadingCardDetails, setLoadingCardDetails] = useState(false);

  // Machine stats / history / related details state
  const [machineStats, setMachineStats] = useState<any | null>(null);
  const [cardParts, setCardParts] = useState<JobCardPartRequest[]>([]);
  const [cardHistory, setCardHistory] = useState<any[]>([]);
  const [cardTechnicians, setCardTechnicians] = useState<any[]>([]);
  const [cardLogs, setCardLogs] = useState<any[]>([]);
  const [cardAttachments, setCardAttachments] = useState<any[]>([]);

  // Active machine & specs derived from activeCard
  const machine = activeCard?.machine || {};
  const machineName = machine.name || machine.machineName || 'Target Asset';
  const machineCode = machine.machineCode || machine.machineNumber || machine.code || '—';
  const divisionName = activeCard?.division?.name || machine.division?.name || '—';
  const sectionName = activeCard?.section?.name || machine.section?.name || '—';
  const departmentName = activeCard?.assignedDepartment?.name || machine.department?.name || '—';
  const jobCardNo = activeCard?.jobCardNo || activeCard?.id?.substring(0, 8) || 'DRAFT';
  const currentStatus = activeCard?.currentStatus || 'OPEN';
  const priority = (activeCard?.priority || 'MEDIUM').toUpperCase();
  const maintenanceType = activeCard?.maintenanceType || 'BREAKDOWN';
  const complaint = activeCard?.complaint || activeCard?.description || 'No complaint details recorded.';

  // Sync currentMode when mode prop or open changes
  useEffect(() => {
    setCurrentMode(mode);
  }, [mode, open]);

  // Window Controls State
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showPreviewPane, setShowPreviewPane] = useState(true);
  const [mobileTab, setMobileTab] = useState<'form' | 'preview'>('form');
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [customSize, setCustomSize] = useState<{ width: number; height: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, y: 0, startW: 0, startH: 0 });
  const modalContainerRef = useRef<HTMLDivElement | null>(null);

  // Live ticker updating every 5 seconds for real-time live elapsed metrics
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);


  // Submitting state
  const [submitting, setSubmitting] = useState(false);

  // ── Mode-Specific Form Fields ──────────────────────────────────────────
  // START MODE:
  const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
  const [startingNotes, setStartingNotes] = useState('');

  // CLOSE MODE:
  const [closeDiagnosis, setCloseDiagnosis] = useState('');
  const [closeCorrectiveAction, setCloseCorrectiveAction] = useState('');
  const [closePreventiveAction, setClosePreventiveAction] = useState('');
  const [closeRootCauseId, setCloseRootCauseId] = useState('');
  const [closeFailureId, setCloseFailureId] = useState('');
  const [closeRemarks, setCloseRemarks] = useState('');

  // PARTS MODE:
  const [partName, setPartName] = useState('');
  const [partCode, setPartCode] = useState('');
  const [partQty, setPartQty] = useState<number>(1);
  const [partUom, setPartUom] = useState('Pcs');
  const [partsReason, setPartsReason] = useState('');

  // REVIEW MODE:
  const [reviewAction, setReviewAction] = useState<'verify' | 'reject'>('verify');
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Consumed Spare Parts Entry State (Close & View Mode)
  const [itemsList, setItemsList] = useState<any[]>([]);
  const [showAddPartInline, setShowAddPartInline] = useState(false);
  const [addingPart, setAddingPart] = useState(false);
  const [newPartItemId, setNewPartItemId] = useState('');
  const [newPartName, setNewPartName] = useState('');
  const [newPartCode, setNewPartCode] = useState('');
  const [newPartQty, setNewPartQty] = useState<number>(1);
  const [newPartUom, setNewPartUom] = useState('Pcs');
  const [newPartUnitCost, setNewPartUnitCost] = useState<number | undefined>(undefined);
  const [newPartRemarks, setNewPartRemarks] = useState('');

  // Spare Parts Hierarchy & Type Filtering State
  const [partItemType, setPartItemType] = useState<string>('SPARE_PART');
  const [partDivisionId, setPartDivisionId] = useState<string>('');
  const [partSectionId, setPartSectionId] = useState<string>('');
  const [partDepartmentId, setPartDepartmentId] = useState<string>('');
  const [divisionsList, setDivisionsList] = useState<any[]>([]);
  const [sectionsList, setSectionsList] = useState<any[]>([]);
  const [departmentsList, setDepartmentsList] = useState<any[]>([]);
  const [loadingItemStock, setLoadingItemStock] = useState(false);
  const [selectedItemStock, setSelectedItemStock] = useState<{
    onHand: number;
    available: number;
    warehouses: { name: string; onHand: number; available: number }[];
  } | null>(null);
  const [partStockMap, setPartStockMap] = useState<Record<string, { onHand: number; available: number }>>({});

  // WhatsApp Share State
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappText, setWhatsappText] = useState('');

  // Rework Mode State
  const [reworkNotes, setReworkNotes] = useState('');

  // Embedded Parts / Items Request Grid state
  const [gridItemId, setGridItemId] = useState<string>('');
  const [gridQty, setGridQty] = useState<number>(1);
  const [gridStockStatus, setGridStockStatus] = useState<'IN_STOCK' | 'OUT_OF_STOCK' | 'PENDING_PROCUREMENT'>('IN_STOCK');
  const [gridRemarks, setGridRemarks] = useState<string>('');
  const [gridAdding, setGridAdding] = useState<boolean>(false);

  // Master Items & Org Options fetching for Spare Parts (via Singleton Cache for 0ms loading)
  useEffect(() => {
    if (!open) return;
    maintenanceCache.getMasterItems().then((items) => setItemsList(items || [])).catch(() => setItemsList([]));
    maintenanceCache.getDivisions().then((divs) => setDivisionsList(divs || [])).catch(() => {});
    maintenanceCache.getSections().then((secs) => setSectionsList(secs || [])).catch(() => {});
    maintenanceCache.getDepartments().then((depts) => setDepartmentsList(depts || [])).catch(() => {});
  }, [open]);

  // Synchronize hierarchy filters whenever activeCard changes
  useEffect(() => {
    if (activeCard) {
      const dId = activeCard.divisionId || activeCard.division?.id || activeCard.machine?.divisionId || '';
      const sId = activeCard.sectionId || activeCard.section?.id || activeCard.machine?.sectionId || '';
      const deptId = activeCard.assignedDepartmentId || activeCard.assignedDepartment?.id || activeCard.machine?.departmentId || '';
      if (dId) setPartDivisionId(dId);
      if (sId) setPartSectionId(sId);
      if (deptId) setPartDepartmentId(deptId);
    }
  }, [activeCard]);

  // Smart filter pipeline for spare items
  const filteredItems = useMemo(() => {
    return itemsList.filter((item) => {
      // 1. Item Type Filter
      if (partItemType === 'SPARE_PART') {
        const type = (item.itemType || '').toUpperCase();
        const isSpare = [
          'SPARE_PART', 'MECH_SPARE', 'BEARING', 'BELT', 'SEAL',
          'CHAIN', 'MECH_FITTINGS', 'ELECTRICAL', 'EQUIPMENT', 'TOOLS'
        ].includes(type) ||
        type.includes('SPARE') ||
        type.includes('BEARING') ||
        type.includes('BELT') ||
        type.includes('SEAL') ||
        type.includes('FIT') ||
        type.includes('ELEC');
        if (!isSpare) return false;
      } else if (partItemType === 'CONSUMABLE') {
        const type = (item.itemType || '').toUpperCase();
        const isCons = [
          'CONSUMABLE', 'SANITARY_FITTING', 'SANITARY_FITTINGS'
        ].includes(type) || type.includes('CONSUM') || type.includes('OIL') || type.includes('LUB');
        if (!isCons) return false;
      } else if (partItemType === 'EQUIPMENT') {
        const type = (item.itemType || '').toUpperCase();
        if (type !== 'EQUIPMENT' && type !== 'TOOLS') return false;
      } else if (partItemType === 'RAW_MATERIAL') {
        const type = (item.itemType || '').toUpperCase();
        if (type !== 'RAW_MATERIAL') return false;
      }

      // 2. Division Filter (matches selected division OR universal spare without division)
      if (partDivisionId && item.divisionId && item.divisionId !== partDivisionId) {
        return false;
      }

      // 3. Section Filter (matches selected section OR universal spare without section)
      if (partSectionId && item.sectionId && item.sectionId !== partSectionId) {
        return false;
      }

      // 4. Department Filter (matches selected dept OR universal spare without dept)
      if (partDepartmentId && item.departmentId && item.departmentId !== partDepartmentId) {
        return false;
      }

      return true;
    });
  }, [itemsList, partItemType, partDivisionId, partSectionId, partDepartmentId]);

  // Handle selecting an item: auto-fills OEM code, UOM, cost, and checks live store stock
  const handleItemSelect = useCallback(async (val?: string) => {
    setNewPartItemId(val || '');
    if (!val) {
      setSelectedItemStock(null);
      return;
    }
    const found = itemsList.find((i) => i.id === val);
    if (found) {
      setNewPartName(found.name || found.itemName || '');
      setNewPartCode(found.itemCode || found.code || found.partNumber || found.manufacturerPartNumber || '');
      if (found.baseUom?.code || found.uom?.code || found.uom) {
        setNewPartUom(found.baseUom?.code || found.uom?.code || found.uom);
      }
      if (found.costPrice || found.unitCost) {
        setNewPartUnitCost(found.costPrice || found.unitCost);
      }
    }

    setLoadingItemStock(true);
    try {
      const res = await apiService.get<any>('/inventory/balances', { itemId: val, limit: 100 });
      const balances = res?.data || res?.items || (Array.isArray(res) ? res : []);
      let totalOnHand = 0;
      let totalAvailable = 0;
      const whList: { name: string; onHand: number; available: number }[] = [];

      balances.forEach((b: any) => {
        const oh = Number(b.onHand || b.quantityOnHand || 0);
        const av = Number(b.available || b.availableQuantity || oh);
        totalOnHand += oh;
        totalAvailable += av;
        const wName = b.warehouse?.name || b.warehouseName || 'Main Store';
        whList.push({ name: wName, onHand: oh, available: av });
      });

      const stockData = {
        onHand: totalOnHand,
        available: totalAvailable,
        warehouses: whList,
      };
      setSelectedItemStock(stockData);
      setPartStockMap((prev) => ({
        ...prev,
        [val]: { onHand: totalOnHand, available: totalAvailable },
      }));
    } catch (err) {
      console.warn('Could not fetch store inventory stock:', err);
      setSelectedItemStock(null);
    } finally {
      setLoadingItemStock(false);
    }
  }, [itemsList]);

  // Duration Formatter Helper
  const formatDuration = useCallback((minutes: number): string => {
    if (minutes < 1) return '< 1m';
    if (minutes < 60) return `${minutes}m`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs < 24) return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
  }, []);

  // ── 4-Component Timing Calculation ──────────────────────────────────────
  const timingMetrics = useMemo(() => {
    const reqTime = activeCard?.requestedAt ? new Date(activeCard.requestedAt).getTime() : null;
    const startTime = activeCard?.startedAt ? new Date(activeCard.startedAt).getTime() : null;
    const compTime = (activeCard?.completedAt || activeCard?.closedAt)
      ? new Date(activeCard?.completedAt || activeCard?.closedAt).getTime()
      : null;
    const now = Date.now();

    // 1. Response / Waiting Time (Open -> Start or Now)
    let waitMinutes = 0;
    if (reqTime) {
      if (startTime) {
        waitMinutes = Math.max(0, Math.round((startTime - reqTime) / 60000));
      } else {
        waitMinutes = Math.max(0, Math.round((now - reqTime) / 60000));
      }
    }

    // 2. Gross Repair Duration (Start -> Complete or Now)
    let grossRepairMinutes = 0;
    if (startTime) {
      if (compTime) {
        grossRepairMinutes = Math.max(0, Math.round((compTime - startTime) / 60000));
      } else {
        grossRepairMinutes = Math.max(0, Math.round((now - startTime) / 60000));
      }
    }

    // 3. Parts Waiting Time (Duration spent in WAITING_FOR_PARTS / ON_HOLD + Out-of-stock procurement hold)
    let partsHoldMinutes = 0;
    if (Array.isArray(cardHistory) && cardHistory.length > 0) {
      const sortedHist = [...cardHistory].sort(
        (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime()
      );
      let holdStart: number | null = null;
      for (const h of sortedHist) {
        const t = new Date(h.changedAt).getTime();
        if (h.toStatus === 'WAITING_FOR_PARTS' || h.toStatus === 'ON_HOLD') {
          if (!holdStart) holdStart = t;
        } else if (holdStart) {
          partsHoldMinutes += Math.max(0, Math.round((t - holdStart) / 60000));
          holdStart = null;
        }
      }
      if (
        holdStart &&
        (activeCard?.currentStatus === 'WAITING_FOR_PARTS' || activeCard?.currentStatus === 'ON_HOLD')
      ) {
        partsHoldMinutes += Math.max(0, Math.round((now - holdStart) / 60000));
      }
    }

    // Automatically increment parts delay counter for Out of Stock or Pending Procurement parts
    const procurementDelayMinutes = (cardParts || []).reduce((acc: number, p: any) => {
      const isOut = p.stockStatus === 'OUT_OF_STOCK' || p.stockStatus === 'PENDING_PROCUREMENT' || p.isProcurementHold;
      if (isOut) {
        return acc + (Number(p.delayMinutes) > 0 ? Number(p.delayMinutes) : 60);
      }
      return acc;
    }, 0);

    const totalPartsHoldMinutes = partsHoldMinutes + procurementDelayMinutes;

    // 4. Net Active Repair Time (Gross Repair - Parts Delay)
    const netRepairMinutes = Math.max(0, grossRepairMinutes - totalPartsHoldMinutes);

    // 5. Total Machine Downtime (wait + grossRepair)
    const totalDowntimeMinutes = waitMinutes + grossRepairMinutes;

    // 6. Open-to-Close Ticket Lifecycle (requestedAt -> closedAt/now)
    let openToCloseMinutes = totalDowntimeMinutes;
    if (reqTime) {
      const endLifecycle = (activeCard?.closedAt || activeCard?.approvedAt)
        ? new Date(activeCard.closedAt || activeCard.approvedAt).getTime()
        : (activeCard?.completedAt ? new Date(activeCard.completedAt).getTime() : now);
      openToCloseMinutes = Math.max(0, Math.round((endLifecycle - reqTime) / 60000));
    }

    return {
      waitMinutes,
      grossRepairMinutes,
      partsHoldMinutes: totalPartsHoldMinutes,
      procurementDelayMinutes,
      netRepairMinutes,
      totalDowntimeMinutes,
      openToCloseMinutes,
    };
  }, [activeCard, cardHistory, cardParts]);

  // Overall Ticket Procurement Hold Flag
  const hasProcurementHold = useMemo(() => {
    return (
      (cardParts || []).some(
        (p: any) =>
          p.stockStatus === 'OUT_OF_STOCK' ||
          p.stockStatus === 'PENDING_PROCUREMENT' ||
          p.isProcurementHold
      ) || currentStatus === 'WAITING_FOR_PARTS'
    );
  }, [cardParts, currentStatus]);

  const handleAddConsumedPart = () => {
    if (!selectedCardId) return;
    const selectedItem = itemsList.find((i) => i.id === newPartItemId);
    const resolvedName = selectedItem?.name || selectedItem?.itemName || newPartName.trim();
    if (!resolvedName) {
      message.error('Please select an item or enter the spare part name.');
      return;
    }
    if (newPartQty <= 0) {
      message.error('Quantity must be greater than zero.');
      return;
    }

    Modal.confirm({
      title: 'Log Consumed Spare Part?',
      content: `Are you sure you want to add "${resolvedName}" (Qty: ${newPartQty} ${newPartUom || 'Pcs'}) to Job Card #${jobCardNo}?`,
      okText: 'Yes, Save Part',
      okButtonProps: { style: { backgroundColor: '#2563eb', borderColor: '#2563eb', color: '#ffffff', fontWeight: 600 } },
      cancelText: 'Cancel',
      onOk: async () => {
        setAddingPart(true);
        try {
          const resolvedCode = selectedItem?.itemCode || selectedItem?.code || newPartCode.trim() || undefined;
          const payload: any = {
            itemId: newPartItemId || undefined,
            partName: resolvedName,
            partCode: resolvedCode,
            quantity: newPartQty,
            uom: newPartUom || selectedItem?.uom?.code || 'Pcs',
            unitCost: newPartUnitCost ? Number(newPartUnitCost) : undefined,
            remarks: newPartRemarks.trim() || 'Consumed during maintenance repair',
          };

          await apiService.post(`${JOB_CARD_BASE}/${selectedCardId}/parts`, payload);
          message.success(`Spare part "${resolvedName}" logged to job card!`);

          // Refresh parts list
          const updatedParts = await apiService.get<any>(`${JOB_CARD_BASE}/${selectedCardId}/parts`).catch(() => []);
          setCardParts(rowsOf(updatedParts) || []);

          // Reset form
          setNewPartItemId('');
          setNewPartName('');
          setNewPartCode('');
          setNewPartQty(1);
          setNewPartUnitCost(undefined);
          setNewPartRemarks('');
          setSelectedItemStock(null);
          setShowAddPartInline(false);
        } catch (err) {
          message.error(errorText(err));
        } finally {
          setAddingPart(false);
        }
      },
    });
  };

  const handleRemovePart = (partId?: string) => {
    if (!selectedCardId || !partId) return;
    const part = cardParts.find(p => p.id === partId);
    const pName = part?.partName || 'this spare part';

    Modal.confirm({
      title: 'Remove Spare Part?',
      content: `Are you sure you want to delete "${pName}" from Job Card #${jobCardNo}?`,
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          if (!String(partId).startsWith('temp-')) {
            await apiService.delete(`${JOB_CARD_BASE}/${selectedCardId}/parts/${partId}`);
          }
          message.success('Spare part removed');
          setCardParts((prev) => prev.filter((p) => p.id !== partId));
        } catch (err) {
          message.error(errorText(err));
        }
      },
    });
  };

  // Fast Selection & Stock Check for Embedded Parts Grid
  const handleSelectGridItem = (itemId: string) => {
    setGridItemId(itemId);
    const item = itemsList.find((i) => i.id === itemId);
    if (item) {
      const stock = partStockMap[itemId] || {
        onHand: Number(item.onHand ?? item.currentStock ?? 0),
        available: Number(item.available ?? item.onHand ?? item.currentStock ?? 0),
      };
      const avail = Number(stock.available);
      if (avail <= 0) {
        setGridStockStatus('OUT_OF_STOCK');
      } else {
        setGridStockStatus('IN_STOCK');
      }
    }
  };

  // Embedded Parts / Items Request Grid Handlers
  const handleAddPartFromGrid = async () => {
    if (!gridItemId) {
      message.warning('Please select a master item from the dropdown.');
      return;
    }
    if (!gridQty || gridQty <= 0) {
      message.warning('Quantity must be greater than zero.');
      return;
    }

    const selectedItem = itemsList.find((i) => i.id === gridItemId);
    const pName = selectedItem?.name || selectedItem?.itemName || 'Selected Part';
    const pCode = selectedItem?.itemCode || selectedItem?.code || '';
    const pUom = selectedItem?.uom?.code || selectedItem?.uom || 'Pcs';
    const pCost = selectedItem?.standardCost ? Number(selectedItem.standardCost) : undefined;
    const isOut = gridStockStatus === 'OUT_OF_STOCK' || gridStockStatus === 'PENDING_PROCUREMENT';
    const delayMins = isOut ? 60 : 0;

    const newPart: JobCardPartRequest = {
      id: `temp-${Date.now()}`,
      itemId: gridItemId,
      partName: pName,
      partCode: pCode,
      quantity: Number(gridQty),
      uom: pUom,
      unitCost: pCost,
      totalCost: pCost ? pCost * Number(gridQty) : undefined,
      stockStatus: gridStockStatus,
      isProcurementHold: isOut,
      delayMinutes: delayMins,
      remarks: gridRemarks.trim() || (isOut ? 'Awaiting procurement hold' : 'Available in stock'),
      requestedAt: new Date().toISOString(),
    };

    setGridAdding(true);
    try {
      if (selectedCardId) {
        try {
          const res: any = await apiService.post(`${JOB_CARD_BASE}/${selectedCardId}/parts`, {
            itemId: gridItemId,
            partName: pName,
            partCode: pCode || undefined,
            quantity: Number(gridQty),
            uom: pUom,
            unitCost: pCost,
            remarks: newPart.remarks,
          });
          if (res && res.data && res.data.id) {
            newPart.id = res.data.id;
          } else if (res && res.id) {
            newPart.id = res.id;
          }
        } catch {
          // Queued in local parts list for complete payload submission
        }
      }

      setCardParts((prev) => [...prev, newPart]);
      if (isOut) {
        message.warning(`"${pName}" added as ${gridStockStatus.replace(/_/g, ' ')}. Parts Delay counter incremented & Procurement Hold active.`);
      } else {
        message.success(`"${pName}" (Qty: ${gridQty} ${pUom}) added to parts request!`);
      }

      setGridItemId('');
      setGridQty(1);
      setGridStockStatus('IN_STOCK');
      setGridRemarks('');
    } finally {
      setGridAdding(false);
    }
  };

  // Embedded Parts / Items Request Grid Renderer
  const renderPartsRequestGrid = () => {
    const outOfStockCount = (cardParts || []).filter(
      (p: any) => p.stockStatus === 'OUT_OF_STOCK' || p.stockStatus === 'PENDING_PROCUREMENT' || p.isProcurementHold
    ).length;

    return (
      <div
        className="erp-parts-request-grid"
        style={{
          background: 'var(--theme-surface-alt, #0f172a)',
          border: '1px solid var(--theme-border, #1e293b)',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 16,
        }}
      >
        {/* Header with Counter & Status Summary */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: 6,
                background: 'rgba(56, 189, 248, 0.15)',
                color: 'var(--maint-info-fg)',
                fontSize: 13,
              }}
            >
              <BuildOutlined />
            </span>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #ffffff)' }}>
              Parts &amp; Items Request Grid ({cardParts.length})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {outOfStockCount > 0 ? (
              <span
                className="erp-pill-badge erp-pill-badge--warning"
                style={{ fontSize: 11, padding: '2px 8px' }}
              >
                <ClockCircleOutlined style={{ fontSize: 10 }} />
                {outOfStockCount} Item(s) Delaying Ticket
              </span>
            ) : (
              <span
                className="erp-pill-badge erp-pill-badge--success"
                style={{ fontSize: 11, padding: '2px 8px' }}
              >
                All Requested Parts In Stock
              </span>
            )}
          </div>
        </div>

        {/* Embedded High-Density Row Input Bar */}
        <div
          style={{
            background: 'var(--theme-surface-alt)',
            border: '1px solid var(--theme-border)',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 12,
          }}
        >
          <Row gutter={[8, 8]} align="middle">
            <Col xs={24} sm={10} md={10}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: 3 }}>
                Select Master Item:
              </div>
              <Select
                showSearch
                size="small"
                placeholder="Search master items by code, name..."
                style={{ width: '100%' }}
                value={gridItemId || undefined}
                onChange={handleSelectGridItem}
                filterOption={(input, option) =>
                  String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                }
                options={itemsList.map((i: any) => {
                  const code = i.itemCode || i.code || '';
                  const name = i.name || i.itemName || '';
                  const uom = i.uom?.code || i.uom || '';
                  const onHand = Number(i.onHand ?? i.currentStock ?? 0);
                  const isOut = onHand <= 0;
                  return {
                    value: i.id,
                    label: `${code ? `[${code}] ` : ''}${name} (${uom || 'Pcs'})${isOut ? ' — OUT OF STOCK' : ` — Avail: ${onHand}`}`,
                  };
                })}
              />
            </Col>

            <Col xs={12} sm={4} md={3}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: 3 }}>
                Quantity:
              </div>
              <InputNumber
                size="small"
                min={0.1}
                step={1}
                value={gridQty}
                onChange={(v) => setGridQty(v ? Number(v) : 1)}
                style={{ width: '100%' }}
              />
            </Col>

            <Col xs={12} sm={6} md={5}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: 3 }}>
                Stock Status:
              </div>
              <Select
                size="small"
                style={{ width: '100%' }}
                value={gridStockStatus}
                onChange={(v) => setGridStockStatus(v)}
                options={[
                  { value: 'IN_STOCK', label: '🟢 In Stock (Store)' },
                  { value: 'OUT_OF_STOCK', label: '🔴 Out of Stock (+Delay)' },
                  { value: 'PENDING_PROCUREMENT', label: '🟡 Pending Procurement (+Delay)' },
                ]}
              />
            </Col>

            <Col xs={24} sm={4} md={6} style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 17 }}>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                loading={gridAdding}
                onClick={handleAddPartFromGrid}
                style={{
                  backgroundColor: '#2563eb',
                  borderColor: '#1d4ed8',
                  color: '#ffffff',
                  fontWeight: 600,
                  height: 28,
                  padding: '0 12px',
                  borderRadius: 6,
                }}
              >
                Add Part
              </Button>
              {gridStockStatus !== 'IN_STOCK' && (
                <span style={{ fontSize: 10, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <ClockCircleOutlined /> Auto-delays
                </span>
              )}
            </Col>
          </Row>
        </div>

        {/* High-Density Row List Table of Requested Parts */}
        <Table
          size="small"
          pagination={false}
          rowKey={(r: any) => r.id || r.itemId || Math.random().toString()}
          dataSource={cardParts}
          locale={{
            emptyText: (
              <div style={{ padding: '12px 0', color: 'var(--theme-text-muted, #94a3b8)', textAlign: 'center' }}>
                No parts requested yet. Select an item above and click <strong>[Add Part]</strong>.
              </div>
            ),
          }}
          columns={[
            {
              title: 'Item / Part Name',
              key: 'partName',
              render: (_: any, r: any) => {
                const name = r.partName || r.name || r.item?.name || r.item?.itemName || '—';
                const code = r.partCode || r.code || r.item?.itemCode || r.item?.code || '';
                return (
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--theme-text, #ffffff)', fontSize: 12.5 }}>
                      {name}
                    </div>
                    {code && (
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>
                        {code}
                      </div>
                    )}
                  </div>
                );
              },
            },
            {
              title: 'Qty & UOM',
              key: 'qty',
              width: 110,
              render: (_: any, r: any) => (
                <span style={{ fontWeight: 600, fontSize: 12 }}>
                  {r.quantity} {r.uom || r.item?.uom?.code || 'Pcs'}
                </span>
              ),
            },
            {
              title: 'Stock & Delay Status',
              key: 'stockStatus',
              width: 190,
              render: (_: any, r: any) => {
                const isOut = r.stockStatus === 'OUT_OF_STOCK';
                const isProc = r.stockStatus === 'PENDING_PROCUREMENT';
                if (isOut) {
                  return (
                    <span className="erp-pill-badge erp-pill-badge--danger" style={{ fontSize: 10 }}>
                      Out of Stock (+Hold)
                    </span>
                  );
                }
                if (isProc) {
                  return (
                    <span className="erp-pill-badge erp-pill-badge--warning" style={{ fontSize: 10 }}>
                      Procurement Hold (+Delay)
                    </span>
                  );
                }
                return (
                  <span className="erp-pill-badge erp-pill-badge--success" style={{ fontSize: 10 }}>
                    In Stock (Store)
                  </span>
                );
              },
            },
            {
              title: 'Action',
              key: 'action',
              width: 65,
              render: (_: any, r: any) => (
                <Button
                  size="small"
                  danger
                  type="text"
                  icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                  onClick={() => handleRemovePart(r.id)}
                />
              ),
            },
          ]}
        />
      </div>
    );
  };

  // Reusable Smart Add Consumed Part Form with Item Type & Hierarchy Filters + Live Store Inventory Stock
  const renderAddPartInlineForm = () => (
    <div
      style={{
        background: 'var(--theme-surface-alt, #0f172a)',
        border: '1px solid var(--theme-border, #2a385f)',
        borderRadius: 10,
        padding: '14px',
        marginBottom: 14,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--theme-text, #ffffff)' }}>
        Log New Consumed / Replaced Part:
      </div>

      {/* ── Hierarchy & Item Type Smart Filters Strip ── */}
      <div
        style={{
          background: 'var(--theme-surface-alt)',
          border: '1px solid var(--theme-border)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--maint-info-fg)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <FilterOutlined /> Smart Part Filters &amp; Target Hierarchy
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button
              size="small"
              type="link"
              style={{ padding: 0, fontSize: 11, color: 'var(--theme-text-muted)' }}
              onClick={() => {
                setPartDivisionId('');
                setPartSectionId('');
                setPartDepartmentId('');
              }}
            >
              Clear Hierarchy Filters
            </Button>
            <span style={{ color: 'var(--theme-border)' }}>|</span>
            <Button
              size="small"
              type="link"
              style={{ padding: 0, fontSize: 11, color: 'var(--maint-info-fg)' }}
              onClick={() => {
                const dId = activeCard?.divisionId || activeCard?.division?.id || machine?.divisionId || '';
                const sId = activeCard?.sectionId || activeCard?.section?.id || machine?.sectionId || '';
                const deptId = activeCard?.assignedDepartmentId || activeCard?.assignedDepartment?.id || machine?.departmentId || '';
                setPartDivisionId(dId);
                setPartSectionId(sId);
                setPartDepartmentId(deptId);
              }}
            >
              Reset to Job Hierarchy
            </Button>
          </div>
        </div>

        <Row gutter={[8, 8]}>
          {/* 1. Item Type Dropdown */}
          <Col xs={24} sm={6}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: 2 }}>
              Item Type:
            </label>
            <Select
              size="small"
              style={{ width: '100%' }}
              value={partItemType}
              onChange={(v) => setPartItemType(v)}
              options={[
                { value: 'SPARE_PART', label: '⚙️ Spare Parts & Mechanical' },
                { value: 'CONSUMABLE', label: '🛢️ Consumables & Lubricants' },
                { value: 'EQUIPMENT', label: '🧰 Tools & Equipment' },
                { value: 'RAW_MATERIAL', label: '🧵 Raw Material' },
                { value: 'ALL', label: '📦 All Item Types' },
              ]}
            />
          </Col>

          {/* 2. Division Filter */}
          <Col xs={24} sm={6}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: 2 }}>
              Division Filter:
            </label>
            <Select
              size="small"
              allowClear
              placeholder="All Divisions"
              style={{ width: '100%' }}
              value={partDivisionId || undefined}
              onChange={(v) => setPartDivisionId(v || '')}
              options={[
                { value: '', label: 'All Divisions' },
                ...(divisionsList.length > 0
                  ? divisionsList.map((d: any) => ({ value: d.id, label: d.name }))
                  : activeCard?.division?.id
                  ? [{ value: activeCard.division.id, label: activeCard.division.name }]
                  : []),
              ]}
            />
          </Col>

          {/* 3. Section Filter */}
          <Col xs={24} sm={6}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: 2 }}>
              Section Filter:
            </label>
            <Select
              size="small"
              allowClear
              placeholder="All Sections"
              style={{ width: '100%' }}
              value={partSectionId || undefined}
              onChange={(v) => setPartSectionId(v || '')}
              options={[
                { value: '', label: 'All Sections' },
                ...(sectionsList.length > 0
                  ? sectionsList.map((s: any) => ({ value: s.id, label: s.name }))
                  : activeCard?.section?.id
                  ? [{ value: activeCard.section.id, label: activeCard.section.name }]
                  : []),
              ]}
            />
          </Col>

          {/* 4. Department Filter */}
          <Col xs={24} sm={6}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: 2 }}>
              Department Filter:
            </label>
            <Select
              size="small"
              allowClear
              placeholder="All Departments"
              style={{ width: '100%' }}
              value={partDepartmentId || undefined}
              onChange={(v) => setPartDepartmentId(v || '')}
              options={[
                { value: '', label: 'All Departments' },
                ...(departmentsList.length > 0
                  ? departmentsList.map((d: any) => ({ value: d.id, label: d.name }))
                  : activeCard?.assignedDepartment?.id
                  ? [{ value: activeCard.assignedDepartment.id, label: activeCard.assignedDepartment.name }]
                  : []),
              ]}
            />
          </Col>
        </Row>
      </div>

      <Row gutter={[10, 10]}>
        <Col xs={24} sm={14}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Select Spare Part ({filteredItems.length} matching) <span style={{ color: 'var(--maint-danger-fg)' }}>*</span>:
          </label>
          <Select
            showSearch
            allowClear
            style={{ width: '100%' }}
            placeholder="Pick item from inventory or search..."
            value={newPartItemId || undefined}
            onChange={(val) => handleItemSelect(val)}
            optionFilterProp="label"
            options={filteredItems.map((item) => {
              const stock = partStockMap[item.id];
              const stockSuffix = stock !== undefined ? ` • [Stock: ${stock.available}]` : '';
              const code = item.itemCode || item.code ? `[${item.itemCode || item.code}] ` : '';
              return {
                value: item.id,
                label: `${code}${item.name || item.itemName}${stockSuffix}`,
              };
            })}
          />
          {!newPartItemId && (
            <Input
              style={{ marginTop: 6 }}
              placeholder="Or type custom part name if not catalogued..."
              value={newPartName}
              onChange={(e) => setNewPartName(e.target.value)}
            />
          )}

          {/* Live Store Inventory Stock Display */}
          {loadingItemStock && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--maint-info-fg)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Spin size="small" /> <span>Checking live store inventory...</span>
            </div>
          )}
          {!loadingItemStock && selectedItemStock && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 12px',
                borderRadius: 8,
                background: selectedItemStock.onHand > 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${selectedItemStock.onHand > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {selectedItemStock.onHand > 0 ? (
                    <CheckCircleOutlined style={{ color: 'var(--maint-success-fg)', fontSize: 15 }} />
                  ) : (
                    <WarningOutlined style={{ color: 'var(--maint-danger-fg)', fontSize: 15 }} />
                  )}
                  <span style={{ fontWeight: 700, color: selectedItemStock.onHand > 0 ? 'var(--maint-success-fg)' : 'var(--maint-danger-fg)', fontSize: 12 }}>
                    Store Inventory: {selectedItemStock.available} {newPartUom} Available (On Hand: {selectedItemStock.onHand} {newPartUom})
                  </span>
                </div>
                <Tag color={selectedItemStock.onHand > 0 ? 'success' : 'error'} style={{ fontWeight: 700, margin: 0 }}>
                  {selectedItemStock.onHand > 0 ? 'IN STORE STOCK' : 'OUT OF STOCK'}
                </Tag>
              </div>
              {selectedItemStock.warehouses.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--theme-text-secondary)', marginTop: 4 }}>
                  Store Locations: {selectedItemStock.warehouses.map((w) => `${w.name}: ${w.available} ${newPartUom}`).join(' • ')}
                </div>
              )}
            </div>
          )}
        </Col>

        <Col xs={24} sm={10}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Part / OEM Code:
          </label>
          <Input
            placeholder="e.g. BRG-6205 (Auto-filled on selection)"
            value={newPartCode}
            onChange={(e) => setNewPartCode(e.target.value)}
          />
        </Col>

        <Col xs={12} sm={6}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Quantity <span style={{ color: 'var(--maint-danger-fg)' }}>*</span>:
          </label>
          <InputNumber
            min={0.01}
            style={{ width: '100%' }}
            value={newPartQty}
            onChange={(v) => setNewPartQty(v || 1)}
          />
        </Col>

        <Col xs={12} sm={6}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            UOM:
          </label>
          <Select
            style={{ width: '100%' }}
            value={newPartUom}
            onChange={(v) => setNewPartUom(v)}
            options={[
              { value: 'Pcs', label: 'Pcs' },
              { value: 'Set', label: 'Set' },
              { value: 'Mtr', label: 'Mtr' },
              { value: 'Kg', label: 'Kg' },
              { value: 'Ltr', label: 'Ltr' },
              { value: 'Roll', label: 'Roll' },
            ]}
          />
        </Col>

        <Col xs={24} sm={12}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Remarks / Application Note:
          </label>
          <Input
            placeholder="e.g. Replaced worn motor drive bearing"
            value={newPartRemarks}
            onChange={(e) => setNewPartRemarks(e.target.value)}
          />
        </Col>
      </Row>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <Button size="small" onClick={() => setShowAddPartInline(false)}>
          Cancel
        </Button>
        <Button
          size="small"
          type="primary"
          loading={addingPart}
          icon={<PlusOutlined />}
          style={{ backgroundColor: '#10b981', borderColor: '#10b981', color: '#ffffff', fontWeight: 600 }}
          onClick={handleAddConsumedPart}
        >
          Save Part to Job Card
        </Button>
      </div>
    </div>
  );

  // Synchronize when propCard or open changes
  useEffect(() => {
    if (!open) {
      setIsMinimized(false);
      return;
    }
    const targetCard = propCard || (allOpenCards.length > 0 ? allOpenCards[0] : null);
    setActiveCard(targetCard);
    setSelectedCardId(targetCard?.id || '');

    // Pre-populate technician IDs if card already has assignments
    if (targetCard && Array.isArray(targetCard.technicians) && targetCard.technicians.length > 0) {
      const existingIds = targetCard.technicians
        .map((t: any) => t.technicianId || t.technician?.id)
        .filter(Boolean);
      setSelectedTechIds(existingIds);
    } else {
      setSelectedTechIds([]);
    }

    // Reset or pre-populate inputs for rework mode
    setStartingNotes('');
    setCloseDiagnosis(targetCard?.diagnosis || '');
    setCloseCorrectiveAction(targetCard?.correctiveAction || '');
    setClosePreventiveAction(targetCard?.preventiveAction || '');
    setCloseRootCauseId(targetCard?.rootCauseCategoryId || '');
    setCloseFailureId(targetCard?.failureCategoryId || '');
    setCloseRemarks(targetCard?.remarks || '');
    setReworkNotes('');
    setPartName('');
    setPartCode('');
    setPartQty(1);
    setPartUom('Pcs');
    setPartsReason('');
    setReviewAction('verify');
    setReviewRemarks('');
    setRejectionReason('');
  }, [open, propCard, allOpenCards]);

  // Fetch full card detail, machine history, parts, technicians, logs, and attachments
  useEffect(() => {
    if (!open || !selectedCardId) return;

    setLoadingCardDetails(true);
    Promise.all([
      apiService.get<any>(`${JOB_CARD_BASE}/${selectedCardId}`).catch(() => null),
      apiService.get<any>(`${JOB_CARD_BASE}/${selectedCardId}/parts`).catch(() => []),
      apiService.get<any>(`${JOB_CARD_BASE}/${selectedCardId}/history`).catch(() => []),
      apiService.get<any>(`${JOB_CARD_BASE}/${selectedCardId}/technicians`).catch(() => []),
      apiService.get<any>(`${JOB_CARD_BASE}/${selectedCardId}/work-logs`).catch(() => []),
      apiService.get<any>(`${JOB_CARD_BASE}/${selectedCardId}/attachments`).catch(() => []),
    ])
      .then(([jobRes, partsRes, histRes, techRes, logsRes, attachRes]) => {
        if (jobRes) {
          const c = jobRes?.data || jobRes;
          setActiveCard(c);
          if (c.diagnosis) setCloseDiagnosis((prev) => prev || c.diagnosis);
          if (c.correctiveAction) setCloseCorrectiveAction((prev) => prev || c.correctiveAction);
          if (c.preventiveAction) setClosePreventiveAction((prev) => prev || c.preventiveAction);
          if (c.rootCauseCategoryId) setCloseRootCauseId((prev) => prev || c.rootCauseCategoryId);
          if (c.failureCategoryId) setCloseFailureId((prev) => prev || c.failureCategoryId);
          // If card has a machineId, fetch machine maintenance stats & history
          const machineId = c.machineId || c.machine?.id;
          if (machineId) {
            apiService
              .get<any>(`/master-data/maintenance/job-cards/machine/${machineId}/stats`)
              .then((stats) => setMachineStats(stats))
              .catch(() => setMachineStats(null));
          }
        }
        setCardParts(rowsOf(partsRes) || []);
        setCardHistory(rowsOf(histRes) || []);
        setCardTechnicians(rowsOf(techRes) || []);
        setCardLogs(rowsOf(logsRes) || []);
        setCardAttachments(rowsOf(attachRes) || []);
      })
      .catch((err) => {
        console.error('Error fetching job card details:', err);
      })
      .finally(() => {
        setLoadingCardDetails(false);
      });
  }, [open, selectedCardId]);


  // Window drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (isMaximized) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialX: modalPos.x,
      initialY: modalPos.y,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = ev.clientX - dragStartRef.current.x;
      const dy = ev.clientY - dragStartRef.current.y;
      setModalPos({
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy,
      });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [isMaximized, modalPos]);

  // Window corner resize handler (drag to make bigger or smaller)
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;

    const el = modalContainerRef.current;
    const currentW = el ? el.offsetWidth : 960;
    const currentH = el ? el.offsetHeight : 680;

    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startW: currentW,
      startH: currentH,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const dx = ev.clientX - resizeStartRef.current.x;
      const dy = ev.clientY - resizeStartRef.current.y;
      const minW = Math.min(500, window.innerWidth - 30);
      const maxW = window.innerWidth - 30;
      const minH = 380;
      const maxH = window.innerHeight - 30;
      setCustomSize({
        width: Math.max(minW, Math.min(maxW, resizeStartRef.current.startW + dx)),
        height: Math.max(minH, Math.min(maxH, resizeStartRef.current.startH + dy)),
      });
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [isMaximized]);

  // Live duration ticker calculation
  const liveWorkingDuration = useMemo(() => {
    if (!activeCard?.startedAt) return '0m';
    const start = new Date(activeCard.startedAt).getTime();
    const diffMins = Math.max(0, Math.round((nowTick - start) / 60000));
    return formatDuration(diffMins);
  }, [activeCard?.startedAt, nowTick, formatDuration]);

  // Enhanced 7-Stage Lifecycle Stepper with dynamic bold styling & colors
  const sevenSteps = useMemo(() => {
    const openDate = activeCard?.requestedAt || activeCard?.createdAt;
    const asgDate = activeCard?.assignedAt || cardTechnicians[0]?.assignedAt;
    const startDate = activeCard?.startedAt;
    const compDate = activeCard?.completedAt;
    const verDate = activeCard?.verifiedAt;
    const closeDate = activeCard?.closedAt || activeCard?.approvedAt;

    let diffAsgText: string | null = null;
    if (openDate && asgDate) {
      const diffMins = Math.max(0, Math.round((new Date(asgDate).getTime() - new Date(openDate).getTime()) / 60000));
      diffAsgText = `${formatDuration(diffMins)} wait`;
    }

    const cur = currentStatus;
    let s0: 'finish' | 'process' | 'wait' = 'finish';
    let s1: 'finish' | 'process' | 'wait' = 'wait';
    let s2: 'finish' | 'process' | 'wait' = 'wait';
    let s3: 'finish' | 'process' | 'wait' = 'wait';
    let s4: 'finish' | 'process' | 'wait' | 'error' = 'wait';
    let s5: 'finish' | 'process' | 'wait' = 'wait';
    let s6: 'finish' | 'process' | 'wait' = 'wait';

    if (cur === 'OPEN') {
      s0 = 'process';
    } else if (cur === 'ASSIGNED') {
      s0 = 'finish';
      s1 = 'process';
    } else if (['IN_PROGRESS', 'WAITING_FOR_PARTS', 'ON_HOLD'].includes(cur)) {
      s0 = 'finish';
      s1 = 'finish';
      s2 = 'process';
    } else if (cur === 'PENDING_VERIFICATION') {
      s0 = 'finish';
      s1 = 'finish';
      s2 = 'finish';
      s3 = 'finish';
      s4 = 'process';
    } else if (cur === 'VERIFIED') {
      s0 = 'finish';
      s1 = 'finish';
      s2 = 'finish';
      s3 = 'finish';
      s4 = 'finish';
      s5 = 'process';
    } else if (['CLOSED', 'COMPLETED'].includes(cur)) {
      s0 = 'finish';
      s1 = 'finish';
      s2 = 'finish';
      s3 = 'finish';
      s4 = 'finish';
      s5 = 'finish';
      s6 = 'finish';
    } else if (cur === 'REJECTED') {
      s0 = 'finish';
      s1 = 'finish';
      s2 = 'finish';
      s3 = 'finish';
      s4 = 'error';
    }

    const isCurOpen = cur === 'OPEN';
    const isCurAsg = cur === 'ASSIGNED';
    const isCurProgress = ['IN_PROGRESS', 'WAITING_FOR_PARTS', 'ON_HOLD'].includes(cur);
    const isCurReview = cur === 'PENDING_VERIFICATION';
    const isCurRejected = cur === 'REJECTED';
    const isCurVerified = cur === 'VERIFIED';
    const isCurClosed = ['CLOSED', 'COMPLETED'].includes(cur);

    return [
      {
        title: (
          <span style={{ fontWeight: isCurOpen ? 800 : 600, color: isCurOpen ? 'var(--maint-info-fg)' : undefined, fontSize: 12 }}>
            1. Open
          </span>
        ),
        description: (
          <div style={{ fontSize: 11, color: isCurOpen ? 'var(--maint-info-fg)' : 'var(--theme-text-secondary)', marginTop: 2 }}>
            <div style={{ fontWeight: isCurOpen ? 700 : 400 }}>{openDate ? dayjs(openDate).format('DD/MM/YYYY') : '—'}</div>
            {openDate && (
              <div style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>
                {dayjs(openDate).format('hh:mm a')}
              </div>
            )}
          </div>
        ),
        status: s0,
      },
      {
        title: (
          <span style={{ fontWeight: isCurAsg ? 800 : 600, color: isCurAsg ? 'var(--maint-info-fg)' : undefined, fontSize: 12 }}>
            2. Assigned
          </span>
        ),
        description: (
          <div style={{ fontSize: 11, color: isCurAsg ? 'var(--maint-info-fg)' : 'var(--theme-text-secondary)', marginTop: 2 }}>
            {diffAsgText ? (
              <Tag color="cyan" style={{ fontSize: 10, margin: '2px 0', padding: '0 6px', lineHeight: '18px', fontWeight: 700 }}>
                {diffAsgText}
              </Tag>
            ) : (
              <div style={{ fontWeight: isCurAsg ? 700 : 400 }}>{asgDate ? dayjs(asgDate).format('DD/MM/YYYY') : (cardTechnicians.length ? `${cardTechnicians.length} tech assigned` : 'Unassigned')}</div>
            )}
            {asgDate && (
              <div style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>
                {dayjs(asgDate).format('hh:mm a')}
              </div>
            )}
          </div>
        ),
        status: s1,
      },
      {
        title: (
          <span style={{ fontWeight: isCurProgress ? 800 : 600, color: isCurProgress ? (cur === 'IN_PROGRESS' ? 'var(--maint-danger-fg)' : 'var(--maint-warning-fg)') : undefined, fontSize: 12 }}>
            3. In Progress
          </span>
        ),
        description: (
          <div style={{ fontSize: 11, color: isCurProgress ? 'var(--maint-danger-fg)' : 'var(--theme-text-secondary)', fontWeight: isCurProgress ? 700 : 400, marginTop: 2 }}>
            {cur === 'IN_PROGRESS' ? (
              <div>
                <span className="erp-jc-live-dot" style={{ marginRight: 5 }} />
                <span style={{ color: 'var(--maint-danger-fg)', fontWeight: 800 }}>LIVE: {liveWorkingDuration}</span>
              </div>
            ) : cur === 'WAITING_FOR_PARTS' ? (
              <Tag color="orange" style={{ margin: 0, fontWeight: 700 }}>Waiting for Parts</Tag>
            ) : (
              <div>{startDate ? dayjs(startDate).format('DD/MM/YYYY') : 'Pending'}</div>
            )}
            {startDate && (
              <div style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>
                {dayjs(startDate).format('hh:mm a')}
              </div>
            )}
          </div>
        ),
        status: s2,
      },
      {
        title: (
          <span style={{ fontWeight: compDate && !isCurClosed ? 800 : 600, color: compDate ? 'var(--maint-success-fg)' : undefined, fontSize: 12 }}>
            4. Work Completed
          </span>
        ),
        description: (
          <div style={{ fontSize: 11, color: 'var(--theme-text-secondary)', marginTop: 2 }}>
            {compDate ? (
              <>
                <Tag color="green" style={{ fontSize: 10, margin: '2px 0', padding: '0 6px', lineHeight: '18px', fontWeight: 700 }}>
                  {formatDuration(timingMetrics.netRepairMinutes)} net
                </Tag>
                <div style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>
                  {dayjs(compDate).format('DD/MM, hh:mm a')}
                </div>
              </>
            ) : (
              <div>{isCurProgress ? 'In Work' : 'Pending'}</div>
            )}
          </div>
        ),
        status: s3,
      },
      {
        title: (
          <span
            style={{
              fontWeight: isCurReview || isCurRejected ? 800 : 600,
              color: isCurRejected ? 'var(--maint-danger-fg)' : (isCurReview ? '#7c3aed' : undefined),
              fontSize: 12,
            }}
          >
            {isCurRejected ? '5. Rejected' : '5. Verification'}
          </span>
        ),
        description: (
          <div style={{ fontSize: 11, marginTop: 2 }}>
            {isCurRejected ? (
              <Tag color="error" style={{ fontWeight: 800, margin: 0 }}>Returned for Rework</Tag>
            ) : isCurReview ? (
              <Tag color="purple" style={{ fontWeight: 700, margin: 0 }}>Awaiting Sign-off</Tag>
            ) : (
              <div style={{ color: 'var(--theme-text-secondary)' }}>
                {['VERIFIED', 'CLOSED', 'COMPLETED'].includes(cur) ? 'Checked' : 'Queued'}
              </div>
            )}
          </div>
        ),
        status: s4,
      },
      {
        title: (
          <span style={{ fontWeight: isCurVerified ? 800 : 600, color: isCurVerified ? 'var(--maint-success-fg)' : undefined, fontSize: 12 }}>
            6. Verified
          </span>
        ),
        description: (
          <div style={{ fontSize: 11, color: 'var(--theme-text-secondary)', marginTop: 2 }}>
            {verDate ? (
              <>
                <Tag color="geekblue" style={{ fontSize: 10, margin: '2px 0', padding: '0 6px', lineHeight: '18px', fontWeight: 700 }}>
                  Verified
                </Tag>
                <div style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>
                  {dayjs(verDate).format('DD/MM, hh:mm a')}
                </div>
              </>
            ) : (
              <div>Pending</div>
            )}
          </div>
        ),
        status: s5,
      },
      {
        title: (
          <span style={{ fontWeight: isCurClosed ? 800 : 600, color: isCurClosed ? 'var(--maint-success-fg)' : undefined, fontSize: 12 }}>
            7. Closed
          </span>
        ),
        description: (
          <div style={{ fontSize: 11, color: 'var(--theme-text-secondary)', marginTop: 2 }}>
            {closeDate ? (
              <>
                <Tag color="success" style={{ fontSize: 10, margin: '2px 0', padding: '0 6px', lineHeight: '18px', fontWeight: 700 }}>
                  Closed &amp; Archived
                </Tag>
                <div style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>
                  {dayjs(closeDate).format('DD/MM, hh:mm a')}
                </div>
              </>
            ) : (
              <div>Open</div>
            )}
          </div>
        ),
        status: s6,
      },
    ];
  }, [activeCard, cardTechnicians, currentStatus, formatDuration, timingMetrics, liveWorkingDuration]);

  const activeStepIndex = useMemo(() => {
    const cur = currentStatus;
    if (cur === 'OPEN') return 0;
    if (cur === 'ASSIGNED') return 1;
    if (['IN_PROGRESS', 'WAITING_FOR_PARTS', 'ON_HOLD'].includes(cur)) return 2;
    if (cur === 'PENDING_VERIFICATION' || cur === 'REJECTED') return 4;
    if (cur === 'VERIFIED') return 5;
    if (['CLOSED', 'COMPLETED'].includes(cur)) return 6;
    return 0;
  }, [currentStatus]);

  // Open WhatsApp Share Dialog with pre-composed message
  const handleOpenWhatsApp = useCallback(() => {
    if (!activeCard) return;
    const shareData: JobCardShareData = {
      jobCardNo,
      currentStatus,
      priority: activeCard.priority || (machine.criticality === 'CRITICAL' ? 'HIGH' : 'MEDIUM'),
      complaint: activeCard.complaint || complaint,
      reportedByName: uName(activeCard.requestedByUser || activeCard.reportedBy),
      requestedAt: activeCard.requestedAt || activeCard.createdAt,
      startedAt: activeCard.startedAt,
      completedAt: activeCard.completedAt,
      closedAt: activeCard.closedAt,
      machine: {
        name: machineName,
        code: machineCode,
        criticality: machine.criticality,
        location: machine.location || 'Factory Floor',
      },
      division: { name: divisionName },
      section: { name: sectionName },
      department: { name: departmentName },
      team: { name: activeCard.team?.name },
      technicians: cardTechnicians.map((t) => ({ name: techLabel(t) })),
      diagnosis: activeCard.diagnosis || closeDiagnosis,
      correctiveAction: activeCard.correctiveAction || closeCorrectiveAction,
      preventiveAction: activeCard.preventiveAction || closePreventiveAction,
      timings: timingMetrics,
      parts: cardParts.map((p: any) => ({
        partName: p.partName || p.name || p.item?.name || p.item?.itemName || 'Part',
        partCode: p.partCode || p.code || p.item?.itemCode || p.item?.code || '',
        quantity: p.quantity,
        uom: p.uom || p.item?.uom?.code || 'Pcs',
      })),
    };

    const text = buildJobCardWhatsAppMessage(shareData);
    setWhatsappText(text);
    setWhatsappModalOpen(true);
  }, [
    activeCard,
    jobCardNo,
    currentStatus,
    machineName,
    machineCode,
    machine.criticality,
    machine.location,
    divisionName,
    sectionName,
    departmentName,
    cardTechnicians,
    cardParts,
    timingMetrics,
    closeDiagnosis,
    closeCorrectiveAction,
    closePreventiveAction,
    complaint,
  ]);

  // Mode header definitions
  const modeConfig = {
    start: {
      title: 'Start Maintenance Job Card',
      sub: 'Assign technicians, safety checks & initial shop-floor notes',
      icon: <PlayCircleOutlined />,
      iconClass: 'erp-jc-header-icon',
      btnText: 'Start Job Now',
      btnColor: '#2563eb',
    },
    close: {
      title: 'Close Maintenance Job Card',
      sub: 'Record diagnosis, corrective action taken & complete ticket',
      icon: <CheckCircleOutlined />,
      iconClass: 'erp-jc-header-icon erp-jc-header-icon--success',
      btnText: 'Complete & Close Job',
      btnColor: '#059669',
    },
    parts: {
      title: 'Waiting for Parts / Hold',
      sub: 'Pause active work and record missing spare part requirement',
      icon: <StopOutlined />,
      iconClass: 'erp-jc-header-icon erp-jc-header-icon--warning',
      btnText: 'Put on Hold (Waiting for Parts)',
      btnColor: '#d97706',
    },
    review: {
      title: 'Supervisor Review & Verification',
      sub: 'Inspect technician diagnosis & approve or return for rework',
      icon: <AuditOutlined />,
      iconClass: 'erp-jc-header-icon erp-jc-header-icon--purple',
      btnText: reviewAction === 'verify' ? 'Approve & Verify Job' : 'Return to Technician',
      btnColor: reviewAction === 'verify' ? '#059669' : '#dc2626',
    },
    rework: {
      title: 'Rework & Resubmit Job Card',
      sub: `Ticket #${jobCardNo} — Address supervisor rejection notes, update repair actions & resubmit`,
      icon: <RollbackOutlined />,
      iconClass: 'erp-jc-header-icon erp-jc-header-icon--red',
      btnText: 'Confirm & Resubmit for Review',
      btnColor: '#ef4444',
    },
    view: {
      title: 'Job Card 360° Comprehensive Inspection',
      sub: `Ticket #${jobCardNo} — Full audit trail, machine profile & lifecycle tracking`,
      icon: <ToolOutlined />,
      iconClass: 'erp-jc-header-icon',
      btnText: 'Close View',
      btnColor: '#3b82f6',
    },
  }[currentMode];

  // ── Form Validation ──────────────────────────────────────────────────────
  const isFormValid = useMemo(() => {
    if (!selectedCardId) return false;
    if (currentMode === 'start') {
      return selectedTechIds.length > 0 && startingNotes.trim().length > 0;
    }
    if (currentMode === 'close' || currentMode === 'rework') {
      return closeDiagnosis.trim().length > 0 && closeCorrectiveAction.trim().length > 0;
    }
    if (currentMode === 'parts') {
      return partName.trim().length > 0 && partQty > 0 && partsReason.trim().length > 0;
    }
    if (currentMode === 'review') {
      if (reviewAction === 'reject') {
        return rejectionReason.trim().length > 0;
      }
      return true;
    }
    return true;
  }, [
    currentMode,
    selectedCardId,
    selectedTechIds,
    startingNotes,
    closeDiagnosis,
    closeCorrectiveAction,
    partName,
    partQty,
    partsReason,
    reviewAction,
    rejectionReason,
  ]);

  // ── Form Submission with 2027 Confirmation Dialogs ──────────────────────
  const executeSubmission = async () => {
    if (!selectedCardId) return;
    setSubmitting(true);
    try {
      if (currentMode === 'start') {
        await apiService.post(`${JOB_CARD_BASE}/${selectedCardId}/start`, {
          technicianIds: selectedTechIds,
          remarks: startingNotes.trim(),
        });
        message.success(`Job Card ${jobCardNo} started successfully!`);
        onSuccess('start', selectedCardId);
        onClose();
      } else if (currentMode === 'close') {
        const compiledParts: JobCardPartRequest[] = cardParts.map((p) => ({
          id: p.id && !String(p.id).startsWith('temp-') ? p.id : undefined,
          itemId: p.itemId || (p as any).id,
          partName: p.partName || (p as any).name || 'Spare Part',
          partCode: p.partCode || (p as any).code || undefined,
          quantity: Number(p.quantity || 1),
          uom: p.uom || 'Pcs',
          unitCost: p.unitCost ? Number(p.unitCost) : undefined,
          totalCost: (p.unitCost && p.quantity) ? Number(p.unitCost) * Number(p.quantity) : undefined,
          stockStatus: p.stockStatus || 'IN_STOCK',
          isProcurementHold: !!p.isProcurementHold,
          delayMinutes: p.delayMinutes || 0,
          remarks: p.remarks || undefined,
        }));

        const closePayload: JobCardCompletePayload = {
          diagnosis: closeDiagnosis.trim(),
          correctiveAction: closeCorrectiveAction.trim(),
          preventiveAction: closePreventiveAction.trim() || undefined,
          rootCauseCategoryId: closeRootCauseId || undefined,
          failureCategoryId: closeFailureId || undefined,
          remarks: closeRemarks.trim() || undefined,
          parts: compiledParts,
        };

        await apiService.post(`${JOB_CARD_BASE}/${selectedCardId}/complete`, closePayload);
        message.success(`Job Card ${jobCardNo} completed! Transitioned to Pending Verification.`);
        onSuccess('close', selectedCardId);
        onClose();
      } else if (currentMode === 'rework') {
        const compiledParts: JobCardPartRequest[] = cardParts.map((p) => ({
          id: p.id && !String(p.id).startsWith('temp-') ? p.id : undefined,
          itemId: p.itemId || (p as any).id,
          partName: p.partName || (p as any).name || 'Spare Part',
          partCode: p.partCode || (p as any).code || undefined,
          quantity: Number(p.quantity || 1),
          uom: p.uom || 'Pcs',
          unitCost: p.unitCost ? Number(p.unitCost) : undefined,
          totalCost: (p.unitCost && p.quantity) ? Number(p.unitCost) * Number(p.quantity) : undefined,
          stockStatus: p.stockStatus || 'IN_STOCK',
          isProcurementHold: !!p.isProcurementHold,
          delayMinutes: p.delayMinutes || 0,
          remarks: p.remarks || undefined,
        }));

        await apiService.post(`${JOB_CARD_BASE}/${selectedCardId}/submit-for-verification`, {
          diagnosis: closeDiagnosis.trim(),
          correctiveAction: closeCorrectiveAction.trim(),
          preventiveAction: closePreventiveAction.trim() || undefined,
          rootCauseCategoryId: closeRootCauseId || undefined,
          failureCategoryId: closeFailureId || undefined,
          remarks: reworkNotes.trim() || 'Rework completed by technician and resubmitted for verification.',
          parts: compiledParts,
        });
        message.success(`Job Card ${jobCardNo} reworked & resubmitted for supervisor verification!`);
        onSuccess('rework', selectedCardId);
        onClose();
      } else if (currentMode === 'parts') {
        const formattedRemarks = `Waiting for Spare Part: ${partName.trim()}${partCode.trim() ? ` [${partCode.trim()}]` : ''} - Qty: ${partQty} ${partUom}. Reason: ${partsReason.trim()}`;
        await apiService.post(`${JOB_CARD_BASE}/${selectedCardId}/waiting-for-parts`, {
          remarks: formattedRemarks,
        });
        try {
          await apiService.post(`${JOB_CARD_BASE}/${selectedCardId}/parts`, {
            partName: partName.trim(),
            partCode: partCode.trim() || undefined,
            quantity: partQty,
            uom: partUom,
            remarks: `Awaiting spare part - ${partsReason.trim()}`,
          });
        } catch {
          // non-blocking
        }
        message.warning(`Job Card ${jobCardNo} status set to WAITING FOR PARTS.`);
        onSuccess('parts', selectedCardId);
        onClose();
      } else if (currentMode === 'review') {
        if (reviewAction === 'verify') {
          await apiService.post(`${JOB_CARD_BASE}/${selectedCardId}/verify`, {
            remarks: reviewRemarks.trim() || 'Verified and approved by supervisor.',
          });
          message.success(`Job Card ${jobCardNo} verified and approved!`);
          onSuccess('verify', selectedCardId);
          onClose();
        } else {
          await apiService.post(`${JOB_CARD_BASE}/${selectedCardId}/reject`, {
            reason: rejectionReason.trim(),
          });
          message.info(`Job Card ${jobCardNo} returned to technician for rework.`);
          onSuccess('reject', selectedCardId);
          onClose();
        }
      } else if (currentMode === 'view') {
        onClose();
      }
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!selectedCardId) return;
    if (currentMode === 'view') {
      onClose();
      return;
    }

    let confirmTitle = 'Confirm Action';
    let confirmPrompt = `Are you sure you want to proceed with Job Card #${jobCardNo}?`;
    let okText = 'Yes, Proceed';
    let okColor = '#2563eb';

    if (currentMode === 'start') {
      confirmTitle = `Start Job Card #${jobCardNo}?`;
      confirmPrompt = `Are you sure you want to start Job Card #${jobCardNo}? Technicians will be assigned and the ticket will transition to IN PROGRESS.`;
      okText = 'Yes, Start Job';
      okColor = '#2563eb';
    } else if (currentMode === 'close') {
      confirmTitle = `Complete & Close Job Card #${jobCardNo}?`;
      confirmPrompt = `Are you sure you want to record repair completion? The job card will be submitted to the supervisor for verification.`;
      okText = 'Yes, Complete Job';
      okColor = '#059669';
    } else if (currentMode === 'rework') {
      confirmTitle = `Resubmit Job Card #${jobCardNo} for Review?`;
      confirmPrompt = `Are you sure you want to resubmit Job Card #${jobCardNo} with updated rework notes and corrective actions?`;
      okText = 'Yes, Resubmit for Review';
      okColor = '#ef4444';
    } else if (currentMode === 'parts') {
      confirmTitle = `Put Job Card #${jobCardNo} on Hold?`;
      confirmPrompt = `Are you sure you want to pause active repair and mark this job as WAITING FOR PARTS for "${partName}"?`;
      okText = 'Yes, Put on Hold';
      okColor = '#d97706';
    } else if (currentMode === 'review') {
      if (reviewAction === 'verify') {
        confirmTitle = `Approve & Verify Job Card #${jobCardNo}?`;
        confirmPrompt = `Are you sure you want to verify and close this job card? The machine downtime will be recorded as resolved.`;
        okText = 'Yes, Approve & Verify';
        okColor = '#059669';
      } else {
        confirmTitle = `Return Job Card #${jobCardNo} for Rework?`;
        confirmPrompt = `Are you sure you want to return Job Card #${jobCardNo} to the technician? Reason: "${rejectionReason.trim()}".`;
        okText = 'Yes, Return for Rework';
        okColor = '#dc2626';
      }
    }

    Modal.confirm({
      title: <span style={{ fontWeight: 700, fontSize: 16 }}>{confirmTitle}</span>,
      content: (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--theme-text-secondary, #64748b)' }}>
          <p style={{ margin: '0 0 8px 0', lineHeight: 1.5 }}>{confirmPrompt}</p>
          <div style={{ padding: '8px 12px', background: 'var(--theme-hover)', borderRadius: 6, fontSize: 12 }}>
            <strong>Machine:</strong> {machineName} ({machineCode}) &bull; <strong>Current Status:</strong> {currentStatus}
          </div>
        </div>
      ),
      okText,
      okButtonProps: {
        style: { backgroundColor: okColor, borderColor: okColor, color: '#ffffff', fontWeight: 700 },
      },
      cancelText: 'Cancel',
      onOk: executeSubmission,
    });
  };

  if (!open) return null;

  return (
    <>
      {/* Minimized Docked Pill at Bottom-Right */}
      {isMinimized && (
        <div
          className="erp-jc-docked-pill"
          onClick={() => setIsMinimized(false)}
          title={`Click to restore ${modeConfig.title}`}
        >
          <Badge status="processing" color="#3b82f6" />
          <span style={{ fontSize: 18, color: '#60a5fa' }}>{modeConfig.icon}</span>
          <div>
            <div className="erp-jc-docked-pill-title">
              {jobCardNo} &bull; {modeConfig.title}
            </div>
            <div className="erp-jc-docked-pill-sub">
              {machineName} ({machineCode})
            </div>
          </div>
          <Button size="small" type="primary" shape="round" style={{ fontWeight: 600 }}>
            Restore
          </Button>
        </div>
      )}

      {/* Main Draggable & Resizable Window Modal */}
      <Modal
        wrapClassName="erp-jc-modal-wrap"
        className={customSize && !isMaximized ? 'erp-jc-modal-custom-size' : undefined}
        open={!isMinimized}
        closable={false}
        footer={null}
        zIndex={1250}
        width={isMaximized ? '100%' : (customSize ? `${customSize.width}px` : '100%')}
        style={
          isMaximized
            ? { top: 6, padding: 0, margin: 0, maxWidth: '100%' }
            : {
                top: 14,
                transform: `translate(${modalPos.x}px, ${modalPos.y}px)`,
                maxWidth: customSize ? `${customSize.width}px` : '100%',
                width: customSize ? `${customSize.width}px` : undefined,
              }
        }
      >
        <div
          ref={modalContainerRef}
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: isMaximized ? '100vh' : (customSize ? `${customSize.height}px` : 'calc(86vh)'),
            maxHeight: isMaximized ? '100vh' : (customSize ? `${customSize.height}px` : '820px'),
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Draggable Header Bar */}
          <div className="erp-jc-modal-header" onMouseDown={handleDragStart}>
            <div className="erp-jc-header-title-group">
              <div className={modeConfig.iconClass}>{modeConfig.icon}</div>
              <div className="erp-jc-header-title-text">
                <h4>{modeConfig.title}</h4>
                <span>{modeConfig.sub}</span>
              </div>
            </div>

            {/* Window Controls */}
            <div className="erp-jc-header-ctrl-group" onMouseDown={(e) => e.stopPropagation()}>
              {/* WhatsApp Share Quick Button in Header */}
              <Tooltip title="Share Job Card summary on WhatsApp">
                <button
                  type="button"
                  className="erp-jc-header-ctrl-btn"
                  onClick={handleOpenWhatsApp}
                  style={{
                    padding: '0 12px',
                    gap: 6,
                    background: '#25D366',
                    color: '#ffffff',
                    border: '1px solid #1ebd59',
                    fontWeight: 700,
                  }}
                >
                  <WhatsAppOutlined style={{ fontSize: 14 }} />
                  <span style={{ fontSize: 11, fontWeight: 700 }}>WhatsApp Share</span>
                </button>
              </Tooltip>

              {!(currentMode === 'view' && viewLayout === 'detail') && (
                <Tooltip title={showPreviewPane ? 'Hide Live Detail Sheet' : 'Show Live Detail Sheet'}>
                  <button
                    type="button"
                    className="erp-jc-header-ctrl-btn"
                    onClick={() => setShowPreviewPane((v) => !v)}
                    style={{
                      padding: '0 10px',
                      gap: 6,
                      background: showPreviewPane ? 'rgba(37, 99, 235, 0.35)' : 'rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    {showPreviewPane ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                    <span style={{ fontSize: 11, fontWeight: 600 }}>
                      {showPreviewPane ? 'Hide Detail Sheet' : 'Show Detail Sheet'}
                    </span>
                  </button>
                </Tooltip>
              )}


              <Tooltip title={isMaximized ? 'Restore Window' : 'Maximize Window'}>
                <button
                  type="button"
                  className="erp-jc-header-ctrl-btn"
                  onClick={() => setIsMaximized((v) => !v)}
                >
                  {isMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                </button>
              </Tooltip>

              <Tooltip title="Minimize to floating pill">
                <button
                  type="button"
                  className="erp-jc-header-ctrl-btn"
                  onClick={() => setIsMinimized(true)}
                >
                  <MinusOutlined />
                </button>
              </Tooltip>

              <Tooltip title="Close">
                <button
                  type="button"
                  className="erp-jc-header-ctrl-btn erp-jc-header-ctrl-btn--close"
                  onClick={onClose}
                >
                  <CloseOutlined />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Mobile Tab Switcher */}
          <div
            className="erp-jc-mobile-tabs"
            style={{
              padding: '6px 14px',
              background: 'var(--theme-surface-alt, #0f172a)',
              borderBottom: '1px solid var(--theme-border, #1e293b)',
              display: 'none',
            }}
          >
            <Segmented
              block
              value={mobileTab}
              onChange={(val) => setMobileTab(val as 'form' | 'preview')}
              options={[
                { label: '📝 Action Form', value: 'form' },
                { label: '📋 Live Detail Sheet', value: 'preview' },
              ]}
            />
          </div>

          {/* Body Container (Two-Pane or Full Detail View) */}
          <div className="erp-jc-body-container">
            {currentMode === 'view' && viewLayout === 'detail' ? (
              <div className="erp-jc-detail-pane">
                {loadingCardDetails ? (
                  <div style={{ textAlign: 'center', padding: '80px 0' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 14, color: 'var(--theme-text-muted)' }}>
                      Loading comprehensive 360° job card inspection data...
                    </div>
                  </div>
                ) : (
                  <>
                    {/* ── 1. Modern 2027 Executive Hero Banner ── */}
                    <div className="erp-jc-view-hero">
                      <div className="erp-jc-view-hero-top">
                        <div className="erp-jc-view-hero-code">
                          <ToolOutlined style={{ color: 'var(--maint-info-fg)' }} />
                          <span>Job Card #{jobCardNo}</span>
                          <StatusBadge status={currentStatus} />
                          {hasProcurementHold && (
                            <span
                              className="erp-pill-badge"
                              style={{
                                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                color: '#fbbf24',
                                fontWeight: 700,
                                fontSize: 11,
                                letterSpacing: '0.04em',
                                padding: '2px 9px',
                                borderRadius: 9999,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <StopOutlined style={{ fontSize: 10, color: '#f59e0b' }} />
                              PROCUREMENT HOLD
                            </span>
                          )}
                          <StatusBadge status={priority} />
                          <Tag
                            color={
                              maintenanceType === 'BREAKDOWN'
                                ? 'red'
                                : maintenanceType === 'PREVENTIVE'
                                ? 'green'
                                : 'blue'
                            }
                            style={{ fontWeight: 700, margin: 0 }}
                          >
                            {label(maintenanceType)}
                          </Tag>
                        </div>

                        {/* Top Action Shortcut (if actionable) */}
                        <div>
                          {['OPEN', 'ASSIGNED'].includes(currentStatus) && (
                            <Button
                              type="primary"
                              icon={<PlayCircleOutlined />}
                              style={{ backgroundColor: '#2563eb', borderColor: '#2563eb', color: '#ffffff', fontWeight: 700, height: 36 }}
                              onClick={() => setCurrentMode('start')}
                            >
                              Start Job Now &rarr;
                            </Button>
                          )}
                          {currentStatus === 'IN_PROGRESS' && (
                            <Button
                              type="primary"
                              icon={<CheckCircleOutlined />}
                              style={{ backgroundColor: '#059669', borderColor: '#059669', color: '#ffffff', fontWeight: 700, height: 36 }}
                              onClick={() => setCurrentMode('close')}
                            >
                              Close &amp; Complete Job &rarr;
                            </Button>
                          )}
                          {['WAITING_FOR_PARTS', 'ON_HOLD'].includes(currentStatus) && (
                            <Button
                              type="primary"
                              icon={<PlayCircleOutlined />}
                              style={{ backgroundColor: '#d97706', borderColor: '#d97706', color: '#ffffff', fontWeight: 700, height: 36 }}
                              onClick={async () => {
                                try {
                                  await apiService.post(`${JOB_CARD_BASE}/${selectedCardId}/resume`);
                                  message.success('Job resumed!');
                                  onSuccess('resume', selectedCardId);
                                  onClose();
                                } catch (err) {
                                  message.error(errorText(err));
                                }
                              }}
                            >
                              Resume Active Work
                            </Button>
                          )}
                          {currentStatus === 'PENDING_VERIFICATION' && (
                            <Button
                              type="primary"
                              icon={<AuditOutlined />}
                              style={{ backgroundColor: '#7c3aed', borderColor: '#7c3aed', color: '#ffffff', fontWeight: 700, height: 36 }}
                              onClick={() => setCurrentMode('review')}
                            >
                              Verify &amp; Approve Job &rarr;
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Hierarchy Breadcrumb Strip */}
                      <div className="erp-jc-view-hero-meta">
                        <span><strong>Company:</strong> {companyName(activeCard?.company)}</span>
                        <span>&bull;</span>
                        <span><strong>Division:</strong> {activeCard?.division?.name || machine.division?.name || '—'}</span>
                        <span>&bull;</span>
                        <span><strong>Section:</strong> {activeCard?.section?.name || machine.section?.name || '—'}</span>
                        <span>&bull;</span>
                        <span><strong>Dept:</strong> {machine.department?.name || activeCard?.assignedDepartment?.name || '—'}</span>
                        <span>&bull;</span>
                        <span><strong>Team:</strong> {activeCard?.team?.name || '—'}</span>
                      </div>
                    </div>

                    {/* ── 2. Linear Workflow Stepper (Streamlined in Glass Card) ── */}
                    <div className="erp-jc-view-card">
                      <div className="erp-jc-view-card-header">
                        <Space>
                          <HistoryOutlined style={{ color: 'var(--maint-info-fg)' }} />
                          <span>Workflow Lifecycle Progress</span>
                        </Space>
                        <Tag color="geekblue" style={{ margin: 0, fontWeight: 700 }}>
                          {NEXT_ACTION_LABEL[currentStatus] || 'No pending action'}
                        </Tag>
                      </div>
                      <div className="erp-jc-stepper-scroll">
                        <Steps
                          size="small"
                          current={activeStepIndex}
                          items={sevenSteps}
                        />
                        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--theme-text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <span>
                            Current Stage: <strong style={{ color: 'var(--theme-text)' }}>{label(currentStatus)}</strong> — {STATUS_DESCRIPTION[currentStatus]}
                          </span>
                          {currentStatus === 'IN_PROGRESS' && (
                            <span style={{ color: 'var(--maint-danger-fg)', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span className="erp-jc-live-dot" /> Live Active Repair Duration: {liveWorkingDuration}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── 3. Fluid Key-Value Inspection Sheet (Side-by-Side) ── */}
                    <Row gutter={[16, 16]}>
                      {/* Left Column: Target Asset & Technical Fault Dossier */}
                      <Col xs={24} lg={12}>
                        <div className="erp-jc-view-card">
                          <div className="erp-jc-view-card-header">
                            <Space>
                              <ToolOutlined style={{ color: '#06b6d4' }} />
                              <span>Target Asset &amp; Hierarchy Specifications</span>
                            </Space>
                            <Tag color={machine.criticality === 'CRITICAL' ? 'red' : 'blue'} style={{ margin: 0, fontWeight: 700 }}>
                              {label(machine.criticality || 'MEDIUM')}
                            </Tag>
                          </div>

                          <div className="erp-jc-view-kv-list">
                            {/* 1. Division */}
                            <div className="erp-jc-view-kv-row">
                              <span className="erp-jc-view-kv-label">Division:</span>
                              <span className="erp-jc-view-kv-val">{divisionName}</span>
                            </div>
                            {/* 2. Department */}
                            <div className="erp-jc-view-kv-row">
                              <span className="erp-jc-view-kv-label">Department:</span>
                              <span className="erp-jc-view-kv-val">{departmentName}</span>
                            </div>
                            {/* 3. Machine Asset */}
                            <div className="erp-jc-view-kv-row">
                              <span className="erp-jc-view-kv-label">Machine Asset:</span>
                              <span className="erp-jc-view-kv-val">
                                <strong style={{ color: 'var(--maint-info-fg)' }}>{machineName}</strong>
                                <Tag style={{ marginLeft: 6 }}>{machineCode}</Tag>
                              </span>
                            </div>
                            {/* 4. Location */}
                            <div className="erp-jc-view-kv-row">
                              <span className="erp-jc-view-kv-label">Location:</span>
                              <span className="erp-jc-view-kv-val">
                                {machine.location || 'Factory Floor'} &bull; {sectionName}
                              </span>
                            </div>
                            {/* 5. Maintenance Team */}
                            <div className="erp-jc-view-kv-row">
                              <span className="erp-jc-view-kv-label">Maintenance Team:</span>
                              <span className="erp-jc-view-kv-val">
                                {activeCard?.team?.name ? `${activeCard.team.name}${activeCard.team.code ? ` (${activeCard.team.code})` : ''}` : '—'}
                              </span>
                            </div>
                            {/* 6. Asset Criticality */}
                            <div className="erp-jc-view-kv-row">
                              <span className="erp-jc-view-kv-label">Asset Criticality:</span>
                              <span className="erp-jc-view-kv-val">
                                <Tag color={machine.criticality === 'CRITICAL' ? 'red' : 'blue'}>
                                  {label(machine.criticality || 'MEDIUM')}
                                </Tag>
                              </span>
                            </div>
                          </div>

                          {/* Complaint Callout Box */}
                          <div style={{ marginTop: 4 }}>
                            <div className="erp-jc-view-complaint-box">
                              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--maint-danger-fg)', marginBottom: 4 }}>
                                Reported Fault &amp; Initial Complaint
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-text)', marginBottom: 6 }}>
                                "{activeCard?.complaint || complaint}"
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12, color: 'var(--theme-text-muted)' }}>
                                <span>Reported by: <strong style={{ color: 'var(--theme-text)' }}>{uName(activeCard?.requestedByUser)}</strong></span>
                                <span>&bull;</span>
                                <span>Category: <strong style={{ color: 'var(--theme-text)' }}>{activeCard?.complaintCategory?.name || '—'}</strong></span>
                                <span>&bull;</span>
                                <span>Root Cause: <strong style={{ color: 'var(--theme-text)' }}>{activeCard?.rootCauseCategory?.name || '—'}</strong></span>
                                <span>&bull;</span>
                                <span>Failure: <strong style={{ color: 'var(--theme-text)' }}>{activeCard?.failureCategory?.name || '—'}</strong></span>
                              </div>
                              {activeCard?.description && (
                                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--theme-text-secondary)' }}>
                                  {activeCard.description}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Technical Diagnostics (If available) */}
                          {(activeCard?.diagnosis || activeCard?.correctiveAction || activeCard?.preventiveAction) && (
                            <div style={{ marginTop: 4 }}>
                              <div className="erp-jc-view-solution-box">
                                {activeCard?.diagnosis && (
                                  <div style={{ marginBottom: 6 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>Diagnosis / Root Cause:</div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-text)' }}>{activeCard.diagnosis}</div>
                                  </div>
                                )}
                                {activeCard?.correctiveAction && (
                                  <div style={{ marginBottom: 6 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>Corrective Action Taken:</div>
                                    <div style={{ fontSize: 13, color: 'var(--theme-text)' }}>{activeCard.correctiveAction}</div>
                                  </div>
                                )}
                                {activeCard?.preventiveAction && (
                                  <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>Preventive Recommendation:</div>
                                    <div style={{ fontSize: 12, color: 'var(--theme-text-secondary)' }}>{activeCard.preventiveAction}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </Col>

                      {/* Right Column: Milestones & Actor Trail & Timings */}
                      <Col xs={24} lg={12}>
                        <div className="erp-jc-view-card">
                          <div className="erp-jc-view-card-header">
                            <Space>
                              <ClockCircleOutlined style={{ color: 'var(--maint-success-fg)' }} />
                              <span>Lifecycle Milestones &amp; Responsibilities Trail</span>
                            </Space>
                          </div>

                          <div className="erp-jc-view-kv-list">
                            <div className="erp-jc-view-kv-row">
                              <span className="erp-jc-view-kv-label">Requested (Logged):</span>
                              <span className="erp-jc-view-kv-val">
                                {fmtDt(activeCard?.requestedAt)}
                                <Tag color="default" style={{ marginLeft: 6 }}>by {uName(activeCard?.requestedByUser)}</Tag>
                              </span>
                            </div>
                            <div className="erp-jc-view-kv-row">
                              <span className="erp-jc-view-kv-label">Assigned Technicians:</span>
                              <span className="erp-jc-view-kv-val">
                                {cardTechnicians.length ? (
                                  cardTechnicians.map((t: any) => (
                                    <Tag key={t.id} color="blue" style={{ margin: '0 0 0 4px' }}>
                                      {techLabel(t)}
                                    </Tag>
                                  ))
                                ) : (
                                  <span style={{ color: 'var(--theme-text-muted)' }}>Unassigned</span>
                                )}
                              </span>
                            </div>
                            <div className="erp-jc-view-kv-row">
                              <span className="erp-jc-view-kv-label">Started Work:</span>
                              <span className="erp-jc-view-kv-val">
                                {fmtDt(activeCard?.startedAt)}
                                {activeCard?.startedByUser && (
                                  <Tag color="cyan" style={{ marginLeft: 6 }}>by {uName(activeCard.startedByUser)}</Tag>
                                )}
                              </span>
                            </div>
                            <div className="erp-jc-view-kv-row">
                              <span className="erp-jc-view-kv-label">Completed Work:</span>
                              <span className="erp-jc-view-kv-val">
                                {fmtDt(activeCard?.completedAt)}
                                {activeCard?.completedByUser && (
                                  <Tag color="green" style={{ marginLeft: 6 }}>by {uName(activeCard.completedByUser)}</Tag>
                                )}
                              </span>
                            </div>
                            <div className="erp-jc-view-kv-row">
                              <span className="erp-jc-view-kv-label">Verified By:</span>
                              <span className="erp-jc-view-kv-val">
                                {fmtDt(activeCard?.verifiedAt)}
                                {activeCard?.verifiedByUser && (
                                  <Tag color="purple" style={{ marginLeft: 6 }}>by {uName(activeCard.verifiedByUser)}</Tag>
                                )}
                              </span>
                            </div>
                            <div className="erp-jc-view-kv-row">
                              <span className="erp-jc-view-kv-label">Approved / Closed:</span>
                              <span className="erp-jc-view-kv-val">
                                {fmtDt(activeCard?.closedAt || activeCard?.approvedAt)}
                                {(activeCard?.closedByUser || activeCard?.approvedByUser) && (
                                  <Tag color="geekblue" style={{ marginLeft: 6 }}>by {uName(activeCard.closedByUser || activeCard.approvedByUser)}</Tag>
                                )}
                              </span>
                            </div>
                          </div>

                          {/* 6-Component Timing Breakdown Grid */}
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--theme-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <ClockCircleOutlined style={{ color: 'var(--maint-info-fg)' }} /> Lifecycle Timing Breakdown (6 Key Metrics)
                            </div>
                            <div className="erp-jc-timing-grid" style={{ marginBottom: 0 }}>
                              <div className="erp-jc-timing-box erp-jc-timing-box--wait">
                                <div className="erp-jc-timing-box-header" style={{ color: 'var(--maint-info-fg)' }}>
                                  <ClockCircleOutlined />
                                  <span>1. Response Wait</span>
                                </div>
                                <div className="erp-jc-timing-box-val" style={{ color: 'var(--maint-info-fg)' }}>
                                  {formatDuration(timingMetrics.waitMinutes)}
                                </div>
                                <div className="erp-jc-timing-box-sub">Open &rarr; Start</div>
                              </div>
                              <div className="erp-jc-timing-box erp-jc-timing-box--gross">
                                <div className="erp-jc-timing-box-header" style={{ color: '#d97706' }}>
                                  <ToolOutlined />
                                  <span>2. Gross Repair</span>
                                </div>
                                <div className="erp-jc-timing-box-val" style={{ color: '#d97706' }}>
                                  {formatDuration(timingMetrics.grossRepairMinutes)}
                                </div>
                                <div className="erp-jc-timing-box-sub">Start &rarr; Close</div>
                              </div>
                              <div className="erp-jc-timing-box erp-jc-timing-box--hold">
                                <div className="erp-jc-timing-box-header" style={{ color: timingMetrics.partsHoldMinutes > 0 ? '#ef4444' : '#64748b' }}>
                                  <StopOutlined />
                                  <span>3. Parts Delay</span>
                                </div>
                                <div className="erp-jc-timing-box-val" style={{ color: timingMetrics.partsHoldMinutes > 0 ? '#ef4444' : '#64748b' }}>
                                  {formatDuration(timingMetrics.partsHoldMinutes)}
                                </div>
                                <div className="erp-jc-timing-box-sub">Procurement Hold</div>
                              </div>
                              <div className="erp-jc-timing-box erp-jc-timing-box--highlight">
                                <div className="erp-jc-timing-box-header" style={{ color: 'var(--maint-success-fg)' }}>
                                  <CheckCircleOutlined />
                                  <span>4. Net Labor</span>
                                </div>
                                <div className="erp-jc-timing-box-val" style={{ color: 'var(--maint-success-fg)' }}>
                                  {formatDuration(timingMetrics.netRepairMinutes)}
                                </div>
                                <div className="erp-jc-timing-box-sub">Gross &minus; Parts Hold</div>
                              </div>
                              <div className="erp-jc-timing-box erp-jc-timing-box--downtime">
                                <div className="erp-jc-timing-box-header" style={{ color: 'var(--maint-danger-fg)' }}>
                                  <WarningOutlined />
                                  <span>5. Total Downtime</span>
                                </div>
                                <div className="erp-jc-timing-box-val" style={{ color: 'var(--maint-danger-fg)' }}>
                                  {formatDuration(timingMetrics.totalDowntimeMinutes)}
                                </div>
                                <div className="erp-jc-timing-box-sub">Equipment Downtime</div>
                              </div>
                              <div className="erp-jc-timing-box erp-jc-timing-box--lifecycle">
                                <div className="erp-jc-timing-box-header" style={{ color: '#8b5cf6' }}>
                                  <HistoryOutlined />
                                  <span>6. Open &rarr; Close</span>
                                </div>
                                <div className="erp-jc-timing-box-val" style={{ color: '#8b5cf6' }}>
                                  {formatDuration(timingMetrics.openToCloseMinutes)}
                                </div>
                                <div className="erp-jc-timing-box-sub">Ticket Lifecycle</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Col>
                    </Row>

                    {/* ── 4. Comprehensive 6-Tab History & Operations Dock ── */}
                    <div className="erp-jc-view-card">
                      <div className="erp-jc-view-card-header">
                        <Space>
                          <BuildOutlined style={{ color: '#8b5cf6' }} />
                          <span>Comprehensive Technical Logs &amp; Operations Audit Trail (6 Modules)</span>
                        </Space>
                      </div>

                      <Tabs
                            defaultActiveKey="timeline"
                            items={[
                              {
                                key: 'timeline',
                                label: (
                                  <Space>
                                    <HistoryOutlined />
                                    <span>Activity Timeline</span>
                                  </Space>
                                ),
                                children: (() => {
                                  const hist = (cardHistory || []).slice().sort((a: any, b: any) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
                                  if (!hist.length) return <Empty description="No status history recorded yet" />;
                                  return (
                                    <div style={{ padding: '12px 6px' }}>
                                      <Timeline
                                        items={hist.map((h: any, i: number) => {
                                          const ts = h.changedAt ? new Date(h.changedAt).getTime() : null;
                                          const nextTs = i < hist.length - 1 ? (hist[i + 1].changedAt ? new Date(hist[i + 1].changedAt).getTime() : null) : null;
                                          const isLast = i === hist.length - 1;
                                          const terminal = ['APPROVED', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(h.toStatus);
                                          const isActive = isLast && !terminal;
                                          const startTs = ts;
                                          const endTs = isActive ? Date.now() : nextTs;
                                          let dur = '';
                                          if (startTs !== null && endTs !== null && endTs >= startTs) {
                                            const mins = Math.round((endTs - startTs) / 60000);
                                            dur = formatDuration(mins);
                                          }
                                          return {
                                            color: h.toStatus === 'REJECTED' || h.toStatus === 'CANCELLED' ? 'red' : h.toStatus === 'APPROVED' ? 'green' : 'blue',
                                            children: (
                                              <div style={{ marginBottom: 12 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                                                  <Typography.Text strong style={{ color: 'var(--theme-text, #ffffff)' }}>
                                                    {label(h.fromStatus)} &rarr; {label(h.toStatus)}
                                                  </Typography.Text>
                                                  {isActive ? (
                                                    <Tag color="green" style={{ marginInlineEnd: 0 }}>Active (now)</Tag>
                                                  ) : dur ? (
                                                    <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>Duration: {dur}</Tag>
                                                  ) : null}
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4, fontSize: 12 }}>
                                                  <span>
                                                    <Typography.Text type="secondary">Start:</Typography.Text>{' '}
                                                    {h.changedAt ? dayjs(h.changedAt).format('DD/MM/YYYY, hh:mm:ss a') : '—'}
                                                  </span>
                                                  <span>
                                                    <Typography.Text type="secondary">End:</Typography.Text>{' '}
                                                    {isActive ? (
                                                      <Typography.Text strong style={{ color: 'var(--theme-text, #ffffff)' }}>Active (now)</Typography.Text>
                                                    ) : nextTs ? (
                                                      dayjs(nextTs).format('DD/MM/YYYY, hh:mm:ss a')
                                                    ) : terminal ? (
                                                      dayjs(h.changedAt).format('DD/MM/YYYY, hh:mm:ss a')
                                                    ) : '—'}
                                                  </span>
                                                  <span>
                                                    <Typography.Text type="secondary">Duration:</Typography.Text>{' '}
                                                    <Typography.Text strong style={{ color: 'var(--theme-text, #ffffff)' }}>{dur || '—'}</Typography.Text>
                                                  </span>
                                                </div>
                                                {h.remarks && (
                                                  <div style={{ marginTop: 4 }}>
                                                    <Typography.Text type="secondary" italic>Notes: {h.remarks}</Typography.Text>
                                                  </div>
                                                )}
                                                <div style={{ marginTop: 2 }}>
                                                  <Typography.Text type="secondary">by {uName(h.changedByUser || h.actor)}</Typography.Text>
                                                </div>
                                              </div>
                                            ),
                                          };
                                        })}
                                      />
                                    </div>
                                  );
                                })(),
                              },
                              {
                                key: 'parts',
                                label: (
                                  <Space>
                                    <BuildOutlined />
                                    <span>Parts &amp; Consumables ({cardParts.length})</span>
                                  </Space>
                                ),
                                children: (
                                  <div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                                      <Button
                                        size="small"
                                        type="link"
                                        style={{ fontSize: 11, color: 'var(--maint-info-fg)' }}
                                        onClick={() => setShowAddPartInline(!showAddPartInline)}
                                      >
                                        {showAddPartInline ? 'Hide Advanced Hierarchy Filters' : '🔍 Advanced Hierarchy Filters'}
                                      </Button>
                                    </div>
                                    {showAddPartInline && renderAddPartInlineForm()}
                                    {renderPartsRequestGrid()}
                                  </div>
                                ),
                              },
                              {
                                key: 'logs',
                                label: (
                                  <Space>
                                    <FileTextOutlined />
                                    <span>Work Logs ({cardLogs.length})</span>
                                  </Space>
                                ),
                                children: (
                                  <Table
                                    size="small"
                                    rowKey="id"
                                    pagination={false}
                                    dataSource={cardLogs}
                                    locale={{ emptyText: <Empty description="No work logs recorded" /> }}
                                    columns={[
                                      { title: 'Work Done', dataIndex: 'workDescription', key: 'work' },
                                      { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', render: (v) => v || '—' },
                                      {
                                        title: 'Created At',
                                        dataIndex: 'createdAt',
                                        key: 'createdAt',
                                        width: 170,
                                        render: (v: string) => (v ? dayjs(v).format('DD/MM/YYYY, hh:mm a') : '—'),
                                      },
                                    ]}
                                  />
                                ),
                              },
                              {
                                key: 'attachments',
                                label: (
                                  <Space>
                                    <PaperClipOutlined />
                                    <span>Attachments ({cardAttachments.length})</span>
                                  </Space>
                                ),
                                children: (
                                  <Table
                                    size="small"
                                    rowKey="id"
                                    pagination={false}
                                    dataSource={cardAttachments}
                                    locale={{ emptyText: <Empty description="No attachments found" /> }}
                                    columns={[
                                      { title: 'File Name', dataIndex: 'fileName', key: 'file' },
                                      { title: 'Description', dataIndex: 'description', key: 'desc', render: (v) => v || '—' },
                                      {
                                        title: 'Uploaded At',
                                        dataIndex: 'createdAt',
                                        key: 'uploaded',
                                        width: 170,
                                        render: (v: string) => (v ? dayjs(v).format('DD/MM/YYYY, hh:mm a') : '—'),
                                      },
                                    ]}
                                  />
                                ),
                              },
                              {
                                key: 'technicians',
                                label: (
                                  <Space>
                                    <TeamOutlined />
                                    <span>Technicians ({cardTechnicians.length})</span>
                                  </Space>
                                ),
                                children: (
                                  <Table
                                    size="small"
                                    rowKey="id"
                                    pagination={false}
                                    dataSource={cardTechnicians}
                                    locale={{ emptyText: <Empty description="No technicians assigned yet" /> }}
                                    columns={[
                                      { title: 'Technician', render: (_: any, r: any) => techLabel(r) },
                                      {
                                        title: 'ERP User',
                                        render: (_: any, r: any) =>
                                          r.technicianUserId ? (
                                            <Tag color="green">Linked ({uName(r.technicianUser)})</Tag>
                                          ) : (
                                            <Tag color="default">Not Linked</Tag>
                                          ),
                                      },
                                      { title: 'Skill', render: (_: any, r: any) => r.technician?.skill || '—' },
                                      { title: 'Shift', render: (_: any, r: any) => r.technician?.shift || '—' },
                                      {
                                        title: 'Status',
                                        render: (_: any, r: any) =>
                                          r.technician?.status ? (
                                            <Tag color={r.technician.status === 'ACTIVE' ? 'green' : 'default'}>
                                              {r.technician.status}
                                            </Tag>
                                          ) : (
                                            '—'
                                          ),
                                      },
                                      {
                                        title: 'Role',
                                        dataIndex: 'role',
                                        render: (v: string) => (v ? <Tag color={v === 'PRIMARY' ? 'blue' : 'default'}>{v}</Tag> : '—'),
                                      },
                                      {
                                        title: 'Assigned At',
                                        dataIndex: 'assignedAt',
                                        render: (v: string) => (v ? dayjs(v).format('DD/MM/YYYY, hh:mm a') : '—'),
                                      },
                                      { title: 'Remarks', dataIndex: 'remarks', render: (v) => v || '—' },
                                    ]}
                                  />
                                ),
                              },
                              {
                                key: 'machine',
                                label: (
                                  <Space>
                                    <ToolOutlined />
                                    <span>Machine Profile &amp; Stats</span>
                                  </Space>
                                ),
                                children: (
                                  <div>
                                    <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} style={{ marginBottom: 14 }}>
                                      <Descriptions.Item label="Machine Asset"><strong>{machineName}</strong></Descriptions.Item>
                                      <Descriptions.Item label="Machine Code"><code>{machineCode}</code></Descriptions.Item>
                                      <Descriptions.Item label="Criticality">
                                        <Tag color={machine.criticality === 'CRITICAL' ? 'red' : 'blue'}>
                                          {label(machine.criticality || 'MEDIUM')}
                                        </Tag>
                                      </Descriptions.Item>
                                      <Descriptions.Item label="Division">{divisionName}</Descriptions.Item>
                                      <Descriptions.Item label="Section">{sectionName}</Descriptions.Item>
                                      <Descriptions.Item label="Department">{departmentName}</Descriptions.Item>
                                      <Descriptions.Item label="Model">{machine.model || 'Standard Production Model'}</Descriptions.Item>
                                      <Descriptions.Item label="Serial No">{machine.serialNumber || '—'}</Descriptions.Item>
                                      <Descriptions.Item label="Location">{machine.location || 'Factory Floor'}</Descriptions.Item>
                                    </Descriptions>

                                    {machineStats && (
                                      <div
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: 'repeat(4, 1fr)',
                                          gap: 8,
                                          marginBottom: 12,
                                        }}
                                      >
                                        <div style={{ background: 'var(--theme-surface-alt, #18223c)', padding: '8px 10px', borderRadius: 6, textAlign: 'center' }}>
                                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Total Jobs</div>
                                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--maint-info-fg)' }}>{machineStats.total || 0}</div>
                                        </div>
                                        <div style={{ background: 'var(--theme-surface-alt, #18223c)', padding: '8px 10px', borderRadius: 6, textAlign: 'center' }}>
                                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Downtime</div>
                                          <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>{machineStats.totalDowntimeMinutes || 0}m</div>
                                        </div>
                                        <div style={{ background: 'var(--theme-surface-alt, #18223c)', padding: '8px 10px', borderRadius: 6, textAlign: 'center' }}>
                                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>MTBF</div>
                                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--maint-success-fg)' }}>{machineStats.mtbfHours || 0}h</div>
                                        </div>
                                        <div style={{ background: 'var(--theme-surface-alt, #18223c)', padding: '8px 10px', borderRadius: 6, textAlign: 'center' }}>
                                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Breakdowns</div>
                                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--maint-danger-fg)' }}>{machineStats.byType?.breakdown || 0}</div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ),
                              },
                            ]}
                          />
                        </div>
                      </>
                )}
              </div>
            ) : (
              <>
                {/* Left Form Pane */}
                <div
                  className="erp-jc-form-pane"
                  style={{
                    display: mobileTab === 'preview' ? undefined : 'block',
                  }}
                >

              {loadingCardDetails ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <Spin size="large" />
                  <div style={{ marginTop: 12, color: 'var(--theme-text-muted)' }}>
                    Loading job card & asset history...
                  </div>
                </div>
              ) : (
                <>
                  {/* Section 1: Ticket Selection / Lock */}
                  <div className="erp-jc-form-section">
                    <div className="erp-jc-section-header">
                      <span className="erp-jc-section-badge">1</span>
                      <h5 className="erp-jc-section-title">Selected Job Card & Machine Asset</h5>
                    </div>

                    {/* If open cards dropdown is available and mode is start without fixed card */}
                    {currentMode === 'start' && !propCard && allOpenCards.length > 0 ? (
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                          Select Open Job Card <span style={{ color: 'var(--maint-danger-fg)' }}>*</span>:
                        </label>
                        <Select
                          showSearch
                          style={{ width: '100%' }}
                          placeholder="Search open tickets..."
                          value={selectedCardId || undefined}
                          onChange={(val) => {
                            setSelectedCardId(val);
                            const found = allOpenCards.find((c) => c.id === val);
                            if (found) setActiveCard(found);
                          }}
                          optionFilterProp="label"
                          options={allOpenCards.map((c) => {
                            const m = c.machine || {};
                            return {
                              value: c.id,
                              label: `${c.jobCardNo || c.id} — ${m.name || m.machineName || 'Asset'} (${m.machineCode || m.code || '—'}) — ${c.complaint || 'No complaint'}`,
                            };
                          })}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: 'var(--theme-surface-alt, #18223c)',
                          borderRadius: 8,
                          border: '1px solid var(--theme-border, #2a385f)',
                        }}
                      >
                        <Space direction="vertical" size={2}>
                          <Space>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--theme-text, #ffffff)' }}>
                              {jobCardNo}
                            </span>
                            <StatusBadge status={currentStatus} />
                          </Space>
                          <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)' }}>
                            {machineName} &bull; Code: {machineCode}
                          </span>
                        </Space>
                        <Tag icon={<LockOutlined />} color="default">
                          LOCKED
                        </Tag>
                      </div>
                    )}
                  </div>

                  {/* ── MODE: START ── */}
                  {currentMode === 'start' && (
                    <>
                      {/* Ticket Waiting Time Strip */}
                      <div className="erp-jc-timing-strip">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ClockCircleOutlined style={{ fontSize: 18, color: timingMetrics.waitMinutes > 120 ? '#ef4444' : '#0284c7' }} />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-text, #ffffff)' }}>
                                Time Elapsed Since Opened: <span style={{ color: timingMetrics.waitMinutes > 120 ? '#f87171' : 'var(--maint-info-fg)', fontSize: 14 }}>{formatDuration(timingMetrics.waitMinutes)}</span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>
                                Ticket Logged: {activeCard?.requestedAt ? dayjs(activeCard.requestedAt).format('DD MMM YYYY, hh:mm A') : '—'}
                              </div>
                            </div>
                          </div>
                          {timingMetrics.waitMinutes >= 120 ? (
                            <Tag color="error" style={{ margin: 0, fontWeight: 600 }}>
                              Delayed Response (&gt;2h)
                            </Tag>
                          ) : (
                            <Tag color="blue" style={{ margin: 0, fontWeight: 600 }}>
                              Ready to Start
                            </Tag>
                          )}
                        </div>
                      </div>

                      {/* Section 2: Technician Assignment */}
                      <div className="erp-jc-form-section">
                        <div className="erp-jc-section-header">
                          <span className="erp-jc-section-badge">2</span>
                          <h5 className="erp-jc-section-title">Technicians Multi-Selection</h5>
                          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>
                            {selectedTechIds.length ? `${selectedTechIds.length} technician(s) selected` : 'Tick 1 or more'}
                          </span>
                        </div>

                        <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                          Select Technicians (Tick 1 or more) <span style={{ color: 'var(--maint-danger-fg)' }}>*</span>:
                        </label>
                        <Select
                          mode="multiple"
                          showSearch
                          allowClear
                          style={{ width: '100%' }}
                          placeholder="Tick / select technician(s)..."
                          value={selectedTechIds}
                          onChange={(vals: string[]) => setSelectedTechIds(vals)}
                          optionFilterProp="label"
                          maxTagCount="responsive"
                          options={technicians.map((t: any) => {
                            const empCode = t.employeeId ? ` (${t.employeeId})` : '';
                            const skill = t.skill ? ` — ${t.skill}` : '';
                            const dept = t.department ? ` [${t.department}]` : '';
                            return {
                              value: t.id,
                              label: `${t.technicianName || t.name}${empCode}${skill}${dept}`,
                            };
                          })}
                        />
                        {!selectedTechIds.length && (
                          <div style={{ color: 'var(--maint-danger-fg)', fontSize: 12, marginTop: 4 }}>
                            * Please select at least one technician to start the job card.
                          </div>
                        )}
                      </div>

                      {/* Section 3: Starting Remarks */}
                      <div className="erp-jc-form-section">
                        <div className="erp-jc-section-header">
                          <span className="erp-jc-section-badge">3</span>
                          <h5 className="erp-jc-section-title">Starting Remarks & Safety Observation</h5>
                        </div>

                        {/* Quick Chips */}
                        <div className="erp-jc-quick-chips-wrapper">
                          <div className="erp-jc-quick-chips-title">
                            <ThunderboltOutlined style={{ color: '#f59e0b' }} />
                            Quick Remarks Shortcuts:
                          </div>
                          <div className="erp-jc-chips-scroll">
                            {START_QUICK_CHIPS.map((chip, idx) => (
                              <div
                                key={idx}
                                className="erp-jc-quick-chip"
                                onClick={() =>
                                  setStartingNotes((prev) => (prev ? `${prev}\n${chip}` : chip))
                                }
                              >
                                {chip}
                              </div>
                            ))}
                          </div>
                        </div>

                        <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                          Starting Remarks / Notes <span style={{ color: 'var(--maint-danger-fg)' }}>*</span>:
                        </label>
                        <Input.TextArea
                          rows={3}
                          placeholder="Enter initial repair observations, safety checks, or technical notes..."
                          value={startingNotes}
                          onChange={(e) => setStartingNotes(e.target.value)}
                        />
                        {!startingNotes.trim() && (
                          <div style={{ color: 'var(--maint-danger-fg)', fontSize: 12, marginTop: 4 }}>
                            * Starting remarks are required before starting the job card.
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* ── MODE: CLOSE ── */}
                  {currentMode === 'close' && (
                    <>
                      {/* 4-Component Timing Breakdown Strip */}
                      <div className="erp-jc-timing-grid">
                        <div className="erp-jc-timing-box erp-jc-timing-box--wait">
                          <div className="erp-jc-timing-box-header" style={{ color: 'var(--maint-info-fg)' }}>
                            <ClockCircleOutlined />
                            <span>1. Response Wait</span>
                          </div>
                          <div className="erp-jc-timing-box-val" style={{ color: 'var(--maint-info-fg)' }}>{formatDuration(timingMetrics.waitMinutes)}</div>
                          <div className="erp-jc-timing-box-sub">Open &rarr; Start</div>
                        </div>

                        <div className="erp-jc-timing-box erp-jc-timing-box--gross">
                          <div className="erp-jc-timing-box-header" style={{ color: '#d97706' }}>
                            <ToolOutlined />
                            <span>2. Gross Repair</span>
                          </div>
                          <div className="erp-jc-timing-box-val" style={{ color: '#d97706' }}>{formatDuration(timingMetrics.grossRepairMinutes)}</div>
                          <div className="erp-jc-timing-box-sub">Total Clock Time</div>
                        </div>

                        <div className="erp-jc-timing-box erp-jc-timing-box--hold">
                          <div className="erp-jc-timing-box-header" style={{ color: timingMetrics.partsHoldMinutes > 0 ? '#ef4444' : '#64748b' }}>
                            <StopOutlined />
                            <span>3. Parts Delay</span>
                          </div>
                          <div className="erp-jc-timing-box-val" style={{ color: timingMetrics.partsHoldMinutes > 0 ? '#ef4444' : undefined }}>
                            {formatDuration(timingMetrics.partsHoldMinutes)}
                          </div>
                          <div className="erp-jc-timing-box-sub">Procurement Hold</div>
                        </div>

                        <div className="erp-jc-timing-box erp-jc-timing-box--highlight">
                          <div className="erp-jc-timing-box-header" style={{ color: 'var(--maint-success-fg)' }}>
                            <ThunderboltOutlined />
                            <span>4. Net Labor Time</span>
                          </div>
                          <div className="erp-jc-timing-box-val" style={{ color: 'var(--maint-success-fg)' }}>
                            {formatDuration(timingMetrics.netRepairMinutes)}
                          </div>
                          <div className="erp-jc-timing-box-sub">Gross &minus; Parts Hold</div>
                        </div>

                        <div className="erp-jc-timing-box erp-jc-timing-box--downtime">
                          <div className="erp-jc-timing-box-header" style={{ color: 'var(--maint-danger-fg)' }}>
                            <WarningOutlined />
                            <span>5. Total Downtime</span>
                          </div>
                          <div className="erp-jc-timing-box-val" style={{ color: 'var(--maint-danger-fg)' }}>
                            {formatDuration(timingMetrics.totalDowntimeMinutes)}
                          </div>
                          <div className="erp-jc-timing-box-sub">Equipment Downtime</div>
                        </div>

                        <div className="erp-jc-timing-box erp-jc-timing-box--lifecycle">
                          <div className="erp-jc-timing-box-header" style={{ color: '#8b5cf6' }}>
                            <HistoryOutlined />
                            <span>6. Open &rarr; Close</span>
                          </div>
                          <div className="erp-jc-timing-box-val" style={{ color: '#8b5cf6' }}>
                            {formatDuration(timingMetrics.openToCloseMinutes)}
                          </div>
                          <div className="erp-jc-timing-box-sub">Ticket Lifecycle</div>
                        </div>
                      </div>

                      {/* Section 2: Diagnosis & Corrective Action */}
                      <div className="erp-jc-form-section">
                        <div className="erp-jc-section-header">
                          <span className="erp-jc-section-badge">2</span>
                          <h5 className="erp-jc-section-title">Root Cause Diagnosis & Corrective Action</h5>
                        </div>

                        {/* Diagnosis Quick Chips */}
                        <div className="erp-jc-quick-chips-wrapper">
                          <div className="erp-jc-quick-chips-title">
                            <ThunderboltOutlined style={{ color: '#f59e0b' }} />
                            1-Tap Diagnosis Shortcuts:
                          </div>
                          <div className="erp-jc-chips-scroll">
                            {CLOSE_DIAGNOSIS_CHIPS.map((chip, idx) => (
                              <div
                                key={idx}
                                className="erp-jc-quick-chip"
                                onClick={() =>
                                  setCloseDiagnosis((prev) => (prev ? `${prev}; ${chip}` : chip))
                                }
                              >
                                {chip}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                            Diagnosis / Fault Identified <span style={{ color: 'var(--maint-danger-fg)' }}>*</span>:
                          </label>
                          <Input.TextArea
                            rows={3}
                            placeholder="Detail what was diagnosed, broken parts, electrical failure..."
                            value={closeDiagnosis}
                            onChange={(e) => setCloseDiagnosis(e.target.value)}
                          />
                        </div>

                        {/* Corrective Action Quick Chips */}
                        <div className="erp-jc-quick-chips-wrapper">
                          <div className="erp-jc-quick-chips-title">
                            <ThunderboltOutlined style={{ color: 'var(--maint-success-fg)' }} />
                            1-Tap Corrective Action Shortcuts:
                          </div>
                          <div className="erp-jc-chips-scroll">
                            {CLOSE_CORRECTIVE_CHIPS.map((chip, idx) => (
                              <div
                                key={idx}
                                className="erp-jc-quick-chip"
                                onClick={() =>
                                  setCloseCorrectiveAction((prev) => (prev ? `${prev}\n${chip}` : chip))
                                }
                              >
                                {chip}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                            Corrective Action Taken <span style={{ color: 'var(--maint-danger-fg)' }}>*</span>:
                          </label>
                          <Input.TextArea
                            rows={3}
                            placeholder="Detail repair steps taken, parts replaced, adjustments made..."
                            value={closeCorrectiveAction}
                            onChange={(e) => setCloseCorrectiveAction(e.target.value)}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                            Preventive Action Recommendation:
                          </label>
                          <Input.TextArea
                            rows={2}
                            placeholder="Recommended PM checks, greasing intervals, operator vigilance..."
                            value={closePreventiveAction}
                            onChange={(e) => setClosePreventiveAction(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Section 3: Embedded Parts / Items Request Grid */}
                      <div className="erp-jc-form-section">
                        <div className="erp-jc-section-header" style={{ justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="erp-jc-section-badge">3</span>
                            <h5 className="erp-jc-section-title">
                              Parts &amp; Items Request Grid ({cardParts.length})
                            </h5>
                          </div>
                          <Button
                            size="small"
                            type="link"
                            style={{ fontSize: 11, color: 'var(--maint-info-fg)' }}
                            onClick={() => setShowAddPartInline(!showAddPartInline)}
                          >
                            {showAddPartInline ? 'Hide Advanced Hierarchy Filters' : '🔍 Advanced Hierarchy Filters'}
                          </Button>
                        </div>

                        {showAddPartInline && renderAddPartInlineForm()}
                        {renderPartsRequestGrid()}
                      </div>

                      {/* Section 4: Categories & Completion Remarks */}
                      <div className="erp-jc-form-section">
                        <div className="erp-jc-section-header">
                          <span className="erp-jc-section-badge">4</span>
                          <h5 className="erp-jc-section-title">Classification &amp; Remarks</h5>
                        </div>

                        <Row gutter={12} style={{ marginBottom: 14 }}>
                          <Col span={12}>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                              Root Cause Category:
                            </label>
                            <Select
                              allowClear
                              style={{ width: '100%' }}
                              placeholder="Select root cause category..."
                              value={closeRootCauseId || undefined}
                              onChange={(val) => setCloseRootCauseId(val)}
                              options={rootCategories.map((c) => ({
                                value: c.id,
                                label: c.name || c.code,
                              }))}
                            />
                          </Col>
                          <Col span={12}>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                              Failure Mode Category:
                            </label>
                            <Select
                              allowClear
                              style={{ width: '100%' }}
                              placeholder="Select failure category..."
                              value={closeFailureId || undefined}
                              onChange={(val) => setCloseFailureId(val)}
                              options={failureCategories.map((c) => ({
                                value: c.id,
                                label: c.name || c.code,
                              }))}
                            />
                          </Col>
                        </Row>

                        <div>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                            Completion Notes:
                          </label>
                          <Input.TextArea
                            rows={2}
                            placeholder="Final handover notes or technician sign-off comments..."
                            value={closeRemarks}
                            onChange={(e) => setCloseRemarks(e.target.value)}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── MODE: REWORK (RETURNED FOR REWORK) ── */}
                  {currentMode === 'rework' && (
                    <>
                      {/* Supervisor Rejection Reason Banner */}
                      {(() => {
                        const rej = (cardHistory || []).slice().reverse().find((h: any) => h.toStatus === 'REJECTED');
                        const supervisorRemarks = rej?.remarks || activeCard?.remarks || 'Supervisor requested further corrective action or re-inspection.';
                        return (
                          <div
                            style={{
                              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(185, 28, 28, 0.08) 100%)',
                              border: '1px solid #ef4444',
                              borderRadius: 10,
                              padding: '14px 16px',
                              marginBottom: 16,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--maint-danger-fg)', fontWeight: 700, fontSize: 14 }}>
                                <RollbackOutlined style={{ fontSize: 16 }} />
                                <span>Supervisor Return &amp; Rework Instructions:</span>
                              </div>
                              <Tag color="error" style={{ fontWeight: 700, margin: 0 }}>NEEDS REWORK</Tag>
                            </div>
                            <div
                              style={{
                                marginTop: 10,
                                fontSize: 13,
                                color: 'var(--theme-text, #ffffff)',
                                lineHeight: 1.5,
                                background: 'var(--maint-danger-bg)',
                                padding: '10px 14px',
                                borderRadius: 6,
                                borderLeft: '3px solid var(--maint-danger-fg)',
                              }}
                            >
                              <strong>Reason for Return:</strong> {supervisorRemarks}
                            </div>
                            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', display: 'flex', gap: 16 }}>
                              <span>Returned At: {rej?.changedAt ? dayjs(rej.changedAt).format('DD MMM YYYY, hh:mm A') : '—'}</span>
                              <span>Supervisor: {uName(rej?.changedByUser || rej?.actor)}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* 6-Component Timing Breakdown Strip */}
                      <div className="erp-jc-timing-grid">
                        <div className="erp-jc-timing-box erp-jc-timing-box--wait">
                          <div className="erp-jc-timing-box-header" style={{ color: 'var(--maint-info-fg)' }}>
                            <ClockCircleOutlined />
                            <span>1. Response Wait</span>
                          </div>
                          <div className="erp-jc-timing-box-val" style={{ color: 'var(--maint-info-fg)' }}>{formatDuration(timingMetrics.waitMinutes)}</div>
                          <div className="erp-jc-timing-box-sub">Open &rarr; Start</div>
                        </div>

                        <div className="erp-jc-timing-box erp-jc-timing-box--gross">
                          <div className="erp-jc-timing-box-header" style={{ color: '#d97706' }}>
                            <ToolOutlined />
                            <span>2. Gross Repair</span>
                          </div>
                          <div className="erp-jc-timing-box-val" style={{ color: '#d97706' }}>{formatDuration(timingMetrics.grossRepairMinutes)}</div>
                          <div className="erp-jc-timing-box-sub">Total Clock Time</div>
                        </div>

                        <div className="erp-jc-timing-box erp-jc-timing-box--hold">
                          <div className="erp-jc-timing-box-header" style={{ color: timingMetrics.partsHoldMinutes > 0 ? '#ef4444' : '#64748b' }}>
                            <StopOutlined />
                            <span>3. Parts Delay</span>
                          </div>
                          <div className="erp-jc-timing-box-val" style={{ color: timingMetrics.partsHoldMinutes > 0 ? '#ef4444' : undefined }}>
                            {formatDuration(timingMetrics.partsHoldMinutes)}
                          </div>
                          <div className="erp-jc-timing-box-sub">Procurement Hold</div>
                        </div>

                        <div className="erp-jc-timing-box erp-jc-timing-box--highlight">
                          <div className="erp-jc-timing-box-header" style={{ color: 'var(--maint-success-fg)' }}>
                            <ThunderboltOutlined />
                            <span>4. Net Labor Time</span>
                          </div>
                          <div className="erp-jc-timing-box-val" style={{ color: 'var(--maint-success-fg)' }}>
                            {formatDuration(timingMetrics.netRepairMinutes)}
                          </div>
                          <div className="erp-jc-timing-box-sub">Gross &minus; Parts Hold</div>
                        </div>

                        <div className="erp-jc-timing-box erp-jc-timing-box--downtime">
                          <div className="erp-jc-timing-box-header" style={{ color: 'var(--maint-danger-fg)' }}>
                            <WarningOutlined />
                            <span>5. Total Downtime</span>
                          </div>
                          <div className="erp-jc-timing-box-val" style={{ color: 'var(--maint-danger-fg)' }}>
                            {formatDuration(timingMetrics.totalDowntimeMinutes)}
                          </div>
                          <div className="erp-jc-timing-box-sub">Equipment Downtime</div>
                        </div>

                        <div className="erp-jc-timing-box erp-jc-timing-box--lifecycle">
                          <div className="erp-jc-timing-box-header" style={{ color: '#8b5cf6' }}>
                            <HistoryOutlined />
                            <span>6. Open &rarr; Close</span>
                          </div>
                          <div className="erp-jc-timing-box-val" style={{ color: '#8b5cf6' }}>
                            {formatDuration(timingMetrics.openToCloseMinutes)}
                          </div>
                          <div className="erp-jc-timing-box-sub">Ticket Lifecycle</div>
                        </div>
                      </div>

                      {/* Section 2: Revised Diagnosis & Corrective Actions */}
                      <div className="erp-jc-form-section">
                        <div className="erp-jc-section-header">
                          <span className="erp-jc-section-badge">2</span>
                          <h5 className="erp-jc-section-title">Revised Diagnosis &amp; Corrective Actions Taken</h5>
                        </div>

                        {/* Diagnosis Quick Chips */}
                        <div className="erp-jc-quick-chips-wrapper">
                          <div className="erp-jc-quick-chips-title">
                            <ThunderboltOutlined style={{ color: '#f59e0b' }} />
                            1-Tap Diagnosis Shortcuts:
                          </div>
                          <div className="erp-jc-chips-scroll">
                            {CLOSE_DIAGNOSIS_CHIPS.map((chip, idx) => (
                              <div
                                key={idx}
                                className="erp-jc-quick-chip"
                                onClick={() =>
                                  setCloseDiagnosis((prev) => (prev ? `${prev}; ${chip}` : chip))
                                }
                              >
                                {chip}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                            Revised Diagnosis / Root Cause <span style={{ color: 'var(--maint-danger-fg)' }}>*</span>:
                          </label>
                          <Input.TextArea
                            rows={3}
                            placeholder="Update or add further diagnosis based on supervisor instructions..."
                            value={closeDiagnosis}
                            onChange={(e) => setCloseDiagnosis(e.target.value)}
                          />
                        </div>

                        {/* Corrective Action Quick Chips */}
                        <div className="erp-jc-quick-chips-wrapper">
                          <div className="erp-jc-quick-chips-title">
                            <ThunderboltOutlined style={{ color: 'var(--maint-success-fg)' }} />
                            1-Tap Corrective Action Shortcuts:
                          </div>
                          <div className="erp-jc-chips-scroll">
                            {CLOSE_CORRECTIVE_CHIPS.map((chip, idx) => (
                              <div
                                key={idx}
                                className="erp-jc-quick-chip"
                                onClick={() =>
                                  setCloseCorrectiveAction((prev) => (prev ? `${prev}\n${chip}` : chip))
                                }
                              >
                                {chip}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                            Additional / Corrective Actions Performed <span style={{ color: 'var(--maint-danger-fg)' }}>*</span>:
                          </label>
                          <Input.TextArea
                            rows={3}
                            placeholder="Detail rework actions, adjustments, re-calibration, or testing performed..."
                            value={closeCorrectiveAction}
                            onChange={(e) => setCloseCorrectiveAction(e.target.value)}
                          />
                        </div>

                        <div style={{ marginBottom: 14 }}>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                            Preventive Action Recommendation:
                          </label>
                          <Input.TextArea
                            rows={2}
                            placeholder="Recommendations to avoid recurrence..."
                            value={closePreventiveAction}
                            onChange={(e) => setClosePreventiveAction(e.target.value)}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                            Technician Rework Notes / Explanations for Supervisor:
                          </label>
                          <Input.TextArea
                            rows={2}
                            placeholder="Explain what was modified or corrected during this rework..."
                            value={reworkNotes}
                            onChange={(e) => setReworkNotes(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Section 3: Replaced Spare Parts & Consumables */}
                      <div className="erp-jc-form-section">
                        <div className="erp-jc-section-header" style={{ justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="erp-jc-section-badge">3</span>
                            <h5 className="erp-jc-section-title">
                              Spare Parts &amp; Materials ({cardParts.length})
                            </h5>
                          </div>
                          <Button
                            size="small"
                            type={showAddPartInline ? 'default' : 'primary'}
                            icon={<PlusOutlined />}
                            style={showAddPartInline ? undefined : { backgroundColor: '#2563eb', borderColor: '#2563eb', color: '#ffffff', fontWeight: 600 }}
                            onClick={() => setShowAddPartInline(!showAddPartInline)}
                          >
                            {showAddPartInline ? 'Cancel Add' : '+ Add Consumed Spare Part'}
                          </Button>
                        </div>

                        {/* Inline Form to Add Consumed Part */}
                        {showAddPartInline && renderAddPartInlineForm()}

                        {/* Parts Table */}
                        <Table
                          size="small"
                          pagination={false}
                          rowKey="id"
                          dataSource={cardParts}
                          locale={{
                            emptyText: (
                              <div style={{ padding: '12px 0', color: 'var(--theme-text-muted, #94a3b8)' }}>
                                No spare parts logged on this job card yet.
                              </div>
                            ),
                          }}
                          columns={[
                            {
                              title: 'Part Description',
                              key: 'name',
                              render: (_: any, r: any) => (
                                <div>
                                  <div style={{ fontWeight: 600, color: 'var(--theme-text, #ffffff)' }}>
                                    {r.partName || r.item?.name || r.item?.itemName || '—'}
                                  </div>
                                  {(r.partCode || r.item?.itemCode) && (
                                    <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>
                                      Code: {r.partCode || r.item?.itemCode}
                                    </div>
                                  )}
                                </div>
                              ),
                            },
                            {
                              title: 'Quantity',
                              key: 'qty',
                              width: 110,
                              render: (_: any, r: any) => (
                                <Tag color="blue" style={{ fontWeight: 600 }}>
                                  {r.quantity} {r.uom || 'Pcs'}
                                </Tag>
                              ),
                            },
                            {
                              title: 'Remarks',
                              dataIndex: 'remarks',
                              key: 'remarks',
                              render: (val) => val || '—',
                            },
                            {
                              title: '',
                              key: 'del',
                              width: 40,
                              render: (_: any, r: any) => (
                                <Button
                                  type="text"
                                  danger
                                  size="small"
                                  icon={<DeleteOutlined />}
                                  onClick={() => handleRemovePart(r.id)}
                                  title="Delete part from job card"
                                />
                              ),
                            },
                          ]}
                        />
                      </div>

                      {/* Section 4: Classification */}
                      <div className="erp-jc-form-section">
                        <div className="erp-jc-section-header">
                          <span className="erp-jc-section-badge">4</span>
                          <h5 className="erp-jc-section-title">Classification</h5>
                        </div>

                        <Row gutter={12}>
                          <Col span={12}>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                              Root Cause Category:
                            </label>
                            <Select
                              allowClear
                              style={{ width: '100%' }}
                              placeholder="Select root cause category..."
                              value={closeRootCauseId || undefined}
                              onChange={(val) => setCloseRootCauseId(val)}
                              options={rootCategories.map((c) => ({
                                value: c.id,
                                label: c.name || c.code,
                              }))}
                            />
                          </Col>
                          <Col span={12}>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                              Failure Mode Category:
                            </label>
                            <Select
                              allowClear
                              style={{ width: '100%' }}
                              placeholder="Select failure category..."
                              value={closeFailureId || undefined}
                              onChange={(val) => setCloseFailureId(val)}
                              options={failureCategories.map((c) => ({
                                value: c.id,
                                label: c.name || c.code,
                              }))}
                            />
                          </Col>
                        </Row>
                      </div>
                    </>
                  )}

                  {/* ── MODE: PARTS (WAITING FOR PARTS) ── */}
                  {currentMode === 'parts' && (
                    <div className="erp-jc-form-section">
                      <div className="erp-jc-section-header">
                        <span className="erp-jc-section-badge">2</span>
                        <h5 className="erp-jc-section-title">Spare Part Requirement & Hold Reason</h5>
                      </div>

                      <Row gutter={12} style={{ marginBottom: 14 }}>
                        <Col span={16}>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                            Missing Spare Part Name <span style={{ color: 'var(--maint-danger-fg)' }}>*</span>:
                          </label>
                          <Input
                            placeholder="e.g. SKF 6205-2RS Deep Groove Ball Bearing"
                            value={partName}
                            onChange={(e) => setPartName(e.target.value)}
                          />
                        </Col>
                        <Col span={8}>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                            Part Code / OEM Ref:
                          </label>
                          <Input
                            placeholder="e.g. BRG-6205-SKF"
                            value={partCode}
                            onChange={(e) => setPartCode(e.target.value)}
                          />
                        </Col>
                      </Row>

                      <Row gutter={12} style={{ marginBottom: 14 }}>
                        <Col span={12}>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                            Quantity Required <span style={{ color: 'var(--maint-danger-fg)' }}>*</span>:
                          </label>
                          <InputNumber
                            min={1}
                            style={{ width: '100%' }}
                            value={partQty}
                            onChange={(v) => setPartQty(v || 1)}
                          />
                        </Col>
                        <Col span={12}>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                            Unit of Measure (UOM):
                          </label>
                          <Select
                            style={{ width: '100%' }}
                            value={partUom}
                            onChange={(v) => setPartUom(v)}
                            options={[
                              { value: 'Pcs', label: 'Pcs (Pieces)' },
                              { value: 'Mtr', label: 'Mtr (Meters)' },
                              { value: 'Kg', label: 'Kg (Kilograms)' },
                              { value: 'Set', label: 'Set' },
                              { value: 'Ltr', label: 'Ltr (Liters)' },
                              { value: 'Roll', label: 'Roll' },
                            ]}
                          />
                        </Col>
                      </Row>

                      {/* Quick Chips for Parts Hold */}
                      <div className="erp-jc-quick-chips-wrapper">
                        <div className="erp-jc-quick-chips-title">
                          <ThunderboltOutlined style={{ color: '#f59e0b' }} />
                          Quick Hold Reason Shortcuts:
                        </div>
                        <div className="erp-jc-chips-scroll">
                          {PARTS_REASON_CHIPS.map((chip, idx) => (
                            <div
                              key={idx}
                              className="erp-jc-quick-chip"
                              onClick={() => setPartsReason(chip)}
                            >
                              {chip}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                          Reason for Hold / Store Procurement Notes <span style={{ color: 'var(--maint-danger-fg)' }}>*</span>:
                        </label>
                        <Input.TextArea
                          rows={3}
                          placeholder="Explain why parts are unavailable and expected arrival timeline..."
                          value={partsReason}
                          onChange={(e) => setPartsReason(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {/* ── MODE: REVIEW (SUPERVISOR APPROVE / RETURN) ── */}
                  {currentMode === 'review' && (
                    <>
                      {/* Section 2: Review Findings */}
                      <div className="erp-jc-form-section">
                        <div className="erp-jc-section-header">
                          <span className="erp-jc-section-badge">2</span>
                          <h5 className="erp-jc-section-title">Technician Findings & Solution Summary</h5>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-muted)' }}>
                            DIAGNOSIS REPORTED BY TECHNICIAN:
                          </span>
                          <div
                            style={{
                              padding: '8px 12px',
                              background: 'var(--theme-surface-alt, #18223c)',
                              borderRadius: 6,
                              fontSize: 13,
                              color: 'var(--theme-text, #ffffff)',
                              marginTop: 4,
                            }}
                          >
                            {activeCard?.diagnosis || 'No diagnosis recorded by technician.'}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-muted)' }}>
                            CORRECTIVE ACTION REPORTED:
                          </span>
                          <div
                            style={{
                              padding: '8px 12px',
                              background: 'var(--theme-surface-alt, #18223c)',
                              borderRadius: 6,
                              fontSize: 13,
                              color: 'var(--theme-text, #ffffff)',
                              marginTop: 4,
                            }}
                          >
                            {activeCard?.correctiveAction || 'No corrective action recorded.'}
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Supervisor Decision */}
                      <div className="erp-jc-form-section">
                        <div className="erp-jc-section-header">
                          <span className="erp-jc-section-badge">3</span>
                          <h5 className="erp-jc-section-title">Supervisor Decision</h5>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                          <Radio.Group
                            value={reviewAction}
                            onChange={(e) => setReviewAction(e.target.value)}
                            buttonStyle="solid"
                            size="middle"
                          >
                            <Radio.Button value="verify">
                              <Space>
                                <CheckCircleOutlined style={{ color: 'var(--maint-success-fg)' }} />
                                <strong>Verify & Approve</strong>
                              </Space>
                            </Radio.Button>
                            <Radio.Button value="reject">
                              <Space>
                                <RollbackOutlined style={{ color: 'var(--maint-danger-fg)' }} />
                                <strong>Return to Technician for Rework</strong>
                              </Space>
                            </Radio.Button>
                          </Radio.Group>
                        </div>

                        {reviewAction === 'verify' ? (
                          <div>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                              Verification & Quality Inspection Remarks:
                            </label>
                            <Input.TextArea
                              rows={3}
                              placeholder="Safety checks verified, trial run passed without vibration..."
                              value={reviewRemarks}
                              onChange={(e) => setReviewRemarks(e.target.value)}
                            />
                          </div>
                        ) : (
                          <div>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                              Reason for Return / Rework Instructions <span style={{ color: 'var(--maint-danger-fg)' }}>*</span>:
                            </label>
                            <Input.TextArea
                              rows={3}
                              placeholder="Detail why the job is not acceptable, remaining vibration, oil leaks..."
                              value={rejectionReason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                            />
                            {!rejectionReason.trim() && (
                              <div style={{ color: 'var(--maint-danger-fg)', fontSize: 12, marginTop: 4 }}>
                                * Return reason is mandatory when rejecting a job card.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* ── MODE: VIEW (6 COMPREHENSIVE TABS) ── */}
                  {currentMode === 'view' && (
                    <div className="erp-jc-form-section" style={{ padding: '8px 16px' }}>
                      <Tabs
                        defaultActiveKey="timeline"
                        items={[
                          {
                            key: 'timeline',
                            label: (
                              <Space>
                                <HistoryOutlined />
                                <span>Activity Timeline</span>
                              </Space>
                            ),
                            children: (() => {
                              const hist = (cardHistory || []).slice().sort((a: any, b: any) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
                              if (!hist.length) return <Empty description="No status history recorded yet" />;
                              return (
                                <div style={{ padding: '10px 4px' }}>
                                  <Timeline
                                    items={hist.map((h: any, i: number) => {
                                      const ts = h.changedAt ? new Date(h.changedAt).getTime() : null;
                                      const nextTs = i < hist.length - 1 ? (hist[i + 1].changedAt ? new Date(hist[i + 1].changedAt).getTime() : null) : null;
                                      const isLast = i === hist.length - 1;
                                      const terminal = ['APPROVED', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(h.toStatus);
                                      const isActive = isLast && !terminal;
                                      const startTs = ts;
                                      const endTs = isActive ? Date.now() : nextTs;
                                      let dur = '';
                                      if (startTs !== null && endTs !== null && endTs >= startTs) {
                                        const mins = Math.round((endTs - startTs) / 60000);
                                        dur = formatDuration(mins);
                                      }
                                      return {
                                        color: h.toStatus === 'REJECTED' || h.toStatus === 'CANCELLED' ? 'red' : h.toStatus === 'APPROVED' ? 'green' : 'blue',
                                        children: (
                                          <div style={{ marginBottom: 10 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                                              <Typography.Text strong style={{ color: 'var(--theme-text, #ffffff)' }}>
                                                {label(h.fromStatus)} &rarr; {label(h.toStatus)}
                                              </Typography.Text>
                                              {isActive ? (
                                                <Tag color="green" style={{ marginInlineEnd: 0 }}>Active</Tag>
                                              ) : dur ? (
                                                <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>{dur}</Tag>
                                              ) : null}
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4, fontSize: 11 }}>
                                              <span><Typography.Text type="secondary">Start:</Typography.Text> {h.changedAt ? dayjs(h.changedAt).format('DD/MM, HH:mm') : '—'}</span>
                                              <span><Typography.Text type="secondary">Duration:</Typography.Text> {dur || '—'}</span>
                                            </div>
                                            {h.remarks && <div style={{ marginTop: 2, fontSize: 12 }}><Typography.Text type="secondary" italic>Notes: {h.remarks}</Typography.Text></div>}
                                            <div style={{ marginTop: 2, fontSize: 11 }}><Typography.Text type="secondary">by {uName(h.changedByUser || h.actor)}</Typography.Text></div>
                                          </div>
                                        ),
                                      };
                                    })}
                                  />
                                </div>
                              );
                            })(),
                          },
                          {
                            key: 'parts',
                            label: (
                              <Space>
                                <BuildOutlined />
                                <span>Parts ({cardParts.length})</span>
                              </Space>
                            ),
                            children: (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                  <Typography.Text strong style={{ color: 'var(--theme-text, #ffffff)' }}>Consumed Parts</Typography.Text>
                                  <Button
                                    size="small"
                                    type={showAddPartInline ? 'default' : 'primary'}
                                    icon={<PlusOutlined />}
                                    style={showAddPartInline ? undefined : { backgroundColor: '#2563eb', borderColor: '#2563eb', color: '#ffffff' }}
                                    onClick={() => setShowAddPartInline(!showAddPartInline)}
                                  >
                                    {showAddPartInline ? 'Cancel Add' : '+ Add Consumed Part'}
                                  </Button>
                                </div>
                                {showAddPartInline && (
                                  <div style={{ background: 'var(--theme-surface-alt, #0f172a)', border: '1px solid var(--theme-border, #2a385f)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                                    <Row gutter={[8, 8]}>
                                      <Col xs={24} sm={16}>
                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Item / Part Name *:</label>
                                        <Select
                                          showSearch
                                          allowClear
                                          size="small"
                                          style={{ width: '100%' }}
                                          placeholder="Search item..."
                                          value={newPartItemId || undefined}
                                          onChange={(val) => {
                                            setNewPartItemId(val || '');
                                            const f = itemsList.find((i) => i.id === val);
                                            if (f) {
                                              setNewPartName(f.name || f.itemName || '');
                                              setNewPartCode(f.itemCode || f.code || '');
                                              if (f.uom?.code || f.uom) setNewPartUom(f.uom?.code || f.uom);
                                            }
                                          }}
                                          options={itemsList.map((i) => ({ value: i.id, label: `${i.itemCode ? `[${i.itemCode}] ` : ''}${i.name || i.itemName}` }))}
                                        />
                                      </Col>
                                      <Col xs={12} sm={4}>
                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Qty:</label>
                                        <InputNumber size="small" min={0.1} style={{ width: '100%' }} value={newPartQty} onChange={(v) => setNewPartQty(v || 1)} />
                                      </Col>
                                      <Col xs={12} sm={4}>
                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>UOM:</label>
                                        <Select size="small" style={{ width: '100%' }} value={newPartUom} onChange={(v) => setNewPartUom(v)} options={[{ value: 'Pcs', label: 'Pcs' }, { value: 'Mtr', label: 'Mtr' }, { value: 'Kg', label: 'Kg' }, { value: 'Set', label: 'Set' }, { value: 'Ltr', label: 'Ltr' }]} />
                                      </Col>
                                      {!newPartItemId && (
                                        <Col xs={24}>
                                          <Input size="small" placeholder="Or custom part name..." value={newPartName} onChange={(e) => setNewPartName(e.target.value)} />
                                        </Col>
                                      )}
                                      <Col xs={24}>
                                        <Input size="small" placeholder="Remarks..." value={newPartRemarks} onChange={(e) => setNewPartRemarks(e.target.value)} />
                                      </Col>
                                    </Row>
                                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                      <Button size="small" onClick={() => setShowAddPartInline(false)}>Cancel</Button>
                                      <Button size="small" type="primary" loading={addingPart} style={{ backgroundColor: '#2563eb', color: '#ffffff' }} onClick={handleAddConsumedPart}>Save</Button>
                                    </div>
                                  </div>
                                )}
                                <Table
                                  size="small"
                                  rowKey="id"
                                  pagination={false}
                                  dataSource={cardParts}
                                  locale={{ emptyText: 'No spare parts logged.' }}
                                  columns={[
                                    { title: 'Part', dataIndex: 'partName', render: (v, r) => <div><strong>{v}</strong>{r.partCode && <div style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>{r.partCode}</div>}</div> },
                                    { title: 'Qty', key: 'q', width: 90, render: (_, r) => <Tag color="blue">{r.quantity} {r.uom || 'Pcs'}</Tag> },
                                    { title: 'Remarks', dataIndex: 'remarks', render: (v) => v || '—' },
                                    { title: '', key: 'd', width: 40, render: (_, r) => <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => handleRemovePart(r.id)} /> },
                                  ]}
                                />
                              </div>
                            ),
                          },
                          {
                            key: 'logs',
                            label: (
                              <Space>
                                <FileTextOutlined />
                                <span>Work Logs ({cardLogs.length})</span>
                              </Space>
                            ),
                            children: (
                              <Table
                                size="small"
                                rowKey="id"
                                pagination={false}
                                dataSource={cardLogs}
                                locale={{ emptyText: 'No work logs recorded' }}
                                columns={[
                                  { title: 'Work Done', dataIndex: 'workDescription' },
                                  { title: 'Remarks', dataIndex: 'remarks', render: (v) => v || '—' },
                                  { title: 'Date', dataIndex: 'createdAt', width: 140, render: (v) => (v ? dayjs(v).format('DD/MM, HH:mm') : '—') },
                                ]}
                              />
                            ),
                          },
                          {
                            key: 'attachments',
                            label: (
                              <Space>
                                <PaperClipOutlined />
                                <span>Attachments ({cardAttachments.length})</span>
                              </Space>
                            ),
                            children: (
                              <Table
                                size="small"
                                rowKey="id"
                                pagination={false}
                                dataSource={cardAttachments}
                                locale={{ emptyText: 'No attachments' }}
                                columns={[
                                  { title: 'File', dataIndex: 'fileName' },
                                  { title: 'Description', dataIndex: 'description', render: (v) => v || '—' },
                                  { title: 'Uploaded', dataIndex: 'createdAt', width: 140, render: (v) => (v ? dayjs(v).format('DD/MM, HH:mm') : '—') },
                                ]}
                              />
                            ),
                          },
                          {
                            key: 'technicians',
                            label: (
                              <Space>
                                <TeamOutlined />
                                <span>Technicians ({cardTechnicians.length})</span>
                              </Space>
                            ),
                            children: (
                              <Table
                                size="small"
                                rowKey="id"
                                pagination={false}
                                dataSource={cardTechnicians}
                                locale={{ emptyText: 'No technicians assigned' }}
                                columns={[
                                  { title: 'Technician', render: (_, r) => techLabel(r) },
                                  { title: 'Role', dataIndex: 'role', render: (v) => v ? <Tag color={v === 'PRIMARY' ? 'blue' : 'default'}>{v}</Tag> : '—' },
                                  { title: 'Skill', render: (_, r) => r.technician?.skill || '—' },
                                  { title: 'Shift', render: (_, r) => r.technician?.shift || '—' },
                                  { title: 'Remarks', dataIndex: 'remarks', render: (v) => v || '—' },
                                ]}
                              />
                            ),
                          },
                          {
                            key: 'overview',
                            label: (
                              <Space>
                                <ToolOutlined />
                                <span>Machine Specs & Stats</span>
                              </Space>
                            ),
                            children: (
                              <div>
                                <Descriptions size="small" column={{ xs: 1, sm: 2 }} style={{ marginBottom: 14 }}>
                                  <Descriptions.Item label="Machine Asset"><strong>{machineName}</strong></Descriptions.Item>
                                  <Descriptions.Item label="Machine Code"><code>{machineCode}</code></Descriptions.Item>
                                  <Descriptions.Item label="Division">{divisionName}</Descriptions.Item>
                                  <Descriptions.Item label="Section">{sectionName}</Descriptions.Item>
                                  <Descriptions.Item label="Department">{departmentName}</Descriptions.Item>
                                  <Descriptions.Item label="Criticality">
                                    <Tag color={machine.criticality === 'CRITICAL' ? 'red' : 'blue'}>{label(machine.criticality || 'MEDIUM')}</Tag>
                                  </Descriptions.Item>
                                </Descriptions>
                                {machineStats && (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                                    <div style={{ background: 'var(--theme-surface-alt, #18223c)', padding: '6px 8px', borderRadius: 6, textAlign: 'center' }}>
                                      <div style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>Jobs</div>
                                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--maint-info-fg)' }}>{machineStats.total || 0}</div>
                                    </div>
                                    <div style={{ background: 'var(--theme-surface-alt, #18223c)', padding: '6px 8px', borderRadius: 6, textAlign: 'center' }}>
                                      <div style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>Downtime</div>
                                      <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>{machineStats.totalDowntimeMinutes || 0}m</div>
                                    </div>
                                    <div style={{ background: 'var(--theme-surface-alt, #18223c)', padding: '6px 8px', borderRadius: 6, textAlign: 'center' }}>
                                      <div style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>MTBF</div>
                                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--maint-success-fg)' }}>{machineStats.mtbfHours || 0}h</div>
                                    </div>
                                    <div style={{ background: 'var(--theme-surface-alt, #18223c)', padding: '6px 8px', borderRadius: 6, textAlign: 'center' }}>
                                      <div style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>Breakdowns</div>
                                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--maint-danger-fg)' }}>{machineStats.byType?.breakdown || 0}</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ),
                          },
                        ]}
                      />
                    </div>
                  )}

                </>
              )}
            </div>

            {/* Right Live Detail Sheet */}
            {showPreviewPane && (
              <div
                className="erp-jc-preview-pane"
                style={{
                  display: mobileTab === 'form' ? undefined : 'flex',
                }}
              >
                <div className="erp-jc-live-ticket">
                  {/* Ticket Header */}
                  <div className="erp-jc-ticket-header">
                    <div className="erp-jc-ticket-code">
                      <span>#{jobCardNo}</span>
                      <Tooltip title="Copy ticket number">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          style={{ color: 'var(--maint-info-fg)' }}
                          onClick={() => {
                            navigator.clipboard?.writeText(jobCardNo);
                            message.info('Job card number copied to clipboard');
                          }}
                        />
                      </Tooltip>
                    </div>
                    <StatusBadge status={currentStatus} />
                  </div>

                  {/* Ticket Body */}
                  <div className="erp-jc-ticket-body">
                    {/* Priority & Maintenance Classification */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Tag
                        color={
                          maintenanceType === 'BREAKDOWN'
                            ? 'volcano'
                            : maintenanceType === 'PREVENTIVE'
                            ? 'green'
                            : 'blue'
                        }
                        style={{ fontWeight: 700 }}
                      >
                        {maintenanceType}
                      </Tag>

                      <Tag
                        color={
                          priority === 'CRITICAL'
                            ? '#dc2626'
                            : priority === 'HIGH'
                            ? '#f97316'
                            : priority === 'MEDIUM'
                            ? '#2563eb'
                            : '#64748b'
                        }
                        style={{ fontWeight: 700 }}
                      >
                        {priority} PRIORITY
                      </Tag>
                    </div>

                    {/* Target Machine Asset */}
                    <div className="erp-jc-ticket-row">
                      <div className="erp-jc-ticket-label">EQUIPMENT / TARGET ASSET</div>
                      <div className="erp-jc-ticket-val" style={{ fontSize: 14 }}>
                        {machineName} <Tag style={{ marginLeft: 6 }}>{machineCode}</Tag>
                      </div>
                    </div>

                    {/* Location & Organization Hierarchy */}
                    <div className="erp-jc-ticket-row">
                      <div className="erp-jc-ticket-label">LOCATION & HIERARCHY</div>
                      <div className="erp-jc-ticket-val" style={{ fontSize: 12 }}>
                        {divisionName} &bull; {sectionName} &bull; {departmentName}
                      </div>
                    </div>

                    {/* Reported Fault / Complaint */}
                    <div className="erp-jc-ticket-row">
                      <div className="erp-jc-ticket-label">REPORTED FAULT / COMPLAINT</div>
                      <div className="erp-jc-ticket-complaint-box">
                        "{complaint}"
                      </div>
                    </div>

                    {/* Live Timing Breakdown */}
                    <div className="erp-jc-ticket-row">
                      <div className="erp-jc-ticket-label">LIFECYCLE TIMINGS BREAKDOWN</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <div style={{ background: 'var(--theme-surface-alt, #0f172a)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--theme-border, #1e293b)' }}>
                          <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)' }}>1. Response Wait</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--maint-info-fg)' }}>{formatDuration(timingMetrics.waitMinutes)}</div>
                        </div>
                        <div style={{ background: 'var(--theme-surface-alt, #0f172a)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--theme-border, #1e293b)' }}>
                          <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)' }}>2. Gross Repair</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>{formatDuration(timingMetrics.grossRepairMinutes)}</div>
                        </div>
                        <div style={{ background: 'var(--theme-surface-alt, #0f172a)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--theme-border, #1e293b)' }}>
                          <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)' }}>3. Parts Delay</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: timingMetrics.partsHoldMinutes > 0 ? '#f87171' : 'var(--theme-text-muted, #94a3b8)' }}>
                            {formatDuration(timingMetrics.partsHoldMinutes)}
                          </div>
                        </div>
                        <div style={{ background: 'rgba(16, 185, 129, 0.12)', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                          <div style={{ fontSize: 10, color: '#a7f3d0' }}>4. Net Labor</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--maint-success-fg)' }}>{formatDuration(timingMetrics.netRepairMinutes)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Consumed Parts in Live Sheet */}
                    {cardParts.length > 0 && (
                      <div className="erp-jc-ticket-row">
                        <div className="erp-jc-ticket-label">CONSUMED SPARE PARTS ({cardParts.length})</div>
                        <Space wrap size={4}>
                          {cardParts.map((p: any) => (
                            <Tag key={p.id} color="cyan" style={{ margin: 0, fontSize: 11 }}>
                              {p.partName || p.item?.name || 'Part'} &times; {p.quantity} {p.uom || ''}
                            </Tag>
                          ))}
                        </Space>
                      </div>
                    )}

                    {/* Live Updates from Left Pane */}
                    {currentMode === 'start' && selectedTechIds.length > 0 && (
                      <div className="erp-jc-ticket-row">
                        <div className="erp-jc-ticket-label">ASSIGNED TECHNICIANS ({selectedTechIds.length})</div>
                        <Space wrap size={4}>
                          {selectedTechIds.map((tid) => {
                            const tech = technicians.find((t: any) => t.id === tid);
                            return (
                              <Tag key={tid} color="blue" icon={<UserOutlined />}>
                                {tech?.technicianName || tech?.name || tid}
                              </Tag>
                            );
                          })}
                        </Space>
                      </div>
                    )}

                    {currentMode === 'close' && closeDiagnosis && (
                      <div className="erp-jc-ticket-row">
                        <div className="erp-jc-ticket-label">LIVE DIAGNOSIS SUMMARY</div>
                        <div
                          style={{
                            fontSize: 12,
                            background: 'rgba(16, 185, 129, 0.12)',
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            color: 'var(--maint-success-fg)',
                            fontWeight: 600,
                          }}
                        >
                          {closeDiagnosis}
                        </div>
                      </div>
                    )}

                    {currentMode === 'parts' && partName && (
                      <div className="erp-jc-ticket-row">
                        <div className="erp-jc-ticket-label">REQUESTED SPARE PART</div>
                        <div
                          style={{
                            fontSize: 12,
                            background: 'rgba(245, 158, 11, 0.12)',
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            color: '#fbbf24',
                            fontWeight: 600,
                          }}
                        >
                          {partName} &bull; Qty: {partQty} {partUom}
                        </div>
                      </div>
                    )}

                    {/* Reporter & Captured Timestamp */}
                    <div className="erp-jc-ticket-meta-grid">
                      <div>
                        <div className="erp-jc-ticket-label">REPORTED BY</div>
                        <div className="erp-jc-ticket-val" style={{ fontSize: 12 }}>
                          <UserOutlined style={{ marginRight: 4, color: 'var(--maint-info-fg)' }} />
                          {activeCard?.reportedBy?.name || activeCard?.reportedBy?.username || 'Maintenance Desk'}
                        </div>
                      </div>
                      <div>
                        <div className="erp-jc-ticket-label">DATE & TIME</div>
                        <div className="erp-jc-ticket-val" style={{ fontSize: 12 }}>
                          <ClockCircleOutlined style={{ marginRight: 4, color: 'var(--maint-info-fg)' }} />
                          {activeCard?.createdAt ? dayjs(activeCard.createdAt).format('DD MMM, HH:mm') : dayjs().format('DD MMM, HH:mm')}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
              </>
            )}
          </div>

          {/* Modal Footer */}
          <div className="erp-jc-footer">
            {currentMode !== 'view' && (
              <Button onClick={onClose} disabled={submitting}>
                Cancel &amp; Close
              </Button>
            )}

            <Space style={{ marginLeft: currentMode === 'view' ? 'auto' : undefined }}>
              {/* WhatsApp Share Button in Footer */}
              <Button
                icon={<WhatsAppOutlined style={{ color: '#25D366' }} />}
                style={{
                  borderColor: '#25D366',
                  color: '#25D366',
                  fontWeight: 600,
                  height: 38,
                  padding: '0 18px',
                }}
                onClick={handleOpenWhatsApp}
              >
                WhatsApp Share
              </Button>

              {currentMode === 'view' ? (
                <Button
                  type="primary"
                  style={{
                    backgroundColor: '#2563eb',
                    borderColor: '#2563eb',
                    color: '#ffffff',
                    fontWeight: 600,
                    height: 38,
                    padding: '0 24px',
                  }}
                  onClick={onClose}
                >
                  Close View
                </Button>
              ) : (
                <Button
                  type="primary"
                  loading={submitting}
                  disabled={!isFormValid}
                  style={{
                    backgroundColor: isFormValid ? modeConfig.btnColor : undefined,
                    borderColor: isFormValid ? modeConfig.btnColor : undefined,
                    fontWeight: 700,
                    height: 38,
                    padding: '0 22px',
                  }}
                  onClick={handleSubmit}
                >
                  {modeConfig.btnText}
                </Button>
              )}
            </Space>
          </div>

          {/* Mouse Drag Corner Resize Grip (Bottom-Right) */}
          {!isMaximized && (
            <div
              className="erp-jc-resize-handle"
              onMouseDown={handleResizeStart}
              title="Drag to resize window"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M10 2L2 10M10 6L6 10M10 10L9.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          )}
        </div>
      </Modal>

      {/* ── WhatsApp Share Modal ── */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22, color: '#25D366' }}><WhatsAppOutlined /></span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Share Job Card #{jobCardNo} on WhatsApp</span>
          </div>
        }
        open={whatsappModalOpen}
        onCancel={() => setWhatsappModalOpen(false)}
        footer={null}
        width={580}
        zIndex={1350}
      >
        <div style={{ padding: '6px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--theme-text-secondary)', marginBottom: 12 }}>
            Share complete technical dossier, machine details, lifecycle timings, and technician assignments directly to your WhatsApp maintenance groups or individual contacts.
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
              Direct Recipient Phone (Optional — leave empty to select group or contact inside WhatsApp):
            </label>
            <Input
              prefix={<WhatsAppOutlined style={{ color: '#25D366' }} />}
              placeholder="e.g. 03001234567 or +923001234567"
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              allowClear
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                WhatsApp Message Preview (Editable):
              </label>
              <Button
                size="small"
                type="link"
                icon={<CopyOutlined />}
                style={{ padding: 0, fontWeight: 600, color: 'var(--maint-info-fg)' }}
                onClick={() => {
                  navigator.clipboard.writeText(whatsappText);
                  message.success('WhatsApp text copied to clipboard!');
                }}
              >
                Copy Text
              </Button>
            </div>
            <Input.TextArea
              rows={11}
              value={whatsappText}
              onChange={(e) => setWhatsappText(e.target.value)}
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                background: 'var(--theme-surface-alt, #0f172a)',
                color: 'var(--theme-text, #f1f5f9)',
                borderRadius: 8,
                lineHeight: 1.4,
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button onClick={() => setWhatsappModalOpen(false)}>
              Cancel
            </Button>
            <Button
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(whatsappText);
                message.success('Message copied to clipboard!');
              }}
            >
              Copy Text
            </Button>
            <Button
              type="primary"
              icon={<WhatsAppOutlined />}
              style={{ backgroundColor: '#25D366', borderColor: '#25D366', color: '#ffffff', fontWeight: 700 }}
              onClick={() => {
                openWhatsAppShare(whatsappText, whatsappPhone);
                setWhatsappModalOpen(false);
              }}
            >
              {whatsappPhone.trim() ? 'Send to Phone Number' : 'Open in WhatsApp (Web/App)'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
