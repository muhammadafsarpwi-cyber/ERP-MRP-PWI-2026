import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Space, Tag, Form, Input, Select, App, Card,
  Row, Col, DatePicker, Segmented, Tooltip, Popconfirm, Modal,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, CheckOutlined, ReloadOutlined,
  InboxOutlined, ApartmentOutlined, ShopOutlined, GlobalOutlined,
  FileDoneOutlined, InfoCircleOutlined, CheckCircleOutlined, DeleteOutlined,
  ExclamationCircleOutlined, EyeOutlined, EditOutlined, PrinterOutlined,
  SafetyCertificateOutlined, RollbackOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { useUserStore } from '../../store/userStore';
import { ERPLineItems, ERPLine, DraggableResizableModal } from '../../components/shared';
import { printGoodsReceiptDocument, printGatePassDocument } from '../../utils/printTemplates';
import './GoodsReceiptManagement.css';

interface GoodsReceipt {
  id: string;
  receiptCode: string;
  poId?: string;
  poCode?: string;
  supplierId?: string;
  supplierName?: string;
  divisionId?: string;
  divisionName?: string;
  warehouseId?: string;
  warehouseName?: string;
  purchaseType?: string;
  receiptDate?: string;
  grnNumber?: string;
  deliveryNoteNumber?: string;
  status: string;
  notes?: string;
}

interface DivisionOption {
  id: string;
  code?: string;
  name: string;
}

const DEFAULT_DIVISIONS: DivisionOption[] = [
  { id: 'd1000000-0000-0000-0000-000000000001', code: 'DIV-SPD', name: 'Spoke Division' },
  { id: 'd1000000-0000-0000-0000-000000000002', code: 'DIV-CCD', name: 'Control Cable Division' },
  { id: '83ecd746-1cc9-4849-bec4-d00bcc3ceeec', code: 'DIV-PWI', name: 'Main Division E-51' },
  { id: '50824516-9c24-4122-86e7-c8e6fa1c5869', code: 'DIV-001', name: 'Manufacturing Division' },
  { id: '3f222d46-6f96-44f6-9ead-27467c7e93a1', code: 'DIV-003', name: 'Supply Chain Division' },
  { id: 'div-corp', code: 'CORP', name: 'Corporate & Master Store' },
];

const STATUS_OPTIONS = ['DRAFT', 'RECEIVED', 'INSPECTION', 'ACCEPTED', 'REJECTED', 'POSTED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default',
  RECEIVED: 'blue',
  INSPECTION: 'orange',
  ACCEPTED: 'green',
  REJECTED: 'red',
  POSTED: 'purple',
};

const GoodsReceiptManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [editingItem, setEditingItem] = useState<GoodsReceipt | null>(null);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [viewingItem, setViewingItem] = useState<any>(null);
  const [viewLoading, setViewLoading] = useState(false);
  
  // Master lists
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string; warehouseType?: string; divisionId?: string }>>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>(DEFAULT_DIVISIONS);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [purchaseRequisitions, setPurchaseRequisitions] = useState<any[]>([]);

  // Watched form values
  const watchedDivisionId = Form.useWatch('divisionId', form);
  const watchedWarehouseId = Form.useWatch('warehouseId', form);
  const selectedWarehouse = warehouses.find((w) => w.id === watchedWarehouseId);

  const loadReferences = useCallback(async () => {
    try {
      const [poRes, prRes, supRes] = await Promise.all([
        apiService.get<any>('/procurement/orders', { limit: 100 }),
        apiService.get<any>('/procurement/requisitions', { limit: 100 }),
        apiService.get<{ data: Array<{ id: string; name: string }> }>('/procurement/suppliers', { limit: 200 }),
      ]);
      const poList = poRes?.data || (Array.isArray(poRes) ? poRes : []);
      setPurchaseOrders(poList);
      const prList = prRes?.data || (Array.isArray(prRes) ? prRes : []);
      setPurchaseRequisitions(prList);
      if (supRes?.data) setSuppliers(supRes.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try {
        const p = JSON.parse(erpUser);
        if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId);
      } catch { /* ignore */ }
    }

    (async () => {
      // 1. Suppliers, POs, PRs
      await loadReferences();

      // 2. Warehouses
      try {
        let items: any[] = [];
        try {
          const w = await apiService.get<any>('/warehouses', { limit: 100 });
          items = Array.isArray(w) ? w : w?.data?.items || w?.items || w?.data || [];
        } catch {
          const w2 = await apiService.get<any>('/organization/warehouses', { limit: 100 });
          items = Array.isArray(w2) ? w2 : w2?.data?.items || w2?.items || w2?.data || [];
        }
        setWarehouses(items);
      } catch { /* ignore */ }

      // 3. Divisions
      try {
        const d = await apiService.get<any>('/divisions', { limit: 50 });
        const divItems = Array.isArray(d) ? d : d?.data?.items || d?.data || [];
        if (divItems.length > 0) {
          setDivisions(divItems.map((x: any) => ({ id: x.id, code: x.divisionCode, name: x.name })));
        }
      } catch { /* keep DEFAULT_DIVISIONS */ }
    })();
  }, [loadReferences]);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: GoodsReceipt[]; total: number }>('/procurement/receipts', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch goods receipts');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  // Compute auto-generated CGR receipt code (e.g. CGR-2026-0001)
  const generateReceiptCode = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const nextSeq = (total || data.length || 0) + 1;
    return `CGR-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
  }, [total, data.length]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    loadReferences();
    const autoCode = generateReceiptCode();
    form.setFieldsValue({
      receiptCode: autoCode,
      receiptDate: dayjs(),
      purchaseType: 'LOCAL',
    });
    setLineItems([]);
    setModalVisible(true);
  };

  const handleOpenViewModal = async (record: GoodsReceipt) => {
    setViewLoading(true);
    setViewModalVisible(true);
    try {
      const res = await apiService.get<any>(`/procurement/receipts/${record.id}`);
      setViewingItem(res?.data || res);
    } catch {
      setViewingItem(record);
      message.error('Failed to load full receipt details');
    } finally {
      setViewLoading(false);
    }
  };

  const handlePrintReceipt = async (record: GoodsReceipt) => {
    try {
      const res = await apiService.get<any>(`/procurement/receipts/${record.id}`);
      const detailed = res?.data || res;
      printGoodsReceiptDocument(detailed || record);
    } catch {
      printGoodsReceiptDocument(record);
    }
  };

  const handlePrintGatePass = async (record: GoodsReceipt) => {
    try {
      const res = await apiService.get<any>(`/procurement/receipts/${record.id}`);
      const detailed = res?.data || res;
      const sName = detailed.supplier?.name || detailed.supplierName || (record.supplierId && suppliers.find((s) => s.id === record.supplierId)?.name) || 'Supplier';
      const itemsList = detailed.lines || detailed.items || [];
      const gatePassData = {
        passNumber: detailed.deliveryNoteNumber || detailed.grnNumber || detailed.receiptCode,
        passType: 'INWARD' as const,
        issueDate: detailed.receiptDate || detailed.createdAt || new Date().toISOString(),
        partyName: sName,
        vehicleNumber: detailed.notes?.match(/Vehicle:?\s*([A-Za-z0-9 -]+)/i)?.[1] || '—',
        driverName: '—',
        purpose: `Goods Receipt ${detailed.receiptCode} (${detailed.poCode || 'PO/PR'})`,
        department: detailed.divisionName || 'Main Division',
        remarks: detailed.notes || 'Inbound Goods Receipt at factory warehouse',
        items: itemsList.map((l: any, idx: number) => ({
          srNo: idx + 1,
          itemCode: l.itemCode || l.item?.itemCode || `ITEM-${idx + 1}`,
          description: l.itemName || l.item?.name || l.conditionNotes || 'Item',
          quantity: Number(l.quantityReceived || l.quantity || 0),
          uom: l.uomCode || l.uom?.code || 'PCS',
          remarks: `Accepted: ${l.quantityAccepted || l.quantityReceived || 0}`,
        })),
      };
      printGatePassDocument(gatePassData);
    } catch {
      message.error('Failed to generate gate pass');
    }
  };

  const handleOpenEditModal = async (record: GoodsReceipt) => {
    try {
      const res = await apiService.get<any>(`/procurement/receipts/${record.id}`);
      const detailed = res?.data || res;
      setEditingItem(detailed);
      form.resetFields();
      await loadReferences();

      const derivedDivisionId =
        detailed.divisionId ||
        detailed.warehouse?.divisionId ||
        (detailed.warehouseId && warehouses.find((w) => w.id === detailed.warehouseId)?.divisionId) ||
        (detailed.notes && typeof detailed.notes === 'string'
          ? detailed.notes.match(/\[Division:\s*([^\]]+)\]/)?.[1]
          : undefined);

      const refKey = detailed.poId ? `PO:${detailed.poId}` : undefined;

      form.setFieldsValue({
        referenceKey: refKey,
        receiptCode: detailed.receiptCode,
        poId: detailed.poId || undefined,
        supplierId: detailed.supplierId || detailed.supplier?.id || undefined,
        divisionId: derivedDivisionId,
        warehouseId: detailed.warehouseId || undefined,
        purchaseType: detailed.purchaseType || 'LOCAL',
        receiptDate: detailed.receiptDate ? dayjs(detailed.receiptDate) : dayjs(),
        grnNumber: detailed.grnNumber || undefined,
        deliveryNoteNumber: detailed.deliveryNoteNumber || undefined,
        notes: detailed.notes ? detailed.notes.replace(/\[(Division|Origin):[^\]]+\]\s*/g, '').trim() : undefined,
      });

      // If linked to a PO, fetch the PO to get up-to-date line received quantities
      const poLineMap = new Map<string, any>();
      if (detailed.poId) {
        try {
          const poRes = await apiService.get<any>(`/procurement/orders/${detailed.poId}`);
          const poData = poRes?.data || poRes;
          const poLines = poData?.lines || poData?.items || [];
          for (const pl of poLines) {
            if (pl.id) poLineMap.set(pl.id, pl);
            if (pl.itemId) poLineMap.set(pl.itemId, pl);
          }
        } catch {
          // Fallback if PO fetch fails
        }
      }

      const linesSource = detailed.lines || detailed.items || [];
      const mappedLines: ERPLine[] = linesSource.map((l: any, idx: number) => {
        const poLine = (l.poLineId && poLineMap.get(l.poLineId)) || (l.itemId && poLineMap.get(l.itemId));
        const ordQty = poLine ? Number(poLine.quantity || 0) : Number(l.quantityOrdered || l.quantity || 0);
        const thisRecQty = Number(l.quantityReceived || l.quantity || 0);

        let pastRec = 0;
        if (poLine) {
          const totalReceivedInPoLine = Number(poLine.receivedQuantity || 0);
          if (detailed.status === 'POSTED') {
            pastRec = Math.max(0, totalReceivedInPoLine - thisRecQty);
          } else {
            pastRec = totalReceivedInPoLine;
          }
        }

        const openBalance = Math.max(0, ordQty - pastRec);

        return {
          id: `line-${idx + 1}-${Date.now()}`,
          poLineId: l.poLineId,
          itemId: l.itemId,
          itemCode: l.itemCode || l.item?.itemCode,
          itemName: l.itemName || l.item?.name || l.conditionNotes,
          uomId: l.uomId,
          uomCode: l.uomCode || l.uom?.code || 'PCS',
          orderQuantity: ordQty,
          pastReceived: pastRec,
          orderBalance: openBalance,
          quantity: thisRecQty,
          rate: Number(l.unitPrice || l.rate || 0),
          discountPercent: 0,
          taxPercent: 18,
          lineTotal: Number(l.lineTotal || (thisRecQty * (l.unitPrice || 0))),
          packagingSize: l.packagingSize,
          packagingUnit: l.packagingUnit,
          packageQuantity: l.packageQuantity,
          salesOrderNumber: detailed.poCode,
        };
      });

      setLineItems(mappedLines);
      setModalVisible(true);
    } catch {
      message.error('Failed to load goods receipt for editing');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one receipt line item');
        return;
      }
      setSubmitting(true);

      const targetCompanyId = companyId || values.companyId || useUserStore.getState().user?.defaultCompanyId;

      const payload = {
        companyId: targetCompanyId,
        receiptCode: values.receiptCode,
        poId: values.poId && String(values.poId).trim().length > 0 ? String(values.poId).trim() : undefined,
        supplierId: values.supplierId,
        warehouseId: values.warehouseId,
        divisionId: values.divisionId || undefined,
        purchaseType: values.purchaseType || 'LOCAL',
        receiptDate: values.receiptDate ? dayjs(values.receiptDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        grnNumber: values.grnNumber || undefined,
        deliveryNoteNumber: values.deliveryNoteNumber || undefined,
        notes: values.notes || undefined,
        lines: lineItems.map((l) => ({
          poLineId: l.poLineId && String(l.poLineId).trim().length > 0 ? String(l.poLineId).trim() : undefined,
          itemId: l.itemId,
          uomId: l.uomId,
          quantityOrdered: Number(l.orderQuantity || l.quantity || 0),
          quantityReceived: Number(l.quantity || 0),
          quantityAccepted: Number(l.quantity || 0),
          quantityRejected: 0,
          unitPrice: Number(l.rate || 0),
          conditionNotes: l.salesOrderNumber ? `Ref: ${l.salesOrderNumber}` : (l.itemName || l.itemCode),
        })),
      };

      if (editingItem) {
        await apiService.patch(`/procurement/receipts/${editingItem.id}`, payload);
        message.success(`Goods Receipt ${values.receiptCode} updated successfully`);
      } else {
        await apiService.post('/procurement/receipts', payload);
        message.success(`Goods Receipt ${values.receiptCode} created successfully`);
      }
      setModalVisible(false);
      setEditingItem(null);
      fetchData(page);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : 'Failed to save goods receipt'));
    } finally {
      setSubmitting(false);
    }
  };

  // Handle PO / PR Selection and auto-populate all header and line item data
  const handleReferenceSelect = async (refKey: string) => {
    if (!refKey) return;
    const [type, id] = refKey.split(':');

    if (type === 'PO') {
      try {
        const po = await apiService.get<any>(`/procurement/orders/${id}`);
        const poData = po?.data || po;
        if (!poData) return;

        // Auto-fill header fields
        const derivedPoDivId =
          poData.divisionId ||
          (poData.warehouseId && warehouses.find((w) => w.id === poData.warehouseId)?.divisionId);

        form.setFieldsValue({
          referenceKey: refKey,
          poId: poData.id,
          supplierId: poData.supplierId,
          divisionId: derivedPoDivId || form.getFieldValue('divisionId'),
          warehouseId: poData.warehouseId || form.getFieldValue('warehouseId'),
          notes: `Goods received against PO #${poData.poCode}`,
        });

        // Auto-populate line items from PO
        const linesSource = poData.items || poData.lines || [];
        const mappedLines: ERPLine[] = linesSource.map((pl: any, idx: number) => {
          const ordQty = Number(pl.quantity || pl.quantityOrdered || 0);
          const pastRec = Number(pl.receivedQuantity || 0);
          const remainingBalance = Math.max(0, ordQty - pastRec);
          const pSize = pl.packagingSize ? Number(pl.packagingSize) : (pl.item?.packagingSize ? Number(pl.item.packagingSize) : undefined);
          const pUnit = pl.packagingUnit || pl.item?.packagingUnit || (pl.item?.packagingType ? pl.item.packagingType.toLowerCase() : undefined);
          const pkgQty = pSize && pSize > 0 ? Math.round((remainingBalance / pSize) * 100) / 100 : undefined;

          return {
            id: `line-${idx + 1}-${Date.now()}`,
            poLineId: pl.id,
            itemId: pl.itemId || pl.item?.id,
            itemCode: pl.itemCode || pl.item?.itemCode,
            itemName: pl.itemName || pl.name || pl.item?.name,
            uomId: pl.uomId || pl.item?.baseUomId,
            uomCode: pl.uomCode || pl.uom?.code || pl.item?.purchaseUom?.code || pl.item?.baseUom?.code || 'PCS',
            orderQuantity: ordQty,
            pastReceived: pastRec,
            orderBalance: remainingBalance,
            quantity: remainingBalance, // Pre-fill with remaining unfulfilled balance
            rate: Number(pl.unitPrice || pl.rate || 0),
            discountPercent: 0,
            taxPercent: 18,
            lineTotal: Number(remainingBalance * (pl.unitPrice || pl.rate || 0)),
            packagingSize: pSize,
            packagingUnit: pUnit,
            packageQuantity: pkgQty,
            salesOrderNumber: poData.poCode,
          };
        });

        setLineItems(mappedLines);
        message.success(`PO #${poData.poCode} loaded with ${mappedLines.length} item(s)`);
      } catch {
        message.error('Failed to load PO details');
      }
    } else if (type === 'PR') {
      try {
        const pr = await apiService.get<any>(`/procurement/requisitions/${id}`);
        const prData = pr?.data || pr;
        if (!prData) return;

        form.setFieldsValue({
          divisionId: prData.divisionId,
          warehouseId: prData.warehouseId,
          notes: `Goods received against PR #${prData.requisitionCode}`,
        });

        const linesSource = prData.lines || [];
        const mappedLines: ERPLine[] = linesSource.map((prl: any, idx: number) => {
          const ordQty = Number(prl.quantity || 0);
          return {
            id: `line-${idx + 1}-${Date.now()}`,
            itemId: prl.itemId,
            itemName: prl.description || prl.itemName,
            uomId: prl.uomId,
            uomCode: prl.uom?.code || 'PCS',
            orderQuantity: ordQty,
            quantity: ordQty,
            rate: Number(prl.unitPrice || 0),
            discountPercent: 0,
            taxPercent: 18,
            lineTotal: Number(prl.estimatedAmount || 0),
            salesOrderNumber: prData.requisitionCode,
          };
        });

        setLineItems(mappedLines);
        message.success(`PR #${prData.requisitionCode} loaded with ${mappedLines.length} item(s)`);
      } catch {
        message.error('Failed to load PR details');
      }
    }
  };


  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/receipts/${id}/${action}`);
      message.success(`Goods receipt marked as ${action}ed successfully`);
      fetchData(page);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : `Failed to ${action} goods receipt`));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/procurement/receipts/${id}`);
      message.success('Goods receipt deleted successfully');
      fetchData(page);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : 'Failed to delete goods receipt'));
    }
  };

  // Action Confirmation Dialog state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    stepExplanation?: string;
    confirmText: string;
    cancelText?: string;
    isDanger?: boolean;
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    message: '',
    stepExplanation: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: () => {},
  });

  const promptReceive = (record: GoodsReceipt) => {
    setConfirmModal({
      open: true,
      title: '📦 Confirm Goods Arrival (Mark Received)',
      message: `Do you want to confirm that shipment for receipt ${record.receiptCode} has physically arrived at the factory/warehouse gate?`,
      stepExplanation: '💡 Why this step: Confirms physical arrival and advances receipt from DRAFT to RECEIVED so the Quality Control (QC) department can begin inspection.',
      confirmText: 'Confirm Physical Arrival',
      cancelText: 'Cancel',
      isDanger: false,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        await handleAction(record.id, 'receive');
      },
    });
  };

  const promptInspect = (record: GoodsReceipt) => {
    setConfirmModal({
      open: true,
      title: '🔍 Begin Quality Inspection',
      message: `Move goods receipt ${record.receiptCode} into active Quality Inspection?`,
      stepExplanation: '💡 Why this step: Places items under formal inspection to verify physical condition, coil weights, thread counts, and material specifications.',
      confirmText: 'Start Inspection',
      cancelText: 'Cancel',
      isDanger: false,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        await handleAction(record.id, 'inspect');
      },
    });
  };

  const promptAccept = (record: GoodsReceipt) => {
    setConfirmModal({
      open: true,
      title: '✅ Accept Quality Inspection (Pass Goods)',
      message: `Confirm that all received items on ${record.receiptCode} have passed inspection and are accepted?`,
      stepExplanation: '💡 Why this step: Clears the shipment for inventory warehousing. After acceptance, the goods can be formally posted into the factory stock ledger.',
      confirmText: 'Accept Goods',
      cancelText: 'Cancel',
      isDanger: false,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        await handleAction(record.id, 'accept');
      },
    });
  };

  const promptReject = (record: GoodsReceipt) => {
    setConfirmModal({
      open: true,
      title: '❌ Reject Shipment',
      message: `Reject goods receipt ${record.receiptCode} due to quality defects or specification discrepancies?`,
      stepExplanation: '💡 Why this step: Blocks items from entering the factory stock and notifies procurement for supplier return/replacement.',
      confirmText: 'Reject Shipment',
      cancelText: 'Cancel',
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        await handleAction(record.id, 'reject');
      },
    });
  };

  const promptPost = (record: GoodsReceipt) => {
    setConfirmModal({
      open: true,
      title: '🏭 Post to Inventory & Stock Ledger',
      message: `Permanently post goods receipt ${record.receiptCode} into warehouse inventory?`,
      stepExplanation: '💡 Why this step: 1) Increases warehouse physical stock, 2) Generates official Stock Ledger IN records, and 3) Marks the linked Purchase Order as fulfilled. This step is irreversible.',
      confirmText: 'Confirm & Post to Inventory',
      cancelText: 'Cancel',
      isDanger: false,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        await handleAction(record.id, 'post');
      },
    });
  };

  const promptDelete = (record: GoodsReceipt) => {
    setConfirmModal({
      open: true,
      title: '🗑️ Delete Goods Receipt Voucher',
      message: `Are you sure you want to permanently delete receipt ${record.receiptCode}?`,
      stepExplanation: '💡 Why this step: Completely removes this unposted record and frees the linked Purchase Order so it can be re-received.',
      confirmText: 'Delete Permanently',
      cancelText: 'Cancel',
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        await handleDelete(record.id);
      },
    });
  };

  const promptCancelReceipt = (record: GoodsReceipt) => {
    setConfirmModal({
      open: true,
      title: '↩️ Reverse Stock & Cancel GRN',
      message: `Are you sure you want to REVERSE stock and CANCEL Goods Receipt ${record.receiptCode}?`,
      stepExplanation: '💡 Why this step: Reverses the posted inventory entries by generating Stock Ledger OUT entries, restores the remaining balance on the linked Purchase Order, and marks the GRN as CANCELLED.',
      confirmText: 'Reverse Stock & Cancel',
      cancelText: 'Keep As Is',
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        try {
          await apiService.patch(`/procurement/receipts/${record.id}/cancel`);
          message.success(`Receipt ${record.receiptCode} reversed and cancelled successfully`);
          fetchData(page);
        } catch (error: any) {
          const msg = error?.response?.data?.message;
          message.error(Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : 'Failed to cancel goods receipt'));
        }
      },
    });
  };

  // Grouped options for PO and PR selector
  const referenceOptions = useMemo(() => {
    const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

    const poGroup = {
      label: <span>🛒 Approved Purchase Orders (PO)</span>,
      options: purchaseOrders.map((po) => {
        const sName = (po.supplierId && supplierMap.get(po.supplierId)) || po.supplier?.name || po.supplierName || 'Vendor';
        return {
          value: `PO:${po.id}`,
          label: `${po.poCode} — ${sName} (${dayjs(po.orderDate || po.createdAt).format('DD/MM/YYYY')})`,
        };
      }),
    };

    const prGroup = {
      label: <span>📋 Purchase Requisitions (PR)</span>,
      options: purchaseRequisitions.map((pr) => ({
        value: `PR:${pr.id}`,
        label: `${pr.requisitionCode} — ${pr.title || pr.department || 'PR'} (${dayjs(pr.requestedDeliveryDate || pr.createdAt).format('DD/MM/YYYY')})`,
      })),
    };

    return [poGroup, prGroup];
  }, [purchaseOrders, purchaseRequisitions, suppliers]);

  const columns: ColumnsType<GoodsReceipt> = [
    {
      title: 'Receipt Code',
      dataIndex: 'receiptCode',
      key: 'receiptCode',
      width: 140,
      render: (code) => <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#38bdf8' }}>{code}</span>,
    },
    {
      title: 'PO / PR',
      key: 'poCode',
      width: 140,
      render: (_, record: any) => {
        const poCode =
          record.po?.poCode ||
          record.poCode ||
          (record.notes && typeof record.notes === 'string'
            ? record.notes.match(/PO #([A-Z0-9-]+)/)?.[1] || record.notes.match(/PR #([A-Z0-9-]+)/)?.[1]
            : undefined);
        return poCode ? (
          <Tag color="geekblue" style={{ fontWeight: 600 }}>
            {poCode}
          </Tag>
        ) : (
          <span style={{ color: '#94a3b8' }}>—</span>
        );
      },
    },
    {
      title: 'Supplier',
      key: 'supplierName',
      width: 210,
      render: (_, record: any) => {
        const sName =
          record.supplier?.name ||
          record.supplierName ||
          (record.supplierId && suppliers.find((s) => s.id === record.supplierId)?.name);
        return <span style={{ fontWeight: 600 }}>{sName || '—'}</span>;
      },
    },
    {
      title: 'Date',
      dataIndex: 'receiptDate',
      key: 'receiptDate',
      width: 110,
      render: (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '—'),
    },
    {
      title: 'GRN Number',
      dataIndex: 'grnNumber',
      key: 'grnNumber',
      width: 120,
      render: (grn) => (grn ? <Tag color="cyan">{grn}</Tag> : '—'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: string) => (
        <Space>
          <Tag color={statusColorMap[status] || 'default'} style={{ fontWeight: 700 }}>
            {status}
          </Tag>
          {status === 'POSTED' && <Tag color="purple">📦 Stock Posted</Tag>}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 280,
      render: (_, record: any) => (
        <div className="gr-actions-group">
          {/* 1. View Details Modal */}
          <Tooltip title="View Receipt Details">
            <button
              type="button"
              className="btn-gr-action-icon view"
              onClick={() => handleOpenViewModal(record)}
            >
              <EyeOutlined />
            </button>
          </Tooltip>

          {/* 2. Print Official GRN Document */}
          <Tooltip title="Print GRN Slip">
            <button
              type="button"
              className="btn-gr-action-icon print"
              onClick={() => handlePrintReceipt(record)}
            >
              <PrinterOutlined />
            </button>
          </Tooltip>

          {/* 3. Print Inward Gate Pass */}
          <Tooltip title="Print Inward Gate Pass">
            <button
              type="button"
              className="btn-gr-action-icon gatepass"
              onClick={() => handlePrintGatePass(record)}
            >
              <SafetyCertificateOutlined />
            </button>
          </Tooltip>

          {/* 4. Edit Receipt */}
          {record.status !== 'CANCELLED' && (
            <Tooltip title={record.status === 'POSTED' ? 'Edit Metadata / Notes' : 'Edit Receipt'}>
              <button
                type="button"
                className="btn-gr-action-icon edit"
                onClick={() => handleOpenEditModal(record)}
              >
                <EditOutlined />
              </button>
            </Tooltip>
          )}

          {/* 5. Workflow Stage Actions */}
          {record.status === 'DRAFT' && (
            <Button
              size="small"
              type="primary"
              style={{ background: '#0284c7', borderColor: '#0284c7', height: 30, fontSize: 12, padding: '0 8px' }}
              icon={<CheckCircleOutlined />}
              onClick={() => promptReceive(record)}
            >
              Receive
            </Button>
          )}
          {record.status === 'RECEIVED' && (
            <Button
              size="small"
              type="primary"
              style={{ height: 30, fontSize: 12, padding: '0 8px' }}
              onClick={() => promptInspect(record)}
            >
              Inspect
            </Button>
          )}
          {record.status === 'INSPECTION' && (
            <>
              <Button
                size="small"
                type="primary"
                style={{ height: 30, fontSize: 12, padding: '0 8px' }}
                icon={<CheckOutlined />}
                onClick={() => promptAccept(record)}
              >
                Accept
              </Button>
              <Button
                size="small"
                danger
                style={{ height: 30, fontSize: 12, padding: '0 8px' }}
                onClick={() => promptReject(record)}
              >
                Reject
              </Button>
            </>
          )}
          {record.status === 'ACCEPTED' && (
            <Button
              size="small"
              type="primary"
              style={{ background: '#7c3aed', borderColor: '#7c3aed', height: 30, fontSize: 12, padding: '0 8px' }}
              onClick={() => promptPost(record)}
            >
              Post Stock
            </Button>
          )}

          {/* 6. Reverse / Cancel for POSTED */}
          {record.status === 'POSTED' && (
            <Tooltip title="Reverse Stock & Cancel GRN">
              <button
                type="button"
                className="btn-gr-action-icon reverse"
                onClick={() => promptCancelReceipt(record)}
              >
                <RollbackOutlined />
              </button>
            </Tooltip>
          )}

          {/* 7. Delete (allowed for DRAFT, REJECTED, CANCELLED) */}
          {(record.status === 'DRAFT' || record.status === 'REJECTED' || record.status === 'CANCELLED') && (
            <Tooltip title="Delete Permanently">
              <button
                type="button"
                className="btn-gr-action-icon delete"
                onClick={() => promptDelete(record)}
              >
                <DeleteOutlined />
              </button>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <InboxOutlined style={{ fontSize: 20, color: '#38bdf8' }} />
          <span>Goods Receipts (Inbound GRN)</span>
        </div>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(page)}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ fontWeight: 600 }}>
            Create Goods Receipt
          </Button>
        </Space>
      }
    >
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input
            placeholder="Search receipts, POs, GRN..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => fetchData(1)}
            allowClear
          />
        </Col>
        <Col span={6}>
          <Select
            placeholder="Filter by status"
            allowClear
            style={{ width: '100%' }}
            value={filterStatus}
            onChange={setFilterStatus}
          >
            {STATUS_OPTIONS.map((s) => (
              <Select.Option key={s} value={s}>{s}</Select.Option>
            ))}
          </Select>
        </Col>
        <Col span={4}>
          <Button type="primary" onClick={() => fetchData(1)}>Search</Button>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, total, pageSize, onChange: setPage, showSizeChanger: false }}
      />

      {/* Upgraded Desktop Draggable & Resizable Modal */}
      <DraggableResizableModal
        title={editingItem ? `Edit Goods Receipt: ${editingItem.receiptCode}` : "Create Goods Receipt (CGR)"}
        subtitle={editingItem ? "✏️ Update goods receipt details, header references, or line items" : "🏬 Inbound stock reception with PO/PR verification, store stock balance & live order calculation"}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingItem(null);
        }}
        width={1120}
        height={760}
        footer={[
          <Button key="cancel" onClick={() => {
            setModalVisible(false);
            setEditingItem(null);
          }}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={submitting}
            onClick={handleSubmit}
            style={{ fontWeight: 600 }}
          >
            {editingItem ? 'Update Goods Receipt' : 'Create & Save Goods Receipt'}
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>
          <Form.Item name="poId" hidden><Input /></Form.Item>

          {/* Top Form Controls: Reference PO/PR, Code, Supplier, Origin */}
          <Card size="small" style={{ marginBottom: 14, background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item
                  name="receiptCode"
                  label={
                    <span style={{ fontWeight: 600 }}>
                      Receipt Code <Tag color="blue" style={{ marginLeft: 4 }}>Auto CGR</Tag>
                    </span>
                  }
                  rules={[{ required: true, message: 'Receipt code is required' }]}
                >
                  <Input placeholder="e.g. CGR-2026-0001" style={{ fontWeight: 700, fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>

              <Col span={8}>
                <Form.Item
                  name="referenceKey"
                  label={
                    <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                      📋 Link PO / PR Reference
                      <Tooltip title="Select an existing Purchase Order or Purchase Requisition to automatically load ordered items, supplier, division, and track remaining balance.">
                        <InfoCircleOutlined style={{ marginLeft: 6 }} />
                      </Tooltip>
                    </span>
                  }
                >
                  <Select
                    showSearch
                    allowClear
                    placeholder="Search approved PO or PR..."
                    options={referenceOptions}
                    onDropdownVisibleChange={(open) => {
                      if (open) loadReferences();
                    }}
                    filterOption={(input, option) =>
                      String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                    }
                    onChange={handleReferenceSelect}
                  />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item
                  name="supplierId"
                  label={<span style={{ fontWeight: 600 }}>Supplier</span>}
                  rules={[{ required: true, message: 'Supplier is required' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select supplier..."
                    options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                  />
                </Form.Item>
              </Col>

              <Col span={4}>
                <Form.Item
                  name="purchaseType"
                  label={<span style={{ fontWeight: 600 }}><GlobalOutlined style={{ marginRight: 4 }} />Origin</span>}
                  initialValue="LOCAL"
                >
                  <Segmented
                    block
                    options={[
                      { label: 'Local', value: 'LOCAL' },
                      { label: 'Import', value: 'IMPORT' },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* Row 2: Division, Target Warehouse, GRN Number, Receipt Date */}
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item
                  name="divisionId"
                  label={
                    <span style={{ fontWeight: 600 }}>
                      <ApartmentOutlined style={{ marginRight: 4, color: '#10b981' }} />
                      Division
                    </span>
                  }
                  rules={[{ required: true, message: 'Please select division' }]}
                >
                  <Select
                    placeholder="Select division..."
                    options={divisions.map((d) => ({
                      value: d.id,
                      label: `${d.code ? `[${d.code}] ` : ''}${d.name}`,
                    }))}
                  />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item
                  name="warehouseId"
                  label={
                    <span style={{ fontWeight: 600 }}>
                      <ShopOutlined style={{ marginRight: 4, color: '#f59e0b' }} />
                      Target Warehouse / Store
                    </span>
                  }
                  rules={[{ required: true, message: 'Please select warehouse' }]}
                >
                  <Select
                    placeholder="Select warehouse..."
                    options={warehouses.map((w) => ({
                      value: w.id,
                      label: `${w.warehouseCode} — ${w.name}`,
                    }))}
                  />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item name="grnNumber" label={<span style={{ fontWeight: 600 }}>GRN Number</span>}>
                  <Input placeholder="e.g. GRN-001" />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item name="receiptDate" label={<span style={{ fontWeight: 600 }}>Receipt Date</span>}>
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Receipt Line Items Table with Live Inbound Calculation */}
          <ERPLineItems
            companyId={companyId}
            value={lineItems}
            onChange={setLineItems}
            context="purchase"
            isPurchasable={true}
            showWarehouse={false}
            divisionId={watchedDivisionId}
            warehouseId={watchedWarehouseId}
            warehouseType={selectedWarehouse?.warehouseType}
            label="Receipt Items"
            showAvailability={true}
          />

          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={24}>
              <Form.Item name="notes" label={<span style={{ fontWeight: 600 }}>Inspection & Receiving Notes</span>}>
                <Input.TextArea rows={2} placeholder="Add inspection observations, vehicle plate number, gate pass ref, or remarks..." />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </DraggableResizableModal>

      {/* View Goods Receipt Details Modal */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <EyeOutlined style={{ color: '#38bdf8', fontSize: 18 }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>Goods Receipt Details: {viewingItem?.receiptCode}</span>
            {viewingItem?.status && (
              <Tag color={statusColorMap[viewingItem.status] || 'default'} style={{ fontWeight: 700, marginLeft: 8 }}>
                {viewingItem.status}
              </Tag>
            )}
          </div>
        }
        open={viewModalVisible}
        onCancel={() => {
          setViewModalVisible(false);
          setViewingItem(null);
        }}
        width={920}
        height={650}
        footer={[
          <Button key="close" onClick={() => {
            setViewModalVisible(false);
            setViewingItem(null);
          }}>
            Close
          </Button>,
          <Button
            key="gatepass"
            icon={<SafetyCertificateOutlined />}
            onClick={() => viewingItem && handlePrintGatePass(viewingItem)}
          >
            Print Gate Pass
          </Button>,
          <Button
            key="print"
            type="primary"
            icon={<PrinterOutlined />}
            style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
            onClick={() => viewingItem && handlePrintReceipt(viewingItem)}
          >
            Print GRN Slip
          </Button>,
        ]}
      >
        {viewLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading receipt details...</div>
        ) : viewingItem ? (
          <div>
            <div className="gr-view-meta-grid">
              <div className="gr-view-meta-card">
                <div className="gr-view-meta-label">Receipt Code</div>
                <div className="gr-view-meta-val" style={{ color: '#38bdf8', fontFamily: 'monospace' }}>
                  {viewingItem.receiptCode}
                </div>
              </div>
              <div className="gr-view-meta-card">
                <div className="gr-view-meta-label">PO / PR Reference</div>
                <div className="gr-view-meta-val">
                  {viewingItem.po?.poCode || viewingItem.poCode || viewingItem.notes?.match(/PO #([A-Z0-9-]+)/)?.[1] || '—'}
                </div>
              </div>
              <div className="gr-view-meta-card">
                <div className="gr-view-meta-label">GRN Number</div>
                <div className="gr-view-meta-val">{viewingItem.grnNumber || '—'}</div>
              </div>
              <div className="gr-view-meta-card">
                <div className="gr-view-meta-label">Receipt Date</div>
                <div className="gr-view-meta-val">
                  {viewingItem.receiptDate ? dayjs(viewingItem.receiptDate).format('DD/MM/YYYY') : '—'}
                </div>
              </div>
              <div className="gr-view-meta-card">
                <div className="gr-view-meta-label">Supplier</div>
                <div className="gr-view-meta-val">
                  {viewingItem.supplier?.name || viewingItem.supplierName || '—'}
                </div>
              </div>
              <div className="gr-view-meta-card">
                <div className="gr-view-meta-label">Receiving Warehouse</div>
                <div className="gr-view-meta-val">
                  {viewingItem.warehouse?.name || viewingItem.warehouseName || '—'}
                </div>
              </div>
              <div className="gr-view-meta-card">
                <div className="gr-view-meta-label">Division</div>
                <div className="gr-view-meta-val">
                  {viewingItem.division?.name || viewingItem.divisionName || '—'}
                </div>
              </div>
              <div className="gr-view-meta-card">
                <div className="gr-view-meta-label">Purchase Type</div>
                <div className="gr-view-meta-val">{viewingItem.purchaseType || 'LOCAL'}</div>
              </div>
            </div>

            {viewingItem.notes && (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '8px 12px', marginBottom: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Notes: </span>
                <span style={{ fontSize: 13, color: '#e2e8f0' }}>{viewingItem.notes}</span>
              </div>
            )}

            <div style={{ fontWeight: 700, fontSize: 14, color: '#f8fafc', marginBottom: 8 }}>
              Received Line Items ({(viewingItem.lines || viewingItem.items || []).length})
            </div>
            <table className="gr-view-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Item Code / Name</th>
                  <th style={{ textAlign: 'right', width: 90 }}>Ordered</th>
                  <th style={{ textAlign: 'right', width: 90 }}>Received</th>
                  <th style={{ textAlign: 'right', width: 90 }}>Accepted</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Rejected</th>
                  <th style={{ textAlign: 'right', width: 110 }}>Unit Price</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(viewingItem.lines || viewingItem.items || []).map((line: any, idx: number) => {
                  const qtyRec = Number(line.quantityReceived || line.quantity || 0);
                  const rate = Number(line.unitPrice || line.rate || 0);
                  const totalAmt = Number(line.lineTotal || (qtyRec * rate));
                  return (
                    <tr key={line.id || idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                          {line.itemName || line.item?.name || line.conditionNotes || 'Item'}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          {line.itemCode || line.item?.itemCode || '—'} {line.uomCode || line.uom?.code ? `(${line.uomCode || line.uom?.code})` : ''}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{Number(line.quantityOrdered || 0).toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>{qtyRec.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: '#10b981' }}>{Number(line.quantityAccepted || qtyRec).toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: Number(line.quantityRejected || 0) > 0 ? '#ef4444' : '#94a3b8' }}>
                        {Number(line.quantityRejected || 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>PKR {rate.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>PKR {totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </DraggableResizableModal>

      {/* Action Explanation & Confirmation Dialog */}
      <Modal
        open={confirmModal.open}
        closable={false}
        footer={null}
        centered
        width={460}
        zIndex={2500}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {confirmModal.isDanger ? (
            <ExclamationCircleOutlined style={{ color: '#ef4444', fontSize: 24 }} />
          ) : (
            <InfoCircleOutlined style={{ color: '#0284c7', fontSize: 24 }} />
          )}
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{confirmModal.title}</span>
        </div>
        <div style={{ fontSize: 14, color: '#334155', marginBottom: 12, lineHeight: 1.5 }}>
          {confirmModal.message}
        </div>
        {confirmModal.stepExplanation && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: '10px 12px',
              fontSize: 12,
              color: '#475569',
              marginBottom: 16,
              lineHeight: 1.4,
            }}
          >
            {confirmModal.stepExplanation}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button onClick={() => setConfirmModal((prev) => ({ ...prev, open: false }))}>
            {confirmModal.cancelText || 'Cancel'}
          </Button>
          <Button
            type="primary"
            danger={confirmModal.isDanger}
            style={!confirmModal.isDanger ? { background: '#0284c7', borderColor: '#0284c7' } : undefined}
            onClick={confirmModal.onConfirm}
          >
            {confirmModal.confirmText || 'Confirm'}
          </Button>
        </div>
      </Modal>
    </Card>
  );
};

export default GoodsReceiptManagement;
