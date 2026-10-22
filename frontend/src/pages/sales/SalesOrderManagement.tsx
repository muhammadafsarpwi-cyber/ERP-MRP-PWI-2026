import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Form, Input, Select, App,
  InputNumber, Row, Col, Descriptions, Divider, Tooltip, Tag, Modal, Badge, Checkbox,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, EyeOutlined, CheckOutlined,
  CarOutlined, InboxOutlined, StopOutlined, ReloadOutlined, FileExcelOutlined,
  PrinterOutlined, FilterOutlined, CloseCircleOutlined, UserOutlined,
  CalendarOutlined, ShoppingCartOutlined, DollarOutlined, CheckCircleOutlined,
  BuildOutlined, BranchesOutlined, SendOutlined, DownOutlined, UpOutlined, ApartmentOutlined,
  DatabaseOutlined, SaveOutlined, CloseOutlined, ClearOutlined, AppstoreOutlined,
  ExclamationCircleOutlined, InfoCircleOutlined, ClockCircleOutlined, RightCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal, formatNumber } from '../../utils/numberFormat';
import { ERPLineItems, ERPLine, DraggableResizableModal, SaveResultDialog } from '../../components/shared';
import type { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import { TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { usePermission } from '../../hooks/usePermission';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import './SalesInvoiceManagement.css';
import { printSalesOrderDocument, printTableList, printLoadingAdviceSlip } from '../../utils/printTemplates';

dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

interface SalesOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName?: string;
  companyName?: string;
  customer?: {
    id: string;
    customerCode?: string;
    name?: string;
    companyName?: string;
    legalName?: string;
  };
  divisionId?: string | null;
  division?: {
    id: string;
    divisionCode: string;
    name: string;
  };
  sectionId?: string | null;
  section?: {
    id: string;
    name: string;
    sectionCode?: string;
  };
  shipToAddress?: string;
  billToAddress?: string;
  orderDate: string;
  deliveryDate: string;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  freightAmount: number;
  totalAmount: number;
  status: string;
  notes?: string;
  items?: any[];
  relatedQuotation?: {
    id: string;
    quotationNumber: string;
    quotationDate?: string;
    status?: string;
    totalAmount?: number;
  } | null;
  linkedProductionOrders?: Array<{
    id: string;
    orderNumber: string;
    itemId: string;
    status: string;
    plannedQuantity: number;
    completedQuantity: number;
  }>;
  linkedDeliveries?: Array<{
    id: string;
    deliveryNumber: string;
    deliveryDate: string;
    status: string;
    totalAmount: number;
  }>;
  linkedInvoices?: Array<{
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    status: string;
    totalAmount: number;
    paidAmount?: number;
  }>;
}

const STATUS_OPTIONS = ['All statuses', 'Draft', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Closed', 'Cancelled'];

export function buildSalesOrderPayload(values: any, lineItems: ERPLine[], editingOrderNumber?: string): any {
  let orderNumber: string | undefined;
  if (editingOrderNumber && String(editingOrderNumber).trim()) {
    orderNumber = String(editingOrderNumber).trim();
  } else if (values.socNumber) {
    const socNum = String(values.socNumber).trim();
    orderNumber = socNum ? (socNum.toUpperCase().startsWith('SOC-') ? socNum : `SOC-${socNum}`) : undefined;
  }

  // Filter out empty rows where itemId is blank or unselected
  const validLines = lineItems.filter(
    (l) => l.itemId && typeof l.itemId === 'string' && l.itemId.trim() !== '',
  );

  const payload: any = {
    ...values,
    orderNumber,
    items: validLines.map((l) => ({
      itemId: l.itemId,
      description: l.itemName || l.itemCode || 'Item',
      quantity: Number(l.quantity || 1),
      uomId: l.uomId || 'b932052f-141f-4d78-9baf-7025e5302442',
      unitPrice: Number(l.rate || 0),
      discountPercent: Number(l.discountPercent || 0),
      lineTotal: Number(l.lineTotal || (Number(l.quantity || 1) * Number(l.rate || 0))),
    })),
  };

  // Prevent forbidden non-whitelisted property errors
  delete payload.socNumber;
  if (!orderNumber) {
    delete payload.orderNumber;
  }

  // Validate UUID format for divisionId, sectionId, and quotationId or delete if invalid/empty
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!payload.divisionId || !uuidRegex.test(String(payload.divisionId).trim())) {
    delete payload.divisionId;
  }
  if (!payload.sectionId || !uuidRegex.test(String(payload.sectionId).trim())) {
    delete payload.sectionId;
  }
  if (!payload.quotationId || !uuidRegex.test(String(payload.quotationId).trim())) {
    delete payload.quotationId;
  }

  // Sanitize empty strings for date and text fields
  if (payload.deliveryDate !== undefined) {
    const d = String(payload.deliveryDate || '').trim();
    payload.deliveryDate = d ? d : null;
  }
  if (payload.orderDate !== undefined) {
    const d = String(payload.orderDate || '').trim();
    if (!d) delete payload.orderDate;
  }
  if (payload.shipToAddress !== undefined && typeof payload.shipToAddress === 'string') {
    payload.shipToAddress = payload.shipToAddress.trim() || null;
  }
  if (payload.billToAddress !== undefined && typeof payload.billToAddress === 'string') {
    payload.billToAddress = payload.billToAddress.trim() || null;
  }
  if (payload.notes !== undefined && typeof payload.notes === 'string') {
    payload.notes = payload.notes.trim() || null;
  }

  return payload;
}

export interface ChangeDiffItem {
  field: string;
  oldVal: string;
  newVal: string;
  color?: string;
}

export function computeOrderChanges(
  original: SalesOrder | null,
  values: any,
  currentLines: ERPLine[],
  customersList: Array<{ id: string; name?: string; companyName?: string; contactPerson?: string; customerCode?: string }>,
  divisionsList: Array<{ id: string; divisionCode: string; name: string }>,
): ChangeDiffItem[] {
  if (!original || !values) return [];
  const diffs: ChangeDiffItem[] = [];

  // 1. SOC Number
  const oldSoc = original.orderNumber || '-';
  const rawNewSoc = values.socNumber ? String(values.socNumber).trim() : '';
  const newSoc = rawNewSoc ? (rawNewSoc.toUpperCase().startsWith('SOC-') ? rawNewSoc : `SOC-${rawNewSoc}`) : oldSoc;
  if (oldSoc !== newSoc && rawNewSoc) {
    diffs.push({ field: 'SOC Number', oldVal: oldSoc, newVal: newSoc, color: '#2563eb' });
  }

  // 2. Customer
  if (values.customerId && values.customerId !== original.customerId) {
    const oldC = customersList.find(c => c.id === original.customerId);
    const newC = customersList.find(c => c.id === values.customerId);
    diffs.push({
      field: 'Customer',
      oldVal: oldC?.name || oldC?.companyName || original.customer?.companyName || original.customer?.name || 'Previous Customer',
      newVal: newC?.name || newC?.companyName || 'New Customer',
      color: '#059669',
    });
  }

  // 3. Division
  if (values.divisionId && values.divisionId !== original.divisionId) {
    const oldD = divisionsList.find(d => d.id === original.divisionId);
    const newD = divisionsList.find(d => d.id === values.divisionId);
    diffs.push({
      field: 'Division',
      oldVal: oldD?.name || original.division?.name || 'None',
      newVal: newD?.name || 'New Division',
      color: '#7c3aed',
    });
  }

  // 4. Order Date
  const oldDate = original.orderDate ? dayjs(original.orderDate).format('YYYY-MM-DD') : '-';
  const newDate = values.orderDate ? dayjs(values.orderDate).format('YYYY-MM-DD') : oldDate;
  if (oldDate !== '-' && newDate !== oldDate) {
    diffs.push({ field: 'Order Date', oldVal: oldDate, newVal: newDate });
  }

  // 5. Delivery Date
  const oldDelDate = original.deliveryDate ? dayjs(original.deliveryDate).format('YYYY-MM-DD') : '-';
  const newDelDate = values.deliveryDate ? dayjs(values.deliveryDate).format('YYYY-MM-DD') : oldDelDate;
  if (oldDelDate !== '-' && newDelDate !== oldDelDate) {
    diffs.push({ field: 'Delivery Date', oldVal: oldDelDate, newVal: newDelDate });
  }

  // 6. Line items count & Total Amount
  const oldItemsCount = original.items?.length || 0;
  const newItemsCount = currentLines.filter(l => Boolean(l.itemId)).length;
  if (oldItemsCount !== newItemsCount) {
    diffs.push({ field: 'Line Items', oldVal: `${oldItemsCount} item(s)`, newVal: `${newItemsCount} item(s)` });
  }

  const oldTotal = Number(original.totalAmount || 0);
  const newTotal = currentLines.reduce((sum, l) => {
    const q = Number(l.quantity || 0);
    const r = Number(l.rate || 0);
    const d = Number(l.discountPercent || 0);
    const t = Number(l.taxPercent || 18);
    const base = q * r * (1 - d / 100);
    return sum + (base * (1 + t / 100));
  }, 0);
  if (Math.abs(oldTotal - newTotal) > 1) {
    diffs.push({
      field: 'Total Amount',
      oldVal: `PKR ${oldTotal.toLocaleString()}`,
      newVal: `PKR ${Math.round(newTotal).toLocaleString()}`,
      color: '#059669',
    });
  }

  return diffs;
}

const SalesOrderManagement: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const navigate = useNavigate();
  const canCreate = can('sales.orders.create');
  const canUpdate = can('sales.orders.update');
  const canApprove = can('sales.orders.approve');

  const [data, setData] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Chevron Process filter state
  const [activeChevron, setActiveChevron] = useState<string>('ALL');

  // Filter States
  const [filterDivision, setFilterDivision] = useState<string | undefined>(undefined);
  const [filterCurrency, setFilterCurrency] = useState<string | undefined>(undefined);
  const [filterCustomer, setFilterCustomer] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterDateFrom, setFilterDateFrom] = useState<string | undefined>(undefined);
  const [filterDateTo, setFilterDateTo] = useState<string | undefined>(undefined);
  const [filtersCollapsed, setFiltersCollapsed] = useState<boolean>(true);
  const [search, setSearch] = useState('');

  // Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<SalesOrder | null>(null);
  const [editingItem, setEditingItem] = useState<SalesOrder | null>(null);

  // Save confirmation & SaveResultDialog states
  const [confirmOrderVisible, setConfirmOrderVisible] = useState(false);
  const [pendingOrderValues, setPendingOrderValues] = useState<any>(null);
  const [saveResultOpen, setSaveResultOpen] = useState(false);
  const [saveResultPhase, setSaveResultPhase] = useState<SaveResultPhase>('loading');
  const [saveResultData, setSaveResultData] = useState<SaveResultData | null>(null);
  const [saveResultError, setSaveResultError] = useState<string | undefined>(undefined);
  const [saveResultSuccessTitle, setSaveResultSuccessTitle] = useState<string>('Successful');
  const [saveResultRetry, setSaveResultRetry] = useState<(() => void) | undefined>(undefined);
  const [form] = Form.useForm();
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [customers, setCustomers] = useState<Array<{ id: string; name?: string; companyName?: string; contactPerson?: string; customerCode?: string; divisionId?: string | null }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string }>>([]);
  const [divisions, setDivisions] = useState<Array<{ id: string; divisionCode: string; name: string }>>([]);
  const [sections, setSections] = useState<Array<{ id: string; name: string; sectionCode?: string; divisionId?: string }>>([]);
  const [selectedDivision, setSelectedDivision] = useState<string | undefined>(undefined);
  const selectedCustomerId = Form.useWatch('customerId', form);

  // Downstream Workflow: Delivery / Loading Advice Modal State
  interface DeliveryLineItem {
    salesOrderItemId: string;
    itemId?: string;
    itemCode?: string;
    description: string;
    uom: string;
    orderedQuantity: number;
    deliveredQuantity: number;
    remainingQuantity: number;
    quantity: number;
  }
  const [deliveryModalVisible, setDeliveryModalVisible] = useState(false);
  const [deliveryOrder, setDeliveryOrder] = useState<SalesOrder | null>(null);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryLineItem[]>([]);
  const [deliveryWarehouseId, setDeliveryWarehouseId] = useState<string | undefined>(undefined);
  const [deliveryDate, setDeliveryDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [deliveryCarrier, setDeliveryCarrier] = useState<string>('');
  const [deliveryTracking, setDeliveryTracking] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');

  // Downstream Workflow: Production Planning Modal State
  interface ProdPlanningLine {
    salesOrderItemId: string;
    itemId: string;
    itemCode?: string;
    description: string;
    uom: string;
    orderedQuantity: number;
    producedQuantity: number;
    availableStock: number;
    shortageQuantity: number;
    plannedQuantity: number;
    selected: boolean;
  }
  const [productionModalVisible, setProductionModalVisible] = useState(false);
  const [prodOrder, setProdOrder] = useState<SalesOrder | null>(null);
  const [prodItem, setProdItem] = useState<any | null>(null);
  const [prodItemsList, setProdItemsList] = useState<ProdPlanningLine[]>([]);
  const [prodQuantity, setProdQuantity] = useState<number>(0);
  const [prodStartDate, setProdStartDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [prodEndDate, setProdEndDate] = useState<string>(dayjs().add(7, 'day').format('YYYY-MM-DD'));
  const [submittingAction, setSubmittingAction] = useState(false);

  // Dedicated Workflow Confirmation Modal State (with full item-wise breakdown)
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{
    record: SalesOrder;
    action: string;
    actionLabel: string;
    color: string;
    items: any[];
  } | null>(null);
  const [confirmActionLoading, setConfirmActionLoading] = useState(false);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
    (async () => {
      try {
        const combinedMap = new Map<string, any>();
        // 1. Fetch sales customers from erp_sales schema (authoritative for sales orders, quotes, deliveries)
        try {
          const sc = await apiService.get<any>('/sales/orders/meta/customers');
          const scList = Array.isArray(sc) ? sc : (sc?.data || []);
          scList.forEach((c: any) => {
            if (c?.id) {
              combinedMap.set(c.id, {
                id: c.id,
                name: c.companyName || c.name || c.legalName || 'Customer',
                companyName: c.companyName || c.name,
                customerCode: c.customerCode,
                contactPerson: c.contactPerson,
                divisionId: c.divisionId || c.division_id || null,
              });
            }
          });
        } catch { /* ignore */ }

        // 2. Fetch general customer master
        try {
          const c = await apiService.get<any>('/customer/customers', { limit: 100 });
          const list = Array.isArray(c) ? c : (c?.data || c?.items || []);
          list.forEach((cust: any) => {
            if (cust?.id) {
              const existing = combinedMap.get(cust.id);
              if (!existing) {
                combinedMap.set(cust.id, {
                  id: cust.id,
                  name: cust.name || cust.companyName || cust.legalName || 'Unnamed Customer',
                  companyName: cust.companyName || cust.name,
                  contactPerson: cust.contactPerson,
                  customerCode: cust.customerCode,
                  divisionId: cust.divisionId || cust.division_id || null,
                });
              } else if (!existing.divisionId && (cust.divisionId || cust.division_id)) {
                existing.divisionId = cust.divisionId || cust.division_id;
              }
            }
          });
        } catch { /* ignore */ }

        setCustomers(Array.from(combinedMap.values()));
      } catch { /* ignore */ }
      try {
        const w = await apiService.get<{ data: Array<{ id: string; warehouseCode: string; name: string }> }>('/warehouses', { limit: 100 });
        setWarehouses(w.data || []);
      } catch { /* ignore */ }
      try {
        const divRes = await apiService.get<any>('/divisions', { limit: 50 });
        const list = divRes.data || divRes;
        setDivisions(Array.isArray(list) ? list.filter((d: any) => d.status === 'ACTIVE' || d.isActive !== false) : []);
      } catch { /* ignore */ }
      try {
        const secRes = await apiService.get<any>('/sections', { limit: 100 });
        const list = secRes.data || secRes;
        setSections(Array.isArray(list) ? list.filter((s: any) => s.status === 'ACTIVE' || s.isActive !== false) : []);
      } catch { /* ignore */ }
    })();
  }, []);

  const getCustomerDisplayName = useCallback((record: any): string => {
    if (!record) return '-';
    // 1. Direct customer relation object (loaded from backend relation join)
    const c = record.customer;
    if (c) {
      const code = c.customerCode ? `[${c.customerCode}] ` : '';
      const name = c.companyName || c.name || c.legalName;
      if (name) return `${code}${name}`;
    }
    // 2. Direct name fields
    if (record.companyName) return record.companyName;
    if (record.customerName) return record.customerName;
    // 3. Lookup in loaded customers state array
    const targetId = record.customerId || (typeof record.customer === 'string' ? record.customer : record.customer?.id);
    if (targetId) {
      const found = customers.find(item => item.id === targetId);
      if (found) {
        const code = found.customerCode ? `[${found.customerCode}] ` : '';
        const name = found.companyName || found.name;
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
      if (filterDivision) params.divisionId = filterDivision;
      const response = await apiService.get<{ data: SalesOrder[]; total: number }>('/sales/orders', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, [search, filterCustomer, filterStatus, filterDivision, pageSize, message]);

  useEffect(() => {
    fetchData(page, pageSize);
  }, [page, pageSize, fetchData]);

  // Global header tab refresh
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).includes('order')) {
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
      draft: data.filter(d => (d.status || '').toLowerCase() === 'draft').length,
      processing: data.filter(d => ['confirmed', 'processing'].includes((d.status || '').toLowerCase())).length,
      delivered: data.filter(d => ['shipped', 'delivered'].includes((d.status || '').toLowerCase())).length,
      cancelled: data.filter(d => ['cancelled', 'closed'].includes((d.status || '').toLowerCase())).length,
    };
  }, [data, total]);

  // Authoritative Action KPI Metrics for Sales Orders
  const kpiMetrics = useMemo(() => {
    const list = data || [];
    const totalOrdersCount = total || list.length;
    let totalDemandQty = 0;
    let totalDeliveredQty = 0;
    let totalGrossAmount = 0;

    list.forEach(ord => {
      totalGrossAmount += Number(ord.totalAmount || 0);
      const items = ord.items || [];
      items.forEach((it: any) => {
        totalDemandQty += Number(it.quantity || it.orderedQuantity || 0);
        totalDeliveredQty += Number(it.deliveredQuantity || 0);
      });
    });

    const remainingBalanceQty = Math.max(0, totalDemandQty - totalDeliveredQty);
    const dispatchPercentage = totalDemandQty > 0 ? ((totalDeliveredQty / totalDemandQty) * 100).toFixed(1) : '0.0';
    const balancePercentage = totalDemandQty > 0 ? ((remainingBalanceQty / totalDemandQty) * 100).toFixed(1) : '100.0';

    return {
      totalOrdersCount,
      totalDemandQty,
      totalDeliveredQty,
      remainingBalanceQty,
      dispatchPercentage,
      balancePercentage,
      totalGrossAmount,
    };
  }, [data, total]);

  // Available currencies
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>(['PKR', 'USD', 'EUR', 'GBP']);
    data.forEach(d => { if (d.currency) set.add(d.currency); });
    return Array.from(set);
  }, [data]);

  // Client-side filtering
  const displayedOrders = useMemo(() => {
    return data.filter(d => {
      const status = (d.status || '').toLowerCase();
      // Chevron filter
      if (activeChevron === 'DRAFT' && status !== 'draft') return false;
      if (activeChevron === 'PROCESSING' && !['confirmed', 'processing'].includes(status)) return false;
      if (activeChevron === 'DELIVERED' && !['shipped', 'delivered'].includes(status)) return false;
      if (activeChevron === 'CANCELLED' && !['cancelled', 'closed'].includes(status)) return false;

      // Division filter
      if (filterDivision && d.divisionId !== filterDivision) return false;

      // Currency filter
      if (filterCurrency && d.currency?.toUpperCase() !== filterCurrency.toUpperCase()) return false;

      // Customer filter
      if (filterCustomer && d.customerId !== filterCustomer) return false;

      // Status filter
      if (filterStatus && filterStatus !== 'All statuses' && status !== filterStatus.toLowerCase()) return false;

      // Date Range filter
      if (filterDateFrom && d.orderDate && dayjs(d.orderDate).isBefore(dayjs(filterDateFrom), 'day')) return false;
      if (filterDateTo && d.orderDate && dayjs(d.orderDate).isAfter(dayjs(filterDateTo), 'day')) return false;

      return true;
    });
  }, [data, activeChevron, filterDivision, filterCurrency, filterCustomer, filterStatus, filterDateFrom, filterDateTo]);

  const activeFilterCount = [filterDivision, filterCurrency, filterCustomer, filterStatus, filterDateFrom, filterDateTo].filter(Boolean).length;

  // Clear all filters handler
  const handleClearAll = () => {
    setActiveChevron('ALL');
    setFilterDivision(undefined);
    setFilterCurrency(undefined);
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
    if (displayedOrders.length === 0) {
      message.warning('No order records to export');
      return;
    }
    const headers = ['SOC / Order #', 'Customer', 'Order Date', 'Delivery Date', 'Currency', 'Subtotal', 'Discount', 'Tax', 'Freight', 'Total Amount', 'Status'];
    const rows = displayedOrders.map(o => {
      const custName = getCustomerDisplayName(o);
      return [
        `"${o.orderNumber}"`,
        `"${custName}"`,
        `"${o.orderDate || ''}"`,
        `"${o.deliveryDate || ''}"`,
        `"${o.currency || 'PKR'}"`,
        o.subtotal || 0,
        o.discountAmount || 0,
        o.taxAmount || 0,
        o.freightAmount || 0,
        o.totalAmount || 0,
        `"${o.status}"`,
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sales_orders_soc_${dayjs().format('YYYYMMDD_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Sales orders (SOC) exported to CSV');
  }, [displayedOrders, getCustomerDisplayName, message]);

  // Print
  const handlePrint = useCallback(() => {
    const headers = ['Order #', 'Customer', 'Date', 'Delivery Date', 'Subtotal', 'Tax', 'Total Amount', 'Status'];
    const rows = displayedOrders.map(ord => [
      ord.orderNumber,
      getCustomerDisplayName(ord),
      ord.orderDate || '-',
      ord.deliveryDate || '-',
      `Rs ${formatDecimal(ord.subtotal || 0)}`,
      `Rs ${formatDecimal(ord.taxAmount || 0)}`,
      `Rs ${formatDecimal(ord.totalAmount || 0)}`,
      ord.status,
    ]);
    printTableList('Sales Orders Report', headers, rows);
  }, [displayedOrders, getCustomerDisplayName]);

  const handleCreate = useCallback(async () => {
    setEditingItem(null);
    setSelectedDivision(undefined);
    form.resetFields();

    let nextNum = `${dayjs().format('YYYY')}-00001`;
    try {
      const res = await apiService.get<any>('/sales/orders/meta/next-number?prefix=SOC-');
      const val = res?.data || res;
      if (typeof val === 'string') {
        nextNum = val.replace(/^(SOC|SO)-/i, '');
      }
    } catch {
      // fallback
    }

    form.setFieldsValue({
      socNumber: nextNum,
      currency: 'PKR',
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      freightAmount: 0,
      totalAmount: 0,
      orderDate: dayjs().format('YYYY-MM-DD'),
      deliveryDate: dayjs().add(15, 'day').format('YYYY-MM-DD'),
      status: 'Draft',
    });
    setLineItems([]);
    setModalVisible(true);
  }, [form]);

  // Register action buttons into Main Header (Top Application Header)
  useEffect(() => {
    const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
    setHeaderActions([
      {
        key: 'new-order',
        node: canCreate ? (
          <Button
            className="btn-new-invoice"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            + New Sales Order
          </Button>
        ) : null,
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
        key: 'fg-inventory',
        node: (
          <Button
            className="btn-inv-white"
            icon={<DatabaseOutlined />}
            onClick={() => navigate('/sales/finished-goods')}
          >
            FG Inventory
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
  }, [page, pageSize, canCreate, handleCreate, handleExportCsv, handlePrint, fetchData, navigate]);

  const handleEdit = async (record: SalesOrder) => {
    let fullOrder = record;
    try {
      const response = await apiService.get<any>(`/sales/orders/${record.id}`);
      fullOrder = (response as any)?.data || response || record;
    } catch {
      fullOrder = record;
    }

    setEditingItem(fullOrder);
    setSelectedDivision(fullOrder.divisionId || undefined);

    const rawNum = fullOrder.orderNumber || '';
    const numOnly = rawNum.replace(/^(SOC|SO)-/i, '');

    form.setFieldsValue({
      socNumber: numOnly || rawNum,
      divisionId: fullOrder.divisionId || undefined,
      sectionId: fullOrder.sectionId || undefined,
      customerId: fullOrder.customerId,
      orderDate: fullOrder.orderDate ? dayjs(fullOrder.orderDate).format('YYYY-MM-DD') : undefined,
      deliveryDate: fullOrder.deliveryDate ? dayjs(fullOrder.deliveryDate).format('YYYY-MM-DD') : undefined,
      currency: fullOrder.currency || 'PKR',
      shipToAddress: fullOrder.shipToAddress,
      billToAddress: fullOrder.billToAddress,
      notes: fullOrder.notes,
      subtotal: fullOrder.subtotal,
      discountAmount: fullOrder.discountAmount,
      taxAmount: fullOrder.taxAmount,
      freightAmount: fullOrder.freightAmount,
      totalAmount: fullOrder.totalAmount,
    });

    if (Array.isArray(fullOrder.items) && fullOrder.items.length > 0) {
      const mappedLines: ERPLine[] = fullOrder.items.map((it: any, idx: number) => {
        const itemObj = it.item || {};
        const pSize = it.packagingSize || itemObj.packagingSize ? Number(it.packagingSize || itemObj.packagingSize) : undefined;
        const pUnit = it.packagingUnit || itemObj.packagingUnit || (itemObj.packagingType ? itemObj.packagingType.toLowerCase() : undefined);
        const qty = Number(it.quantity || 0);
        const pkgQty = (pSize && pSize > 0) ? Math.round((qty / pSize) * 100) / 100 : undefined;
        const rate = Number(it.unitPrice ?? it.rate ?? 0);
        const disc = Number(it.discountPercent ?? 0);
        const lineTot = Number(it.lineTotal ?? (qty * rate * (1 - disc / 100)));

        return {
          id: it.id || `line-${Date.now()}-${idx}`,
          itemId: it.itemId,
          itemCode: itemObj.itemCode || it.itemCode,
          itemName: itemObj.name || it.itemName || it.description,
          uomId: it.uomId,
          uomCode: it.uom?.code || it.uomCode,
          packagingType: itemObj.packagingType || undefined,
          packagingSize: pSize,
          packagingUnit: pUnit,
          packageQuantity: pkgQty,
          quantity: qty,
          rate: rate,
          discountPercent: disc,
          taxPercent: 18,
          lineTotal: lineTot,
        };
      });
      setLineItems(mappedLines);
    } else {
      setLineItems([]);
    }

    setModalVisible(true);
  };

  const handleViewDetail = async (record: SalesOrder) => {
    try {
      const response = await apiService.get<any>(`/sales/orders/${record.id}`);
      const data = (response as any)?.data || response;
      setDetailItem(data);
      setDetailVisible(true);
    } catch {
      setDetailItem(record);
      setDetailVisible(true);
    }
  };

  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      const validLines = lineItems.filter(
        (l) => l.itemId && typeof l.itemId === 'string' && l.itemId.trim() !== '',
      );
      if (validLines.length === 0) {
        message.warning('Please select at least one finished good item in the order line items table.');
        return;
      }
      setPendingOrderValues(values);
      setConfirmOrderVisible(true);
    } catch {
      // Field validation error shown by form
    }
  };

  const executeOrderSave = async (values: any) => {
    setConfirmOrderVisible(false);
    setSaveResultOpen(true);
    setSaveResultPhase('loading');
    setSaveResultError(undefined);

    const isEdit = Boolean(editingItem);
    const customerObj = customers.find(c => c.id === values.customerId);
    const custName = customerObj?.name || customerObj?.companyName || 'Customer';
    const diffs = isEdit ? computeOrderChanges(editingItem, values, lineItems, customers, divisions) : [];

    try {
      const payload = buildSalesOrderPayload(values, lineItems, editingItem?.orderNumber);
      let res: any;
      if (isEdit && editingItem) {
        res = await apiService.patch(`/sales/orders/${editingItem.id}`, payload);
      } else {
        res = await apiService.post('/sales/orders', payload);
      }
      const saved = res?.data || res || {};
      const orderNum = saved.orderNumber || payload.orderNumber || editingItem?.orderNumber || 'SO-RECORDED';

      const diffSummaryText = diffs.length > 0
        ? ` Updated fields: ${diffs.map(d => `${d.field} (${d.oldVal} ➔ ${d.newVal})`).join(', ')}.`
        : '';

      const diffExtraNode = diffs.length > 0 ? (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(37, 99, 235, 0.05)', border: '1px solid rgba(37, 99, 235, 0.2)', borderRadius: 8, textAlign: 'left' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#2563eb', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            🔄 Updated Fields:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {diffs.map((d, i) => (
              <div key={i} style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>{d.field}:</span>
                <span style={{ fontWeight: 700, color: d.color || '#2563eb' }}>{d.oldVal} ➔ {d.newVal}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null;

      setSaveResultPhase('success');
      setSaveResultSuccessTitle(isEdit ? 'Sales Order Updated Successfully' : 'Sales Order Created Successfully');
      setSaveResultData({
        title: isEdit ? 'Sales Order Updated Successfully' : 'Sales Order Created Successfully',
        message: `Sales Order ${orderNum} for "${custName}" has been successfully ${isEdit ? 'updated' : 'recorded'}.${diffSummaryText}`,
        recordType: 'Order Number',
        recordCode: orderNum,
        recordName: custName,
        tags: [
          { label: isEdit ? 'UPDATED' : 'CONFIRMED', color: 'green' },
          { label: `${lineItems.length} line item(s)`, color: 'blue' },
          ...diffs.map(d => ({ label: `${d.field}: ${d.newVal}`, color: 'geekblue' as const })),
        ],
        extra: diffExtraNode,
      });
      setModalVisible(false);
      setEditingItem(null);
      fetchData(page, pageSize);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message || (error as any)?.message || 'Failed to save order';
      setSaveResultPhase('error');
      setSaveResultError(Array.isArray(msg) ? msg.join(', ') : msg);
      setSaveResultRetry(() => () => executeOrderSave(values));
    }
  };

  const handleAction = async (id: string, action: string) => {
    setSaveResultOpen(true);
    setSaveResultPhase('loading');
    setSaveResultError(undefined);

    try {
      await apiService.patch(`/sales/orders/${id}/${action}`);
      setSaveResultPhase('success');
      setSaveResultSuccessTitle(`Order ${action.toUpperCase()} Successfully`);
      setSaveResultData({
        title: `Order ${action.toUpperCase()} Successfully`,
        message: `The sales order workflow transition to "${action}" has completed.`,
        recordType: 'Action',
        recordCode: action.toUpperCase(),
        tags: [{ label: action.toUpperCase(), color: 'green' }],
      });
      fetchData(page, pageSize);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || `Failed to ${action} order`;
      setSaveResultPhase('error');
      setSaveResultError(Array.isArray(msg) ? msg.join(', ') : msg);
      setSaveResultRetry(() => () => handleAction(id, action));
    }
  };

  const confirmWorkflowAction = async (record: SalesOrder, action: string, actionLabel: string, color: string) => {
    let items = record.items || [];
    if (!items || items.length === 0) {
      try {
        const res = await apiService.get<any>(`/sales/orders/${record.id}`);
        const fullOrder = (res as any)?.data || res;
        items = fullOrder?.items || [];
      } catch (err) {
        console.warn('Could not load full order items for confirmation modal:', err);
      }
    }
    setConfirmTarget({
      record,
      action,
      actionLabel,
      color,
      items,
    });
    setConfirmModalVisible(true);
  };

  const handleOpenCreateDelivery = async (record: SalesOrder) => {
    try {
      const res = await apiService.get<any>(`/sales/orders/${record.id}`);
      const fullOrder: SalesOrder = (res as any)?.data || res;
      setDeliveryOrder(fullOrder);

      const fulfillmentMap = new Map<string, any>();
      if (Array.isArray((fullOrder as any).itemFulfillment)) {
        (fullOrder as any).itemFulfillment.forEach((f: any) => {
          fulfillmentMap.set(f.orderItemId, f);
        });
      }

      const orderItems = (fullOrder.items && fullOrder.items.length > 0) ? fullOrder.items : (record.items || []);
      const itemsToDeliver: DeliveryLineItem[] = orderItems.map((it: any, idx: number) => {
        const ful = fulfillmentMap.get(it.id);
        const ordered = Number(it.quantity || it.orderedQuantity || 0);
        const delivered = Number(ful?.deliveredQuantity ?? it.deliveredQuantity ?? 0);
        const rem = ful?.remainingDeliveryQuantity !== undefined 
          ? Number(ful.remainingDeliveryQuantity) 
          : Math.max(0, ordered - delivered);
        const code = ful?.itemCode || it.item?.code || (it as any).itemCode || `SKU-${idx + 1}`;
        const desc = it.description || it.item?.name || `Item #${idx + 1}`;
        const uom = it.uom?.code || it.uomCode || ful?.uom || 'GRS';

        return {
          salesOrderItemId: it.id,
          itemId: it.itemId || it.item?.id,
          itemCode: code,
          description: desc,
          uom,
          orderedQuantity: ordered,
          deliveredQuantity: delivered,
          remainingQuantity: Math.max(0, rem),
          quantity: Math.max(0, rem),
        };
      });

      setDeliveryItems(itemsToDeliver);
      setDeliveryWarehouseId(warehouses[0]?.id);
      setDeliveryDate(dayjs().format('YYYY-MM-DD'));
      setDeliveryCarrier('');
      setDeliveryTracking('');
      setDeliveryNotes(`Created from Sales Order ${fullOrder.orderNumber}`);
      setDeliveryModalVisible(true);
    } catch {
      message.error('Failed to load order details for delivery');
    }
  };

  const handleSubmitCreateDelivery = async () => {
    if (!deliveryOrder) return;
    const validLines = deliveryItems.filter(i => i.quantity > 0);
    if (validLines.length === 0) {
      message.error('Please specify at least one item quantity to deliver');
      return;
    }
    for (const line of validLines) {
      if (line.quantity > line.remainingQuantity) {
        message.error(`Delivery quantity for ${line.description} cannot exceed remaining quantity (${line.remainingQuantity})`);
        return;
      }
    }
    setSubmittingAction(true);
    try {
      const payload = {
        deliveryDate,
        warehouseId: deliveryWarehouseId,
        carrier: deliveryCarrier,
        trackingNumber: deliveryTracking,
        notes: deliveryNotes,
        lines: validLines.map(l => ({ 
          salesOrderItemId: l.salesOrderItemId, 
          itemId: l.itemId,
          quantity: l.quantity 
        })),
        items: validLines.map(l => ({ 
          salesOrderItemId: l.salesOrderItemId, 
          itemId: l.itemId,
          quantity: l.quantity 
        })),
      };
      const res = await apiService.post<any>(`/sales/orders/${deliveryOrder.id}/convert-to-delivery`, payload);
      const deliveryData = (res as any)?.data || res;
      setDeliveryModalVisible(false);
      fetchData(page, pageSize);

      const deliveryForPrint = {
        ...deliveryData,
        carrier: deliveryCarrier,
        trackingNumber: deliveryTracking,
        deliveryDate,
        customer: deliveryOrder.customer || {
          companyName: deliveryOrder.companyName || deliveryOrder.customerName,
        },
        shippingAddress: deliveryOrder.shipToAddress,
        lines: validLines.map(l => ({
          ...l,
          orderQuantity: l.orderedQuantity,
          remainingQuantity: Math.max(0, l.remainingQuantity - l.quantity),
        })),
      };

      Modal.success({
        title: 'Loading Advice / Delivery Note Generated',
        width: 600,
        centered: true,
        content: (
          <div style={{ marginTop: 12 }}>
            <div style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#166534', marginBottom: 6 }}>
                ✅ Loading Advice #{deliveryData.deliveryNumber || 'Created'}
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><strong>Sales Order / SOC:</strong> {deliveryOrder.orderNumber}</div>
                <div><strong>Customer:</strong> {deliveryOrder.customer?.name || deliveryOrder.companyName || 'Valued Customer'}</div>
                <div><strong>Dispatch Date:</strong> {deliveryDate}</div>
                {deliveryCarrier && <div><strong>Transporter:</strong> {deliveryCarrier}</div>}
                {deliveryTracking && <div><strong>Vehicle / Bilty #:</strong> {deliveryTracking}</div>}
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
              The <strong>Loading Advice</strong> is ready for truck loading and gate pass dispatch. You can print the slip immediately or share via WhatsApp.
            </p>
          </div>
        ),
        okText: '🖨️ Print Loading Advice Slip',
        okButtonProps: { style: { backgroundColor: '#059669', borderColor: '#059669', height: 38, fontWeight: 700 } },
        onOk: () => {
          printLoadingAdviceSlip(deliveryForPrint, deliveryOrder);
        },
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : (msg || 'Failed to create delivery note'));
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleOpenPlanProduction = async (order: SalesOrder, item?: any) => {
    try {
      const res = await apiService.get<any>(`/sales/orders/${order.id}`);
      const full: SalesOrder = (res as any)?.data || res;
      setProdOrder(full);

      const fulfillmentMap = new Map<string, any>();
      if (Array.isArray((full as any).itemFulfillment)) {
        (full as any).itemFulfillment.forEach((f: any) => {
          fulfillmentMap.set(f.orderItemId, f);
        });
      }

      const orderItems = (full.items && full.items.length > 0) ? full.items : (order.items || []);
      const lines: ProdPlanningLine[] = orderItems.map((it: any, idx: number) => {
        const ful = fulfillmentMap.get(it.id);
        const ordered = Number(it.quantity || it.orderedQuantity || 0);
        const produced = Number(ful?.producedQuantity ?? it.producedQuantity ?? 0);
        const avail = Number(ful?.availableStock ?? 0);
        const shortage = Math.max(0, ordered - produced);
        const uom = it.uom?.code || it.uomCode || ful?.uom || 'GRS';
        const code = ful?.itemCode || it.item?.code || (it as any).itemCode || `SKU-${idx + 1}`;
        const desc = it.description || it.item?.name || `Product Line #${idx + 1}`;

        const isTarget = item ? it.id === item.id : true;
        const defaultPlanned = shortage > 0 ? shortage : (ordered > 0 ? ordered : 1);

        return {
          salesOrderItemId: it.id,
          itemId: it.itemId || it.item?.id,
          itemCode: code,
          description: desc,
          uom,
          orderedQuantity: ordered,
          producedQuantity: produced,
          availableStock: avail,
          shortageQuantity: shortage,
          plannedQuantity: defaultPlanned,
          selected: isTarget,
        };
      });

      setProdItemsList(lines);
      if (lines.length > 0) {
        setProdItem(lines[0]);
        setProdQuantity(lines[0].plannedQuantity);
      }
      setProdStartDate(dayjs().format('YYYY-MM-DD'));
      setProdEndDate(full.deliveryDate ? dayjs(full.deliveryDate).format('YYYY-MM-DD') : dayjs().add(7, 'day').format('YYYY-MM-DD'));
      setProductionModalVisible(true);
    } catch {
      message.error('Failed to load order details for production planning');
    }
  };

  const handleSubmitPlanProduction = async () => {
    if (!prodOrder) return;
    const selectedLines = prodItemsList.filter(l => l.selected && l.plannedQuantity > 0);
    if (selectedLines.length === 0) {
      message.error('Please select at least one item with planned quantity > 0');
      return;
    }
    setSubmittingAction(true);
    try {
      const createdOrders: string[] = [];
      for (const line of selectedLines) {
        const payload = {
          orderItemId: line.salesOrderItemId,
          salesOrderItemId: line.salesOrderItemId,
          plannedQuantity: Number(line.plannedQuantity),
          plannedStartDate: prodStartDate,
          plannedEndDate: prodEndDate,
          dueDate: prodEndDate,
        };
        const res = await apiService.post<any>(`/sales/orders/${prodOrder.id}/create-production-order`, payload);
        const created = (res as any)?.data || res;
        if (created?.orderNumber) {
          createdOrders.push(created.orderNumber);
        }
      }
      message.success(`Production Order(s) created: ${createdOrders.join(', ') || 'Successfully'}`);
      setProductionModalVisible(false);
      fetchData(page, pageSize);
      if (detailVisible && detailItem?.id === prodOrder.id) {
        handleViewDetail(prodOrder);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message;
      message.error(Array.isArray(msg) ? msg[0] : (msg || 'Failed to create production order'));
    } finally {
      setSubmittingAction(false);
    }
  };

  // Pixel-Perfect Multi-line Columns mirroring Invoices Design
  const columns: ColumnsType<SalesOrder> = [
    {
      title: 'Order Date / Dates',
      key: 'dates',
      width: 195,
      render: (_, record) => (
        <div className="inv-dates-cell" style={{ whiteSpace: 'nowrap' }}>
          <div className="inv-date-row" style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="badge-inv-date" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              <CalendarOutlined style={{ marginRight: 3 }} /> Order
            </span>
            <span className="inv-date-val" style={{ whiteSpace: 'nowrap', fontWeight: 700, fontSize: 12.5, color: 'var(--inv-text-primary, #0f172a)' }}>
              {record.orderDate ? dayjs(record.orderDate).format('DD-MMM-YYYY') : '-'}
            </span>
          </div>
          {record.deliveryDate && (
            <div className="inv-date-row" style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="badge-inv-due" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                <CarOutlined style={{ marginRight: 3 }} /> Delivery
              </span>
              <span className="inv-date-val" style={{ whiteSpace: 'nowrap', fontWeight: 600, fontSize: 12, color: 'var(--theme-accent, #0284c7)' }}>
                {dayjs(record.deliveryDate).format('DD-MMM-YYYY')}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Sales Order / SOC',
      key: 'order',
      width: 180,
      render: (_, record) => {
        return (
          <div className="inv-doc-cell" style={{ whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--theme-accent, #2563eb)', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
              {record.orderNumber}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, whiteSpace: 'nowrap' }}>
              <span style={{
                background: 'var(--inv-filter-card-bg, #f1f5f9)',
                color: 'var(--inv-text-secondary, #475569)',
                border: '1px solid var(--inv-filter-card-border, #cbd5e1)',
                borderRadius: 3,
                padding: '1px 6px',
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap'
              }}>
                {record.currency || 'PKR'}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Division',
      key: 'division',
      width: 160,
      render: (_, record) => {
        const div = record.division || divisions.find(d => d.id === record.divisionId);
        if (!div) return <span style={{ color: 'var(--inv-text-muted, #64748b)', fontSize: 12 }}>-</span>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--theme-accent, #0284c7)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
              <ApartmentOutlined style={{ marginRight: 4 }} />
              {div.name}
            </span>
            <div>
              <span style={{
                background: 'var(--inv-badge-customer-bg, #f0f9ff)',
                color: 'var(--inv-badge-customer-text, #0369a1)',
                border: '1px solid var(--inv-badge-customer-border, #bae6fd)',
                borderRadius: 3,
                padding: '1px 6px',
                fontSize: 10.5,
                fontFamily: 'monospace',
                fontWeight: 700,
                whiteSpace: 'nowrap'
              }}>
                {div.divisionCode}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Customer',
      key: 'customer',
      width: 260,
      render: (_, record) => {
        const c = record.customer;
        const custCode = c?.customerCode || (record as any).customerCode;
        const compName = c?.companyName || c?.name || record.companyName || record.customerName || 'Valued Customer';
        const phone = (c as any)?.phone || (record as any).phone;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, whiteSpace: 'nowrap' }}>
            <div 
              style={{ 
                fontWeight: 700, 
                fontSize: 13, 
                color: 'var(--inv-text-primary, #0f172a)', 
                whiteSpace: 'nowrap', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis' 
              }}
              title={compName}
            >
              {compName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
              {custCode && (
                <span style={{ 
                  background: 'var(--inv-filter-card-bg, #f1f5f9)', 
                  color: 'var(--inv-text-secondary, #1e293b)', 
                  border: '1px solid var(--inv-filter-card-border, #cbd5e1)', 
                  borderRadius: 3, 
                  padding: '1px 6px', 
                  fontSize: 10.5, 
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  whiteSpace: 'nowrap'
                }}>
                  <UserOutlined style={{ marginRight: 3, color: 'var(--inv-text-muted, #64748b)' }} />
                  {custCode}
                </span>
              )}
              {phone && (
                <span style={{ fontSize: 11, color: 'var(--inv-text-muted, #64748b)', whiteSpace: 'nowrap' }}>
                  {phone}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Items & Qty',
      key: 'itemsQty',
      width: 175,
      render: (_, record) => {
        const items = record.items || [];
        const itemCount = items.length;
        const totalQty = items.reduce((sum: number, it: any) => sum + Number(it.quantity || it.orderedQuantity || 0), 0);
        const deliveredQty = items.reduce((sum: number, it: any) => sum + Number(it.deliveredQuantity || 0), 0);
        const remainingQty = Math.max(0, totalQty - deliveredQty);
        const uoms = Array.from(new Set(items.map((it: any) => it.uom?.code || it.uomCode || 'GRS').filter(Boolean)));
        const uomLabel = uoms.length === 1 ? uoms[0] : (uoms.length > 1 ? uoms.join('/') : 'GRS');

        const tooltipContent = items.length > 0 ? (
          <div style={{ maxHeight: 340, overflowY: 'auto', padding: '2px', width: 380, maxWidth: '100%', boxSizing: 'border-box' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: 8,
              marginBottom: 8,
              borderBottom: '1px solid var(--inv-card-border, #e2e8f0)',
              fontWeight: 700,
              fontSize: 12,
              color: 'var(--inv-text-primary, #0f172a)',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AppstoreOutlined style={{ color: '#2563eb', fontSize: 13 }} />
                <span>Order Items Breakdown</span>
              </span>
              <span style={{
                background: 'var(--inv-badge-customer-bg, #eff6ff)',
                color: 'var(--inv-badge-customer-text, #1d4ed8)',
                padding: '1px 8px',
                borderRadius: 12,
                fontSize: 10.5,
                fontWeight: 700,
                border: '1px solid var(--inv-badge-customer-border, #bfdbfe)'
              }}>
                {items.length} {items.length === 1 ? 'Item' : 'Items'}
              </span>
            </div>
            {items.map((it: any, idx: number) => {
              const name = it.item?.name || it.description || `Item #${idx + 1}`;
              const code = it.item?.code || it.itemCode;
              const q = Number(it.quantity || it.orderedQuantity || 0);
              const del = Number(it.deliveredQuantity || 0);
              const bal = Math.max(0, q - del);
              const u = it.uom?.code || it.uomCode || uomLabel;
              return (
                <div
                  key={idx}
                  style={{
                    padding: '8px 10px',
                    marginBottom: 6,
                    background: 'var(--inv-table-row-even, #f8fafc)',
                    border: '1px solid var(--inv-table-border, #e2e8f0)',
                    borderRadius: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, overflow: 'hidden' }}>
                      <span style={{ color: '#2563eb', fontWeight: 800, fontSize: 11, flexShrink: 0 }}>#{idx + 1}</span>
                      <span style={{
                        fontWeight: 600,
                        color: 'var(--inv-text-primary, #1e293b)',
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }} title={name}>
                        {name}
                      </span>
                    </div>
                    {code && (
                      <span style={{
                        fontSize: 10,
                        background: 'var(--inv-badge-type-bg, #f3e8ff)',
                        color: 'var(--inv-badge-type-text, #7c3aed)',
                        border: '1px solid var(--inv-badge-type-border, #ddd6fe)',
                        borderRadius: 4,
                        padding: '0 5px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}>
                        {code}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, gap: 6 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--inv-badge-customer-text, #1e40af)',
                      background: 'var(--inv-badge-customer-bg, #eff6ff)',
                      border: '1px solid var(--inv-badge-customer-border, #bfdbfe)',
                      padding: '1px 7px',
                      borderRadius: 4,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}>
                      Qty: {formatNumber(q, 0)} {u}
                    </span>
                    {del > 0 ? (
                      <div style={{ display: 'flex', gap: 5, fontSize: 10.5, whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#16a34a', fontWeight: 700 }}>
                          Del: {formatNumber(del, 0)}
                        </span>
                        <span style={{ color: 'var(--inv-text-muted, #94a3b8)' }}>·</span>
                        <span style={{ color: bal > 0 ? '#ea580c' : '#16a34a', fontWeight: 700 }}>
                          Bal: {formatNumber(bal, 0)}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 10.5, color: 'var(--inv-text-muted, #64748b)', fontStyle: 'italic', whiteSpace: 'nowrap' }}>Pending Dispatch</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null;

        return (
          <Tooltip
            title={tooltipContent}
            placement="top"
            overlayStyle={{ maxWidth: 420 }}
            overlayInnerStyle={{
              backgroundColor: 'var(--inv-card-bg, #ffffff)',
              color: 'var(--inv-text-primary, #0f172a)',
              border: '1px solid var(--inv-card-border, #cbd5e1)',
              borderRadius: 10,
              padding: '10px 12px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
              maxWidth: 420,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, cursor: items.length > 0 ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  background: 'var(--inv-badge-customer-bg, #eff6ff)',
                  color: 'var(--inv-badge-customer-text, #1d4ed8)',
                  border: '1px solid var(--inv-badge-customer-border, #bfdbfe)',
                  borderRadius: 4,
                  padding: '1px 7px',
                  fontSize: 10.5,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  whiteSpace: 'nowrap'
                }}>
                  <AppstoreOutlined />
                  {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--inv-text-primary, #0f172a)', whiteSpace: 'nowrap' }}>
                {formatNumber(totalQty, 2)} <span style={{ fontSize: 11, color: 'var(--inv-text-muted, #64748b)', fontWeight: 600 }}>{uomLabel}</span>
              </div>
              {deliveredQty > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 1 }}>
                  <span style={{
                    background: 'var(--inv-badge-paid-bg, #ecfdf5)',
                    color: 'var(--inv-badge-paid-text, #059669)',
                    border: '1px solid var(--inv-badge-paid-border, #a7f3d0)',
                    borderRadius: 3,
                    padding: '0.5px 5px',
                    fontSize: 9.5,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    display: 'inline-block',
                    width: 'fit-content',
                  }}>
                    Delivered: {formatNumber(deliveredQty, 2)}
                  </span>
                  {remainingQty > 0 && (
                    <span style={{
                      background: 'var(--inv-badge-due-bg, #fff7ed)',
                      color: 'var(--inv-badge-due-text, #c2410c)',
                      border: '1px solid var(--inv-badge-due-border, #fed7aa)',
                      borderRadius: 3,
                      padding: '0.5px 5px',
                      fontSize: 9.5,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      display: 'inline-block',
                      width: 'fit-content',
                    }}>
                      Remaining: {formatNumber(remainingQty, 2)} {uomLabel}
                    </span>
                  )}
                </div>
              )}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: 'Amounts',
      key: 'amounts',
      width: 215,
      render: (_, record) => {
        const curr = record.currency || 'PKR';
        return (
          <div className="inv-amounts-cell" style={{ whiteSpace: 'nowrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 11, color: 'var(--inv-text-muted, #64748b)', fontWeight: 600 }}>Subtotal:</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--inv-text-primary, #334155)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {curr} {formatNumber(record.subtotal || 0, 2)}
              </span>
            </div>
            {Number(record.discountAmount || 0) > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 11, color: '#ea580c', fontWeight: 600 }}>Discount:</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#ea580c', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  -{formatNumber(record.discountAmount, 2)}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 11, color: 'var(--inv-text-muted, #64748b)', fontWeight: 600 }}>Tax:</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--inv-text-primary, #334155)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {curr} {formatNumber(record.taxAmount || 0, 2)}
              </span>
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              gap: 8, 
              marginTop: 3, 
              paddingTop: 4, 
              borderTop: '1px dashed var(--inv-table-border, #cbd5e1)', 
              whiteSpace: 'nowrap' 
            }}>
              <span style={{ 
                fontSize: 11, 
                fontWeight: 800, 
                background: 'var(--inv-badge-paid-bg, #dcfce7)', 
                color: 'var(--inv-badge-paid-text, #15803d)', 
                border: '1px solid var(--inv-badge-paid-border, #bbf7d0)',
                padding: '1px 6px', 
                borderRadius: 3, 
                whiteSpace: 'nowrap' 
              }}>
                Total
              </span>
              <span style={{ 
                fontSize: 13.5, 
                fontWeight: 800, 
                color: '#10b981', 
                fontVariantNumeric: 'tabular-nums', 
                whiteSpace: 'nowrap' 
              }}>
                {curr} {formatNumber(record.totalAmount || 0, 2)}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 130,
      align: 'center',
      render: (_, record) => {
        const s = (record.status || '').toLowerCase();
        let cls = 'status-pending';
        if (s === 'delivered' || s === 'closed') cls = 'status-paid';
        else if (s === 'confirmed' || s === 'processing' || s === 'shipped') cls = 'status-partial';
        else if (s === 'cancelled') cls = 'status-cancelled';

        return (
          <span className={`inv-status-pill ${cls}`}>
            {record.status}
          </span>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 270,
      align: 'center',
      render: (_, record) => {
        const s = (record.status || '').toLowerCase();
        return (
          <div className="inv-actions-wrapper">
            <Tooltip title="View Details">
              <button className="inv-action-btn inv-btn-view" onClick={() => handleViewDetail(record)}>
                <EyeOutlined />
              </button>
            </Tooltip>
            <Tooltip title="Print Order">
              <button className="inv-action-btn inv-btn-print" onClick={() => printSalesOrderDocument(record)}>
                <PrinterOutlined />
              </button>
            </Tooltip>
            {canUpdate && (
              <Tooltip title="Edit Order">
                <button
                  className="inv-action-btn inv-btn-edit"
                  onClick={() => handleEdit(record)}
                  disabled={s !== 'draft'}
                >
                  <EditOutlined />
                </button>
              </Tooltip>
            )}
            {s === 'draft' && canApprove && (
              <Tooltip title="Confirm Order">
                <button
                  className="inv-action-btn inv-btn-pay"
                  style={{ backgroundColor: '#2563eb', color: '#fff' }}
                  onClick={() => confirmWorkflowAction(record, 'confirm', 'Confirm Order', '#2563eb')}
                >
                  <CheckOutlined />
                </button>
              </Tooltip>
            )}
            {s === 'confirmed' && canApprove && (
              <Tooltip title="Process Order">
                <button
                  className="inv-action-btn inv-btn-pay"
                  style={{ backgroundColor: '#0284c7', color: '#fff' }}
                  onClick={() => confirmWorkflowAction(record, 'process', 'Start Processing', '#0284c7')}
                >
                  <InboxOutlined />
                </button>
              </Tooltip>
            )}
            {['confirmed', 'processing'].includes(s) && canUpdate && (
              <Tooltip title="Plan Production (MRP Requirement)">
                <button
                  className="inv-action-btn"
                  style={{ backgroundColor: '#8b5cf6', color: '#fff' }}
                  onClick={() => handleOpenPlanProduction(record)}
                >
                  <BuildOutlined />
                </button>
              </Tooltip>
            )}
            {['confirmed', 'processing'].includes(s) && canUpdate && (
              <Tooltip title="Create Delivery Note / Loading Advice (Dispatch)">
                <button
                  className="inv-action-btn"
                  style={{ backgroundColor: '#059669', color: '#fff' }}
                  onClick={() => handleOpenCreateDelivery(record)}
                >
                  <SendOutlined />
                </button>
              </Tooltip>
            )}
            {s === 'processing' && canApprove && (
              <Tooltip title="Ship Order">
                <button
                  className="inv-action-btn inv-btn-pay"
                  style={{ backgroundColor: '#3b82f6', color: '#fff' }}
                  onClick={() => confirmWorkflowAction(record, 'ship', 'Ship Order', '#3b82f6')}
                >
                  <CarOutlined />
                </button>
              </Tooltip>
            )}
            {s === 'shipped' && canApprove && (
              <Tooltip title="Mark Delivered">
                <button
                  className="inv-action-btn inv-btn-pay"
                  style={{ backgroundColor: '#10b981', color: '#fff' }}
                  onClick={() => confirmWorkflowAction(record, 'deliver', 'Mark Delivered', '#10b981')}
                >
                  <CheckCircleOutlined />
                </button>
              </Tooltip>
            )}
            {s === 'delivered' && canApprove && (
              <Tooltip title="Close Order">
                <button
                  className="inv-action-btn inv-btn-pay"
                  style={{ backgroundColor: '#16a34a', color: '#fff' }}
                  onClick={() => confirmWorkflowAction(record, 'close', 'Close Order', '#16a34a')}
                >
                  <CheckOutlined />
                </button>
              </Tooltip>
            )}
            {s !== 'cancelled' && s !== 'closed' && canApprove && (
              <Tooltip title="Cancel Order">
                <button
                  className="inv-action-btn inv-btn-cancel"
                  onClick={() => confirmWorkflowAction(record, 'cancel', 'Cancel Order', '#ef4444')}
                >
                  <StopOutlined />
                </button>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  // Pagination calculation
  const totalEntries = total > 0 ? total : displayedOrders.length;
  const startEntry = totalEntries === 0 ? 0 : (page - 1) * pageSize + 1;
  const endEntry = Math.min(page * pageSize, totalEntries);
  const totalPages = Math.ceil(totalEntries / pageSize) || 1;

  return (
    <div className="inv-page-container">
      {/* Main Card */}
      <div className="inv-main-card">
        {/* Card Header Title */}
        <div className="inv-card-header">
          <ShoppingCartOutlined className="inv-card-header-icon" />
          <h2 className="inv-card-header-title">Sales Orders</h2>
        </div>

        {/* Authoritative Action KPI Metric Cards for Sales Orders */}
        <div className="pipeline-grid-5" style={{ marginBottom: 18 }}>
          <div
            className="action-kpi-card"
            style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)', cursor: 'pointer' }}
            onClick={() => setActiveChevron('ALL')}
          >
            <div className="action-kpi-body">
              <div className="action-kpi-val">{formatNumber(kpiMetrics.totalOrdersCount, 0)}</div>
              <div className="action-kpi-label">Total Sales Orders / SOCs</div>
              <div className="action-kpi-watermark"><ShoppingCartOutlined /></div>
            </div>
            <div className="action-kpi-footer">
              <span>All Booked Orders</span>
              <RightCircleOutlined style={{ fontSize: 13 }} />
            </div>
          </div>

          <div
            className="action-kpi-card"
            style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}
          >
            <div className="action-kpi-body">
              <div className="action-kpi-val">
                {formatNumber(kpiMetrics.totalDemandQty, 2)} <span style={{ fontSize: 13, opacity: 0.85 }}>GRS</span>
              </div>
              <div className="action-kpi-label">Total Demand Quantity</div>
              <div className="action-kpi-watermark"><AppstoreOutlined /></div>
            </div>
            <div className="action-kpi-footer">
              <span>Customer Order Demand</span>
            </div>
          </div>

          <div
            className="action-kpi-card"
            style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}
          >
            <div className="action-kpi-body">
              <div className="action-kpi-val">
                {formatNumber(kpiMetrics.totalDeliveredQty, 2)} <span style={{ fontSize: 13, opacity: 0.85 }}>GRS</span>
              </div>
              <div className="action-kpi-label">Dispatched Quantity</div>
              <div className="action-kpi-watermark"><SendOutlined /></div>
            </div>
            <div className="action-kpi-footer">
              <span>{kpiMetrics.dispatchPercentage}% Dispatched</span>
            </div>
          </div>

          <div
            className="action-kpi-card"
            style={{ background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' }}
          >
            <div className="action-kpi-body">
              <div className="action-kpi-val">
                {formatNumber(kpiMetrics.remainingBalanceQty, 2)} <span style={{ fontSize: 13, opacity: 0.85 }}>GRS</span>
              </div>
              <div className="action-kpi-label">Remaining Balance Qty</div>
              <div className="action-kpi-watermark"><ClockCircleOutlined /></div>
            </div>
            <div className="action-kpi-footer">
              <span>{kpiMetrics.balancePercentage}% Balance to Deliver</span>
            </div>
          </div>

          <div
            className="action-kpi-card"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)' }}
          >
            <div className="action-kpi-body">
              <div className="action-kpi-val" style={{ fontSize: 20 }}>
                <span style={{ fontSize: 14, opacity: 0.85, marginRight: 4 }}>PKR</span>
                {formatNumber(kpiMetrics.totalGrossAmount, 0)}
              </div>
              <div className="action-kpi-label">Gross Order Value</div>
              <div className="action-kpi-watermark"><DollarOutlined /></div>
            </div>
            <div className="action-kpi-footer">
              <span>Total Commercial Bookings</span>
            </div>
          </div>
        </div>

        {/* Process Chevron Ribbon (True Interlocking Arrow Pipeline) */}
        <div className="inv-chevron-ribbon">
          <div
            className={`inv-chevron-item chev-all ${activeChevron === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveChevron('ALL')}
          >
            ALL ({chevronCounts.all})
          </div>
          <div
            className={`inv-chevron-item chev-pending ${activeChevron === 'DRAFT' ? 'active' : ''}`}
            onClick={() => setActiveChevron('DRAFT')}
          >
            DRAFT ({chevronCounts.draft})
          </div>
          <div
            className={`inv-chevron-item chev-partial ${activeChevron === 'PROCESSING' ? 'active' : ''}`}
            onClick={() => setActiveChevron('PROCESSING')}
          >
            PROCESSING ({chevronCounts.processing})
          </div>
          <div
            className={`inv-chevron-item chev-paid ${activeChevron === 'DELIVERED' ? 'active' : ''}`}
            onClick={() => setActiveChevron('DELIVERED')}
          >
            DELIVERED ({chevronCounts.delivered})
          </div>
          <div
            className={`inv-chevron-item chev-cancelled ${activeChevron === 'CANCELLED' ? 'active' : ''}`}
            onClick={() => setActiveChevron('CANCELLED')}
          >
            CANCELLED ({chevronCounts.cancelled})
          </div>
        </div>

        {/* Distinctive Mint Green Accent Line */}
        <div className="inv-mint-accent-line" />

        {/* Controls Row: Search Bar & Unified Filters Button & Show Entries */}
        <div className="inv-controls-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="inv-search-control" style={{ flex: '1 1 240px', maxWidth: 360 }}>
            <Input
              className="inv-search-input"
              placeholder="Search orders, customer..."
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={() => fetchData(1, pageSize)}
              allowClear
            />
          </div>

          {/* Single Unified "Filters" Button */}
          <Button
            icon={<FilterOutlined />}
            onClick={() => setFiltersCollapsed((prev) => !prev)}
            type={!filtersCollapsed ? 'primary' : 'default'}
            style={{ fontWeight: 600 }}
          >
            Filters
            {activeFilterCount > 0 && (
              <Badge
                count={activeFilterCount}
                style={{
                  marginLeft: 6,
                  backgroundColor: !filtersCollapsed ? '#ffffff' : 'var(--theme-primary, #3b82f6)',
                  color: !filtersCollapsed ? 'var(--theme-primary, #3b82f6)' : '#ffffff',
                }}
              />
            )}
          </Button>

          <div style={{ flex: 1 }} />

          <div className="inv-entries-control">
            <span>Show</span>
            <Select
              className="inv-entries-select"
              value={pageSize}
              onChange={(val) => { setPageSize(val); setPage(1); }}
            >
              <Select.Option value={10}>10</Select.Option>
              <Select.Option value={25}>25</Select.Option>
              <Select.Option value={50}>50</Select.Option>
              <Select.Option value={100}>100</Select.Option>
            </Select>
            <span>entries</span>
          </div>
        </div>

        {/* Collapsible Panel with ALL Filters */}
        {!filtersCollapsed && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: '12px 14px',
              background: 'var(--theme-surface-subtle, rgba(0, 0, 0, 0.02))',
              border: '1px solid var(--theme-border, #e2e8f0)',
              borderRadius: 8,
              marginBottom: 14,
            }}
          >
            {/* Header: Title + Active Count + Close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed var(--theme-border, #e2e8f0)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FilterOutlined style={{ color: 'var(--theme-primary, #3b82f6)', fontSize: 14 }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #1e293b)' }}>
                  Filter Sales Orders
                </span>
                {activeFilterCount > 0 && (
                  <Tag color="blue" style={{ margin: 0, borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                    {activeFilterCount} Active
                  </Tag>
                )}
              </div>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => setFiltersCollapsed(true)}
                style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 12 }}
                title="Close Filters"
              >
                Close
              </Button>
            </div>

            {/* Grid of the 6 Filter Boxes */}
            <div className="inv-filter-boxes-grid">
              {/* Box 1: DIVISION */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <ApartmentOutlined /> DIVISION
                </div>
                <Select
                  placeholder="All divisions"
                  allowClear
                  className="inv-filter-box-select"
                  value={filterDivision}
                  onChange={(val) => setFilterDivision(val)}
                >
                  {divisions.map(d => (
                    <Select.Option key={d.id} value={d.id}>{d.name} ({d.divisionCode})</Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 2: CURRENCY */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <DollarOutlined /> CURRENCY
                </div>
                <Select
                  placeholder="All currencies"
                  allowClear
                  className="inv-filter-box-select"
                  value={filterCurrency}
                  onChange={(val) => setFilterCurrency(val)}
                >
                  {availableCurrencies.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 3: CUSTOMER */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <UserOutlined /> CUSTOMER
                </div>
                <Select
                  placeholder={filterDivision ? "Customers of selected division" : "All customers"}
                  allowClear
                  showSearch
                  optionFilterProp="children"
                  className="inv-filter-box-select"
                  value={filterCustomer}
                  onChange={(val) => setFilterCustomer(val)}
                >
                  {customers
                    .filter(c => !filterDivision || c.divisionId === filterDivision)
                    .map(c => (
                      <Select.Option key={c.id} value={c.id}>
                        {c.customerCode ? `[${c.customerCode}] ` : ''}{c.companyName || c.name}
                      </Select.Option>
                    ))}
                </Select>
              </div>

              {/* Box 4: STATUS */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <CheckOutlined /> STATUS
                </div>
                <Select
                  placeholder="All statuses"
                  allowClear
                  className="inv-filter-box-select"
                  value={filterStatus}
                  onChange={(val) => setFilterStatus(val)}
                >
                  {STATUS_OPTIONS.map(s => (
                    <Select.Option key={s} value={s}>{s}</Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 5: DATE FROM */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <CalendarOutlined /> DATE FROM
                </div>
                <Input
                  type="date"
                  className="inv-filter-date"
                  value={filterDateFrom || ''}
                  onChange={(e) => setFilterDateFrom(e.target.value || undefined)}
                />
              </div>

              {/* Box 6: DATE TO */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <CalendarOutlined /> DATE TO
                </div>
                <Input
                  type="date"
                  className="inv-filter-date"
                  value={filterDateTo || ''}
                  onChange={(e) => setFilterDateTo(e.target.value || undefined)}
                />
              </div>
            </div>

            {/* Footer with Clear Filters and Apply Filters inside */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                paddingTop: 8,
                borderTop: '1px solid var(--theme-border, #e2e8f0)',
              }}
            >
              <Button
                icon={<ClearOutlined />}
                onClick={handleClearAll}
                danger={activeFilterCount > 0}
              >
                Clear Filters
              </Button>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setFiltersCollapsed(true)}>
                  Close
                </Button>
                <Button
                  type="primary"
                  icon={<FilterOutlined />}
                  onClick={() => {
                    fetchData(1, pageSize);
                    setFiltersCollapsed(true);
                  }}
                  loading={loading}
                  style={{ fontWeight: 600 }}
                >
                  Apply Filters
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Custom ERP Table */}
        <Table
          columns={columns}
          dataSource={displayedOrders}
          rowKey="id"
          loading={loading}
          pagination={false}
          className="inv-custom-table"
          scroll={{ x: 1550 }}
        />

        {/* Custom Pagination Footer */}
        <div className="inv-pagination-footer">
          <div className="inv-pagination-info">
            Showing {startEntry} to {endEntry} of {totalEntries} entries
          </div>
          <div className="inv-pagination-buttons">
            <button
              className="inv-page-btn"
              disabled={page <= 1}
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <span className="inv-page-indicator">
              Page {page} of {totalPages}
            </span>
            <button
              className="inv-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Create / Edit Order Modal */}
      <DraggableResizableModal
        title={editingItem ? `Edit Sales Order / SOC: ${editingItem.orderNumber}` : 'Create Sales Order / SOC'}
        open={modalVisible}
        onOk={handleSubmitForm}
        onCancel={() => {
          setModalVisible(false);
          setEditingItem(null);
          setLineItems([]);
        }}
        width={1180}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item 
                name="socNumber" 
                label={
                  <span style={{ fontWeight: 600 }}>
                    SOC Number <span style={{ color: '#ef4444' }}>*</span>
                  </span>
                } 
                rules={[{ required: true, message: 'Please enter SOC sequence number' }]}
                tooltip="Prefix 'SOC-' is automatic. You can customize or keep the auto-generated sequence number."
              >
                <Input
                  addonBefore={<span style={{ fontWeight: 700, color: '#2563eb' }}>SOC-</span>}
                  placeholder="e.g. 2026-00011"
                  style={{ fontWeight: 600 }}
                  disabled={Boolean(editingItem)}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item 
                name="divisionId" 
                label="Manufacturing / Dispatch Division" 
                rules={[{ required: true, message: 'Please select division' }]}
              >
                <Select
                  placeholder="Select division (Spoke, Control Cable, E-51, NB)"
                  options={divisions.map(d => ({ value: d.id, label: `${d.name} (${d.divisionCode})` }))}
                  onChange={(val) => {
                    const prev = selectedDivision;
                    setSelectedDivision(val);
                    form.setFieldsValue({ sectionId: undefined, customerId: undefined });
                    if (prev && val !== prev && lineItems.length > 0) {
                      setLineItems([]);
                      message.info('Division changed: line items and customer reset to match selected division.');
                    }
                  }}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sectionId" label="Production Section (Optional)">
                <Select
                  placeholder="Select section"
                  allowClear
                  options={sections
                    .filter(s => !selectedDivision || s.divisionId === selectedDivision)
                    .map(s => ({ value: s.id, label: `${s.name} (${s.sectionCode || ''})` }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item 
                name="customerId" 
                label={
                  <span>
                    Customer <span style={{ color: '#ef4444' }}>*</span>
                    {selectedDivision && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#059669', fontWeight: 600 }}>
                        (Filtered: {divisions.find(d => d.id === selectedDivision)?.name || 'Selected Division'})
                      </span>
                    )}
                  </span>
                } 
                rules={[{ required: true, message: 'Please select customer' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={selectedDivision ? "Select customer for this division..." : "⚠️ Please select Manufacturing / Dispatch Division first"}
                  disabled={!selectedDivision && !editingItem}
                  notFoundContent={selectedDivision ? "No customers found for this division" : "Select Division first"}
                  options={customers
                    .filter(c => {
                      if (!selectedDivision) return false;
                      return c.divisionId === selectedDivision;
                    })
                    .map((c) => ({ 
                      value: c.id, 
                      label: `${c.customerCode ? `[${c.customerCode}] ` : ''}${c.companyName || c.name}` 
                    }))}
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="currency" label="Currency">
                <Select
                  options={[
                    { value: 'PKR', label: 'PKR — Pakistani Rupee' },
                    { value: 'USD', label: 'USD — US Dollar' },
                    { value: 'EUR', label: 'EUR — Euro' },
                    { value: 'GBP', label: 'GBP — British Pound' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="orderDate" label="Order Date" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="deliveryDate" label="Expected Delivery Date">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="shipToAddress" label="Ship-To Delivery Address">
                <Input.TextArea rows={2} placeholder="Factory / Site destination address" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="billToAddress" label="Bill-To Billing Address">
                <Input.TextArea rows={2} placeholder="Head office / billing address" />
              </Form.Item>
            </Col>
          </Row>
          <ERPLineItems 
            companyId={companyId} 
            value={lineItems} 
            onChange={setLineItems} 
            showWarehouse={false} 
            label="Order Line Items" 
            currency={form.getFieldValue('currency') || 'PKR'} 
            divisionId={selectedDivision}
            defaultItemType="FINISHED_GOOD"
            context="sales"
            customerId={selectedCustomerId}
            orderId={editingItem?.id}
          />
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={6}>
              <Form.Item name="discountAmount" label="Discount">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="taxAmount" label="Tax">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="freightAmount" label="Freight / Transport">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="totalAmount" label="Total (Auto)">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} disabled />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Terms & Special Instructions">
            <Input.TextArea rows={3} placeholder="Add production notes, payment terms, or delivery specs..." />
          </Form.Item>
        </Form>
      </DraggableResizableModal>

      {/* Detail Modal with Full ERP Document Traceability */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingCartOutlined style={{ color: '#2563eb' }} />
            <span>Sales Order Confirmation (SOC Details): {detailItem?.orderNumber}</span>
          </div>
        }
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          ['confirmed', 'processing'].includes((detailItem?.status || '').toLowerCase()) && (
            <Button
              key="planProd"
              icon={<BuildOutlined />}
              style={{ backgroundColor: '#8b5cf6', borderColor: '#8b5cf6', color: '#fff' }}
              onClick={() => detailItem && handleOpenPlanProduction(detailItem)}
            >
              Plan Production
            </Button>
          ),
          ['confirmed', 'processing'].includes((detailItem?.status || '').toLowerCase()) && (
            <Button
              key="createDel"
              type="primary"
              icon={<SendOutlined />}
              style={{ backgroundColor: '#059669', borderColor: '#059669' }}
              onClick={() => detailItem && handleOpenCreateDelivery(detailItem)}
            >
              Create Delivery Note
            </Button>
          ),
          <Button key="print" icon={<PrinterOutlined />} type="default" onClick={() => detailItem && printSalesOrderDocument(detailItem)}>
            Print SOC Document
          </Button>,
          <Button key="close" onClick={() => setDetailVisible(false)}>
            Close
          </Button>,
        ]}
        width={1020}
      >
        {detailItem && (
          <>
            {/* Document Traceability Chain */}
            <div className="doc-traceability-banner">
              <div className="doc-traceability-title">
                <BranchesOutlined style={{ color: '#2563eb' }} />
                <span>Document Traceability Pipeline</span>
              </div>
              <Row gutter={[12, 10]}>
                <Col span={6}>
                  <div className="doc-traceability-step">
                    <div className="doc-step-label">1. ORIGINATING QUOTATION</div>
                    <div className="doc-step-val" style={{ color: detailItem.relatedQuotation ? '#38bdf8' : 'var(--inv-text-muted, #94a3b8)' }}>
                      {detailItem.relatedQuotation?.quotationNumber || 'Direct Order'}
                    </div>
                    {detailItem.relatedQuotation && (
                      <div className="doc-step-sub" style={{ color: '#10b981' }}>
                        Rs {formatDecimal(detailItem.relatedQuotation.totalAmount || 0)}
                      </div>
                    )}
                  </div>
                </Col>
                <Col span={6}>
                  <div className="doc-traceability-step active-step">
                    <div className="doc-step-label" style={{ color: '#38bdf8' }}>2. SALES ORDER CONFIRMATION (SOC)</div>
                    <div className="doc-step-val" style={{ color: '#60a5fa' }}>{detailItem.orderNumber}</div>
                    <div className="doc-step-sub" style={{ color: '#38bdf8' }}>
                      {detailItem.currency || 'PKR'} {formatDecimal(detailItem.totalAmount || 0)}
                    </div>
                  </div>
                </Col>
                <Col span={6}>
                  <div className="doc-traceability-step">
                    <div className="doc-step-label">3. PRODUCTION ORDERS</div>
                    {detailItem.linkedProductionOrders && detailItem.linkedProductionOrders.length > 0 ? (
                      detailItem.linkedProductionOrders.map((po) => (
                        <div key={po.id} className="doc-step-val" style={{ color: '#a78bfa', fontSize: 12 }}>
                          {po.orderNumber} ({po.completedQuantity}/{po.plannedQuantity})
                        </div>
                      ))
                    ) : (
                      <div className="doc-step-sub" style={{ color: 'var(--inv-text-muted, #94a3b8)' }}>Pending Planning</div>
                    )}
                  </div>
                </Col>
                <Col span={6}>
                  <div className="doc-traceability-step">
                    <div className="doc-step-label">4. DELIVERIES / INVOICES</div>
                    {detailItem.linkedDeliveries && detailItem.linkedDeliveries.length > 0 ? (
                      detailItem.linkedDeliveries.map((dn) => (
                        <div key={dn.id} className="doc-step-val" style={{ color: '#34d399', fontSize: 12 }}>
                          {dn.deliveryNumber} [{dn.status}]
                        </div>
                      ))
                    ) : (
                      <div className="doc-step-sub" style={{ color: 'var(--inv-text-muted, #94a3b8)' }}>No Deliveries Yet</div>
                    )}
                    {detailItem.linkedInvoices && detailItem.linkedInvoices.length > 0 && (
                      detailItem.linkedInvoices.map((inv) => (
                        <div key={inv.id} className="doc-step-val" style={{ color: '#fb923c', fontSize: 12 }}>
                          {inv.invoiceNumber} [{inv.status}]
                        </div>
                      ))
                    )}
                  </div>
                </Col>
              </Row>
            </div>

            {/* Executive KPI Summary Strip */}
            <div className="modal-kpi-summary-strip">
              <div className="modal-kpi-box">
                <span className="modal-kpi-label">Customer</span>
                <span className="modal-kpi-val" style={{ color: '#60a5fa' }}>
                  {getCustomerDisplayName(detailItem)}
                </span>
              </div>
              <div className="modal-kpi-box">
                <span className="modal-kpi-label">Division</span>
                <span className="modal-kpi-val" style={{ color: '#a855f7' }}>
                  {detailItem.division?.divisionCode || detailItem.division?.name || divisions.find(d => d.id === detailItem.divisionId)?.divisionCode || 'General'}
                </span>
              </div>
              <div className="modal-kpi-box">
                <span className="modal-kpi-label">Order Date</span>
                <span className="modal-kpi-val">
                  {detailItem.orderDate ? dayjs(detailItem.orderDate).format('MMM DD, YYYY') : '-'}
                </span>
              </div>
              <div className="modal-kpi-box">
                <span className="modal-kpi-label">Expected Delivery</span>
                <span className="modal-kpi-val" style={{ color: '#f59e0b' }}>
                  {detailItem.deliveryDate ? dayjs(detailItem.deliveryDate).format('MMM DD, YYYY') : '-'}
                </span>
              </div>
              <div className="modal-kpi-box">
                <span className="modal-kpi-label">Total Items</span>
                <span className="modal-kpi-val">
                  {detailItem.items?.length || 0} Line Items
                </span>
              </div>
              <div className="modal-kpi-box">
                <span className="modal-kpi-label">Grand Total</span>
                <span className="modal-kpi-val" style={{ color: '#10b981', fontSize: 16 }}>
                  {detailItem.currency || 'PKR'} {formatDecimal(detailItem.totalAmount || 0)}
                </span>
              </div>
            </div>

            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="SOC #">{detailItem.orderNumber}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <span className={`inv-status-pill ${['delivered', 'closed'].includes(detailItem.status?.toLowerCase()) ? 'status-paid' : 'status-pending'}`}>
                  {detailItem.status}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Customer">
                {getCustomerDisplayName(detailItem)}
              </Descriptions.Item>
              <Descriptions.Item label="Division">
                {detailItem.division?.name || divisions.find(d => d.id === detailItem.divisionId)?.name || 'General / All Divisions'}
              </Descriptions.Item>
              <Descriptions.Item label="Section">
                {detailItem.section?.name || sections.find(s => s.id === detailItem.sectionId)?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Currency">{detailItem.currency || 'PKR'}</Descriptions.Item>
              <Descriptions.Item label="Order Date">{detailItem.orderDate || '-'}</Descriptions.Item>
              <Descriptions.Item label="Delivery Date">{detailItem.deliveryDate || '-'}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">{detailItem.currency || 'Rs'} {formatDecimal(detailItem.subtotal)}</Descriptions.Item>
              <Descriptions.Item label="Discount">{detailItem.currency || 'Rs'} {formatDecimal(detailItem.discountAmount)}</Descriptions.Item>
              <Descriptions.Item label="Tax">{detailItem.currency || 'Rs'} {formatDecimal(detailItem.taxAmount)}</Descriptions.Item>
              <Descriptions.Item label="Freight">{detailItem.currency || 'Rs'} {formatDecimal(detailItem.freightAmount)}</Descriptions.Item>
              <Descriptions.Item label="Total Amount" span={2}>
                <span style={{ fontWeight: 800, fontSize: 16, color: '#16a34a' }}>
                  {detailItem.currency || 'Rs'} {formatDecimal(detailItem.totalAmount)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Notes" span={2}>{detailItem.notes || '-'}</Descriptions.Item>
            </Descriptions>

            {detailItem.items && detailItem.items.length > 0 && (
              <>
                <Divider orientation="left" style={{ margin: '16px 0 10px' }}>
                  Fulfillment & Finished Goods Inventory Breakdown
                </Divider>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={detailItem.items}
                  columns={[
                    {
                      title: 'Item Description',
                      dataIndex: 'description',
                      key: 'description',
                      render: (desc, r) => (
                        <div>
                          <div style={{ fontWeight: 600 }}>{desc}</div>
                          {r.itemCode && <div style={{ fontSize: 11, color: '#64748b' }}>Code: {r.itemCode}</div>}
                        </div>
                      ),
                    },
                    {
                      title: 'Ordered',
                      dataIndex: 'quantity',
                      key: 'quantity',
                      width: 85,
                      align: 'right',
                      render: (v) => formatDecimal(v),
                    },
                    {
                      title: 'Produced',
                      dataIndex: 'producedQuantity',
                      key: 'producedQuantity',
                      width: 85,
                      align: 'right',
                      render: (v) => <span style={{ color: '#7c3aed', fontWeight: 600 }}>{formatDecimal(v || 0)}</span>,
                    },
                    {
                      title: 'FG Available',
                      dataIndex: 'availableStock',
                      key: 'availableStock',
                      width: 95,
                      align: 'right',
                      render: (v) => (
                        <span style={{ color: Number(v || 0) > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {formatDecimal(v || 0)}
                        </span>
                      ),
                    },
                    {
                      title: 'Delivered',
                      dataIndex: 'deliveredQuantity',
                      key: 'deliveredQuantity',
                      width: 85,
                      align: 'right',
                      render: (v) => <span style={{ color: '#059669', fontWeight: 600 }}>{formatDecimal(v || 0)}</span>,
                    },
                    {
                      title: 'Remaining',
                      dataIndex: 'remainingDeliveryQuantity',
                      key: 'remainingDeliveryQuantity',
                      width: 90,
                      align: 'right',
                      render: (v, r) => {
                        const rem = v !== undefined ? Number(v) : (Number(r.quantity || 0) - Number(r.deliveredQuantity || 0));
                        return <span style={{ color: rem > 0 ? '#ea580c' : '#64748b', fontWeight: 700 }}>{formatDecimal(rem)}</span>;
                      },
                    },
                    {
                      title: 'Unit Price',
                      dataIndex: 'unitPrice',
                      key: 'unitPrice',
                      width: 100,
                      align: 'right',
                      render: (v) => `${detailItem.currency || 'Rs'} ${formatDecimal(v)}`,
                    },
                    {
                      title: 'Line Total',
                      dataIndex: 'lineTotal',
                      key: 'lineTotal',
                      width: 110,
                      align: 'right',
                      render: (v) => `${detailItem.currency || 'Rs'} ${formatDecimal(v)}`,
                    },
                  ]}
                />
              </>
            )}
          </>
        )}
      </DraggableResizableModal>

      {/* Downstream Workflow: Create Loading Advice / Delivery Note Modal */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SendOutlined style={{ color: '#059669' }} />
            <span>Create Loading Advice / Delivery Note — Order #{deliveryOrder?.orderNumber}</span>
          </div>
        }
        open={deliveryModalVisible}
        onOk={handleSubmitCreateDelivery}
        confirmLoading={submittingAction}
        onCancel={() => setDeliveryModalVisible(false)}
        width={920}
        okText="Generate Loading Advice"
      >
        <Form layout="vertical">
          <div style={{
            display: 'flex',
            gap: 16,
            marginBottom: 14,
            padding: '10px 14px',
            background: 'var(--inv-filter-card-bg, rgba(255,255,255,0.04))',
            border: '1px solid var(--inv-filter-card-border, #e2e8f0)',
            borderRadius: 8,
            fontSize: 12.5,
            color: 'var(--inv-text-primary, inherit)'
          }}>
            <div><strong>Customer:</strong> {deliveryOrder?.customer?.name || deliveryOrder?.companyName || 'Valued Customer'}</div>
            <div><strong>Order Date:</strong> {deliveryOrder?.orderDate ? dayjs(deliveryOrder.orderDate).format('DD-MMM-YYYY') : '-'}</div>
            <div><strong>Target Delivery:</strong> {deliveryOrder?.deliveryDate ? dayjs(deliveryOrder.deliveryDate).format('DD-MMM-YYYY') : '-'}</div>
            <div><strong>Currency:</strong> {deliveryOrder?.currency || 'PKR'}</div>
          </div>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Dispatch Warehouse" required>
                <Select
                  value={deliveryWarehouseId}
                  onChange={setDeliveryWarehouseId}
                  placeholder="Select source warehouse"
                  options={warehouses.map(w => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Delivery Date" required>
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Transporter / Carrier">
                <Input
                  value={deliveryCarrier}
                  onChange={(e) => setDeliveryCarrier(e.target.value)}
                  placeholder="e.g. Faisal Movers / Self Truck / Cargo"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Vehicle # / Bilty #">
                <Input
                  value={deliveryTracking}
                  onChange={(e) => setDeliveryTracking(e.target.value)}
                  placeholder="e.g. LES-4512 / BL-89124"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Dispatch Remarks / Gate Pass Instructions">
            <Input.TextArea
              rows={2}
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="Delivery instructions, driver contact, etc..."
            />
          </Form.Item>

          <Divider orientation="left" style={{ margin: '14px 0 10px' }}>
            Line Items to Dispatch (Max = Remaining Balance)
          </Divider>
          <Table
            rowKey="salesOrderItemId"
            size="small"
            pagination={false}
            dataSource={deliveryItems}
            columns={[
              {
                title: 'Item Description',
                key: 'desc',
                render: (_, r) => (
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--inv-text-primary, #0f172a)' }}>{r.description}</div>
                    {r.itemCode && <div style={{ fontSize: 11, color: 'var(--inv-text-muted, #64748b)' }}>Code: {r.itemCode}</div>}
                  </div>
                ),
              },
              {
                title: 'Demand',
                dataIndex: 'orderedQuantity',
                key: 'orderedQuantity',
                width: 90,
                align: 'right',
                render: (v, r) => `${formatDecimal(v)} ${r.uom}`,
              },
              {
                title: 'Delivered',
                dataIndex: 'deliveredQuantity',
                key: 'deliveredQuantity',
                width: 90,
                align: 'right',
                render: (v, r) => <span style={{ color: '#059669', fontWeight: 600 }}>{formatDecimal(v || 0)} {r.uom}</span>,
              },
              {
                title: 'Remaining',
                dataIndex: 'remainingQuantity',
                key: 'remainingQuantity',
                width: 95,
                align: 'right',
                render: (v, r) => <span style={{ color: '#ea580c', fontWeight: 700 }}>{formatDecimal(v)} {r.uom}</span>,
              },
              {
                title: 'This Dispatch Qty',
                key: 'qty',
                width: 150,
                align: 'right',
                render: (_, r, idx) => (
                  <InputNumber
                    min={0}
                    max={r.remainingQuantity}
                    controls={false}
                    value={r.quantity}
                    onChange={(val) => {
                      const updated = [...deliveryItems];
                      updated[idx].quantity = Number(val || 0);
                      setDeliveryItems(updated);
                    }}
                    style={{ width: '100%', fontWeight: 700, color: '#059669' }}
                  />
                ),
              },
              {
                title: 'Bal After Ship',
                key: 'afterBal',
                width: 100,
                align: 'right',
                render: (_, r) => {
                  const after = Math.max(0, r.remainingQuantity - (r.quantity || 0));
                  return (
                    <span style={{ fontWeight: 600, color: after === 0 ? '#16a34a' : '#64748b' }}>
                      {formatDecimal(after)} {r.uom}
                    </span>
                  );
                },
              },
            ]}
          />
        </Form>
      </DraggableResizableModal>

      {/* Downstream Workflow: Plan Production Modal */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BuildOutlined style={{ color: '#7c3aed' }} />
            <span>Plan Production — Order #{prodOrder?.orderNumber}</span>
          </div>
        }
        open={productionModalVisible}
        onOk={handleSubmitPlanProduction}
        confirmLoading={submittingAction}
        onCancel={() => setProductionModalVisible(false)}
        width={920}
        okText="Create Production Order(s)"
      >
        <Form layout="vertical">
          <div style={{
            display: 'flex',
            gap: 16,
            marginBottom: 14,
            padding: '10px 14px',
            background: 'var(--inv-filter-card-bg, rgba(255,255,255,0.04))',
            border: '1px solid var(--inv-filter-card-border, #e2e8f0)',
            borderRadius: 8,
            fontSize: 12.5,
            color: 'var(--inv-text-primary, inherit)'
          }}>
            <div><strong>Customer:</strong> {prodOrder?.customer?.name || prodOrder?.companyName || 'Valued Customer'}</div>
            <div><strong>Order Date:</strong> {prodOrder?.orderDate ? dayjs(prodOrder.orderDate).format('DD-MMM-YYYY') : '-'}</div>
            <div><strong>Delivery Due:</strong> {prodOrder?.deliveryDate ? dayjs(prodOrder.deliveryDate).format('DD-MMM-YYYY') : '-'}</div>
            <div><strong>Total Order Lines:</strong> {prodItemsList.length}</div>
          </div>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Planned Production Start Date" required>
                <Input
                  type="date"
                  value={prodStartDate}
                  onChange={(e) => setProdStartDate(e.target.value)}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Planned Completion Date" required>
                <Input
                  type="date"
                  value={prodEndDate}
                  onChange={(e) => setProdEndDate(e.target.value)}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ margin: '14px 0 10px' }}>
            Select Line Items to Plan for Production
          </Divider>
          <Table
            rowKey="salesOrderItemId"
            size="small"
            pagination={false}
            dataSource={prodItemsList}
            columns={[
              {
                title: 'Select',
                key: 'sel',
                width: 60,
                align: 'center',
                render: (_, r, idx) => (
                  <Checkbox
                    checked={r.selected}
                    onChange={(e) => {
                      const updated = [...prodItemsList];
                      updated[idx].selected = e.target.checked;
                      setProdItemsList(updated);
                    }}
                  />
                ),
              },
              {
                title: 'Item / Product',
                key: 'item',
                render: (_, r) => (
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--inv-text-primary, #0f172a)' }}>{r.description}</div>
                    {r.itemCode && <div style={{ fontSize: 11, color: 'var(--inv-text-muted, #64748b)' }}>Code: {r.itemCode}</div>}
                  </div>
                ),
              },
              {
                title: 'Order Demand',
                dataIndex: 'orderedQuantity',
                key: 'orderedQuantity',
                width: 100,
                align: 'right',
                render: (v, r) => `${formatDecimal(v)} ${r.uom}`,
              },
              {
                title: 'Produced',
                dataIndex: 'producedQuantity',
                key: 'producedQuantity',
                width: 90,
                align: 'right',
                render: (v, r) => <span style={{ color: '#7c3aed', fontWeight: 600 }}>{formatDecimal(v || 0)} {r.uom}</span>,
              },
              {
                title: 'FG In-Stock',
                dataIndex: 'availableStock',
                key: 'availableStock',
                width: 95,
                align: 'right',
                render: (v, r) => (
                  <span style={{ color: Number(v || 0) > 0 ? '#16a34a' : '#64748b', fontWeight: 600 }}>
                    {formatDecimal(v || 0)} {r.uom}
                  </span>
                ),
              },
              {
                title: 'Shortage / Net Req',
                dataIndex: 'shortageQuantity',
                key: 'shortageQuantity',
                width: 110,
                align: 'right',
                render: (v, r) => (
                  <span style={{ color: v > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                    {formatDecimal(v)} {r.uom}
                  </span>
                ),
              },
              {
                title: 'Planned Qty',
                key: 'plannedQty',
                width: 150,
                align: 'right',
                render: (_, r, idx) => (
                  <InputNumber
                    min={1}
                    controls={false}
                    disabled={!r.selected}
                    value={r.plannedQuantity}
                    onChange={(val) => {
                      const updated = [...prodItemsList];
                      updated[idx].plannedQuantity = Number(val || 0);
                      setProdItemsList(updated);
                    }}
                    style={{ width: '100%', fontWeight: 700 }}
                  />
                ),
              },
            ]}
          />
        </Form>
      </DraggableResizableModal>

      {/* Dedicated Workflow Confirmation Modal with Item-Wise Quantity Breakdown */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircleOutlined style={{ color: confirmTarget?.color || '#2563eb', fontSize: 18 }} />
            <span>{confirmTarget?.actionLabel}: Order #{confirmTarget?.record.orderNumber}</span>
          </div>
        }
        open={confirmModalVisible}
        onCancel={() => {
          if (!confirmActionLoading) {
            setConfirmModalVisible(false);
            setConfirmTarget(null);
          }
        }}
        width={780}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setConfirmModalVisible(false);
              setConfirmTarget(null);
            }}
            disabled={confirmActionLoading}
          >
            Cancel
          </Button>,
          <Button
            key="confirm"
            type="primary"
            loading={confirmActionLoading}
            style={{ backgroundColor: confirmTarget?.color || '#2563eb', borderColor: confirmTarget?.color || '#2563eb', fontWeight: 700 }}
            onClick={async () => {
              if (!confirmTarget) return;
              setConfirmActionLoading(true);
              try {
                await handleAction(confirmTarget.record.id, confirmTarget.action);
                setConfirmModalVisible(false);
                setConfirmTarget(null);
              } finally {
                setConfirmActionLoading(false);
              }
            }}
          >
            Yes, {confirmTarget?.actionLabel}
          </Button>,
        ]}
      >
        {confirmTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Context Summary Strip */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              padding: '12px 16px',
              background: 'var(--inv-filter-card-bg, rgba(255,255,255,0.04))',
              border: '1px solid var(--inv-filter-card-border, #e2e8f0)',
              borderRadius: 8,
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--inv-text-muted, #94a3b8)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Customer
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--inv-text-primary, #0f172a)', marginTop: 2 }}>
                  {confirmTarget.record.customer?.name || confirmTarget.record.companyName || 'Valued Customer'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--inv-text-muted, #94a3b8)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Current Status
                </div>
                <div style={{ marginTop: 2 }}>
                  <Tag color="blue" style={{ fontWeight: 700 }}>{confirmTarget.record.status?.toUpperCase()}</Tag>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--inv-text-muted, #94a3b8)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Order Date
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--inv-text-primary, #0f172a)', marginTop: 2 }}>
                  {confirmTarget.record.orderDate ? dayjs(confirmTarget.record.orderDate).format('DD-MMM-YYYY') : '-'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--inv-text-muted, #94a3b8)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Order Total
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#10b981', marginTop: 2 }}>
                  {confirmTarget.record.currency || 'PKR'} {formatNumber(confirmTarget.record.totalAmount || 0, 2)}
                </div>
              </div>
            </div>

            {/* Prompt Notice */}
            <div style={{ fontSize: 13, color: 'var(--inv-text-secondary, #475569)' }}>
              Please review the line items and quantities below before confirming <strong>{confirmTarget.actionLabel}</strong>:
            </div>

            {/* Item-wise Quantity Table */}
            <div style={{ border: '1px solid var(--inv-table-border, #e2e8f0)', borderRadius: 8, overflow: 'hidden' }}>
              <Table
                size="small"
                pagination={false}
                dataSource={confirmTarget.items || []}
                rowKey={(it, idx) => it.id || String(idx)}
                scroll={{ y: 260 }}
                columns={[
                  {
                    title: '#',
                    key: 'index',
                    width: 50,
                    align: 'center',
                    render: (_, __, idx) => <span style={{ color: 'var(--inv-text-muted, #94a3b8)', fontWeight: 600 }}>{idx + 1}</span>,
                  },
                  {
                    title: 'Item / Product Specification',
                    key: 'item',
                    render: (_, it: any) => {
                      const name = it.item?.name || it.description || it.itemName || 'Production Item';
                      const code = it.item?.itemCode || it.itemCode || it.item?.code;
                      return (
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--inv-text-primary, #0f172a)' }}>{name}</div>
                          {code && <div style={{ fontSize: 11, color: 'var(--inv-text-muted, #64748b)', marginTop: 1 }}>Code: {code}</div>}
                        </div>
                      );
                    },
                  },
                  {
                    title: 'Quantity (Qty)',
                    key: 'qty',
                    width: 140,
                    align: 'right',
                    render: (_, it: any) => {
                      const qty = Number(it.quantity || it.orderedQuantity || 0);
                      const uom = it.uom?.code || it.uomCode || 'GRS';
                      return (
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--theme-accent, #0284c7)' }}>
                            {formatNumber(qty, 2)}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--inv-text-muted, #64748b)', marginLeft: 4, fontWeight: 600 }}>
                            {uom}
                          </span>
                        </div>
                      );
                    },
                  },
                  {
                    title: 'Unit Price',
                    key: 'unitPrice',
                    width: 120,
                    align: 'right',
                    render: (_, it: any) => {
                      const price = Number(it.unitPrice || it.price || 0);
                      return (
                        <span style={{ color: 'var(--inv-text-secondary, #475569)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumber(price, 2)}
                        </span>
                      );
                    },
                  },
                  {
                    title: 'Line Total',
                    key: 'lineTotal',
                    width: 140,
                    align: 'right',
                    render: (_, it: any) => {
                      const total = Number(it.totalAmount || it.lineTotal || (Number(it.quantity || 0) * Number(it.unitPrice || 0)));
                      return (
                        <strong style={{ color: 'var(--inv-text-primary, #0f172a)', fontVariantNumeric: 'tabular-nums' }}>
                          {confirmTarget.record.currency || 'PKR'} {formatNumber(total, 2)}
                        </strong>
                      );
                    },
                  },
                ]}
              />
            </div>
          </div>
        )}
      </DraggableResizableModal>

      {/* Enterprise Pre-Save Order Confirmation Dialog */}
      <Modal
        open={confirmOrderVisible}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: 'var(--theme-accent, #3b82f6)' }}>
            <SaveOutlined style={{ fontSize: 18 }} />
            <span>{editingItem ? 'Confirm Sales Order Update' : 'Confirm Sales Order Submission'}</span>
          </div>
        }
        centered
        width={540}
        zIndex={10050}
        onCancel={() => setConfirmOrderVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setConfirmOrderVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<SaveOutlined />}
            style={{ background: '#2563eb', borderColor: '#2563eb' }}
            onClick={() => executeOrderSave(pendingOrderValues)}
          >
            {editingItem ? 'Yes, Update Order' : 'Yes, Create Order'}
          </Button>,
        ]}
      >
        <div style={{ padding: '12px 0' }}>
          <p style={{ fontSize: 14, marginBottom: 16, color: 'var(--inv-text-primary, #0f172a)' }}>
            Are you sure you want to {editingItem ? 'update order' : 'create new sales order for'}{' '}
            <strong style={{ color: 'var(--theme-accent, #2563eb)', fontSize: 15 }}>
              {customers.find(c => c.id === pendingOrderValues?.customerId)?.name || customers.find(c => c.id === pendingOrderValues?.customerId)?.companyName || 'Selected Customer'}
            </strong>?
          </p>
          <div style={{
            background: 'var(--inv-filter-card-bg, rgba(255, 255, 255, 0.04))',
            border: '1px solid var(--inv-filter-card-border, #e2e8f0)',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontSize: 13,
            color: 'var(--inv-text-primary, inherit)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--inv-text-muted, #64748b)' }}>Line Items:</span>
              <strong>{lineItems.length} item(s)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--inv-text-muted, #64748b)' }}>Order Date:</span>
              <strong>{pendingOrderValues?.orderDate ? dayjs(pendingOrderValues.orderDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--inv-text-muted, #64748b)' }}>Status:</span>
              <Tag color="blue">{editingItem ? 'UPDATE' : 'CONFIRMED'}</Tag>
            </div>
          {editingItem ? (() => {
            const diffs = computeOrderChanges(editingItem, pendingOrderValues, lineItems, customers, divisions);
            return (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-accent, #2563eb)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🔄 Modified Fields ({diffs.length}):</span>
                </div>
                {diffs.length > 0 ? (
                  <div style={{ background: 'var(--inv-filter-card-bg, #f8fafc)', border: '1px solid var(--inv-filter-card-border, #e2e8f0)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {diffs.map((d, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '6px 10px', background: 'var(--inv-card-bg, #ffffff)', borderRadius: 6, border: '1px solid var(--inv-table-border, #edf2f7)' }}>
                        <span style={{ fontWeight: 600, color: 'var(--inv-text-secondary, #475569)' }}>{d.field}:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#ef4444', textDecoration: 'line-through', fontSize: 11.5 }}>{d.oldVal}</span>
                          <span style={{ color: 'var(--inv-text-muted, #94a3b8)' }}>➔</span>
                          <strong style={{ color: d.color || 'var(--theme-accent, #2563eb)', fontSize: 12.5 }}>{d.newVal}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '8px 12px', background: 'var(--inv-filter-card-bg, #f0fdf4)', border: '1px solid var(--inv-filter-card-border, #bbf7d0)', borderRadius: 6, color: '#16a34a', fontSize: 12 }}>
                    No field modifications detected. Order will be preserved with existing values.
                  </div>
                )}
              </div>
            );
          })() : null}
          </div>
        </div>
      </Modal>

      {/* Large Orbital Animated SaveResultDialog */}
      <SaveResultDialog
        open={saveResultOpen}
        phase={saveResultPhase}
        result={saveResultData}
        errorMessage={saveResultError}
        successTitle={saveResultSuccessTitle}
        onRetry={saveResultRetry}
        onClose={() => setSaveResultOpen(false)}
      />
    </div>
  );
};

export default SalesOrderManagement;
