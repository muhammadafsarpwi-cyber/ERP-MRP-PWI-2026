import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Divider, Form, Input, InputNumber,
  Modal, Popconfirm, Row, Select, Space, Spin, Table, Tag, Tooltip, Typography, App as AntApp,
} from 'antd';
import {
  CameraOutlined, CloseOutlined, CopyOutlined, DatabaseOutlined, DeleteOutlined, EditOutlined, EyeOutlined,
  InboxOutlined, PaperClipOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SendOutlined,
  WarningOutlined, WhatsAppOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber } from '../../../utils/numberFormat';
import { formatApiError } from '../../../utils/apiError';
import { buildReceiptWhatsAppMessage, normalizeWaPhone, waLink } from '../../../utils/receiptShare';
import type { ShareReceiptInfo } from '../../../utils/receiptShare';
import { DraggableResizableModal, SaveResultDialog, PageHeader } from '../../../components/shared';
import type { SaveResultData, SaveResultPhase } from '../../../components/shared/SaveResultDialog';
import { useRawReceiptDraftStore } from '../../../store/rawReceiptDraftStore';
import type { ReceiptDraft, OrgBundle } from '../../../store/rawReceiptDraftStore';
import './rawMaterialForms.css';

const { Text, Title } = Typography;

const SECTION_SELECT_LIST_HEIGHT = 200;

const PHOTO_FILE_MAX = 5 * 1024 * 1024;
const ATTACH_FILE_MAX = 10 * 1024 * 1024;
const PHOTO_MIME_ALLOW = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_EXT_RE = /\.(jpe?g|png|webp)$/i;
const ATTACH_EXT_ALLOW = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'];
const ATTACH_MIME_PREFIX = ['application/', 'text/plain', 'text/csv', 'application/csv'];

interface OrgOption { id: string; name: string; divisionCode?: string; sectionCode?: string; departmentCode?: string; divisionId?: string; sectionId?: string; }
interface WarehouseOption { id: string; name: string; warehouseCode?: string; status: string; warehouseType?: string; }
interface ItemOption {
  id: string;
  name: string;
  itemCode?: string;
  baseUomId?: string;
  divisionId?: string | null;
  sectionId?: string | null;
  departmentId?: string | null;
  itemType?: string;
}
interface UomOption { id: string; code?: string; name?: string; symbol?: string; status: string; }
interface ProductionOrderOption { id: string; order_number: string; status?: string; }

interface FormRefData {
  warehouses: WarehouseOption[];
  items: ItemOption[];
  uoms: UomOption[];
  divisions: OrgOption[];
  productionOrders: ProductionOrderOption[];
  sections: OrgOption[];
  departments: OrgOption[];
}

interface ReceiptLine {
  id?: string;
  lineNumber: number;
  item?: { id: string; name: string; itemCode: string } | null;
  uom?: { id: string; code: string; name?: string; symbol?: string } | null;
  gatePassQuantity: number;
  receivedQuantity: number;
  difference: number;
  remarks?: string | null;
}

interface ReceiptHeader {
  id: string;
  receiptCode: string;
  gatePassNo?: string | null;
  sourceNo?: string | null;
  receiptDate: string;
  status: string;
  reference?: string | null;
  remarks?: string | null;
  division?: OrgOption | null;
  section?: OrgOption | null;
  department?: OrgOption | null;
  warehouse?: WarehouseOption | null;
  productionOrderId?: string | null;
  lineCount?: number;
  gatePassTotal?: number;
  receivedTotal?: number;
  differenceTotal?: number;
  lines?: ReceiptLine[];
  documents?: ReceiptDocument[];
  ledgerEntries?: Array<{ id: string; transactionType: string; direction: string; quantity: number; transactionDate: string; referenceNumber?: string | null }>;
  createdAt?: string;
}

interface ReceiptDocument {
  id: string;
  kind: 'PHOTO' | 'ATTACHMENT';
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  fileSize?: number | null;
  uploadedAt?: string | null;
}

interface ReceiptInventoryBalance {
  exists: boolean;
  onHand: number | null;
  reserved: number | null;
  available: number | null;
  uom?: { id: string; code: string; name?: string; symbol?: string } | null;
  lastUpdatedAt?: string | null;
}

interface ReceiptInventoryRow {
  lineNumber: number;
  item?: { id: string; itemCode: string; name: string } | null;
  uom?: { id: string; code: string; name?: string; symbol?: string } | null;
  receivedQuantity: number;
  gatePassQuantity: number;
  balance: ReceiptInventoryBalance;
}

interface ReceiptInventoryData {
  receiptCode: string;
  receiptDate: string | null;
  status: string;
  warehouse?: { id: string; name: string; warehouseCode?: string; warehouseType?: string } | null;
  items: ReceiptInventoryRow[];
}

/** A photo/attachment held in memory until the receipt header save completes (upload-after-save). */
interface PendingUpload {
  key: string;
  kind: 'PHOTO' | 'ATTACHMENT';
  name: string;
  size: number;
  mime: string;
  file: File;
}

interface LineRow {
  key: string;
  itemId?: string;
  uomId?: string;
  gatePassQuantity?: number;
  receivedQuantity?: number;
}

/** RMR-01-C-C: one item's real inventory balance as returned by /inventory/balances/preview. */
interface BalancePreviewItem {
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  uomCode: string | null;
  exists: boolean;
  onHand: number | null;
  reserved: number | null;
  available: number | null;
  lastUpdatedAt: string | null;
}

const emptyLine = (): LineRow => ({
  key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  gatePassQuantity: undefined,
  receivedQuantity: undefined,
});

