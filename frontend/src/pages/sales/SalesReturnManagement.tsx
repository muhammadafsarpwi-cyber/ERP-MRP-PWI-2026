import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Form, Input, Select, App, InputNumber, Row, Col,
  Descriptions, Divider, Tooltip, Tag, Modal, Card, Popconfirm,
  Alert,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EyeOutlined, CheckOutlined,
  StopOutlined, ReloadOutlined, FileExcelOutlined, PrinterOutlined,
  FilterOutlined, CloseCircleOutlined, UserOutlined, CalendarOutlined,
  RollbackOutlined, DollarOutlined, SolutionOutlined, SendOutlined,
  InboxOutlined, ArrowRightOutlined, FileTextOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { DraggableResizableModal } from '../../components/shared';
import { TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import './SalesInvoiceManagement.css';
import { printSalesReturnDocument, printTableList } from '../../utils/printTemplates';

dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

/**
 * Delivered quantity minus what has already been returned.
 * This is the only quantity that may legally be returned for a delivery line.
 */
export const computeMaximumReturnableQuantity = (
  deliveredQuantity?: number,
  previouslyReturnedQuantity?: number,
): number =>
  Math.max(0, (Number(deliveredQuantity) || 0) - (Number(previouslyReturnedQuantity) || 0));

/** Clamp a user-entered return quantity into [0, maximumReturnableQuantity]. */
export const clampReturnQuantity = (
  quantity: number,
  maximumReturnableQuantity?: number,
): number =>
  Math.min(
    Math.max(0, Number(quantity) || 0),
    Math.max(0, Number(maximumReturnableQuantity) || 0),
  );

interface SalesReturnLine {
  id?: string;
  itemId: string;
  itemCode?: string;
  itemName?: string;
  description?: string;
  quantity: number;
  uomId?: string;
  uomCode?: string;
  unitPrice: number;
  discountAmount?: number;
  taxAmount?: number;
  lineTotal: number;
  condition?: string;
  reason?: string;
  deliveredQuantity?: number;
  previouslyReturnedQuantity?: number;
  maximumReturnableQuantity?: number;
  originalInvoiceQuantity?: number;
  remainingReturnableQuantity?: number;
  netSoldQuantity?: number;
  deliveryLineId?: string;
  item?: any;
  uom?: any;
}

interface SalesReturn {
  id: string;
  returnNumber: string;
  salesOrderId?: string;
  salesInvoiceId?: string;
  salesDeliveryId?: string;
  customerId: string;
  companyName?: string;
  warehouseId?: string;
  returnDate: string;
  reason: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: string;
  stockPosted: boolean;
  creditPosted: boolean;
  creditNoteNumber?: string;
  creditNoteDate?: string;
  currency: string;
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  customer?: any;
  salesOrder?: any;
  salesInvoice?: any;
  salesDelivery?: any;
  warehouse?: any;
  lines?: SalesReturnLine[];
  stockLedgerEntries?: any[];
  customerLedgerEntry?: any;
  customerOutstanding?: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  DRAFT: { label: 'Draft', color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' },
  SUBMITTED: { label: 'Submitted', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  APPROVED: { label: 'Approved', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  RECEIVED: { label: 'Received (Stock In)', color: '#d97706', bg: '#fef3c7', border: '#fde68a' },
  CREDITED: { label: 'Credited', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  COMPLETED: { label: 'Completed', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  REJECTED: { label: 'Rejected', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  CANCELLED: { label: 'Cancelled', color: '#475569', bg: '#f8fafc', border: '#e2e8f0' },
};

const SalesReturnManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<SalesReturn[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Chevron Process filter state
  const [activeChevron, setActiveChevron] = useState<string>('ALL');

  // Filter States
  const [filterReason, setFilterReason] = useState<string | undefined>(undefined);
  const [filterCustomer, setFilterCustomer] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterDateFrom, setFilterDateFrom] = useState<string | undefined>(undefined);
  const [filterDateTo, setFilterDateTo] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  // Modals & Drawers
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<SalesReturn | null>(null);
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [selectedReturnForReceive, setSelectedReturnForReceive] = useState<SalesReturn | null>(null);
  const [targetWarehouseId, setTargetWarehouseId] = useState<string | undefined>(undefined);

  // Reject modal
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [selectedReturnForReject, setSelectedReturnForReject] = useState<SalesReturn | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Form State
  const [form] = Form.useForm();
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; customerCode?: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string; code?: string }>>([]);
  const [invoices, setInvoices] = useState<Array<{ id: string; invoiceNo: string; customerId: string; totalAmount: number; balance: number }>>([]);
  const [returnableItems, setReturnableItems] = useState<SalesReturnLine[]>([]);
  const [loadingReturnables, setLoadingReturnables] = useState(false);

  // Load Customers, Warehouses, Invoices
  useEffect(() => {
    (async () => {
      try {
        const combinedMap = new Map<string, { id: string; name: string; customerCode?: string }>();

        // 1. Authoritative Customer Master
        try {
          const cRes = await apiService.get<{ data: any[] }>('/customer/customers', { limit: 200 });
          (cRes.data || []).forEach((cust: any) => {
            combinedMap.set(cust.id, {
              id: cust.id,
              name: cust.companyName || cust.name || cust.legalName || 'Unnamed Customer',
              customerCode: cust.customerCode,
            });
          });
        } catch { /* ignore */ }

        // 2. Sales Customers
        try {
          const sRes = await apiService.get<any[]>('/sales/orders/meta/customers');
          const sList = Array.isArray(sRes) ? sRes : (sRes as any)?.data || [];
          sList.forEach((sc: any) => {
            if (!combinedMap.has(sc.id)) {
              combinedMap.set(sc.id, {
                id: sc.id,
                name: sc.companyName || sc.name || 'Sales Customer',
                customerCode: sc.customerCode,
              });
            }
          });
        } catch { /* ignore */ }

        setCustomers(Array.from(combinedMap.values()));

        const [wRes, iRes] = await Promise.all([
          apiService.get<{ data: any[] }>('/inventory/warehouses', { limit: 100 }).catch(() => ({ data: [] })),
          apiService.get<{ data: any[] }>('/sales/invoices', { limit: 200 }).catch(() => ({ data: [] })),
        ]);

        setWarehouses((wRes.data || []).map((wh: any) => ({
          id: wh.id,
          name: wh.name,
          code: wh.code,
        })));

        setInvoices((iRes.data || []).map((inv: any) => ({
          id: inv.id,
          invoiceNo: inv.invoiceNo,
          customerId: inv.customerId,
          totalAmount: inv.totalAmount,
          balance: inv.balance,
        })));
      } catch {
        /* Non-fatal lookup */
      }
    })();
  }, []);

  const getCustomerDisplayName = useCallback((record: any): string => {
    if (!record) return '-';
    const c = record.customer;
    if (c) {
      const code = c.customerCode ? `[${c.customerCode}] ` : '';
      const name = c.companyName || c.name || c.legalName;
      if (name) return `${code}${name}`;
    }
    if (record.companyName) return record.companyName;
    if (record.customerName) return record.customerName;
    const targetId = record.customerId || (typeof record.customer === 'string' ? record.customer : record.customer?.id);
    if (targetId) {
      const found = customers.find(item => item.id === targetId);
      if (found) {
        const code = found.customerCode ? `[${found.customerCode}] ` : '';
        const name = found.name;
        if (name) return `${code}${name}`;
      }
    }
    return record.customerId || 'Customer';
  }, [customers]);

  const fetchData = useCallback(async (pageNum: number = 1, currentLimit: number = pageSize) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: currentLimit };
      if (search) params.search = search;
      if (filterCustomer) params.customerId = filterCustomer;
      if (filterStatus && filterStatus !== 'All statuses') params.status = filterStatus;
      const response = await apiService.get<{ data: SalesReturn[]; total: number }>('/sales/returns', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch sales returns');
    } finally {
      setLoading(false);
    }
  }, [search, filterCustomer, filterStatus, pageSize, message]);

  useEffect(() => {
    fetchData(page, pageSize);
  }, [page, pageSize, fetchData]);

  // Global header tab refresh
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).includes('return')) {
        void fetchData(page, pageSize);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
  }, [fetchData, page, pageSize]);

  // Chevron status counts
  const chevronCounts = useMemo(() => {
    return {
      all: total || data.length,
      draft: data.filter(d => (d.status || '').toUpperCase() === 'DRAFT').length,
      submitted: data.filter(d => (d.status || '').toUpperCase() === 'SUBMITTED').length,
      approved: data.filter(d => (d.status || '').toUpperCase() === 'APPROVED').length,
      received: data.filter(d => (d.status || '').toUpperCase() === 'RECEIVED').length,
      credited: data.filter(d => (d.status || '').toUpperCase() === 'CREDITED').length,
      completed: data.filter(d => (d.status || '').toUpperCase() === 'COMPLETED').length,
      rejected: data.filter(d => (d.status || '').toUpperCase() === 'REJECTED').length,
      cancelled: data.filter(d => (d.status || '').toUpperCase() === 'CANCELLED').length,
    };
  }, [data, total]);

  // Available reasons
  const availableReasons = useMemo(() => {
    const set = new Set<string>();
    data.forEach(d => { if (d.reason) set.add(d.reason); });
    return Array.from(set);
  }, [data]);

  // Client-side filtering
  const displayedReturns = useMemo(() => {
    return data.filter(d => {
      const status = (d.status || '').toUpperCase();
      // Chevron filter
      if (activeChevron !== 'ALL' && status !== activeChevron) return false;

      // Reason filter
      if (filterReason && d.reason?.toLowerCase() !== filterReason.toLowerCase()) return false;

      // Customer filter
      if (filterCustomer && d.customerId !== filterCustomer) return false;

      // Status filter
      if (filterStatus && filterStatus !== 'All statuses' && status !== filterStatus.toUpperCase()) return false;

      // Date Range filter
      if (filterDateFrom && d.returnDate && dayjs(d.returnDate).isBefore(dayjs(filterDateFrom), 'day')) return false;
      if (filterDateTo && d.returnDate && dayjs(d.returnDate).isAfter(dayjs(filterDateTo), 'day')) return false;

      return true;
    });
  }, [data, activeChevron, filterReason, filterCustomer, filterStatus, filterDateFrom, filterDateTo]);

  // Clear all filters handler
  const handleClearAll = () => {
    setActiveChevron('ALL');
    setFilterReason(undefined);
    setFilterCustomer(undefined);
    setFilterStatus(undefined);
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setSearch('');
    setPage(1);
    void fetchData(1, pageSize);
    message.info('All filters reset');
  };

  // CSV Export
  const handleExportCsv = useCallback(() => {
    if (displayedReturns.length === 0) {
      message.warning('No return records to export');
      return;
    }
    const headers = ['Return #', 'Customer', 'Invoice #', 'Credit Note #', 'Return Date', 'Reason', 'Subtotal', 'Tax', 'Total Amount', 'Status', 'Stock Status', 'Ledger Status'];
    const rows = displayedReturns.map(r => {
      const cust = customers.find(c => c.id === r.customerId);
      const custName = cust?.name || r.customer?.companyName || r.companyName || r.customerId;
      const invNo = r.salesInvoice?.invoiceNo || '-';
      const cnNo = r.creditNoteNumber || '-';
      const stockStatus = r.stockPosted ? 'Restocked' : 'Pending';
      const ledgerStatus = r.creditPosted ? 'Credited' : 'Pending';
      return [
        `"${r.returnNumber}"`,
        `"${custName}"`,
        `"${invNo}"`,
        `"${cnNo}"`,
        `"${r.returnDate || ''}"`,
        `"${r.reason || ''}"`,
        r.subtotal || 0,
        r.taxAmount || 0,
        r.totalAmount || 0,
        `"${r.status}"`,
        `"${stockStatus}"`,
        `"${ledgerStatus}"`,
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sales_returns_${dayjs().format('YYYYMMDD_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Sales returns exported to CSV');
  }, [displayedReturns, customers, message]);

  const handlePrint = useCallback(() => {
    const headers = ['Return #', 'Customer', 'Return Date', 'Reason', 'Subtotal', 'Tax', 'Refund Total', 'Status'];
    const rows = displayedReturns.map(r => [
      r.returnNumber,
      getCustomerDisplayName(r),
      r.returnDate ? dayjs(r.returnDate).format('YYYY-MM-DD') : '-',
      r.reason || '-',
      `Rs ${formatDecimal(r.subtotal || 0)}`,
      `Rs ${formatDecimal(r.taxAmount || 0)}`,
      `Rs ${formatDecimal(r.totalAmount || 0)}`,
      (r.status || 'DRAFT').toUpperCase(),
    ]);
    printTableList('Sales Returns Report', headers, rows);
  }, [displayedReturns, getCustomerDisplayName]);

  const handleCreate = useCallback(() => {
    form.resetFields();
    form.setFieldsValue({
      returnDate: dayjs().format('YYYY-MM-DD'),
      currency: 'PKR',
    });
    setReturnableItems([]);
    setModalVisible(true);
  }, [form]);

  // Register action buttons into Main Header
  useEffect(() => {
    const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
    setHeaderActions([
      {
        key: 'new-return',
        node: (
          <Button
            className="btn-new-invoice"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            + New Sales Return
          </Button>
        ),
      },
      {
        key: 'refresh',
        node: (
          <Button
            className="btn-inv-white"
            icon={<ReloadOutlined />}
            onClick={() => fetchData(page, pageSize)}
          >
            Refresh
          </Button>
        ),
      },
      {
        key: 'csv',
        node: (
          <Button
            className="btn-inv-white"
            icon={<FileExcelOutlined />}
            onClick={handleExportCsv}
          >
            CSV
          </Button>
        ),
      },
      {
        key: 'print',
        node: (
          <Button
            className="btn-inv-white"
            icon={<PrinterOutlined />}
            onClick={handlePrint}
          >
            Print
          </Button>
        ),
      },
    ]);

    return () => {
      clearHeaderActions();
    };
  }, [page, pageSize, handleCreate, handleExportCsv, handlePrint, fetchData]);

  // When Customer changes in Form, filter Invoices
  const selectedCustomerId = Form.useWatch('customerId', form);
  const customerInvoices = useMemo(() => {
    if (!selectedCustomerId) return invoices;
    return invoices.filter(inv => inv.customerId === selectedCustomerId);
  }, [invoices, selectedCustomerId]);

  // When Invoice is selected, load returnable items
  const handleInvoiceChange = async (invoiceId: string) => {
    if (!invoiceId) {
      setReturnableItems([]);
      return;
    }
    setLoadingReturnables(true);
    try {
      const res = await apiService.get<any>(`/sales/returns/invoice/${invoiceId}/returnable-items`);
      const items: any[] = res.data?.items || res.items || [];
      setReturnableItems(items.map((it: any) => ({
        itemId: it.itemId,
        itemCode: it.itemCode,
        itemName: it.itemName,
        uomId: it.uomId,
        uomCode: it.uomCode,
        deliveredQuantity: it.deliveredQuantity,
        previouslyReturnedQuantity: it.previouslyReturnedQuantity,
        maximumReturnableQuantity: it.maximumReturnableQuantity,
        quantity: 0,
        unitPrice: it.unitPrice,
        taxAmount: 0,
        discountAmount: 0,
        lineTotal: 0,
        condition: 'GOOD',
        deliveryLineId: it.deliveryLineId,
      })));
    } catch {
      message.error('Failed to load returnable items for this invoice');
      setReturnableItems([]);
    } finally {
      setLoadingReturnables(false);
    }
  };

  const handleReturnItemQtyChange = (index: number, qty: number) => {
    setReturnableItems(prev => {
      const next = [...prev];
      const item = next[index];
      const safeQty = clampReturnQuantity(qty, item.maximumReturnableQuantity);
      const lineSub = safeQty * item.unitPrice - (item.discountAmount || 0);
      const lineTotal = lineSub + (item.taxAmount || 0);
      next[index] = {
        ...item,
        quantity: safeQty,
        lineTotal: Math.round(lineTotal * 100) / 100,
      };
      return next;
    });
  };

  const handleReturnItemConditionChange = (index: number, condition: string) => {
    setReturnableItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], condition };
      return next;
    });
  };

  const formSubtotal = useMemo(() => {
    return returnableItems.reduce((acc, curr) => acc + (curr.quantity * curr.unitPrice - (curr.discountAmount || 0)), 0);
  }, [returnableItems]);

  const formTotalAmount = useMemo(() => {
    return returnableItems.reduce((acc, curr) => acc + (curr.lineTotal || 0), 0);
  }, [returnableItems]);

  const handleViewDetail = async (record: SalesReturn) => {
    try {
      const response = await apiService.get<any>(`/sales/returns/${record.id}`);
      setDetailItem(response.data || response);
      setDetailVisible(true);
    } catch {
      setDetailItem(record);
      setDetailVisible(true);
    }
  };

  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      const activeLines = returnableItems.filter(l => l.quantity > 0);
      if (activeLines.length === 0) {
        message.warning('Please enter return quantity greater than 0 for at least one item');
        return;
      }

      // Check return quantity limits: never more than (delivered - previously returned)
      for (const line of activeLines) {
        const backendMax = Number(line.maximumReturnableQuantity) || 0;
        const hasDeliveryData = line.deliveredQuantity !== undefined && line.deliveredQuantity !== null;
        const derivedMax = computeMaximumReturnableQuantity(line.deliveredQuantity, line.previouslyReturnedQuantity);
        // Stricter of the two known ceilings; server-side validation remains authoritative.
        let effectiveMax = backendMax > 0 ? backendMax : derivedMax;
        if (hasDeliveryData && derivedMax > 0) effectiveMax = Math.min(effectiveMax, derivedMax);
        if (line.quantity > effectiveMax) {
          message.error(`Quantity for ${line.itemName} cannot exceed maximum returnable ${effectiveMax}`);
          return;
        }
      }

      const payload = {
        customerId: values.customerId,
        salesInvoiceId: values.salesInvoiceId,
        warehouseId: values.warehouseId,
        returnDate: values.returnDate ? dayjs(values.returnDate).format('YYYY-MM-DD') : undefined,
        reason: values.reason,
        notes: values.notes,
        currency: values.currency || 'PKR',
        lines: activeLines.map(l => ({
          itemId: l.itemId,
          quantity: l.quantity,
          uomId: l.uomId,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount || 0,
          taxAmount: l.taxAmount || 0,
          lineTotal: l.lineTotal,
          condition: l.condition || 'GOOD',
          salesDeliveryLineId: l.deliveryLineId,
          reason: values.reason,
        })),
      };

      await apiService.post('/sales/returns', payload);
      message.success('Sales Return created successfully in DRAFT status');
      setModalVisible(false);
      fetchData(page, pageSize);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to create sales return');
    }
  };

  // Status transitions
  // Backend (class-validator) may return `message` as a string or a string[]
  const transitionError = (e: any, fallback: string) => {
    const msg = e?.response?.data?.message ?? e?.message;
    if (Array.isArray(msg)) return String(msg[0] ?? fallback);
    if (typeof msg === 'string' && msg.trim()) return msg;
    return fallback;
  };

  const handleSubmitAction = async (id: string) => {
    try {
      await apiService.patch(`/sales/returns/${id}/submit`);
      message.success('Sales return submitted for approval');
      fetchData(page, pageSize);
      if (detailItem?.id === id) handleViewDetail({ id } as any);
    } catch (e: any) {
      message.error(transitionError(e, 'Failed to submit sales return'));
    }
  };

  const handleApproveAction = async (id: string) => {
    try {
      await apiService.patch(`/sales/returns/${id}/approve`);
      message.success('Sales return approved successfully');
      fetchData(page, pageSize);
      if (detailItem?.id === id) handleViewDetail({ id } as any);
    } catch (e: any) {
      message.error(transitionError(e, 'Failed to approve sales return'));
    }
  };

  const openReceiveModal = (record: SalesReturn) => {
    setSelectedReturnForReceive(record);
    setTargetWarehouseId(record.warehouseId || warehouses[0]?.id);
    setReceiveModalVisible(true);
  };

  const handleConfirmReceiveStock = async () => {
    if (!selectedReturnForReceive) return;
    try {
      await apiService.patch(`/sales/returns/${selectedReturnForReceive.id}/receive`, {
        warehouseId: targetWarehouseId,
      });
      message.success('Finished Goods restocked into inventory (Stock Ledger IN posted)');
      setReceiveModalVisible(false);
      fetchData(page, pageSize);
      if (detailItem?.id === selectedReturnForReceive.id) handleViewDetail({ id: selectedReturnForReceive.id } as any);
    } catch (e: any) {
      message.error(transitionError(e, 'Failed to receive returned stock'));
    }
  };

  const handleGenerateCreditNoteAction = async (id: string) => {
    try {
      const res = await apiService.patch<any>(`/sales/returns/${id}/credit-note`);
      message.success(`Credit Note ${res.data?.creditNoteNumber || ''} generated & Customer Ledger CREDITED`);
      fetchData(page, pageSize);
      if (detailItem?.id === id) handleViewDetail({ id } as any);
    } catch (e: any) {
      message.error(transitionError(e, 'Failed to generate credit note'));
    }
  };

  const openRejectModal = (record: SalesReturn) => {
    setSelectedReturnForReject(record);
    setRejectReason('');
    setRejectModalVisible(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedReturnForReject) return;
    if (!rejectReason.trim()) {
      message.warning('Please enter a rejection reason');
      return;
    }
    try {
      await apiService.patch(`/sales/returns/${selectedReturnForReject.id}/reject`, { reason: rejectReason });
      message.success('Sales return rejected');
      setRejectModalVisible(false);
      fetchData(page, pageSize);
      if (detailItem?.id === selectedReturnForReject.id) handleViewDetail({ id: selectedReturnForReject.id } as any);
    } catch (e: any) {
      message.error(transitionError(e, 'Failed to reject return'));
    }
  };

  const handleCancelAction = async (id: string) => {
    try {
      await apiService.patch(`/sales/returns/${id}/cancel`);
      message.success('Sales return cancelled');
      fetchData(page, pageSize);
      if (detailItem?.id === id) handleViewDetail({ id } as any);
    } catch (e: any) {
      message.error(transitionError(e, 'Failed to cancel return'));
    }
  };

  // Multi-line Pixel-Perfect Table Columns
  const columns: ColumnsType<SalesReturn> = [
    {
      title: 'Return # & Customer',
      key: 'returnCustomer',
      width: 260,
      render: (_, record) => {
        const custName = getCustomerDisplayName(record);
        return (
          <div className="inv-doc-cell">
            <div className="inv-doc-code" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RollbackOutlined style={{ color: '#2563eb' }} />
              {record.returnNumber}
            </div>
            <div className="inv-sub-row">
              <span className="badge-inv-customer">
                <UserOutlined style={{ marginRight: 3 }} /> Customer
              </span>
              <span className="inv-sub-val" style={{ color: '#2563eb', fontWeight: 600 }}>
                {custName}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Dates & Reason',
      key: 'datesReason',
      width: 190,
      render: (_, record) => (
        <div className="inv-dates-cell">
          <div className="inv-date-row">
            <span className="badge-inv-date">
              <CalendarOutlined style={{ marginRight: 3 }} /> Date
            </span>
            <span className="inv-date-val">
              {record.returnDate ? dayjs(record.returnDate).format('MMM DD, YYYY') : '-'}
            </span>
          </div>
          {record.reason && (
            <div className="inv-date-row">
              <span className="badge-inv-terms">
                <SolutionOutlined style={{ marginRight: 3 }} /> Reason
              </span>
              <span className="inv-date-val" style={{ fontWeight: 600, color: '#dc2626' }}>
                {record.reason}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Linked Docs',
      key: 'linkedDocs',
      width: 180,
      render: (_, record) => {
        const invNo = record.salesInvoice?.invoiceNo;
        const ordNo = record.salesOrder?.orderNumber;
        const delNo = record.salesDelivery?.deliveryNumber;
        return (
          <div className="inv-dates-cell">
            {invNo && (
              <div className="inv-date-row">
                <span className="badge-inv-subtotal">Invoice</span>
                <span className="inv-date-val" style={{ fontWeight: 600 }}>{invNo}</span>
              </div>
            )}
            {delNo && (
              <div className="inv-date-row">
                <span className="badge-inv-subtotal">Delivery</span>
                <span className="inv-date-val">{delNo}</span>
              </div>
            )}
            {ordNo && (
              <div className="inv-date-row">
                <span className="badge-inv-subtotal">Order</span>
                <span className="inv-date-val">{ordNo}</span>
              </div>
            )}
            {!invNo && !ordNo && !delNo && <span style={{ color: '#94a3b8' }}>Direct Return</span>}
          </div>
        );
      },
    },
    {
      title: 'Amounts',
      key: 'amounts',
      width: 180,
      render: (_, record) => (
        <div className="inv-amounts-cell">
          <div className="inv-amt-row">
            <span className="badge-inv-subtotal">Subtotal</span>
            <span className="inv-amt-val">Rs {formatDecimal(record.subtotal || 0)}</span>
          </div>
          <div className="inv-amt-row">
            <span className="badge-inv-tax">% Tax</span>
            <span className="inv-amt-val">Rs {formatDecimal(record.taxAmount || 0)}</span>
          </div>
          <div className="inv-amt-row amt-total-row">
            <span className="badge-inv-total">Refund</span>
            <span className="inv-amt-val inv-amt-bold" style={{ color: '#dc2626' }}>
              Rs {formatDecimal(record.totalAmount || 0)}
            </span>
          </div>
        </div>
      ),
    },
    {
      title: 'Credit Note',
      key: 'creditNote',
      width: 160,
      render: (_, record) => (
        <div>
          {record.creditNoteNumber ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Tag color="purple" style={{ fontWeight: 600, fontSize: '11px', margin: 0 }}>
                <FileTextOutlined style={{ marginRight: 4 }} />
                {record.creditNoteNumber}
              </Tag>
              {record.creditNoteDate && (
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  {dayjs(record.creditNoteDate).format('MMM DD, YYYY')}
                </span>
              )}
            </div>
          ) : (
            <Tag color="default" style={{ fontSize: '11px' }}>Pending CN</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Stock & Ledger',
      key: 'stockLedger',
      width: 160,
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {record.stockPosted ? (
            <Tag color="success" style={{ fontSize: '11px', margin: 0 }}>
              <InboxOutlined style={{ marginRight: 3 }} /> FG Restocked
            </Tag>
          ) : (
            <Tag color="warning" style={{ fontSize: '11px', margin: 0 }}>
              Pending Stock IN
            </Tag>
          )}
          {record.creditPosted ? (
            <Tag color="processing" style={{ fontSize: '11px', margin: 0 }}>
              <DollarOutlined style={{ marginRight: 3 }} /> Ledger Credited
            </Tag>
          ) : (
            <Tag color="default" style={{ fontSize: '11px', margin: 0 }}>
              Pending Credit
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 140,
      align: 'center',
      render: (_, record) => {
        const s = (record.status || 'DRAFT').toUpperCase();
        const conf = STATUS_CONFIG[s] || { label: s, color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' };
        return (
          <span
            style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: conf.color,
              backgroundColor: conf.bg,
              border: `1px solid ${conf.border}`,
            }}
          >
            {conf.label}
          </span>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      align: 'center',
      render: (_, record) => {
        const s = (record.status || '').toUpperCase();
        return (
          <div className="inv-actions-wrapper" style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
            <Tooltip title="View Traceability Details">
              <button className="inv-action-btn inv-btn-view" onClick={() => handleViewDetail(record)}>
                <EyeOutlined />
              </button>
            </Tooltip>

            <Tooltip title="Print Return Voucher">
              <button className="inv-action-btn inv-btn-print" onClick={() => printSalesReturnDocument(record)}>
                <PrinterOutlined />
              </button>
            </Tooltip>

            {s === 'DRAFT' && (
              <>
                <Tooltip title="Submit for Approval">
                  <button className="inv-action-btn inv-btn-submit" onClick={() => handleSubmitAction(record.id)}>
                    <SendOutlined />
                  </button>
                </Tooltip>
                <Tooltip title="Cancel">
                  <Popconfirm title="Cancel this return?" onConfirm={() => handleCancelAction(record.id)}>
                    <button className="inv-action-btn inv-btn-cancel">
                      <StopOutlined />
                    </button>
                  </Popconfirm>
                </Tooltip>
              </>
            )}

            {s === 'SUBMITTED' && (
              <>
                <Tooltip title="Approve Return">
                  <button className="inv-action-btn inv-btn-approve" onClick={() => handleApproveAction(record.id)}>
                    <CheckOutlined />
                  </button>
                </Tooltip>
                <Tooltip title="Reject Return">
                  <button className="inv-action-btn inv-btn-delete" onClick={() => openRejectModal(record)}>
                    <CloseCircleOutlined />
                  </button>
                </Tooltip>
              </>
            )}

            {s === 'APPROVED' && (
              <>
                {!record.stockPosted && (
                  <Tooltip title="Receive FG Stock IN">
                    <button className="inv-action-btn inv-btn-receive" onClick={() => openReceiveModal(record)}>
                      <InboxOutlined />
                    </button>
                  </Tooltip>
                )}
                {!record.creditPosted && (
                  <Tooltip title="Generate Credit Note & Post Ledger">
                    <button className="inv-action-btn inv-btn-credit" onClick={() => handleGenerateCreditNoteAction(record.id)}>
                      <DollarOutlined />
                    </button>
                  </Tooltip>
                )}
              </>
            )}

            {s === 'RECEIVED' && !record.creditPosted && (
              <Tooltip title="Generate Credit Note & Post Ledger">
                <button className="inv-action-btn inv-btn-credit" onClick={() => handleGenerateCreditNoteAction(record.id)}>
                  <DollarOutlined />
                </button>
              </Tooltip>
            )}

            {s === 'CREDITED' && !record.stockPosted && (
              <Tooltip title="Receive FG Stock IN">
                <button className="inv-action-btn inv-btn-receive" onClick={() => openReceiveModal(record)}>
                  <InboxOutlined />
                </button>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="inv-page-container">
      {/* 1. PROCESS STATUS CHEVRON RIBBON */}
      <div className="inv-chevron-bar" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
        <button
          className={`inv-chevron-segment ${activeChevron === 'ALL' ? 'active' : ''}`}
          onClick={() => setActiveChevron('ALL')}
        >
          <span className="chevron-title">All Returns</span>
          <span className="chevron-count">{chevronCounts.all}</span>
        </button>
        <button
          className={`inv-chevron-segment ${activeChevron === 'DRAFT' ? 'active' : ''}`}
          onClick={() => setActiveChevron('DRAFT')}
        >
          <span className="chevron-title">Draft</span>
          <span className="chevron-count">{chevronCounts.draft}</span>
        </button>
        <button
          className={`inv-chevron-segment ${activeChevron === 'SUBMITTED' ? 'active' : ''}`}
          onClick={() => setActiveChevron('SUBMITTED')}
        >
          <span className="chevron-title">Submitted</span>
          <span className="chevron-count">{chevronCounts.submitted}</span>
        </button>
        <button
          className={`inv-chevron-segment ${activeChevron === 'APPROVED' ? 'active' : ''}`}
          onClick={() => setActiveChevron('APPROVED')}
        >
          <span className="chevron-title">Approved</span>
          <span className="chevron-count">{chevronCounts.approved}</span>
        </button>
        <button
          className={`inv-chevron-segment ${activeChevron === 'RECEIVED' ? 'active' : ''}`}
          onClick={() => setActiveChevron('RECEIVED')}
        >
          <span className="chevron-title">Received (Stock IN)</span>
          <span className="chevron-count">{chevronCounts.received}</span>
        </button>
        <button
          className={`inv-chevron-segment ${activeChevron === 'CREDITED' ? 'active' : ''}`}
          onClick={() => setActiveChevron('CREDITED')}
        >
          <span className="chevron-title">Credited</span>
          <span className="chevron-count">{chevronCounts.credited}</span>
        </button>
        <button
          className={`inv-chevron-segment ${activeChevron === 'COMPLETED' ? 'active' : ''}`}
          onClick={() => setActiveChevron('COMPLETED')}
        >
          <span className="chevron-title">Completed</span>
          <span className="chevron-count">{chevronCounts.completed}</span>
        </button>
        <button
          className={`inv-chevron-segment ${activeChevron === 'REJECTED' ? 'active' : ''}`}
          onClick={() => setActiveChevron('REJECTED')}
        >
          <span className="chevron-title">Rejected</span>
          <span className="chevron-count">{chevronCounts.rejected}</span>
        </button>
        <button
          className={`inv-chevron-segment ${activeChevron === 'CANCELLED' ? 'active' : ''}`}
          onClick={() => setActiveChevron('CANCELLED')}
        >
          <span className="chevron-title">Cancelled</span>
          <span className="chevron-count">{chevronCounts.cancelled}</span>
        </button>
      </div>

      {/* 2. FILTER TOOLBAR */}
      <div className="inv-filter-panel">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} md={6} lg={4}>
            <div className="inv-search-input-wrap">
              <SearchOutlined className="inv-search-icon" />
              <input
                className="inv-search-input"
                placeholder="Search return # or customer..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </Col>

          <Col xs={12} sm={6} md={4} lg={4}>
            <Select
              allowClear
              placeholder="All Customers"
              className="inv-select"
              style={{ width: '100%' }}
              value={filterCustomer}
              onChange={val => setFilterCustomer(val)}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={customers.map(c => ({ value: c.id, label: `${c.customerCode ? `[${c.customerCode}] ` : ''}${c.name}` }))}
            />
          </Col>

          <Col xs={12} sm={6} md={4} lg={3}>
            <Select
              allowClear
              placeholder="All Reasons"
              className="inv-select"
              style={{ width: '100%' }}
              value={filterReason}
              onChange={val => setFilterReason(val)}
              options={availableReasons.map(r => ({ value: r, label: r }))}
            />
          </Col>

          <Col xs={12} sm={6} md={4} lg={3}>
            <Select
              allowClear
              placeholder="All Statuses"
              className="inv-select"
              style={{ width: '100%' }}
              value={filterStatus}
              onChange={val => setFilterStatus(val)}
              options={Object.keys(STATUS_CONFIG).map(s => ({ value: s, label: STATUS_CONFIG[s].label }))}
            />
          </Col>

          <Col xs={12} sm={6} md={3} lg={3}>
            <input
              type="date"
              className="inv-native-date-input"
              value={filterDateFrom || ''}
              onChange={e => setFilterDateFrom(e.target.value || undefined)}
            />
          </Col>

          <Col xs={12} sm={6} md={3} lg={3}>
            <input
              type="date"
              className="inv-native-date-input"
              value={filterDateTo || ''}
              onChange={e => setFilterDateTo(e.target.value || undefined)}
            />
          </Col>

          <Col xs={12} sm={6} md={4} lg={4} style={{ display: 'flex', gap: 6 }}>
            <Button
              className="btn-inv-white"
              icon={<FilterOutlined />}
              onClick={handleClearAll}
              style={{ flex: 1 }}
            >
              Clear All
            </Button>
          </Col>
        </Row>
      </div>

      {/* 3. MAIN TABLE */}
      <div className="inv-table-wrapper">
        <Table
          columns={columns}
          dataSource={displayedReturns}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showTotal: (tot, range) => `${range[0]}-${range[1]} of ${tot} returns`,
          }}
          scroll={{ x: 1470 }}
          rowClassName={(_, index) => (index % 2 === 0 ? 'inv-row-even' : 'inv-row-odd')}
        />
      </div>

      {/* 4. DETAIL & TRACEABILITY MODAL */}
      <DraggableResizableModal
        title={`Sales Return Traceability — ${detailItem?.returnNumber || ''}`}
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="print" icon={<PrinterOutlined />} onClick={() => printSalesReturnDocument(detailItem)}>
            Print Return Voucher
          </Button>,
          <Button key="close" type="primary" onClick={() => setDetailVisible(false)}>
            Close
          </Button>,
        ]}
        width={1040}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Visual Workflow Breadcrumb */}
            <div className="inv-trace-card" style={{ padding: '12px 14px' }}>
              <div className="inv-trace-title">
                END-TO-END TRACEABILITY PIPELINE
              </div>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Tag color="blue">Sales Order: {detailItem.salesOrder?.orderNumber || 'SO-Linked'}</Tag>
                <ArrowRightOutlined style={{ color: '#94a3b8' }} />
                <Tag color="cyan">Delivery Note: {detailItem.salesDelivery?.deliveryNumber || 'DN-Delivered'}</Tag>
                <ArrowRightOutlined style={{ color: '#94a3b8' }} />
                <Tag color="purple">Sales Invoice: {detailItem.salesInvoice?.invoiceNo || 'SI-Invoiced'}</Tag>
                <ArrowRightOutlined style={{ color: '#94a3b8' }} />
                <Tag color="orange" style={{ fontWeight: 700 }}>Sales Return: {detailItem.returnNumber}</Tag>
                <ArrowRightOutlined style={{ color: '#94a3b8' }} />
                <Tag color={detailItem.stockPosted ? 'green' : 'default'}>
                  {detailItem.stockPosted ? 'FG Restocked (IN)' : 'Pending Restock'}
                </Tag>
                <ArrowRightOutlined style={{ color: '#94a3b8' }} />
                <Tag color={detailItem.creditPosted ? 'geekblue' : 'default'}>
                  {detailItem.creditNoteNumber ? `Credit Note: ${detailItem.creditNoteNumber}` : 'Pending CN'}
                </Tag>
                <ArrowRightOutlined style={{ color: '#94a3b8' }} />
                <Tag color={detailItem.creditPosted ? 'green' : 'default'}>
                  {detailItem.creditPosted ? 'Customer Ledger Credited' : 'Pending Ledger'}
                </Tag>
              </div>
            </div>

            {/* General & Financial Summary */}
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Card size="small" title="Customer & Document Details" style={{ height: '100%' }}>
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label="Customer">
                      {getCustomerDisplayName(detailItem)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Customer Code">
                      {detailItem.customer?.customerCode || 'N/A'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Return Date">
                      {dayjs(detailItem.returnDate).format('YYYY-MM-DD')}
                    </Descriptions.Item>
                    <Descriptions.Item label="Status">
                      <Tag color={STATUS_CONFIG[detailItem.status]?.color || 'blue'}>
                        {detailItem.status}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Return Reason">
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>{detailItem.reason || '-'}</span>
                    </Descriptions.Item>
                    <Descriptions.Item label="Warehouse">
                      {detailItem.warehouse?.name || 'Main Finished Goods Warehouse'}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>

              <Col xs={24} md={12}>
                <Card size="small" title="Financial & Ledger Impact" style={{ height: '100%' }}>
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label="Original Invoice">
                      {detailItem.salesInvoice?.invoiceNo || 'N/A'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Original Invoice Total">
                      Rs {formatDecimal(detailItem.salesInvoice?.totalAmount || 0)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Return Refund Amount">
                      <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '14px' }}>
                        Rs {formatDecimal(detailItem.totalAmount || 0)}
                      </span>
                    </Descriptions.Item>
                    <Descriptions.Item label="Credit Note #">
                      {detailItem.creditNoteNumber ? (
                        <Tag color="purple" style={{ fontWeight: 600 }}>{detailItem.creditNoteNumber}</Tag>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Not yet generated</span>
                      )}
                    </Descriptions.Item>
                    <Descriptions.Item label="Customer Outstanding">
                      <span style={{ fontWeight: 700, color: '#059669' }}>
                        Rs {formatDecimal(detailItem.customerOutstanding || 0)}
                      </span>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            </Row>

            {/* Return Line Items */}
            <Card size="small" title="Returned Items & Reconciliation">
              <Alert
                message="Return Condition & Finished Goods Restock Policy"
                description="Only items with condition 'GOOD' are restocked into sellable Finished Goods inventory balance. Items marked DAMAGED, REJECTED, SCRAP, or REWORK_REQUIRED are quarantined and recorded in Stock Ledger without inflating sellable inventory."
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
              />
              <Table
                size="small"
                dataSource={detailItem.lines || []}
                rowKey="id"
                pagination={false}
                columns={[
                  {
                    title: 'Item',
                    key: 'item',
                    render: (_, line) => (
                      <div>
                        <div style={{ fontWeight: 600 }}>{line.item?.itemCode || line.itemCode || 'ITEM'}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{line.item?.name || line.description || ''}</div>
                      </div>
                    ),
                  },
                  {
                    title: 'Condition',
                    dataIndex: 'condition',
                    key: 'condition',
                    render: val => {
                      const c = (val || 'GOOD').toUpperCase();
                      if (c === 'GOOD') return <Tag color="success">GOOD</Tag>;
                      if (c === 'DAMAGED') return <Tag color="warning">DAMAGED</Tag>;
                      if (c === 'REJECTED') return <Tag color="error">REJECTED</Tag>;
                      if (c === 'SCRAP') return <Tag color="volcano">SCRAP</Tag>;
                      if (c === 'REWORK_REQUIRED') return <Tag color="purple">REWORK_REQUIRED</Tag>;
                      return <Tag color="default">{c}</Tag>;
                    },
                  },
                  {
                    title: 'Delivered',
                    key: 'delQty',
                    align: 'right',
                    render: (_, line) => <span>{line.deliveredQuantity ?? line.originalInvoiceQuantity ?? '-'}</span>,
                  },
                  {
                    title: 'Prev Ret',
                    key: 'prevRet',
                    align: 'right',
                    render: (_, line) => <span>{line.previouslyReturnedQuantity ?? 0}</span>,
                  },
                  {
                    title: 'Return Qty',
                    dataIndex: 'quantity',
                    key: 'quantity',
                    align: 'right',
                    render: (q, line) => (
                      <span style={{ fontWeight: 700, color: '#dc2626' }}>
                        {q} {line.uom?.code || line.uomCode || 'PCS'}
                      </span>
                    ),
                  },
                  {
                    title: 'Remaining Returnable',
                    key: 'remReturnable',
                    align: 'right',
                    render: (_, line) => (
                      <Tag color="blue">
                        {line.remainingReturnableQuantity !== undefined
                          ? line.remainingReturnableQuantity
                          : Math.max(0, (line.deliveredQuantity || 0) - (line.previouslyReturnedQuantity || 0))}
                      </Tag>
                    ),
                  },
                  {
                    title: 'Net Sold',
                    key: 'netSold',
                    align: 'right',
                    render: (_, line) => (
                      <span style={{ fontWeight: 600, color: '#059669' }}>
                        {line.netSoldQuantity !== undefined
                          ? line.netSoldQuantity
                          : Math.max(0, (line.deliveredQuantity || 0) - ((line.previouslyReturnedQuantity || 0) + Number(line.quantity)))}
                      </span>
                    ),
                  },
                  {
                    title: 'Rate',
                    dataIndex: 'unitPrice',
                    key: 'unitPrice',
                    align: 'right',
                    render: p => `Rs ${formatDecimal(p)}`,
                  },
                  {
                    title: 'Total Refund',
                    dataIndex: 'lineTotal',
                    key: 'lineTotal',
                    align: 'right',
                    render: t => <span style={{ fontWeight: 700 }}>Rs {formatDecimal(t)}</span>,
                  },
                ]}
              />
            </Card>

            {/* Stock Movement Tracking */}
            <Card size="small" title="Inventory Stock Posting Log">
              {detailItem.stockLedgerEntries && detailItem.stockLedgerEntries.length > 0 ? (
                <Table
                  size="small"
                  dataSource={detailItem.stockLedgerEntries}
                  rowKey="id"
                  pagination={false}
                  columns={[
                    { title: 'Date', dataIndex: 'transactionDate', render: d => dayjs(d).format('YYYY-MM-DD HH:mm') },
                    { title: 'Type', dataIndex: 'transactionType', render: () => <Tag color="blue">SALES_RETURN</Tag> },
                    { title: 'Direction', dataIndex: 'direction', render: () => <Tag color="green">IN</Tag> },
                    { title: 'Quantity', dataIndex: 'quantity', align: 'right', render: q => <b style={{ color: '#059669' }}>+{q}</b> },
                    { title: 'Warehouse', render: (_, r) => r.warehouse?.name || 'Warehouse' },
                    { title: 'Notes', dataIndex: 'notes' },
                  ]}
                />
              ) : (
                <div style={{ color: '#94a3b8', padding: '8px 0' }}>
                  {detailItem.stockPosted ? 'Stock recorded in inventory.' : 'No stock ledger entry yet (Stock IN occurs upon receiving).'}
                </div>
              )}
            </Card>
          </div>
        )}
      </DraggableResizableModal>

      {/* 5. CREATE SALES RETURN MODAL */}
      <DraggableResizableModal
        title="Create New Sales Return"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmitForm}
        width={1040}
        okText="Create Return"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="customerId"
                label="Customer"
                rules={[{ required: true, message: 'Please select a customer' }]}
              >
                <Select
                  placeholder="Select customer"
                  showSearch
                  optionFilterProp="label"
                  options={customers.map(c => ({ value: c.id, label: `${c.customerCode ? `[${c.customerCode}] ` : ''}${c.name}` }))}
                  onChange={() => {
                    form.setFieldValue('salesInvoiceId', undefined);
                    setReturnableItems([]);
                  }}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                name="salesInvoiceId"
                label="Original Sales Invoice (Select to load returnable items)"
                rules={[{ required: true, message: 'Please select original invoice' }]}
              >
                <Select
                  placeholder="Select invoice"
                  showSearch
                  allowClear
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={customerInvoices.map(inv => ({
                    value: inv.id,
                    label: `${inv.invoiceNo} — Total: Rs ${formatDecimal(inv.totalAmount)} (Bal: Rs ${formatDecimal(inv.balance ?? inv.totalAmount)})`,
                  }))}
                  onChange={handleInvoiceChange}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="returnDate" label="Return Date" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item name="warehouseId" label="Return Target Warehouse">
                <Select
                  placeholder="Select warehouse"
                  allowClear
                  options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item name="reason" label="Return Reason" rules={[{ required: true }]}>
                <Select
                  placeholder="Select or enter reason"
                  options={[
                    { value: 'Defective Product', label: 'Defective Product' },
                    { value: 'Wrong Item Delivered', label: 'Wrong Item Delivered' },
                    { value: 'Quality Rejection', label: 'Quality Rejection' },
                    { value: 'Customer Cancelled Order', label: 'Customer Cancelled Order' },
                    { value: 'Damaged in Transit', label: 'Damaged in Transit' },
                    { value: 'Excess Delivery Surplus', label: 'Excess Delivery Surplus' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notes" label="Remarks / Notes">
            <Input.TextArea rows={2} placeholder="Additional notes or return authorization details..." />
          </Form.Item>

          <Divider orientation="left" style={{ margin: '12px 0' }}>
            Invoice Returnable Items
          </Divider>

          {loadingReturnables ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>Loading returnable items from invoice...</div>
          ) : returnableItems.length > 0 ? (
            <div>
              <Alert
                message="Return Quantity Validation"
                description="Return quantity cannot exceed remaining returnable quantity (Delivered - Previously Returned)."
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
              />
              <Table
                size="small"
                dataSource={returnableItems}
                rowKey="itemId"
                pagination={false}
                columns={[
                  {
                    title: 'Item',
                    key: 'item',
                    render: (_, r) => (
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.itemCode}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{r.itemName}</div>
                      </div>
                    ),
                  },
                  {
                    title: 'Delivered',
                    dataIndex: 'deliveredQuantity',
                    key: 'delQty',
                    align: 'right',
                    render: q => `${q}`,
                  },
                  {
                    title: 'Prev Returned',
                    dataIndex: 'previouslyReturnedQuantity',
                    key: 'prevRet',
                    align: 'right',
                    render: q => `${q || 0}`,
                  },
                  {
                    title: 'Max Returnable',
                    dataIndex: 'maximumReturnableQuantity',
                    key: 'maxRet',
                    align: 'right',
                    render: q => <Tag color="blue">{q}</Tag>,
                  },
                  {
                    title: 'Return Qty',
                    key: 'inputQty',
                    width: 130,
                    render: (_, r, idx) => (
                      <InputNumber
                        min={0}
                        max={r.maximumReturnableQuantity}
                        value={r.quantity}
                        onChange={val => handleReturnItemQtyChange(idx, Number(val))}
                        style={{ width: '100%' }}
                      />
                    ),
                  },
                  {
                    title: 'Condition',
                    key: 'cond',
                    width: 200,
                    render: (_, r, idx) => (
                      <Select
                        value={r.condition || 'GOOD'}
                        onChange={val => handleReturnItemConditionChange(idx, val)}
                        style={{ width: '100%' }}
                        options={[
                          { value: 'GOOD', label: 'GOOD (Sellable FG Restock)' },
                          { value: 'DAMAGED', label: 'DAMAGED (Quarantine)' },
                          { value: 'REJECTED', label: 'REJECTED (Non-sellable)' },
                          { value: 'SCRAP', label: 'SCRAP (Write-off)' },
                          { value: 'REWORK_REQUIRED', label: 'REWORK_REQUIRED' },
                        ]}
                      />
                    ),
                  },
                  {
                    title: 'Net Sold',
                    key: 'netSold',
                    align: 'right',
                    render: (_, r) => (
                      <span style={{ fontWeight: 600, color: '#059669' }}>
                        {Math.max(0, (r.deliveredQuantity || 0) - ((r.previouslyReturnedQuantity || 0) + (r.quantity || 0)))}
                      </span>
                    ),
                  },
                  {
                    title: 'Unit Price',
                    dataIndex: 'unitPrice',
                    key: 'rate',
                    align: 'right',
                    render: p => `Rs ${formatDecimal(p)}`,
                  },
                  {
                    title: 'Refund Total',
                    dataIndex: 'lineTotal',
                    key: 'total',
                    align: 'right',
                    render: t => <span style={{ fontWeight: 700 }}>Rs {formatDecimal(t)}</span>,
                  },
                ]}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <div className="inv-trace-card" style={{ minWidth: 260, padding: '12px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#64748b' }}>Subtotal:</span>
                    <span>Rs {formatDecimal(formSubtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '15px', color: '#dc2626' }}>
                    <span>Total Refund Amount:</span>
                    <span>Rs {formatDecimal(formTotalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8' }}>
              Select an invoice above to view and return items.
            </div>
          )}
        </Form>
      </DraggableResizableModal>

      {/* 6. RECEIVE STOCK MODAL */}
      <Modal
        title={`Receive Finished Goods Stock — ${selectedReturnForReceive?.returnNumber || ''}`}
        open={receiveModalVisible}
        onCancel={() => setReceiveModalVisible(false)}
        onOk={handleConfirmReceiveStock}
        okText="Restock Finished Goods"
      >
        <div style={{ marginBottom: 16 }}>
          <Alert
            message="Finished Goods Stock Return"
            description="This will atomically increase on-hand and available Finished Goods inventory balance in the authoritative stock ledger."
            type="info"
            showIcon
          />
        </div>
        <div style={{ marginBottom: 8, fontWeight: 600 }}>Select Receiving Warehouse:</div>
        <Select
          style={{ width: '100%' }}
          value={targetWarehouseId}
          onChange={val => setTargetWarehouseId(val)}
          options={warehouses.map(w => ({ value: w.id, label: w.name }))}
        />
      </Modal>

      {/* 7. REJECT RETURN MODAL */}
      <Modal
        title={`Reject Sales Return — ${selectedReturnForReject?.returnNumber || ''}`}
        open={rejectModalVisible}
        onCancel={() => setRejectModalVisible(false)}
        onOk={handleConfirmReject}
        okText="Confirm Rejection"
        okButtonProps={{ danger: true }}
      >
        <div style={{ marginBottom: 8, fontWeight: 600 }}>Reason for Rejection:</div>
        <Input.TextArea
          rows={3}
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          placeholder="State reason for rejecting this return..."
        />
      </Modal>
    </div>
  );
};

export default SalesReturnManagement;
