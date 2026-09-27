import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Form, Input, Select, App,
  InputNumber, Descriptions, DatePicker, Tooltip,
  Modal, Tag,
} from 'antd';
import {
  PlusOutlined, EditOutlined, EyeOutlined, DollarOutlined,
  PrinterOutlined, ReloadOutlined, FileExcelOutlined,
  FilterOutlined, CloseCircleOutlined, CalendarOutlined,
  ClockCircleOutlined, FileTextOutlined, UserOutlined,
  UnorderedListOutlined, PercentageOutlined, CheckCircleOutlined,
  WalletOutlined, MailOutlined, WhatsAppOutlined, StopOutlined,
  DeleteOutlined, BranchesOutlined, ShopOutlined,
  ThunderboltOutlined, BarcodeOutlined, CameraOutlined, SoundOutlined,
  SaveOutlined, ClearOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { DeleteConfirmModal, SaveResultDialog } from '../../components/shared';
import type { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import GlobalLoading from '../../components/shared/GlobalLoading';
import { TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import './SalesInvoiceManagement.css';
import { printInvoiceDocument, printTableList } from '../../utils/printTemplates';

dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

interface SalesInvoice {
  id: string;
  invoiceNo: string;
  documentType?: string;
  salesOrderId?: string | null;
  salesDeliveryId?: string | null;
  relatedDelivery?: { id: string; deliveryNumber: string; deliveryDate: string; status: string } | null;
  relatedQuotation?: { id: string; quotationNumber: string; quotationDate: string } | null;
  customerId: string;
  customer?: {
    id: string;
    companyName?: string;
    name?: string;
    customerCode?: string;
    paymentTerms?: string;
  };
  companyName?: string;
  customerName?: string;
  paymentTerms?: string;
  invoiceDate: string;
  dueDate: string | null;
  subtotal: number;
  discountAmount?: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  originalInvoiceAmount?: number;
  creditNoteAmount?: number;
  outstandingAmount?: number;
  status: string;
  notes?: string;
  createdAt: string;
}

interface CustomerOption {
  id: string;
  name: string;
  customerCode?: string;
  outstandingBalance?: number;
}

export interface CreateInvoiceLineItem {
  id: string;
  productId: string;
  productName: string;
  itemCode?: string;
  quantity: number;
  price: number;
  discount: number;
  gstRate: number;
  lineTotal: number;
}

export const DEFAULT_PRODUCTS = [
  { id: 'prod-1', name: 'High Tensile Galvanized Wire 2.5mm', code: 'PWI-GW-250', stock: 1450, uom: 'kg', price: 340 },
  { id: 'prod-2', name: 'Hard Drawn Bright Wire 3.0mm', code: 'PWI-HD-300', stock: 2890, uom: 'kg', price: 310 },
  { id: 'prod-3', name: 'Annealed Binding Wire 1.6mm', code: 'PWI-BW-160', stock: 4200, uom: 'kg', price: 295 },
  { id: 'prod-4', name: 'High Carbon Spring Steel Wire', code: 'PWI-SW-400', stock: 680, uom: 'kg', price: 480 },
  { id: 'prod-5', name: 'Galvanized Barbed Wire 2.0mm', code: 'PWI-BB-200', stock: 1120, uom: 'kg', price: 365 },
  { id: 'prod-6', name: 'SAE 1008 Wire Rod 5.5mm', code: 'PWI-ROD-55', stock: 12500, uom: 'kg', price: 260 },
  { id: 'prod-7', name: 'Chain Link Fence Wire Mesh', code: 'PWI-CH-350', stock: 350, uom: 'rolls', price: 4200 },
  { id: 'prod-8', name: 'Zinc Phosphated Wire 4.0mm', code: 'PWI-PW-001', stock: 950, uom: 'kg', price: 390 },
];

const DOCUMENT_TYPES = ['All types', 'invoice', 'quotation', 'proforma'];

const SalesInvoiceManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<SalesInvoice[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Chevron Process filter state (Reference Image)
  const [activeChevron, setActiveChevron] = useState<string>('ALL');

  // Filter States
  const [filterDocType, setFilterDocType] = useState<string | undefined>(undefined);
  const [filterCustomer, setFilterCustomer] = useState<string | undefined>(undefined);
  const [filterOverdue, setFilterOverdue] = useState<string | undefined>(undefined);
  const [filterDateFrom, setFilterDateFrom] = useState<string | undefined>(undefined);
  const [filterDateTo, setFilterDateTo] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  // View Mode: 'list' | 'create' | 'edit' (Eliminating all 1965 cramped modals)
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'edit'>('list');

  // Executive Invoice Creation / Edit State (Matching User Screenshots 2, 3, 4)
  const [createDocType, setCreateDocType] = useState<string>('invoice');
  const [createCustomerId, setCreateCustomerId] = useState<string | undefined>(undefined);
  const [createDate, setCreateDate] = useState<dayjs.Dayjs | null>(dayjs());
  const [createDueDate, setCreateDueDate] = useState<dayjs.Dayjs | null>(dayjs().add(30, 'day'));
  const [createPaymentTerms, setCreatePaymentTerms] = useState<string>('net 30');
  const [createReference, setCreateReference] = useState<string>('');
  const [createOverallDiscount, setCreateOverallDiscount] = useState<number>(0);
  const [createShipping, setCreateShipping] = useState<number>(0);
  const [createNotes, setCreateNotes] = useState<string>('');
  const [scanText, setScanText] = useState<string>('');
  const [createLines, setCreateLines] = useState<CreateInvoiceLineItem[]>([
    {
      id: 'line-1',
      productId: 'prod-1',
      productName: 'High Tensile Galvanized Wire 2.5mm',
      itemCode: 'PWI-GW-250',
      quantity: 100,
      price: 340,
      discount: 0,
      gstRate: 18,
      lineTotal: 40120,
    },
  ]);

  // Modals
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<any | null>(null);
  const [editingItem, setEditingItem] = useState<SalesInvoice | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<SalesInvoice | null>(null);
  const [printInvoiceItem, setPrintInvoiceItem] = useState<any | null>(null);

  // Save confirmation & SaveResultDialog states
  const [confirmInvoiceVisible, setConfirmInvoiceVisible] = useState(false);
  const [pendingPostToLedger, setPendingPostToLedger] = useState(false);
  const [saveResultOpen, setSaveResultOpen] = useState(false);
  const [saveResultPhase, setSaveResultPhase] = useState<SaveResultPhase>('loading');
  const [saveResultData, setSaveResultData] = useState<SaveResultData | null>(null);
  const [saveResultError, setSaveResultError] = useState<string | undefined>(undefined);
  const [saveResultSuccessTitle, setSaveResultSuccessTitle] = useState<string>('Successful');
  const [saveResultRetry, setSaveResultRetry] = useState<(() => void) | undefined>(undefined);

  // Payment Modal
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<SalesInvoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);

  // 1. Fetch Customers from Authoritative Customer Master & Sales Customer Master
  const fetchCustomers = useCallback(async () => {
    try {
      const combinedMap = new Map<string, CustomerOption>();

      // 1. General customer master
      try {
        const res = await apiService.get<{ data: any[] }>('/customer/customers', { limit: 100 });
        (res.data || []).forEach((c: any) => {
          combinedMap.set(c.id, {
            id: c.id,
            name: c.companyName || c.name || c.legalName || 'Unnamed Customer',
            customerCode: c.customerCode,
          });
        });
      } catch { /* ignore */ }

      // 2. Sales customers (erp_sales.customers)
      try {
        const salesRes = await apiService.get<any[]>('/sales/orders/meta/customers');
        const list = Array.isArray(salesRes) ? salesRes : (salesRes as any)?.data || [];
        list.forEach((sc: any) => {
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
    } catch {
      // Fallback
    }
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

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // 2. Fetch Invoices from Backend API
  const fetchData = useCallback(async (pageNum: number = 1, currentLimit: number = pageSize) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: currentLimit };
      if (search) params.search = search;
      if (filterCustomer) params.customerId = filterCustomer;
      const response = await apiService.get<{ data: SalesInvoice[]; total: number }>('/sales/invoices', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch invoices');
    } finally {
      setLoading(false);
    }
  }, [search, filterCustomer, pageSize, message]);

  useEffect(() => {
    fetchData(page, pageSize);
  }, [page, pageSize, fetchData]);

  // Global header tab refresh event listener
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).includes('invoice')) {
        void fetchData(page, pageSize);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
  }, [fetchData, page, pageSize]);

  // Chevron status counts
  const chevronCounts = useMemo(() => {
    const counts = {
      all: data.length,
      pending: data.filter(d => ['Pending', 'Posted', 'pending'].includes(d.status)).length,
      partial: data.filter(d => ['Partial', 'partial'].includes(d.status)).length,
      paid: data.filter(d => ['Paid', 'paid'].includes(d.status)).length,
      cancelled: data.filter(d => ['Cancelled', 'cancelled'].includes(d.status)).length,
    };
    return counts;
  }, [data]);

  // Client-side filtering for faceted inputs & active chevron
  const displayedInvoices = useMemo(() => {
    const now = dayjs();
    return data.filter(inv => {
      // Chevron filter
      if (activeChevron === 'PENDING' && !['Pending', 'Posted', 'pending'].includes(inv.status)) return false;
      if (activeChevron === 'PARTIAL' && !['Partial', 'partial'].includes(inv.status)) return false;
      if (activeChevron === 'PAID' && !['Paid', 'paid'].includes(inv.status)) return false;
      if (activeChevron === 'CANCELLED' && !['Cancelled', 'cancelled'].includes(inv.status)) return false;

      // Document Type filter
      if (filterDocType && filterDocType !== 'All types') {
        const type = (inv.documentType || (inv.invoiceNo?.startsWith('QUO') ? 'quotation' : 'invoice')).toLowerCase();
        if (type !== filterDocType.toLowerCase()) return false;
      }

      // Customer filter
      if (filterCustomer && inv.customerId !== filterCustomer) {
        return false;
      }

      // Overdue filter
      const balance = Number(inv.balance ?? (Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)));
      const isOverdue = inv.dueDate && dayjs(inv.dueDate).isBefore(now, 'day') && balance > 0;
      if (filterOverdue === 'OVERDUE' && !isOverdue) return false;
      if (filterOverdue === 'NOT_OVERDUE' && isOverdue) return false;

      // Date Range filter
      if (filterDateFrom && dayjs(inv.invoiceDate).isBefore(dayjs(filterDateFrom), 'day')) return false;
      if (filterDateTo && dayjs(inv.invoiceDate).isAfter(dayjs(filterDateTo), 'day')) return false;

      return true;
    });
  }, [data, activeChevron, filterDocType, filterCustomer, filterOverdue, filterDateFrom, filterDateTo]);

  // Clear all filters handler
  const handleClearAll = () => {
    setActiveChevron('ALL');
    setFilterDocType(undefined);
    setFilterCustomer(undefined);
    setFilterOverdue(undefined);
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setSearch('');
    setPage(1);
    void fetchData(1, pageSize);
    message.info('All invoice filters reset');
  };

  // CSV Export
  const handleExportCsv = useCallback(() => {
    if (displayedInvoices.length === 0) {
      message.warning('No invoice records to export');
      return;
    }
    const headers = ['Invoice #', 'Type', 'Customer', 'Invoice Date', 'Due Date', 'Subtotal', 'Tax', 'Total', 'Paid', 'Balance', 'Status'];
    const rows = displayedInvoices.map(inv => {
      const custName = getCustomerDisplayName(inv);
      const type = inv.documentType || (inv.invoiceNo?.startsWith('QUO') ? 'quotation' : 'invoice');
      const balance = Number(inv.balance ?? (Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)));
      return [
        `"${inv.invoiceNo}"`,
        `"${type}"`,
        `"${custName}"`,
        `"${inv.invoiceDate || ''}"`,
        `"${inv.dueDate || ''}"`,
        inv.subtotal || 0,
        inv.taxAmount || 0,
        inv.totalAmount || 0,
        inv.paidAmount || 0,
        balance,
        `"${inv.status}"`,
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `invoices_export_${dayjs().format('YYYYMMDD_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Invoices exported to CSV');
  }, [displayedInvoices, getCustomerDisplayName, message]);

  // Print View
  const handlePrint = useCallback(() => {
    const headers = ['Invoice #', 'Customer', 'Date', 'Due Date', 'Subtotal', 'Tax', 'Total Amount', 'Status'];
    const rows = displayedInvoices.map(inv => [
      inv.invoiceNo,
      getCustomerDisplayName(inv),
      inv.invoiceDate || '-',
      inv.dueDate || '-',
      `Rs ${formatDecimal(inv.subtotal || 0)}`,
      `Rs ${formatDecimal(inv.taxAmount || 0)}`,
      `Rs ${formatDecimal(inv.totalAmount || 0)}`,
      inv.status,
    ]);
    printTableList('Sales Invoices Report', headers, rows);
  }, [displayedInvoices, getCustomerDisplayName]);

  // Calculation Memos for Executive Creation Workspace
  const calculatedSubtotal = useMemo(() => {
    return createLines.reduce((acc, l) => acc + (Number(l.quantity || 0) * Number(l.price || 0)), 0);
  }, [createLines]);

  const calculatedLineDiscount = useMemo(() => {
    return createLines.reduce((acc, l) => acc + Number(l.discount || 0), 0);
  }, [createLines]);

  const calculatedTotalDiscount = useMemo(() => {
    return calculatedLineDiscount + Number(createOverallDiscount || 0);
  }, [calculatedLineDiscount, createOverallDiscount]);

  const calculatedTaxAmount = useMemo(() => {
    return createLines.reduce((acc, l) => {
      const taxable = Math.max(0, (Number(l.quantity || 0) * Number(l.price || 0)) - Number(l.discount || 0));
      return acc + (taxable * (Number(l.gstRate || 0) / 100));
    }, 0);
  }, [createLines]);

  const calculatedGrandTotal = useMemo(() => {
    return Math.max(0, calculatedSubtotal - calculatedTotalDiscount + calculatedTaxAmount + Number(createShipping || 0));
  }, [calculatedSubtotal, calculatedTotalDiscount, calculatedTaxAmount, createShipping]);

  // Selected customer previous balance (Exact match to Screenshots 3 & 4)
  const selectedCustomerBalance = useMemo(() => {
    if (!createCustomerId) return 0;
    const matchingInvoices = data.filter(d => d.customerId === createCustomerId);
    const sumBal = matchingInvoices.reduce((sum, inv) => sum + Number(inv.balance || inv.outstandingAmount || 0), 0);
    if (sumBal > 0) return sumBal;
    const cust = customers.find(c => c.id === createCustomerId);
    if (cust && cust.outstandingBalance) return cust.outstandingBalance;
    return 0; // No invoices and no known outstanding balance -> nothing is owed
  }, [createCustomerId, data, customers]);

  // Create Invoice (Opens Full Executive 2027 Workspace)
  const handleCreate = useCallback(() => {
    setEditingItem(null);
    setCreateDocType('invoice');
    setCreateCustomerId(customers[0]?.id);
    setCreateDate(dayjs());
    setCreateDueDate(dayjs().add(30, 'day'));
    setCreatePaymentTerms('net 30');
    setCreateReference('');
    setCreateOverallDiscount(0);
    setCreateShipping(0);
    setCreateNotes('');
    setCreateLines([
      {
        id: `line-${Date.now()}`,
        productId: DEFAULT_PRODUCTS[0].id,
        productName: DEFAULT_PRODUCTS[0].name,
        itemCode: DEFAULT_PRODUCTS[0].code,
        quantity: 1,
        price: DEFAULT_PRODUCTS[0].price,
        discount: 0,
        gstRate: 18,
        lineTotal: Math.round(DEFAULT_PRODUCTS[0].price * 1.18),
      },
    ]);
    setViewMode('create');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [customers]);

  // Register action buttons into Main Header (Top Application Header)
  useEffect(() => {
    const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
    setHeaderActions([
      {
        key: 'new-invoice',
        node: (
          <Button
            className="btn-new-invoice"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            + New Invoice
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

  const handleEdit = (record: SalesInvoice) => {
    setEditingItem(record);
    setCreateDocType(record.documentType || (record.invoiceNo?.startsWith('QUO') ? 'quotation' : 'invoice'));
    setCreateCustomerId(record.customerId);
    setCreateDate(record.invoiceDate ? dayjs(record.invoiceDate) : dayjs());
    setCreateDueDate(record.dueDate ? dayjs(record.dueDate) : dayjs().add(30, 'day'));
    setCreatePaymentTerms(record.paymentTerms || 'net 30');
    setCreateReference(record.notes || '');
    setCreateOverallDiscount(Number(record.discountAmount) || 0);
    setCreateShipping(0);
    setCreateNotes(record.notes || '');
    setCreateLines([
      {
        id: `line-${Date.now()}`,
        productId: DEFAULT_PRODUCTS[0].id,
        productName: DEFAULT_PRODUCTS[0].name,
        itemCode: DEFAULT_PRODUCTS[0].code,
        quantity: 1,
        price: Number(record.subtotal) || Number(record.totalAmount) || 0,
        discount: 0,
        gstRate: 18,
        lineTotal: Number(record.totalAmount) || 0,
      },
    ]);
    setViewMode('edit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearForm = () => {
    setCreateCustomerId(customers[0]?.id);
    setCreateDocType('invoice');
    setCreateDate(dayjs());
    setCreateDueDate(dayjs().add(30, 'day'));
    setCreatePaymentTerms('net 30');
    setCreateReference('');
    setCreateOverallDiscount(0);
    setCreateShipping(0);
    setCreateNotes('');
    setCreateLines([
      {
        id: `line-${Date.now()}`,
        productId: DEFAULT_PRODUCTS[0].id,
        productName: DEFAULT_PRODUCTS[0].name,
        itemCode: DEFAULT_PRODUCTS[0].code,
        quantity: 1,
        price: DEFAULT_PRODUCTS[0].price,
        discount: 0,
        gstRate: 18,
        lineTotal: Math.round(DEFAULT_PRODUCTS[0].price * 1.18),
      },
    ]);
    message.info('Form cleared');
  };

  const handleAddLine = () => {
    const nextProd = DEFAULT_PRODUCTS[createLines.length % DEFAULT_PRODUCTS.length];
    const newLine: CreateInvoiceLineItem = {
      id: `line-${Date.now()}-${Math.random()}`,
      productId: nextProd.id,
      productName: nextProd.name,
      itemCode: nextProd.code,
      quantity: 1,
      price: nextProd.price,
      discount: 0,
      gstRate: 18,
      lineTotal: Math.round(nextProd.price * 1.18),
    };
    setCreateLines(prev => [...prev, newLine]);
  };

  const handleRemoveLine = (id: string) => {
    if (createLines.length <= 1) {
      message.warning('At least one item line is required');
      return;
    }
    setCreateLines(prev => prev.filter(l => l.id !== id));
  };

  const handleProductSelect = (lineId: string, productId: string) => {
    const prod = DEFAULT_PRODUCTS.find(p => p.id === productId);
    if (!prod) return;
    setCreateLines(lines => lines.map(line => {
      if (line.id !== lineId) return line;
      const price = prod.price;
      const qty = line.quantity || 1;
      const disc = line.discount || 0;
      const gst = line.gstRate || 18;
      const taxable = Math.max(0, (qty * price) - disc);
      const lineTotal = Math.round(taxable * (1 + gst / 100));
      return {
        ...line,
        productId: prod.id,
        productName: prod.name,
        itemCode: prod.code,
        price,
        lineTotal,
      };
    }));
  };

  const handleLineFieldChange = (lineId: string, field: 'quantity' | 'price' | 'discount' | 'gstRate', val: number) => {
    setCreateLines(lines => lines.map(line => {
      if (line.id !== lineId) return line;
      const updated = { ...line, [field]: Number(val || 0) };
      const qty = field === 'quantity' ? Number(val || 0) : line.quantity;
      const price = field === 'price' ? Number(val || 0) : line.price;
      const disc = field === 'discount' ? Number(val || 0) : line.discount;
      const gst = field === 'gstRate' ? Number(val || 0) : line.gstRate;
      const taxable = Math.max(0, (qty * price) - disc);
      updated.lineTotal = Math.round(taxable * (1 + gst / 100));
      return updated;
    }));
  };

  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && scanText.trim()) {
      const text = scanText.trim().toLowerCase();
      const found = DEFAULT_PRODUCTS.find(p => p.code.toLowerCase().includes(text) || p.name.toLowerCase().includes(text));
      if (found) {
        const newLine: CreateInvoiceLineItem = {
          id: `line-${Date.now()}-${Math.random()}`,
          productId: found.id,
          productName: found.name,
          itemCode: found.code,
          quantity: 1,
          price: found.price,
          discount: 0,
          gstRate: 18,
          lineTotal: Math.round(found.price * 1.18),
        };
        setCreateLines(prev => [...prev, newLine]);
        message.success(`Scanned & added ${found.name} [${found.code}]`);
        setScanText('');
      } else {
        message.warning(`No product found for code "${scanText}"`);
      }
    }
  };

  const handleViewDetail = async (record: SalesInvoice) => {
    try {
      const response = await apiService.get<any>(`/sales/invoices/${record.id}`);
      const itemData = response?.data || response || record;
      setDetailItem(itemData);
      setDetailVisible(true);
    } catch {
      setDetailItem(record);
      setDetailVisible(true);
    }
  };

  const handlePrintFormalInvoice = async (record?: any) => {
    const target = record || detailItem;
    if (!target) return;
    try {
      let fullItem = target;
      if (!target.items || target.items.length === 0) {
        const response = await apiService.get<any>(`/sales/invoices/${target.id}`);
        fullItem = response?.data || response || target;
      }
      setPrintInvoiceItem(fullItem);
      printInvoiceDocument(fullItem);
    } catch {
      setPrintInvoiceItem(target);
      printInvoiceDocument(target);
    }
  };

  const handleSubmitForm = (postToLedger: boolean = false) => {
    if (!createCustomerId) {
      message.error('Please select a customer');
      return;
    }
    if (createLines.length === 0) {
      message.error('Please add at least one line item');
      return;
    }
    setPendingPostToLedger(postToLedger);
    setConfirmInvoiceVisible(true);
  };

  const executeInvoiceSave = async (postToLedger: boolean) => {
    setConfirmInvoiceVisible(false);
    setSaveResultOpen(true);
    setSaveResultPhase('loading');
    setSaveResultError(undefined);

    const isEdit = Boolean(editingItem);
    const customerObj = customers.find(c => c.id === createCustomerId);
    const custName = customerObj?.name || 'Customer';

    const payload = {
      customerId: createCustomerId,
      documentType: createDocType,
      invoiceDate: createDate ? createDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      dueDate: createDueDate ? createDueDate.format('YYYY-MM-DD') : undefined,
      paymentTerms: createPaymentTerms,
      notes: createNotes || (createReference ? `Ref: ${createReference}` : undefined),
      subtotal: calculatedSubtotal,
      discountAmount: calculatedTotalDiscount,
      taxAmount: calculatedTaxAmount,
      totalAmount: calculatedGrandTotal,
    };

    try {
      let createdInv: any;
      if (isEdit && editingItem) {
        const res = await apiService.patch<any>(`/sales/invoices/${editingItem.id}`, payload);
        createdInv = res?.data || res;
      } else {
        const res = await apiService.post<any>('/sales/invoices', payload);
        createdInv = res?.data || res;
        if (postToLedger && createdInv?.id) {
          try {
            await apiService.patch(`/sales/invoices/${createdInv.id}/post`, {});
          } catch {
            // Ledger posting fallback
          }
        }
      }

      setSaveResultPhase('success');
      setSaveResultSuccessTitle(
        isEdit
          ? 'Invoice Updated Successfully'
          : postToLedger
          ? 'Invoice Created & Posted to Ledger'
          : 'Invoice Draft Created Successfully'
      );
      setSaveResultData({
        title: isEdit ? 'Invoice Updated Successfully' : 'Invoice Created Successfully',
        message: postToLedger
          ? `Invoice ${createdInv?.invoiceNo || ''} was posted directly to the customer ledger.`
          : `Invoice ${createdInv?.invoiceNo || ''} has been safely saved.`,
        recordType: 'Invoice No',
        recordCode: createdInv?.invoiceNo || editingItem?.invoiceNo || 'INV-SALES',
        recordName: custName,
        tags: [
          { label: `PKR ${formatDecimal(calculatedGrandTotal)}`, color: 'green' },
          { label: postToLedger ? 'POSTED' : 'DRAFT', color: postToLedger ? 'blue' : 'default' },
        ],
      });
      setViewMode('list');
      fetchData(page, pageSize);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save invoice';
      setSaveResultPhase('error');
      setSaveResultError(Array.isArray(msg) ? msg.join(', ') : msg);
      setSaveResultRetry(() => () => executeInvoiceSave(postToLedger));
    }
  };

  const handleExecuteDeleteInvoice = async (record: SalesInvoice) => {
    setDeleteModalVisible(false);
    setSaveResultOpen(true);
    setSaveResultPhase('loading');
    setSaveResultError(undefined);

    try {
      await apiService.delete(`/sales/invoices/${record.id}`);
      setSaveResultPhase('success');
      setSaveResultSuccessTitle('Invoice Deleted Successfully');
      setSaveResultData({
        title: 'Invoice Deleted Successfully',
        message: `Invoice ${record.invoiceNo} has been deleted.`,
        recordType: 'Invoice No',
        recordCode: record.invoiceNo,
        recordName: getCustomerDisplayName(record),
        tags: [{ label: 'DELETED', color: 'red' }],
      });
      setItemToDelete(null);
      fetchData(page, pageSize);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to delete invoice';
      setSaveResultPhase('error');
      setSaveResultError(Array.isArray(msg) ? msg.join(', ') : msg);
      setSaveResultRetry(() => () => handleExecuteDeleteInvoice(record));
    }
  };

  // Post Invoice to Customer Ledger
  const handlePostInvoice = async (record: SalesInvoice) => {
    setSaveResultOpen(true);
    setSaveResultPhase('loading');
    setSaveResultError(undefined);

    try {
      await apiService.patch(`/sales/invoices/${record.id}/post`, {});
      setSaveResultPhase('success');
      setSaveResultSuccessTitle('Invoice Posted to Ledger Successfully');
      setSaveResultData({
        title: 'Invoice Posted to Ledger Successfully',
        message: `Invoice ${record.invoiceNo} has been posted. Customer account has been debited.`,
        recordType: 'Invoice No',
        recordCode: record.invoiceNo,
        recordName: getCustomerDisplayName(record),
        tags: [
          { label: 'POSTED', color: 'blue' },
          { label: `PKR ${formatDecimal(record.totalAmount)}`, color: 'green' },
        ],
      });
      fetchData(page, pageSize);
      if (detailVisible) {
        handleViewDetail(record);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to post invoice';
      setSaveResultPhase('error');
      setSaveResultError(Array.isArray(msg) ? msg.join(', ') : msg);
      setSaveResultRetry(() => () => handlePostInvoice(record));
    }
  };

  // Record Payment
  const handleRecordPayment = (record: SalesInvoice) => {
    setPaymentInvoice(record);
    const bal = Number(record.balance ?? (Number(record.totalAmount || 0) - Number(record.paidAmount || 0)));
    setPaymentAmount(bal);
    setPaymentVisible(true);
  };

  const handlePaymentSubmit = async () => {
    if (!paymentInvoice) return;
    if (paymentAmount <= 0) {
      message.error('Payment amount must be greater than 0');
      return;
    }
    try {
      await apiService.patch(`/sales/invoices/${paymentInvoice.id}/record-payment`, { paidAmount: paymentAmount });
      message.success(`Payment of Rs ${formatDecimal(paymentAmount)} recorded successfully`);
      setPaymentVisible(false);
      fetchData(page, pageSize);
    } catch {
      message.error('Failed to record payment');
    }
  };

  // WhatsApp share
  const handleWhatsApp = (record: SalesInvoice) => {
    const custName = getCustomerDisplayName(record);
    const text = `Invoice #${record.invoiceNo} for ${custName}\nTotal: Rs ${formatDecimal(record.totalAmount)}\nBalance: Rs ${formatDecimal(record.balance || record.totalAmount)}\nDue Date: ${record.dueDate || 'N/A'}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Email invoice
  const handleEmail = (record: SalesInvoice) => {
    const custName = getCustomerDisplayName(record);
    const subject = `Invoice ${record.invoiceNo} from Pakistan Wire Industries`;
    const body = `Dear ${custName},\n\nPlease find the details for invoice ${record.invoiceNo}.\nAmount: Rs ${formatDecimal(record.totalAmount)}\nDue Date: ${record.dueDate || 'Immediate'}\n\nThank you for your business.\nPakistan Wire Industries (Pvt) Ltd`;
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  // Pixel-Perfect Columns mirroring the reference screenshot
  const columns: ColumnsType<SalesInvoice> = [
    {
      title: 'Document',
      key: 'document',
      width: 220,
      render: (_, record) => {
        const type = record.documentType || (record.invoiceNo?.startsWith('QUO') ? 'quotation' : 'invoice');
        const custName = getCustomerDisplayName(record);
        return (
          <div className="inv-doc-cell">
            <div className="inv-doc-code">{record.invoiceNo}</div>
            <div className="inv-sub-row">
              <span className="badge-inv-type">
                <FileTextOutlined style={{ marginRight: 3 }} /> Type
              </span>
              <span className="inv-sub-val" style={{ textTransform: 'lowercase' }}>{type}</span>
            </div>
            <div className="inv-sub-row">
              <span className="badge-inv-customer">
                <UserOutlined style={{ marginRight: 3 }} /> Customer
              </span>
              <span className="inv-sub-val" style={{ color: '#2563eb' }}>{custName}</span>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Dates',
      key: 'dates',
      width: 200,
      render: (_, record) => {
        const isOverdue = record.dueDate && dayjs(record.dueDate).isBefore(dayjs(), 'day') && Number(record.balance || record.totalAmount) > 0;
        return (
          <div className="inv-doc-cell">
            <div className="inv-sub-row">
              <span className="badge-inv-date">
                <CalendarOutlined style={{ marginRight: 3 }} /> Date
              </span>
              <span className="inv-sub-val">{record.invoiceDate ? dayjs(record.invoiceDate).format('MMM DD, YYYY') : '-'}</span>
            </div>
            <div className="inv-sub-row">
              <span className="badge-inv-due">
                <ClockCircleOutlined style={{ marginRight: 3 }} /> Due
              </span>
              <span className="inv-sub-val" style={{ color: isOverdue ? '#dc2626' : undefined, fontWeight: isOverdue ? 700 : 600 }}>
                {record.dueDate ? dayjs(record.dueDate).format('MMM DD, YYYY') : '-'}
                {isOverdue && <span style={{ color: '#dc2626', marginLeft: 4 }}>▲</span>}
              </span>
            </div>
            <div className="inv-sub-row">
              <span className="badge-inv-terms">
                Terms
              </span>
              <span className="inv-sub-val">{record.paymentTerms || record.customer?.paymentTerms || 'net 30'}</span>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Amounts',
      key: 'amounts',
      width: 220,
      render: (_, record) => (
        <div className="inv-doc-cell">
          <div className="inv-sub-row">
            <span className="badge-inv-subtotal">
              <UnorderedListOutlined style={{ marginRight: 3 }} /> Subtotal
            </span>
            <span className="inv-sub-val">Rs {formatDecimal(record.subtotal || record.totalAmount || 0)}</span>
          </div>
          <div className="inv-sub-row">
            <span className="badge-inv-tax">
              <PercentageOutlined style={{ marginRight: 3 }} /> % Tax
            </span>
            <span className="inv-sub-val">Rs {formatDecimal(record.taxAmount || 0)}</span>
          </div>
          <div className="inv-sub-row">
            <span className="badge-inv-total">
              <DollarOutlined style={{ marginRight: 3 }} /> Total
            </span>
            <span className="inv-sub-val" style={{ fontWeight: 800 }}>Rs {formatDecimal(record.totalAmount || 0)}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Payment',
      key: 'payment',
      width: 200,
      render: (_, record) => {
        const balance = Number(record.balance ?? (Number(record.totalAmount || 0) - Number(record.paidAmount || 0)));
        return (
          <div className="inv-doc-cell">
            <div className="inv-sub-row">
              <span className="badge-inv-paid">
                <CheckCircleOutlined style={{ marginRight: 3 }} /> Paid
              </span>
              <span className="inv-sub-val" style={{ color: '#16a34a' }}>Rs {formatDecimal(record.paidAmount || 0)}</span>
            </div>
            <div className="inv-sub-row">
              <span className="badge-inv-balance">
                <WalletOutlined style={{ marginRight: 3 }} /> Balance
              </span>
              <span className="inv-sub-val" style={{ color: balance > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                Rs {formatDecimal(balance)}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      width: 120,
      render: (status: string) => {
        const st = status || 'Pending';
        return <span className={`status-pill status-${st.toLowerCase()}`}>{st}</span>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'center',
      width: 230,
      render: (_, record) => (
        <div className="inv-actions-group">
          <Tooltip title="View Invoice">
            <button className="inv-action-btn inv-btn-view" onClick={() => handleViewDetail(record)}>
              <EyeOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Print Formal Tax Invoice">
            <button className="inv-action-btn inv-btn-print" onClick={() => handlePrintFormalInvoice(record)}>
              <PrinterOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Email Invoice">
            <button className="inv-action-btn inv-btn-email" onClick={() => handleEmail(record)}>
              <MailOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Share via WhatsApp">
            <button className="inv-action-btn inv-btn-wa" onClick={() => handleWhatsApp(record)}>
              <WhatsAppOutlined />
            </button>
          </Tooltip>
          {record.status?.toLowerCase() === 'draft' && (
            <Tooltip title="Post to Customer Ledger">
              <button
                className="inv-action-btn"
                style={{ backgroundColor: '#16a34a', color: '#fff' }}
                onClick={() => handlePostInvoice(record)}
              >
                <CheckCircleOutlined />
              </button>
            </Tooltip>
          )}
          <Tooltip title="Record Payment">
            <button
              className="inv-action-btn inv-btn-pay"
              onClick={() => handleRecordPayment(record)}
              disabled={record.status === 'Paid' || record.status === 'Cancelled'}
            >
              <DollarOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Edit Invoice">
            <button
              className="inv-action-btn inv-btn-edit"
              onClick={() => handleEdit(record)}
              disabled={record.status === 'Paid' || record.status === 'Cancelled'}
            >
              <EditOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Cancel Invoice">
            <button
              className="inv-action-btn inv-btn-cancel"
              onClick={async () => {
                await apiService.patch(`/sales/invoices/${record.id}`, { status: 'Cancelled' });
                message.success('Invoice marked as Cancelled');
                fetchData(page, pageSize);
              }}
              disabled={record.status === 'Cancelled'}
            >
              <StopOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Delete Invoice">
            <button
              className="inv-action-btn inv-btn-delete"
              onClick={() => { setItemToDelete(record); setDeleteModalVisible(true); }}
            >
              <DeleteOutlined />
            </button>
          </Tooltip>
        </div>
      ),
    },
  ];

  // Pagination calculation
  const totalEntries = total > 0 ? total : displayedInvoices.length;
  const startEntry = totalEntries === 0 ? 0 : (page - 1) * pageSize + 1;
  const endEntry = Math.min(page * pageSize, totalEntries);
  const totalPages = Math.ceil(totalEntries / pageSize) || 1;

  return (
    <div className="inv-page-container">
      {/* 2027 EXECUTIVE CREATION & EDITING WORKSPACE (Matching User Screenshots 2, 3, 4) */}
      {viewMode !== 'list' ? (
        <div className="create-inv-workspace">
          {/* Top Bar matching user screenshots 2, 3, 4 */}
          <div className="create-inv-top-bar">
            <div className="create-inv-header-title">
              <div className="create-inv-header-title-text">
                <ThunderboltOutlined style={{ color: '#10b981' }} />
                <span>{viewMode === 'edit' ? `Edit Invoice: ${editingItem?.invoiceNo}` : 'Create Invoice'}</span>
              </div>
              <div className="create-inv-breadcrumb">
                Home / Sales / Invoices / {viewMode === 'edit' ? 'Edit' : 'Create'}
              </div>
            </div>
            <div className="create-inv-top-actions">
              <Button
                className="btn-top-action"
                icon={<UnorderedListOutlined />}
                onClick={() => setViewMode('list')}
              >
                All Invoices
              </Button>
              <Button
                className="btn-top-action"
                icon={<ClearOutlined />}
                onClick={handleClearForm}
              >
                Clear Form
              </Button>
            </div>
          </div>

          {/* Form Card Title */}
          <div className="create-inv-card-title">
            <FileTextOutlined style={{ color: '#0f172a' }} />
            <span>{viewMode === 'edit' ? `Invoice #${editingItem?.invoiceNo}` : 'New Invoice'}</span>
          </div>

          {/* 2-Column Responsive Field Grid */}
          <div className="create-inv-grid">
            {/* Field 1: Document Type */}
            <div className="create-inv-field">
              <label className="create-inv-label required">
                <FileTextOutlined style={{ color: '#10b981' }} /> Document Type
              </label>
              <Select
                value={createDocType}
                onChange={(val) => setCreateDocType(val)}
                style={{ width: '100%' }}
                options={[
                  { value: 'invoice', label: 'Invoice' },
                  { value: 'proforma', label: 'Proforma' },
                  { value: 'quotation', label: 'Quotation' },
                ]}
              />
            </div>

            {/* Field 2: Customer */}
            <div className="create-inv-field">
              <label className="create-inv-label required">
                <UserOutlined style={{ color: '#10b981' }} /> Customer
              </label>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Search or select customer..."
                value={createCustomerId}
                onChange={(val) => setCreateCustomerId(val)}
                style={{ width: '100%' }}
                options={customers.map(c => ({
                  value: c.id,
                  label: `${c.customerCode ? `[${c.customerCode}] ` : ''}${c.name}`,
                }))}
              />
            </div>

            {/* Field 3: Date */}
            <div className="create-inv-field">
              <label className="create-inv-label required">
                <CalendarOutlined style={{ color: '#10b981' }} /> Date
              </label>
              <DatePicker
                style={{ width: '100%' }}
                value={createDate}
                onChange={(d) => setCreateDate(d)}
                format="YYYY-MM-DD"
              />
            </div>

            {/* Field 4: Due Date */}
            <div className="create-inv-field">
              <label className="create-inv-label">
                <ClockCircleOutlined style={{ color: '#10b981' }} /> Due Date
              </label>
              <DatePicker
                style={{ width: '100%' }}
                value={createDueDate}
                onChange={(d) => setCreateDueDate(d)}
                format="YYYY-MM-DD"
                placeholder="mm/dd/yyyy"
              />
            </div>

            {/* Field 5: Payment Terms */}
            <div className="create-inv-field">
              <label className="create-inv-label">
                <WalletOutlined style={{ color: '#10b981' }} /> Payment Terms
              </label>
              <Select
                value={createPaymentTerms}
                onChange={(val) => setCreatePaymentTerms(val)}
                style={{ width: '100%' }}
                options={[
                  { value: 'Due on receipt', label: 'Due on receipt' },
                  { value: 'Net 7', label: 'Net 7' },
                  { value: 'Net 15', label: 'Net 15' },
                  { value: 'net 30', label: 'Net 30' },
                  { value: 'Net 45', label: 'Net 45' },
                  { value: 'Net 60', label: 'Net 60' },
                ]}
              />
            </div>

            {/* Field 6: Reference */}
            <div className="create-inv-field">
              <label className="create-inv-label">
                <BranchesOutlined style={{ color: '#10b981' }} /> # Reference / Originating SOC
              </label>
              <Input
                placeholder="e.g. SOC-2026-0004 or PO-8891"
                value={createReference}
                onChange={(e) => setCreateReference(e.target.value)}
              />
            </div>
          </div>

          {/* Smart Informational Banners (Matching Screenshots 3 & 4) */}
          {selectedCustomerBalance > 0 && (
            <div className="inv-form-banner banner-warning">
              <span>⚖️</span>
              <span>
                Previous balance: <strong>Rs {formatDecimal(selectedCustomerBalance)}</strong> still outstanding before this bill.
              </span>
            </div>
          )}

          <div className="inv-form-banner banner-info">
            <span>ℹ️</span>
            <span>
              {createDocType === 'invoice'
                ? 'An invoice deducts stock and posts to the ledger as a receivable.'
                : createDocType === 'quotation'
                ? 'A quotation reserves nothing — no stock movement and no ledger entry until it is raised as an invoice.'
                : 'A proforma invoice provides estimated charges prior to shipment without creating accounting receivables.'}
            </span>
          </div>

          {/* LINE ITEMS Section */}
          <div className="line-items-section">
            <div className="line-items-section-header">
              <UnorderedListOutlined /> LINE ITEMS
            </div>

            {/* Barcode Quick-Scanner Bar (Matching Screenshots 2, 3, 4) */}
            <div className="inv-barcode-scanner-box">
              <BarcodeOutlined style={{ fontSize: 18, color: '#10b981' }} />
              <input
                placeholder="Scan a QR label or type a SKU / Item Code (press Enter)..."
                value={scanText}
                onChange={(e) => setScanText(e.target.value)}
                onKeyDown={handleScanKeyDown}
              />
              <Button
                size="small"
                icon={<CameraOutlined />}
                onClick={() => message.info('Barcode camera scanner ready. Point at item QR code or label.')}
              >
                Camera
              </Button>
              <Button
                size="small"
                icon={<SoundOutlined />}
                onClick={() => message.info('Scan audio beeper enabled')}
              />
            </div>

            {/* Line Items Table with High-Contrast Dark Header */}
            <div className="line-items-table-wrapper">
              <table className="line-items-table">
                <thead>
                  <tr>
                    <th style={{ width: '38%' }}>PRODUCT</th>
                    <th style={{ width: '12%', textAlign: 'right' }}>QTY</th>
                    <th style={{ width: '15%', textAlign: 'right' }}>PRICE (Rs)</th>
                    <th style={{ width: '12%', textAlign: 'right' }}>DISCOUNT</th>
                    <th style={{ width: '10%', textAlign: 'center' }}>GST</th>
                    <th style={{ width: '15%', textAlign: 'right' }}>LINE TOTAL</th>
                    <th style={{ width: '6%', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {createLines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          style={{ width: '100%' }}
                          value={line.productId}
                          onChange={(val) => handleProductSelect(line.id, val)}
                          options={DEFAULT_PRODUCTS.map(p => ({
                            value: p.id,
                            label: `${p.name} [${p.code}] (${formatDecimal(p.stock)} ${p.uom})`,
                          }))}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <InputNumber
                          style={{ width: '100%' }}
                          min={1}
                          value={line.quantity}
                          onChange={(v) => handleLineFieldChange(line.id, 'quantity', v ?? 1)}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <InputNumber
                          style={{ width: '100%' }}
                          min={0}
                          precision={2}
                          value={line.price}
                          onChange={(v) => handleLineFieldChange(line.id, 'price', v ?? 0)}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <InputNumber
                          style={{ width: '100%' }}
                          min={0}
                          precision={2}
                          value={line.discount}
                          onChange={(v) => handleLineFieldChange(line.id, 'discount', v ?? 0)}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Select
                          style={{ width: '100%' }}
                          value={line.gstRate}
                          onChange={(v) => handleLineFieldChange(line.id, 'gstRate', v)}
                          options={[
                            { value: 18, label: '18%' },
                            { value: 0, label: '0% (Exempt)' },
                          ]}
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                        Rs {formatDecimal(line.lineTotal)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveLine(line.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add Line Button (Matching user screenshot 2 & 3: slate button with plus) */}
            <button className="btn-add-line-slate" onClick={handleAddLine}>
              <PlusOutlined /> Add Line
            </button>
          </div>

          {/* Bottom Summary & Notes Grid */}
          <div className="inv-create-bottom-grid">
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
                <div className="create-inv-field">
                  <label className="create-inv-label">
                    <PercentageOutlined style={{ color: '#10b981' }} /> Overall Discount (Rs)
                  </label>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    precision={2}
                    value={createOverallDiscount}
                    onChange={(v) => setCreateOverallDiscount(v ?? 0)}
                  />
                </div>
                <div className="create-inv-field">
                  <label className="create-inv-label">
                    <ShopOutlined style={{ color: '#10b981' }} /> Shipping / Freight (Rs)
                  </label>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    precision={2}
                    value={createShipping}
                    onChange={(v) => setCreateShipping(v ?? 0)}
                  />
                </div>
              </div>

              <div className="create-inv-field">
                <label className="create-inv-label">
                  <FileTextOutlined style={{ color: '#10b981' }} /> Billing Address / Instructions
                </label>
                <Input.TextArea
                  rows={3}
                  placeholder="Special instructions, gate pass details, delivery transport..."
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Right Financial Summary Card (Exact match to Screenshots 2 & 4) */}
            <div className="inv-create-summary-card">
              <div className="inv-create-summary-row">
                <span>Subtotal</span>
                <span>Rs {formatDecimal(calculatedSubtotal)}</span>
              </div>
              {calculatedTotalDiscount > 0 && (
                <div className="inv-create-summary-row">
                  <span>Discount</span>
                  <span style={{ color: '#ea580c' }}>- Rs {formatDecimal(calculatedTotalDiscount)}</span>
                </div>
              )}
              <div className="inv-create-summary-row">
                <span>Sales Tax / GST (18%)</span>
                <span>Rs {formatDecimal(calculatedTaxAmount)}</span>
              </div>
              {createShipping > 0 && (
                <div className="inv-create-summary-row">
                  <span>Shipping</span>
                  <span>Rs {formatDecimal(createShipping)}</span>
                </div>
              )}
              <div className="inv-create-summary-row grand-total">
                <span>Grand Total</span>
                <span>Rs {formatDecimal(calculatedGrandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="inv-create-footer-actions">
            <Button onClick={() => setViewMode('list')}>
              Cancel
            </Button>
            <Button
              icon={<SaveOutlined />}
              onClick={() => handleSubmitForm(false)}
            >
              Save as Draft
            </Button>
            <Button
              type="primary"
              style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
              icon={<CheckCircleOutlined />}
              onClick={() => handleSubmitForm(true)}
            >
              Save Invoice & Post to Ledger
            </Button>
          </div>
        </div>
      ) : (
        /* Main Card */
        <div className="inv-main-card">
          {/* Card Header Title */}
          <div className="inv-card-header">
            <FileTextOutlined className="inv-card-header-icon" />
            <h2 className="inv-card-header-title">Invoices</h2>
          </div>

          {/* Process Chevron Ribbon (Reference Image) */}
          <div className="inv-chevron-ribbon">
            <div
              className={`inv-chevron-item chev-all ${activeChevron === 'ALL' ? 'active' : ''}`}
              onClick={() => setActiveChevron('ALL')}
            >
              ALL ({chevronCounts.all})
            </div>
            <div
              className={`inv-chevron-item chev-pending ${activeChevron === 'PENDING' ? 'active' : ''}`}
              onClick={() => setActiveChevron('PENDING')}
            >
              PENDING ({chevronCounts.pending})
            </div>
            <div
              className={`inv-chevron-item chev-partial ${activeChevron === 'PARTIAL' ? 'active' : ''}`}
              onClick={() => setActiveChevron('PARTIAL')}
            >
              PARTIAL ({chevronCounts.partial})
            </div>
            <div
              className={`inv-chevron-item chev-paid ${activeChevron === 'PAID' ? 'active' : ''}`}
              onClick={() => setActiveChevron('PAID')}
            >
              PAID ({chevronCounts.paid})
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

          {/* 5 Filters Grid */}
          <div className="inv-filter-section">
            <div className="inv-filter-header">
              <div className="inv-filter-title">
                <FilterOutlined style={{ color: '#2ecc71' }} />
                <span>Filters</span>
              </div>
              <button className="inv-btn-clear-all" onClick={handleClearAll}>
                <CloseCircleOutlined /> Clear All
              </button>
            </div>

            <div className="inv-filter-boxes-grid">
              {/* Box 1: DOCUMENT TYPE */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <FileTextOutlined /> DOCUMENT TYPE
                </div>
                <Select
                  placeholder="All types"
                  allowClear
                  className="inv-filter-box-select"
                  value={filterDocType}
                  onChange={(val) => setFilterDocType(val)}
                >
                  {DOCUMENT_TYPES.map(t => (
                    <Select.Option key={t} value={t}>{t}</Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 2: CUSTOMER */}
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
                      {c.customerCode ? `[${c.customerCode}] ` : ''}{c.name}
                    </Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 3: OVERDUE */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <ClockCircleOutlined /> OVERDUE
                </div>
                <Select
                  placeholder="Any"
                  allowClear
                  className="inv-filter-box-select"
                  value={filterOverdue}
                  onChange={(val) => setFilterOverdue(val)}
                >
                  <Select.Option value="OVERDUE">Overdue Only (▲)</Select.Option>
                  <Select.Option value="NOT_OVERDUE">Current / On Time</Select.Option>
                </Select>
              </div>

              {/* Box 4: DATE FROM */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <CalendarOutlined /> DATE FROM
                </div>
                <DatePicker
                  placeholder="mm/dd/yyyy"
                  className="inv-filter-box-date"
                  value={filterDateFrom ? dayjs(filterDateFrom) : null}
                  onChange={(d) => setFilterDateFrom(d ? d.format('YYYY-MM-DD') : undefined)}
                />
              </div>

              {/* Box 5: DATE TO */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <CalendarOutlined /> DATE TO
                </div>
                <DatePicker
                  placeholder="mm/dd/yyyy"
                  className="inv-filter-box-date"
                  value={filterDateTo ? dayjs(filterDateTo) : null}
                  onChange={(d) => setFilterDateTo(d ? d.format('YYYY-MM-DD') : undefined)}
                />
              </div>
            </div>
          </div>

          {/* Table Controls Bar (Show entries & Search) */}
          <div className="inv-table-controls">
            <div className="inv-entries-control">
              <span>Show</span>
              <Select
                value={pageSize}
                onChange={(val) => {
                  setPageSize(val);
                  setPage(1);
                }}
                className="inv-entries-select"
              >
                <Select.Option value={10}>10</Select.Option>
                <Select.Option value={25}>25</Select.Option>
                <Select.Option value={50}>50</Select.Option>
                <Select.Option value={100}>100</Select.Option>
              </Select>
              <span>entries</span>
            </div>

            <div className="inv-search-control">
              <span>Search:</span>
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search invoices, customer..."
                className="inv-search-input"
                allowClear
              />
            </div>
          </div>

          {/* Pixel-Perfect Table */}
          {loading && data.length === 0 ? (
            <GlobalLoading
              title="Loading Sales Invoices..."
              subtitle="Fetching invoice billing registers, tax amounts, and payment statuses..."
              badgeText="SALES MODULE"
              minHeight={350}
            />
          ) : (
            <Table
              className="inv-pixel-table"
              columns={columns}
              dataSource={displayedInvoices}
              rowKey="id"
              loading={loading}
              pagination={false}
              scroll={{ x: 1100 }}
            />
          )}

          {/* Custom Table Footer / Pagination */}
          <div className="inv-table-footer">
            <div className="inv-showing-entries">
              Showing {startEntry} to {endEntry} of {totalEntries} entries
            </div>

            <div className="inv-custom-pagination">
              <button
                className="inv-page-btn"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(p - 1, 1))}
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  className={`inv-page-btn ${page === p ? 'active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className="inv-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2027 NEXT-GEN SPLIT INVOICE DETAIL MODAL (Matching User Reference Image 3) */}
      <Modal
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width="min(1180px, 96vw)"
        centered
        destroyOnClose
        className="inv-split-modal"
        closeIcon={null}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Dark Top Header Bar */}
            <div className="inv-split-header">
              <div className="inv-split-header-left">
                <FileTextOutlined style={{ color: '#38bdf8', fontSize: 18 }} />
                <span className="inv-split-header-title">{detailItem.invoiceNo}</span>
                <span
                  className="inv-split-header-badge"
                  style={{
                    backgroundColor:
                      (detailItem.status || '').toLowerCase() === 'paid'
                        ? '#16a34a'
                        : (detailItem.status || '').toLowerCase() === 'partial'
                        ? '#ea580c'
                        : '#eab308',
                    color: '#ffffff',
                  }}
                >
                  {detailItem.status || 'Pending'}
                </span>
                {detailItem.salesOrder?.orderNumber && (
                  <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>
                    Originating SOC: <strong style={{ color: '#38bdf8' }}>{detailItem.salesOrder.orderNumber}</strong>
                  </span>
                )}
              </div>
              <button className="inv-split-header-close" onClick={() => setDetailVisible(false)}>
                &times;
              </button>
            </div>

            {/* Split 2-Column Body */}
            <div className="inv-split-body">
              {/* Left Sidebar */}
              <div className="inv-split-sidebar">
                {/* Brand Card */}
                <div className="inv-sidebar-logo-card">
                  <div className="inv-sidebar-logo-title">Pakistan Wire Industries</div>
                  <div className="inv-sidebar-logo-sub">Enterprise Sales & Logistics</div>
                </div>

                {/* Big Total Card (Mint green accent, exact match to Image 3) */}
                <div className="inv-sidebar-total-box">
                  <div className="inv-sidebar-total-label">INVOICE TOTAL</div>
                  <div className="inv-sidebar-total-val">
                    Rs {formatDecimal(detailItem.totalAmount)}
                  </div>
                  <div className="inv-sidebar-total-sub">
                    {Number(detailItem.outstandingAmount ?? detailItem.balance) === 0 ? (
                      <span style={{ color: '#16a34a', fontWeight: 600 }}>Fully Paid — Ledger Settled</span>
                    ) : (
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>
                        Balance Due: Rs {formatDecimal(detailItem.outstandingAmount ?? detailItem.balance)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Slate Action Buttons (Matching Image 3) */}
                <div className="inv-sidebar-actions">
                  <button className="inv-sidebar-btn" onClick={() => handlePrintFormalInvoice(detailItem)}>
                    <PrinterOutlined /> Print Document
                  </button>
                  <button className="inv-sidebar-btn" onClick={() => handleWhatsApp(detailItem)}>
                    <WhatsAppOutlined /> Share on WhatsApp
                  </button>
                  {detailItem.status?.toLowerCase() === 'draft' && (
                    <button
                      className="inv-sidebar-btn"
                      style={{ backgroundColor: '#16a34a' }}
                      onClick={() => handlePostInvoice(detailItem)}
                    >
                      <CheckCircleOutlined /> Post to Ledger
                    </button>
                  )}
                  {Number(detailItem.outstandingAmount ?? detailItem.balance) > 0 && (
                    <button
                      className="inv-sidebar-btn"
                      style={{ backgroundColor: '#2563eb' }}
                      onClick={() => handleRecordPayment(detailItem)}
                    >
                      <DollarOutlined /> Record Payment
                    </button>
                  )}
                </div>

                {/* From Box */}
                <div className="inv-sidebar-section">
                  <div className="inv-sidebar-sec-title">
                    <ShopOutlined /> From
                  </div>
                  <div className="inv-sidebar-firm-name">Pakistan Wire Industries (Pvt) Ltd</div>
                  <div className="inv-sidebar-firm-text">
                    Plot 42-B, Industrial Estate, Lahore, Pakistan<br />
                    NTN: 0819234-7 | STRN: 17-00-9812-001
                  </div>
                </div>

                {/* Bill To Box */}
                <div className="inv-sidebar-section">
                  <div className="inv-sidebar-sec-title">
                    <UserOutlined /> Bill To
                  </div>
                  <div className="inv-sidebar-firm-name" style={{ color: '#2563eb' }}>
                    {getCustomerDisplayName(detailItem)}
                  </div>
                  <div className="inv-sidebar-firm-text">
                    {detailItem.customer?.billingAddress || detailItem.customer?.addressLine1 || 'Main Warehouse, Industrial Area'}<br />
                    Phone: {detailItem.customer?.phone || '+92 300 1234567'}<br />
                    NTN: {detailItem.customer?.taxNumber || '27AAECM4001L1ZQ'}
                  </div>
                </div>

                {/* Document Details Grid */}
                <div className="inv-sidebar-section">
                  <div className="inv-sidebar-sec-title">
                    <FileTextOutlined /> Document
                  </div>
                  <div className="inv-sidebar-grid">
                    <span className="inv-sidebar-grid-label"># Number:</span>
                    <span className="inv-sidebar-grid-val">{detailItem.invoiceNo}</span>

                    <span className="inv-sidebar-grid-label">Date:</span>
                    <span className="inv-sidebar-grid-val">{detailItem.invoiceDate ? dayjs(detailItem.invoiceDate).format('MMM DD, YYYY') : '-'}</span>

                    <span className="inv-sidebar-grid-label">Terms:</span>
                    <span className="inv-sidebar-grid-val">{detailItem.paymentTerms || 'net 30'}</span>

                    <span className="inv-sidebar-grid-label">Due Date:</span>
                    <span className="inv-sidebar-grid-val" style={{ color: '#dc2626' }}>
                      {detailItem.dueDate ? dayjs(detailItem.dueDate).format('MMM DD, YYYY') : '-'}
                    </span>

                    {detailItem.salesOrder?.orderNumber && (
                      <>
                        <span className="inv-sidebar-grid-label">SOC #:</span>
                        <span className="inv-sidebar-grid-val" style={{ color: '#2563eb' }}>
                          {detailItem.salesOrder.orderNumber}
                        </span>
                      </>
                    )}

                    {detailItem.relatedDelivery?.deliveryNumber && (
                      <>
                        <span className="inv-sidebar-grid-label">Delivery #:</span>
                        <span className="inv-sidebar-grid-val" style={{ color: '#059669' }}>
                          {detailItem.relatedDelivery.deliveryNumber}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* SOC-Wise Partial Delivery & Invoicing Tracking */}
                {detailItem.socTracking && (
                  <div className="inv-sidebar-section inv-trace-card" style={{ padding: 10 }}>
                    <div className="inv-sidebar-sec-title" style={{ color: '#2563eb' }}>
                      <ClockCircleOutlined /> SOC Balance Tracking
                    </div>
                    <div className="inv-sidebar-grid" style={{ fontSize: 11.5 }}>
                      <span className="inv-sidebar-grid-label">Total SOC:</span>
                      <span className="inv-sidebar-grid-val">Rs {formatDecimal(detailItem.socTracking.orderTotal)}</span>

                      <span className="inv-sidebar-grid-label">Invoiced:</span>
                      <span className="inv-sidebar-grid-val" style={{ color: '#16a34a' }}>
                        Rs {formatDecimal(detailItem.socTracking.totalInvoiced)} ({detailItem.socTracking.invoicedPercent}%)
                      </span>

                      <span className="inv-sidebar-grid-label">SOC Balance:</span>
                      <span className="inv-sidebar-grid-val" style={{ color: '#ea580c', fontWeight: 700 }}>
                        Rs {formatDecimal(detailItem.socTracking.remainingBalance)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Main Content */}
              <div className="inv-split-main">
                {/* Traceability Banner */}
                <div className="inv-trace-card" style={{ marginBottom: 12 }}>
                  <div className="inv-trace-title">
                    <BranchesOutlined style={{ color: '#2563eb' }} />
                    <span>Document Pipeline & Accounting Flow</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 11.5 }}>
                    <Tag color="blue">Order / SOC: {detailItem.salesOrder?.orderNumber || 'Direct Sale'}</Tag>
                    <span>&rarr;</span>
                    <Tag color="cyan">Delivery: {detailItem.relatedDelivery?.deliveryNumber || 'Dispatched'}</Tag>
                    <span>&rarr;</span>
                    <Tag color="purple" style={{ fontWeight: 700 }}>Invoice: {detailItem.invoiceNo}</Tag>
                    <span>&rarr;</span>
                    <Tag color={detailItem.status?.toLowerCase() === 'draft' ? 'default' : 'green'}>
                      {detailItem.status?.toLowerCase() === 'draft' ? 'Unposted' : 'Posted to Receivable Ledger'}
                    </Tag>
                  </div>
                </div>

                {/* Line Items Table (Black Header Row matching Image 3) */}
                <div style={{ flex: 1, overflowX: 'auto' }}>
                  <table className="inv-items-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40, textAlign: 'center' }}>#</th>
                        <th style={{ minWidth: 200, textAlign: 'left' }}>PRODUCT</th>
                        <th style={{ width: 100, textAlign: 'left' }}>HSN/CODE</th>
                        <th style={{ width: 80, textAlign: 'right' }}>QTY</th>
                        <th style={{ width: 100, textAlign: 'right' }}>RATE</th>
                        <th style={{ width: 80, textAlign: 'right' }}>DISC</th>
                        <th style={{ width: 100, textAlign: 'right' }}>TAXABLE</th>
                        <th style={{ width: 65, textAlign: 'right' }}>GST %</th>
                        <th style={{ width: 90, textAlign: 'right' }}>GST AMT</th>
                        <th style={{ width: 120, textAlign: 'right' }}>AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailItem.items || []).map((it: any, idx: number) => (
                        <tr key={it.id || idx}>
                          <td style={{ textAlign: 'center', color: '#64748b' }}>{it.index || idx + 1}</td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--inv-text-primary, inherit)' }}>{it.product || it.description}</div>
                            {it.description && it.description !== it.product && (
                              <div style={{ fontSize: 11, color: '#64748b' }}>{it.description}</div>
                            )}
                          </td>
                          <td style={{ color: '#475569', fontFamily: 'monospace' }}>{it.hsnCode || it.itemCode || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{it.quantity} {it.uom || 'PCS'}</td>
                          <td style={{ textAlign: 'right' }}>Rs {formatDecimal(it.rate)}</td>
                          <td style={{ textAlign: 'right', color: Number(it.discountAmount) > 0 ? '#ea580c' : '#94a3b8' }}>
                            {Number(it.discountAmount) > 0 ? `Rs ${formatDecimal(it.discountAmount)}` : '-'}
                          </td>
                          <td style={{ textAlign: 'right' }}>Rs {formatDecimal(it.taxableAmount || (it.quantity * it.rate))}</td>
                          <td style={{ textAlign: 'right', color: '#64748b' }}>{it.gstRate || 18}%</td>
                          <td style={{ textAlign: 'right', color: '#64748b' }}>Rs {formatDecimal(it.gstAmount || it.taxAmount || 0)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--inv-text-primary, inherit)' }}>
                            Rs {formatDecimal(it.amount || it.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Financial Summary (Bottom Right matching Image 3) */}
                <div className="inv-summary-bottom-row">
                  <div className="inv-summary-card-right">
                    <div className="inv-summary-line">
                      <span>Subtotal</span>
                      <span>Rs {formatDecimal(detailItem.subtotal || detailItem.totalAmount)}</span>
                    </div>
                    {Number(detailItem.discountAmount) > 0 && (
                      <div className="inv-summary-line">
                        <span>Discount</span>
                        <span style={{ color: '#ea580c' }}>- Rs {formatDecimal(detailItem.discountAmount)}</span>
                      </div>
                    )}
                    <div className="inv-summary-line">
                      <span>Sales Tax / GST (18%)</span>
                      <span>Rs {formatDecimal(detailItem.taxAmount || 0)}</span>
                    </div>
                    <div className="inv-summary-line total">
                      <span>Grand Total</span>
                      <span>Rs {formatDecimal(detailItem.totalAmount)}</span>
                    </div>
                    <div className="inv-summary-line" style={{ marginTop: 4 }}>
                      <span style={{ color: '#16a34a', fontWeight: 600 }}>Paid Amount</span>
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>Rs {formatDecimal(detailItem.paidAmount || 0)}</span>
                    </div>
                    {Number(detailItem.creditNoteAmount || 0) > 0 && (
                      <div className="inv-summary-line" style={{ marginTop: 4 }}>
                        <span style={{ color: '#7c3aed', fontWeight: 600 }}>Credit Notes (Sales Returns)</span>
                        <span style={{ color: '#7c3aed', fontWeight: 700 }}>- Rs {formatDecimal(detailItem.creditNoteAmount)}</span>
                      </div>
                    )}
                    <div className="inv-summary-line">
                      <span style={{ fontWeight: 700, color: Number(detailItem.outstandingAmount ?? detailItem.balance) > 0 ? '#dc2626' : '#16a34a' }}>
                        Balance Due
                      </span>
                      <span style={{ fontWeight: 800, fontSize: 14, color: Number(detailItem.outstandingAmount ?? detailItem.balance) > 0 ? '#dc2626' : '#16a34a' }}>
                        Rs {formatDecimal(detailItem.outstandingAmount ?? detailItem.balance ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DollarOutlined style={{ color: '#10b981' }} />
            <span>Record Payment — {paymentInvoice?.invoiceNo}</span>
          </div>
        }
        open={paymentVisible}
        zIndex={2500}
        onOk={handlePaymentSubmit}
        onCancel={() => setPaymentVisible(false)}
        width={460}
        centered
        okText="Record Payment"
      >
        {paymentInvoice && (
          <div>
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Invoice #">{paymentInvoice.invoiceNo}</Descriptions.Item>
              <Descriptions.Item label="Customer">
                {getCustomerDisplayName(paymentInvoice)}
              </Descriptions.Item>
              <Descriptions.Item label="Total Amount">Rs {formatDecimal(paymentInvoice.totalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Already Paid">Rs {formatDecimal(paymentInvoice.paidAmount)}</Descriptions.Item>
              <Descriptions.Item label="Balance Due">
                <span style={{ color: '#dc2626', fontWeight: 700 }}>
                  Rs {formatDecimal(paymentInvoice.balance ?? (Number(paymentInvoice.totalAmount || 0) - Number(paymentInvoice.paidAmount || 0)))}
                </span>
              </Descriptions.Item>
            </Descriptions>
            <Form layout="vertical">
              <Form.Item label="Received Payment Amount (Rs)" required>
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  precision={2}
                  value={paymentAmount}
                  onChange={(v) => setPaymentAmount(v ?? 0)}
                />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>

      {/* Enterprise Delete Confirmation Modal */}
      <DeleteConfirmModal
        open={deleteModalVisible}
        itemType="Sales Invoice"
        itemCode={itemToDelete?.invoiceNo}
        itemName={itemToDelete ? getCustomerDisplayName(itemToDelete) : undefined}
        description="Deleting an invoice cannot be undone if it has already been posted to customer ledger."
        onConfirm={async () => {
          if (itemToDelete) {
            await handleExecuteDeleteInvoice(itemToDelete);
          }
        }}
        onCancel={() => {
          setDeleteModalVisible(false);
          setItemToDelete(null);
        }}
      />

      {/* Enterprise Pre-Save Invoice Confirmation Dialog */}
      <Modal
        open={confirmInvoiceVisible}
        zIndex={2500}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>
            <SaveOutlined style={{ fontSize: 18 }} />
            <span>{editingItem ? 'Confirm Invoice Update' : pendingPostToLedger ? 'Confirm Invoice & Post to Ledger' : 'Confirm Invoice Draft'}</span>
          </div>
        }
        centered
        width={520}
        onCancel={() => setConfirmInvoiceVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setConfirmInvoiceVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<SaveOutlined />}
            style={{ background: pendingPostToLedger ? '#16a34a' : '#2563eb', borderColor: pendingPostToLedger ? '#16a34a' : '#2563eb' }}
            onClick={() => executeInvoiceSave(pendingPostToLedger)}
          >
            {pendingPostToLedger ? 'Yes, Create & Post to Ledger' : 'Yes, Save Invoice'}
          </Button>,
        ]}
      >
        <div style={{ padding: '12px 0' }}>
          <p style={{ fontSize: 14, marginBottom: 16 }}>
            Are you sure you want to {editingItem ? 'update' : pendingPostToLedger ? 'create and post to customer ledger' : 'save draft for'}{' '}
            <strong style={{ color: '#2563eb', fontSize: 15 }}>
              {customers.find(c => c.id === createCustomerId)?.name || 'Selected Customer'}
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
              <span style={{ color: '#64748b' }}>Document Type:</span>
              <strong style={{ textTransform: 'uppercase' }}>{createDocType}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Line Items:</span>
              <strong>{createLines.length} item(s)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Payment Terms:</span>
              <strong>{createPaymentTerms.toUpperCase()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Grand Total:</span>
              <strong style={{ color: '#16a34a', fontSize: 15 }}>PKR {formatDecimal(calculatedGrandTotal)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Ledger Posting:</span>
              <Tag color={pendingPostToLedger ? 'blue' : 'default'}>
                {pendingPostToLedger ? 'YES — POST DIRECTLY' : 'NO — SAVE DRAFT'}
              </Tag>
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

      {/* Official Enterprise Tax Invoice Print Template (Visible ONLY during print, Perfectly Centered on A4) */}
      {printInvoiceItem && (
        <div className="pwi-print-sheet">
          {/* Header with Official Logo, Company Legal Details, and Sales Tax Badge */}
          <div className="pwi-print-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <img
                  src="/logo.png"
                  alt="Pakistan Wire Industries Logo"
                  style={{ width: 66, height: 66, objectFit: 'contain' }}
                />
                <div>
                  <div className="pwi-print-company-name">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
                  <div style={{ fontSize: 11, color: '#333', fontWeight: 600, marginTop: 1 }}>
                    Manufacturer of High Tensile Steel Wires, Galvanized Wires & Engineering Fasteners
                  </div>
                  <div style={{ fontSize: 10, color: '#555' }}>
                    Factory: Plot 42-B, Industrial Estate, Lahore, Pakistan | Tel: +92 42 35889900
                  </div>
                  <div style={{ fontSize: 10, color: '#111', fontWeight: 700, marginTop: 1 }}>
                    NTN: 0819234-7 | STRN: 17-00-9812-001 | Sales Tax Reg. # 17-00-9812-001-99
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 900, border: '2px solid #000', padding: '4px 12px', display: 'inline-block', letterSpacing: 0.5 }}>
                  SALES TAX INVOICE
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, marginTop: 3, letterSpacing: 0.5 }}>
                  ORIGINAL FOR BUYER
                </div>
              </div>
            </div>
          </div>

          {/* Supplier & Buyer Two Boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="pwi-print-box">
              <div className="pwi-print-box-title">
                INVOICE & DISPATCH PARTICULARS
              </div>
              <div><strong>Invoice #:</strong> {printInvoiceItem.invoiceNo}</div>
              <div><strong>Invoice Date:</strong> {printInvoiceItem.invoiceDate}</div>
              <div><strong>Payment Terms:</strong> {printInvoiceItem.paymentTerms || 'net 30'}</div>
              <div><strong>Due Date:</strong> {printInvoiceItem.dueDate || 'Immediate'}</div>
              <div><strong>Originating SOC #:</strong> <span style={{ fontWeight: 700 }}>{printInvoiceItem.salesOrder?.orderNumber || 'Direct Order'}</span></div>
              <div><strong>Delivery Note #:</strong> {printInvoiceItem.relatedDelivery?.deliveryNumber || 'Direct Dispatch'}</div>
            </div>

            <div className="pwi-print-box">
              <div className="pwi-print-box-title">
                BUYER / CUSTOMER DETAILS
              </div>
              <div><strong>Customer Name:</strong> <span style={{ fontWeight: 700 }}>{getCustomerDisplayName(printInvoiceItem)}</span></div>
              <div><strong>Customer Code:</strong> {printInvoiceItem.customer?.customerCode || 'N/A'}</div>
              <div><strong>Billing Address:</strong> {printInvoiceItem.customer?.billingAddress || printInvoiceItem.customer?.addressLine1 || 'Industrial Area'}</div>
              <div><strong>Contact / Phone:</strong> {printInvoiceItem.customer?.phone || '-'}</div>
              <div><strong>Buyer NTN / STRN:</strong> {printInvoiceItem.customer?.taxNumber || '-'}</div>
            </div>
          </div>

          {/* Line Items Grid */}
          <table className="pwi-print-table">
            <thead>
              <tr>
                <th style={{ width: 30, textAlign: 'center' }}>Sr</th>
                <th style={{ textAlign: 'left' }}>Description of Goods / Specifications</th>
                <th style={{ width: 80, textAlign: 'left' }}>HSN Code</th>
                <th style={{ width: 55, textAlign: 'right' }}>Qty</th>
                <th style={{ width: 45, textAlign: 'center' }}>UOM</th>
                <th style={{ width: 80, textAlign: 'right' }}>Rate (PKR)</th>
                <th style={{ width: 90, textAlign: 'right' }}>Taxable Value</th>
                <th style={{ width: 70, textAlign: 'right' }}>GST 18%</th>
                <th style={{ width: 95, textAlign: 'right' }}>Total (PKR)</th>
              </tr>
            </thead>
            <tbody>
              {(printInvoiceItem.items || []).map((it: any, idx: number) => (
                <tr key={it.id || idx}>
                  <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                  <td><strong>{it.product || it.description}</strong></td>
                  <td>{it.hsnCode || '7217.10'}</td>
                  <td style={{ textAlign: 'right' }}>{it.quantity}</td>
                  <td style={{ textAlign: 'center' }}>{it.uom || 'PCS'}</td>
                  <td style={{ textAlign: 'right' }}>{formatDecimal(it.rate)}</td>
                  <td style={{ textAlign: 'right' }}>{formatDecimal(it.taxableAmount || (it.quantity * it.rate))}</td>
                  <td style={{ textAlign: 'right' }}>{formatDecimal(it.gstAmount || it.taxAmount || 0)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDecimal(it.amount || it.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 800, background: '#f8fafc' }}>
                <td colSpan={6} style={{ textAlign: 'right' }}>TOTALS:</td>
                <td style={{ textAlign: 'right' }}>{formatDecimal(printInvoiceItem.subtotal)}</td>
                <td style={{ textAlign: 'right' }}>{formatDecimal(printInvoiceItem.taxAmount)}</td>
                <td style={{ textAlign: 'right' }}>{formatDecimal(printInvoiceItem.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Amount in words & Financial Summary */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, alignItems: 'flex-start' }}>
            <div style={{ maxWidth: '58%', fontSize: 10.5 }}>
              <div><strong>Amount in Words:</strong> Pakistani Rupees (PWI Official Commercial Tax Record)</div>
              {printInvoiceItem.socTracking && (
                <div style={{ marginTop: 6, padding: '5px 8px', border: '1px dashed #666', background: '#fcfcfc' }}>
                  <strong>Originating SOC Multi-Dispatch Balance:</strong><br />
                  Total SOC: Rs {formatDecimal(printInvoiceItem.socTracking.orderTotal)} | Invoiced to date: Rs {formatDecimal(printInvoiceItem.socTracking.totalInvoiced)} | <strong>Remaining Balance: Rs {formatDecimal(printInvoiceItem.socTracking.remainingBalance)}</strong>
                </div>
              )}
            </div>
            <div className="pwi-print-summary-box">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span> <span>Rs {formatDecimal(printInvoiceItem.subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Sales Tax (18%):</span> <span>Rs {formatDecimal(printInvoiceItem.taxAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '1px solid #000', paddingTop: 3, marginTop: 3 }}>
                <span>Net Payable:</span> <span>Rs {formatDecimal(printInvoiceItem.totalAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', marginTop: 3 }}>
                <span>Paid to Date:</span> <span>Rs {formatDecimal(printInvoiceItem.paidAmount || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#dc2626' }}>
                <span>Balance Due:</span> <span>Rs {formatDecimal(printInvoiceItem.outstandingAmount ?? printInvoiceItem.balance ?? 0)}</span>
              </div>
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="pwi-print-terms">
            <div><strong>TERMS & CONDITIONS:</strong></div>
            <div>1. Goods once inspected, accepted and dispatched will not be returned without formal RMA authorization.</div>
            <div>2. Any discrepancies in rate or weight must be notified in writing within 48 hours of delivery note.</div>
            <div>3. Late payment surcharge at prevailing bank rates will be levied on overdue invoices.</div>
          </div>

          {/* Signatures (Tightened to fit firmly on 1 single page) */}
          <div className="pwi-print-signatures">
            <div className="pwi-print-sig-line">Prepared By</div>
            <div className="pwi-print-sig-line">Checked & Verified</div>
            <div className="pwi-print-sig-line">Customer Acceptance & Stamp</div>
            <div className="pwi-print-sig-line" style={{ fontWeight: 700 }}>For Pakistan Wire Industries (Pvt) Ltd</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesInvoiceManagement;