const uid = (): string => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const formatBytes = (b: number): string => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const RawMaterialReceiving: React.FC = () => {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [refData, setRefData] = useState<FormRefData | null>(null);
  const [refState, setRefState] = useState<'loading' | 'error' | 'ready'>('loading');

  const [rows, setRows] = useState<LineRow[]>([emptyLine()]);
  const rowsRef = useRef<LineRow[]>(rows);
  rowsRef.current = rows;

  const [list, setList] = useState<ReceiptHeader[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [listLoading, setListLoading] = useState(false);
  const [listState, setListState] = useState<'loading' | 'error' | 'ready'>('loading');

  const [filters, setFilters] = useState<{ status?: string; warehouseId?: string; gatePassNo?: string; dateFrom?: string; dateTo?: string }>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<ReceiptHeader | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // RMR-01-C: read-only inventory view for the open receipt detail.
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryData, setInventoryData] = useState<ReceiptInventoryData | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  // RMR-01-C-C: live inventory balance preview inside the receiving form
  // (READ-ONLY — the GET below never posts ledger or mutates balances).
  const [invPreview, setInvPreview] = useState<Record<string, BalancePreviewItem>>({});
  const [invPreviewLoading, setInvPreviewLoading] = useState<Record<string, boolean>>({});
  const [invPreviewError, setInvPreviewError] = useState<Record<string, string>>({});
  const [invPreviewRetryTick, setInvPreviewRetryTick] = useState(0);
  const invPreviewReqRef = useRef(0);
  // For EDIT: the already-posted received quantity per item of the loaded
  // receipt. The preview subtracts it so editing never double-counts stock
  // (mirrors the backend reverse-then-reapply delta convention).
  const [priorPosted, setPriorPosted] = useState<Array<{ itemId: string; receivedQuantity: number }>>([]);

  // Photos/attachments added but not yet uploaded (upload-after-save).
  const [pendingFiles, setPendingFiles] = useState<PendingUpload[]>([]);
  const pendingFilesRef = useRef<PendingUpload[]>(pendingFiles);
  pendingFilesRef.current = pendingFiles;

  // Documents already persisted on the backend (edit mode).
  const [existingDocs, setExistingDocs] = useState<ReceiptDocument[]>([]);

  // Hidden file inputs for photo capture / attachment picker.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<Record<string, string>>({});

  // SaveResultDialog states
  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [saveDialogPhase, setSaveDialogPhase] = useState<SaveResultPhase>('loading');
  const [saveDialogResult, setSaveDialogResult] = useState<SaveResultData | null>(null);
  const [saveDialogError, setSaveDialogError] = useState<string | undefined>(undefined);
  const [saveDialogSuccessTitle, setSaveDialogSuccessTitle] = useState<string>('Receipt Confirmed Successfully');
  const [saveDialogRetry, setSaveDialogRetry] = useState<(() => void) | undefined>(undefined);

  // Queued restore: the draft is only applied once the reference data is present.
  const [queuedRestore, setQueuedRestore] = useState<ReceiptDraft | null>(null);

  // Subscribes to restore requests from the persistent minimized dock.
  const pendingRestoreValue = useRawReceiptDraftStore((s) => s.pendingRestore);

  // Form watchers for real-time live verification preview
  const watchDivision = Form.useWatch('divisionId', form);
  const watchSection = Form.useWatch('sectionId', form);
  const watchDepartment = Form.useWatch('departmentId', form);
  const watchWarehouse = Form.useWatch('warehouseId', form);
  const watchReceiptDate = Form.useWatch('receiptDate', form);
  const watchGatePassNo = Form.useWatch('gatePassNo', form);
  const watchSourceNo = Form.useWatch('sourceNo', form);

  // Filter raw materials strictly by selected Division (plus shared items without division)
  const filteredItems = useMemo(() => {
    if (!refData?.items) return [];
    const rawMaterials = refData.items.filter((i) => !i.itemType || i.itemType === 'RAW_MATERIAL');
    if (!watchDivision) return rawMaterials;
    return rawMaterials.filter((i) => !i.divisionId || i.divisionId === watchDivision);
  }, [refData?.items, watchDivision]);

  // ─────────────────────────────────────────────────────────────────────────
  // Draft persistence — the live form/rows are mirrored into the global store
  // so navigation never destroys them and the minimized bar can restore them.
  // ─────────────────────────────────────────────────────────────────────────
  const commitDraft = useCallback((editing: string | null) => {
    useRawReceiptDraftStore.getState().updateDraft({
      editingId: editing,
      values: form.getFieldsValue(),
      rows: rowsRef.current,
      pendingFiles: pendingFilesRef.current,
    });
  }, [form]);

  // ─────────────────────────────────────────────────────────────────────────
  // Lookup options (single source of truth = form-data bundle, cached in the
  // application session). Division → Section → Department resolves client-side
  // with ZERO extra API calls, so cascades are instant.
  // ─────────────────────────────────────────────────────────────────────────
  const divisionOptions = useMemo(
    () => (refData?.divisions || []).map((d) => ({ value: d.id, label: d.divisionCode ? `${d.divisionCode} — ${d.name}` : d.name })),
    [refData?.divisions],
  );

  const warehouseOptions = useMemo(
    () => (refData?.warehouses || []).map((w) => ({ value: w.id, label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name })),
    [refData?.warehouses],
  );

  const sectionOptions = useMemo(
    () => (refData?.sections || [])
      .filter((s) => !s.divisionId || s.divisionId === watchDivision)
      .map((s) => ({ value: s.id, label: s.sectionCode ? `${s.sectionCode} — ${s.name}` : s.name })),
    [refData?.sections, watchDivision],
  );

  const departmentOptions = useMemo(
    () => (watchDivision && watchSection ? (refData?.departments || [])
      .filter((d) => (!d.divisionId || d.divisionId === watchDivision) && (!d.sectionId || d.sectionId === watchSection))
      .map((d) => ({ value: d.id, label: d.departmentCode ? `${d.departmentCode} — ${d.name}` : d.name }))
      : []),
    [refData?.departments, watchDivision, watchSection],
  );

  const itemOptions = useMemo(
    () => filteredItems.map((i) => ({ value: i.id, label: i.itemCode ? `${i.itemCode} — ${i.name}` : i.name })),
    [filteredItems],
  );

  const uomOptions = useMemo(
    () => (refData?.uoms || []).map((u) => ({ value: u.id, label: u.code || u.symbol || u.name || u.id })),
    [refData?.uoms],
  );

  const productionOrderOptions = useMemo(
    () => (refData?.productionOrders || []).map((o) => ({ value: o.id, label: o.order_number })),
    [refData?.productionOrders],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Reference data loading with request-id guard (ignores stale responses) and
  // session cache reuse — repeated page visits never re-request the same data.
  // ─────────────────────────────────────────────────────────────────────────
  const refReqRef = useRef(0);
  // Single-flight guard: concurrent mounts (e.g. React StrictMode in dev) share
  // one in-flight form-data request so the lookup is never issued twice.
  const refLoadPromiseRef = useRef<Promise<FormRefData> | null>(null);
  const loadRef = useCallback(async () => {
    const cached = useRawReceiptDraftStore.getState().getRefCache();
    if (cached) {
      setRefData(cached.data as unknown as FormRefData);
      setRefState('ready');
      return;
    }
    const reqId = ++refReqRef.current;
    setRefState('loading');
    if (!refLoadPromiseRef.current) {
      refLoadPromiseRef.current = (async () => {
        const res = await apiService.get<{ data: FormRefData }>('/inventory/receipts/gate-pass/form-data');
        useRawReceiptDraftStore.getState().setRefCache(res.data as unknown as OrgBundle);
        return res.data;
      })();
    }
    try {
      const data = await refLoadPromiseRef.current;
      if (reqId !== refReqRef.current) return;
      setRefData(data);
      setRefState('ready');
    } catch {
      if (reqId !== refReqRef.current) return;
      setRefState('error');
    } finally {
      refLoadPromiseRef.current = null;
    }
  }, []);

  const loadList = useCallback(async (p: number = page, f: typeof filters = filters) => {
    setListLoading(true);
    try {
      const res = await apiService.get<{ data: ReceiptHeader[]; total: number }>('/inventory/receipts/gate-pass', { page: p, limit: pageSize, ...f });
      setList(res.data || []);
      setTotal(res.total || 0);
      setListState('ready');
    } catch {
      setList([]);
      setTotal(0);
      setListState('error');
    } finally {
      setListLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filters]);

  useEffect(() => { void loadRef(); }, [loadRef]);
  useEffect(() => { void loadList(1); }, [loadList]);

  // Division → Section → Department cascade validation + single-option auto
  // selection. Runs on every relevant change (user pick, draft restore, late
  // reference data) and is purely derived from real master data — no hardcoding.
  useEffect(() => {
    if (!watchDivision || !refData) return;

    const secOptions = (refData.sections || []).filter((s) => !s.divisionId || s.divisionId === watchDivision);
    const curSec = form.getFieldValue('sectionId');
    let nextSec = curSec && secOptions.some((s) => s.id === curSec) ? curSec : undefined;
    if (secOptions.length === 1) nextSec = secOptions[0].id;
    if (nextSec !== curSec) form.setFieldValue('sectionId', nextSec);

    const secId = watchSection !== undefined && secOptions.some((s) => s.id === watchSection) ? watchSection : nextSec;
    if (!secId) {
      if (form.getFieldValue('departmentId') !== undefined) form.setFieldValue('departmentId', undefined);
      commitDraft(editingId);
      return;
    }

    const deptOptions = (refData.departments || []).filter(
      (d) => (!d.divisionId || d.divisionId === watchDivision) && (!d.sectionId || d.sectionId === secId),
    );
    const curDept = form.getFieldValue('departmentId');
    let nextDept = curDept && deptOptions.some((d) => d.id === curDept) ? curDept : undefined;
    if (deptOptions.length === 1) nextDept = deptOptions[0].id;
    if (nextDept !== curDept) form.setFieldValue('departmentId', nextDept);

    commitDraft(editingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchDivision, watchSection, refData]);

  // Single-warehouse flow: auto select when exactly one ACTIVE warehouse exists.
  useEffect(() => {
    if (refState === 'ready' && modalOpen && refData?.warehouses?.length === 1 && !form.getFieldValue('warehouseId')) {
      form.setFieldValue('warehouseId', refData.warehouses[0].id);
      commitDraft(editingId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refState, modalOpen, refData?.warehouses]);

  // When division changes, auto-clear rows with items that do not belong to the selected division
  useEffect(() => {
    if (watchDivision && refData?.items) {
      const next = rowsRef.current.map((r) => {
        if (!r.itemId) return r;
        const item = refData.items.find((i) => i.id === r.itemId);
        if (item?.divisionId && item.divisionId !== watchDivision) {
          return { ...r, itemId: undefined, uomId: undefined };
        }
        return r;
      });
      rowsRef.current = next;
      setRows(next);
      commitDraft(editingId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchDivision, refData?.items]);

  const totals = useMemo(() => {
    let gatePassTotal = 0; let receivedTotal = 0;
    for (const r of rows) {
      gatePassTotal += Number(r.gatePassQuantity || 0);
      receivedTotal += Number(r.receivedQuantity || 0);
    }
    return { gatePassTotal, receivedTotal, differenceTotal: gatePassTotal - receivedTotal };
  }, [rows]);

  // ─────────────────────────────────────────────────────────────────────────
  // RMR-01-C-C: live inventory balance preview (READ-ONLY — never posts).
  // One request per (warehouse × selected item set) — bulk, no N+1. Re-fetched
  // ONLY when an item or the receiving warehouse changes (or on Retry after a
  // failure). Typing Received Qty never triggers a network call.
  // ─────────────────────────────────────────────────────────────────────────
  const invPreviewSignature = useMemo(() => {
    const itemIds = [...new Set(rows.map((r) => r.itemId).filter((v): v is string => !!v))].sort();
    return `${watchWarehouse ?? ''}|${itemIds.join(',')}`;
  }, [rows, watchWarehouse]);

  useEffect(() => {
    const [warehouseId, idsStr] = invPreviewSignature.split('|');
    const itemIds = idsStr ? idsStr.split(',').filter(Boolean) : [];
    if (!warehouseId || itemIds.length === 0) {
      setInvPreview({});
      setInvPreviewLoading({});
      setInvPreviewError({});
      return;
    }
    const reqId = ++invPreviewReqRef.current;
    setInvPreviewLoading((prev) => {
      const next = { ...prev };
      itemIds.forEach((id) => { next[id] = true; });
      return next;
    });
    apiService
      .get<{ data: { companyId: string; warehouseId: string; items: BalancePreviewItem[] } }>(
        '/inventory/balances/preview',
        { warehouseId, itemIds: itemIds.join(',') },
      )
      .then((res) => {
        if (reqId !== invPreviewReqRef.current) return;
        const map: Record<string, BalancePreviewItem> = {};
        (res.data?.items || []).forEach((it) => { if (it?.itemId) map[it.itemId] = it; });
        setInvPreview(map);
        setInvPreviewError((prev) => {
          const next = { ...prev };
          itemIds.forEach((id) => { delete next[id]; });
          return next;
        });
      })
      .catch(() => {
        if (reqId !== invPreviewReqRef.current) return;
        setInvPreviewError((prev) => {
          const next = { ...prev };
          itemIds.forEach((id) => { next[id] = 'Unable to load current inventory.'; });
          return next;
        });
      })
      .finally(() => {
        if (reqId !== invPreviewReqRef.current) return;
        setInvPreviewLoading((prev) => {
          const next = { ...prev };
          itemIds.forEach((id) => { delete next[id]; });
          return next;
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invPreviewSignature, invPreviewRetryTick]);

  const invUomByItem: Record<string, string> = useMemo(() => {
    const byId: Record<string, string> = {};
    (refData?.uoms || []).forEach((u) => { if (u.id) byId[u.id] = u.code || u.symbol || u.name || ''; });
    return byId;
  }, [refData?.uoms]);

  const invCurrentOnHand = (itemId?: string): number | null => {
    if (!itemId) return null;
    const it = invPreview[itemId];
    if (!it) return null;
    if (!it.exists) return 0; // no balance record ⇒ real zero (shown with a hint, never a fabricated error)
    return Number(it.onHand);
  };

  const invPriorForItem = (itemId?: string): number => {
    if (!itemId) return 0;
    return priorPosted.filter((p) => p.itemId === itemId).reduce((s, p) => s + Number(p.receivedQuantity || 0), 0);
  };

  const invUomCodeForRow = (r: LineRow): string => {
    if (r.uomId && invUomByItem[r.uomId]) return invUomByItem[r.uomId];
    return r.itemId ? (invPreview[r.itemId]?.uomCode ?? '') : '';
  };

  const invAfterReceipt = (r: LineRow): number | null => {
    if (!r.itemId) return null;
    const cur = invCurrentOnHand(r.itemId);
    const received = Number(r.receivedQuantity);
    if (cur === null || !Number.isFinite(received) || received < 0) return null;
    return cur + received - invPriorForItem(r.itemId);
  };

  const invUomCodeForItem = (itemId: string): string => {
    const row = rows.find((r) => r.itemId === itemId);
    if (row?.uomId && invUomByItem[row.uomId]) return invUomByItem[row.uomId];
    return invPreview[itemId]?.uomCode ?? '';
  };

  const retryInvPreview = useCallback(() => setInvPreviewRetryTick((t) => t + 1), []);

  const invSummaryGroups = useMemo(() => {
    type G = {
      itemId: string; itemCode: string; itemName: string; uomCode: string;
      current: number | null; received: number; prior: number; after: number | null;
      missing: boolean; loading: boolean; error: string | null;
    };
    const groups: G[] = [];
    const byId = new Map<string, G>();
    const upsert = (itemId: string): G => {
      let g = byId.get(itemId);
      if (!g) {
        const item = refData?.items.find((i) => i.id === itemId);
        const existing = invPreview[itemId];
        g = {
          itemId,
          itemCode: item?.itemCode || existing?.itemCode || '',
          itemName: item?.name || existing?.itemName || '',
          uomCode: invUomCodeForItem(itemId),
          current: invCurrentOnHand(itemId),
          received: 0,
          prior: invPriorForItem(itemId),
          after: null,
          missing: !!existing && !existing.exists,
          loading: !!invPreviewLoading[itemId],
          error: invPreviewError[itemId] ?? null,
        };
        byId.set(itemId, g);
        groups.push(g);
      }
      return g;
    };
    rows.filter((r) => r.itemId).forEach((r) => {
      if (!r.itemId) return;
      const g = upsert(r.itemId);
      g.received += Number(r.receivedQuantity || 0);
      g.uomCode = invUomCodeForItem(r.itemId) || g.uomCode;
    });
    // Keep previously-posted items in the summary so the edit delta stays
    // truthful even if the user removes an item from the line grid.
    priorPosted.forEach((p) => { if (p.itemId) { upsert(p.itemId); } });
    groups.forEach((g) => {
      g.current = invCurrentOnHand(g.itemId);
      g.prior = invPriorForItem(g.itemId);
      g.after = g.current === null ? null : g.current + g.received - g.prior;
    });
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, refData?.items, invPreview, invPreviewLoading, invPreviewError, priorPosted, invUomCodeForItem]);

  // ─────────────────────────────────────────────────────────────────────────
  // Restore / open helpers
  // ─────────────────────────────────────────────────────────────────────────
  const applyDraftToForm = useCallback((draft: ReceiptDraft) => {
    const v = draft.values || {};
    form.setFieldsValue({
      divisionId: v.divisionId,
      sectionId: v.sectionId,
      departmentId: v.departmentId,
      warehouseId: v.warehouseId,
      receiptDate: v.receiptDate ? dayjs(v.receiptDate as any) : dayjs(),
      gatePassNo: v.gatePassNo,
      sourceNo: v.sourceNo,
      productionOrderId: v.productionOrderId,
      remarks: v.remarks,
    });
    const restoredRows = draft.rows && draft.rows.length ? draft.rows : [emptyLine()];
    rowsRef.current = restoredRows;
    setRows(restoredRows);
    const restoredFiles = (draft.pendingFiles || []).filter((p) => p && p.file);
    pendingFilesRef.current = restoredFiles.map((p) => ({ key: p.key, kind: p.kind, name: p.name, size: p.size, mime: p.mime, file: p.file }));
    setPendingFiles(pendingFilesRef.current);
    setEditingId(draft.editingId ?? null);
    setModalOpen(true);
  }, [form]);

  // Restore request from the persistent dock (either on mount or while mounted).
  useEffect(() => {
    const st = useRawReceiptDraftStore.getState();
    if (st.pendingRestore) {
      st.clearPendingRestore();
      if (st.draft) {
        if (refState === 'loading') setQueuedRestore(st.draft);
        else applyDraftToForm(st.draft);
      } else {
        openCreate();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRestoreValue]);

  // When returning to the page with a session that was open (not minimized),
  // restore it automatically so no entered data is lost.
  useEffect(() => {
    const st = useRawReceiptDraftStore.getState();
    if (st.draft && !st.minimized && !st.pendingRestore && !modalOpen) {
      if (refState === 'loading') setQueuedRestore(st.draft);
      else applyDraftToForm(st.draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply a queued restore once reference data is available.
  useEffect(() => {
    if (queuedRestore && refState !== 'loading') {
      applyDraftToForm(queuedRestore);
      setQueuedRestore(null);
    }
  }, [queuedRestore, refState, applyDraftToForm]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    form.resetFields();
    form.setFieldValue('receiptDate', dayjs());
    const next = [emptyLine()];
    rowsRef.current = next;
    setRows(next);
    pendingFilesRef.current = [];
    setPendingFiles([]);
    setExistingDocs([]);
    setPriorPosted([]);
    setModalOpen(true);
    useRawReceiptDraftStore.getState().updateDraft({
      editingId: null,
      values: form.getFieldsValue(),
      rows: next,
      pendingFiles: [],
    });
  }, [form]);

  const openEdit = useCallback(async (rec: ReceiptHeader) => {
    setEditingId(rec.id);
    try {
      const res = await apiService.get<{ data: ReceiptHeader }>(`/inventory/receipts/gate-pass/${rec.id}`);
      const d = res.data;
      form.setFieldsValue({
        divisionId: d.division?.id,
        sectionId: d.section?.id,
        departmentId: d.department?.id,
        warehouseId: d.warehouse?.id,
        receiptDate: d.receiptDate ? dayjs(d.receiptDate) : dayjs(),
        gatePassNo: d.gatePassNo || undefined,
        sourceNo: d.sourceNo || undefined,
        productionOrderId: d.productionOrderId || undefined,
        reference: d.reference || undefined,
        remarks: d.remarks || undefined,
      });
      const editRows = (d.lines || []).map((l) => ({
        key: l.id || `${Date.now()}-${l.lineNumber}`,
        itemId: l.item?.id,
        uomId: l.uom?.id,
        gatePassQuantity: l.gatePassQuantity !== undefined && l.gatePassQuantity !== null ? Number(l.gatePassQuantity) : undefined,
        receivedQuantity: l.receivedQuantity !== undefined && l.receivedQuantity !== null ? Number(l.receivedQuantity) : undefined,
      }));
      rowsRef.current = editRows.length ? editRows : [emptyLine()];
      setRows(rowsRef.current);
      setExistingDocs(d.documents || []);
      setPriorPosted(
        (d.lines || [])
          .filter((l) => l.item?.id && Number(l.receivedQuantity || 0) > 0)
          .map((l) => ({ itemId: l.item!.id, receivedQuantity: Number(l.receivedQuantity || 0) })),
      );
      pendingFilesRef.current = [];
      setPendingFiles([]);
      setModalOpen(true);
      commitDraft(rec.id);
    } catch (err: unknown) {
      message.error(formatApiError(err, 'Failed to load the receipt for editing.'));
    }
  }, [form, commitDraft, message]);

  const closeModalWithoutSave = useCallback(() => {
    if (submitting) return;
    useRawReceiptDraftStore.getState().closeDraft();
    pendingFilesRef.current = [];
    setPendingFiles([]);
    setExistingDocs([]);
    setPriorPosted([]);
    setModalOpen(false);
    setEditingId(null);
  }, [submitting]);

  const minimizeModal = useCallback(() => {
    commitDraft(editingId);
    useRawReceiptDraftStore.getState().setMinimized(true);
    setModalOpen(false);
  }, [commitDraft, editingId]);

  const handleDivisionChange = useCallback((value: string | undefined) => {
    form.setFieldValue('sectionId', undefined);
    form.setFieldValue('departmentId', undefined);
    commitDraft(editingId);
  }, [form, commitDraft, editingId]);

  const handleSectionChange = useCallback((value: string | undefined) => {
    form.setFieldValue('departmentId', undefined);
    commitDraft(editingId);
  }, [form, commitDraft, editingId]);

  const onItemSelect = useCallback((rowKey: string, itemId: string | undefined) => {
    const item = refData?.items.find((i) => i.id === itemId);
    const next = rowsRef.current.map((r) => (r.key === rowKey ? { ...r, itemId, uomId: item?.baseUomId || r.uomId } : r));
    rowsRef.current = next;
    setRows(next);
    commitDraft(editingId);
  }, [refData?.items, commitDraft, editingId]);

  const setRow = useCallback((rowKey: string, patch: Partial<LineRow>) => {
    const next = rowsRef.current.map((r) => (r.key === rowKey ? { ...r, ...patch } : r));
    rowsRef.current = next;
    setRows(next);
    commitDraft(editingId);
  }, [commitDraft, editingId]);

  const addLine = useCallback(() => {
    const next = [...rowsRef.current, emptyLine()];
    rowsRef.current = next;
    setRows(next);
    commitDraft(editingId);
  }, [commitDraft, editingId]);

  const removeLine = useCallback((key: string) => {
    const next = rowsRef.current.filter((o) => o.key !== key);
    rowsRef.current = next.length ? next : [emptyLine()];
    setRows(rowsRef.current);
    commitDraft(editingId);
  }, [commitDraft, editingId]);

  // Object-URL previews, revoked when a file is removed or on unmount.
  const photoPreview = useCallback((p: PendingUpload): string | undefined => {
    if (p.kind !== 'PHOTO') return undefined;
    if (previewRef.current[p.key]) return previewRef.current[p.key];
    try {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(p.file);
        previewRef.current[p.key] = url;
        return url;
      }
    } catch { /* ignore */ }
    return undefined;
  }, []);

  // Revoke object URLs for removed files, and on unmount.
  useEffect(() => {
    const keep = new Set(pendingFilesRef.current.map((f) => f.key));
    const map = previewRef.current;
    for (const k of Object.keys(map)) {
      if (!keep.has(k)) {
        try { URL.revokeObjectURL(map[k]); } catch { /* ignore */ }
        delete map[k];
      }
    }
  }, [pendingFiles]);

  useEffect(() => () => {
    Object.values(previewRef.current).forEach((u) => {
      try { URL.revokeObjectURL(u); } catch { /* ignore */ }
    });
    previewRef.current = {};
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Photos & attachments — added to the pending list the moment the user
  // selects them, uploaded ONLY after the receipt header save succeeds (upload
  // after-save). Cancel/failure therefore never leaves orphan bytes on disk.
  // ─────────────────────────────────────────────────────────────────────────
  const addPendingFiles = useCallback((files: File[], kind: 'PHOTO' | 'ATTACHMENT') => {
    const rejected: string[] = [];
    const accepted: PendingUpload[] = [];
    for (const f of files) {
      const name = f.name || 'file';
      const ext = name.split('.').pop()?.toLowerCase() || '';
      if (kind === 'PHOTO') {
        if (!PHOTO_MIME_ALLOW.includes(f.type) || !PHOTO_EXT_RE.test(name)) {
          rejected.push(`${name} (photos must be JPEG/PNG/WebP)`);
          continue;
        }
        if (f.size > PHOTO_FILE_MAX) {
          rejected.push(`${name} (over 5 MB)`);
          continue;
        }
      } else {
        if (!ATTACH_EXT_ALLOW.includes(ext) || !ATTACH_MIME_PREFIX.some((p) => f.type.startsWith(p))) {
          rejected.push(`${name} (type not allowed)`);
          continue;
        }
        if (f.size > ATTACH_FILE_MAX) {
          rejected.push(`${name} (over 10 MB)`);
          continue;
        }
      }
      accepted.push({ key: uid(), kind, name, size: f.size, mime: f.type, file: f });
    }
    if (accepted.length) {
      const next = [...pendingFilesRef.current, ...accepted];
      pendingFilesRef.current = next;
      setPendingFiles(next);
      commitDraft(editingId);
    }
    if (rejected.length) {
      message.warning(`Skipped ${rejected.length} file(s): ${rejected.join('; ')}`);
    }
  }, [commitDraft, editingId, message]);

  const removePendingFile = useCallback((key: string) => {
    const next = pendingFilesRef.current.filter((f) => f.key !== key);
    pendingFilesRef.current = next;
    setPendingFiles(next);
    commitDraft(editingId);
  }, [commitDraft, editingId]);

  const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) addPendingFiles(files, 'PHOTO');
  }, [addPendingFiles]);

  const handleAttachSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) addPendingFiles(files, 'ATTACHMENT');
  }, [addPendingFiles]);

  const handleRemoveExistingDoc = useCallback(async (doc: ReceiptDocument) => {
    if (!editingId) return;
    try {
      await apiService.delete<{ success: boolean }>(`/inventory/receipts/gate-pass/${editingId}/documents/${doc.id}`);
      setExistingDocs((prev) => prev.filter((d) => d.id !== doc.id));
      message.success('Document removed.');
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to remove the document.'));
    }
  }, [editingId, message]);

  // ─────────────────────────────────────────────────────────────────────────
  // WhatsApp sharing — the message is built client-side from the REAL receipt
  // data. When a WhatsApp provider setting is configured + enabled the backend
  // enqueues a delivery; otherwise the button falls back to wa.me with the
  // message pre-filled (explicitly "Open WhatsApp", never a fake "sent").
  // ─────────────────────────────────────────────────────────────────────────
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [waSending, setWaSending] = useState(false);
  const [waReceiptId, setWaReceiptId] = useState<string | null>(null);
  const [waShareInfo, setWaShareInfo] = useState<ShareReceiptInfo | null>(null);
  const [waOutcome, setWaOutcome] = useState<{ type: 'queued' | 'unconfigured' | 'copied' | 'error'; text: string } | null>(null);

  const waHref = useMemo(() => {
    const digits = normalizeWaPhone(waPhone);
    return digits ? waLink(digits, waMessage) : '';
  }, [waPhone, waMessage]);

  const buildShareInfoFromValues = useCallback((receiptCode: string, values: any): ShareReceiptInfo => ({
    receiptCode,
    gatePassNo: values.gatePassNo || undefined,
    sourceNo: values.sourceNo || undefined,
    receiptDate: values.receiptDate ? values.receiptDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    divisionName: refData?.divisions.find((d) => d.id === values.divisionId)?.name,
    sectionName: refData?.sections.find((s) => s.id === values.sectionId)?.name,
    departmentName: refData?.departments.find((d) => d.id === values.departmentId)?.name,
    warehouseName: refData?.warehouses.find((w) => w.id === values.warehouseId)?.name,
    lines: rows.filter((r) => r.itemId).map((r) => {
      const item = refData?.items.find((i) => i.id === r.itemId);
      const uom = refData?.uoms.find((u) => u.id === r.uomId);
      return {
        itemCode: item?.itemCode,
        itemName: item?.name,
        uomCode: uom?.code || uom?.symbol,
        gatePassQuantity: Number(r.gatePassQuantity || 0),
        receivedQuantity: Number(r.receivedQuantity || 0),
        difference: Number(r.gatePassQuantity || 0) - Number(r.receivedQuantity || 0),
      };
    }),
    gatePassTotal: totals.gatePassTotal,
    receivedTotal: totals.receivedTotal,
    differenceTotal: totals.differenceTotal,
  }), [refData, rows, totals]);

  const buildShareInfoFromDetail = useCallback((d: ReceiptHeader): ShareReceiptInfo => ({
    receiptCode: d.receiptCode,
    gatePassNo: d.gatePassNo || undefined,
    sourceNo: d.sourceNo || undefined,
    receiptDate: d.receiptDate,
    divisionName: d.division?.name,
    sectionName: d.section?.name,
    departmentName: d.department?.name,
    warehouseName: d.warehouse?.name,
    lines: (d.lines || []).map((l) => ({
      itemCode: l.item?.itemCode,
      itemName: l.item?.name,
      uomCode: l.uom?.code || l.uom?.symbol,
      gatePassQuantity: Number(l.gatePassQuantity || 0),
      receivedQuantity: Number(l.receivedQuantity || 0),
      difference: Number(l.difference || 0),
    })),
    gatePassTotal: Number(d.gatePassTotal || 0),
    receivedTotal: Number(d.receivedTotal || 0),
    differenceTotal: Number(d.differenceTotal || 0),
  }), []);

  const openWaShare = useCallback((info: ShareReceiptInfo, receiptId?: string | null) => {
    setWaShareInfo(info);
    setWaReceiptId(receiptId || editingId);
    setWaPhone('');
    setWaMessage(buildReceiptWhatsAppMessage(info));
    setWaOutcome(null);
    setWaOpen(true);
  }, [editingId]);

  // Action-column WhatsApp: the list row carries no item lines, so the REAL
  // detail is fetched (same endpoint as View) before the share dialog opens —
  // the message always reflects the saved item breakdown, never a stub.
  const handleRowWaShare = useCallback(async (rec: ReceiptHeader) => {
    const hide = message.loading('Loading receipt for sharing…', 0);
    try {
      const res = await apiService.get<{ data: ReceiptHeader }>(`/inventory/receipts/gate-pass/${rec.id}`);
      openWaShare(buildShareInfoFromDetail(res.data), rec.id);
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to load the receipt for sharing.'));
    } finally {
      hide();
    }
  }, [openWaShare, buildShareInfoFromDetail, message]);

  const handleWaCopy = useCallback(async () => {
    if (!waMessage) return;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(waMessage);
      } else {
        throw new Error('clipboard API unavailable');
      }
      setWaOutcome({ type: 'copied', text: 'Message copied to clipboard.' });
    } catch {
      setWaOutcome({ type: 'error', text: 'Clipboard is unavailable — select and copy the message manually.' });
    }
  }, [waMessage]);

  const handleWaSend = useCallback(async () => {
    const phone = normalizeWaPhone(waPhone);
    if (!phone) {
      setWaOutcome({ type: 'error', text: 'Enter a valid phone number including the country code, e.g. 923001234567.' });
      return;
    }
    if (!waMessage.trim()) {
      setWaOutcome({ type: 'error', text: 'Write a message to share.' });
      return;
    }
    if (!waReceiptId) {
      setWaOutcome({ type: 'error', text: 'The receipt must be saved before sharing.' });
      return;
    }
    setWaSending(true);
    try {
      const res = await apiService.post<{ success?: boolean; data?: { enqueued: boolean; deliveryId?: string; reason?: string } }>(
        `/inventory/receipts/gate-pass/${waReceiptId}/whatsapp-share`,
        { phone, message: waMessage.trim() },
      );
      const data = (res && res.data) as { enqueued?: boolean; deliveryId?: string; reason?: string } | undefined;
      if (data && data.enqueued) {
        setWaOutcome({ type: 'queued', text: `Message queued for WhatsApp delivery in the background (delivery ID ${data.deliveryId || '-'}).` });
      } else {
        const link = waLink(phone, waMessage.trim());
        if (link) {
          try { window.open(link, '_blank', 'noopener,noreferrer'); } catch { /* pop-up blocked */ }
        }
        setWaOutcome({ type: 'unconfigured', text: 'WhatsApp provider is not configured — opened WhatsApp with the message pre-filled so it can be sent manually.' });
      }
    } catch (err: any) {
      setWaOutcome({ type: 'error', text: formatApiError(err, 'Failed to share the receipt.') });
    } finally {
      setWaSending(false);
    }
  }, [waPhone, waMessage, waReceiptId]);

  // After the header save succeeds: upload each pending file to THAT receipt.
  // A partial failure is surfaced honestly with an upload-only retry — the
  // receipt itself is never duplicated and previously-saved files are skipped.
  const finishSaveFlow = useCallback(async (receiptId: string, resultCode: string, values: any): Promise<boolean> => {
    const todo = pendingFilesRef.current;
    pendingFilesRef.current = [];
    setPendingFiles([]);
    const failed: string[] = [];
    const remaining: PendingUpload[] = [];
    for (const p of todo) {
      try {
        const fd = new FormData();
        fd.append('file', p.file, p.name);
        fd.append('kind', p.kind);
        await apiService.upload(`/inventory/receipts/gate-pass/${receiptId}/documents`, fd);
      } catch {
        failed.push(p.name);
        remaining.push(p);
      }
    }
    if (remaining.length) {
      pendingFilesRef.current = remaining;
      setPendingFiles(remaining);
      setSaveDialogError(
        `Receipt ${resultCode} was saved, but ${failed.length} of ${todo.length} file upload(s) failed (${failed.join(', ')}). ` +
        'Use Retry to upload only the remaining file(s) — the receipt was not duplicated.',
      );
      setSaveDialogRetry(() => () => { setSaveDialogPhase('loading'); setSaveDialogError(undefined); void finishSaveFlow(receiptId, resultCode, values); });
      setSaveDialogSuccessTitle(editingId ? 'Receipt Updated, Some Files Pending' : 'Receipt Confirmed, Some Files Pending');
      setSaveDialogPhase('error');
      return false;
    }

    setSaveDialogResult({
      title: editingId ? 'Receipt Updated' : 'Receipt Confirmed',
      recordType: 'Receipt Code',
      recordCode: resultCode,
      recordName: values.gatePassNo ? `Gate Pass #${values.gatePassNo}` : undefined,
      message: `${rows.filter((r) => r.itemId).length} raw material line(s) processed. Received Qty: ${formatNumber(totals.receivedTotal, 2)}`,
      extra: (
        <Button type="primary" ghost icon={<WhatsAppOutlined />} onClick={() => openWaShare(buildShareInfoFromValues(resultCode, values), receiptId)}>
          Share on WhatsApp
        </Button>
      ),
    });
    setSaveDialogSuccessTitle(editingId ? 'Receipt Updated Successfully' : 'Receipt Confirmed Successfully');
    setSaveDialogPhase('success');

    useRawReceiptDraftStore.getState().closeDraft();
    setExistingDocs([]);
    setModalOpen(false);
    setEditingId(null);
    form.resetFields();
    const fresh = [emptyLine()];
    rowsRef.current = fresh;
    setRows(fresh);
    setPage(1);
    void loadList(1);
    return true;
  }, [editingId, form, rows, totals, loadList, openWaShare, buildShareInfoFromValues]);

  const onFinish = async (values: any) => {
    if (!rows.length) { message.error('Add at least one raw material line.'); return; }
    const invalid = rows.find((r) => !r.itemId || !r.uomId);
    if (invalid) { message.error('Every line needs an item and a UOM.'); return; }
    const hasReceived = rows.some((r) => Number(r.receivedQuantity || 0) > 0);
    if (!hasReceived) { message.error('At least one line must have a received quantity greater than zero.'); return; }
    const duplicates = rows.filter((r) => rows.filter((o) => o.itemId === r.itemId && o.itemId).length > 1);
    if (duplicates.length) { message.error('An item can only appear once per receipt.'); return; }
    for (const p of pendingFilesRef.current) {
      const ext = p.name.split('.').pop()?.toLowerCase() || '';
      if (p.kind === 'PHOTO' && (!PHOTO_MIME_ALLOW.includes(p.mime) || !PHOTO_EXT_RE.test(p.name) || p.size > PHOTO_FILE_MAX)) {
        message.error(`"${p.name}" is not a valid photo (JPEG/PNG/WebP up to 5 MB). Remove it before saving.`);
        return;
      }
      if (p.kind === 'ATTACHMENT' && (!ATTACH_EXT_ALLOW.includes(ext) || p.size > ATTACH_FILE_MAX)) {
        message.error(`"${p.name}" is not a valid attachment (max 10 MB). Remove it before saving.`);
        return;
      }
    }

    setSubmitting(true);
    setSaveDialogVisible(true);
    setSaveDialogPhase('loading');
    setSaveDialogSuccessTitle(editingId ? 'Receipt Updated Successfully' : 'Receipt Confirmed Successfully');
    setSaveDialogError(undefined);

    const payload = {
      divisionId: values.divisionId,
      sectionId: values.sectionId,
      departmentId: values.departmentId,
      warehouseId: values.warehouseId,
      receiptDate: values.receiptDate ? values.receiptDate.format('YYYY-MM-DD') : undefined,
      gatePassNo: values.gatePassNo || undefined,
      sourceNo: values.sourceNo || undefined,
      productionOrderId: values.productionOrderId || undefined,
      reference: values.reference || undefined,
      remarks: values.remarks || undefined,
      items: rows.map((r) => ({
        itemId: r.itemId,
        uomId: r.uomId,
        gatePassQuantity: Number(r.gatePassQuantity || 0),
        receivedQuantity: Number(r.receivedQuantity || 0),
      })),
    };

    try {
      let resultReceiptCode = editingId ? (list.find((x) => x.id === editingId)?.receiptCode || editingId) : '';
      let resultId = editingId || '';
      if (editingId) {
        await apiService.patch<{ success: boolean }>(`/inventory/receipts/gate-pass/${editingId}`, payload);
      } else {
        const res = await apiService.post<{ success: boolean; data?: any }>('/inventory/receipts/gate-pass', payload);
        resultId = res.data?.id || resultId;
        resultReceiptCode = res.data?.receiptCode || 'Confirmed';
      }
      await finishSaveFlow(resultId, resultReceiptCode, values);
    } catch (err: any) {
      const errMsg = formatApiError(err, 'Failed to save the receipt.');
      setSaveDialogError(errMsg);
      setSaveDialogRetry(() => () => onFinish(values));
      setSaveDialogPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (rec: ReceiptHeader) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await apiService.get<{ data: ReceiptHeader }>(`/inventory/receipts/gate-pass/${rec.id}`);
      setDetail(res.data);
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to load the receipt detail.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const openInventory = async (rec: ReceiptHeader) => {
    setInventoryOpen(true);
    setInventoryLoading(true);
    setInventoryError(null);
    setInventoryData(null);
    try {
      const res = await apiService.get<{ data: ReceiptInventoryData }>(`/inventory/receipts/gate-pass/${rec.id}/inventory`);
      setInventoryData(res.data);
    } catch (err: any) {
      setInventoryError(formatApiError(err, 'Failed to load inventory status.'));
    } finally {
      setInventoryLoading(false);
    }
  };

  const handleDelete = async (rec: ReceiptHeader) => {
    try {
      await apiService.delete<{ success: boolean }>(`/inventory/receipts/gate-pass/${rec.id}`);
      message.success('Receipt deleted and inventory balance reversed.');
      void loadList(page);
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to delete the receipt.'));
    }
  };

  const applyFilter = (patch: typeof filters) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setPage(1);
    void loadList(1, next);
  };

  const columns: ColumnsType<ReceiptHeader> = [
    { title: 'Receipt Code', dataIndex: 'receiptCode', key: 'receiptCode', width: 130, render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Date', dataIndex: 'receiptDate', key: 'receiptDate', width: 110, render: (v: string) => (v ? dayjs(v).format('DD-MMM-YYYY') : '-') },
    { title: 'Gate Pass No', dataIndex: 'gatePassNo', key: 'gatePassNo', width: 130, render: (v?: string) => v || '-' },
    { title: 'Division', key: 'division', width: 160, ellipsis: true, render: (_, r) => (r.division ? `${r.division.divisionCode ?? ''} ${r.division.name}`.trim() : '-') },
    { title: 'Section', key: 'section', width: 140, ellipsis: true, render: (_, r) => (r.section?.name || '-') },
    { title: 'Department', key: 'department', width: 160, ellipsis: true, render: (_, r) => (r.department?.name || '-') },
    { title: 'Warehouse', key: 'warehouse', width: 160, ellipsis: true, render: (_, r) => (r.warehouse?.name || '-') },
    { title: 'Lines', dataIndex: 'lineCount', key: 'lineCount', width: 60, align: 'center' as const, render: (v?: number) => v ?? 0 },
    { title: 'Gate Pass Qty', dataIndex: 'gatePassTotal', key: 'gatePassTotal', width: 110, align: 'right' as const, render: (v?: number) => formatNumber(v, 2) },
    { title: 'Received Qty', dataIndex: 'receivedTotal', key: 'receivedTotal', width: 110, align: 'right' as const, render: (v?: number) => formatNumber(v, 2) },
    {
      title: 'Difference', dataIndex: 'differenceTotal', key: 'differenceTotal', width: 110, align: 'right' as const,
      render: (v?: number) => (
        <span style={{ color: Number(v || 0) === 0 ? undefined : 'var(--theme-warning, #d48806)' }}>
          {formatNumber(v, 2)}
        </span>
      ),
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 105, render: (v: string) => <Tag color={v === 'CONFIRMED' ? 'green' : v === 'DRAFT' ? 'gold' : 'red'}>{v}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 150,
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="View">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)} style={{ color: 'var(--theme-primary)' }} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} style={{ color: 'var(--theme-warning, #d48806)' }} />
          </Tooltip>
          <Tooltip title="Share on WhatsApp">
            <Button type="text" size="small" icon={<WhatsAppOutlined />} data-testid="rm-action-wa" onClick={() => handleRowWaShare(r)} style={{ color: '#25D366' }} />
          </Tooltip>
          <Popconfirm
            title="Delete this receipt?"
            description="Posted stock for this receipt will be reversed. This cannot be undone."
            onConfirm={() => handleDelete(r)}
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const lineColumns: ColumnsType<LineRow> = [
    {
      title: 'Raw Material', key: 'itemId', width: 280,
      render: (_, r) => (
        <Select showSearch optionFilterProp="label" placeholder="Select raw material" value={r.itemId}
          onChange={(v) => onItemSelect(r.key, v)} style={{ width: '100%' }}
          options={itemOptions} virtual listHeight={SECTION_SELECT_LIST_HEIGHT}
          notFoundContent={refState === 'loading' ? <Text type="secondary">Loading items…</Text> : 'No raw materials in this division'}
          disabled={refState === 'error'} />
      ),
    },
    {
      title: 'UOM', key: 'uomId', width: 100,
      render: (_, r) => (
        <Select showSearch optionFilterProp="label" placeholder="UOM" value={r.uomId} onChange={(v) => setRow(r.key, { uomId: v })} style={{ width: '100%' }}
          options={uomOptions} virtual listHeight={SECTION_SELECT_LIST_HEIGHT} />
      ),
    },
    {
      title: <span>Gate Pass Qty</span>, key: 'gatePassQuantity', width: 140,
      render: (_, r) => (
        <InputNumber
          min={0}
          precision={2}
          value={r.gatePassQuantity}
          onChange={(v) => setRow(r.key, { gatePassQuantity: v !== null && v !== undefined ? Number(v) : undefined })}
          style={{ width: '100%' }}
          placeholder="0.00"
        />
      ),
    },
    {
      title: <span>Received Qty <Text type="danger">*</Text></span>, key: 'receivedQuantity', width: 140,
      render: (_, r) => (
        <InputNumber
          min={0}
          precision={2}
          value={r.receivedQuantity}
          onChange={(v) => setRow(r.key, { receivedQuantity: v !== null && v !== undefined ? Number(v) : undefined })}
          style={{ width: '100%' }}
          placeholder="0.00"
        />
      ),
    },
    {
      title: <span>Current Inventory / After</span>, key: 'inventory', width: 200,
      render: (_, r) => {
        if (!r.itemId) {
          return <span className="rmr-inv-row-empty">—</span>;
        }
        const loading = !!invPreviewLoading[r.itemId];
        const error = invPreviewError[r.itemId];
        const cur = invCurrentOnHand(r.itemId);
        const after = invAfterReceipt(r);
        const uom = invUomCodeForRow(r);
        if (loading) {
          return (
            <div className="rmr-inv-row" data-testid={`rm-preview-${r.itemId}-loading`}>
              <Spin size="small" /> <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Loading…</Text>
            </div>
          );
        }
        if (error) {
          return (
            <div className="rmr-inv-row rmr-inv-row-error" data-testid={`rm-preview-${r.itemId}`}>
              <Text type="danger" data-testid="rm-preview-error" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{error}</Text>
              <Button type="link" size="small" icon={<ReloadOutlined />} style={{ padding: 0, height: 'auto', fontSize: 11 }} onClick={retryInvPreview} data-testid={`rm-preview-retry-${r.itemId}`}>Retry</Button>
            </div>
          );
        }
        const missing = !!invPreview[r.itemId] && !invPreview[r.itemId].exists;
        return (
          <div className="rmr-inv-row" data-testid={`rm-preview-${r.itemId}`}>
            <div className="rmr-inv-row-line">
              <span className="rmr-inv-row-label">Current</span>
              <span className="rmr-inv-row-value">{formatNumber(cur, 2)} {uom}</span>
            </div>
            {missing && !error && <div className="rmr-inv-row-note" data-testid="rm-preview-missing">No existing balance record</div>}
            {after !== null && (
              <div className="rmr-inv-row-line">
                <span className="rmr-inv-row-label">After Receipt</span>
                <span className="rmr-inv-row-value" style={{ color: 'var(--theme-success, #52c41a)' }}>{formatNumber(after, 2)} {uom}</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Difference', key: 'difference', width: 110, align: 'right' as const,
      render: (_, r) => {
        const diff = Number(r.gatePassQuantity || 0) - Number(r.receivedQuantity || 0);
        return (
          <span style={{ fontWeight: 600, color: diff === 0 ? undefined : 'var(--theme-warning, #d48806)' }}>
            {formatNumber(diff, 2)}
          </span>
        );
      },
    },
    {
      title: '', key: 'actions', width: 50,
      render: (_, r) => (
        <Tooltip title="Remove line">
          <Button type="text" size="small" icon={<DeleteOutlined />} disabled={rows.length === 1} onClick={() => removeLine(r.key)} />
        </Tooltip>
      ),
    },
  ];

  // Register the page title/subtitle + header actions into the shared ERP header.
  const headerExtra = useMemo(() => (
    <Space wrap size={8}>
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Receipt (Gate Pass)</Button>
      <Button icon={<ReloadOutlined />} onClick={() => loadList(page)}>Refresh</Button>
    </Space>
  ), [openCreate, loadList, page]);

  const isEditing = editingId !== null;

  return (
    <div className="erp-dashboard">
      <PageHeader
        icon={<InboxOutlined />}
        title="Raw Material Receiving"
        subtitle="Multi-item Gate Pass receiving. Inventory increases by Received quantity only."
        extra={headerExtra}
      />

      <Card className="erp-section-card" title={<Space><InboxOutlined /> Receiving History</Space>}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Select placeholder="Status" allowClear style={{ width: 140 }} value={filters.status}
            onChange={(v) => applyFilter({ status: v })}
            options={[{ value: 'CONFIRMED', label: 'Confirmed' }, { value: 'DRAFT', label: 'Draft' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
          <Select placeholder="Warehouse" allowClear showSearch optionFilterProp="label" style={{ width: 200 }} value={filters.warehouseId}
            onChange={(v) => applyFilter({ warehouseId: v })}
            options={warehouseOptions} virtual listHeight={160} />
          <Input placeholder="Gate Pass No" allowClear style={{ width: 160 }} value={filters.gatePassNo}
            onChange={(e) => applyFilter({ gatePassNo: e.target.value || undefined })} />
          <DatePicker.RangePicker
            value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)] : undefined}
            onChange={(v) => applyFilter({ dateFrom: v?.[0] ? v[0].format('YYYY-MM-DD') : undefined, dateTo: v?.[1] ? v[1].format('YYYY-MM-DD') : undefined })}
          />
        </Space>
        {listState === 'error' ? (
          <Alert
            type="error"
            showIcon
            message="Receipts could not be loaded"
            description={
              <Space direction="vertical" size={8} style={{ marginTop: 4 }}>
                <span>Receipts could not be loaded. Please ensure your user has an assigned company and required manufacturing permissions, or try refreshing.</span>
                <Button size="small" type="primary" ghost icon={<ReloadOutlined />} onClick={() => loadList(page)}>
                  Retry Loading
                </Button>
              </Space>
            }
          />
        ) : (
          <Table columns={columns} dataSource={list} rowKey="id" loading={listLoading} scroll={{ x: 1500 }}
            locale={{ emptyText: listLoading ? 'Loading receipts...' : 'No receipts found.' }}
            pagination={{ current: page, total, pageSize, showSizeChanger: false, onChange: (p) => { setPage(p); void loadList(p); } }} />
        )}
      </Card>

      {/* Enterprise Draggable, Resizable Modal — centered, mask not closable */}
      <DraggableResizableModal
        title={<Space><InboxOutlined /> {isEditing ? 'Edit Receipt' : 'New Receipt (Gate Pass)'}</Space>}
        subtitle="Real-time multi-item Gate Pass entry with live calculation and division-matched inventory"
        open={modalOpen}
        onCancel={closeModalWithoutSave}
        onMinimize={minimizeModal}
        width={1180}
        height={760}
        minWidth={640}
        minHeight={520}
        footer={null}
        destroyOnHidden
        maskClosable={false}
        keyboard={false}
      >
        <div className="raw-material-modal-split-container">
          {/* Left Column: Form Controls */}
          <div className="raw-material-modal-form-col">
            <Form form={form} layout="vertical" onFinish={onFinish} onValuesChange={() => commitDraft(editingId)}>
              <Card size="small" title="SECTION 1 · Organization & Warehouse" className="erp-section-card-inner" style={{ marginBottom: 12 }}>
                <Row gutter={12}>
                  <Col xs={24} md={8}>
                    <Form.Item name="divisionId" label={<span>Division <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select Division' }]}>
                      <Select showSearch optionFilterProp="label" placeholder="Select Division"
                        onChange={handleDivisionChange}
                        loading={refState === 'loading'} status={refState === 'error' ? 'error' : undefined}
                        options={divisionOptions} virtual listHeight={SECTION_SELECT_LIST_HEIGHT}
                        notFoundContent={refState === 'loading' ? <Text type="secondary">Loading…</Text> : 'No divisions'} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="sectionId" label={<span>Section <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select Section' }]}>
                      <Select showSearch optionFilterProp="label" placeholder={watchDivision ? 'Select Section' : 'Select Division first'} disabled={!watchDivision}
                        onChange={handleSectionChange}
                        loading={refState === 'loading'} status={refState === 'error' ? 'error' : undefined}
                        options={sectionOptions} virtual listHeight={SECTION_SELECT_LIST_HEIGHT}
                        notFoundContent={refState === 'loading' ? <Text type="secondary">Loading…</Text> : 'No sections'} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="departmentId" label={<span>Department <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select Department' }]}>
                      <Select showSearch optionFilterProp="label" placeholder={watchSection ? 'Select Department' : 'Select Section first'} disabled={!watchSection}
                        loading={refState === 'loading'} status={refState === 'error' ? 'error' : undefined}
                        options={departmentOptions} virtual listHeight={SECTION_SELECT_LIST_HEIGHT}
                        notFoundContent={refState === 'loading' ? <Text type="secondary">Loading…</Text> : 'No departments'} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="warehouseId" label={<span>Receiving Warehouse <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select warehouse' }]}>
                      <Select showSearch optionFilterProp="label" placeholder="Select warehouse"
                        status={refState === 'error' ? 'error' : undefined}
                        options={warehouseOptions} virtual listHeight={SECTION_SELECT_LIST_HEIGHT} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="receiptDate" label={<>Receipt Date</>}>
                      <DatePicker style={{ width: '100%' }} placeholder="Defaults to today" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="gatePassNo" label="Gate Pass No">
                      <Input placeholder="e.g. GP-10250" maxLength={50} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="sourceNo" label="Source / DC No">
                      <Input placeholder="Optional" maxLength={50} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="productionOrderId" label="Production Order">
                      <Select allowClear showSearch optionFilterProp="label" placeholder="Optional"
                        options={productionOrderOptions} virtual listHeight={160} />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <Card
                size="small"
                title="SECTION 2 · Gate Pass Items"
                className="erp-section-card-inner"
                style={{ marginBottom: 12 }}
                extra={<Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addLine}>Add Item</Button>}
              >
                {refState === 'error' ? (
                  <Alert type="error" showIcon message="Reference data could not be loaded. Please refresh the page." />
                ) : (
                  <Table columns={lineColumns} dataSource={rows} rowKey="key" pagination={false} size="small" scroll={{ x: 1120 }}
                    locale={{ emptyText: 'No lines added yet.' }} />
                )}
                <Row gutter={12} style={{ marginTop: 12 }}>
                  <Col xs={24} sm={8} style={{ textAlign: 'right' }}>
                    <Text strong>Gate Pass Total:</Text> <Text>{formatNumber(totals.gatePassTotal, 2)}</Text>
                  </Col>
                  <Col xs={24} sm={8} style={{ textAlign: 'right' }}>
                    <Text strong>Received Total:</Text> <Text style={{ color: 'var(--theme-success, #52c41a)' }}>{formatNumber(totals.receivedTotal, 2)}</Text>
                  </Col>
                  <Col xs={24} sm={8} style={{ textAlign: 'right' }}>
                    <Text strong>Difference:</Text> <Text style={{ color: totals.differenceTotal !== 0 ? 'var(--theme-warning, #d48806)' : undefined }}>{formatNumber(totals.differenceTotal, 2)}</Text>
                  </Col>
                </Row>
              </Card>

              {/* ── RMR-01-C-C: dedicated bottom summary — inventory impact preview (read-only) ── */}
              <Card
                size="small"
                title={<Space><DatabaseOutlined /> INVENTORY IMPACT PREVIEW</Space>}
                className="erp-section-card-inner"
                style={{ marginBottom: 12 }}
                data-testid="rm-inv-preview-summary"
              >
                {invSummaryGroups.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Select raw materials and a receiving warehouse to preview the real inventory impact.
                  </Text>
                ) : (
                  <div className="rmr-inv-summary">
                    {invSummaryGroups.map((g) => {
                      const uom = g.uomCode || '';
                      return (
                        <div key={g.itemId} className="rmr-inv-summary-item" data-testid={`rm-inv-summary-${g.itemId}`}>
                          <div className="rmr-inv-summary-head">
                            <span className="rmr-inv-summary-title">{g.itemCode || '—'}</span>
                            {g.itemName && <Text type="secondary" style={{ fontSize: 11 }}>{g.itemName}</Text>}
                          </div>
                          {g.error ? (
                            <div className="rmr-inv-summary-status" data-testid="rm-inv-summary-error">
                              <Text type="danger" style={{ fontSize: 12 }}>{g.error}</Text>
                              <Button type="link" size="small" icon={<ReloadOutlined />} style={{ padding: 0, fontSize: 12 }} onClick={retryInvPreview} data-testid="rm-inv-summary-retry">Retry</Button>
                            </div>
                          ) : g.loading ? (
                            <div className="rmr-inv-summary-status" data-testid="rm-inv-summary-loading">
                              <Spin size="small" /> <Text type="secondary" style={{ fontSize: 12 }}>Loading current inventory…</Text>
                            </div>
                          ) : (
                            <div className="rmr-inv-summary-grid">
                              <div className="rmr-inv-summary-cell">
                                <span className="rmr-inv-summary-label">Current Inventory</span>
                                <span className="rmr-inv-summary-value">{formatNumber(g.current ?? 0, 2)} {uom}</span>
                              </div>
                              <div className="rmr-inv-summary-op">+</div>
                              <div className="rmr-inv-summary-cell">
                                <span className="rmr-inv-summary-label">This Receipt</span>
                                <span className="rmr-inv-summary-value">{formatNumber(g.received, 2)} {uom}</span>
                              </div>
                              <div className="rmr-inv-summary-op">=</div>
                              <div className="rmr-inv-summary-cell">
                                <span className="rmr-inv-summary-label">Balance After Receipt</span>
                                <span className="rmr-inv-summary-value rmr-inv-summary-after">{g.after !== null ? formatNumber(g.after, 2) : '—'} {uom}</span>
                              </div>
                            </div>
                          )}
                          {g.missing && !g.error && !g.loading && (
                            <div className="rmr-inv-row-note" data-testid="rm-inv-summary-missing">No existing balance record — current treated as 0</div>
                          )}
                          {g.prior > 0 && !g.error && !g.loading && (
                            <div className="rmr-inv-summary-prior" data-testid="rm-inv-summary-prior">
                              Prior posted {formatNumber(g.prior, 2)} {uom} from the existing receipt is deducted here so editing never double-counts stock.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="rmr-inv-summary-foot">
                  UOMs are kept separate — different units are never summed. This preview is read-only and never posts inventory.
                </div>
              </Card>

              <Card
                size="small"
                title={<Space><PaperClipOutlined /> SECTION 3 · Documents &amp; Photos {pendingFiles.length > 0 ? <Tag color="blue">{pendingFiles.length} pending</Tag> : null}</Space>}
                className="erp-section-card-inner"
                style={{ marginBottom: 12 }}
              >
                <div className="rmr-upload-group">
                  <Space wrap>
                    <Button icon={<CameraOutlined />} onClick={() => photoInputRef.current?.click()} data-testid="rm-photo-btn">Take / Add Photo</Button>
                    <Button icon={<PaperClipOutlined />} onClick={() => attachInputRef.current?.click()} data-testid="rm-attach-btn">Add Attachment</Button>
                  </Space>
                  <span className="rmr-upload-hint">
                    Photos: JPEG / PNG / WebP (≤ 5 MB). Attachments: PDF, Office, txt, csv (≤ 10 MB).
                    Files upload after the receipt is saved — nothing is sent to the server before then.
                  </span>
                  <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple style={{ display: 'none' }} onChange={handlePhotoSelect} data-testid="rm-photo-input" />
                  <input ref={attachInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" multiple style={{ display: 'none' }} onChange={handleAttachSelect} data-testid="rm-attach-input" />
                </div>

                {isEditing && existingDocs.length > 0 && (
                  <div className="rmr-existing-docs">
                    <div className="rmr-doc-block-label">Current documents on file</div>
                    <div className="rmr-pending-list">
                      {existingDocs.map((doc) => (
                        doc.kind === 'PHOTO' ? (
                          <div key={doc.id} className="rmr-pending-photo">
                            <img src={doc.fileUrl} alt={doc.fileName} className="rmr-preview-thumb" />
                            <div className="rmr-pending-meta">
                              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="rmr-pending-link">{doc.fileName}</a>
                            </div>
                            <Popconfirm title="Remove this document?" onConfirm={() => handleRemoveExistingDoc(doc)} okText="Remove" okButtonProps={{ danger: true }}>
                              <Button size="small" danger icon={<DeleteOutlined />} data-testid={`rm-remove-existing-${doc.id}`} aria-label={`Remove ${doc.fileName}`} />
                            </Popconfirm>
                          </div>
                        ) : (
                          <div key={doc.id} className="rmr-pending-attach">
                            <PaperClipOutlined />
                            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="rmr-pending-link">{doc.fileName}</a>
                            <span className="rmr-pending-size">{doc.fileSize ? formatBytes(doc.fileSize) : ''}</span>
                            <Popconfirm title="Remove this document?" onConfirm={() => handleRemoveExistingDoc(doc)} okText="Remove" okButtonProps={{ danger: true }}>
                              <Button size="small" danger icon={<DeleteOutlined />} data-testid={`rm-remove-existing-${doc.id}`} aria-label={`Remove ${doc.fileName}`} />
                            </Popconfirm>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}

                {pendingFiles.length === 0 ? (
                  <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                    {isEditing ? 'No new documents pending — add photos of the received stock or supporting gate-pass files above.' : 'No documents pending.'}
                  </Text>
                ) : (
                  <div className="rmr-pending-list">
                    {pendingFiles.map((p) => (
                      p.kind === 'PHOTO' ? (
                        <div key={p.key} className="rmr-pending-photo">
                          <img src={photoPreview(p)} alt={p.name} className="rmr-preview-thumb" />
                          <div className="rmr-pending-meta">
                            <span className="rmr-pending-name" title={p.name}>{p.name}</span>
                            <span className="rmr-pending-size">{formatBytes(p.size)}</span>
                          </div>
                          <Tooltip title="Remove">
                            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removePendingFile(p.key)} aria-label={`Remove ${p.name}`} />
                          </Tooltip>
                        </div>
                      ) : (
                        <div key={p.key} className="rmr-pending-attach">
                          <PaperClipOutlined />
                          <span className="rmr-pending-name" title={p.name}>{p.name}</span>
                          <span className="rmr-pending-size">{formatBytes(p.size)}</span>
                          <Tooltip title="Remove">
                            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removePendingFile(p.key)} aria-label={`Remove ${p.name}`} />
                          </Tooltip>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </Card>

              <Divider style={{ margin: '4px 0 12px' }} />
              <Form.Item name="remarks" label="SECTION 4 · Remarks">
                <Input.TextArea rows={2} maxLength={1000} placeholder="Optional note for this receipt" />
              </Form.Item>

              <Space style={{ marginTop: 8 }} wrap>
                <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={submitting}>{isEditing ? 'Save Changes' : 'Confirm Receipt'}</Button>
                <Button onClick={closeModalWithoutSave} disabled={submitting}>Cancel</Button>
              </Space>
            </Form>
          </div>

          {/* Right Column: Live Verification Card */}
          <div className="raw-material-modal-preview-col">
            <div className="raw-material-live-preview-card">
              <div className="rm-preview-header-badge">
                <span className="rm-minimized-window-pulse" style={{ width: 6, height: 6 }} />
                LIVE VERIFICATION (2027)
              </div>
              <div className="rm-preview-doc-title">
                {isEditing ? 'Updating Receipt' : 'New Raw Material Receipt'}
              </div>
              <div className="rm-preview-doc-subtitle">
                Receipt Code: <Text strong style={{ color: 'var(--theme-primary, #4f46e5)' }}>{isEditing ? (list.find((x) => x.id === editingId)?.receiptCode || 'Editing') : 'Auto-Assigned on Confirm'}</Text>
              </div>

              <div className="rm-preview-meta-grid">
                <div className="rm-preview-meta-row">
                  <span className="rm-preview-meta-label">Division</span>
                  <span className="rm-preview-meta-value" title={refData?.divisions.find((d) => d.id === watchDivision)?.name}>
                    {refData?.divisions.find((d) => d.id === watchDivision)?.name || <Text type="secondary">Not Selected</Text>}
                  </span>
                </div>
                <div className="rm-preview-meta-row">
                  <span className="rm-preview-meta-label">Section</span>
                  <span className="rm-preview-meta-value" title={(refData?.sections || []).find((s) => s.id === watchSection)?.name}>
                    {(refData?.sections || []).find((s) => s.id === watchSection)?.name || <Text type="secondary">Not Selected</Text>}
                  </span>
                </div>
                <div className="rm-preview-meta-row">
                  <span className="rm-preview-meta-label">Department</span>
                  <span className="rm-preview-meta-value" title={(refData?.departments || []).find((dp) => dp.id === watchDepartment)?.name}>
                    {(refData?.departments || []).find((dp) => dp.id === watchDepartment)?.name || <Text type="secondary">Not Selected</Text>}
                  </span>
                </div>
                <div className="rm-preview-meta-row">
                  <span className="rm-preview-meta-label">Warehouse</span>
                  <span className="rm-preview-meta-value" title={refData?.warehouses.find((w) => w.id === watchWarehouse)?.name}>
                    {refData?.warehouses.find((w) => w.id === watchWarehouse)?.name || <Text type="secondary">Not Selected</Text>}
                  </span>
                </div>
                <div className="rm-preview-meta-row">
                  <span className="rm-preview-meta-label">Gate Pass No</span>
                  <span className="rm-preview-meta-value">{watchGatePassNo || <Text type="secondary">-</Text>}</span>
                </div>
                <div className="rm-preview-meta-row">
                  <span className="rm-preview-meta-label">Receipt Date</span>
                  <span className="rm-preview-meta-value">{watchReceiptDate ? watchReceiptDate.format('DD-MMM-YYYY') : dayjs().format('DD-MMM-YYYY')}</span>
                </div>
                {watchSourceNo && (
                  <div className="rm-preview-meta-row">
                    <span className="rm-preview-meta-label">Source / DC No</span>
                    <span className="rm-preview-meta-value">{watchSourceNo}</span>
                  </div>
                )}
              </div>

              <div className="rm-preview-kpi-grid">
                <div className="rm-preview-kpi-card">
                  <div className="rm-preview-kpi-num">{rows.filter((r) => r.itemId).length}</div>
                  <div className="rm-preview-kpi-label">Active Lines</div>
                </div>
                <div className="rm-preview-kpi-card">
                  <div className="rm-preview-kpi-num" style={{ color: '#0284c7' }}>{formatNumber(totals.gatePassTotal, 2)}</div>
                  <div className="rm-preview-kpi-label">Gate Pass Total</div>
                </div>
                <div className="rm-preview-kpi-card" style={{ borderColor: 'rgba(34, 197, 94, 0.4)' }}>
                  <div className="rm-preview-kpi-num" style={{ color: '#16a34a' }}>{formatNumber(totals.receivedTotal, 2)}</div>
                  <div className="rm-preview-kpi-label">Received Total</div>
                </div>
                <div className="rm-preview-kpi-card" style={{ borderColor: totals.differenceTotal !== 0 ? 'rgba(234, 88, 12, 0.4)' : undefined }}>
                  <div className="rm-preview-kpi-num" style={{ color: totals.differenceTotal !== 0 ? '#ea580c' : '#64748b' }}>
                    {formatNumber(totals.differenceTotal, 2)}
                  </div>
                  <div className="rm-preview-kpi-label">
                    Net Diff {totals.differenceTotal === 0 ? (
                      <Tag color="success" style={{ margin: 0, fontSize: 10, lineHeight: '14px', padding: '0 4px' }}>MATCH</Tag>
                    ) : totals.differenceTotal > 0 ? (
                      <Tag color="warning" style={{ margin: 0, fontSize: 10, lineHeight: '14px', padding: '0 4px' }}>SHORT</Tag>
                    ) : (
                      <Tag color="error" style={{ margin: 0, fontSize: 10, lineHeight: '14px', padding: '0 4px' }}>SURPLUS</Tag>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: 12, color: '#475569', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>Material Lines Verification</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{filteredItems.length} items in division</span>
              </div>

              <div className="rm-preview-lines-container">
                {rows.filter((r) => r.itemId).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 12 }}>
                    Select raw materials on the left to verify lines in real-time.
                  </div>
                ) : (
                  rows.filter((r) => r.itemId).map((r, idx) => {
                    const item = refData?.items.find((i) => i.id === r.itemId);
                    const uom = refData?.uoms.find((u) => u.id === r.uomId);
                    const diff = Number(r.gatePassQuantity || 0) - Number(r.receivedQuantity || 0);
                    return (
                      <div key={r.key || idx} className="rm-preview-line-row">
                        <div className="rm-preview-line-header">
                          <span className="rm-preview-line-title">
                            #{idx + 1} {item?.itemCode || ''} — {item?.name || 'Unknown Item'}
                          </span>
                          <span className="rm-preview-line-badge">
                            {diff === 0 ? (
                              <Tag color="green" style={{ margin: 0, fontSize: 11 }}>Matched</Tag>
                            ) : diff > 0 ? (
                              <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>Diff: {formatNumber(diff, 2)}</Tag>
                            ) : (
                              <Tag color="volcano" style={{ margin: 0, fontSize: 11 }}>Excess: {formatNumber(Math.abs(diff), 2)}</Tag>
                            )}
                          </span>
                        </div>
                        <div className="rm-preview-line-meta">
                          <span>GP: <strong style={{ color: '#0f172a' }}>{formatNumber(r.gatePassQuantity, 2)}</strong></span>
                          <span>Recv: <strong style={{ color: '#16a34a' }}>{formatNumber(r.receivedQuantity, 2)}</strong> {uom?.code || uom?.symbol || ''}</span>
                          {(() => {
                            const loading = !!invPreviewLoading[(r.itemId as string) || ''];
                            const err = invPreviewError[(r.itemId as string) || ''];
                            if (loading) return <span className="rm-preview-inv-line">Inv: loading…</span>;
                            if (err) return <span className="rm-preview-inv-line" style={{ color: '#dc2626' }}>Inv: unavailable</span>;
                            const cur = invCurrentOnHand(r.itemId);
                            if (cur === null) return null;
                            const after = invAfterReceipt(r);
                            return <span className="rm-preview-inv-line">Inv: {formatNumber(cur, 2)} → {after !== null ? formatNumber(after, 2) : '—'} {uom?.code || uom?.symbol || ''}</span>;
                          })()}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </DraggableResizableModal>

      {/* Save / Feedback Dialog */}
      <SaveResultDialog
        open={saveDialogVisible}
        phase={saveDialogPhase}
        result={saveDialogResult}
        errorMessage={saveDialogError}
        successTitle={saveDialogSuccessTitle}
        loadingTitle="Posting Raw Material Receipt..."
        loadingHint="Validating division scopes and posting real-time inventory ledger movements..."
        onRetry={saveDialogRetry}
        onClose={() => setSaveDialogVisible(false)}
      />

      {/* WhatsApp share dialog — an honest dual-mode: configured provider enqueues a
          delivery; otherwise it hands off to wa.me with the message pre-filled. */}
      <Modal
        title={<Space><WhatsAppOutlined /> Share Receipt on WhatsApp</Space>}
        open={waOpen}
        onCancel={() => setWaOpen(false)}
        footer={null}
        width={520}
        destroyOnHidden
      >
        {waShareInfo ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Alert type="info" showIcon message={`Sharing receipt ${waShareInfo.receiptCode}`} />
            <div>
              <Text strong>Phone (with country code)</Text> <Text type="secondary" style={{ fontSize: 12 }}>&nbsp;e.g. 92 300 1234567</Text>
              <Input
                prefix={<WhatsAppOutlined />}
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="923001234567"
                maxLength={20}
                data-testid="wa-phone"
                style={{ marginTop: 4 }}
              />
            </div>
            <div>
              <Text strong>Message</Text>
              <Input.TextArea
                value={waMessage}
                onChange={(e) => setWaMessage(e.target.value)}
                rows={8}
                data-testid="wa-message"
                style={{ marginTop: 4 }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>Built from the saved receipt data — edit freely before sending.</Text>
                <Button type="link" size="small" onClick={() => waShareInfo && setWaMessage(buildReceiptWhatsAppMessage(waShareInfo))}>Reset message</Button>
              </div>
            </div>
            {waOutcome ? (
              <Alert
                type={waOutcome.type === 'error' ? 'error' : 'success'}
                showIcon
                message={waOutcome.text}
                style={{ fontSize: 13 }}
              />
            ) : null}
            <Space wrap>
              <Button type="primary" icon={<WhatsAppOutlined />} loading={waSending} onClick={handleWaSend} data-testid="wa-send">
                Send via WhatsApp
              </Button>
              <Button icon={<CopyOutlined />} onClick={handleWaCopy} data-testid="wa-copy">Copy Message</Button>
              <Button icon={<SendOutlined />} href={waHref} target="_blank" rel="noopener noreferrer" disabled={!waHref} data-testid="wa-open">
                Open WhatsApp
              </Button>
            </Space>
          </Space>
        ) : null}
      </Modal>

      <Modal
        title={null}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        maskClosable={false}
        centered
        width={1180}
        destroyOnHidden
        className="rmr-detail-modal"
        closeIcon={<CloseOutlined />}
      >
        <div className="rmr-detail-body" data-testid="rmr-detail-body">
          {detailLoading ? (
            <Alert type="info" showIcon message="Loading receipt detail..." />
          ) : detail ? (
            <>
              {/* Compact header: identity chips + actions, no wasted vertical space */}
              <div className="rmr-detail-head">
                <div className="rmr-detail-head-copy">
                  <div className="rmr-detail-title">
                    <span className="rmr-detail-title-icon"><InboxOutlined /></span>
                    Raw Material Receipt Detail
                  </div>
                  <div className="rmr-detail-codes">
                    <span className="rmr-detail-code-chip">
                      <span className="rmr-detail-code-label">Receipt Code</span>
                      <strong data-testid="rm-detail-code">{detail.receiptCode}</strong>
                    </span>
                    {detail.gatePassNo ? (
                      <span className="rmr-detail-code-chip">
                        <span className="rmr-detail-code-label">Gate Pass</span>
                        <strong>{detail.gatePassNo}</strong>
                      </span>
                    ) : null}
                    {detail.sourceNo ? (
                      <span className="rmr-detail-code-chip">
                        <span className="rmr-detail-code-label">Source / DC No</span>
                        <strong>{detail.sourceNo}</strong>
                      </span>
                    ) : null}
                    <Tag color={detail.status === 'CONFIRMED' ? 'green' : detail.status === 'DRAFT' ? 'gold' : 'red'}>{detail.status}</Tag>
                  </div>
                </div>
                <Space className="rmr-detail-actions" wrap>
                  <Button icon={<EditOutlined />} data-testid="rm-detail-edit"
                    onClick={() => { setDetailOpen(false); void openEdit(detail); }}>
                    Edit
                  </Button>
                  <Button icon={<DatabaseOutlined />} data-testid="rm-detail-inventory"
                    onClick={() => void openInventory(detail)}>
                    View Inventory
                  </Button>
                  <Button type="primary" ghost icon={<WhatsAppOutlined />} data-testid="rm-detail-wa"
                    onClick={() => openWaShare(buildShareInfoFromDetail(detail), detail.id)}>
                    Share on WhatsApp
                  </Button>
                </Space>
              </div>

              {/* Responsive info grid — each field fits on one line where the value permits */}
              <div className="rmr-detail-grid">
                <div className="rmr-detail-field">
                  <span className="rmr-detail-field-label">Receipt Date</span>
                  <span className="rmr-detail-field-value">{detail.receiptDate ? dayjs(detail.receiptDate).format('DD-MMM-YYYY') : '-'}</span>
                </div>
                <div className="rmr-detail-field">
                  <span className="rmr-detail-field-label">Division</span>
                  <span className="rmr-detail-field-value">{detail.division?.name || '-'}</span>
                </div>
                <div className="rmr-detail-field">
                  <span className="rmr-detail-field-label">Section</span>
                  <span className="rmr-detail-field-value">{detail.section?.name || '-'}</span>
                </div>
                <div className="rmr-detail-field">
                  <span className="rmr-detail-field-label">Department</span>
                  <span className="rmr-detail-field-value">{detail.department?.name || '-'}</span>
                </div>
                <div className="rmr-detail-field">
                  <span className="rmr-detail-field-label">Warehouse</span>
                  <span className="rmr-detail-field-value">{detail.warehouse?.name || '-'}</span>
                </div>
              </div>

              {detail.remarks ? (
                <div className="rmr-detail-remarks">
                  <span className="rmr-detail-field-label">Remarks</span>
                  <div className="rmr-detail-remarks-text">{detail.remarks}</div>
                </div>
              ) : null}

              <Divider orientation="left" plain className="rmr-detail-divider">Items</Divider>
              <Table
                rowKey={(l) => l.id || `${l.lineNumber}-${l.item?.id}`}
                size="small" pagination={false} scroll={{ x: 720 }}
                className="rmr-detail-items-table"
                dataSource={detail.lines || []}
                columns={[
                  { title: '#', dataIndex: 'lineNumber', key: 'lineNumber', width: 44 },
                  {
                    title: 'Item', key: 'item', ellipsis: true,
                    render: (_, l) => (l.item ? (
                      <Tooltip title={`${l.item.itemCode} — ${l.item.name}`}>
                        <span>{l.item.itemCode} — {l.item.name}</span>
                      </Tooltip>
                    ) : '-'),
                  },
                  { title: 'UOM', key: 'uom', width: 72, render: (_, l) => l.uom?.code || '-' },
                  { title: 'Gate Pass Qty', dataIndex: 'gatePassQuantity', key: 'g', width: 120, align: 'right' as const, render: (v: unknown) => formatNumber(v, 2) },
                  { title: 'Received Qty', dataIndex: 'receivedQuantity', key: 'r', width: 120, align: 'right' as const, render: (v: unknown) => formatNumber(v, 2) },
                  { title: 'Difference', dataIndex: 'difference', key: 'd', width: 120, align: 'right' as const, render: (v: unknown) => (<span style={{ color: Number(v || 0) !== 0 ? 'var(--theme-warning, #d48806)' : undefined }}>{formatNumber(v, 2)}</span>) },
                ]}
              />
              <div className="rmr-detail-totals">
                <div className="rmr-detail-total-card">
                  <span className="rmr-detail-field-label">Gate Pass Total</span>
                  <span className="rmr-detail-total-value">{formatNumber(detail.gatePassTotal, 2)}</span>
                </div>
                <div className="rmr-detail-total-card rmr-detail-total-card--received">
                  <span className="rmr-detail-field-label">Received Total</span>
                  <span className="rmr-detail-total-value" style={{ color: 'var(--theme-success, #52c41a)' }}>{formatNumber(detail.receivedTotal, 2)}</span>
                </div>
                <div className="rmr-detail-total-card rmr-detail-total-card--diff">
                  <span className="rmr-detail-field-label">Difference</span>
                  <span className="rmr-detail-total-value" style={{ color: Number(detail.differenceTotal) !== 0 ? 'var(--theme-warning, #d48806)' : undefined }}>{formatNumber(detail.differenceTotal, 2)}</span>
                </div>
              </div>

              <Divider orientation="left" plain className="rmr-detail-divider">Documents &amp; Photos</Divider>
              {(detail.documents || []).length > 0 ? (
                <div className="rmr-detail-docs">
                  <div className="rmr-pending-list">
                    {detail.documents!.map((doc) => (
                      doc.kind === 'PHOTO' ? (
                        <div key={doc.id} className="rmr-pending-photo" data-testid="rm-detail-photo">
                          <img src={doc.fileUrl} alt={doc.fileName} className="rmr-preview-thumb-lg" onClick={() => window.open(doc.fileUrl, '_blank', 'noopener,noreferrer')} />
                          <div className="rmr-pending-meta">
                            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="rmr-pending-link">{doc.fileName}</a>
                            <span className="rmr-pending-size">{doc.fileSize ? formatBytes(doc.fileSize) : ''}</span>
                          </div>
                        </div>
                      ) : (
                        <div key={doc.id} className="rmr-pending-attach" data-testid="rm-detail-attachment">
                          <PaperClipOutlined />
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="rmr-pending-link">{doc.fileName}</a>
                          <span className="rmr-pending-size">{doc.fileSize ? formatBytes(doc.fileSize) : ''}</span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              ) : (
                <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>No photos or attachments.</Text>
              )}

              {(detail.ledgerEntries || []).length > 0 ? (
                <>
                  <Divider orientation="left" plain className="rmr-detail-divider">Stock Ledger Postings</Divider>
                  <Table
                    rowKey="id" size="small" pagination={false}
                    className="rmr-detail-items-table"
                    dataSource={detail.ledgerEntries || []}
                    columns={[
                      { title: 'Date', dataIndex: 'transactionDate', key: 'd', render: (v: string) => (v ? dayjs(v).format('DD-MMM-YYYY') : '-') },
                      { title: 'Type', dataIndex: 'transactionType', key: 't', render: (v: string) => <Tag color="blue">{v}</Tag> },
                      { title: 'Direction', dataIndex: 'direction', key: 'dir', render: (v: string) => <span style={{ color: v === 'IN' ? 'var(--theme-success, #52c41a)' : 'var(--theme-danger, #ff4d4f)', fontWeight: 600 }}>{v}</span> },
                      { title: 'Quantity', dataIndex: 'quantity', key: 'q', align: 'right' as const, render: (v: unknown) => formatNumber(v, 2) },
                    ]}
                  />
                </>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <Alert type="warning" showIcon icon={<WarningOutlined />} message="No stock was posted — all lines have zero received quantity." />
                </div>
              )}
            </>
          ) : null}
        </div>
      </Modal>

      {/* RMR-01-C: Inventory Status popup (read-only) */}
      <Modal
        title={null}
        open={inventoryOpen}
        onCancel={() => setInventoryOpen(false)}
        footer={null}
        maskClosable={false}
        centered
        width={1120}
        destroyOnHidden
        className="rmr-inventory-modal"
        closeIcon={<CloseOutlined />}
      >
        <div className="rmr-detail-body" data-testid="rm-inventory-body">
          <div className="rmr-inventory-head">
            <div className="rmr-detail-title"><span className="rmr-detail-title-icon"><DatabaseOutlined /></span>Inventory Status</div>
            {inventoryData ? (
              <div className="rmr-detail-codes">
                <span className="rmr-detail-code-chip">
                  <span className="rmr-detail-code-label">Receipt</span>
                  <strong data-testid="rm-inventory-receipt">{inventoryData.receiptCode}</strong>
                </span>
                {inventoryData.warehouse ? (
                  <span className="rmr-detail-code-chip">
                    <span className="rmr-detail-code-label">Warehouse</span>
                    <strong>{inventoryData.warehouse.name}</strong>
                  </span>
                ) : null}
                {inventoryData.receiptDate ? (
                  <span className="rmr-detail-code-chip">
                    <span className="rmr-detail-code-label">Receipt Date</span>
                    <strong>{dayjs(inventoryData.receiptDate).format('DD-MMM-YYYY')}</strong>
                  </span>
                ) : null}
                <Tag color="green">{inventoryData.status}</Tag>
              </div>
            ) : null}
          </div>

          <div className="rmr-inventory-caption">Inventory for items received in {inventoryData?.receiptCode ?? ''}</div>

          {inventoryLoading ? (
            <Alert type="info" showIcon message="Loading inventory status..." data-testid="rm-inventory-loading" />
          ) : inventoryError ? (
            <Alert
              type="error" showIcon message={inventoryError} data-testid="rm-inventory-error"
              action={<Button size="small" danger type="primary" data-testid="rm-inventory-retry" onClick={() => detail && void openInventory(detail)}>Retry</Button>}
            />
          ) : inventoryData && inventoryData.items.length === 0 ? (
            <Alert type="info" showIcon message="This receipt has no item lines." data-testid="rm-inventory-empty" />
          ) : inventoryData ? (
            <Table
              rowKey={(r) => `${r.lineNumber}-${r.item?.id ?? 'x'}`}
              size="small"
              pagination={false}
              scroll={{ x: 1080 }}
              className="rmr-detail-items-table"
              dataSource={inventoryData.items}
              columns={[
                { title: '#', dataIndex: 'lineNumber', key: 'lineNumber', width: 44 },
                { title: 'Item', key: 'item', width: 240, render: (_: unknown, r: ReceiptInventoryRow) => (
                    <div className="rmr-inventory-item">
                      {r.item ? (
                        <>
                          <span className="rmr-inventory-item-code">{r.item.itemCode}</span>
                          <span className="rmr-inventory-item-name">{r.item.name}</span>
                        </>
                      ) : <Text type="secondary">—</Text>}
                    </div>
                  ),
                },
                { title: 'UOM', key: 'uom', width: 80, render: (_: unknown, r: ReceiptInventoryRow) => r.uom?.code || '-' },
                { title: 'Received in This Receipt', key: 'receivedQty', align: 'right' as const, width: 150, render: (_: unknown, r: ReceiptInventoryRow) => <span className="rmr-inventory-received">{formatNumber(r.receivedQuantity, 2)}</span> },
                { title: 'Current On Hand', key: 'onHand', align: 'right' as const, width: 140, render: (_: unknown, r: ReceiptInventoryRow) => {
                    if (!r.balance) return <Text type="secondary">—</Text>;
                    if (!r.balance.exists) return <Tag color="default" data-testid="rm-inventory-missing">No inventory balance record found.</Tag>;
                    return formatNumber(r.balance.onHand, 2);
                  },
                },
                { title: 'Reserved', key: 'reserved', align: 'right' as const, width: 120, render: (_: unknown, r: ReceiptInventoryRow) => {
                    if (!r.balance?.exists) return <Text type="secondary">—</Text>;
                    return formatNumber(r.balance.reserved, 2);
                  },
                },
                { title: 'Available', key: 'available', align: 'right' as const, width: 120, render: (_: unknown, r: ReceiptInventoryRow) => {
                    if (!r.balance?.exists) return <Text type="secondary">—</Text>;
                    return <strong>{formatNumber(r.balance.available, 2)}</strong>;
                  },
                },
                { title: 'Last Updated', key: 'lastUpdated', width: 120, render: (_: unknown, r: ReceiptInventoryRow) => r.balance?.lastUpdatedAt ? dayjs(r.balance.lastUpdatedAt).format('DD-MMM-YYYY') : '-' },
              ]}
            />
          ) : null}
        </div>
      </Modal>

    </div>
  );
};

export default RawMaterialReceiving;