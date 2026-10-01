import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Form, Input, Select, App, Modal,
  Row, Col, Descriptions, Divider, Tooltip, Tag, Badge,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, EyeOutlined, CheckOutlined,
  CarOutlined, InboxOutlined, StopOutlined, ReloadOutlined, FileExcelOutlined,
  PrinterOutlined, FilterOutlined, CloseCircleOutlined, UserOutlined,
  CalendarOutlined, NumberOutlined, ShopOutlined, FileTextOutlined,
  BranchesOutlined, SafetyCertificateOutlined, ApartmentOutlined, WarningFilled,
  CloseOutlined, ClearOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { ERPLineItems, ERPLine, DraggableResizableModal } from '../../components/shared';
import { TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import './SalesInvoiceManagement.css';
import { printDeliveryNoteDocument, printTableList, printGatePassDocument } from '../../utils/printTemplates';

dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

interface SalesDelivery {
  id: string;
  deliveryNumber: string;
  salesOrderId: string;
  salesOrderNumber?: string;
  customerPo?: string | null;
  salesOrder?: {
    id?: string;
    orderNumber?: string;
    customerPo?: string | null;
    divisionId?: string;
    division?: { id?: string; name?: string; divisionCode?: string };
    section?: { id?: string; name?: string; sectionCode?: string };
  };
  divisionId?: string;
  divisionName?: string;
  sectionName?: string;
  customerId: string;
  companyName?: string;
  deliveryDate: string;
  expectedDate: string;
  warehouseId: string;
  shipToAddress?: string;
  carrier: string;
  trackingNumber: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: string;
  notes?: string;
  lines?: any[];
  relatedInvoices?: Array<{
    id: string;
    invoiceNumber: string;
    invoiceNo?: string;
    invoiceDate: string;
    status: string;
    totalAmount: number;
    paidAmount?: number;
  }>;
}

const STATUS_OPTIONS = ['All statuses', 'DRAFT', 'SHIPPED', 'DELIVERED', 'CONFIRMED', 'CANCELLED'];

const SalesDeliveryManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<SalesDelivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Chevron Process filter state
  const [activeChevron, setActiveChevron] = useState<string>('ALL');

  // Filter States
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [filterDivision, setFilterDivision] = useState<string | undefined>(undefined);
  const [divisions, setDivisions] = useState<Array<{ id: string; divisionCode: string; name: string }>>([]);
  const [filterCarrier, setFilterCarrier] = useState<string | undefined>(undefined);
  const [filterCustomer, setFilterCustomer] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterDateFrom, setFilterDateFrom] = useState<string | undefined>(undefined);
  const [filterDateTo, setFilterDateTo] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterDivision) count++;
    if (filterCarrier) count++;
    if (filterCustomer) count++;
    if (filterStatus && filterStatus !== 'All statuses') count++;
    if (filterDateFrom) count++;
    if (filterDateTo) count++;
    return count;
  }, [filterDivision, filterCarrier, filterCustomer, filterStatus, filterDateFrom, filterDateTo]);

  // Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<SalesDelivery | null>(null);
  const [editingItem, setEditingItem] = useState<SalesDelivery | null>(null);
  const [warningModalVisible, setWarningModalVisible] = useState(false);
  const [pendingExcessWarnings, setPendingExcessWarnings] = useState<any[]>([]);
  const [pendingSavePayload, setPendingSavePayload] = useState<any>(null);
  const [form] = Form.useForm();
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [customers, setCustomers] = useState<Array<{ id: string; name?: string; companyName?: string; customerCode?: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string }>>([]);

  // Sales Orders & PO Cascade state
  const [allSalesOrders, setAllSalesOrders] = useState<any[]>([]);
  const [customerSalesOrders, setCustomerSalesOrders] = useState<any[]>([]);
  const [customerPos, setCustomerPos] = useState<string[]>([]);
  const [selectedSoInfo, setSelectedSoInfo] = useState<{ orderNumber: string; customerPo?: string; pendingCount: number } | null>(null);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
    (async () => {
      try {
        const divRes = await apiService.get<any>('/divisions', { limit: 50 });
        const list = Array.isArray(divRes) ? divRes : (divRes?.data || divRes?.items || []);
        setDivisions(Array.isArray(list) ? list.filter((d: any) => d.status === 'ACTIVE' || d.isActive !== false) : []);
      } catch { /* ignore */ }
      try {
        const combinedMap = new Map<string, any>();
        try {
          const sc = await apiService.get<any>('/sales/orders/meta/customers');
          const scList = Array.isArray(sc) ? sc : (sc?.data || []);
          scList.forEach((cust: any) => {
            if (cust?.id) {
              combinedMap.set(cust.id, {
                id: cust.id,
                name: cust.companyName || cust.name || cust.legalName || 'Customer',
                companyName: cust.companyName || cust.name,
                customerCode: cust.customerCode,
              });
            }
          });
        } catch { /* ignore */ }

        try {
          const c = await apiService.get<any>('/customer/customers', { limit: 100 });
          const list = Array.isArray(c) ? c : (c?.data || c?.items || []);
          list.forEach((cust: any) => {
            if (cust?.id && !combinedMap.has(cust.id)) {
              combinedMap.set(cust.id, {
                id: cust.id,
                name: cust.name || cust.companyName || cust.legalName || 'Unnamed Customer',
                companyName: cust.companyName || cust.name,
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
        const soRes = await apiService.get<any>('/sales/orders', { limit: 100 });
        const list = Array.isArray(soRes) ? soRes : (soRes?.data || []);
        setAllSalesOrders(list);
      } catch { /* ignore */ }
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
      const response = await apiService.get<{ data: SalesDelivery[]; total: number }>('/sales/deliveries', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch deliveries');
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
      if (!detail?.tabId || String(detail.tabId).includes('deliver')) {
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
      shipped: data.filter(d => (d.status || '').toUpperCase() === 'SHIPPED').length,
      delivered: data.filter(d => ['DELIVERED', 'CONFIRMED'].includes((d.status || '').toUpperCase())).length,
      cancelled: data.filter(d => (d.status || '').toUpperCase() === 'CANCELLED').length,
    };
  }, [data, total]);

  // Available carriers from data
  const availableCarriers = useMemo(() => {
    const set = new Set<string>();
    data.forEach(d => { if (d.carrier) set.add(d.carrier); });
    return Array.from(set);
  }, [data]);

  // Client-side filtering
  const displayedDeliveries = useMemo(() => {
    return data.filter(d => {
      const status = (d.status || '').toUpperCase();
      // Chevron filter
      if (activeChevron === 'DRAFT' && status !== 'DRAFT') return false;
      if (activeChevron === 'SHIPPED' && status !== 'SHIPPED') return false;
      if (activeChevron === 'DELIVERED' && !['DELIVERED', 'CONFIRMED'].includes(status)) return false;
      if (activeChevron === 'CANCELLED' && status !== 'CANCELLED') return false;

      // Division filter
      if (filterDivision && d.divisionId !== filterDivision && d.divisionName !== filterDivision && (d as any).salesOrder?.divisionId !== filterDivision) return false;

      // Carrier filter
      if (filterCarrier && d.carrier?.toLowerCase() !== filterCarrier.toLowerCase()) return false;

      // Customer filter
      if (filterCustomer && d.customerId !== filterCustomer) return false;

      // Status filter
      if (filterStatus && filterStatus !== 'All statuses' && status !== filterStatus.toUpperCase()) return false;

      // Date Range filter
      if (filterDateFrom && d.deliveryDate && dayjs(d.deliveryDate).isBefore(dayjs(filterDateFrom), 'day')) return false;
      if (filterDateTo && d.deliveryDate && dayjs(d.deliveryDate).isAfter(dayjs(filterDateTo), 'day')) return false;

      return true;
    });
  }, [data, activeChevron, filterDivision, filterCarrier, filterCustomer, filterStatus, filterDateFrom, filterDateTo]);

  // Clear all filters handler
  const handleClearAll = () => {
    setActiveChevron('ALL');
    setFilterDivision(undefined);
    setFilterCarrier(undefined);
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
    if (displayedDeliveries.length === 0) {
      message.warning('No delivery records to export');
      return;
    }
    const headers = ['Delivery #', 'Customer', 'Delivery Date', 'Expected Date', 'Carrier', 'Tracking #', 'Subtotal', 'Tax', 'Total Amount', 'Status'];
    const rows = displayedDeliveries.map(d => {
      const cust = customers.find(c => c.id === d.customerId);
      const custName = cust?.companyName || cust?.name || d.companyName || d.customerId;
      return [
        `"${d.deliveryNumber}"`,
        `"${custName}"`,
        `"${d.deliveryDate || ''}"`,
        `"${d.expectedDate || ''}"`,
        `"${d.carrier || ''}"`,
        `"${d.trackingNumber || ''}"`,
        d.subtotal || 0,
        d.taxAmount || 0,
        d.totalAmount || 0,
        `"${d.status}"`,
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `deliveries_export_${dayjs().format('YYYYMMDD_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Deliveries exported to CSV');
  }, [displayedDeliveries, customers, message]);

  // Print
  const handlePrint = useCallback(() => {
    const headers = ['Delivery #', 'Customer', 'Date', 'Expected Date', 'Subtotal', 'Tax', 'Total Amount', 'Status'];
    const rows = displayedDeliveries.map(del => [
      del.deliveryNumber,
      getCustomerDisplayName(del),
      del.deliveryDate || '-',
      del.expectedDate || '-',
      `Rs ${formatDecimal(del.subtotal || 0)}`,
      `Rs ${formatDecimal(del.taxAmount || 0)}`,
      `Rs ${formatDecimal(del.totalAmount || 0)}`,
      del.status,
    ]);
    printTableList('Sales Delivery Notes Report', headers, rows);
  }, [displayedDeliveries, getCustomerDisplayName]);

  // Outward Gate Pass Document Print
  const handlePrintOutwardGatePass = useCallback((record: any) => {
    const lines = record.lines || [];
    
    // Calculate unique SOC numbers across delivery and lines
    const uniqueSocs = Array.from(
      new Set(
        [
          record.salesOrderNumber,
          record.salesOrder?.orderNumber,
          ...lines.map((l: any) => l.salesOrderNumber || l.salesOrder?.orderNumber).filter(Boolean),
        ].filter(Boolean)
      )
    );
    const socDisplay = uniqueSocs.length === 1 ? String(uniqueSocs[0]) : uniqueSocs.length > 1 ? uniqueSocs.join(', ') : (record.salesOrderId ? `SOC-${record.salesOrderId.slice(0, 8)}` : '-');

    // Calculate customer PO
    const uniquePos = Array.from(
      new Set(
        [
          record.customerPo,
          record.salesOrder?.customerPo,
          record.poNumber,
          ...lines.map((l: any) => l.customerPo).filter(Boolean),
        ].filter(Boolean)
      )
    );
    const poDisplay = uniquePos.length > 0 ? uniquePos.join(', ') : (record.customerPo || '-');

    // Calculate dispatch frequency (1st time, 2nd time, etc.)
    const soId = record.salesOrderId;
    const sameSoDeliveries = soId ? data.filter((d: any) => d.salesOrderId === soId) : [];
    const dispatchIdx = sameSoDeliveries.findIndex((d: any) => d.id === record.id);
    const dispatchSeqNum = dispatchIdx >= 0 ? dispatchIdx + 1 : (sameSoDeliveries.length > 0 ? sameSoDeliveries.length + 1 : 1);
    const dispatchSequenceText = `${dispatchSeqNum === 1 ? '1st Dispatch (First Time)' : dispatchSeqNum === 2 ? '2nd Dispatch' : dispatchSeqNum === 3 ? '3rd Dispatch' : `${dispatchSeqNum}th Dispatch`}`;

    printGatePassDocument({
      passType: 'OUTWARD',
      gatePassNo: `GP-OUT-${record.deliveryNumber?.replace(/[^a-zA-Z0-9]/g, '') || Date.now().toString().slice(-6)}`,
      referenceNo: record.deliveryNumber,
      customerPo: poDisplay,
      socNumber: socDisplay,
      dispatchSequence: record.dispatchSequence || dispatchSequenceText,
      date: record.deliveryDate ? dayjs(record.deliveryDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      time: dayjs().format('hh:mm A'),
      partyName: record.companyName || record.customer?.companyName || record.customer?.name || getCustomerDisplayName(record.customerId) || 'Valued Customer',
      vehicleNumber: record.vehicleNo || record.vehicleNumber || record.trackingNumber || 'Company Vehicle Fleet',
      driverName: record.driverName || record.driver || 'Driver on Duty',
      driverCnic: record.driverCnic || record.cnic,
      transporter: record.carrier || record.transporter || 'PWI Logistics Dispatch',
      remarks: record.notes || 'Outward customer delivery dispatch under security authorization',
      items: lines.map((it: any, idx: number) => {
        const orderQty = it.orderQuantity != null ? Number(it.orderQuantity) : (it.orderedQuantity != null ? Number(it.orderedQuantity) : undefined);
        const currentQty = Number(it.quantity) || 1;
        const bal = orderQty != null ? Math.max(0, orderQty - currentQty) : it.balanceQuantity;
        const pkgUnit = it.packagingUnit || 'Coils';
        const pkgQty = it.packageQuantity != null ? Number(it.packageQuantity) : undefined;
        return {
          itemCode: it.itemCode || `SKU-00${idx + 1}`,
          itemName: it.itemName || it.description || `Delivered Product ${idx + 1}`,
          socNumber: it.salesOrderNumber || (uniqueSocs.length === 1 ? String(uniqueSocs[0]) : undefined),
          customerPo: it.customerPo || (uniquePos.length === 1 ? String(uniquePos[0]) : undefined),
          orderQuantity: orderQty,
          quantity: currentQty,
          balanceQuantity: bal,
          uom: it.uomCode || it.uom || 'M',
          packageQuantity: pkgQty,
          packagingUnit: pkgUnit,
          packaging: pkgQty != null && pkgQty > 0 ? `${pkgQty} ${pkgUnit}` : (it.packaging || 'Pallets / Bundles'),
          remarks: it.remarks || it.notes || '-',
        };
      }),
    });
  }, [data, getCustomerDisplayName]);

  const handleCreate = useCallback(async () => {
    setEditingItem(null);
    setSelectedSoInfo(null);
    setCustomerSalesOrders([]);
    setCustomerPos([]);
    form.resetFields();
    form.setFieldsValue({
      subtotal: 0, taxAmount: 0, totalAmount: 0,
      deliveryDate: dayjs().format('YYYY-MM-DD'),
      expectedDate: dayjs().add(3, 'day').format('YYYY-MM-DD'),
    });
    setLineItems([]);
    setModalVisible(true);
    try {
      const soRes = await apiService.get<any>('/sales/orders', { limit: 100 });
      const list = Array.isArray(soRes) ? soRes : (soRes?.data || []);
      setAllSalesOrders(list);
    } catch { /* ignore */ }
  }, [form]);

  // Register action buttons into Main Header (Top Application Header)
  useEffect(() => {
    const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
    setHeaderActions([
      {
        key: 'new-delivery',
        node: (
          <Button
            className="btn-new-invoice"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            + New Delivery
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

  const handleCustomerChange = (customerId: string) => {
    form.setFieldsValue({ customerId, salesOrderId: undefined, salesOrderIds: [], customerPo: undefined });
    setSelectedSoInfo(null);
    setLineItems([]);

    // Filter active orders for this customer (not cancelled, has balance or status != DELIVERED)
    const matchingOrders = allSalesOrders.filter((so: any) => {
      if (so.customerId !== customerId) return false;
      const status = (so.status || '').toUpperCase();
      if (status === 'CANCELLED') return false;
      if (so.items && Array.isArray(so.items) && so.items.length > 0) {
        const remaining = so.items.reduce((acc: number, it: any) => {
          const qty = Number(it.quantity) || 0;
          const shipped = Number(it.shippedQuantity ?? it.shipped_quantity) || 0;
          return acc + Math.max(0, qty - shipped);
        }, 0);
        return remaining > 0;
      }
      return status !== 'DELIVERED';
    });

    setCustomerSalesOrders(matchingOrders);

    // Extract unique non-empty PO numbers
    const pos = Array.from(new Set(matchingOrders.map((o: any) => o.customerPo).filter((p: any) => Boolean(p && String(p).trim())))) as string[];
    setCustomerPos(pos);
  };

  const handleSalesOrdersChange = (soIds: string | string[], preMatchedOrder?: any) => {
    const ids = Array.isArray(soIds) ? soIds : (soIds ? [soIds] : []);
    if (ids.length === 0) {
      form.setFieldsValue({ salesOrderIds: [], salesOrderId: undefined });
      setSelectedSoInfo(null);
      setLineItems([]);
      return;
    }

    const selectedOrders = ids
      .map(id => preMatchedOrder?.id === id ? preMatchedOrder : allSalesOrders.find((o: any) => o.id === id) || customerSalesOrders.find((o: any) => o.id === id))
      .filter(Boolean);

    if (selectedOrders.length === 0) {
      setSelectedSoInfo(null);
      return;
    }

    const linkedOrderNumbers = selectedOrders.map((o: any) => o.orderNumber).filter(Boolean);
    const linkedPos = Array.from(new Set(selectedOrders.map((o: any) => o.customerPo).filter(Boolean))) as string[];

    form.setFieldsValue({
      salesOrderIds: ids,
      salesOrderId: ids[0],
      customerPo: linkedPos.length > 0 ? linkedPos.join(', ') : form.getFieldValue('customerPo'),
      expectedDate: selectedOrders[0]?.deliveryDate ? dayjs(selectedOrders[0].deliveryDate).format('YYYY-MM-DD') : form.getFieldValue('expectedDate'),
    });

    // Populate balance lines from ALL selected SOCs
    const allPendingLines: ERPLine[] = [];
    selectedOrders.forEach((order: any) => {
      const orderLines: ERPLine[] = (order.items || [])
        .filter((it: any) => {
          const qty = Number(it.quantity) || 0;
          const shipped = Number(it.shippedQuantity ?? it.shipped_quantity) || 0;
          return (qty - shipped) > 0;
        })
        .map((it: any, idx: number) => {
          const qty = Number(it.quantity) || 0;
          const shipped = Number(it.shippedQuantity ?? it.shipped_quantity) || 0;
          const balance = qty - shipped;

          const itemObj = it.item || {};
          const itemName = itemObj.name || it.description || 'Product';
          let pkgSize = Number(itemObj.packagingSize ?? itemObj.packaging_size) || 1;
          if (pkgSize <= 1) {
            const lower = itemName.toLowerCase();
            if (lower.includes('5 mm') || lower.includes('6 mm')) pkgSize = 500;
            else if (lower.includes('7 mm') || lower.includes('8 mm')) pkgSize = 250;
          }
          const pkgUnit = itemObj.packagingUnit ?? itemObj.packaging_unit ?? 'Coil';
          const pkgQty = pkgSize > 1 ? Number((balance / pkgSize).toFixed(2)) : balance;
          const unitPrice = Number(it.unitPrice ?? it.unit_price) || 0;
          const taxRate = Number(it.taxRate ?? it.tax_rate ?? 18) || 18;

          return {
            id: `so-line-${order.id}-${idx}-${Date.now()}`,
            itemId: it.itemId || it.item_id,
            itemCode: itemObj.itemCode ?? itemObj.item_code ?? it.itemCode,
            itemName,
            uomId: it.uomId ?? it.uom_id,
            uomCode: it.uom?.code ?? it.uom?.name ?? 'M',
            packagingSize: pkgSize,
            packagingUnit: pkgUnit,
            packageQuantity: pkgQty,
            quantity: balance,
            rate: unitPrice,
            taxPercent: taxRate,
            discountPercent: 0,
            lineTotal: Math.round(balance * unitPrice * (1 + taxRate / 100) * 100) / 100,
            salesOrderId: order.id,
            salesOrderNumber: order.orderNumber,
            customerPo: order.customerPo,
            orderQuantity: qty,
            orderBalance: balance,
          };
        });
      allPendingLines.push(...orderLines);
    });

    setLineItems(allPendingLines);
    setSelectedSoInfo({
      orderNumber: linkedOrderNumbers.join(', '),
      customerPo: linkedPos.join(', '),
      pendingCount: allPendingLines.length,
    });
    message.success(`${selectedOrders.length} SOC(s) linked: ${allPendingLines.length} balance item(s) loaded`);
  };

  const handleSalesOrderChange = handleSalesOrdersChange;

  const handleCustomerPoChange = (po: string) => {
    form.setFieldValue('customerPo', po);
    const matchedOrders = customerSalesOrders.filter((o: any) => o.customerPo === po);
    if (matchedOrders.length > 0) {
      handleSalesOrdersChange(matchedOrders.map((o: any) => o.id));
    }
  };

  const buildCurrentDeliveryDraft = () => {
    const values = form.getFieldsValue();
    const matchedCustomer = customers.find(c => c.id === values.customerId);
    const custName = matchedCustomer ? (matchedCustomer.companyName || matchedCustomer.name) : 'Customer';
    const soIds = Array.isArray(values.salesOrderIds) ? values.salesOrderIds : (values.salesOrderId ? [values.salesOrderId] : []);
    const matchedOrders = allSalesOrders.filter(o => soIds.includes(o.id));
    const orderNumbers = matchedOrders.map(o => o.orderNumber).filter(Boolean).join(', ');
    const warehouse = warehouses.find(w => w.id === values.warehouseId);
    const subtotal = lineItems.reduce((acc, it) => acc + (Number(it.lineTotal) || (Number(it.quantity) * Number(it.rate))), 0);

    return {
      id: editingItem?.id || 'draft-preview',
      deliveryNumber: editingItem?.deliveryNumber || 'DRAFT-DN',
      salesOrderId: soIds[0] || values.salesOrderId,
      salesOrderNumber: orderNumbers || (values.salesOrderId ? `SO-${values.salesOrderId.slice(0, 8)}` : 'Direct Delivery'),
      salesOrder: matchedOrders[0],
      customerPo: values.customerPo || matchedOrders.map(o => o.customerPo).filter(Boolean).join(', '),
      customerId: values.customerId,
      companyName: custName,
      customer: matchedCustomer,
      deliveryDate: values.deliveryDate || dayjs().format('YYYY-MM-DD'),
      expectedDate: values.expectedDate,
      warehouseId: values.warehouseId,
      warehouseName: warehouse?.name,
      carrier: values.carrier || 'PWI Logistics Dispatch',
      trackingNumber: values.trackingNumber || '-',
      notes: values.notes,
      subtotal,
      taxAmount: 0,
      totalAmount: subtotal,
      status: editingItem?.status || 'DRAFT',
      lines: lineItems.map((l, idx) => ({
        id: l.id || `line-${idx}`,
        itemCode: l.itemCode,
        description: (l.itemName || (l as any).description || 'Item') + (l.salesOrderNumber ? ` [SOC: ${l.salesOrderNumber}]` : ''),
        itemName: l.itemName || 'Item',
        quantity: Number(l.quantity) || 1,
        packageQuantity: l.packageQuantity,
        packagingUnit: l.packagingUnit,
        packagingSize: l.packagingSize,
        uomCode: l.uomCode || 'M',
        unitPrice: Number(l.rate) || 0,
        taxAmount: 0,
        lineTotal: Number(l.lineTotal) || (Number(l.quantity) * Number(l.rate)),
      })),
    };
  };

  const handleModalPreviewGatePass = () => {
    const draft = buildCurrentDeliveryDraft();
    if (draft.lines.length === 0) {
      message.warning('Please add at least one line item to preview the gate pass');
      return;
    }
    handlePrintOutwardGatePass(draft as any);
  };

  const handleModalPrintChallan = () => {
    const draft = buildCurrentDeliveryDraft();
    if (draft.lines.length === 0) {
      message.warning('Please add at least one line item to print the delivery challan');
      return;
    }
    printDeliveryNoteDocument(draft as any);
  };

  const handleEdit = async (record: SalesDelivery) => {
    setEditingItem(record);
    let fullDelivery = record;
    try {
      const response = await apiService.get<any>(`/sales/deliveries/${record.id}`);
      fullDelivery = (response as any)?.data || response;
    } catch {
      // fallback to record
    }

    if (fullDelivery.customerId) {
      const orders = allSalesOrders.filter((o: any) => o.customerId === fullDelivery.customerId);
      setCustomerSalesOrders(orders);
      const pos = Array.from(new Set(orders.map((o: any) => o.customerPo).filter((p: any) => Boolean(p && String(p).trim())))) as string[];
      setCustomerPos(pos);
    }
    if (fullDelivery.salesOrderId) {
      const matchedOrder = allSalesOrders.find((o: any) => o.id === fullDelivery.salesOrderId);
      if (matchedOrder) {
        setSelectedSoInfo({
          orderNumber: matchedOrder.orderNumber,
          customerPo: (fullDelivery as any).customerPo || matchedOrder.customerPo,
          pendingCount: fullDelivery.lines?.length || 0,
        });
      }
    } else {
      setSelectedSoInfo(null);
    }

    form.setFieldsValue({
      salesOrderId: fullDelivery.salesOrderId,
      salesOrderIds: fullDelivery.salesOrderId ? [fullDelivery.salesOrderId] : [],
      customerPo: (fullDelivery as any).customerPo || (fullDelivery as any).salesOrder?.customerPo,
      customerId: fullDelivery.customerId,
      deliveryDate: fullDelivery.deliveryDate ? dayjs(fullDelivery.deliveryDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      expectedDate: fullDelivery.expectedDate ? dayjs(fullDelivery.expectedDate).format('YYYY-MM-DD') : undefined,
      warehouseId: fullDelivery.warehouseId,
      carrier: fullDelivery.carrier,
      trackingNumber: fullDelivery.trackingNumber,
      notes: fullDelivery.notes,
    });
    if (fullDelivery.lines && Array.isArray(fullDelivery.lines) && fullDelivery.lines.length > 0) {
      setLineItems(fullDelivery.lines.map((l: any, idx: number) => ({
        id: l.id || `line-${idx}`,
        itemId: l.itemId,
        itemCode: l.item?.itemCode || l.itemCode,
        itemName: l.description || l.item?.name || 'Item',
        uomId: l.uomId || l.item?.uomId,
        warehouseId: l.warehouseId || fullDelivery.warehouseId,
        quantity: Number(l.quantity) || 1,
        rate: Number(l.unitPrice ?? l.rate) || 0,
        taxPercent: Number(l.taxRate ?? (l.taxAmount && l.quantity && l.unitPrice ? (l.taxAmount / (l.quantity * l.unitPrice)) * 100 : 18)) || 18,
        discountPercent: Number(l.discountPercent) || 0,
        lineTotal: Number(l.lineTotal) || ((Number(l.quantity) || 1) * (Number(l.unitPrice ?? l.rate) || 0)),
      })));
    } else {
      setLineItems([]);
    }
    setModalVisible(true);
  };

  const handleViewDetail = async (record: SalesDelivery) => {
    try {
      const response = await apiService.get<any>(`/sales/deliveries/${record.id}`);
      const data = (response as any)?.data || response;
      setDetailItem(data);
      setDetailVisible(true);
    } catch {
      setDetailItem(record);
      setDetailVisible(true);
    }
  };

  const executeSave = async (payloadOverride?: any) => {
    const payload = payloadOverride || pendingSavePayload;
    if (!payload) return;
    try {
      if (editingItem) {
        await apiService.patch(`/sales/deliveries/${editingItem.id}`, payload);
        message.success('Delivery updated successfully');
      } else {
        await apiService.post('/sales/deliveries', payload);
        message.success('Delivery created successfully');
      }
      setWarningModalVisible(false);
      setPendingSavePayload(null);
      setPendingExcessWarnings([]);
      setModalVisible(false);
      fetchData(page, pageSize);
    } catch (error: any) {
      const resp = error?.response?.data;
      const msg = resp?.message || error?.message;
      message.error(Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : 'Failed to save delivery'));
    }
  };

  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one line item');
        return;
      }

      const soIds = Array.isArray(values.salesOrderIds) ? values.salesOrderIds : (values.salesOrderId ? [values.salesOrderId] : []);
      const primarySoId = soIds[0] || values.salesOrderId || null;

      // Check for excess lines over SOC balance
      const excessLines: Array<{
        itemCode: string;
        itemName: string;
        orderNumber?: string;
        orderBalance: number;
        enteredQty: number;
        excessQty: number;
        uom: string;
      }> = [];

      lineItems.forEach((l) => {
        if (l.orderBalance !== undefined && l.orderBalance !== null) {
          const qty = Number(l.quantity || 0);
          const bal = Number(l.orderBalance || 0);
          if (qty > bal) {
            excessLines.push({
              itemCode: l.itemCode || '-',
              itemName: l.itemName || 'Item',
              orderNumber: l.salesOrderNumber,
              orderBalance: bal,
              enteredQty: qty,
              excessQty: qty - bal,
              uom: l.uomCode || 'M',
            });
          }
        }
      });

      const payload = {
        ...values,
        salesOrderId: primarySoId,
        customerPo: values.customerPo || null,
        deliveryDate: values.deliveryDate ? dayjs(values.deliveryDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        expectedDate: values.expectedDate ? dayjs(values.expectedDate).format('YYYY-MM-DD') : null,
        carrier: values.carrier || null,
        trackingNumber: values.trackingNumber || null,
        notes: values.notes || null,
        lines: lineItems.map((l) => {
          const pkgNote = l.packageQuantity && l.packagingSize ? ` (${l.packageQuantity} ${l.packagingUnit || 'Coils'} × ${l.packagingSize} ${l.uomCode || 'M'})` : '';
          const socNote = l.salesOrderNumber ? ` [SOC: ${l.salesOrderNumber}]` : '';
          return {
            itemId: l.itemId,
            description: (l.itemName || (l as any).description || 'Item') + pkgNote + socNote,
            quantity: Number(l.quantity),
            uomId: l.uomId,
            warehouseId: l.warehouseId || values.warehouseId,
            unitPrice: Number(l.rate),
            taxAmount: Number(l.lineTotal || 0) - (Number(l.quantity) * Number(l.rate)),
            lineTotal: Number(l.lineTotal),
          };
        }),
      };

      if (excessLines.length > 0) {
        setPendingExcessWarnings(excessLines);
        setPendingSavePayload(payload);
        setWarningModalVisible(true);
        return;
      }

      await executeSave(payload);
    } catch (error: any) {
      const resp = error?.response?.data;
      const msg = resp?.message || error?.message;
      message.error(Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : 'Failed to save delivery'));
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/sales/deliveries/${id}/${action}`);
      message.success(`Delivery ${action} successfully`);
      fetchData(page, pageSize);
    } catch (error: any) {
      const resp = error?.response?.data;
      const msg = resp?.message || error?.message;
      message.error(Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : `Failed to ${action} delivery`));
    }
  };

  const handleConvertToInvoice = async (record: SalesDelivery) => {
    try {
      const res = await apiService.post<any>(`/sales/deliveries/${record.id}/convert-to-invoice`, {
        invoiceDate: dayjs().format('YYYY-MM-DD'),
        notes: `Generated from Delivery Note ${record.deliveryNumber}`,
      });
      message.success(`Sales Invoice ${res.invoiceNo || 'created'} successfully!`);
      fetchData(page, pageSize);
      if (detailVisible) {
        handleViewDetail(record);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : (msg || 'Failed to create invoice from delivery'));
    }
  };

  // Pixel-Perfect Multi-line Columns mirroring Invoices Design
  const columns: ColumnsType<SalesDelivery> = [
    {
      title: 'Delivery',
      key: 'delivery',
      width: 230,
      render: (_, record) => {
        const cust = customers.find(c => c.id === record.customerId);
        const custName = cust?.companyName || cust?.name || record.companyName || 'Customer';
        return (
          <div className="inv-doc-cell">
            <div className="inv-doc-code">{record.deliveryNumber}</div>
            <div className="inv-sub-row">
              <span className="badge-inv-type">
                <CarOutlined style={{ marginRight: 3 }} /> Delivery
              </span>
              <span className="inv-sub-val" style={{ textTransform: 'uppercase' }}>
                {record.status}
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
            {record.divisionName && (
              <div className="inv-sub-row">
                <span className="badge-inv-type" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                  <ApartmentOutlined style={{ marginRight: 3 }} /> {record.divisionName}
                </span>
              </div>
            )}
            {(record.salesOrderNumber || record.salesOrder?.orderNumber || (record as any).customerPo) && (
              <div className="inv-sub-row">
                {(record.salesOrderNumber || record.salesOrder?.orderNumber) && (
                  <span className="badge-inv-type" style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}>
                    <BranchesOutlined style={{ marginRight: 3 }} /> {record.salesOrderNumber || record.salesOrder?.orderNumber}
                  </span>
                )}
                {(record as any).customerPo && (
                  <span className="inv-sub-val" style={{ color: '#fbbf24', fontSize: 11, fontWeight: 600 }}>
                    PO: {(record as any).customerPo}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Dates',
      key: 'dates',
      width: 170,
      render: (_, record) => (
        <div className="inv-dates-cell">
          <div className="inv-date-row">
            <span className="badge-inv-date">
              <CalendarOutlined style={{ marginRight: 3 }} /> Date
            </span>
            <span className="inv-date-val">
              {record.deliveryDate ? dayjs(record.deliveryDate).format('MMM DD, YYYY') : '-'}
            </span>
          </div>
          {record.expectedDate && (
            <div className="inv-date-row">
              <span className="badge-inv-due">
                <CalendarOutlined style={{ marginRight: 3 }} /> Expected
              </span>
              <span className="inv-date-val">
                {dayjs(record.expectedDate).format('MMM DD, YYYY')}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Logistics',
      key: 'logistics',
      width: 200,
      render: (_, record) => {
        const wh = warehouses.find(w => w.id === record.warehouseId);
        return (
          <div className="inv-dates-cell">
            <div className="inv-date-row">
              <span className="badge-inv-terms">
                <CarOutlined style={{ marginRight: 3 }} /> Carrier
              </span>
              <span className="inv-date-val" style={{ fontWeight: 600 }}>
                {record.carrier || 'Standard Transport'}
              </span>
            </div>
            {record.trackingNumber && (
              <div className="inv-date-row">
                <span className="badge-inv-date">
                  <NumberOutlined style={{ marginRight: 3 }} /> Track #
                </span>
                <span className="inv-date-val" style={{ fontFamily: 'monospace' }}>
                  {record.trackingNumber}
                </span>
              </div>
            )}
            {wh && (
              <div className="inv-date-row">
                <span className="badge-inv-subtotal">
                  <ShopOutlined style={{ marginRight: 3 }} /> Warehouse
                </span>
                <span className="inv-date-val">{wh.name}</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Amounts',
      key: 'amounts',
      width: 190,
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
            <span className="badge-inv-total">Total</span>
            <span className="inv-amt-val inv-amt-bold">Rs {formatDecimal(record.totalAmount || 0)}</span>
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
        const s = (record.status || '').toUpperCase();
        let cls = 'status-pending';
        if (s === 'DELIVERED' || s === 'CONFIRMED') cls = 'status-paid';
        else if (s === 'SHIPPED') cls = 'status-partial';
        else if (s === 'CANCELLED') cls = 'status-cancelled';

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
      width: 200,
      align: 'center',
      render: (_, record) => {
        const s = (record.status || '').toUpperCase();
        return (
          <div className="inv-actions-wrapper">
            <Tooltip title="View Details">
              <button className="inv-action-btn inv-btn-view" onClick={() => handleViewDetail(record)}>
                <EyeOutlined />
              </button>
            </Tooltip>
            <Tooltip title="Print Delivery Challan">
              <button className="inv-action-btn inv-btn-print" onClick={() => printDeliveryNoteDocument(record)}>
                <PrinterOutlined />
              </button>
            </Tooltip>
            <Tooltip title="Print Outward Gate Pass">
              <button
                className="inv-action-btn"
                style={{ backgroundColor: '#b45309', color: '#fff' }}
                onClick={() => handlePrintOutwardGatePass(record)}
              >
                <SafetyCertificateOutlined />
              </button>
            </Tooltip>
            <Tooltip title="Edit Delivery">
              <button
                className="inv-action-btn inv-btn-edit"
                onClick={() => handleEdit(record)}
                disabled={s !== 'DRAFT'}
              >
                <EditOutlined />
              </button>
            </Tooltip>
            {s === 'DRAFT' && (
              <Tooltip title="Ship Delivery">
                <button
                  className="inv-action-btn inv-btn-pay"
                  style={{ backgroundColor: '#3b82f6', color: '#fff' }}
                  onClick={() => handleAction(record.id, 'ship')}
                >
                  <CarOutlined />
                </button>
              </Tooltip>
            )}
            {s === 'SHIPPED' && (
              <Tooltip title="Mark Delivered">
                <button
                  className="inv-action-btn inv-btn-pay"
                  style={{ backgroundColor: '#10b981', color: '#fff' }}
                  onClick={() => handleAction(record.id, 'deliver')}
                >
                  <InboxOutlined />
                </button>
              </Tooltip>
            )}
            {s === 'DELIVERED' && (
              <Tooltip title="Confirm Delivery (Post Stock OUT)">
                <button
                  className="inv-action-btn inv-btn-pay"
                  style={{ backgroundColor: '#16a34a', color: '#fff' }}
                  onClick={() => handleAction(record.id, 'confirm')}
                >
                  <CheckOutlined />
                </button>
              </Tooltip>
            )}
            {['CONFIRMED', 'DELIVERED'].includes(s) && (
              <Tooltip title="Generate Sales Invoice">
                <button
                  className="inv-action-btn"
                  style={{ backgroundColor: '#ea580c', color: '#fff' }}
                  onClick={() => handleConvertToInvoice(record)}
                >
                  <FileTextOutlined />
                </button>
              </Tooltip>
            )}
            {s !== 'CANCELLED' && s !== 'CONFIRMED' && (
              <Tooltip title="Cancel Delivery">
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
  const totalEntries = total > 0 ? total : displayedDeliveries.length;
  const startEntry = totalEntries === 0 ? 0 : (page - 1) * pageSize + 1;
  const endEntry = Math.min(page * pageSize, totalEntries);
  const totalPages = Math.ceil(totalEntries / pageSize) || 1;

  return (
    <div className="inv-page-container">
      {/* Main Card */}
      <div className="inv-main-card">
        {/* Card Header Title */}
        <div className="inv-card-header">
          <CarOutlined className="inv-card-header-icon" />
          <h2 className="inv-card-header-title">Deliveries</h2>
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
            className={`inv-chevron-item chev-partial ${activeChevron === 'SHIPPED' ? 'active' : ''}`}
            onClick={() => setActiveChevron('SHIPPED')}
          >
            SHIPPED ({chevronCounts.shipped})
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

        {/* Controls Row: Search Bar, Filters Toggle & Show Entries */}
        <div className="inv-controls-row">
          <div className="inv-search-control">
            <span className="inv-search-label">Search:</span>
            <Input
              className="inv-search-input"
              placeholder="Search deliveries, tracking..."
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={() => fetchData(1, pageSize)}
              allowClear
            />
          </div>

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
                  Filter Deliveries
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

              {/* Box 2: CARRIER */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <CarOutlined /> CARRIER
                </div>
                <Select
                  placeholder="All carriers"
                  allowClear
                  className="inv-filter-box-select"
                  value={filterCarrier}
                  onChange={(val) => setFilterCarrier(val)}
                >
                  {availableCarriers.map(c => (
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
          dataSource={displayedDeliveries}
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

      {/* Create / Edit Delivery Modal */}
      <DraggableResizableModal
        title={editingItem ? 'Edit Delivery Note' : 'Create Sales Delivery'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={1060}
        footer={[
          <Button
            key="preview-gp"
            icon={<SafetyCertificateOutlined />}
            style={{ backgroundColor: '#0284c7', borderColor: '#0284c7', color: '#fff', fontWeight: 600 }}
            onClick={handleModalPreviewGatePass}
          >
            📄 Preview Gate Pass
          </Button>,
          <Button
            key="preview-dc"
            icon={<PrinterOutlined />}
            style={{ backgroundColor: '#475569', borderColor: '#475569', color: '#fff', fontWeight: 600 }}
            onClick={handleModalPrintChallan}
          >
            🖨️ Print Delivery Challan
          </Button>,
          <Button key="cancel" onClick={() => setModalVisible(false)}>
            Cancel
          </Button>,
          <Button key="submit" type="primary" onClick={handleSubmitForm}>
            {editingItem ? 'Update Delivery' : 'Save & Create Delivery'}
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Please select customer' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select customer"
                  onChange={handleCustomerChange}
                  options={customers.map((c) => ({ value: c.id, label: `${c.customerCode ? `[${c.customerCode}] ` : ''}${c.companyName || c.name}` }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="warehouseId" label="Warehouse">
                <Select
                  allowClear
                  placeholder="Select warehouse"
                  options={warehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customerPo" label="Customer PO #">
                <Select
                  allowClear
                  showSearch
                  placeholder={customerPos.length > 0 ? "Select Customer PO" : "Select Customer first (or type PO)"}
                  onChange={handleCustomerPoChange}
                  options={customerPos.map(po => ({ value: po, label: po }))}
                  notFoundContent={customerPos.length === 0 ? "No active POs found for customer" : undefined}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="salesOrderIds" label="Sales Order Confirmation(s) (SOC #) — Multi-Select Allowed">
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder={customerSalesOrders.length > 0 ? "Select one or more SOCs..." : "Select Customer first"}
                  onChange={(val) => handleSalesOrdersChange(val)}
                  options={customerSalesOrders.map((so) => ({
                    value: so.id,
                    label: `${so.orderNumber}${so.customerPo ? ` (PO: ${so.customerPo})` : ''} — ${so.items?.length || 0} items`,
                  }))}
                  notFoundContent={customerSalesOrders.length === 0 ? "No pending sales orders for customer" : undefined}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Active Order Banner */}
          {selectedSoInfo && (
            <div style={{
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 6,
              background: 'rgba(37, 99, 235, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <BranchesOutlined style={{ color: '#38bdf8', fontSize: 16 }} />
                <span>
                  Linked SOC: <strong style={{ color: '#38bdf8' }}>{selectedSoInfo.orderNumber}</strong>
                  {selectedSoInfo.customerPo ? <span> (Customer PO: <strong style={{ color: '#fbbf24' }}>{selectedSoInfo.customerPo}</strong>)</span> : null}
                </span>
              </div>
              <Tag color="cyan" style={{ fontWeight: 700, margin: 0 }}>
                {selectedSoInfo.pendingCount} Balance Item(s) Auto-Loaded
              </Tag>
            </div>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="deliveryDate" label="Delivery Date (Dispatch Date)" rules={[{ required: true, message: 'Please specify delivery date' }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="expectedDate" label="Expected Date (from Order / Agreement)">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>

          {/* Dynamic Early / On-Time / Delayed Dispatch Tag */}
          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.deliveryDate !== currentValues.deliveryDate ||
              prevValues.expectedDate !== currentValues.expectedDate
            }
          >
            {({ getFieldValue }) => {
              const dDate = getFieldValue('deliveryDate');
              const eDate = getFieldValue('expectedDate');
              if (!dDate || !eDate) return null;
              const diffDays = dayjs(eDate).diff(dayjs(dDate), 'day');
              return (
                <div style={{
                  marginBottom: 16,
                  padding: '8px 14px',
                  borderRadius: 6,
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <span style={{ fontSize: 12, color: 'var(--inv-text-muted, #94a3b8)', fontWeight: 600 }}>
                    DISPATCH TIMELINE:
                  </span>
                  {diffDays > 0 ? (
                    <Tag color="cyan" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4, fontWeight: 700 }}>
                      🎉 {diffDays} {diffDays === 1 ? 'Day' : 'Days'} Early Dispatch (Ahead of Schedule)
                    </Tag>
                  ) : diffDays === 0 ? (
                    <Tag color="green" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4, fontWeight: 700 }}>
                      ⏱️ On-Time Dispatch (Matches Expected Delivery Date)
                    </Tag>
                  ) : (
                    <Tag color="volcano" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4, fontWeight: 700 }}>
                      ⚠️ Delayed Dispatch by {Math.abs(diffDays)} {Math.abs(diffDays) === 1 ? 'Day' : 'Days'}
                    </Tag>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--inv-text-muted, #94a3b8)', marginLeft: 'auto' }}>
                    Delivery: {dayjs(dDate).format('DD/MM/YYYY')} vs Expected: {dayjs(eDate).format('DD/MM/YYYY')}
                  </span>
                </div>
              );
            }}
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="carrier" label="Carrier / Transport">
                <Input placeholder="e.g. TCS / Cargo / Pakistan Railway / PWI Fleet" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="trackingNumber" label="Tracking Number / Bilty #">
                <Input placeholder="e.g. TRK-892147 / BL-4412" />
              </Form.Item>
            </Col>
          </Row>

          <ERPLineItems companyId={companyId} value={lineItems} onChange={setLineItems} showWarehouse={false} label="Delivery Items" currency="PKR" />
          <Form.Item name="notes" label="Dispatch & Delivery Notes">
            <Input.TextArea rows={3} placeholder="Add any special handling or delivery instructions..." />
          </Form.Item>
        </Form>
      </DraggableResizableModal>

      {/* ── PROMINENT CONFIRMATION & WARNING MODAL ── */}
      <Modal
        open={warningModalVisible}
        onCancel={() => setWarningModalVisible(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ef4444' }}>
            <WarningFilled style={{ fontSize: 24, color: '#ef4444' }} />
            <span style={{ fontSize: 17, fontWeight: 800 }}>⚠️ DISPATCH QUANTITY EXCEEDS ORDER CONFIRMATION (SOC)</span>
          </div>
        }
        width={740}
        centered
        footer={[
          <Button
            key="cancel"
            size="large"
            onClick={() => setWarningModalVisible(false)}
            style={{ fontWeight: 600, height: 42, padding: '0 20px' }}
          >
            Cancel & Adjust Quantities
          </Button>,
          <Button
            key="confirm"
            type="primary"
            danger
            size="large"
            onClick={() => executeSave()}
            style={{ fontWeight: 700, height: 42, padding: '0 20px', backgroundColor: '#dc2626', borderColor: '#dc2626' }}
          >
            Confirm & Dispatch Anyway
          </Button>,
        ]}
      >
        <div style={{ padding: '12px 0' }}>
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1.5px solid #ef4444',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
              ⚠️ Dispatch quantity exceeds the approved order balance! (Order Excess Detected)
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--inv-text-primary, #cbd5e1)', lineHeight: 1.5 }}>
              The following items have quantities exceeding their approved Sales Order (SOC) balance. If you proceed with this dispatch, the order will be over-dispatched.
            </div>
          </div>

          <Table
            size="small"
            dataSource={pendingExcessWarnings}
            rowKey={(r) => `${r.itemCode}-${r.orderNumber || ''}`}
            pagination={false}
            columns={[
              {
                title: 'Item',
                key: 'item',
                render: (_, r) => (
                  <div>
                    <div style={{ fontWeight: 700 }}>{r.itemName}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{r.itemCode}</div>
                  </div>
                ),
              },
              {
                title: 'Linked SOC #',
                dataIndex: 'orderNumber',
                key: 'orderNumber',
                render: (val) => <Tag color="geekblue" style={{ fontWeight: 700 }}>{val || 'Direct'}</Tag>,
              },
              {
                title: 'Max Order Bal',
                key: 'orderBalance',
                align: 'right',
                render: (_, r) => (
                  <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                    {r.orderBalance.toLocaleString()} {r.uom}
                  </span>
                ),
              },
              {
                title: 'Entered Qty',
                key: 'enteredQty',
                align: 'right',
                render: (_, r) => (
                  <span style={{ fontWeight: 700, color: '#f87171' }}>
                    {r.enteredQty.toLocaleString()} {r.uom}
                  </span>
                ),
              },
              {
                title: 'Excess Quantity',
                key: 'excessQty',
                align: 'right',
                render: (_, r) => (
                  <Tag color="error" style={{ fontSize: 12, fontWeight: 800, padding: '2px 8px' }}>
                    +{r.excessQty.toLocaleString()} {r.uom}
                  </Tag>
                ),
              },
            ]}
          />

          <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--inv-text-muted, #94a3b8)', textAlign: 'center' }}>
            Do you really want to confirm the delivery and gate pass with this excess quantity?
          </div>
        </div>
      </Modal>

      {/* Detail Modal - Reference 2-Column Split Design */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CarOutlined style={{ color: '#2563eb' }} />
            <span style={{ fontWeight: 800 }}>Delivery Note Details: {detailItem?.deliveryNumber}</span>
            {detailItem?.status && (
              <Tag color={['DELIVERED', 'CONFIRMED'].includes(detailItem.status.toUpperCase()) ? 'green' : 'orange'} style={{ fontWeight: 700, marginLeft: 6 }}>
                {detailItem.status}
              </Tag>
            )}
            {detailItem?.divisionName && (
              <Tag color="geekblue" style={{ fontWeight: 700 }}>
                {detailItem.divisionName}
              </Tag>
            )}
          </div>
        }
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="print" icon={<PrinterOutlined />} onClick={() => detailItem && printDeliveryNoteDocument(detailItem)}>
            Print Delivery Challan
          </Button>,
          <Button
            key="gatepass"
            style={{ backgroundColor: '#b45309', borderColor: '#b45309', color: '#fff' }}
            icon={<SafetyCertificateOutlined />}
            onClick={() => detailItem && handlePrintOutwardGatePass(detailItem)}
          >
            Print Outward Gate Pass
          </Button>,
          detailItem && ['DRAFT', 'SHIPPED'].includes((detailItem.status || '').toUpperCase()) && (
            <Button
              key="confirm"
              type="primary"
              icon={<CheckOutlined />}
              style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
              onClick={() => {
                handleAction(detailItem.id, 'confirm');
                setDetailVisible(false);
              }}
            >
              Post & Deduct Inventory
            </Button>
          ),
          detailItem && ['CONFIRMED', 'DELIVERED', 'SHIPPED'].includes((detailItem.status || '').toUpperCase()) && (
            <Button
              key="invoice"
              type="primary"
              icon={<FileTextOutlined />}
              style={{ backgroundColor: '#ea580c', borderColor: '#ea580c' }}
              onClick={() => {
                handleConvertToInvoice(detailItem);
              }}
            >
              Generate Sales Invoice
            </Button>
          ),
          <Button key="close" onClick={() => setDetailVisible(false)}>
            Close
          </Button>,
        ]}
        width={1120}
      >
        {detailItem && (() => {
          const salesOrderDisplay = detailItem.salesOrderNumber || detailItem.salesOrder?.orderNumber || (detailItem.salesOrderId ? `SO-${detailItem.salesOrderId.slice(0, 8).toUpperCase()}` : 'Direct Delivery');
          const effectiveDivision = detailItem.divisionName || detailItem.salesOrder?.division?.name || 'Control Cable Division';

          return (
            <div className="doc-split-layout">
              {/* LEFT SIDEBAR (~320px) */}
              <div className="doc-split-sidebar">
                {/* Brand & Division */}
                <div className="doc-sidebar-brand">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ApartmentOutlined style={{ color: '#2563eb', fontSize: 16 }} />
                    <div className="doc-sidebar-company-title">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
                  </div>
                  <Tag color="geekblue" style={{ fontWeight: 700, marginTop: 4, width: 'fit-content', padding: '2px 8px' }}>
                    {effectiveDivision}
                  </Tag>
                </div>

                {/* Total Box */}
                <div className="doc-sidebar-total-card">
                  <div className="doc-sidebar-total-label">TOTAL DISPATCH VALUE</div>
                  <div className="doc-sidebar-total-val">Rs {formatDecimal(detailItem.totalAmount || 0)}</div>
                  <div className="doc-sidebar-total-sub">
                    Status: <span style={{ fontWeight: 700, color: ['DELIVERED', 'CONFIRMED'].includes((detailItem.status || '').toUpperCase()) ? '#10b981' : '#f59e0b' }}>{detailItem.status}</span>
                  </div>
                </div>

                {/* Quick Actions in Left Sidebar */}
                <div className="doc-sidebar-actions">
                  <Button
                    type="primary"
                    icon={<PrinterOutlined />}
                    block
                    onClick={() => printDeliveryNoteDocument(detailItem)}
                  >
                    Print Delivery Challan
                  </Button>
                  <Button
                    icon={<SafetyCertificateOutlined />}
                    block
                    style={{ backgroundColor: '#b45309', borderColor: '#b45309', color: '#fff' }}
                    onClick={() => handlePrintOutwardGatePass(detailItem)}
                  >
                    Print Outward Gate Pass
                  </Button>
                  {['CONFIRMED', 'DELIVERED', 'SHIPPED'].includes((detailItem.status || '').toUpperCase()) && (
                    <Button
                      type="primary"
                      icon={<FileTextOutlined />}
                      block
                      style={{ backgroundColor: '#ea580c', borderColor: '#ea580c' }}
                      onClick={() => handleConvertToInvoice(detailItem)}
                    >
                      Generate Sales Invoice
                    </Button>
                  )}
                </div>

                {/* From Section */}
                <div className="doc-sidebar-section">
                  <div className="doc-sidebar-section-title">
                    <ShopOutlined style={{ color: '#2563eb' }} /> FROM (DISPATCH ORIGIN)
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--inv-text-primary)' }}>
                    {effectiveDivision}
                  </div>
                  <div style={{ color: 'var(--inv-text-muted)' }}>
                    {warehouses.find(w => w.id === detailItem.warehouseId)?.name || 'Main Factory Dispatch / Store'}
                  </div>
                </div>

                {/* Bill To Section */}
                <div className="doc-sidebar-section">
                  <div className="doc-sidebar-section-title">
                    <UserOutlined style={{ color: '#16a34a' }} /> BILL TO / CUSTOMER
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--inv-text-primary)' }}>
                    {getCustomerDisplayName(detailItem)}
                  </div>
                  <div style={{ color: 'var(--inv-text-muted)' }}>
                    {detailItem.shipToAddress || 'Factory Gate Dispatch'}
                  </div>
                </div>

                {/* Document Metadata Section */}
                <div className="doc-sidebar-section">
                  <div className="doc-sidebar-section-title">
                    <FileTextOutlined style={{ color: '#f59e0b' }} /> DOCUMENT
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k"># Number:</span>
                    <span className="doc-sidebar-v">{detailItem.deliveryNumber}</span>
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k">Sales Order #:</span>
                    <span className="doc-sidebar-v" style={{ color: '#38bdf8' }}>{salesOrderDisplay}</span>
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k">Customer PO #:</span>
                    <span className="doc-sidebar-v" style={{ color: '#fbbf24', fontWeight: 700 }}>
                      {detailItem.customerPo || (detailItem as any).salesOrder?.customerPo || '-'}
                    </span>
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k">Delivery Date:</span>
                    <span className="doc-sidebar-v">{detailItem.deliveryDate ? dayjs(detailItem.deliveryDate).format('MMM DD, YYYY') : '-'}</span>
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k">Expected Date:</span>
                    <span className="doc-sidebar-v">{detailItem.expectedDate ? dayjs(detailItem.expectedDate).format('MMM DD, YYYY') : '-'}</span>
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k">Carrier / Fleet:</span>
                    <span className="doc-sidebar-v">{detailItem.carrier || 'Standard Fleet'}</span>
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k">Tracking #:</span>
                    <span className="doc-sidebar-v">{detailItem.trackingNumber || '-'}</span>
                  </div>
                </div>
              </div>

              {/* RIGHT MAIN PANEL */}
              <div className="doc-split-main">
                {/* Traceability Flow */}
                <div className="doc-traceability-banner" style={{ margin: 0 }}>
                  <div className="doc-traceability-title">
                    <BranchesOutlined style={{ color: '#2563eb' }} />
                    <span>Document Traceability</span>
                  </div>
                  <Row gutter={12}>
                    <Col span={8}>
                      <div className="doc-traceability-step">
                        <div className="doc-step-label">ORIGINATING SALES ORDER</div>
                        <div className="doc-step-val" style={{ color: '#38bdf8' }}>{salesOrderDisplay}</div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div className="doc-traceability-step active-step">
                        <div className="doc-step-label" style={{ color: '#38bdf8' }}>DELIVERY NOTE (THIS)</div>
                        <div className="doc-step-val" style={{ color: '#60a5fa' }}>{detailItem.deliveryNumber} [{detailItem.status}]</div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div className="doc-traceability-step">
                        <div className="doc-step-label">GENERATED SALES INVOICE</div>
                        {detailItem.relatedInvoices && detailItem.relatedInvoices.length > 0 ? (
                          detailItem.relatedInvoices.map(inv => (
                            <div key={inv.id} className="doc-step-val" style={{ color: '#fb923c', fontSize: 12 }}>
                              {inv.invoiceNumber || inv.invoiceNo} [{inv.status}]
                            </div>
                          ))
                        ) : (
                          <div className="doc-step-sub" style={{ color: 'var(--inv-text-muted, #94a3b8)' }}>Pending Invoicing</div>
                        )}
                      </div>
                    </Col>
                  </Row>
                </div>

                {/* Items Table matching reference image */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dispatched Items</span>
                    <Tag color="blue">{detailItem.lines?.length || 0} ITEMS</Tag>
                  </div>
                  <Table
                    className="doc-reference-table"
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={detailItem.lines || []}
                    columns={[
                      { title: '#', key: 'idx', width: 45, align: 'center', render: (_: any, __: any, index: number) => index + 1 },
                      { title: 'PRODUCT / DESCRIPTION', dataIndex: 'description', key: 'description' },
                      { title: 'QTY', dataIndex: 'quantity', key: 'quantity', width: 100, align: 'right', render: (v: any) => formatDecimal(v) },
                      { title: 'RATE', dataIndex: 'unitPrice', key: 'unitPrice', width: 120, align: 'right', render: (v: any) => `Rs ${formatDecimal(v)}` },
                      { title: 'TAX', dataIndex: 'taxAmount', key: 'taxAmount', width: 110, align: 'right', render: (v: any) => `Rs ${formatDecimal(v || 0)}` },
                      { title: 'AMOUNT', dataIndex: 'lineTotal', key: 'lineTotal', width: 130, align: 'right', render: (v: any) => <strong>Rs ${formatDecimal(v)}</strong> },
                    ]}
                  />
                </div>

                {/* Bottom Financial Summary Box */}
                <div className="doc-summary-box">
                  <div className="doc-summary-row">
                    <span>Subtotal</span>
                    <span>Rs {formatDecimal(detailItem.subtotal)}</span>
                  </div>
                  <div className="doc-summary-row">
                    <span>Tax / GST</span>
                    <span>Rs {formatDecimal(detailItem.taxAmount)}</span>
                  </div>
                  <div className="doc-summary-row grand-total">
                    <span>Grand Total</span>
                    <span>Rs {formatDecimal(detailItem.totalAmount)}</span>
                  </div>
                </div>

                {detailItem.notes && (
                  <div style={{ padding: '10px 14px', borderRadius: 6, background: 'var(--inv-filter-card-bg)', border: '1px solid var(--inv-card-border)', fontSize: 12 }}>
                    <strong>Notes:</strong> {detailItem.notes}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </DraggableResizableModal>
    </div>
  );
};

export default SalesDeliveryManagement;
