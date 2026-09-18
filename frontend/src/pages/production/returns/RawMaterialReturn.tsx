import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Divider, Drawer, Form, Input, InputNumber,
  Modal, Popconfirm, Row, Select, Space, Spin, Table, Tag, Tooltip, Typography, App,
} from 'antd';
import {
  ArrowRightOutlined, CameraOutlined, CloseOutlined, CopyOutlined, DatabaseOutlined,
  DeleteOutlined, EditOutlined, EyeInvisibleOutlined, EyeOutlined, PaperClipOutlined,
  PlusOutlined, ReloadOutlined, RollbackOutlined, SaveOutlined, SendOutlined,
  WarningOutlined, WhatsAppOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber } from '../../../utils/numberFormat';
import { formatApiError } from '../../../utils/apiError';
import {
  buildReturnWhatsAppMessage, normalizeWaPhone, waLink, waDirectShareUrl,
  ShareReturnInfo,
} from '../../../utils/receiptShare';
import { formatNameWithCode } from '../../../utils/formatEntityLabel';
import { DraggableResizableModal, SaveResultDialog, PageHeader } from '../../../components/shared';
import type { SaveResultData, SaveResultPhase } from '../../../components/shared/SaveResultDialog';
import '../receiving/rawMaterialForms.css';

const { Text, Title } = Typography;

const SECTION_SELECT_LIST_HEIGHT = 200;
const PHOTO_FILE_MAX = 5 * 1024 * 1024;
const ATTACH_FILE_MAX = 10 * 1024 * 1024;
const PHOTO_MIME_ALLOW = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_EXT_RE = /\.(jpe?g|png|webp)$/i;
const ATTACH_EXT_ALLOW = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'];

interface OrgOption {
  id: string;
  name: string;
  divisionCode?: string;
  sectionCode?: string;
  departmentCode?: string;
  divisionId?: string;
  sectionId?: string;
}

interface WarehouseOption {
  id: string;
  name: string;
  warehouseCode?: string;
  status: string;
  warehouseType?: string;
}

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

interface UomOption {
  id: string;
  code?: string;
  name?: string;
  symbol?: string;
  status: string;
}

interface ProductionOrderOption {
  id: string;
  order_number: string;
  status?: string;
}

interface FormRefData {
  warehouses: WarehouseOption[];
  items: ItemOption[];
  uoms: UomOption[];
  divisions: OrgOption[];
  productionOrders?: ProductionOrderOption[];
}

interface ReceiptRefOption {
  id: string;
  receiptCode: string;
}

interface ReturnDocument {
  id: string;
  kind: 'PHOTO' | 'ATTACHMENT';
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  fileSize?: number | null;
  uploadedAt?: string | null;
}

interface PendingUpload {
  key: string;
  kind: 'PHOTO' | 'ATTACHMENT';
  name: string;
  size: number;
  mime: string;
  file: File;
}

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

interface ReturnLine {
  id?: string;
  lineNumber: number;
  item?: { id: string; name: string; itemCode: string } | null;
  uom?: { id: string; code: string; name?: string; symbol?: string } | null;
  quantity: number;
  remarks?: string | null;
}

interface ReturnHeader {
  id: string;
  returnCode: string;
  sourceNo?: string | null;
  returnDate: string;
  status: string;
  reason?: string | null;
  reference?: string | null;
  remarks?: string | null;
  division?: OrgOption | null;
  section?: OrgOption | null;
  department?: OrgOption | null;
  warehouse?: WarehouseOption | null;
  referenceReceiptId?: string | null;
  referenceReceipt?: { id: string; receiptCode: string } | null;
  productionOrderId?: string | null;
  lineCount?: number;
  quantityTotal?: number;
  lines?: ReturnLine[];
  documents?: ReturnDocument[];
  ledgerEntries?: Array<{
    id: string;
    transactionType: string;
    direction: string;
    quantity: number;
    transactionDate: string;
    referenceNumber?: string | null;
  }>;
  createdAt?: string;
}

interface LineRow {
  key: string;
  itemId?: string;
  uomId?: string;
  quantity?: number;
}

const emptyLine = (): LineRow => ({
  key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  quantity: undefined,
});

