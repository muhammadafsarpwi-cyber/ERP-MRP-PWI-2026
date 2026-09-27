import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Form, Input, Select, App,
  InputNumber, Row, Col, Descriptions, Divider, Tooltip, Tag, Modal,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, EyeOutlined, CheckOutlined,
  CarOutlined, InboxOutlined, StopOutlined, ReloadOutlined, FileExcelOutlined,
  PrinterOutlined, FilterOutlined, CloseCircleOutlined, UserOutlined,
  CalendarOutlined, ShoppingCartOutlined, DollarOutlined, CheckCircleOutlined,
  BuildOutlined, BranchesOutlined, SendOutlined, DownOutlined, UpOutlined, ApartmentOutlined,
  DatabaseOutlined, SaveOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { ERPLineItems, ERPLine, DraggableResizableModal, SaveResultDialog } from '../../components/shared';
import type { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import { TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { usePermission } from '../../hooks/usePermission';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import './SalesInvoiceManagement.css';
import { printSalesOrderDocument, printTableList } from '../../utils/printTemplates';

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

export function buildSalesOrderPayload(values: any, lineItems: ERPLine[]): any {
  return {
    ...values,
    items: lineItems.map((l) => ({
      itemId: l.itemId,
      description: l.itemName,
      quantity: l.quantity,
      uomId: l.uomId,
      unitPrice: l.rate,
      discountPercent: l.discountPercent,
      lineTotal: l.lineTotal,
    })),
  };
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
  const [filtersCollapsed, setFiltersCollapsed] = useState<boolean>(false);
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
  const [customers, setCustomers] = useState<Array<{ id: string; name?: string; companyName?: string; contactPerson?: string; customerCode?: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string }>>([]);
  const [divisions, setDivisions] = useState<Array<{ id: string; divisionCode: string; name: string }>>([]);
  const [sections, setSections] = useState<Array<{ id: string; name: string; sectionCode?: string; divisionId?: string }>>([]);
  const [selectedDivision, setSelectedDivision] = useState<string | undefined>(undefined);

  // Downstream Workflow: Delivery Modal State
  const [deliveryModalVisible, setDeliveryModalVisible] = useState(false);
  const [deliveryOrder, setDeliveryOrder] = useState<SalesOrder | null>(null);
  const [deliveryItems, setDeliveryItems] = useState<Array<{ salesOrderItemId: string; description: string; orderedQuantity: number; remainingQuantity: number; quantity: number }>>([]);
  const [deliveryWarehouseId, setDeliveryWarehouseId] = useState<string | undefined>(undefined);
  const [deliveryDate, setDeliveryDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [deliveryCarrier, setDeliveryCarrier] = useState<string>('');
  const [deliveryTracking, setDeliveryTracking] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');

  // Downstream Workflow: Production Planning Modal State
  const [productionModalVisible, setProductionModalVisible] = useState(false);
  const [prodOrder, setProdOrder] = useState<SalesOrder | null>(null);
  const [prodItem, setProdItem] = useState<any | null>(null);
  const [prodQuantity, setProdQuantity] = useState<number>(0);
  const [prodStartDate, setProdStartDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [prodEndDate, setProdEndDate] = useState<string>(dayjs().add(7, 'day').format('YYYY-MM-DD'));
  const [submittingAction, setSubmittingAction] = useState(false);

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
              });
            }
          });
        } catch { /* ignore */ }

        // 2. Fetch general customer master
        try {
          const c = await apiService.get<any>('/customer/customers', { limit: 100 });
          const list = Array.isArray(c) ? c : (c?.data || c?.items || []);
          list.forEach((cust: any) => {
            if (cust?.id && !combinedMap.has(cust.id)) {
              combinedMap.set(cust.id, {
                id: cust.id,
                name: cust.name || cust.companyName || cust.legalName || 'Unnamed Customer',
                companyName: cust.companyName || cust.name,
                contactPerson: cust.contactPerson,
                customerCode: cust.customerCode,
              });
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

  const handleCreate = useCallback(() => {
    setEditingItem(null);
    setSelectedDivision(undefined);
    form.resetFields();
    form.setFieldsValue({
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

  const handleEdit = (record: SalesOrder) => {
    setEditingItem(record);
    setSelectedDivision(record.divisionId || undefined);
    form.setFieldsValue({
      divisionId: record.divisionId || undefined,
      sectionId: record.sectionId || undefined,
      customerId: record.customerId,
      orderDate: record.orderDate ? dayjs(record.orderDate).format('YYYY-MM-DD') : undefined,
      deliveryDate: record.deliveryDate ? dayjs(record.deliveryDate).format('YYYY-MM-DD') : undefined,
      currency: record.currency || 'PKR',
      shipToAddress: record.shipToAddress,
      billToAddress: record.billToAddress,
      notes: record.notes,
      subtotal: record.subtotal,
      discountAmount: record.discountAmount,
      taxAmount: record.taxAmount,
      freightAmount: record.freightAmount,
      totalAmount: record.totalAmount,
    });
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
      if (lineItems.length === 0) {
        message.warning('Add at least one line item');
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

    try {
      const payload = buildSalesOrderPayload(values, lineItems);
      let res: any;
      if (isEdit && editingItem) {
        res = await apiService.patch(`/sales/orders/${editingItem.id}`, payload);
      } else {
        res = await apiService.post('/sales/orders', payload);
      }
      const saved = res?.data || res || {};
      const orderNum = saved.orderNumber || editingItem?.orderNumber || 'SO-RECORDED';
      setSaveResultPhase('success');
      setSaveResultSuccessTitle(isEdit ? 'Sales Order Updated Successfully' : 'Sales Order Created Successfully');
      setSaveResultData({
        title: isEdit ? 'Sales Order Updated Successfully' : 'Sales Order Created Successfully',
        message: `Sales Order ${orderNum} for "${custName}" has been successfully recorded.`,
        recordType: 'Order Number',
        recordCode: orderNum,
        recordName: custName,
        tags: [
          { label: `${lineItems.length} line item(s)`, color: 'blue' },
          { label: isEdit ? 'UPDATED' : 'CONFIRMED', color: 'green' },
        ],
      });
      setModalVisible(false);
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

  const handleOpenCreateDelivery = async (record: SalesOrder) => {
    try {
      const fullOrder = await apiService.get<SalesOrder>(`/sales/orders/${record.id}`);
      setDeliveryOrder(fullOrder);
      const itemsToDeliver = (fullOrder.items || []).map((it: any) => {
        const rem = it.remainingDeliveryQuantity !== undefined ? Number(it.remainingDeliveryQuantity) : (Number(it.quantity || 0) - Number(it.deliveredQuantity || 0));
        return {
          salesOrderItemId: it.id,
          description: it.description || it.item?.name || 'Item',
          orderedQuantity: Number(it.quantity || 0),
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
        items: validLines.map(l => ({ salesOrderItemId: l.salesOrderItemId, quantity: l.quantity })),
      };
      const res = await apiService.post<any>(`/sales/orders/${deliveryOrder.id}/convert-to-delivery`, payload);
      message.success(`Delivery Note ${res.deliveryNumber || 'created'} successfully!`);
      setDeliveryModalVisible(false);
      fetchData(page, pageSize);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : (msg || 'Failed to create delivery note'));
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleOpenPlanProduction = async (order: SalesOrder, item?: any) => {
    setProdOrder(order);
    let targetItem = item;
    if (!targetItem) {
      try {
        const full = await apiService.get<SalesOrder>(`/sales/orders/${order.id}`);
        setProdOrder(full);
        targetItem = full.items && full.items[0];
      } catch {
        targetItem = order.items && order.items[0];
      }
    }
    setProdItem(targetItem);
    const rem = targetItem ? Math.max(0, Number(targetItem.orderedQuantity ?? targetItem.quantity ?? 0) - Number(targetItem.producedQuantity ?? 0)) : 0;
    setProdQuantity(rem > 0 ? rem : Number(targetItem?.quantity || 100));
    setProdStartDate(dayjs().format('YYYY-MM-DD'));
    setProdEndDate(dayjs().add(7, 'day').format('YYYY-MM-DD'));
    setProductionModalVisible(true);
  };

  const handleSubmitPlanProduction = async () => {
    if (!prodOrder || !prodItem) return;
    if (prodQuantity <= 0) {
      message.error('Production quantity must be greater than 0');
      return;
    }
    setSubmittingAction(true);
    try {
      const payload = {
        salesOrderItemId: prodItem.id,
        plannedQuantity: prodQuantity,
        plannedStartDate: prodStartDate,
        plannedEndDate: prodEndDate,
      };
      const res = await apiService.post<any>(`/sales/orders/${prodOrder.id}/create-production-order`, payload);
      message.success(`Production Order ${res.orderNumber || 'created'} successfully!`);
      setProductionModalVisible(false);
      if (detailVisible && detailItem?.id === prodOrder.id) {
        handleViewDetail(prodOrder);
      }
      fetchData(page, pageSize);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : (msg || 'Failed to create production order'));
    } finally {
      setSubmittingAction(false);
    }
  };

  // Pixel-Perfect Multi-line Columns mirroring Invoices Design
  const columns: ColumnsType<SalesOrder> = [
    {
      title: 'Sales Order / SOC',
      key: 'order',
      width: 245,
      render: (_, record) => {
        const custName = getCustomerDisplayName(record);
        const isConfirmed = ['confirmed', 'processing', 'shipped', 'delivered', 'closed'].includes((record.status || '').toLowerCase());
        return (
          <div className="inv-doc-cell">
            <div className="inv-doc-code">{record.orderNumber}</div>
            <div className="inv-sub-row">
              <span
                className="badge-inv-type"
                style={isConfirmed ? { backgroundColor: 'rgba(37,99,235,0.22)', color: '#60a5fa', borderColor: '#2563eb' } : {}}
              >
                {isConfirmed ? <CheckCircleOutlined style={{ marginRight: 3 }} /> : <ShoppingCartOutlined style={{ marginRight: 3 }} />}
                {isConfirmed ? 'SOC #' : 'Order (Draft)'}
              </span>
              <span className="inv-sub-val" style={{ textTransform: 'lowercase' }}>
                {record.currency || 'PKR'}
              </span>
            </div>
            <div className="inv-sub-row">
              <span className="badge-inv-type">
                {isConfirmed ? <CheckCircleOutlined style={{ marginRight: 3 }} /> : <ShoppingCartOutlined style={{ marginRight: 3 }} />}
                {isConfirmed ? 'SOC #' : 'Order (Draft)'}
              </span>
              <span className="inv-sub-val" style={{ textTransform: 'lowercase' }}>
                {record.currency || 'PKR'}
              </span>
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
      title: 'Division',
      key: 'division',
      width: 155,
      render: (_, record) => {
        const div = record.division || divisions.find(d => d.id === record.divisionId);
        if (!div) return <span style={{ color: '#64748b', fontSize: 12 }}>-</span>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600, color: '#38bdf8', fontSize: 12 }}>
              <ApartmentOutlined style={{ marginRight: 4 }} />
              {div.name}
            </span>
            <span style={{ fontSize: 10.5, color: '#64748b', fontFamily: 'monospace' }}>
              {div.divisionCode}
            </span>
          </div>
        );
      },
    },
    {
      title: 'Dates',
      key: 'dates',
      width: 180,
      render: (_, record) => (
        <div className="inv-dates-cell">
          <div className="inv-date-row">
            <span className="badge-inv-date">
              <CalendarOutlined style={{ marginRight: 3 }} /> Order
            </span>
            <span className="inv-date-val">
              {record.orderDate ? dayjs(record.orderDate).format('MMM DD, YYYY') : '-'}
            </span>
          </div>
          {record.deliveryDate && (
            <div className="inv-date-row">
              <span className="badge-inv-due">
                <CalendarOutlined style={{ marginRight: 3 }} /> Delivery
              </span>
              <span className="inv-date-val">
                {dayjs(record.deliveryDate).format('MMM DD, YYYY')}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Amounts',
      key: 'amounts',
      width: 215,
      render: (_, record) => (
        <div className="inv-amounts-cell">
          <div className="inv-amt-row">
            <span className="badge-inv-subtotal">Subtotal</span>
            <span className="inv-amt-val">{record.currency || 'Rs'} {formatDecimal(record.subtotal || 0)}</span>
          </div>
          {record.discountAmount > 0 && (
            <div className="inv-amt-row">
              <span className="badge-inv-terms">Discount</span>
              <span className="inv-amt-val" style={{ color: '#ea580c' }}>-{formatDecimal(record.discountAmount)}</span>
            </div>
          )}
          <div className="inv-amt-row">
            <span className="badge-inv-tax">% Tax</span>
            <span className="inv-amt-val">{record.currency || 'Rs'} {formatDecimal(record.taxAmount || 0)}</span>
          </div>
          <div className="inv-amt-row amt-total-row">
            <span className="badge-inv-total">Total</span>
            <span className="inv-amt-val inv-amt-bold">{record.currency || 'Rs'} {formatDecimal(record.totalAmount || 0)}</span>
          </div>
        </div>
      ),
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
                  onClick={() => handleAction(record.id, 'confirm')}
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
                  onClick={() => handleAction(record.id, 'process')}
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
              <Tooltip title="Create Delivery Note (Dispatch)">
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
                  onClick={() => handleAction(record.id, 'ship')}
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
                  onClick={() => handleAction(record.id, 'deliver')}
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
                  onClick={() => handleAction(record.id, 'close')}
                >
                  <CheckOutlined />
                </button>
              </Tooltip>
            )}
            {s !== 'cancelled' && s !== 'closed' && canApprove && (
              <Tooltip title="Cancel Order">
                <button
                  className="inv-action-btn inv-btn-cancel"
                  onClick={() => handleAction(record.id, 'cancel')}
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

        {/* 6 Filters Grid (Collapsible) */}
        <div className="inv-filter-section">
          <div
            className="inv-filter-header"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setFiltersCollapsed(prev => !prev)}
          >
            <div className="inv-filter-title">
              <FilterOutlined style={{ color: '#2ecc71' }} />
              <span>Filters</span>
              {filtersCollapsed ? (
                <Tag color="blue" style={{ marginLeft: 8, fontSize: 11, cursor: 'pointer' }}>
                  Click to Expand Filters {activeFilterCount > 0 ? `(${activeFilterCount} Active)` : ''}
                </Tag>
              ) : (
                activeFilterCount > 0 ? (
                  <Tag color="cyan" style={{ marginLeft: 8, fontSize: 11 }}>
                    {activeFilterCount} Active Filter{activeFilterCount > 1 ? 's' : ''}
                  </Tag>
                ) : null
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="inv-btn-clear-all"
                onClick={(e) => { e.stopPropagation(); setFiltersCollapsed(prev => !prev); }}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {filtersCollapsed ? <DownOutlined /> : <UpOutlined />} {filtersCollapsed ? 'Show Filters' : 'Collapse Filters'}
              </button>
              <button
                type="button"
                className="inv-btn-clear-all"
                onClick={(e) => { e.stopPropagation(); handleClearAll(); }}
              >
                <CloseCircleOutlined /> Clear All
              </button>
            </div>
          </div>

          {!filtersCollapsed && (
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
                  placeholder="All customers"
                  allowClear
                  showSearch
                  optionFilterProp="children"
                  className="inv-filter-box-select"
                  value={filterCustomer}
                  onChange={(val) => setFilterCustomer(val)}
                >
                  {customers.map(c => (
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
          )}
        </div>

        {/* Controls Row: Show Entries & Search Bar */}
        <div className="inv-controls-row">
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

          <div className="inv-search-control">
            <span className="inv-search-label">Search:</span>
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
        </div>

        {/* Custom ERP Table */}
        <Table
          columns={columns}
          dataSource={displayedOrders}
          rowKey="id"
          loading={loading}
          pagination={false}
          className="inv-custom-table"
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
        onCancel={() => setModalVisible(false)}
        width={1040}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
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
                    form.setFieldsValue({ sectionId: undefined });
                    if (prev && val !== prev && lineItems.length > 0) {
                      setLineItems([]);
                      message.info('Division changed: order line items reset to match selected division.');
                    }
                  }}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={12}>
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
            <Col span={12}>
              <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Please select customer' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select customer"
                  options={customers.map((c) => ({ value: c.id, label: `${c.customerCode ? `[${c.customerCode}] ` : ''}${c.companyName || c.name}` }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
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

      {/* Downstream Workflow: Create Delivery Note Modal */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SendOutlined style={{ color: '#059669' }} />
            <span>Create Delivery Note — Order #{deliveryOrder?.orderNumber}</span>
          </div>
        }
        open={deliveryModalVisible}
        onOk={handleSubmitCreateDelivery}
        confirmLoading={submittingAction}
        onCancel={() => setDeliveryModalVisible(false)}
        width={750}
        okText="Generate Delivery Note"
      >
        <Form layout="vertical">
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
              <Form.Item label="Carrier / Transport (e.g. TCS / Cargo)">
                <Input
                  value={deliveryCarrier}
                  onChange={(e) => setDeliveryCarrier(e.target.value)}
                  placeholder="Carrier name"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Tracking Number / Bilty #">
                <Input
                  value={deliveryTracking}
                  onChange={(e) => setDeliveryTracking(e.target.value)}
                  placeholder="e.g. BL-89124"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Dispatch Remarks / Gate Pass Instructions">
            <Input.TextArea
              rows={2}
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="Delivery instructions..."
            />
          </Form.Item>

          <Divider orientation="left" style={{ margin: '12px 0 8px' }}>Line Items to Dispatch (Max = Remaining)</Divider>
          <Table
            rowKey="salesOrderItemId"
            size="small"
            pagination={false}
            dataSource={deliveryItems}
            columns={[
              { title: 'Item', dataIndex: 'description', key: 'description' },
              { title: 'Ordered', dataIndex: 'orderedQuantity', key: 'orderedQuantity', width: 90, align: 'right' },
              { title: 'Remaining', dataIndex: 'remainingQuantity', key: 'remainingQuantity', width: 100, align: 'right', render: (v) => <span style={{ color: '#ea580c', fontWeight: 600 }}>{v}</span> },
              {
                title: 'Ship Qty',
                key: 'qty',
                width: 130,
                align: 'right',
                render: (_, r, idx) => (
                  <InputNumber
                    min={0}
                    max={r.remainingQuantity}
                    value={r.quantity}
                    onChange={(val) => {
                      const updated = [...deliveryItems];
                      updated[idx].quantity = Number(val || 0);
                      setDeliveryItems(updated);
                    }}
                    style={{ width: '100%' }}
                  />
                ),
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
        width={550}
        okText="Create Production Order"
      >
        <Form layout="vertical">
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Item">{prodItem?.description || prodItem?.item?.name || 'Finished Good'}</Descriptions.Item>
            <Descriptions.Item label="Order Demand Qty">{prodItem?.quantity || prodItem?.orderedQuantity || 0}</Descriptions.Item>
          </Descriptions>
          <Form.Item label="Planned Production Quantity" required>
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              value={prodQuantity}
              onChange={(v) => setProdQuantity(Number(v || 0))}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Planned Start Date" required>
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
        </Form>
      </DraggableResizableModal>

      {/* Enterprise Pre-Save Order Confirmation Dialog */}
      <Modal
        open={confirmOrderVisible}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>
            <SaveOutlined style={{ fontSize: 18 }} />
            <span>{editingItem ? 'Confirm Sales Order Update' : 'Confirm Sales Order Submission'}</span>
          </div>
        }
        centered
        width={500}
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
          <p style={{ fontSize: 14, marginBottom: 16 }}>
            Are you sure you want to {editingItem ? 'update order' : 'create new sales order for'}{' '}
            <strong style={{ color: '#2563eb', fontSize: 15 }}>
              {customers.find(c => c.id === pendingOrderValues?.customerId)?.name || customers.find(c => c.id === pendingOrderValues?.customerId)?.companyName || 'Selected Customer'}
            </strong>?
          </p>
          <div style={{
            background: 'rgba(30, 41, 59, 0.05)',
            border: '1px solid rgba(226, 232, 240, 0.4)',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontSize: 13,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Line Items:</span>
              <strong>{lineItems.length} item(s)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Order Date:</span>
              <strong>{pendingOrderValues?.orderDate ? dayjs(pendingOrderValues.orderDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Status:</span>
              <Tag color="blue">{editingItem ? 'UPDATE' : 'CONFIRMED'}</Tag>
            </div>
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