const formatBytes = (b: number): string => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const RawMaterialReturn: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [refData, setRefData] = useState<FormRefData | null>(null);
  const [refState, setRefState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [sections, setSections] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [receiptRefs, setReceiptRefs] = useState<ReceiptRefOption[]>([]);

  const [rows, setRows] = useState<LineRow[]>([emptyLine()]);
  const rowsRef = useRef<LineRow[]>(rows);
  rowsRef.current = rows;

  const [list, setList] = useState<ReturnHeader[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [listLoading, setListLoading] = useState(false);
  const [listState, setListState] = useState<'loading' | 'error' | 'ready'>('loading');

  const [filters, setFilters] = useState<{
    status?: string;
    warehouseId?: string;
    sourceNo?: string;
    dateFrom?: string;
    dateTo?: string;
  }>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<ReturnHeader | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Live preview & UI visibility toggle
  const [showLivePreview, setShowLivePreview] = useState<boolean>(true);

  // Inventory balance preview state
  const [invPreview, setInvPreview] = useState<Record<string, BalancePreviewItem>>({});
  const [invPreviewLoading, setInvPreviewLoading] = useState<Record<string, boolean>>({});
  const [invPreviewError, setInvPreviewError] = useState<Record<string, string>>({});
  const [invPreviewRetryTick, setInvPreviewRetryTick] = useState(0);
  const invPreviewReqRef = useRef(0);
  const [priorPosted, setPriorPosted] = useState<Array<{ itemId: string; quantity: number }>>([]);

  // Documents & Photos
  const [pendingFiles, setPendingFiles] = useState<PendingUpload[]>([]);
  const pendingFilesRef = useRef<PendingUpload[]>(pendingFiles);
  pendingFilesRef.current = pendingFiles;
  const [existingDocs, setExistingDocs] = useState<ReturnDocument[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<Record<string, string>>({});

  // Save feedback dialog states
  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [saveDialogPhase, setSaveDialogPhase] = useState<SaveResultPhase>('loading');
  const [saveDialogResult, setSaveDialogResult] = useState<SaveResultData | null>(null);
  const [saveDialogError, setSaveDialogError] = useState<string | undefined>(undefined);
  const [saveDialogSuccessTitle, setSaveDialogSuccessTitle] = useState<string>('Return Submitted Successfully');
  const [saveDialogRetry, setSaveDialogRetry] = useState<(() => void) | undefined>(undefined);

  // WhatsApp share modal state
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [waSending, setWaSending] = useState(false);
  const [waReturnId, setWaReturnId] = useState<string | null>(null);
  const [waShareInfo, setWaShareInfo] = useState<ShareReturnInfo | null>(null);
  const [waOutcome, setWaOutcome] = useState<{ type: 'queued' | 'unconfigured' | 'copied' | 'error'; text: string } | null>(null);

  // Form watchers for real-time live preview
  const watchDivision = Form.useWatch('divisionId', form);
  const watchSection = Form.useWatch('sectionId', form);
  const watchDepartment = Form.useWatch('departmentId', form);
  const watchWarehouse = Form.useWatch('warehouseId', form);
  const watchReturnDate = Form.useWatch('returnDate', form);
  const watchSourceNo = Form.useWatch('sourceNo', form);
  const watchReferenceReceiptId = Form.useWatch('referenceReceiptId', form);
  const watchReason = Form.useWatch('reason', form);

  // Filter raw materials strictly by selected Division
  const filteredItems = useMemo(() => {
    if (!refData?.items) return [];
    const rawMaterials = refData.items.filter((i) => !i.itemType || i.itemType === 'RAW_MATERIAL');
    if (!watchDivision) return rawMaterials;
    return rawMaterials.filter((i) => !i.divisionId || i.divisionId === watchDivision);
  }, [refData?.items, watchDivision]);

  // Options memoization with Name (Code) formatting
  const divisionOptions = useMemo(
    () => (refData?.divisions || []).map((d) => ({ value: d.id, label: formatNameWithCode(d.name, d.divisionCode) })),
    [refData?.divisions],
  );

  const warehouseOptions = useMemo(
    () => (refData?.warehouses || []).map((w) => ({ value: w.id, label: formatNameWithCode(w.name, w.warehouseCode) })),
    [refData?.warehouses],
  );

  const sectionOptions = useMemo(
    () => sections.map((s) => ({ value: s.id, label: formatNameWithCode(s.name, s.sectionCode) })),
    [sections],
  );

  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: formatNameWithCode(d.name, d.departmentCode) })),
    [departments],
  );

  const itemOptions = useMemo(
    () => filteredItems.map((i) => ({ value: i.id, label: formatNameWithCode(i.name, i.itemCode) })),
    [filteredItems],
  );

  const uomOptions = useMemo(
    () => (refData?.uoms || []).map((u) => ({ value: u.id, label: u.code || u.symbol || u.name || u.id })),
    [refData?.uoms],
  );

  const receiptRefOptions = useMemo(
    () => receiptRefs.map((r) => ({ value: r.id, label: r.receiptCode })),
    [receiptRefs],
  );

  // Reference data loading
  const loadRef = useCallback(async () => {
    setRefState('loading');
    try {
      const res = await apiService.get<{ data: FormRefData }>('/inventory/receipts/gate-pass/form-data');
      setRefData(res.data);
      setRefState('ready');
    } catch {
      setRefState('error');
    }
  }, []);

  const loadReceiptRefs = useCallback(async () => {
    try {
      const res = await apiService.get<{ data: ReceiptRefOption[]; total: number }>('/inventory/receipts/gate-pass', { page: 1, limit: 100 });
      setReceiptRefs((res.data || []).map((r) => ({ id: r.id, receiptCode: r.receiptCode })));
    } catch {
      setReceiptRefs([]);
    }
  }, []);

  const loadSections = useCallback(async (divisionId: string) => {
    setSectionsLoading(true);
    try {
      const res = await apiService.get<{ data: OrgOption[] }>('/inventory/receipts/organization/sections', { divisionId });
      const list = res.data || [];
      setSections(list);
      return list;
    } catch {
      setSections([]);
      return [];
    } finally {
      setSectionsLoading(false);
    }
  }, []);

  const loadDepartments = useCallback(async (divisionId: string, sectionId: string) => {
    setDepartmentsLoading(true);
    try {
      const res = await apiService.get<{ data: OrgOption[] }>('/inventory/receipts/organization/departments', { divisionId, sectionId });
      const list = res.data || [];
      setDepartments(list);
      return list;
    } catch {
      setDepartments([]);
      return [];
    } finally {
      setDepartmentsLoading(false);
    }
  }, []);

  const loadList = useCallback(async (p: number = page, f: typeof filters = filters) => {
    setListLoading(true);
    try {
      const res = await apiService.get<{ data: ReturnHeader[]; total: number }>('/inventory/receipts/returns', { page: p, limit: pageSize, ...f });
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
  }, [page, pageSize, filters]);

  useEffect(() => { void loadRef(); void loadReceiptRefs(); }, [loadRef, loadReceiptRefs]);
  useEffect(() => { void loadList(1); }, [loadList]);

  // Dynamic cascades when division changes
  useEffect(() => {
    if (watchDivision) {
      void loadSections(watchDivision);
    } else {
      setSections([]);
      setDepartments([]);
    }
  }, [watchDivision, loadSections]);

  // Dynamic cascades when section changes
  useEffect(() => {
    if (watchDivision && watchSection) {
      void loadDepartments(watchDivision, watchSection);
    } else {
      setDepartments([]);
    }
  }, [watchDivision, watchSection, loadDepartments]);

  // When division changes, clear rows with items that do not belong to the selected division
  useEffect(() => {
    if (watchDivision && refData?.items) {
      setRows((prev) =>
        prev.map((r) => {
          if (!r.itemId) return r;
          const item = refData.items.find((i) => i.id === r.itemId);
          if (item?.divisionId && item.divisionId !== watchDivision) {
            return { ...r, itemId: undefined, uomId: undefined };
          }
          return r;
        }),
      );
    }
  }, [watchDivision, refData?.items]);

  // Total quantity calculation
  const totalQty = useMemo(() => rows.reduce((s, r) => s + Number(r.quantity || 0), 0), [rows]);

  // ─────────────────────────────────────────────────────────────────────────
  // Live inventory balance preview (READ-ONLY)
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
      .catch(async () => {
        if (reqId !== invPreviewReqRef.current) return;
        // Resilient cloud fallback: query standard /inventory/balances for this warehouse
        try {
          const fallbackRes = await apiService.get<any>('/inventory/balances', {
            warehouseId,
            limit: 200,
          });
          if (reqId !== invPreviewReqRef.current) return;
          const balancesList: any[] = Array.isArray(fallbackRes?.data)
            ? fallbackRes.data
            : Array.isArray(fallbackRes?.balances)
            ? fallbackRes.balances
            : [];
          const byItem = new Map<string, any>();
          balancesList.forEach((b) => {
            if (b?.itemId) byItem.set(b.itemId, b);
          });
          const map: Record<string, BalancePreviewItem> = {};
          itemIds.forEach((id) => {
            const b = byItem.get(id);
            const refItem = refData?.items?.find((i) => i.id === id);
            const refUom = refData?.uoms?.find((u) => u.id === refItem?.baseUomId || u.id === (refItem as any)?.uomId);
            const fallbackUom = refUom?.code || refUom?.symbol || 'KG';

            if (b) {
              map[id] = {
                itemId: id,
                itemCode: b.item?.itemCode || b.item?.code || refItem?.itemCode || null,
                itemName: b.item?.name || refItem?.name || null,
                uomCode: b.uom?.code || b.item?.uom?.code || fallbackUom,
                exists: true,
                onHand: Number(b.onHand ?? 0),
                reserved: Number(b.reserved ?? 0),
                available: Number(b.available ?? 0),
                lastUpdatedAt: b.updatedAt || null,
              };
            } else {
              map[id] = {
                itemId: id,
                itemCode: refItem?.itemCode || null,
                itemName: refItem?.name || null,
                uomCode: fallbackUom,
                exists: false,
                onHand: 0,
                reserved: 0,
                available: 0,
                lastUpdatedAt: null,
              };
            }
          });
          setInvPreview(map);
          setInvPreviewError((prev) => {
            const next = { ...prev };
            itemIds.forEach((id) => { delete next[id]; });
            return next;
          });
        } catch {
          if (reqId !== invPreviewReqRef.current) return;
          setInvPreviewError((prev) => {
            const next = { ...prev };
            itemIds.forEach((id) => { next[id] = 'Unable to load current inventory.'; });
            return next;
          });
        }
      })
      .finally(() => {
        if (reqId !== invPreviewReqRef.current) return;
        setInvPreviewLoading((prev) => {
          const next = { ...prev };
          itemIds.forEach((id) => { delete next[id]; });
          return next;
        });
      });
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
    if (!it.exists) return 0;
    return Number(it.onHand);
  };

  const invPriorForItem = (itemId?: string): number => {
    if (!itemId) return 0;
    return priorPosted.filter((p) => p.itemId === itemId).reduce((s, p) => s + Number(p.quantity || 0), 0);
  };

  const invUomCodeForItem = (itemId: string): string => {
    const row = rows.find((r) => r.itemId === itemId);
    if (row?.uomId && invUomByItem[row.uomId]) return invUomByItem[row.uomId];
    return invPreview[itemId]?.uomCode ?? '';
  };

  const retryInvPreview = useCallback(() => setInvPreviewRetryTick((t) => t + 1), []);

  const invSummaryGroups = useMemo(() => {
    type G = {
      itemId: string;
      itemCode: string;
      itemName: string;
      uomCode: string;
      current: number | null;
      returned: number;
      prior: number;
      after: number | null;
      missing: boolean;
      loading: boolean;
      error: string | null;
      negative: boolean;
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
          returned: 0,
          prior: invPriorForItem(itemId),
          after: null,
          missing: !!existing && !existing.exists,
          loading: !!invPreviewLoading[itemId],
          error: invPreviewError[itemId] ?? null,
          negative: false,
        };
        byId.set(itemId, g);
        groups.push(g);
      }
      return g;
    };

    rows.filter((r) => r.itemId).forEach((r) => {
      if (!r.itemId) return;
      const g = upsert(r.itemId);
      g.returned += Number(r.quantity || 0);
      g.uomCode = invUomCodeForItem(r.itemId) || g.uomCode;
    });

    priorPosted.forEach((p) => { if (p.itemId) upsert(p.itemId); });

    groups.forEach((g) => {
      g.current = invCurrentOnHand(g.itemId);
      g.prior = invPriorForItem(g.itemId);
      const after = g.current === null ? null : g.current + g.prior - g.returned;
      g.after = after;
      g.negative = after !== null && after < 0;
    });

    return groups;
  }, [rows, refData?.items, invPreview, invPreviewLoading, invPreviewError, priorPosted]);

  // Object-URL previews for photos
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

  // Photos & attachments management
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
          rejected.push(`${name} (photo exceeds 5 MB)`);
          continue;
        }
      } else {
        if (!ATTACH_EXT_ALLOW.includes(ext)) {
          rejected.push(`${name} (unsupported format)`);
          continue;
        }
        if (f.size > ATTACH_FILE_MAX) {
          rejected.push(`${name} (attachment exceeds 10 MB)`);
          continue;
        }
      }
      accepted.push({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind,
        name,
        size: f.size,
        mime: f.type || 'application/octet-stream',
        file: f,
      });
    }

    if (rejected.length) {
      message.warning(`Some files could not be added: ${rejected.join(', ')}`);
    }
    if (accepted.length) {
      setPendingFiles((prev) => [...prev, ...accepted]);
    }
  }, [message]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    if (list.length) addPendingFiles(list, 'PHOTO');
    e.target.value = '';
  };

  const handleAttachSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    if (list.length) addPendingFiles(list, 'ATTACHMENT');
    e.target.value = '';
  };

  const removePendingFile = (key: string) => {
    setPendingFiles((prev) => prev.filter((p) => p.key !== key));
  };

  const handleRemoveExistingDoc = async (doc: ReturnDocument) => {
    if (!editingId) return;
    try {
      await apiService.delete(`/inventory/receipts/returns/${editingId}/documents/${doc.id}`);
      setExistingDocs((prev) => prev.filter((d) => d.id !== doc.id));
      message.success('Document removed.');
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to remove document.'));
    }
  };

  // Open Create Modal
  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldValue('returnDate', dayjs());
    setRows([emptyLine()]);
    setPendingFiles([]);
    setExistingDocs([]);
    setPriorPosted([]);
    setIsModalMinimized(false);
    setModalOpen(true);
  };

  // Open Edit Modal
  const openEdit = async (rec: ReturnHeader) => {
    setEditingId(rec.id);
    try {
      const res = await apiService.get<{ data: ReturnHeader }>(`/inventory/receipts/returns/${rec.id}`);
      const d = res.data;
      form.setFieldsValue({
        divisionId: d.division?.id,
        sectionId: d.section?.id,
        departmentId: d.department?.id,
        warehouseId: d.warehouse?.id,
        returnDate: d.returnDate ? dayjs(d.returnDate) : dayjs(),
        sourceNo: d.sourceNo || undefined,
        referenceReceiptId: d.referenceReceiptId || undefined,
        productionOrderId: d.productionOrderId || undefined,
        reference: d.reference || undefined,
        reason: d.reason || undefined,
        remarks: d.remarks || undefined,
      });
      if (d.division?.id) void loadSections(d.division.id);
      if (d.division?.id && d.section?.id) void loadDepartments(d.division.id, d.section.id);
      setRows((d.lines || []).map((l) => ({
        key: l.id || `${Date.now()}-${l.lineNumber}`,
        itemId: l.item?.id,
        uomId: l.uom?.id,
        quantity: l.quantity !== undefined && l.quantity !== null ? Number(l.quantity) : undefined,
      })));
      setExistingDocs(d.documents || []);
      setPriorPosted((d.lines || []).map((l) => ({ itemId: l.item?.id || '', quantity: Number(l.quantity || 0) })));
      setPendingFiles([]);
      setIsModalMinimized(false);
      setModalOpen(true);
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to load the return for editing.'));
    }
  };

  const onItemSelect = (rowKey: string, itemId: string | undefined) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== rowKey) return r;
      const item = refData?.items.find((i) => i.id === itemId);
      return { ...r, itemId, uomId: item?.baseUomId || r.uomId };
    }));
  };

  const setRow = (rowKey: string, patch: Partial<LineRow>) => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)));
  };

  const addLine = () => {
    setRows((prev) => [...prev, emptyLine()]);
  };

  const removeLine = (key: string) => {
    setRows((prev) => {
      const next = prev.filter((o) => o.key !== key);
      return next.length ? next : [emptyLine()];
    });
  };

  // WhatsApp share builder
  const buildShareInfo = useCallback((returnCode: string, values: any): ShareReturnInfo => ({
    returnCode,
    sourceNo: values.sourceNo || undefined,
    referenceReceiptCode: receiptRefs.find((r) => r.id === values.referenceReceiptId)?.receiptCode,
    returnDate: values.returnDate ? values.returnDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    divisionName: refData?.divisions.find((d) => d.id === values.divisionId)?.name,
    divisionCode: refData?.divisions.find((d) => d.id === values.divisionId)?.divisionCode,
    sectionName: sections.find((s) => s.id === values.sectionId)?.name,
    sectionCode: sections.find((s) => s.id === values.sectionId)?.sectionCode,
    departmentName: departments.find((d) => d.id === values.departmentId)?.name,
    departmentCode: departments.find((d) => d.id === values.departmentId)?.departmentCode,
    warehouseName: refData?.warehouses.find((w) => w.id === values.warehouseId)?.name,
    warehouseCode: refData?.warehouses.find((w) => w.id === values.warehouseId)?.warehouseCode,
    reason: values.reason || undefined,
    reference: values.reference || undefined,
    lines: rows.filter((r) => r.itemId).map((r) => {
      const item = refData?.items.find((i) => i.id === r.itemId);
      const uom = refData?.uoms.find((u) => u.id === r.uomId);
      return {
        itemCode: item?.itemCode,
        itemName: item?.name,
        uomCode: uom?.code || uom?.symbol,
        quantity: Number(r.quantity || 0),
      };
    }),
    quantityTotal: totalQty,
  }), [refData, sections, departments, receiptRefs, rows, totalQty]);

  const openWaShare = useCallback((info: ShareReturnInfo, retId?: string | null) => {
    setWaShareInfo(info);
    setWaReturnId(retId || editingId);
    setWaPhone('');
    setWaMessage(buildReturnWhatsAppMessage(info));
    setWaOutcome(null);
    setWaOpen(true);
  }, [editingId]);

  const handleWaCopy = async () => {
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
  };

  const handleWaSend = async () => {
    const phone = normalizeWaPhone(waPhone);
    if (!phone) {
      setWaOutcome({ type: 'error', text: 'Enter a valid phone number including country code, e.g. 923001234567.' });
      return;
    }
    if (!waMessage.trim()) {
      setWaOutcome({ type: 'error', text: 'Write a message to share.' });
      return;
    }
    setWaSending(true);
    try {
      const res = await apiService.post<{ success?: boolean; data?: { enqueued: boolean; deliveryId?: string; reason?: string } }>(
        `/inventory/receipts/returns/${waReturnId}/whatsapp-share`,
        { phone, message: waMessage.trim() },
      );
      const data = res?.data;
      if (data && data.enqueued) {
        setWaOutcome({ type: 'queued', text: `Message queued for WhatsApp delivery in the background (delivery ID ${data.deliveryId || '-'}).` });
      } else {
        const link = waLink(phone, waMessage.trim());
        if (link) {
          try { window.open(link, '_blank', 'noopener,noreferrer'); } catch { /* ignore */ }
        }
        setWaOutcome({ type: 'unconfigured', text: 'WhatsApp provider not configured — opened WhatsApp with pre-filled message for manual sending.' });
      }
    } catch (err: any) {
      setWaOutcome({ type: 'error', text: formatApiError(err, 'Failed to share the return.') });
    } finally {
      setWaSending(false);
    }
  };

  // Upload after save flow
  const finishSaveFlow = async (returnId: string, resultCode: string, values: any): Promise<boolean> => {
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
        await apiService.upload(`/inventory/receipts/returns/${returnId}/documents`, fd);
      } catch {
        failed.push(p.name);
        remaining.push(p);
      }
    }

    if (remaining.length) {
      pendingFilesRef.current = remaining;
      setPendingFiles(remaining);
      setSaveDialogError(
        `Return ${resultCode} was saved, but ${failed.length} of ${todo.length} file upload(s) failed (${failed.join(', ')}). ` +
        'Use Retry to upload only the remaining file(s).',
      );
      setSaveDialogRetry(() => () => { setSaveDialogPhase('loading'); setSaveDialogError(undefined); void finishSaveFlow(returnId, resultCode, values); });
      setSaveDialogSuccessTitle(editingId ? 'Return Updated, Some Files Pending' : 'Return Confirmed, Some Files Pending');
      setSaveDialogPhase('error');
      return false;
    }

    const shareInfo = buildShareInfo(resultCode, values);
    setSaveDialogResult({
      title: editingId ? 'Return Updated' : 'Return Submitted',
      recordType: 'Return Code',
      recordCode: resultCode,
      recordName: values.sourceNo ? `DC #${values.sourceNo}` : undefined,
      message: `${rows.filter((r) => r.itemId).length} raw material line(s) returned. Total Returned Qty: ${formatNumber(totalQty, 2)}`,
      extra: (
        <Space wrap>
          <Button
            icon={<WhatsAppOutlined style={{ color: '#25D366' }} />}
            onClick={() => {
              setSaveDialogVisible(false);
              openWaShare(shareInfo, returnId);
            }}
          >
            Share on WhatsApp
          </Button>
          <Button
            type="primary"
            onClick={() => {
              setSaveDialogVisible(false);
              openCreate();
            }}
          >
            New Return
          </Button>
        </Space>
      ),
    });
    setSaveDialogPhase('success');

    setModalOpen(false);
    setIsModalMinimized(false);
    form.resetFields();
    setRows([emptyLine()]);
    setEditingId(null);
    setPage(1);
    void loadList(1);
    return true;
  };

  const onFinish = async (values: any) => {
    if (!rows.length) { message.error('Add at least one raw material line.'); return; }
    const invalid = rows.find((r) => !r.itemId || !r.uomId);
    if (invalid) { message.error('Every line needs an item and a UOM.'); return; }
    const hasQty = rows.some((r) => Number(r.quantity || 0) > 0);
    if (!hasQty) { message.error('At least one line must have a quantity greater than zero.'); return; }
    const duplicates = rows.filter((r) => rows.filter((o) => o.itemId === r.itemId && o.itemId).length > 1);
    if (duplicates.length) { message.error('An item can only appear once per return.'); return; }

    setSubmitting(true);
    setSaveDialogVisible(true);
    setSaveDialogPhase('loading');
    setSaveDialogSuccessTitle(editingId ? 'Return Updated Successfully' : 'Return Submitted Successfully');
    setSaveDialogError(undefined);

    const payload = {
      divisionId: values.divisionId,
      sectionId: values.sectionId,
      departmentId: values.departmentId,
      warehouseId: values.warehouseId,
      returnDate: values.returnDate ? values.returnDate.format('YYYY-MM-DD') : undefined,
      sourceNo: values.sourceNo || undefined,
      referenceReceiptId: values.referenceReceiptId || undefined,
      productionOrderId: values.productionOrderId || undefined,
      reference: values.reference || undefined,
      reason: values.reason || undefined,
      remarks: values.remarks || undefined,
      items: rows.map((r) => ({
        itemId: r.itemId,
        uomId: r.uomId,
        quantity: Number(r.quantity || 0),
      })),
    };

    try {
      let resultReturnCode = editingId ? (list.find((x) => x.id === editingId)?.returnCode || editingId) : '';
      let returnId = editingId || '';

      if (editingId) {
        await apiService.patch<{ success: boolean }>(`/inventory/receipts/returns/${editingId}`, payload);
      } else {
        const res = await apiService.post<{ success: boolean; data?: any }>('/inventory/receipts/return-multi', payload);
        resultReturnCode = res.data?.returnCode || 'Submitted';
        returnId = res.data?.id || '';
      }

      await finishSaveFlow(returnId, resultReturnCode, values);
    } catch (err: any) {
      const errMsg = formatApiError(err, 'Failed to save the return.');
      setSaveDialogError(errMsg);
      setSaveDialogRetry(() => () => onFinish(values));
      setSaveDialogPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (rec: ReturnHeader) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await apiService.get<{ data: ReturnHeader }>(`/inventory/receipts/returns/${rec.id}`);
      setDetail(res.data);
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to load the return detail.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (rec: ReturnHeader) => {
    try {
      await apiService.delete<{ success: boolean }>(`/inventory/receipts/returns/${rec.id}`);
      message.success('Return deleted and inventory balance reversed.');
      void loadList(page);
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to delete the return.'));
    }
  };

  const applyFilter = (patch: Partial<typeof filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setPage(1);
    void loadList(1, next);
  };

  // Table Columns
  const columns: ColumnsType<ReturnHeader> = [
    {
      title: 'Return Code',
      dataIndex: 'returnCode',
      key: 'returnCode',
      width: 140,
      render: (v, r) => (
        <a onClick={() => openDetail(r)} style={{ fontWeight: 600 }}>
          {v || '—'}
        </a>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'returnDate',
      key: 'returnDate',
      width: 120,
      render: (v) => (v ? dayjs(v).format('DD-MMM-YYYY') : '—'),
    },
    {
      title: 'Warehouse',
      dataIndex: ['warehouse', 'name'],
      key: 'warehouse',
      width: 180,
      render: (v, r) => formatNameWithCode(v, r.warehouse?.warehouseCode),
    },
    {
      title: 'Division / Section',
      key: 'divSec',
      width: 200,
      render: (_, r) => {
        const divName = r.division?.name;
        const secName = r.section?.name;
        return (
          <div>
            <div>{formatNameWithCode(divName, r.division?.divisionCode)}</div>
            {secName && <Text type="secondary" style={{ fontSize: 11 }}>{formatNameWithCode(secName, r.section?.sectionCode)}</Text>}
          </div>
        );
      },
    },
    {
      title: 'Lines',
      dataIndex: 'lineCount',
      key: 'lineCount',
      width: 70,
      align: 'right',
      render: (v) => formatNumber(v, 0),
    },
    {
      title: 'Total Return Qty',
      dataIndex: 'quantityTotal',
      key: 'quantityTotal',
      width: 140,
      align: 'right',
      render: (v) => <strong style={{ color: 'var(--theme-danger, #ff4d4f)' }}>{formatNumber(v, 2)}</strong>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (v) => (
        <Tag color={v === 'CONFIRMED' ? 'success' : v === 'CANCELLED' ? 'error' : 'default'}>
          {v || 'CONFIRMED'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 150,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="View Details">
            <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openDetail(r)} />
          </Tooltip>
          <Tooltip title="Share on WhatsApp">
            <Button
              size="small"
              type="text"
              icon={<WhatsAppOutlined style={{ color: '#25D366' }} />}
              onClick={async () => {
                const hide = message.loading('Loading return for sharing…', 0);
                try {
                  const res = await apiService.get<{ data: ReturnHeader }>(`/inventory/receipts/returns/${r.id}`);
                  const d = res.data;
                  openWaShare({
                    returnCode: d.returnCode,
                    sourceNo: d.sourceNo || undefined,
                    referenceReceiptCode: d.referenceReceipt?.receiptCode,
                    returnDate: d.returnDate,
                    divisionName: d.division?.name,
                    divisionCode: d.division?.divisionCode,
                    sectionName: d.section?.name,
                    sectionCode: d.section?.sectionCode,
                    departmentName: d.department?.name,
                    departmentCode: d.department?.departmentCode,
                    warehouseName: d.warehouse?.name,
                    warehouseCode: d.warehouse?.warehouseCode,
                    reason: d.reason || undefined,
                    reference: d.reference || undefined,
                    lines: (d.lines || []).map((l) => ({
                      itemCode: l.item?.itemCode,
                      itemName: l.item?.name,
                      uomCode: l.uom?.code || l.uom?.symbol,
                      quantity: Number(l.quantity || 0),
                    })),
                    quantityTotal: Number(d.quantityTotal || 0),
                  }, r.id);
                } catch (err: any) {
                  message.error(formatApiError(err, 'Failed to load return for sharing.'));
                } finally {
                  hide();
                }
              }}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm title="Delete this return? Reverses posted stock." onConfirm={() => handleDelete(r)} okText="Delete" okButtonProps={{ danger: true }}>
            <Tooltip title="Delete">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Return Item Grid Columns
  const lineColumns: ColumnsType<LineRow> = [
    {
      title: '#',
      key: 'index',
      width: 45,
      render: (_, __, i) => i + 1,
    },
    {
      title: (
        <span>
          Raw Material <Text type="danger">*</Text>
        </span>
      ),
      key: 'itemId',
      render: (_, r) => (
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Select raw material"
          style={{ width: '100%' }}
          popupMatchSelectWidth={false}
          dropdownStyle={{ minWidth: 320 }}
          value={r.itemId}
          onChange={(v) => onItemSelect(r.key, v)}
          options={itemOptions}
          virtual
          listHeight={SECTION_SELECT_LIST_HEIGHT}
          notFoundContent={watchDivision ? 'No raw materials for this division' : 'Select division first'}
        />
      ),
    },
    {
      title: 'UOM',
      key: 'uomId',
      width: 130,
      render: (_, r) => (
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="UOM"
          style={{ width: '100%' }}
          value={r.uomId}
          onChange={(v) => setRow(r.key, { uomId: v })}
          options={uomOptions}
          virtual
          listHeight={160}
        />
      ),
    },
    {
      title: (
        <span>
          Return Qty <Text type="danger">*</Text>
        </span>
      ),
      key: 'quantity',
      width: 140,
      render: (_, r) => (
        <InputNumber
          min={0.0001}
          step={0.01}
          placeholder="0.00"
          style={{ width: '100%' }}
          value={r.quantity}
          onChange={(v) => setRow(r.key, { quantity: v ?? undefined })}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 45,
      render: (_, r) => (
        <Tooltip title="Remove line">
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            disabled={rows.length === 1}
            onClick={() => removeLine(r.key)}
          />
        </Tooltip>
      ),
    },
  ];

  const headerExtra = useMemo(() => (
    <Space wrap size={8}>
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
        New Return
      </Button>
      <Button icon={<ReloadOutlined />} onClick={() => loadList(page)}>
        Refresh
      </Button>
    </Space>
  ), [page]);

  return (
    <div className="erp-dashboard">
      <PageHeader
        icon={<RollbackOutlined />}
        title="Raw Material Return"
        subtitle="Multi-item raw material return. Stock is deducted and reversed in real-time."
        extra={headerExtra}
      />

      <Card className="erp-section-card" title={<Space><RollbackOutlined /> Return History</Space>}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            placeholder="Status"
            allowClear
            style={{ width: 140 }}
            value={filters.status}
            onChange={(v) => applyFilter({ status: v })}
            options={[{ value: 'CONFIRMED', label: 'Confirmed' }, { value: 'CANCELLED', label: 'Cancelled' }]}
          />
          <Select
            placeholder="Warehouse"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 200 }}
            value={filters.warehouseId}
            onChange={(v) => applyFilter({ warehouseId: v })}
            options={warehouseOptions}
            virtual
            listHeight={160}
          />
          <Input
            placeholder="Source / DC No"
            allowClear
            style={{ width: 160 }}
            value={filters.sourceNo}
            onChange={(e) => applyFilter({ sourceNo: e.target.value || undefined })}
          />
          <DatePicker.RangePicker
            value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)] : undefined}
            onChange={(v) => applyFilter({
              dateFrom: v?.[0] ? v[0].format('YYYY-MM-DD') : undefined,
              dateTo: v?.[1] ? v[1].format('YYYY-MM-DD') : undefined,
            })}
          />
        </Space>

        {listState === 'error' ? (
          <Alert
            type="error"
            showIcon
            message="Returns could not be loaded"
            description={
              <Space direction="vertical" size={8} style={{ marginTop: 4 }}>
                <span>Returns could not be loaded. Please ensure your permissions or try refreshing.</span>
                <Button size="small" type="primary" ghost icon={<ReloadOutlined />} onClick={() => loadList(page)}>
                  Retry Loading
                </Button>
              </Space>
            }
          />
        ) : (
          <Table
            columns={columns}
            dataSource={list}
            rowKey="id"
            loading={listLoading}
            scroll={{ x: 1200 }}
            locale={{ emptyText: listLoading ? 'Loading returns...' : 'No returns found.' }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: false,
              onChange: (p) => { setPage(p); void loadList(p); },
            }}
          />
        )}
      </Card>

      {/* Main Return Modal */}
      <DraggableResizableModal
        title={
          <div className="raw-material-modal-header">
            <span className="raw-material-modal-title">
              {editingId ? 'Edit Raw Material Return' : 'New Raw Material Return'}
            </span>
            <span className="raw-material-modal-sub">
              {editingId ? 'Modify returned quantities and documents with live stock reconciliation' : 'Real-time multi-item Return entry with live inventory deduction and division matching'}
            </span>
          </div>
        }
        open={modalOpen}
        onCancel={() => {
          if (!submitting) setModalOpen(false);
        }}
        footer={null}
        width={showLivePreview ? 1320 : 880}
        destroyOnHidden={false}
        extra={
          <Space size={6}>
            <Tooltip title={showLivePreview ? 'Hide Live Preview' : 'Show Live Preview'}>
              <Button
                size="small"
                type={showLivePreview ? 'primary' : 'default'}
                icon={showLivePreview ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                onClick={() => setShowLivePreview((v) => !v)}
              >
                Live Preview
              </Button>
            </Tooltip>
            <Tooltip title="Minimize to taskbar">
              <Button
                size="small"
                type="text"
                icon={<span style={{ display: 'inline-block', width: 10, height: 2, background: 'currentColor', verticalAlign: 'middle' }} />}
                onClick={() => {
                  setIsModalMinimized(true);
                  setModalOpen(false);
                }}
              />
            </Tooltip>
          </Space>
        }
      >
        <div className={`raw-material-modal-layout ${!showLivePreview ? 'raw-material-modal-layout--single' : ''}`}>
          {/* Left Column: 4-Section Form */}
          <div className="raw-material-modal-form-col">
            <Form form={form} layout="vertical" onFinish={onFinish}>
              {/* SECTION 1: Organization & Origin Warehouse */}
              <div className="rm-form-section-card">
                <div className="rm-form-section-header">
                  <span className="rm-form-section-number">01</span>
                  <div className="rm-form-section-title-wrap">
                    <div className="rm-form-section-title">Organization &amp; Origin Warehouse</div>
                    <div className="rm-form-section-subtitle">Select facility hierarchy and return source warehouse</div>
                  </div>
                </div>
                <div className="rm-form-section-body">
                  <Row gutter={12}>
                    <Col xs={24} md={8}>
                      <Form.Item name="divisionId" label={<span>Division <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select Division' }]}>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Select Division"
                          popupMatchSelectWidth={false}
                          dropdownStyle={{ minWidth: 280 }}
                          loading={refState === 'loading'}
                          status={refState === 'error' ? 'error' : undefined}
                          options={divisionOptions}
                          virtual
                          listHeight={SECTION_SELECT_LIST_HEIGHT}
                          notFoundContent={refState === 'loading' ? <Text type="secondary">Loading…</Text> : 'No divisions'}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="sectionId" label={<span>Section <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select Section' }]}>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder={watchDivision ? 'Select Section' : 'Select Division first'}
                          disabled={!watchDivision}
                          popupMatchSelectWidth={false}
                          dropdownStyle={{ minWidth: 280 }}
                          loading={refState === 'loading' || sectionsLoading}
                          status={refState === 'error' ? 'error' : undefined}
                          options={sectionOptions}
                          virtual
                          listHeight={SECTION_SELECT_LIST_HEIGHT}
                          notFoundContent={refState === 'loading' || sectionsLoading ? <Text type="secondary">Loading…</Text> : 'No sections'}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="departmentId" label={<span>Department <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select Department' }]}>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder={watchSection ? 'Select Department' : 'Select Section first'}
                          disabled={!watchSection}
                          popupMatchSelectWidth={false}
                          dropdownStyle={{ minWidth: 280 }}
                          loading={refState === 'loading' || departmentsLoading}
                          status={refState === 'error' ? 'error' : undefined}
                          options={departmentOptions}
                          virtual
                          listHeight={SECTION_SELECT_LIST_HEIGHT}
                          notFoundContent={refState === 'loading' || departmentsLoading ? <Text type="secondary">Loading…</Text> : 'No departments in this section'}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="warehouseId" label={<span>Return From Warehouse <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select warehouse' }]}>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Select warehouse"
                          popupMatchSelectWidth={false}
                          dropdownStyle={{ minWidth: 280 }}
                          status={refState === 'error' ? 'error' : undefined}
                          options={warehouseOptions}
                          virtual
                          listHeight={SECTION_SELECT_LIST_HEIGHT}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="returnDate" label="Return Date">
                        <DatePicker style={{ width: '100%' }} placeholder="Defaults to today" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="sourceNo" label="Source / DC No">
                        <Input placeholder="Optional" maxLength={50} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="referenceReceiptId" label="Reference Gate Pass Receipt">
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          placeholder="Optional (e.g. RMR-00042)"
                          popupMatchSelectWidth={false}
                          dropdownStyle={{ minWidth: 260 }}
                          options={receiptRefOptions}
                          virtual
                          listHeight={160}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="reference" label="Reference / Tracking Code">
                        <Input placeholder="e.g. RET-REF-001" maxLength={100} />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>
              </div>

              {/* SECTION 2: Return Items & Quantities */}
              <div className="rm-form-section-card">
                <div className="rm-form-section-header" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="rm-form-section-number">02</span>
                    <div className="rm-form-section-title-wrap">
                      <div className="rm-form-section-title">Return Materials &amp; Quantities</div>
                      <div className="rm-form-section-subtitle">Raw material lines returned from shopfloor or staging warehouse</div>
                    </div>
                  </div>
                  <Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={addLine}>
                    Add Material
                  </Button>
                </div>
                <div className="rm-form-section-body">
                  {refState === 'error' ? (
                    <Alert type="error" showIcon message="Reference data could not be loaded. Please refresh the page." />
                  ) : (
                    <Table
                      columns={lineColumns}
                      dataSource={rows}
                      rowKey="key"
                      pagination={false}
                      size="small"
                      scroll={{ x: 720 }}
                      locale={{ emptyText: 'No lines added yet.' }}
                    />
                  )}
                  <Row gutter={12} style={{ marginTop: 12 }}>
                    <Col xs={24} style={{ textAlign: 'right' }}>
                      <Text strong>Total Return Quantity:</Text>{' '}
                      <Text style={{ color: 'var(--theme-danger, #ff4d4f)', fontSize: 16, fontWeight: 700 }}>
                        {formatNumber(totalQty, 2)}
                      </Text>
                    </Col>
                  </Row>
                </div>
              </div>

              {/* DEDICATED INVENTORY IMPACT PREVIEW CARD */}
              <Card
                size="small"
                title={<Space><DatabaseOutlined /> INVENTORY IMPACT PREVIEW (RETURN)</Space>}
                className="erp-section-card-inner"
                style={{ marginBottom: 12 }}
                data-testid="rm-return-inv-preview-summary"
              >
                {invSummaryGroups.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Select raw materials and a return warehouse above to preview the real-time stock deduction.
                  </Text>
                ) : (
                  <div className="rmr-inv-summary">
                    {invSummaryGroups.map((g) => {
                      const uom = g.uomCode || '';
                      return (
                        <div key={g.itemId} className="rmr-inv-summary-item" data-testid={`rm-return-inv-summary-${g.itemId}`}>
                          <div className="rmr-inv-summary-head">
                            <span className="rmr-inv-summary-title">{g.itemCode || '—'}</span>
                            {g.itemName && <Text type="secondary" style={{ fontSize: 11 }}>{g.itemName}</Text>}
                            {g.negative && (
                              <Tag color="error" style={{ marginLeft: 'auto', fontWeight: 600 }}>
                                Negative Stock Warning
                              </Tag>
                            )}
                          </div>
                          {g.error ? (
                            <div className="rmr-inv-summary-status">
                              <Text type="danger" style={{ fontSize: 12 }}>{g.error}</Text>
                              <Button type="link" size="small" icon={<ReloadOutlined />} onClick={retryInvPreview}>Retry</Button>
                            </div>
                          ) : g.loading ? (
                            <div className="rmr-inv-summary-status">
                              <Spin size="small" /> <Text type="secondary" style={{ fontSize: 12 }}>Loading current stock…</Text>
                            </div>
                          ) : (
                            <div className="rmr-inv-summary-grid">
                              <div className="rmr-inv-summary-cell">
                                <span className="rmr-inv-summary-label">Current Inventory</span>
                                <span className="rmr-inv-summary-value">{formatNumber(g.current ?? 0, 2)} {uom}</span>
                              </div>
                              <div className="rmr-inv-summary-op" style={{ color: '#ef4444' }}>−</div>
                              <div className="rmr-inv-summary-cell">
                                <span className="rmr-inv-summary-label">This Return</span>
                                <span className="rmr-inv-summary-value" style={{ color: '#ef4444' }}>{formatNumber(g.returned, 2)} {uom}</span>
                              </div>
                              <div className="rmr-inv-summary-op">=</div>
                              <div className="rmr-inv-summary-cell">
                                <span className="rmr-inv-summary-label">Balance After Return</span>
                                <span className="rmr-inv-summary-value rmr-inv-summary-after" style={{ color: g.negative ? '#ef4444' : undefined }}>
                                  {g.after !== null ? formatNumber(g.after, 2) : '—'} {uom}
                                </span>
                              </div>
                            </div>
                          )}
                          {g.missing && !g.error && !g.loading && (
                            <div className="rmr-inv-row-note">No existing balance record — treated as 0 stock</div>
                          )}
                          {g.prior > 0 && !g.error && !g.loading && (
                            <div className="rmr-inv-summary-prior">
                              Prior returned {formatNumber(g.prior, 2)} {uom} from this record is reversed in preview.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="rmr-inv-summary-foot">
                  Returns deduct stock from the selected warehouse. This preview is read-only and posts upon submit.
                </div>
              </Card>

              {/* SECTION 3: Evidence, Photos & Documents */}
              <div className="rm-form-section-card">
                <div className="rm-form-section-header">
                  <span className="rm-form-section-number">03</span>
                  <div className="rm-form-section-title-wrap">
                    <div className="rm-form-section-title">
                      Evidence, Photos &amp; Documents {pendingFiles.length > 0 ? <Tag color="blue">{pendingFiles.length} pending</Tag> : null}
                    </div>
                    <div className="rm-form-section-subtitle">Capture return material photos, quality reports, or physical gate-pass return receipts</div>
                  </div>
                </div>
                <div className="rm-form-section-body">
                  <div className="rmr-upload-group">
                    <Space wrap>
                      <Button icon={<CameraOutlined />} onClick={() => photoInputRef.current?.click()}>
                        Take / Add Photo
                      </Button>
                      <Button icon={<PaperClipOutlined />} onClick={() => attachInputRef.current?.click()}>
                        Add Attachment
                      </Button>
                    </Space>
                    <span className="rmr-upload-hint">
                      Photos: JPEG / PNG / WebP (≤ 5 MB). Attachments: PDF, Office, txt, csv (≤ 10 MB).
                      Files upload after the return is saved.
                    </span>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handlePhotoSelect}
                    />
                    <input
                      ref={attachInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleAttachSelect}
                    />
                  </div>

                  {editingId && existingDocs.length > 0 && (
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
                                <Button size="small" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </div>
                          ) : (
                            <div key={doc.id} className="rmr-pending-attach">
                              <PaperClipOutlined />
                              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="rmr-pending-link">{doc.fileName}</a>
                              <span className="rmr-pending-size">{doc.fileSize ? formatBytes(doc.fileSize) : ''}</span>
                              <Popconfirm title="Remove this document?" onConfirm={() => handleRemoveExistingDoc(doc)} okText="Remove" okButtonProps={{ danger: true }}>
                                <Button size="small" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  {pendingFiles.length === 0 ? (
                    <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                      {editingId ? 'No new documents pending — add photos of returned items or physical return slips above.' : 'No documents pending.'}
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
                              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removePendingFile(p.key)} />
                            </Tooltip>
                          </div>
                        ) : (
                          <div key={p.key} className="rmr-pending-attach">
                            <PaperClipOutlined />
                            <span className="rmr-pending-name" title={p.name}>{p.name}</span>
                            <span className="rmr-pending-size">{formatBytes(p.size)}</span>
                            <Tooltip title="Remove">
                              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removePendingFile(p.key)} />
                            </Tooltip>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 4: Reason & Remarks */}
              <div className="rm-form-section-card">
                <div className="rm-form-section-header">
                  <span className="rm-form-section-number">04</span>
                  <div className="rm-form-section-title-wrap">
                    <div className="rm-form-section-title">Return Reason &amp; Remarks</div>
                    <div className="rm-form-section-subtitle">Audit reasons and warehouse remarks for trace-back</div>
                  </div>
                </div>
                <div className="rm-form-section-body">
                  <Form.Item
                    name="reason"
                    label={<span>Return Reason <Text type="danger">*</Text></span>}
                    rules={[{ required: true, message: 'Enter the reason for the return' }]}
                  >
                    <Input.TextArea rows={2} maxLength={1000} placeholder="e.g. Excess raw material returned from Spoke shopfloor after job completion." />
                  </Form.Item>
                  <Form.Item name="remarks" label="Additional Remarks">
                    <Input.TextArea rows={2} maxLength={1000} placeholder="Optional warehouse or QA remarks" />
                  </Form.Item>
                </div>
              </div>

              <Space style={{ marginTop: 12 }}>
                <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={submitting}>
                  {editingId ? 'Save Changes' : 'Submit Return'}
                </Button>
                <Button onClick={() => setModalOpen(false)} disabled={submitting}>
                  Cancel
                </Button>
              </Space>
            </Form>
          </div>

          {/* Right Column: 2027 Live Verification Side Panel */}
          {showLivePreview && (
            <div className="raw-material-modal-preview-col">
              <div className="raw-material-live-preview-card">
                <div
                  className="rm-preview-header-badge"
                  style={{ background: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.35)', color: '#d97706' }}
                >
                  <span className="rm-minimized-window-pulse" style={{ width: 6, height: 6, background: '#f59e0b' }} />
                  RETURN VERIFICATION (2027)
                </div>
                <div className="rm-preview-doc-title">
                  {editingId ? 'Updating Return' : 'New Raw Material Return'}
                </div>
                <div className="rm-preview-doc-subtitle">
                  Return Code:{' '}
                  <Text strong style={{ color: 'var(--theme-warning, #d48806)' }}>
                    {editingId ? (list.find((x) => x.id === editingId)?.returnCode || 'Editing') : 'Auto-Assigned on Submit'}
                  </Text>
                </div>

                <div className="rm-preview-meta-grid">
                  <div className="rm-preview-meta-row">
                    <span className="rm-preview-meta-label">Division</span>
                    <span className="rm-preview-meta-value" title={refData?.divisions.find((d) => d.id === watchDivision)?.name}>
                      {formatNameWithCode(
                        refData?.divisions.find((d) => d.id === watchDivision)?.name,
                        refData?.divisions.find((d) => d.id === watchDivision)?.divisionCode,
                      )}
                    </span>
                  </div>
                  <div className="rm-preview-meta-row">
                    <span className="rm-preview-meta-label">Section</span>
                    <span className="rm-preview-meta-value" title={sections.find((s) => s.id === watchSection)?.name}>
                      {formatNameWithCode(
                        sections.find((s) => s.id === watchSection)?.name,
                        sections.find((s) => s.id === watchSection)?.sectionCode,
                      )}
                    </span>
                  </div>
                  <div className="rm-preview-meta-row">
                    <span className="rm-preview-meta-label">Department</span>
                    <span className="rm-preview-meta-value" title={departments.find((dp) => dp.id === watchDepartment)?.name}>
                      {formatNameWithCode(
                        departments.find((dp) => dp.id === watchDepartment)?.name,
                        departments.find((dp) => dp.id === watchDepartment)?.departmentCode,
                      )}
                    </span>
                  </div>
                  <div className="rm-preview-meta-row">
                    <span className="rm-preview-meta-label">Return Warehouse</span>
                    <span className="rm-preview-meta-value" title={refData?.warehouses.find((w) => w.id === watchWarehouse)?.name}>
                      {formatNameWithCode(
                        refData?.warehouses.find((w) => w.id === watchWarehouse)?.name,
                        refData?.warehouses.find((w) => w.id === watchWarehouse)?.warehouseCode,
                      )}
                    </span>
                  </div>
                  <div className="rm-preview-meta-row">
                    <span className="rm-preview-meta-label">Return Date</span>
                    <span className="rm-preview-meta-value">
                      {watchReturnDate ? watchReturnDate.format('DD-MMM-YYYY') : dayjs().format('DD-MMM-YYYY')}
                    </span>
                  </div>
                  {watchSourceNo && (
                    <div className="rm-preview-meta-row">
                      <span className="rm-preview-meta-label">Source / DC No</span>
                      <span className="rm-preview-meta-value">{watchSourceNo}</span>
                    </div>
                  )}
                  {watchReferenceReceiptId && (
                    <div className="rm-preview-meta-row">
                      <span className="rm-preview-meta-label">Ref Gate Pass</span>
                      <span className="rm-preview-meta-value">
                        {receiptRefs.find((r) => r.id === watchReferenceReceiptId)?.receiptCode || watchReferenceReceiptId}
                      </span>
                    </div>
                  )}
                  {watchReason && (
                    <div className="rm-preview-meta-row">
                      <span className="rm-preview-meta-label">Reason</span>
                      <span className="rm-preview-meta-value" title={watchReason}>{watchReason}</span>
                    </div>
                  )}
                </div>

                <div className="rm-preview-kpi-grid">
                  <div className="rm-preview-kpi-card">
                    <div className="rm-preview-kpi-num">{rows.filter((r) => r.itemId).length}</div>
                    <div className="rm-preview-kpi-label">Active Lines</div>
                  </div>
                  <div className="rm-preview-kpi-card" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
                    <div className="rm-preview-kpi-num" style={{ color: '#ef4444' }}>{formatNumber(totalQty, 2)}</div>
                    <div className="rm-preview-kpi-label">Total Return Qty</div>
                  </div>
                </div>

                <div style={{ fontWeight: 600, fontSize: 12, color: '#475569', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Material Lines &amp; Stock Projection</span>
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
                      const uomLabel = uom?.code || uom?.symbol || '';
                      const cur = invCurrentOnHand(r.itemId);
                      const prior = invPriorForItem(r.itemId);
                      const qty = Number(r.quantity || 0);
                      const after = cur !== null ? cur + prior - qty : null;
                      const isNegative = after !== null && after < 0;

                      return (
                        <div key={r.key || idx} className="rm-preview-line-row">
                          <div className="rm-preview-line-header">
                            <span className="rm-preview-line-title">
                              #{idx + 1} {formatNameWithCode(item?.name, item?.itemCode)}
                            </span>
                            <span className="rm-preview-line-badge">
                              <Tag color="volcano" style={{ margin: 0, fontSize: 11 }}>RETURN OUT</Tag>
                            </span>
                          </div>
                          <div className="rm-preview-line-metrics">
                            <div className="rm-preview-metric-pill">
                              <span className="rm-preview-metric-label">Ret Qty:</span>
                              <span className="rm-preview-metric-val" style={{ color: '#ef4444', fontWeight: 700 }}>
                                {formatNumber(r.quantity, 2)} {uomLabel}
                              </span>
                            </div>
                            <div className="rm-preview-metric-pill rm-preview-metric-pill--proj">
                              <span className="rm-preview-metric-label">Inv:</span>
                              {cur !== null ? (
                                <span className="rm-preview-metric-val" style={{ color: isNegative ? '#dc2626' : undefined }}>
                                  {formatNumber(cur, 2)} <ArrowRightOutlined style={{ fontSize: 10, color: '#ef4444', margin: '0 2px' }} /> {after !== null ? formatNumber(after, 2) : '—'} {uomLabel}
                                </span>
                              ) : (
                                <span className="rm-preview-metric-val">—</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DraggableResizableModal>

      {/* Minimized Window Tab Dock */}
      {isModalMinimized && (
        <div className="rm-modal-minimized-dock">
          <div
            className="rm-minimized-window-tab"
            onClick={() => {
              setIsModalMinimized(false);
              setModalOpen(true);
            }}
            title="Click to restore Return Window"
          >
            <span className="rm-minimized-window-pulse" style={{ background: '#f59e0b' }} />
            <RollbackOutlined style={{ color: '#d97706' }} />
            <span>{editingId ? 'Edit Return' : 'New Raw Material Return'} ({rows.filter((r) => r.itemId).length} lines)</span>
            <span
              className="rm-minimized-window-close"
              onClick={(e) => {
                e.stopPropagation();
                setIsModalMinimized(false);
              }}
              title="Close"
            >
              <CloseOutlined />
            </span>
          </div>
        </div>
      )}

      {/* Save / Feedback Dialog */}
      <SaveResultDialog
        open={saveDialogVisible}
        phase={saveDialogPhase}
        result={saveDialogResult}
        errorMessage={saveDialogError}
        successTitle={saveDialogSuccessTitle}
        loadingTitle="Posting Raw Material Return..."
        loadingHint="Validating inventory balance and posting stock reduction ledger movements..."
        onRetry={saveDialogRetry}
        onClose={() => setSaveDialogVisible(false)}
      />

      {/* WhatsApp Share Modal */}
      <Modal
        title={
          <Space>
            <span style={{ display: 'inline-flex', padding: '4px 6px', borderRadius: 6, background: '#25D366', color: '#fff' }}>
              <WhatsAppOutlined />
            </span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Share Return on WhatsApp</span>
          </Space>
        }
        open={waOpen}
        onCancel={() => setWaOpen(false)}
        footer={null}
        width={560}
        destroyOnHidden
      >
        {waShareInfo ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Alert
              type="info"
              showIcon
              message={<span style={{ fontWeight: 600 }}>Return #{waShareInfo.returnCode} {waShareInfo.sourceNo ? `· Source #${waShareInfo.sourceNo}` : ''}</span>}
              description="Message is pre-formatted with Item Name first, codes in brackets, and returned quantities."
            />
            <div>
              <Text strong>Optional Phone Number (with Country Code)</Text> <Text type="secondary" style={{ fontSize: 12 }}>&nbsp;e.g. 92 300 1234567</Text>
              <Input
                prefix={<WhatsAppOutlined style={{ color: '#25D366' }} />}
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="923001234567 (leave blank to choose contact inside WhatsApp)"
                maxLength={20}
                style={{ marginTop: 4 }}
              />
            </div>
            <div>
              <Text strong>Formatted WhatsApp Message</Text>
              <Input.TextArea
                value={waMessage}
                onChange={(e) => setWaMessage(e.target.value)}
                rows={9}
                style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>

            {waOutcome && (
              <Alert
                type={waOutcome.type === 'error' ? 'error' : waOutcome.type === 'queued' ? 'success' : 'info'}
                showIcon
                message={waOutcome.text}
              />
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <Space>
                <Button icon={<CopyOutlined />} onClick={handleWaCopy}>
                  Copy Message
                </Button>
                <Button
                  icon={<WhatsAppOutlined style={{ color: '#25D366' }} />}
                  onClick={() => {
                    const url = waPhone ? waLink(waPhone, waMessage) : waDirectShareUrl(waMessage);
                    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* ignore */ }
                  }}
                >
                  Open WhatsApp
                </Button>
              </Space>
              <Button type="primary" icon={<SendOutlined />} loading={waSending} onClick={handleWaSend}>
                Send via ERP
              </Button>
            </div>
          </Space>
        ) : (
          <Spin />
        )}
      </Modal>

      {/* Return Detail Drawer */}
      <Drawer
        title={
          <Space>
            <RollbackOutlined />
            <span>Return Detail: {detail?.returnCode}</span>
            <Tag color={detail?.status === 'CONFIRMED' ? 'success' : 'default'}>{detail?.status}</Tag>
          </Space>
        }
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetail(null); }}
        width={780}
      >
        {detailLoading ? (
          <Spin style={{ display: 'block', margin: '40px auto' }} />
        ) : detail ? (
          <div>
            <Card size="small" className="erp-section-card-inner" style={{ marginBottom: 16 }}>
              <Row gutter={[16, 12]}>
                <Col span={12}><Text type="secondary">Return Code:</Text> <div><Text strong>{detail.returnCode}</Text></div></Col>
                <Col span={12}><Text type="secondary">Date:</Text> <div>{dayjs(detail.returnDate).format('DD-MMM-YYYY')}</div></Col>
                <Col span={12}><Text type="secondary">Division:</Text> <div>{formatNameWithCode(detail.division?.name, detail.division?.divisionCode)}</div></Col>
                <Col span={12}><Text type="secondary">Section:</Text> <div>{formatNameWithCode(detail.section?.name, detail.section?.sectionCode)}</div></Col>
                <Col span={12}><Text type="secondary">Department:</Text> <div>{formatNameWithCode(detail.department?.name, detail.department?.departmentCode)}</div></Col>
                <Col span={12}><Text type="secondary">Warehouse:</Text> <div>{formatNameWithCode(detail.warehouse?.name, detail.warehouse?.warehouseCode)}</div></Col>
                {detail.sourceNo && <Col span={12}><Text type="secondary">Source / DC No:</Text> <div>{detail.sourceNo}</div></Col>}
                {detail.referenceReceipt && <Col span={12}><Text type="secondary">Ref Gate Pass:</Text> <div>{detail.referenceReceipt.receiptCode}</div></Col>}
                {detail.reason && <Col span={24}><Text type="secondary">Reason:</Text> <div>{detail.reason}</div></Col>}
                {detail.remarks && <Col span={24}><Text type="secondary">Remarks:</Text> <div>{detail.remarks}</div></Col>}
              </Row>
            </Card>

            <Title level={5}>Returned Materials ({detail.lines?.length || 0} Lines)</Title>
            <Table
              dataSource={detail.lines || []}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                { title: '#', key: 'idx', width: 45, render: (_, __, i) => i + 1 },
                { title: 'Item', key: 'item', render: (_, r) => formatNameWithCode(r.item?.name, r.item?.itemCode) },
                { title: 'UOM', key: 'uom', width: 90, render: (_, r) => r.uom?.code || r.uom?.symbol || '—' },
                { title: 'Quantity', dataIndex: 'quantity', key: 'qty', width: 120, align: 'right', render: (v) => <strong style={{ color: '#ef4444' }}>{formatNumber(v, 2)}</strong> },
              ]}
            />
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <Text strong>Total Returned Quantity: </Text>
              <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: 700 }}>
                {formatNumber(detail.quantityTotal, 2)}
              </Text>
            </div>

            {detail.documents && detail.documents.length > 0 && (
              <>
                <Divider style={{ margin: '16px 0' }} />
                <Title level={5}>Documents &amp; Photos ({detail.documents.length})</Title>
                <div className="rmr-pending-list">
                  {detail.documents.map((doc) => (
                    doc.kind === 'PHOTO' ? (
                      <div key={doc.id} className="rmr-pending-photo">
                        <img src={doc.fileUrl} alt={doc.fileName} className="rmr-preview-thumb" />
                        <div className="rmr-pending-meta">
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="rmr-pending-link">{doc.fileName}</a>
                          <span className="rmr-pending-size">{doc.fileSize ? formatBytes(doc.fileSize) : ''}</span>
                        </div>
                      </div>
                    ) : (
                      <div key={doc.id} className="rmr-pending-attach">
                        <PaperClipOutlined />
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="rmr-pending-link">{doc.fileName}</a>
                        <span className="rmr-pending-size">{doc.fileSize ? formatBytes(doc.fileSize) : ''}</span>
                      </div>
                    )
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
};

export default RawMaterialReturn;