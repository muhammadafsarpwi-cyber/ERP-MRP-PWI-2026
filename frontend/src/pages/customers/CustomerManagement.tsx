import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button, Card, Form, Input, Select, App, Alert, Statistic,
  InputNumber, Row, Col, Descriptions, DatePicker, Tabs, List, Badge, Tooltip,
  Modal, Space, Table, Switch, Upload, Tag, Empty, Collapse, theme,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
  UserOutlined, EnvironmentOutlined, PhoneOutlined, MailOutlined, PrinterOutlined,
  ReloadOutlined, FileExcelOutlined, UploadOutlined, DownloadOutlined,
  FilterOutlined, CloseCircleOutlined, WalletOutlined, ArrowDownOutlined, ArrowUpOutlined,
  FileTextOutlined, HomeOutlined, BankOutlined, CheckCircleOutlined,
  BarcodeOutlined, AuditOutlined, InboxOutlined, StopOutlined,
  DollarCircleOutlined, InfoCircleOutlined, HistoryOutlined,
  GlobalOutlined, SafetyCertificateOutlined, SwapOutlined, WarningOutlined,
  SaveOutlined, CloseOutlined, CalendarOutlined, SyncOutlined,
  PlusCircleOutlined, ApartmentOutlined, SettingOutlined, WhatsAppOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useLocation } from 'react-router-dom';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import BarcodePrint from '../../components/shared/BarcodePrint';
import {
  DeleteConfirmModal,
  DraggableResizableModal,
  SaveResultDialog,
} from '../../components/shared';
import type { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import GlobalLoading from '../../components/shared/GlobalLoading';
import { matchesTabRefresh, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import dayjs from 'dayjs';
import './CustomerManagement.css';
import {
  printCustomerStatementDocument,
  printInvoiceDocument,
  printPaymentReceiptVoucher,
  printTableList,
} from '../../utils/printTemplates';
import {
  DEFAULT_COMPANY_NAME,
  openWhatsAppWithTemplate,
} from '../../utils/whatsappTemplateRenderer';
import { useUserStore } from '../../store/userStore';

const { TabPane } = Tabs;

interface DivisionOption {
  id: string;
  code?: string;
  name: string;
}

const DEFAULT_DIVISIONS: DivisionOption[] = [
  { id: 'd1000000-0000-0000-0000-000000000002', code: 'DIV-CCD', name: 'Control Cable Division' },
  { id: 'd1000000-0000-0000-0000-000000000001', code: 'DIV-SPD', name: 'Spoke Division' },
  { id: '0653339b-94d0-4cc5-b880-e07908b2015f', code: 'DIV-NB', name: 'NB Division' },
  { id: '50824516-9c24-4122-86e7-c8e6fa1c5869', code: 'DIV-001', name: 'Manufacturing Division' },
  { id: '83ecd746-1cc9-4849-bec4-d00bcc3ceeec', code: 'DIV-PWI', name: 'Main Division E-51' },
  { id: 'b28f9d4f-53f3-4883-afb4-2af73c4dcca7', code: 'DIV-002', name: 'Sales & Marketing Division' },
  { id: '3f222d46-6f96-44f6-9ead-27467c7e93a1', code: 'DIV-003', name: 'Supply Chain Division' },
  { id: '9efc527e-811d-4b45-92ea-4a562ab212cc', code: 'DIV-004', name: 'Finance & Administration Division' },
  { id: 'a6b0f919-fcfc-4e31-85e0-ebd35766f9c2', code: 'DIV-005', name: 'Quality & Engineering Division' },
];

interface Customer {
  id: string;
  companyId?: string;
  divisionId?: string;
  divisionName?: string;
  division?: { id: string; name: string; divisionCode?: string };
  customerCode: string;
  name: string;
  legalName?: string;
  shortName?: string;
  customerType: string;
  customerCategory?: string;
  customerGroup?: string;
  customerSince?: string;
  taxStatus?: string;
  classification?: string;
  salesTaxNumber?: string;
  openingBalance?: number;
  openingBalanceType?: string;
  priceList?: string;
  creditHold?: boolean;
  creditHoldReason?: string;
  contactPerson?: string;
  contactDesignation?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  alternateContact?: string;
  alternatePhone?: string;
  city?: string;
  state?: string;
  country?: string;
  currencyCode: string;
  paymentTerms?: string;
  creditLimit: number;
  creditDays: number;
  discountPercent: number;
  customerTier: string;
  leadSource?: string;
  totalOrders: number;
  totalRevenue: number;
  currentBalance?: number;
  unadjustedAdvanceBalance?: number;
  openInvoicesCount?: number;
  openInvoicesBalance?: number;
  taxNumber?: string;
  registrationNumber?: string;
  status: string;
  lastContactDate?: string;
  nextFollowUpDate?: string;
  notes?: string;
  addressLine1?: string;
  addressLine2?: string;
  billingAddress?: string;
  createdAt?: string;
  updatedAt?: string;
  contacts?: CustomerContact[];
  addresses?: CustomerAddress[];
}

interface CustomerContact {
  id: string;
  firstName: string;
  lastName?: string;
  jobTitle?: string;
  designation?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  alternateContact?: string;
  alternatePhone?: string;
  isPrimary: boolean;
  status: string;
  notes?: string;
}

interface CustomerAddress {
  id: string;
  addressType: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  area?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  contactPerson?: string;
  phone?: string;
  isDefault: boolean;
  status: string;
}

interface CustomerLedgerEntry {
  id: string;
  transactionDate: string;
  documentType: string;
  documentNumber: string;
  reference?: string;
  debit: number;
  credit: number;
  runningBalance: number;
  currency: string;
  dueDate?: string;
  paymentTerms?: string;
  divisionId?: string;
  divisionName?: string;
  socNumber?: string;
  poReference?: string;
  paymentMode?: string;
  receiptId?: string;
  salesInvoiceId?: string;
  overdueDays?: number;
  invoiceStatus?: string;
  status: string;
  notes?: string;
}

interface CustomerLedgerSummary {
  customerId: string;
  customerCode: string;
  customerName: string;
  currency: string;
  openingBalance?: number;
  totalInvoiced?: number;
  totalDebitNotes?: number;
  totalReceiptsAndAdvances?: number;
  totalReturnsAndCredits?: number;
  unadjustedAdvanceBalance?: number;
  netReceivableBalance?: number;
  totalDebit: number;
  totalCredit: number;
  outstandingBalance: number;
  balanceType: 'DEBIT' | 'CREDIT' | 'ZERO';
  lastTransactionDate: string | null;
  transactionCount: number;
  creditLimit?: number;
  creditDays?: number;
  paymentTerms?: string;
  creditHold?: boolean;
  creditHoldReason?: string | null;
  aging?: {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    days90Plus: number;
    totalOpenBalance: number;
    overdueAmount: number;
    overdueInvoiceCount: number;
    openInvoiceCount: number;
  };
  openInvoices?: any[];
  availableAdvances?: any[];
}

const CUSTOMER_TYPES = [
  'Domestic Customer',
  'Export Customer',
  'Dealer',
  'Distributor',
  'Retailer',
  'OEM',
  'Corporate',
  'Government',
  'Other',
];

const CUSTOMER_CATEGORIES = ['Category A - Enterprise', 'Category B - Standard', 'Category C - Retail', 'Direct'];
const CUSTOMER_GROUPS = ['Key Accounts', 'Institutional', 'General Trade', 'Direct Consumer'];
const CUSTOMER_TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED', 'LEAD'];
const TAX_STATUS_OPTIONS = ['REGISTERED', 'NON_REGISTERED', 'FILER', 'NON_FILER', 'EXEMPT'];
const OPENING_BALANCE_TYPES = ['DEBIT', 'CREDIT'];
const PRICE_LISTS = ['Standard Wholesale', 'Retail Standard', 'Dealer Tier 1', 'Distributor Special', 'Export FOB'];
const PAYMENT_TERMS_OPTIONS = [
  'Cash / Immediate',
  'Net 7 Days',
  'Net 15 Days',
  'Net 30 Days',
  'Net 60 Days',
  'Net 90 Days',
  'Bill-to-Bill',
  'Advance Payment',
];
const ADDRESS_TYPES = ['BILLING', 'SHIPPING', 'OFFICE', 'BOTH'];

const DEFAULT_STATES = [
  'Punjab', 'Sindh', 'Islamabad', 'Khyber Pakhtunkhwa', 'Balochistan', 'Maharashtra', 'Gujarat', 'Delhi',
];

const GST_MODES = [
  'Registered Sales Tax (STRN)', 'Non-Registered', 'Exempted', 'Standard GST'
];

const CustomerManagement: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const location = useLocation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');

  // Filter States
  const [filterState, setFilterState] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterBalance, setFilterBalance] = useState<string | undefined>(undefined);
  const [filterCustomerType, setFilterCustomerType] = useState<string | undefined>(undefined);
  const [filterDivision, setFilterDivision] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  // Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  // Save confirmation & SaveResultDialog states
  const [confirmSaveVisible, setConfirmSaveVisible] = useState(false);
  const [pendingCustomerValues, setPendingCustomerValues] = useState<any>(null);
  const [saveResultOpen, setSaveResultOpen] = useState(false);
  const [saveResultPhase, setSaveResultPhase] = useState<SaveResultPhase>('loading');
  const [saveResultData, setSaveResultData] = useState<SaveResultData | null>(null);
  const [saveResultError, setSaveResultError] = useState<string | undefined>(undefined);
  const [saveResultSuccessTitle, setSaveResultSuccessTitle] = useState<string>('Successful');
  const [saveResultRetry, setSaveResultRetry] = useState<(() => void) | undefined>(undefined);

  // Authoritative Customer Ledger State
  const [ledgerEntries, setLedgerEntries] = useState<CustomerLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerSummary, setLedgerSummary] = useState<CustomerLedgerSummary | null>(null);

  // Help Banner toggle (Reference Image 2)
  const [helpBannerOpen, setHelpBannerOpen] = useState(false);

  // Chevron Process filter state (Reference Image 2)
  const [activeChevron, setActiveChevron] = useState<string>('ALL');

  // Customer Statement State
  const [showFilters, setShowFilters] = useState(false);
  const [statementData, setStatementData] = useState<any>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementFromDate, setStatementFromDate] = useState<string | undefined>(undefined);
  const [statementToDate, setStatementToDate] = useState<string | undefined>(undefined);
  const [statementDocType, setStatementDocType] = useState<string | undefined>(undefined);

  // Customer 360 Sales Summary & Items History
  const [salesSummary, setSalesSummary] = useState<any>(null);
  const [customerItems, setCustomerItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Customer 360 View Tabs & Payment State
  const [c360ActiveTab, setC360ActiveTab] = useState<'ledger' | 'overview' | 'invoices' | 'payments' | 'returns' | 'products'>('ledger');
  const [c360SearchText, setC360SearchText] = useState('');
  const [ledgerDocFilter, setLedgerDocFilter] = useState<string>('ALL');
  const [ledgerDivisionFilter, setLedgerDivisionFilter] = useState<string | undefined>(undefined);
  const [ledgerDateRange, setLedgerDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [customerReceipts, setCustomerReceipts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [recordPaymentModalVisible, setRecordPaymentModalVisible] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentAllocMap, setPaymentAllocMap] = useState<Record<string, number>>({});
  const [watchedPayMode, setWatchedPayMode] = useState<string>('BANK_TRANSFER');
  const [watchedPayAmt, setWatchedPayAmt] = useState<number>(0);
  const [paymentForm] = Form.useForm();
  const [adjustAdvModalVisible, setAdjustAdvModalVisible] = useState(false);
  const [adjustAdvAllocMap, setAdjustAdvAllocMap] = useState<Record<string, number>>({});
  const [adjustAdvNotes, setAdjustAdvNotes] = useState<string>('');
  const [adjustAdvSubmitting, setAdjustAdvSubmitting] = useState(false);

  const [form] = Form.useForm();
  const [contactForm] = Form.useForm();
  const [addressForm] = Form.useForm();

  const [printModal, setPrintModal] = useState<{ visible: boolean; customer: Customer | null }>({
    visible: false,
    customer: null,
  });

  const [divisions, setDivisions] = useState<DivisionOption[]>(DEFAULT_DIVISIONS);

  useEffect(() => {
    apiService.get<any>('/divisions', { limit: 100, status: 'ACTIVE' })
      .then(res => {
        const d = res?.data || res;
        const list = (d?.data || (Array.isArray(d) ? d : [])).filter(
          (item: any) => item?.isActive !== false && item?.is_active !== false && item?.status !== 'INACTIVE',
        );
        if (list.length > 0) {
          setDivisions(list.map((item: any) => ({
            id: item.id,
            code: item.code || item.divisionCode,
            name: item.name || item.divisionName,
          })));
        }
      })
      .catch(() => {
        // Fallback to DEFAULT_DIVISIONS
      });
  }, []);

  const getCustomerCodeSeq = useCallback((code?: string | null): number => {
    const raw = String(code || '').trim().toUpperCase();
    const m = raw.match(/([0-9]+)$/);
    const num = m ? parseInt(m[1], 10) : 999999;
    return raw.startsWith('DEMO-') ? 900000 + num : num;
  }, []);

  const fetchCustomers = useCallback(async (pageNum: number = 1, currentLimit: number = pageSize, currentOrder: 'ASC' | 'DESC' = sortOrder) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: currentLimit, sortField: 'customerCode', sortOrder: currentOrder };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      if (filterCustomerType) params.customerType = filterCustomerType;
      if (filterDivision) params.divisionId = filterDivision;
      const response = await apiService.get<{ data: Customer[]; total: number }>('/customer/customers', params);
      setCustomers(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch customers');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterCustomerType, filterDivision, pageSize, sortOrder, message]);

  useEffect(() => {
    fetchCustomers(page, pageSize);
  }, [page, pageSize, fetchCustomers]);

  // Global header/tab refresh event listener
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      if (matchesTabRefresh(e, '/customers')) {
        void fetchCustomers(page, pageSize);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
  }, [fetchCustomers, page, pageSize]);

  // Dynamic available states from data
  const availableStates = useMemo(() => {
    const set = new Set<string>(DEFAULT_STATES);
    customers.forEach(c => {
      if (c.state) set.add(c.state);
      if (c.city) set.add(c.city);
    });
    return Array.from(set);
  }, [customers]);

  // Master status chevron filter state
  const [masterChevron, setMasterChevron] = useState<string>('ALL');

  // Master customer status counts
  const masterStatusCounts = useMemo(() => {
    return {
      all: total || customers.length,
      active: customers.filter(c => (c.status || '').toUpperCase() === 'ACTIVE').length,
      hold: customers.filter(c => Boolean(c.creditHold)).length,
      balance: customers.filter(c => Number(c.totalRevenue || 0) > 0).length,
      inactive: customers.filter(c => (c.status || '').toUpperCase() === 'INACTIVE').length,
    };
  }, [customers, total]);

  const handleMasterChevronClick = (chev: string) => {
    setMasterChevron(chev);
    setPage(1);
    if (chev === 'ALL') {
      setFilterStatus(undefined);
      setFilterBalance(undefined);
    } else if (chev === 'ACTIVE') {
      setFilterStatus('ACTIVE');
      setFilterBalance(undefined);
    } else if (chev === 'INACTIVE') {
      setFilterStatus('INACTIVE');
      setFilterBalance(undefined);
    } else if (chev === 'HOLD') {
      setFilterStatus(undefined);
      setFilterBalance(undefined);
    } else if (chev === 'BALANCE') {
      setFilterStatus(undefined);
      setFilterBalance('DUE');
    }
  };

  // Client-side filtering & sequence sorting for extra facets & master status chevron
  const displayedCustomers = useMemo(() => {
    const filtered = customers.filter(c => {
      // Process Chevron Filter
      if (masterChevron === 'ACTIVE' && (c.status || '').toUpperCase() !== 'ACTIVE') return false;
      if (masterChevron === 'INACTIVE' && (c.status || '').toUpperCase() === 'ACTIVE') return false;
      if (masterChevron === 'HOLD' && !c.creditHold) return false;
      if (masterChevron === 'BALANCE' && Number(c.totalRevenue || 0) <= 0) return false;

      if (filterDivision) {
        const matchesDiv = c.divisionId === filterDivision || c.division?.id === filterDivision;
        if (!matchesDiv) return false;
      }
      if (filterState) {
        const matchesState = (c.state && c.state.toLowerCase() === filterState.toLowerCase()) ||
          (c.city && c.city.toLowerCase() === filterState.toLowerCase());
        if (!matchesState) return false;
      }
      if (filterBalance) {
        const rev = Number(c.totalRevenue || 0);
        if (filterBalance === 'DUE' && rev <= 0) return false;
        if (filterBalance === 'ZERO' && rev !== 0) return false;
        if (filterBalance === 'EXCEEDED' && rev <= Number(c.creditLimit || 0)) return false;
      }
      return true;
    });

    const dir = sortOrder === 'ASC' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const diff = getCustomerCodeSeq(a.customerCode) - getCustomerCodeSeq(b.customerCode);
      if (diff !== 0) return diff * dir;
      return String(a.customerCode || '').localeCompare(String(b.customerCode || '')) * dir;
    });
  }, [customers, filterDivision, filterState, filterBalance, masterChevron, sortOrder, getCustomerCodeSeq]);

  // Clear all filters handler
  const handleClearAll = () => {
    setMasterChevron('ALL');
    setFilterDivision(undefined);
    setFilterState(undefined);
    setFilterStatus(undefined);
    setFilterBalance(undefined);
    setFilterCustomerType(undefined);
    setSearch('');
    setPage(1);
    void fetchCustomers(1, pageSize);
    message.info('All filters reset');
  };

  // Status toggle handler using dedicated activate/deactivate endpoints
  const handleToggleStatus = async (record: Customer, checked: boolean) => {
    const newStatus = checked ? 'ACTIVE' : 'INACTIVE';
    setCustomers(prev => prev.map(c => c.id === record.id ? { ...c, status: newStatus } : c));
    try {
      await apiService.patch(`/customer/customers/${record.id}/${checked ? 'activate' : 'deactivate'}`, {});
      message.success(`${record.name} is now ${newStatus}`);
    } catch {
      message.error('Failed to update customer status');
      setCustomers(prev => prev.map(c => c.id === record.id ? { ...c, status: record.status } : c));
    }
  };

  // Fetch Authoritative Customer Ledger
  const fetchCustomerLedger = useCallback(async (
    customerId: string,
    filters?: { fromDate?: string; toDate?: string; documentType?: string; divisionId?: string; search?: string },
  ) => {
    setLedgerLoading(true);
    try {
      const params: any = { limit: 500 };
      if (filters?.fromDate) params.fromDate = filters.fromDate;
      if (filters?.toDate) params.toDate = filters.toDate;
      if (filters?.documentType && filters.documentType !== 'ALL') params.documentType = filters.documentType;
      if (filters?.divisionId) params.divisionId = filters.divisionId;
      if (filters?.search?.trim()) params.search = filters.search.trim();

      const res = await apiService.get<{ data: CustomerLedgerEntry[]; total: number; summary: CustomerLedgerSummary }>(
        `/customer/customers/${customerId}/ledger`,
        params,
      );
      setLedgerEntries(res.data || []);
      setLedgerSummary(res.summary || null);
    } catch {
      setLedgerEntries([]);
      setLedgerSummary(null);
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  const fetchCustomerReceipts = useCallback(async (customerId: string) => {
    try {
      const [recRes, bankRes] = await Promise.all([
        apiService.get<any>('/sales/receipts', { customerId, limit: 200 }).catch(() => ({ data: [] })),
        bankAccounts.length === 0 ? apiService.get<any>('/sales/receipts/bank-accounts').catch(() => ({ data: [] })) : Promise.resolve(null),
      ]);
      setCustomerReceipts(recRes?.data || []);
      if (bankRes?.data) setBankAccounts(bankRes.data);
    } catch {
      setCustomerReceipts([]);
    }
  }, [bankAccounts.length]);

  // Fetch Official Customer Statement
  const fetchCustomerStatement = useCallback(async (customerId: string, from?: string, to?: string, docType?: string) => {
    setStatementLoading(true);
    try {
      const params: any = {};
      if (from) params.fromDate = from;
      if (to) params.toDate = to;
      if (docType && docType !== 'ALL') params.documentType = docType;
      const res = await apiService.get<{ data: any }>(`/customer/customers/${customerId}/statement`, params);
      setStatementData(res.data || null);
    } catch {
      setStatementData(null);
    } finally {
      setStatementLoading(false);
    }
  }, []);

  // Fetch Customer Purchased Products / Items
  const fetchCustomerItems = useCallback(async (customerId: string) => {
    setItemsLoading(true);
    try {
      const res = await apiService.get<{ data: any[] }>(`/customer/customers/${customerId}/items`);
      setCustomerItems(res.data || []);
    } catch {
      setCustomerItems([]);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  // Fetch Customer 360 Sales Summary
  const fetchSalesSummary = useCallback(async (customerId: string) => {
    try {
      const res = await apiService.get<{ data: any }>(`/customer/customers/${customerId}/sales-summary`);
      setSalesSummary(res.data || null);
    } catch {
      setSalesSummary(null);
    }
  }, []);

  // Seed Demo Customers
  const handleSeedDemoData = useCallback(async () => {
    try {
      const res = await apiService.post<{ success: boolean; seededCount: number; message: string }>('/customer/customers/demo/seed', {});
      message.success(res.message || 'Demo customers seeded successfully with initial ledger entries!');
      fetchCustomers(1, pageSize);
    } catch {
      message.error('Failed to seed demo customers');
    }
  }, [fetchCustomers, pageSize, message]);

  // CSV Export
  const handleExportCsv = useCallback(() => {
    if (displayedCustomers.length === 0) {
      message.warning('No customer data available to export');
      return;
    }
    const headers = ['Customer Code', 'Name', 'Legal Name', 'Type', 'Category', 'Phone', 'Email', 'State', 'City', 'NTN/Tax ID', 'STRN', 'Credit Limit', 'Balance Due', 'Status'];
    const rows = displayedCustomers.map(c => [
      `"${c.customerCode || ''}"`,
      `"${c.name || ''}"`,
      `"${c.legalName || ''}"`,
      `"${c.customerType || ''}"`,
      `"${c.customerCategory || ''}"`,
      `"${c.phone || ''}"`,
      `"${c.email || ''}"`,
      `"${c.state || ''}"`,
      `"${c.city || ''}"`,
      `"${c.taxNumber || ''}"`,
      `"${c.salesTaxNumber || ''}"`,
      c.creditLimit || 0,
      c.totalRevenue || 0,
      `"${c.status || 'ACTIVE'}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `customers_export_${dayjs().format('YYYYMMDD_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Customers exported to CSV');
  }, [displayedCustomers, message]);

  // Template Download
  const handleDownloadTemplate = useCallback(() => {
    const headers = ['customerCode', 'name', 'legalName', 'customerType', 'contactPerson', 'email', 'phone', 'city', 'state', 'taxNumber', 'salesTaxNumber', 'creditLimit', 'openingBalance'];
    const sample = ['CUS-000001', 'Pakistan Wire Demo Customer', 'Pakistan Wire Industries (Pvt.) LTD', 'Domestic Customer', 'Muhammad Afsar', 'afsar@demo.com', '03001000001', 'Lahore', 'Punjab', '1234567-8', '32-00-1234567-8', '1000000', '150000'];
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), sample.join(',')].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'customers_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Import CSV Template downloaded');
  }, [message]);

  const handlePrint = useCallback(() => {
    const headers = ['Code', 'Company Name', 'Type', 'Phone', 'City', 'NTN/STRN', 'Credit Limit', 'Balance'];
    const rows = displayedCustomers.map((c: any) => [
      c.customerCode || '-',
      c.companyName || c.name || '-',
      c.customerType || 'COMMERCIAL',
      c.phone || '-',
      c.city || '-',
      c.taxNumber || '-',
      `Rs ${formatDecimal(c.creditLimit || 0)}`,
      `Rs ${formatDecimal(c.currentBalance ?? c.openingBalance ?? 0)}`,
    ]);
    printTableList('Customer Master Directory', headers, rows);
  }, [displayedCustomers]);

  // Extract 3-letter abbreviation from Customer Name + 3-digit sequence (e.g. CUS-SWA-019)
  const buildSmartCustomerCode = useCallback(
    (rawName: string, currentCode?: string): string => {
      const cleaned = (rawName || '')
        .toUpperCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^A-Z0-9\s-]/g, ' ')
        .trim();
      const words = cleaned
        .split(/[\s-]+/)
        .filter((w) => w.length > 0 && !['PVT', 'LTD', 'LIMITED', 'THE', 'AND'].includes(w));
      const allWords = cleaned.split(/[\s-]+/).filter((w) => w.length > 0);
      const targetWords = words.length > 0 ? words : allWords;

      let abbr = 'GEN';
      if (allWords.length >= 3 && allWords[0].length === 3) {
        abbr = allWords[0].slice(0, 3);
      } else if (allWords.length >= 3) {
        abbr = (allWords[0][0] + allWords[1][0] + allWords[2][0]).toUpperCase();
      } else if (targetWords.length === 2) {
        const w1 = targetWords[0];
        const w2 = targetWords[1];
        abbr = w1.length >= 2 ? (w1.slice(0, 2) + w2[0]).toUpperCase() : (w1[0] + w2.slice(0, 2)).padEnd(3, 'X').toUpperCase();
      } else if (targetWords.length === 1) {
        abbr = targetWords[0].slice(0, 3).padEnd(3, 'X').toUpperCase();
      }

      // Preserve existing sequence number if editing, otherwise compute next sequence
      const existingSeqMatch = (currentCode || editingCustomer?.customerCode || '').match(/([0-9]+)$/);
      if (existingSeqMatch && editingCustomer) {
        const seqNum = Number(existingSeqMatch[1]) || 1;
        return `CUS-${abbr}-${String(seqNum).padStart(3, '0')}`;
      }

      let maxNum = 0;
      for (const c of customers) {
        const m = String(c.customerCode || '').match(/([0-9]+)$/);
        if (m) {
          const n = Number(m[1]);
          if (n > maxNum && n < 900000) maxNum = n;
        }
      }
      const nextSeq = String(maxNum + 1).padStart(3, '0');
      return `CUS-${abbr}-${nextSeq}`;
    },
    [customers, editingCustomer],
  );

  const handleCreate = useCallback(() => {
    setEditingCustomer(null);
    form.resetFields();
    form.setFieldsValue({
      divisionId: divisions[0]?.id || DEFAULT_DIVISIONS[0]?.id,
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      state: 'Punjab',
      taxNumber: '',
      openingBalance: 0,
      creditLimit: 0,
      creditDays: 30,
      isActive: true,
      addressLine1: '',
      currencyCode: 'PKR',
      discountPercent: 0,
      customerType: 'Domestic Customer',
      customerCategory: 'Category A - Enterprise',
      customerGroup: 'Key Accounts',
      taxStatus: 'REGISTERED',
      openingBalanceType: 'DEBIT',
      priceList: 'Standard Wholesale',
      paymentTerms: 'Net 30 Days',
      status: 'ACTIVE',
      city: 'Karachi',
      country: 'Pakistan',
      creditHold: false,
      creditHoldReason: '',
    });
    setModalVisible(true);
  }, [form, divisions]);

  // Register action buttons into Main Header (Top Application Header)
  useEffect(() => {
    const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
    setHeaderActions([
      {
        key: 'add-customer',
        node: (
          <Button
            className="btn-add-customer"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            + Add Customer
          </Button>
        ),
      },
      {
        key: 'seed-demo',
        node: (
          <Button
            className="btn-toolbar-white"
            icon={<BankOutlined />}
            onClick={handleSeedDemoData}
            title="Seed DEMO-CUS-001, DEMO-CUS-002, DEMO-CUS-003 with opening balances"
          >
            Seed Demo Data
          </Button>
        ),
      },
      {
        key: 'refresh',
        node: (
          <Button
            className="btn-toolbar-white"
            icon={<ReloadOutlined />}
            onClick={() => fetchCustomers(page, pageSize)}
          >
            Refresh
          </Button>
        ),
      },
      {
        key: 'csv',
        node: (
          <Button
            className="btn-toolbar-white"
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
            className="btn-toolbar-white"
            icon={<PrinterOutlined />}
            onClick={handlePrint}
          >
            Print
          </Button>
        ),
      },
      {
        key: 'import-csv',
        node: (
          <Button
            className="btn-toolbar-white"
            icon={<UploadOutlined />}
            onClick={() => setImportModalVisible(true)}
          >
            Import CSV
          </Button>
        ),
      },
      {
        key: 'template',
        node: (
          <Button
            className="btn-toolbar-white"
            icon={<DownloadOutlined />}
            onClick={handleDownloadTemplate}
          >
            Template
          </Button>
        ),
      },
    ]);

    return () => {
      clearHeaderActions();
    };
  }, [page, pageSize, handleCreate, handleSeedDemoData, handleExportCsv, handlePrint, handleDownloadTemplate, fetchCustomers]);

  const handleEdit = (record: Customer) => {
    setEditingCustomer(record);
    form.setFieldsValue({
      ...record,
      divisionId: record.divisionId || record.division?.id || divisions[0]?.id || DEFAULT_DIVISIONS[0]?.id,
      isActive: record.status === 'ACTIVE',
      customerSince: record.customerSince ? dayjs(record.customerSince) : null,
      lastContactDate: record.lastContactDate ? dayjs(record.lastContactDate) : null,
      nextFollowUpDate: record.nextFollowUpDate ? dayjs(record.nextFollowUpDate) : null,
    });
    setModalVisible(true);
  };

  const handleView = async (
    record: Customer,
    initialTab: 'ledger' | 'overview' | 'invoices' | 'payments' | 'returns' | 'products' = 'ledger',
  ) => {
    try {
      const res = await apiService.get<{ data: Customer }>(`/customer/customers/${record.id}`);
      setSelectedCustomer(res.data);
      setDetailVisible(true);
      setActiveChevron('ALL');
      setC360ActiveTab(initialTab);
      setC360SearchText('');
      setLedgerDocFilter('ALL');
      setLedgerDivisionFilter(undefined);
      setLedgerDateRange(null);
      void fetchCustomerLedger(record.id);
      void fetchCustomerStatement(record.id);
      void fetchCustomerItems(record.id);
      void fetchSalesSummary(record.id);
      void fetchCustomerReceipts(record.id);
    } catch {
      message.error('Failed to load customer details');
    }
  };

  // Auto-open Customer Details / Ledger History when navigated from Barcode / QR scanner
  useEffect(() => {
    const state = location.state as any;
    if (state?.entityId || state?.customerId) {
      const custId = state.entityId || state.customerId;
      void handleView({ id: custId } as any, 'ledger');
    }
  }, [location.state]);

  // Auto-open Customer 360 & Financial Ledger when deep-linked via /customers?customerId=<id>&tab=ledger
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qCustomerId = params.get('customerId')?.trim();
    if (!qCustomerId) return;
    const rawTab = (params.get('tab') || 'ledger').toLowerCase();
    const validTabs = ['ledger', 'overview', 'invoices', 'payments', 'returns', 'products'] as const;
    const targetTab = (validTabs as readonly string[]).includes(rawTab)
      ? (rawTab as 'ledger' | 'overview' | 'invoices' | 'payments' | 'returns' | 'products')
      : 'ledger';
    void handleView({ id: qCustomerId } as any, targetTab);
  }, [location.search]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setPendingCustomerValues(values);
      setConfirmSaveVisible(true);
    } catch {
      // Ant Design Form displays field validation errors in place
    }
  };

  const executeCustomerSave = async (values: any) => {
    const isEdit = Boolean(editingCustomer);
    setConfirmSaveVisible(false);
    setSaveResultOpen(true);
    setSaveResultPhase('loading');
    setSaveResultError(undefined);

    const status = values.isActive === false ? 'INACTIVE' : 'ACTIVE';
    const chosenDiv = divisions.find(d => d.id === values.divisionId) || DEFAULT_DIVISIONS.find(d => d.id === values.divisionId);
    const payload: any = {
      ...values,
      status,
      isActive: values.isActive !== false,
      customerSince: values.customerSince ? dayjs(values.customerSince).toISOString() : undefined,
      lastContactDate: values.lastContactDate ? dayjs(values.lastContactDate).toISOString() : undefined,
      nextFollowUpDate: values.nextFollowUpDate ? dayjs(values.nextFollowUpDate).toISOString() : undefined,
    };
    const user = useUserStore.getState().user;
    const resolvedCompanyId = editingCustomer?.companyId || user?.defaultCompanyId || user?.defaultCompany?.id || '7725aa04-a270-4314-9e82-90949cbe7791';
    payload.companyId = resolvedCompanyId;
    payload.divisionId = (values.divisionId && values.divisionId !== 'div-wd') ? values.divisionId : null;
    delete payload.divisionName;
    if (!payload.email) delete payload.email;
    if (!payload.website) delete payload.website;
    if (!payload.customerCode) delete payload.customerCode;
    if (!payload.assignedTo) delete payload.assignedTo;

    try {
      let res: any;
      if (isEdit && editingCustomer) {
        res = await apiService.patch(`/customer/customers/${editingCustomer.id}`, payload);
      } else {
        res = await apiService.post('/customer/customers', payload);
      }
      const saved = res?.data || res || {};
      if (isEdit && editingCustomer) {
        setCustomers(prev => prev.map(c => c.id === editingCustomer.id ? {
          ...c,
          ...payload,
          divisionId: payload.divisionId,
          division: chosenDiv ? { id: chosenDiv.id, name: chosenDiv.name, divisionCode: chosenDiv.code } as any : null,
        } : c));
      }
      setSaveResultPhase('success');
      setSaveResultSuccessTitle(isEdit ? 'Customer Updated Successfully' : 'Customer Created Successfully');
      setSaveResultData({
        title: isEdit ? 'Customer Updated Successfully' : 'Customer Created Successfully',
        message: `Customer profile for "${payload.name}" has been successfully persisted into company master records.`,
        recordType: 'Customer Code',
        recordCode: saved.customerCode || editingCustomer?.customerCode || 'CUS-MASTER',
        recordName: payload.name,
        userName: payload.contactPerson || payload.name,
        userEmail: payload.email || undefined,
        tags: [
          { label: chosenDiv?.name || 'General Division', color: 'purple' },
          { label: payload.state || 'Local', color: 'blue' },
          { label: payload.customerType || 'Customer', color: 'cyan' },
          { label: status, color: status === 'ACTIVE' ? 'green' : 'default' },
        ],
      });
      setModalVisible(false);
      fetchCustomers(page, pageSize);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Failed to save customer master profile';
      setSaveResultPhase('error');
      setSaveResultError(Array.isArray(errMsg) ? errMsg.join(', ') : errMsg);
      setSaveResultRetry(() => () => executeCustomerSave(values));
    }
  };

  const handleExecuteDelete = async (record: Customer) => {
    setDeleteModalVisible(false);
    setSaveResultOpen(true);
    setSaveResultPhase('loading');
    setSaveResultError(undefined);

    try {
      await apiService.delete(`/customer/customers/${record.id}`);
      setSaveResultPhase('success');
      setSaveResultSuccessTitle('Customer Deactivated Successfully');
      setSaveResultData({
        title: 'Customer Deactivated Successfully',
        message: `Customer "${record.name}" (${record.customerCode}) has been safely deactivated. All past ledger history is permanently intact.`,
        recordType: 'Customer Code',
        recordCode: record.customerCode,
        recordName: record.name,
        tags: [
          { label: 'DEACTIVATED', color: 'red' },
          { label: record.customerType || 'Customer', color: 'default' },
        ],
      });
      setCustomerToDelete(null);
      fetchCustomers(page, pageSize);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Failed to deactivate customer';
      setSaveResultPhase('error');
      setSaveResultError(Array.isArray(errMsg) ? errMsg.join(', ') : errMsg);
      setSaveResultRetry(() => () => handleExecuteDelete(record));
    }
  };

  const handleExecuteDeactivate = async (record: Customer) => {
    setDeleteModalVisible(false);
    setSaveResultOpen(true);
    setSaveResultPhase('loading');
    setSaveResultError(undefined);

    try {
      await apiService.patch(`/customer/customers/${record.id}`, { status: 'INACTIVE', isActive: false });
      setSaveResultPhase('success');
      setSaveResultSuccessTitle('Customer Inactivated Successfully');
      setSaveResultData({
        title: 'Customer Marked Inactive',
        message: `Customer "${record.name}" is now marked inactive.`,
        recordType: 'Customer Code',
        recordCode: record.customerCode,
        recordName: record.name,
        tags: [
          { label: 'INACTIVE', color: 'default' },
        ],
      });
      setCustomerToDelete(null);
      fetchCustomers(page, pageSize);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Failed to update customer status';
      setSaveResultPhase('error');
      setSaveResultError(Array.isArray(errMsg) ? errMsg.join(', ') : errMsg);
      setSaveResultRetry(() => () => handleExecuteDeactivate(record));
    }
  };

  const openDeleteConfirm = (record: Customer) => {
    setCustomerToDelete(record);
    setDeleteModalVisible(true);
  };

  const handleAddContact = async () => {
    if (!selectedCustomer) return;
    try {
      const values = await contactForm.validateFields();
      await apiService.post(`/customer/customers/${selectedCustomer.id}/contacts`, values);
      message.success('Contact added successfully');
      setContactModalVisible(false);
      contactForm.resetFields();
      handleView(selectedCustomer);
    } catch {
      message.error('Failed to add contact');
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!selectedCustomer) return;
    try {
      await apiService.delete(`/customer/customers/${selectedCustomer.id}/contacts/${contactId}`);
      message.success('Contact removed successfully');
      handleView(selectedCustomer);
    } catch {
      message.error('Failed to remove contact');
    }
  };

  const handleAddAddress = async () => {
    if (!selectedCustomer) return;
    try {
      const values = await addressForm.validateFields();
      await apiService.post(`/customer/customers/${selectedCustomer.id}/addresses`, values);
      message.success('Address added successfully');
      setAddressModalVisible(false);
      addressForm.resetFields();
      handleView(selectedCustomer);
    } catch {
      message.error('Failed to add address');
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!selectedCustomer) return;
    try {
      await apiService.delete(`/customer/customers/${selectedCustomer.id}/addresses/${addressId}`);
      message.success('Address removed successfully');
      handleView(selectedCustomer);
    } catch {
      message.error('Failed to remove address');
    }
  };

  // Main Customer Master Table Columns
  const columns: ColumnsType<Customer> = [
    {
      title: 'Customer',
      key: 'customer',
      sorter: (a, b) => getCustomerCodeSeq(a.customerCode) - getCustomerCodeSeq(b.customerCode),
      render: (_, record) => {
        return (
          <div className="customer-cell-wrapper">
            {record.customerCode && (
              <div style={{ marginBottom: 3 }}>
                <span
                  style={{
                    background: 'var(--inv-filter-card-bg, #f1f5f9)',
                    color: 'var(--inv-text-secondary, #1e293b)',
                    border: '1px solid var(--inv-filter-card-border, #cbd5e1)',
                    borderRadius: 4,
                    padding: '1px 7px',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <BarcodeOutlined style={{ color: 'var(--inv-text-muted, #64748b)' }} />
                  {record.customerCode}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <UserOutlined style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 12.5 }} />
              <span className="customer-name-text">{record.name}</span>
              {record.creditHold && (
                <Tag color="error" icon={<StopOutlined />} style={{ fontSize: 10, padding: '0 4px' }}>
                  HOLD
                </Tag>
              )}
            </div>
            {record.legalName && record.legalName !== record.name && (
              <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                {record.legalName}
              </div>
            )}
            <div className="customer-sub-row">
              <span className="badge-phone">
                <PhoneOutlined /> Phone
              </span>
              <span className="customer-sub-val">{record.phone || record.mobile || '-'}</span>
            </div>
            <div className="customer-sub-row">
              <span className="badge-email">
                <MailOutlined /> Email
              </span>
              <span className="customer-sub-val email-val">{record.email || '-'}</span>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Division',
      key: 'division',
      width: 175,
      render: (_, record) => {
        const divName = record.division?.name || record.divisionName || divisions.find(d => d.id === record.divisionId)?.name || 'General Division';
        const divCode = record.division?.divisionCode || divisions.find(d => d.id === record.divisionId)?.code;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {divCode && (
              <div>
                <span
                  style={{
                    background: 'var(--inv-badge-customer-bg, #f0f9ff)',
                    color: 'var(--inv-badge-customer-text, #0369a1)',
                    border: '1px solid var(--inv-badge-customer-border, #bae6fd)',
                    borderRadius: 4,
                    padding: '1px 7px',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    display: 'inline-block',
                  }}
                >
                  {divCode}
                </span>
              </div>
            )}
            <Tag color="purple" style={{ fontWeight: 600, fontSize: 12, padding: '2px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', width: 'fit-content', margin: 0 }}>
              <ApartmentOutlined style={{ marginRight: 5 }} />
              {divName}
            </Tag>
          </div>
        );
      },
    },
    {
      title: 'Classification & Code',
      key: 'type-code',
      sorter: (a, b) => getCustomerCodeSeq(a.customerCode) - getCustomerCodeSeq(b.customerCode),
      render: (_, record) => (
        <div className="location-cell-wrapper">
          <div className="location-top-row">
            <span className="badge-state" style={{ backgroundColor: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}>
              <BarcodeOutlined /> Code
            </span>
            <span className="location-state-title" style={{ fontFamily: 'monospace' }}>
              {record.customerCode}
            </span>
          </div>
          <div className="location-sub-row">
            <span className="badge-gst">Type</span>
            <span className="location-sub-val">{record.customerType}</span>
          </div>
          {record.customerCategory && (
            <div className="location-sub-row">
              <span className="badge-gstin" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
                Category
              </span>
              <span className="location-sub-val">{record.customerCategory}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Location & Tax',
      key: 'location',
      render: (_, record) => {
        const stateName = record.state || record.city || '-';
        const gstin = record.salesTaxNumber || record.taxNumber || 'Not Registered';
        return (
          <div className="location-cell-wrapper">
            <div className="location-top-row">
              <span className="badge-state">
                <EnvironmentOutlined /> Region
              </span>
              <span className="location-state-title">{stateName}</span>
            </div>
            <div className="location-sub-row">
              <span className="badge-gst">
                <AuditOutlined /> City
              </span>
              <span className="location-sub-val">{record.city || '-'}</span>
            </div>
            <div className="location-sub-row">
              <span className="badge-gstin">
                <AuditOutlined /> Tax #
              </span>
              <span className="location-sub-val" style={{ fontFamily: 'monospace' }}>{gstin}</span>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Commercial & Balance',
      key: 'balance',
      sorter: (a, b) =>
        Number(a.currentBalance ?? a.openingBalance ?? a.creditLimit ?? 0) -
        Number(b.currentBalance ?? b.openingBalance ?? b.creditLimit ?? 0),
      render: (_, record) => {
        const balanceDue = record.currentBalance !== undefined ? Number(record.currentBalance) : 0;
        const advBal = Number(record.unadjustedAdvanceBalance || 0);
        const opening = Number(record.openingBalance || 0);
        return (
          <div className="balance-cell-wrapper">
            <div className="balance-row">
              <span className="badge-opening">
                <WalletOutlined /> Opening
              </span>
              <span className="balance-val-normal">
                {record.currencyCode || 'PKR'} {formatDecimal(opening)} ({record.openingBalanceType || 'DEBIT'})
              </span>
            </div>
            <div className="balance-row">
              <span className="badge-balance-due">
                <ArrowDownOutlined /> Net Balance
              </span>
              <span className="balance-val-due" style={{ color: balanceDue < 0 ? '#16a34a' : undefined }}>
                {record.currencyCode || 'PKR'} {formatDecimal(Math.abs(balanceDue))} {balanceDue > 0 ? 'DR' : balanceDue < 0 ? 'CR' : ''}
              </span>
            </div>
            <div className="balance-row">
              <span className="badge-invoices">
                <DollarCircleOutlined /> Limit / Terms
              </span>
              <span className="balance-val-invoices">
                {record.currencyCode || 'PKR'} {formatDecimal(record.creditLimit || 0)}
                {record.paymentTerms ? ` · ${record.paymentTerms}` : ''}
              </span>
            </div>
            {advBal > 0 && (
              <div className="balance-row">
                <Tag color="blue" style={{ margin: 0, fontSize: 10.5, fontWeight: 700 }}>
                  Advance: {record.currencyCode || 'PKR'} {formatDecimal(advBal)}
                </Tag>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Active',
      key: 'active',
      align: 'center',
      width: 100,
      sorter: (a, b) => a.status.localeCompare(b.status),
      render: (_, record) => (
        <div className="active-cell-wrapper">
          <Switch
            checked={record.status === 'ACTIVE'}
            onChange={(checked) => handleToggleStatus(record, checked)}
            className="customer-active-switch"
          />
        </div>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'center',
      width: 140,
      render: (_, record) => (
        <div className="action-buttons-group">
          <Tooltip title="Customer Ledger & Master Details">
            <button
              className="action-btn-square action-btn-view"
              onClick={() => handleView(record)}
            >
              <EyeOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Edit Customer">
            <button
              className="action-btn-square action-btn-edit"
              onClick={() => handleEdit(record)}
            >
              <EditOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Delete Customer">
            <button
              className="action-btn-square action-btn-delete"
              onClick={() => openDeleteConfirm(record)}
            >
              <DeleteOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Share Account Statement via WhatsApp">
            <button
              className="action-btn-square"
              onClick={() => {
                const divName =
                  record.division?.name ||
                  record.divisionName ||
                  divisions.find((d) => d.id === record.divisionId)?.name ||
                  'All Divisions';
                openWhatsAppWithTemplate(
                  '[CUST-STMT]',
                  {
                    company: DEFAULT_COMPANY_NAME,
                    customer: record.name || record.legalName || 'Customer',
                    customer_code: record.customerCode || '—',
                    division: divName,
                    date: dayjs().format('YYYY-MM-DD'),
                    open_invoices: `${record.openInvoicesCount ?? 0} (Rs ${formatDecimal(Number(record.openInvoicesBalance || 0))})`,
                    advance_balance: `Rs ${formatDecimal(Number(record.unadjustedAdvanceBalance || 0))}`,
                    balance: `Rs ${formatDecimal(Number(record.currentBalance || 0))}`,
                  },
                  record.mobile || record.phone,
                );
              }}
            >
              <WhatsAppOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Print Barcode">
            <button
              className="action-btn-square"
              onClick={() => setPrintModal({ visible: true, customer: record })}
            >
              <PrinterOutlined />
            </button>
          </Tooltip>
        </div>
      ),
    },
  ];

  // Authoritative Ledger Table Columns (Styled exactly like customer-pixel-table)
  const ledgerColumns: ColumnsType<CustomerLedgerEntry> = [
    {
      title: 'Date',
      dataIndex: 'transactionDate',
      key: 'transactionDate',
      width: 110,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD'),
    },
    {
      title: 'Document Type',
      dataIndex: 'documentType',
      key: 'documentType',
      width: 160,
      render: (type: string) => {
        let badgeClass = 'type-adjustment';
        if (type === 'OPENING_BALANCE') badgeClass = 'type-opening';
        else if (type === 'SALES_INVOICE') badgeClass = 'type-invoice';
        else if (type === 'CUSTOMER_PAYMENT') badgeClass = 'type-payment';
        else if (type === 'CREDIT_NOTE' || type === 'SALES_RETURN') badgeClass = 'type-credit';
        else if (type === 'DEBIT_NOTE') badgeClass = 'type-debit';
        return <span className={`doc-type-badge ${badgeClass}`}>{type.replace(/_/g, ' ')}</span>;
      },
    },
    {
      title: 'Document No',
      dataIndex: 'documentNumber',
      key: 'documentNumber',
      render: (val: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{val}</span>,
    },
    {
      title: 'Reference / Details',
      dataIndex: 'reference',
      key: 'reference',
      render: (val: string, record) => (
        <div>
          <div>{val || '-'}</div>
          {record.notes && <div style={{ fontSize: 11, color: '#64748b' }}>{record.notes}</div>}
        </div>
      ),
    },
    {
      title: 'Movement',
      key: 'movement',
      width: 120,
      render: (_, record) => (
        record.debit > 0 ? (
          <span className="movement-badge money-in">
            <ArrowDownOutlined /> Money In
          </span>
        ) : record.credit > 0 ? (
          <span className="movement-badge money-out">
            <ArrowUpOutlined /> Money Out
          </span>
        ) : (
          <span style={{ color: '#94a3b8' }}>-</span>
        )
      ),
    },
    {
      title: 'Debit (+)',
      dataIndex: 'debit',
      key: 'debit',
      align: 'right',
      width: 120,
      render: (val: number, record) => (
        val > 0 ? (
          <span style={{ color: '#dc2626', fontWeight: 700 }}>
            {record.currency} {formatDecimal(val)}
          </span>
        ) : '-'
      ),
    },
    {
      title: 'Credit (-)',
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
      width: 120,
      render: (val: number, record) => (
        val > 0 ? (
          <span style={{ color: '#16a34a', fontWeight: 700 }}>
            {record.currency} {formatDecimal(val)}
          </span>
        ) : '-'
      ),
    },
    {
      title: 'Running Balance',
      dataIndex: 'runningBalance',
      key: 'runningBalance',
      align: 'right',
      width: 140,
      render: (val: number, record) => (
        <span style={{ fontWeight: 800, color: val >= 0 ? '#1e293b' : '#15803d' }}>
          {record.currency} {formatDecimal(Math.abs(val))} {val >= 0 ? 'DR' : 'CR'}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      align: 'center',
      render: (st: string) => (
        <Badge status={st === 'POSTED' ? 'success' : 'processing'} text={st} />
      ),
    },
  ];

  // Filtered Ledger entries based on active process chevron
  const filteredLedgerEntries = useMemo(() => {
    if (!ledgerEntries) return [];
    if (activeChevron === 'ALL') return ledgerEntries;
    if (activeChevron === 'SALE_BILLED') {
      return ledgerEntries.filter(e => e.documentType === 'SALES_INVOICE' || e.documentType === 'OPENING_BALANCE');
    }
    if (activeChevron === 'MONEY_RECEIVED') {
      return ledgerEntries.filter(e => e.documentType === 'CUSTOMER_PAYMENT');
    }
    if (activeChevron === 'MONEY_PAID') {
      return ledgerEntries.filter(e => e.documentType === 'REFUND');
    }
    if (activeChevron === 'SALES_RETURN') {
      return ledgerEntries.filter(e => e.documentType === 'SALES_RETURN' || e.documentType === 'CREDIT_NOTE');
    }
    if (activeChevron === 'EXPENSE') {
      return ledgerEntries.filter(e => e.documentType === 'DEBIT_NOTE');
    }
    return ledgerEntries;
  }, [ledgerEntries, activeChevron]);

  // Dynamic transaction counts for process chevrons
  const chevronCounts = useMemo(() => {
    return {
      all: ledgerEntries.length,
      saleBilled: ledgerEntries.filter(e => e.documentType === 'SALES_INVOICE' || e.documentType === 'OPENING_BALANCE').length,
      moneyReceived: ledgerEntries.filter(e => e.documentType === 'CUSTOMER_PAYMENT').length,
      moneyPaid: ledgerEntries.filter(e => e.documentType === 'REFUND').length,
      purchaseBooked: 0,
      expense: ledgerEntries.filter(e => e.documentType === 'DEBIT_NOTE').length,
      salesReturn: ledgerEntries.filter(e => e.documentType === 'SALES_RETURN' || e.documentType === 'CREDIT_NOTE').length,
    };
  }, [ledgerEntries]);

  // 5 KPI summary values matching Reference Image 2
  const kpiData = useMemo(() => {
    const moneyIn = (ledgerSummary?.totalDebit || 0) + (ledgerSummary?.totalCredit || 0);
    const moneyOut = ledgerSummary?.totalCredit || 0;
    const cashInHand = ledgerSummary?.totalCredit || 0;
    const owedToYou = ledgerSummary?.outstandingBalance || 0;
    const youOwe = (selectedCustomer && Number(selectedCustomer.openingBalance || 0) < 0) ? Math.abs(Number(selectedCustomer.openingBalance)) : 0;
    return { moneyIn, moneyOut, cashInHand, owedToYou, youOwe };
  }, [ledgerSummary, selectedCustomer]);

  // Live Customer 360 View Calculations (Zero Fake Fallback Data)
  const c360Invoices = useMemo(() => {
    const openInvList = ledgerSummary?.openInvoices || [];
    const openByNo = new Map<string, any>(openInvList.map((o: any) => [o.invoiceNo, o]));
    const ledgerInvoices = ledgerEntries
      .filter((e) => e.documentType === 'SALES_INVOICE')
      .map((e) => {
        const live = openByNo.get(e.documentNumber);
        const total = Number(live?.totalAmount ?? e.debit ?? 0);
        const paid = live ? Number(live.paidAmount || 0) : total;
        const balance = live ? Number(live.balance || 0) : 0;
        const dueDate = live?.dueDate || e.dueDate || null;
        const daysOverdue = live?.daysOverdue ?? e.overdueDays ?? 0;
        return {
          id: live?.id || e.salesInvoiceId || e.id,
          invoiceNo: e.documentNumber,
          invoiceDate: e.transactionDate,
          dueDate,
          paymentTerms: live?.paymentTerms || e.paymentTerms || 'Standard',
          divisionName: live?.divisionName || e.divisionName || null,
          socNumber: live?.socNumber || e.socNumber || null,
          totalAmount: total,
          paidAmount: paid,
          balance,
          daysOverdue,
          status: live?.status || e.invoiceStatus || (balance <= 0 ? 'Paid' : 'Posted'),
        };
      });

    // Include any open invoices not yet posted to ledger
    for (const oi of openInvList) {
      if (!ledgerInvoices.some((li) => li.invoiceNo === oi.invoiceNo)) {
        ledgerInvoices.push({
          id: oi.id,
          invoiceNo: oi.invoiceNo,
          invoiceDate: oi.invoiceDate,
          dueDate: oi.dueDate,
          paymentTerms: oi.paymentTerms || 'Standard',
          divisionName: oi.divisionName || null,
          socNumber: oi.socNumber || null,
          totalAmount: Number(oi.totalAmount || 0),
          paidAmount: Number(oi.paidAmount || 0),
          balance: Number(oi.balance || 0),
          daysOverdue: oi.daysOverdue || 0,
          status: oi.status || 'Pending',
        });
      }
    }
    return ledgerInvoices;
  }, [ledgerEntries, ledgerSummary]);

  const c360Payments = useMemo(() => {
    return customerReceipts.length > 0
      ? customerReceipts
      : ledgerEntries.filter((e) => e.documentType === 'CUSTOMER_PAYMENT' || e.documentType === 'ADVANCE_RECEIPT');
  }, [customerReceipts, ledgerEntries]);

  const c360Returns = useMemo(() => {
    return ledgerEntries.filter((e) => e.documentType === 'SALES_RETURN' || e.documentType === 'CREDIT_NOTE');
  }, [ledgerEntries]);

  const c360FilteredInvoices = useMemo(() => {
    if (!c360SearchText) return c360Invoices;
    const q = c360SearchText.toLowerCase();
    return c360Invoices.filter(
      (i) =>
        (i.invoiceNo || '').toLowerCase().includes(q) ||
        (i.status || '').toLowerCase().includes(q) ||
        (i.socNumber || '').toLowerCase().includes(q),
    );
  }, [c360Invoices, c360SearchText]);

  const c360OpeningBalance = useMemo(() => {
    return Number(ledgerSummary?.openingBalance ?? selectedCustomer?.openingBalance ?? 0);
  }, [ledgerSummary, selectedCustomer]);

  const c360TotalBilled = useMemo(() => {
    return Number(
      ledgerSummary?.totalInvoiced ??
      c360Invoices.reduce((acc, curr) => acc + (Number(curr.totalAmount) || 0), 0),
    );
  }, [ledgerSummary, c360Invoices]);

  const c360TotalPaid = useMemo(() => {
    return Number(ledgerSummary?.totalReceiptsAndAdvances ?? 0);
  }, [ledgerSummary]);

  const c360UnadjustedAdvance = useMemo(() => {
    return Number(ledgerSummary?.unadjustedAdvanceBalance ?? selectedCustomer?.unadjustedAdvanceBalance ?? 0);
  }, [ledgerSummary, selectedCustomer]);

  const c360BalanceDue = useMemo(() => {
    return Number(ledgerSummary?.netReceivableBalance ?? ledgerSummary?.outstandingBalance ?? selectedCustomer?.currentBalance ?? 0);
  }, [ledgerSummary, selectedCustomer]);

  const c360Aging = useMemo(() => {
    return ledgerSummary?.aging || {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90Plus: 0,
      totalOpenBalance: 0,
      overdueAmount: 0,
      overdueInvoiceCount: 0,
      openInvoiceCount: 0,
    };
  }, [ledgerSummary]);

  const c360AvgInvoice = useMemo(() => {
    if (c360Invoices.length === 0) return 0;
    return c360TotalBilled / c360Invoices.length;
  }, [c360TotalBilled, c360Invoices]);

  const c360FirstPurchaseDate = useMemo(() => {
    if (c360Invoices.length > 0 && c360Invoices[0].invoiceDate) {
      return dayjs(c360Invoices[0].invoiceDate).format('MMM DD, YYYY');
    }
    return '—';
  }, [c360Invoices]);

  const c360LastPurchaseDate = useMemo(() => {
    if (c360Invoices.length > 0 && c360Invoices[c360Invoices.length - 1].invoiceDate) {
      return dayjs(c360Invoices[c360Invoices.length - 1].invoiceDate).format('MMM DD, YYYY');
    }
    return '—';
  }, [c360Invoices]);

  const c360ActivityItems = useMemo(() => {
    return ledgerEntries.slice(-6).reverse().map((e) => ({
      id: e.id,
      title: `${String(e.documentType || '').replace(/_/g, ' ')} · ${e.documentNumber}`,
      date: dayjs(e.transactionDate).format('MMM DD, YYYY'),
      amount: Number(e.debit) || Number(e.credit) || 0,
      isCredit: Number(e.credit) > 0,
      raw: e,
    }));
  }, [ledgerEntries]);

  const openCustomerRecordPayment = async (preselectInvoice?: any) => {
    if (!selectedCustomer) return;
    if (bankAccounts.length === 0) {
      try {
        const res = await apiService.get<any>('/sales/receipts/bank-accounts');
        setBankAccounts(res?.data || []);
      } catch { /* ignore */ }
    }
    paymentForm.resetFields();
    const openList = ledgerSummary?.openInvoices || [];
    const nextAlloc: Record<string, number> = {};
    let defaultAmt = c360BalanceDue > 0 ? c360BalanceDue : 0;
    if (preselectInvoice?.id) {
      const bal = Number(preselectInvoice.balance || 0);
      if (bal > 0) {
        nextAlloc[preselectInvoice.id] = bal;
        defaultAmt = bal;
      }
    } else if (openList.length > 0 && defaultAmt > 0) {
      let rem = defaultAmt;
      for (const inv of openList) {
        if (rem <= 0.005) break;
        const b = Number(inv.balance || 0);
        if (b > 0) {
          const take = Math.round(Math.min(rem, b) * 100) / 100;
          nextAlloc[inv.id] = take;
          rem = Math.round((rem - take) * 100) / 100;
        }
      }
    }
    setPaymentAllocMap(nextAlloc);
    setWatchedPayMode('BANK_TRANSFER');
    setWatchedPayAmt(defaultAmt);
    paymentForm.setFieldsValue({
      amount: defaultAmt,
      paymentDate: dayjs(),
      paymentMethod: 'BANK_TRANSFER',
      receiptType: openList.length > 0 ? 'INVOICE_PAYMENT' : 'ADVANCE_PAYMENT',
      clearanceStatus: 'CLEARED',
      divisionId: selectedCustomer.divisionId || undefined,
    });
    setRecordPaymentModalVisible(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedCustomer) return;
    try {
      const values = await paymentForm.validateFields();
      const allocations = Object.entries(paymentAllocMap)
        .filter(([, amt]) => Number(amt) > 0)
        .map(([salesInvoiceId, allocatedAmount]) => ({
          salesInvoiceId,
          allocatedAmount: Math.round(Number(allocatedAmount) * 100) / 100,
        }));
      const allocSum = allocations.reduce((s, a) => s + a.allocatedAmount, 0);
      if (allocSum > Number(values.amount) + 0.01) {
        message.error('Allocated invoice total cannot exceed the received amount');
        return;
      }

      setPaymentLoading(true);
      setRecordPaymentModalVisible(false);
      setSaveResultOpen(true);
      setSaveResultPhase('loading');
      setSaveResultError(undefined);

      const res = await apiService.post<any>(`/customer/customers/${selectedCustomer.id}/ledger/payment`, {
        amount: values.amount,
        receiptDate: values.paymentDate ? values.paymentDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        paymentMode: values.paymentMethod || 'BANK_TRANSFER',
        receiptType: values.receiptType,
        bankAccountId: values.bankAccountId || undefined,
        bankName: values.bankName || undefined,
        chequeNumber: values.chequeNumber || undefined,
        chequeDate: values.chequeDate ? values.chequeDate.format('YYYY-MM-DD') : undefined,
        clearanceStatus: values.paymentMethod === 'CHEQUE' ? (values.clearanceStatus || 'CLEARED') : 'CLEARED',
        divisionId: values.divisionId || selectedCustomer.divisionId || undefined,
        socNumber: values.socNumber || undefined,
        poReference: values.poReference || undefined,
        referenceNo: values.reference || undefined,
        notes: values.notes || 'Recorded from Customer 360 Ledger',
        allocations,
      });
      const receipt = res?.data || res;
      setSaveResultPhase('success');
      setSaveResultSuccessTitle('Receipt Voucher Recorded Successfully');
      setSaveResultData({
        title: `Receipt ${receipt?.receiptNumber || ''} Posted`,
        message: `Receipt of PKR ${formatDecimal(values.amount)} credited to ${selectedCustomer.name}.`,
        recordType: 'Voucher #',
        recordCode: receipt?.receiptNumber || selectedCustomer.customerCode,
        recordName: selectedCustomer.name,
        tags: [
          { label: `PKR ${formatDecimal(values.amount)}`, color: 'green' },
          { label: String(values.paymentMethod || 'BANK_TRANSFER').replace(/_/g, ' '), color: 'blue' },
          ...(receipt?.unallocatedAdvanceAmount > 0
            ? [{ label: `Advance: PKR ${formatDecimal(receipt.unallocatedAdvanceAmount)}`, color: 'cyan' as const }]
            : []),
        ],
      });
      paymentForm.resetFields();
      void fetchCustomerLedger(selectedCustomer.id);
      void fetchCustomerStatement(selectedCustomer.id);
      void fetchSalesSummary(selectedCustomer.id);
      void fetchCustomerReceipts(selectedCustomer.id);
      fetchCustomers(page, pageSize);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Failed to record payment';
      setSaveResultPhase('error');
      setSaveResultError(Array.isArray(errMsg) ? errMsg.join(', ') : errMsg);
      setSaveResultRetry(() => () => handleRecordPayment());
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleOpenAdjustAdvance = () => {
    setAdjustAdvAllocMap({});
    setAdjustAdvNotes('');
    setAdjustAdvModalVisible(true);
  };

  const handleSubmitAdjustAdvance = async () => {
    if (!selectedCustomer) return;
    const invoiceAllocations = Object.entries(adjustAdvAllocMap)
      .filter(([, amt]) => Number(amt) > 0)
      .map(([salesInvoiceId, allocatedAmount]) => ({
        salesInvoiceId,
        allocatedAmount: Math.round(Number(allocatedAmount) * 100) / 100,
      }));
    if (invoiceAllocations.length === 0) {
      message.error('Please enter adjustment amount on at least one open invoice');
      return;
    }
    setAdjustAdvSubmitting(true);
    try {
      await apiService.post('/sales/receipts/apply-advance', {
        customerId: selectedCustomer.id,
        adjustmentDate: dayjs().format('YYYY-MM-DD'),
        notes: adjustAdvNotes || undefined,
        invoiceAllocations,
      });
      message.success('Customer advance adjusted against selected invoices');
      setAdjustAdvModalVisible(false);
      void fetchCustomerLedger(selectedCustomer.id);
      void fetchCustomerStatement(selectedCustomer.id);
      void fetchSalesSummary(selectedCustomer.id);
      void fetchCustomerReceipts(selectedCustomer.id);
      fetchCustomers(page, pageSize);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to adjust advance';
      message.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setAdjustAdvSubmitting(false);
    }
  };

  const handleExportLedgerCsv = () => {
    if (ledgerEntries.length === 0) {
      message.warning('No customer ledger transactions to export');
      return;
    }
    const headers = [
      'Date',
      'Document Type',
      'Voucher / Doc #',
      'Division',
      'SOC #',
      'PO Ref',
      'Payment Mode',
      'Reference',
      'Due Date',
      'Overdue Days',
      'Debit (PKR)',
      'Credit (PKR)',
      'Running Balance',
    ];
    const rows = ledgerEntries.map((e: any) => [
      `"${dayjs(e.transactionDate).format('YYYY-MM-DD')}"`,
      `"${String(e.documentType || '').replace(/_/g, ' ')}"`,
      `"${e.documentNumber || ''}"`,
      `"${e.divisionName || ''}"`,
      `"${e.socNumber || ''}"`,
      `"${e.poReference || ''}"`,
      `"${e.paymentMode || ''}"`,
      `"${(e.reference || e.notes || '').replace(/"/g, '""')}"`,
      `"${e.dueDate ? dayjs(e.dueDate).format('YYYY-MM-DD') : ''}"`,
      e.overdueDays || 0,
      e.debit || 0,
      e.credit || 0,
      e.runningBalance || 0,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `customer_ledger_${selectedCustomer?.customerCode || 'export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Customer ledger exported to CSV');
  };

  // Customer Statement Columns
  const statementColumns: ColumnsType<any> = [
    {
      title: 'Date',
      dataIndex: 'transactionDate',
      key: 'transactionDate',
      width: 110,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD'),
    },
    {
      title: 'Document Type',
      dataIndex: 'documentType',
      key: 'documentType',
      width: 150,
      render: (type: string) => {
        let badgeClass = 'type-adjustment';
        if (type === 'OPENING_BALANCE') badgeClass = 'type-opening';
        else if (type === 'SALES_INVOICE') badgeClass = 'type-invoice';
        else if (type === 'CUSTOMER_PAYMENT') badgeClass = 'type-payment';
        else if (type === 'CREDIT_NOTE' || type === 'SALES_RETURN') badgeClass = 'type-credit';
        else if (type === 'DEBIT_NOTE') badgeClass = 'type-debit';
        return <span className={`doc-type-badge ${badgeClass}`}>{type ? type.replace(/_/g, ' ') : '-'}</span>;
      },
    },
    {
      title: 'Document No',
      dataIndex: 'documentNumber',
      key: 'documentNumber',
      width: 140,
      render: (val: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{val || '-'}</span>,
    },
    {
      title: 'Description',
      dataIndex: 'reference',
      key: 'reference',
      render: (val: string, record: any) => <div>{val || record.notes || '-'}</div>,
    },
    {
      title: 'Debit (+)',
      dataIndex: 'debit',
      key: 'debit',
      align: 'right',
      width: 120,
      render: (val: number, record: any) => (
        val > 0 ? (
          <span style={{ color: '#dc2626', fontWeight: 700 }}>
            {record.currency || 'PKR'} {formatDecimal(val)}
          </span>
        ) : '-'
      ),
    },
    {
      title: 'Credit (-)',
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
      width: 120,
      render: (val: number, record: any) => (
        val > 0 ? (
          <span style={{ color: '#16a34a', fontWeight: 700 }}>
            {record.currency || 'PKR'} {formatDecimal(val)}
          </span>
        ) : '-'
      ),
    },
    {
      title: 'Running Balance',
      dataIndex: 'runningBalance',
      key: 'runningBalance',
      align: 'right',
      width: 140,
      render: (val: number, record: any) => (
        <span style={{ fontWeight: 800, color: val >= 0 ? '#1e293b' : '#15803d' }}>
          {record.currency || 'PKR'} {formatDecimal(Math.abs(val || 0))} {val >= 0 ? 'DR' : 'CR'}
        </span>
      ),
    },
  ];

  // Customer-wise Item History Columns
  const itemHistoryColumns: ColumnsType<any> = [
    {
      title: 'Item Code',
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 140,
      render: (code: string) => <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{code}</span>,
    },
    {
      title: 'Product / Item Description',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (name: string, record: any) => (
        <div>
          <span style={{ fontWeight: 600 }}>{name}</span>
          {record.category && <div style={{ fontSize: 11, color: '#64748b' }}>Category: {record.category}</div>}
        </div>
      ),
    },
    {
      title: 'UOM',
      dataIndex: 'uom',
      key: 'uom',
      width: 90,
      align: 'center',
      render: (uom: string) => <Tag color="cyan">{uom || 'PCS'}</Tag>,
    },
    {
      title: 'Total Quantity',
      dataIndex: 'totalQuantity',
      key: 'totalQuantity',
      align: 'right',
      width: 130,
      render: (qty: number) => <span style={{ fontWeight: 700 }}>{formatDecimal(qty || 0)}</span>,
    },
    {
      title: 'Total Sales Value',
      dataIndex: 'totalSalesValue',
      key: 'totalSalesValue',
      align: 'right',
      width: 150,
      render: (val: number) => (
        <span style={{ fontWeight: 700, color: '#16a34a' }}>
          PKR {formatDecimal(val || 0)}
        </span>
      ),
    },
    {
      title: 'Last Sale Date',
      dataIndex: 'lastSaleDate',
      key: 'lastSaleDate',
      width: 130,
      align: 'center',
      render: (d: string) => (d ? dayjs(d).format('YYYY-MM-DD') : '-'),
    },
  ];

  // Pagination calculation
  const totalEntries = total > 0 ? total : displayedCustomers.length;
  const startEntry = totalEntries === 0 ? 0 : (page - 1) * pageSize + 1;
  const endEntry = Math.min(page * pageSize, totalEntries);
  const totalPages = Math.ceil(totalEntries / pageSize) || 1;

  return (
    <div className="customer-page-container">
      {/* Main White Card */}
      <div className="customer-main-card">
        {/* Card Title */}
        <div className="customer-card-header">
          <AuditOutlined className="customer-card-header-icon" />
          <h2 className="customer-card-header-title">Customer Master & Accounts</h2>
        </div>

        {/* Process Chevron Ribbon (True Interlocking Arrow Pipeline) */}
        <div className="cm-chevron-ribbon">
          <div
            className={`cm-chevron-item chev-all ${masterChevron === 'ALL' ? 'active' : ''}`}
            onClick={() => handleMasterChevronClick('ALL')}
          >
            ALL ({masterStatusCounts.all})
          </div>
          <div
            className={`cm-chevron-item chev-active ${masterChevron === 'ACTIVE' ? 'active' : ''}`}
            onClick={() => handleMasterChevronClick('ACTIVE')}
          >
            ACTIVE ({masterStatusCounts.active})
          </div>
          <div
            className={`cm-chevron-item chev-hold ${masterChevron === 'HOLD' ? 'active' : ''}`}
            onClick={() => handleMasterChevronClick('HOLD')}
          >
            CREDIT HOLD ({masterStatusCounts.hold})
          </div>
          <div
            className={`cm-chevron-item chev-balance ${masterChevron === 'BALANCE' ? 'active' : ''}`}
            onClick={() => handleMasterChevronClick('BALANCE')}
          >
            WITH BALANCE ({masterStatusCounts.balance})
          </div>
          <div
            className={`cm-chevron-item chev-inactive ${masterChevron === 'INACTIVE' ? 'active' : ''}`}
            onClick={() => handleMasterChevronClick('INACTIVE')}
          >
            INACTIVE ({masterStatusCounts.inactive})
          </div>
        </div>

        {/* Distinctive Mint Green Accent Line */}
        <div className="mint-accent-line" />

        {/* Expandable Help Banner (Reference Image 2) */}
        <div className="help-banner-card">
          <div className="help-banner-header" onClick={() => setHelpBannerOpen(!helpBannerOpen)}>
            <div className="help-banner-left">
              <InfoCircleOutlined className="help-icon" />
              <span>How to read this page — tap to {helpBannerOpen ? 'collapse' : 'open'}</span>
            </div>
            <div className="help-banner-right">
              <span>{helpBannerOpen ? 'Hide Guide ▲' : 'Show Guide ▼'}</span>
            </div>
          </div>
          {helpBannerOpen && (
            <div className="help-banner-content">
              <div className="help-col">
                <span className="help-col-title">Authoritative Master</span>
                <span className="help-col-desc">
                  Single source of truth for customer identities across Sales Orders, Invoices, Delivery Notes, and Customer Statements.
                </span>
              </div>
              <div className="help-col">
                <span className="help-col-title">Ledger & Statements</span>
                <span className="help-col-desc">
                  Debit: Sales Invoices & Debit Notes. Credit: Customer Receipts & Sales Returns. Net running balance updates automatically.
                </span>
              </div>
              <div className="help-col">
                <span className="help-col-title">Credit Controls</span>
                <span className="help-col-desc">
                  Credit Limit, Payment Terms, and Credit Hold protect against overdrawn accounts and unauthorized order generation.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 3. Table Controls Bar (Search, Filters Toggle & Show entries) */}
        <div className="customer-table-controls" style={{ marginBottom: showFilters ? 8 : 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="search-control">
              <span>Search:</span>
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search code, name, legal name, phone, NTN, STRN..."
                className="search-input"
                allowClear
                style={{ width: 280 }}
              />
            </div>
            <Button
              icon={<FilterOutlined />}
              type={showFilters ? 'primary' : 'default'}
              onClick={() => setShowFilters((prev) => !prev)}
              style={{ fontWeight: 600 }}
            >
              Filters {[filterDivision, filterState, filterStatus, filterBalance, filterCustomerType].filter(Boolean).length > 0
                ? `(${[filterDivision, filterState, filterStatus, filterBalance, filterCustomerType].filter(Boolean).length})`
                : ''}
            </Button>
            <Button
              icon={sortOrder === 'ASC' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              onClick={() => {
                const next = sortOrder === 'ASC' ? 'DESC' : 'ASC';
                setSortOrder(next);
                setPage(1);
                void fetchCustomers(1, pageSize, next);
              }}
              style={{ fontWeight: 700 }}
              title="Toggle sequence order between Ascending (001 ➔ New) and Descending (New ➔ 001)"
            >
              {sortOrder === 'ASC' ? 'Order: 001 ➔ New (ASC)' : 'Order: New ➔ 001 (DESC)'}
            </Button>
          </div>

          <div className="entries-control">
            <span>Show</span>
            <Select
              value={pageSize}
              onChange={(val) => {
                setPageSize(val);
                setPage(1);
              }}
              className="entries-select"
            >
              <Select.Option value={10}>10</Select.Option>
              <Select.Option value={25}>25</Select.Option>
              <Select.Option value={50}>50</Select.Option>
              <Select.Option value={100}>100</Select.Option>
            </Select>
            <span>entries</span>
          </div>
        </div>

        {/* 4. Collapsible Filters Section */}
        {showFilters && (
          <div className="customer-filter-section" style={{ marginBottom: 12 }}>
            <div className="filter-header-row">
              <div className="filter-header-left" style={{ cursor: 'pointer' }} onClick={() => setShowFilters(false)}>
                <FilterOutlined className="filter-funnel-icon" />
                <span>Filters</span>
              </div>
              <button className="btn-clear-all" onClick={handleClearAll}>
                <CloseCircleOutlined /> Clear All
              </button>
            </div>

            <div className="filter-boxes-grid">
              {/* Box 1: DIVISION */}
              <div className="filter-box-item">
                <div className="filter-box-label">
                  <ApartmentOutlined className="label-icon" />
                  <span>DIVISION</span>
                </div>
                <Select
                  placeholder="All Divisions"
                  allowClear
                  className="filter-box-select"
                  value={filterDivision}
                  onChange={(val) => {
                    setFilterDivision(val);
                    setPage(1);
                  }}
                >
                  {divisions.map(d => (
                    <Select.Option key={d.id} value={d.id}>
                      {d.name} {d.code ? `(${d.code})` : ''}
                    </Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 2: STATE */}
              <div className="filter-box-item">
                <div className="filter-box-label">
                  <BankOutlined className="label-icon" />
                  <span>STATE / PROVINCE</span>
                </div>
                <Select
                  placeholder="All states"
                  allowClear
                  className="filter-box-select"
                  value={filterState}
                  onChange={(val) => setFilterState(val)}
                >
                  {availableStates.map(st => (
                    <Select.Option key={st} value={st}>{st}</Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 3: STATUS */}
              <div className="filter-box-item">
                <div className="filter-box-label">
                  <CheckCircleOutlined className="label-icon" />
                  <span>STATUS</span>
                </div>
                <Select
                  placeholder="All statuses"
                  allowClear
                  className="filter-box-select"
                  value={filterStatus}
                  onChange={(val) => {
                    setFilterStatus(val);
                    setPage(1);
                  }}
                >
                  {STATUS_OPTIONS.map(st => (
                    <Select.Option key={st} value={st}>{st}</Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 4: BALANCE */}
              <div className="filter-box-item">
                <div className="filter-box-label">
                  <WalletOutlined className="label-icon" />
                  <span>BALANCE STATUS</span>
                </div>
                <Select
                  placeholder="Any"
                  allowClear
                  className="filter-box-select"
                  value={filterBalance}
                  onChange={(val) => setFilterBalance(val)}
                >
                  <Select.Option value="DUE">With Balance Due</Select.Option>
                  <Select.Option value="ZERO">Zero Balance</Select.Option>
                  <Select.Option value="EXCEEDED">Credit Limit Exceeded</Select.Option>
                </Select>
              </div>

              {/* Box 5: CUSTOMER TYPE */}
              <div className="filter-box-item">
                <div className="filter-box-label">
                  <AuditOutlined className="label-icon" />
                  <span>CUSTOMER TYPE</span>
                </div>
                <Select
                  placeholder="All Types"
                  allowClear
                  className="filter-box-select"
                  value={filterCustomerType}
                  onChange={(val) => {
                    setFilterCustomerType(val);
                    setPage(1);
                  }}
                >
                  {CUSTOMER_TYPES.map(m => (
                    <Select.Option key={m} value={m}>{m}</Select.Option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* 5. Custom Styled Table */}
        {loading && customers.length === 0 ? (
          <GlobalLoading
            title="Loading Customer Master..."
            subtitle="Fetching customer directory, commercial profiles, and credit accounts..."
            badgeText="LIVE DATABASE QUERY"
            minHeight={400}
          />
        ) : (
          <Table
            className="customer-pixel-table"
            columns={columns}
            dataSource={displayedCustomers}
            rowKey="id"
            loading={loading}
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
        )}

        {/* 6. Custom Table Footer / Pagination */}
        <div className="customer-table-footer">
          <div className="showing-entries-text">
            Showing {startEntry} to {endEntry} of {totalEntries} entries
          </div>

          <div className="customer-custom-pagination">
            <button
              className="page-btn"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(p - 1, 1))}
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                className={`page-btn ${page === p ? 'active' : ''}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              className="page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(p + 1, totalPages))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Create / Edit Customer Master Modal — Daily Production Entry Wizard Style with 7px Outer Translucent Frame */}
      <DraggableResizableModal
        wrapClassName="pwi-customer-wizard-modal-wrap"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={980}
        height={720}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 8 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(234, 88, 12, 0.38)',
                color: '#ffffff',
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              {editingCustomer ? <EditOutlined /> : <UserOutlined />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '1.1px',
                  color: '#ea580c',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>CUSTOMER MASTER · ACCOUNT &amp; BILLING PROFILE</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: token.colorTextSecondary,
                    backgroundColor: token.colorFillAlter,
                    padding: '1px 8px',
                    borderRadius: 6,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    letterSpacing: 'normal',
                    textTransform: 'none',
                  }}
                >
                  Drag to Move
                </span>
              </div>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 900,
                  color: token.colorText,
                  marginTop: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {editingCustomer ? `Edit Customer — ${editingCustomer.name}` : 'Add New Customer'}
              </div>
            </div>
          </div>
        }
        infoTooltip="Register a customer master profile with division, commercial, and credit parameters"
        destroyOnHidden
        styles={{
          content: {
            padding: 7,
            borderRadius: 22,
            background: 'color-mix(in srgb, var(--theme-primary, #ea580c) 8%, rgba(148, 163, 184, 0.22))',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.28)',
            overflow: 'hidden',
          },
          header: {
            backgroundColor: token.colorBgContainer,
            borderRadius: '16px 16px 0 0',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            padding: '14px 20px',
            marginBottom: 0,
          },
          body: {
            backgroundColor: token.colorBgLayout,
            padding: '16px 20px',
            maxHeight: 'calc(100vh - 220px)',
            overflowY: 'auto',
          },
          footer: {
            backgroundColor: token.colorBgContainer,
            borderRadius: '0 0 16px 16px',
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            padding: '12px 20px',
            marginTop: 0,
          },
        }}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: 8,
                backgroundColor: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                fontSize: 12,
                fontWeight: 600,
                color: token.colorTextSecondary,
              }}
            >
              {editingCustomer ? `Editing ${editingCustomer.customerCode || 'Customer'}` : 'New Customer Profile'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button
                size="large"
                icon={<CloseOutlined />}
                onClick={() => setModalVisible(false)}
                style={{ minWidth: 105, borderRadius: 10, fontWeight: 600 }}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                size="large"
                icon={<SaveOutlined />}
                onClick={() => form.submit()}
                style={{
                  minWidth: 165,
                  borderRadius: 10,
                  fontWeight: 700,
                  border: 'none',
                  background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                  boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)',
                }}
              >
                {editingCustomer ? 'Save Changes' : 'Save Customer'}
              </Button>
            </div>
          </div>
        }
      >
        {/* Modal Form Body */}
        <div
          style={{
            backgroundColor: token.colorBgContainer,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 14,
            padding: '16px 18px',
          }}
        >
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            {/* Row 1: Customer Name, Contact Person, Phone */}
            <Row gutter={[16, 12]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  name="name"
                  label={
                    <span className="reference-field-label">
                      <UserOutlined className="reference-field-icon" /> Customer Name <span style={{ color: '#ef4444' }}>*</span>
                    </span>
                  }
                  rules={[{ required: true, message: 'Please enter customer name' }]}
                >
                  <Input
                    placeholder="e.g. Swabi Autos"
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!editingCustomer) {
                        form.setFieldsValue({
                          customerCode: val.trim() ? buildSmartCustomerCode(val) : '',
                        });
                      }
                    }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  name="contactPerson"
                  label={
                    <span className="reference-field-label">
                      <UserOutlined className="reference-field-icon" /> Contact Person
                    </span>
                  }
                >
                  <Input placeholder="Who to ask for" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  name="phone"
                  label={
                    <span className="reference-field-label">
                      <PhoneOutlined className="reference-field-icon" /> Phone
                    </span>
                  }
                >
                  <Input placeholder="Phone" />
                </Form.Item>
              </Col>
            </Row>

            {/* Row 2: Division Name (replaces Company ID), Email, Customer Code */}
            <Row gutter={[16, 12]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  name="divisionId"
                  label={
                    <span className="reference-field-label">
                      <ApartmentOutlined className="reference-field-icon" /> Division Name <span style={{ color: '#ef4444' }}>*</span>
                    </span>
                  }
                  rules={[{ required: true, message: 'Please select division' }]}
                  initialValue={divisions[0]?.id || DEFAULT_DIVISIONS[0]?.id}
                >
                  <Select
                    placeholder="Select division..."
                    showSearch
                    optionFilterProp="children"
                  >
                    {divisions.map(d => (
                      <Select.Option key={d.id} value={d.id}>
                        {d.name} {d.code ? `(${d.code})` : ''}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  name="email"
                  label={
                    <span className="reference-field-label">
                      <MailOutlined className="reference-field-icon" /> Email
                    </span>
                  }
                >
                  <Input type="email" placeholder="Email" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  name="customerCode"
                  label={
                    <span className="reference-field-label">
                      <BarcodeOutlined className="reference-field-icon" /> Customer Code (Name + No.)
                    </span>
                  }
                  tooltip="Auto-generates 3 letters from Customer Name + sequence number (e.g. CUS-SWA-019). You can also edit it manually."
                >
                  <Input
                    placeholder="e.g. CUS-SWA-019 (Auto from Name)"
                    style={{ fontFamily: 'monospace', fontWeight: 700 }}
                    addonAfter={
                      <span
                        style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#059669' }}
                        title="Generate code from Customer Name"
                        onClick={() => {
                          const currentName = form.getFieldValue('name') || '';
                          const currentCode = form.getFieldValue('customerCode') || '';
                          form.setFieldsValue({
                            customerCode: buildSmartCustomerCode(currentName, currentCode),
                          });
                        }}
                      >
                        Auto
                      </span>
                    }
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* Row 3: Province / Region, NTN / Tax Number, Opening Balance */}
            <Row gutter={[16, 12]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  name="state"
                  label={
                    <span className="reference-field-label">
                      <BankOutlined className="reference-field-icon" /> Province / Region
                    </span>
                  }
                >
                  <Select
                    placeholder="Select province / region..."
                    allowClear
                    showSearch
                    optionFilterProp="children"
                  >
                    <Select.Option value="Sindh">Sindh</Select.Option>
                    <Select.Option value="Punjab">Punjab</Select.Option>
                    <Select.Option value="Khyber Pakhtunkhwa">Khyber Pakhtunkhwa (KPK)</Select.Option>
                    <Select.Option value="Balochistan">Balochistan</Select.Option>
                    <Select.Option value="Islamabad Capital Territory">Islamabad Capital Territory (ICT)</Select.Option>
                    <Select.Option value="Azad Jammu & Kashmir">Azad Jammu & Kashmir (AJK)</Select.Option>
                    <Select.Option value="Gilgit-Baltistan">Gilgit-Baltistan (GB)</Select.Option>
                    <Select.Option value="Export / International">Export / International</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  name="taxNumber"
                  label={
                    <span className="reference-field-label">
                      <AuditOutlined className="reference-field-icon" /> NTN / Tax Number
                    </span>
                  }
                >
                  <Input placeholder="e.g. 0819234-7" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  name="openingBalance"
                  label={
                    <span className="reference-field-label">
                      <WalletOutlined className="reference-field-icon" /> Opening Balance (PKR)
                    </span>
                  }
                  initialValue={0}
                >
                  <InputNumber style={{ width: '100%' }} min={0} />
                </Form.Item>
              </Col>
            </Row>

            {/* Row 4: Payment Terms, Credit Days, Credit Limit */}
            <Row gutter={[16, 12]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  name="paymentTerms"
                  label={
                    <span className="reference-field-label">
                      <AuditOutlined className="reference-field-icon" /> Payment Terms
                    </span>
                  }
                  initialValue="Net 30 Days"
                >
                  <Select
                    onChange={(val: string) => {
                      const low = String(val || '').toLowerCase();
                      const inferred = low.includes('7')
                        ? 7
                        : low.includes('15')
                          ? 15
                          : low.includes('30')
                            ? 30
                            : low.includes('60')
                              ? 60
                              : low.includes('90')
                                ? 90
                                : 0;
                      form.setFieldsValue({ creditDays: inferred });
                    }}
                  >
                    {PAYMENT_TERMS_OPTIONS.map((p) => (
                      <Select.Option key={p} value={p}>{p}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  name="creditDays"
                  label={
                    <span className="reference-field-label">
                      <CalendarOutlined className="reference-field-icon" /> Credit Days
                    </span>
                  }
                  initialValue={30}
                >
                  <InputNumber style={{ width: '100%' }} min={0} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  name="creditLimit"
                  label={
                    <span className="reference-field-label">
                      <CheckCircleOutlined className="reference-field-icon" /> Credit Limit (0 = Unlimited)
                    </span>
                  }
                  initialValue={0}
                >
                  <InputNumber style={{ width: '100%' }} min={0} />
                </Form.Item>
              </Col>
            </Row>

            {/* Row 5: Credit Hold, Reason, Active Toggle */}
            <Row gutter={[16, 12]}>
              <Col xs={24} sm={8} md={6}>
                <Form.Item
                  name="creditHold"
                  valuePropName="checked"
                  initialValue={false}
                  label={
                    <span className="reference-field-label">
                      <StopOutlined className="reference-field-icon" /> Credit Hold
                    </span>
                  }
                >
                  <Switch checkedChildren="ON HOLD" unCheckedChildren="Clear" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={10} md={12}>
                <Form.Item
                  name="creditHoldReason"
                  label={
                    <span className="reference-field-label">
                      <WarningOutlined className="reference-field-icon" /> Credit Hold Reason
                    </span>
                  }
                >
                  <Input placeholder="Optional reason if account is placed on credit hold" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={6} md={6}>
                <Form.Item
                  name="isActive"
                  valuePropName="checked"
                  initialValue={true}
                  label={
                    <span className="reference-field-label">
                      <SyncOutlined className="reference-field-icon" /> Active
                    </span>
                  }
                >
                  <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                </Form.Item>
              </Col>
            </Row>

            {/* Row 5: Address */}
            <Row gutter={[16, 12]}>
              <Col span={24}>
                <Form.Item
                  name="addressLine1"
                  label={
                    <span className="reference-field-label">
                      <EnvironmentOutlined className="reference-field-icon" /> Address
                    </span>
                  }
                >
                  <Input.TextArea rows={3} placeholder="Customer physical / registered address" />
                </Form.Item>
              </Col>
            </Row>

            {/* Optional Collapsible: Additional Enterprise ERP Settings */}
            <Collapse
              size="small"
              style={{
                marginTop: 8,
                backgroundColor: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 12,
              }}
            >
              <Collapse.Panel
                header={
                  <Space size={8}>
                    <SettingOutlined style={{ color: '#ea580c' }} />
                    <span style={{ fontWeight: 700, color: token.colorText }}>
                      Additional ERP Master Settings (Type, Category, Payment Terms, Price List, Notes)
                    </span>
                  </Space>
                }
                key="1"
              >
                <Row gutter={[16, 10]}>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item name="shortName" label="Short Name / Alias">
                      <Input placeholder="e.g. CUS-ALIAS" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item name="customerType" label="Customer Type" initialValue="Domestic Customer">
                      <Select>
                        {CUSTOMER_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item name="customerCategory" label="Category" initialValue="Category A - Enterprise">
                      <Select>
                        {CUSTOMER_CATEGORIES.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item name="currencyCode" label="Currency" initialValue="PKR">
                      <Select>
                        <Select.Option value="PKR">PKR (Pakistani Rupee)</Select.Option>
                        <Select.Option value="USD">USD (US Dollar)</Select.Option>
                        <Select.Option value="EUR">EUR (Euro)</Select.Option>
                        <Select.Option value="GBP">GBP (British Pound)</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item name="priceList" label="Default Price List" initialValue="Standard Wholesale">
                      <Select>
                        {PRICE_LISTS.map(p => <Select.Option key={p} value={p}>{p}</Select.Option>)}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item name="city" label="City" initialValue="Lahore">
                      <Input placeholder="City" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item name="country" label="Country" initialValue="Pakistan">
                      <Input placeholder="Country" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item name="salesTaxNumber" label="Sales Tax (STRN)">
                      <Input placeholder="e.g. 32-00-1234567-8" />
                    </Form.Item>
                  </Col>
                </Row>
              </Collapse.Panel>
            </Collapse>

          </Form>
        </div>
      </DraggableResizableModal>

      {/* Enterprise Customer 360 Financial Ledger & Account Modal */}
      <Modal
        wrapClassName="customer-360-modal"
        title={null}
        closable={false}
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={1260}
        destroyOnClose
      >
        {selectedCustomer && (
          <div style={{ backgroundColor: token.colorBgContainer, color: token.colorText }}>
            {/* Top Modal Header */}
            <div
              style={{
                backgroundColor: token.colorFillAlter,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <Space size={10}>
                <UserOutlined style={{ fontSize: 18, color: token.colorPrimary }} />
                <span style={{ fontSize: 16, fontWeight: 800, color: token.colorText }}>
                  {selectedCustomer.name} — Customer Financial Ledger &amp; 360° Account
                </span>
                <Tag color={selectedCustomer.status === 'ACTIVE' ? 'green' : 'default'}>
                  {selectedCustomer.status || 'ACTIVE'}
                </Tag>
                {selectedCustomer.creditHold && (
                  <Tag color="red" icon={<StopOutlined />}>
                    CREDIT HOLD{selectedCustomer.creditHoldReason ? `: ${selectedCustomer.creditHoldReason}` : ''}
                  </Tag>
                )}
              </Space>
              <CloseOutlined
                style={{ fontSize: 16, cursor: 'pointer', color: token.colorTextSecondary }}
                onClick={() => setDetailVisible(false)}
              />
            </div>

            {/* Body Split: Left Sidebar & Right Workspace */}
            <div style={{ display: 'flex', minHeight: 620, flexWrap: 'nowrap' }}>
              {/* Left Sidebar */}
              <div
                style={{
                  width: 280,
                  minWidth: 280,
                  borderRight: `1px solid ${token.colorBorderSecondary}`,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  backgroundColor: token.colorBgContainer,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 10,
                    backgroundColor: token.colorPrimary,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    fontWeight: 800,
                    margin: '0 auto',
                  }}
                >
                  {selectedCustomer.customerCode
                    ? selectedCustomer.customerCode.replace(/^CUS-|^DEMO-CUS-/, '').slice(0, 4)
                    : selectedCustomer.name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: token.colorText }}>{selectedCustomer.name}</div>
                  <div style={{ fontSize: 11.5, fontFamily: 'monospace', color: token.colorTextSecondary }}>
                    {selectedCustomer.customerCode}
                  </div>
                </div>

                {/* Net Receivable Box */}
                <div
                  style={{
                    border: `1px solid ${c360BalanceDue > 0 ? token.colorErrorBorder : token.colorSuccessBorder}`,
                    backgroundColor: token.colorFillAlter,
                    borderRadius: 8,
                    padding: '10px 12px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: token.colorTextSecondary, textTransform: 'uppercase' }}>
                    {c360BalanceDue < 0 ? 'UNADJUSTED CREDIT BALANCE' : 'NET RECEIVABLE BALANCE'}
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 900,
                      color: c360BalanceDue > 0 ? '#dc2626' : '#16a34a',
                      marginTop: 2,
                    }}
                  >
                    Rs {formatDecimal(Math.abs(c360BalanceDue))} {c360BalanceDue > 0 ? 'DR' : c360BalanceDue < 0 ? 'CR' : ''}
                  </div>
                </div>

                {/* Metadata Rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: token.colorTextSecondary }}>Division:</span>
                    <span style={{ fontWeight: 600, textAlign: 'right' }}>
                      {selectedCustomer.division?.name ||
                        selectedCustomer.divisionName ||
                        divisions.find((d) => d.id === selectedCustomer.divisionId)?.name ||
                        '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: token.colorTextSecondary }}>Payment Terms:</span>
                    <span style={{ fontWeight: 700, color: token.colorPrimary }}>
                      {ledgerSummary?.paymentTerms || selectedCustomer.paymentTerms || 'Cash / Immediate'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: token.colorTextSecondary }}>Credit Limit:</span>
                    <span style={{ fontWeight: 700 }}>
                      {Number(selectedCustomer.creditLimit) > 0
                        ? `Rs ${formatDecimal(selectedCustomer.creditLimit)}`
                        : 'Unlimited'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: token.colorTextSecondary }}>Contact:</span>
                    <span style={{ fontWeight: 600 }}>{selectedCustomer.contactPerson || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: token.colorTextSecondary }}>Phone:</span>
                    <span style={{ fontWeight: 600 }}>{selectedCustomer.phone || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: token.colorTextSecondary }}>Region / City:</span>
                    <span style={{ fontWeight: 600 }}>
                      {[selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(', ') || '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: token.colorTextSecondary }}>NTN / STRN:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {selectedCustomer.taxNumber || selectedCustomer.salesTaxNumber || '—'}
                    </span>
                  </div>
                </div>

                {/* Action Buttons Stack in Sidebar */}
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Button
                    type="primary"
                    block
                    icon={<PlusCircleOutlined />}
                    onClick={() => void openCustomerRecordPayment()}
                  >
                    + Record Payment / Advance
                  </Button>
                  <Button
                    block
                    icon={<SwapOutlined />}
                    disabled={c360UnadjustedAdvance <= 0 || !(ledgerSummary?.openInvoices?.length)}
                    onClick={handleOpenAdjustAdvance}
                  >
                    Adjust Advance ({c360UnadjustedAdvance > 0 ? `Rs ${formatDecimal(c360UnadjustedAdvance)}` : '0'})
                  </Button>
                  <Button
                    block
                    icon={<PrinterOutlined />}
                    onClick={() => {
                      printCustomerStatementDocument(
                        selectedCustomer,
                        statementData || {
                          customer: selectedCustomer,
                          openingBalance: c360OpeningBalance,
                          periodDebit: ledgerSummary?.totalDebit || 0,
                          periodCredit: ledgerSummary?.totalCredit || 0,
                          unadjustedAdvanceBalance: c360UnadjustedAdvance,
                          closingBalance: c360BalanceDue,
                          aging: c360Aging,
                          entries: ledgerEntries,
                        },
                      );
                    }}
                  >
                    Print Customer Statement
                  </Button>
                  <Button block icon={<FileExcelOutlined />} onClick={handleExportLedgerCsv}>
                    Export CSV
                  </Button>
                </div>
              </div>

              {/* Right Main Ledger & Financial Workspace */}
              <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto', minWidth: 0 }}>
                {/* Real-Time 5-Metric Account Summary Strip */}
                <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
                  <Col xs={12} sm={8} md={4} lg={5}>
                    <div
                      style={{
                        border: `1px solid ${token.colorBorderSecondary}`,
                        borderRadius: 8,
                        padding: '8px 10px',
                        backgroundColor: token.colorFillAlter,
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 800, color: token.colorTextSecondary, textTransform: 'uppercase' }}>
                        Opening Balance
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 800, marginTop: 2 }}>
                        Rs {formatDecimal(Math.abs(c360OpeningBalance))}
                      </div>
                    </div>
                  </Col>
                  <Col xs={12} sm={8} md={5} lg={5}>
                    <div
                      style={{
                        border: `1px solid ${token.colorBorderSecondary}`,
                        borderRadius: 8,
                        padding: '8px 10px',
                        backgroundColor: token.colorFillAlter,
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 800, color: token.colorTextSecondary, textTransform: 'uppercase' }}>
                        Total Invoiced (Debit)
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: '#dc2626', marginTop: 2 }}>
                        Rs {formatDecimal(c360TotalBilled)}
                      </div>
                    </div>
                  </Col>
                  <Col xs={12} sm={8} md={5} lg={5}>
                    <div
                      style={{
                        border: `1px solid ${token.colorBorderSecondary}`,
                        borderRadius: 8,
                        padding: '8px 10px',
                        backgroundColor: token.colorFillAlter,
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 800, color: token.colorTextSecondary, textTransform: 'uppercase' }}>
                        Receipts &amp; Advances (Credit)
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: '#16a34a', marginTop: 2 }}>
                        Rs {formatDecimal(c360TotalPaid)}
                      </div>
                    </div>
                  </Col>
                  <Col xs={12} sm={12} md={5} lg={4}>
                    <div
                      style={{
                        border: `1px solid ${token.colorBorderSecondary}`,
                        borderRadius: 8,
                        padding: '8px 10px',
                        backgroundColor: token.colorFillAlter,
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 800, color: token.colorTextSecondary, textTransform: 'uppercase' }}>
                        Unadjusted Advance
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: '#0284c7', marginTop: 2 }}>
                        Rs {formatDecimal(c360UnadjustedAdvance)}
                      </div>
                    </div>
                  </Col>
                  <Col xs={24} sm={12} md={5} lg={5}>
                    <div
                      style={{
                        border: `1px solid ${c360BalanceDue > 0 ? token.colorErrorBorder : token.colorSuccessBorder}`,
                        borderRadius: 8,
                        padding: '8px 10px',
                        backgroundColor: token.colorFillAlter,
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 800, color: token.colorTextSecondary, textTransform: 'uppercase' }}>
                        Net Receivable Balance
                      </div>
                      <div
                        style={{
                          fontSize: 14.5,
                          fontWeight: 900,
                          color: c360BalanceDue > 0 ? '#dc2626' : '#16a34a',
                          marginTop: 2,
                        }}
                      >
                        Rs {formatDecimal(Math.abs(c360BalanceDue))} {c360BalanceDue > 0 ? 'DR' : c360BalanceDue < 0 ? 'CR' : ''}
                      </div>
                    </div>
                  </Col>
                </Row>

                {/* 5-Bucket AR Aging Bar */}
                <div
                  style={{
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    marginBottom: 14,
                    backgroundColor: token.colorFillAlter,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: token.colorTextSecondary }}>
                      Accounts Receivable Aging Breakdown
                    </span>
                    <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
                      Open Invoices: <strong>{c360Aging.openInvoiceCount}</strong> · Overdue:{' '}
                      <strong style={{ color: c360Aging.overdueInvoiceCount > 0 ? '#dc2626' : '#16a34a' }}>
                        {c360Aging.overdueInvoiceCount} (Rs {formatDecimal(c360Aging.overdueAmount)})
                      </strong>
                    </span>
                  </div>
                  <Row gutter={[8, 6]}>
                    {[
                      { label: 'Current', val: c360Aging.current, color: '#16a34a' },
                      { label: '1–30 Days', val: c360Aging.days1to30, color: '#0284c7' },
                      { label: '31–60 Days', val: c360Aging.days31to60, color: '#d97706' },
                      { label: '61–90 Days', val: c360Aging.days61to90, color: '#ea580c' },
                      { label: '90+ Days Overdue', val: c360Aging.days90Plus, color: '#dc2626' },
                    ].map((b) => (
                      <Col key={b.label} xs={12} sm={8} md={4} lg={4} style={{ flex: 1 }}>
                        <div
                          style={{
                            border: `1px solid ${token.colorBorderSecondary}`,
                            borderLeft: `3px solid ${b.color}`,
                            borderRadius: 6,
                            padding: '5px 8px',
                            backgroundColor: token.colorBgContainer,
                          }}
                        >
                          <div style={{ fontSize: 10, color: token.colorTextSecondary, fontWeight: 700 }}>{b.label}</div>
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: Number(b.val) > 0 ? b.color : token.colorTextTertiary }}>
                            Rs {formatDecimal(b.val)}
                          </div>
                        </div>
                      </Col>
                    ))}
                  </Row>
                </div>

                {/* Tab Navigation */}
                <Tabs
                  activeKey={c360ActiveTab}
                  onChange={(k) => setC360ActiveTab(k as any)}
                  items={[
                    {
                      key: 'ledger',
                      label: (
                        <span>
                          <AuditOutlined /> Customer Ledger ({ledgerEntries.length})
                        </span>
                      ),
                      children: (
                        <div>
                          {/* Ledger Filter Toolbar */}
                          <Row gutter={[8, 8]} style={{ marginBottom: 10 }} align="middle">
                            <Col xs={24} sm={8} md={7}>
                              <Input
                                allowClear
                                size="small"
                                placeholder="Search voucher, invoice, SOC, PO, cheque..."
                                value={c360SearchText}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setC360SearchText(v);
                                  void fetchCustomerLedger(selectedCustomer.id, {
                                    documentType: ledgerDocFilter,
                                    divisionId: ledgerDivisionFilter,
                                    fromDate: ledgerDateRange?.[0]?.format('YYYY-MM-DD'),
                                    toDate: ledgerDateRange?.[1]?.format('YYYY-MM-DD'),
                                    search: v,
                                  });
                                }}
                              />
                            </Col>
                            <Col xs={12} sm={5} md={4}>
                              <Select
                                size="small"
                                style={{ width: '100%' }}
                                value={ledgerDocFilter}
                                onChange={(val) => {
                                  setLedgerDocFilter(val);
                                  void fetchCustomerLedger(selectedCustomer.id, {
                                    documentType: val,
                                    divisionId: ledgerDivisionFilter,
                                    fromDate: ledgerDateRange?.[0]?.format('YYYY-MM-DD'),
                                    toDate: ledgerDateRange?.[1]?.format('YYYY-MM-DD'),
                                    search: c360SearchText,
                                  });
                                }}
                                options={[
                                  { value: 'ALL', label: 'All Types' },
                                  { value: 'OPENING_BALANCE', label: 'Opening' },
                                  { value: 'SALES_INVOICE', label: 'Sales Invoice' },
                                  { value: 'CUSTOMER_PAYMENT', label: 'Receipt' },
                                  { value: 'ADVANCE_RECEIPT', label: 'Advance' },
                                  { value: 'ADVANCE_ADJUSTMENT', label: 'Advance Adjusted' },
                                  { value: 'CREDIT_NOTE', label: 'Credit Note' },
                                  { value: 'DEBIT_NOTE', label: 'Debit Note' },
                                ]}
                              />
                            </Col>
                            <Col xs={12} sm={5} md={5}>
                              <Select
                                allowClear
                                size="small"
                                placeholder="All Divisions"
                                style={{ width: '100%' }}
                                value={ledgerDivisionFilter}
                                onChange={(val) => {
                                  setLedgerDivisionFilter(val);
                                  void fetchCustomerLedger(selectedCustomer.id, {
                                    documentType: ledgerDocFilter,
                                    divisionId: val,
                                    fromDate: ledgerDateRange?.[0]?.format('YYYY-MM-DD'),
                                    toDate: ledgerDateRange?.[1]?.format('YYYY-MM-DD'),
                                    search: c360SearchText,
                                  });
                                }}
                                options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                              />
                            </Col>
                            <Col xs={24} sm={6} md={8}>
                              <DatePicker.RangePicker
                                size="small"
                                style={{ width: '100%' }}
                                value={ledgerDateRange}
                                onChange={(vals) => {
                                  setLedgerDateRange(vals as any);
                                  void fetchCustomerLedger(selectedCustomer.id, {
                                    documentType: ledgerDocFilter,
                                    divisionId: ledgerDivisionFilter,
                                    fromDate: vals?.[0]?.format('YYYY-MM-DD'),
                                    toDate: vals?.[1]?.format('YYYY-MM-DD'),
                                    search: c360SearchText,
                                  });
                                }}
                              />
                            </Col>
                          </Row>

                          <Table
                            rowKey={(r) => r.id}
                            loading={ledgerLoading}
                            dataSource={ledgerEntries}
                            size="small"
                            scroll={{ x: 960 }}
                            pagination={{ pageSize: 15, size: 'small' }}
                            locale={{ emptyText: 'No financial ledger transactions recorded for this customer yet.' }}
                            columns={[
                              {
                                title: 'Date',
                                dataIndex: 'transactionDate',
                                width: 95,
                                render: (val: string) => dayjs(val).format('YYYY-MM-DD'),
                              },
                              {
                                title: 'Document Type',
                                dataIndex: 'documentType',
                                width: 140,
                                render: (type: string) => {
                                  const colorMap: Record<string, string> = {
                                    OPENING_BALANCE: 'default',
                                    SALES_INVOICE: 'orange',
                                    CUSTOMER_PAYMENT: 'green',
                                    ADVANCE_RECEIPT: 'cyan',
                                    ADVANCE_ADJUSTMENT: 'blue',
                                    CREDIT_NOTE: 'purple',
                                    SALES_RETURN: 'purple',
                                    DEBIT_NOTE: 'red',
                                  };
                                  return <Tag color={colorMap[type] || 'default'}>{String(type || '').replace(/_/g, ' ')}</Tag>;
                                },
                              },
                              {
                                title: 'Voucher / Doc #',
                                dataIndex: 'documentNumber',
                                width: 145,
                                render: (val: string) => (
                                  <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{val || '-'}</span>
                                ),
                              },
                              {
                                title: 'SOC / PO / Ref',
                                key: 'ref',
                                render: (_, rec) => (
                                  <div style={{ fontSize: 11.5 }}>
                                    {rec.socNumber && <Tag color="purple" style={{ marginRight: 4 }}>{rec.socNumber}</Tag>}
                                    {rec.poReference && <Tag color="geekblue" style={{ marginRight: 4 }}>PO: {rec.poReference}</Tag>}
                                    <span>{rec.reference || rec.notes || '-'}</span>
                                  </div>
                                ),
                              },
                              {
                                title: 'Division',
                                dataIndex: 'divisionName',
                                width: 130,
                                render: (v: string) => v || '—',
                              },
                              {
                                title: 'Mode',
                                dataIndex: 'paymentMode',
                                width: 100,
                                render: (v: string) => (v ? <Tag>{v.replace(/_/g, ' ')}</Tag> : '—'),
                              },
                              {
                                title: 'Due / Overdue',
                                key: 'due',
                                width: 120,
                                render: (_, rec) => (
                                  <div style={{ fontSize: 11.5 }}>
                                    <div>{rec.dueDate ? dayjs(rec.dueDate).format('YYYY-MM-DD') : '—'}</div>
                                    {Number(rec.overdueDays) > 0 && (
                                      <Tag color="red" style={{ margin: 0, fontSize: 10 }}>
                                        {rec.overdueDays}d overdue
                                      </Tag>
                                    )}
                                  </div>
                                ),
                              },
                              {
                                title: 'Debit',
                                dataIndex: 'debit',
                                align: 'right',
                                width: 110,
                                render: (val: number) =>
                                  Number(val) > 0 ? (
                                    <span style={{ color: '#dc2626', fontWeight: 700 }}>Rs {formatDecimal(val)}</span>
                                  ) : (
                                    '—'
                                  ),
                              },
                              {
                                title: 'Credit',
                                dataIndex: 'credit',
                                align: 'right',
                                width: 110,
                                render: (val: number) =>
                                  Number(val) > 0 ? (
                                    <span style={{ color: '#16a34a', fontWeight: 700 }}>Rs {formatDecimal(val)}</span>
                                  ) : (
                                    '—'
                                  ),
                              },
                              {
                                title: 'Running Balance',
                                dataIndex: 'runningBalance',
                                align: 'right',
                                width: 135,
                                render: (val: number) => {
                                  const num = Number(val) || 0;
                                  return (
                                    <span style={{ fontWeight: 800, color: num > 0 ? '#dc2626' : num < 0 ? '#16a34a' : token.colorText }}>
                                      Rs {formatDecimal(Math.abs(num))} {num > 0 ? 'DR' : num < 0 ? 'CR' : ''}
                                    </span>
                                  );
                                },
                              },
                            ]}
                          />
                        </div>
                      ),
                    },
                    {
                      key: 'overview',
                      label: (
                        <span>
                          <EyeOutlined /> Overview
                        </span>
                      ),
                      children: (
                        <div>
                          <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
                            <Col xs={12} md={6}>
                              <Card size="small">
                                <Statistic title="Total Invoices" value={c360Invoices.length} />
                              </Card>
                            </Col>
                            <Col xs={12} md={6}>
                              <Card size="small">
                                <Statistic title="Average Invoice" value={c360AvgInvoice} precision={2} prefix="Rs" />
                              </Card>
                            </Col>
                            <Col xs={12} md={6}>
                              <Card size="small">
                                <Statistic title="First Invoice Date" value={c360FirstPurchaseDate} />
                              </Card>
                            </Col>
                            <Col xs={12} md={6}>
                              <Card size="small">
                                <Statistic title="Latest Invoice Date" value={c360LastPurchaseDate} />
                              </Card>
                            </Col>
                          </Row>

                          {c360Aging.overdueAmount > 0 && (
                            <Alert
                              type="warning"
                              showIcon
                              style={{ marginBottom: 14 }}
                              message={`${c360Aging.overdueInvoiceCount} overdue invoice(s) totalling Rs ${formatDecimal(c360Aging.overdueAmount)}`}
                            />
                          )}

                          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase', color: token.colorTextSecondary }}>
                            Latest Financial Activity
                          </div>
                          {c360ActivityItems.length === 0 ? (
                            <Empty description="No activity recorded for this customer yet." />
                          ) : (
                            <List
                              size="small"
                              bordered
                              dataSource={c360ActivityItems}
                              renderItem={(act: any) => (
                                <List.Item>
                                  <Space>
                                    <FileTextOutlined style={{ color: act.isCredit ? '#16a34a' : token.colorPrimary }} />
                                    <strong>{act.title}</strong>
                                    <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>{act.date}</span>
                                  </Space>
                                  <strong style={{ color: act.isCredit ? '#16a34a' : '#dc2626' }}>
                                    Rs {formatDecimal(act.amount)}
                                  </strong>
                                </List.Item>
                              )}
                            />
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'invoices',
                      label: (
                        <span>
                          <FileTextOutlined /> Invoices ({c360Invoices.length})
                        </span>
                      ),
                      children: (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                            <Space>
                              <Button size="small" icon={<FileExcelOutlined />} onClick={handleExportLedgerCsv}>
                                CSV
                              </Button>
                              <Button
                                size="small"
                                icon={<PrinterOutlined />}
                                onClick={() =>
                                  printTableList(
                                    `Customer Invoices - ${selectedCustomer.name}`,
                                    ['Invoice #', 'Date', 'Due Date', 'Status', 'Total', 'Paid', 'Balance Due'],
                                    c360FilteredInvoices.map((inv) => [
                                      inv.invoiceNo,
                                      dayjs(inv.invoiceDate).format('YYYY-MM-DD'),
                                      inv.dueDate ? dayjs(inv.dueDate).format('YYYY-MM-DD') : '-',
                                      inv.status,
                                      formatDecimal(inv.totalAmount),
                                      formatDecimal(inv.paidAmount),
                                      formatDecimal(inv.balance),
                                    ]),
                                  )
                                }
                              >
                                Print
                              </Button>
                            </Space>
                            <Input
                              size="small"
                              placeholder="Search invoices..."
                              style={{ width: 220 }}
                              value={c360SearchText}
                              onChange={(e) => setC360SearchText(e.target.value)}
                              allowClear
                            />
                          </div>
                          <Table
                            rowKey={(r) => r.id || r.invoiceNo}
                            dataSource={c360FilteredInvoices}
                            size="small"
                            pagination={{ pageSize: 10, size: 'small' }}
                            locale={{ emptyText: 'No sales invoices issued for this customer yet.' }}
                            columns={[
                              {
                                title: 'Invoice #',
                                dataIndex: 'invoiceNo',
                                render: (val: string) => (
                                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: token.colorPrimary }}>{val}</span>
                                ),
                              },
                              {
                                title: 'Date',
                                dataIndex: 'invoiceDate',
                                render: (d: string) => (d ? dayjs(d).format('MMM DD, YYYY') : '-'),
                              },
                              {
                                title: 'Due Date',
                                dataIndex: 'dueDate',
                                render: (d: string, r: any) => (
                                  <Space size={4}>
                                    <span>{d ? dayjs(d).format('MMM DD, YYYY') : '-'}</span>
                                    {r.daysOverdue > 0 && r.balance > 0 && <Tag color="red">{r.daysOverdue}d late</Tag>}
                                  </Space>
                                ),
                              },
                              {
                                title: 'Status',
                                dataIndex: 'status',
                                render: (st: string) => {
                                  const lower = String(st || '').toLowerCase();
                                  const col = lower === 'paid' ? 'green' : lower === 'partial' ? 'blue' : 'gold';
                                  return <Tag color={col}>{st}</Tag>;
                                },
                              },
                              {
                                title: 'Total',
                                dataIndex: 'totalAmount',
                                align: 'right',
                                render: (v: number) => `Rs ${formatDecimal(v)}`,
                              },
                              {
                                title: 'Paid',
                                dataIndex: 'paidAmount',
                                align: 'right',
                                render: (v: number) => <span style={{ color: '#16a34a' }}>Rs {formatDecimal(v)}</span>,
                              },
                              {
                                title: 'Balance Due',
                                dataIndex: 'balance',
                                align: 'right',
                                render: (v: number) => (
                                  <strong style={{ color: Number(v) > 0 ? '#dc2626' : '#16a34a' }}>
                                    Rs {formatDecimal(v)}
                                  </strong>
                                ),
                              },
                              {
                                title: 'Action',
                                align: 'center',
                                render: (_, inv: any) =>
                                  Number(inv.balance) > 0 ? (
                                    <Button size="small" type="primary" onClick={() => void openCustomerRecordPayment(inv)}>
                                      Pay
                                    </Button>
                                  ) : (
                                    <Tag color="green">Settled</Tag>
                                  ),
                              },
                            ]}
                          />
                        </div>
                      ),
                    },
                    {
                      key: 'payments',
                      label: (
                        <span>
                          <WalletOutlined /> Receipts &amp; Advances ({c360Payments.length})
                        </span>
                      ),
                      children: (
                        <Table
                          rowKey={(r) => r.id || r.receiptNumber || r.documentNumber}
                          dataSource={c360Payments}
                          size="small"
                          locale={{ emptyText: 'No customer receipts or advance payments recorded yet.' }}
                          columns={[
                            {
                              title: 'Voucher #',
                              render: (_, r: any) => (
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#16a34a' }}>
                                  {r.receiptNumber || r.documentNumber}
                                </span>
                              ),
                            },
                            {
                              title: 'Date',
                              render: (_, r: any) => dayjs(r.receiptDate || r.transactionDate).format('MMM DD, YYYY'),
                            },
                            {
                              title: 'Mode & Clearance',
                              render: (_, r: any) => (
                                <Space size={4}>
                                  <Tag color="cyan">{String(r.paymentMode || 'RECEIPT').replace(/_/g, ' ')}</Tag>
                                  {r.clearanceStatus && (
                                    <Tag color={r.clearanceStatus === 'BOUNCED' ? 'red' : r.clearanceStatus === 'PENDING_CLEARANCE' ? 'gold' : 'green'}>
                                      {String(r.clearanceStatus).replace(/_/g, ' ')}
                                    </Tag>
                                  )}
                                </Space>
                              ),
                            },
                            {
                              title: 'Amount',
                              align: 'right',
                              render: (_, r: any) => (
                                <strong style={{ color: '#16a34a' }}>Rs {formatDecimal(r.amount ?? r.credit ?? 0)}</strong>
                              ),
                            },
                            {
                              title: 'Unallocated Advance',
                              align: 'right',
                              render: (_, r: any) =>
                                Number(r.unallocatedAdvanceAmount) > 0 ? (
                                  <Tag color="blue">Rs {formatDecimal(r.unallocatedAdvanceAmount)}</Tag>
                                ) : (
                                  '—'
                                ),
                            },
                            {
                              title: 'Print',
                              align: 'center',
                              render: (_, r: any) =>
                                r.receiptNumber ? (
                                  <Button size="small" icon={<PrinterOutlined />} onClick={() => printPaymentReceiptVoucher(r)} />
                                ) : null,
                            },
                          ]}
                        />
                      ),
                    },
                    {
                      key: 'returns',
                      label: (
                        <span>
                          <HistoryOutlined /> Credit Notes &amp; Returns ({c360Returns.length})
                        </span>
                      ),
                      children: (
                        <Table
                          rowKey={(r) => r.id || r.documentNumber}
                          dataSource={c360Returns}
                          size="small"
                          locale={{ emptyText: 'No sales returns or credit notes issued for this customer.' }}
                          columns={[
                            {
                              title: 'Document #',
                              dataIndex: 'documentNumber',
                              render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{v}</span>,
                            },
                            {
                              title: 'Date',
                              dataIndex: 'transactionDate',
                              render: (d: string) => dayjs(d).format('MMM DD, YYYY'),
                            },
                            { title: 'Reason / Reference', dataIndex: 'reference', render: (v: string) => v || '-' },
                            {
                              title: 'Credit Amount',
                              dataIndex: 'credit',
                              align: 'right',
                              render: (v: number) => `Rs ${formatDecimal(v)}`,
                            },
                          ]}
                        />
                      ),
                    },
                    {
                      key: 'products',
                      label: (
                        <span>
                          <AuditOutlined /> Purchased Products ({customerItems.length})
                        </span>
                      ),
                      children: (
                        <Table
                          rowKey={(r) => r.id || r.itemCode}
                          loading={itemsLoading}
                          dataSource={customerItems}
                          size="small"
                          locale={{ emptyText: 'No billed or ordered items found for this customer yet.' }}
                          columns={itemHistoryColumns}
                        />
                      ),
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Upgraded Record Payment / Advance Modal with Bill-to-Bill Invoice Allocations */}
      <Modal
        wrapClassName="reference-customer-modal"
        title={null}
        closable={false}
        open={recordPaymentModalVisible}
        onCancel={() => setRecordPaymentModalVisible(false)}
        footer={null}
        width={760}
        destroyOnClose
      >
        <div className="reference-modal-header">
          <div className="reference-modal-title">
            <PlusCircleOutlined style={{ fontSize: 16 }} />
            <span>Record Payment / Advance: {selectedCustomer?.name}</span>
          </div>
          <CloseOutlined
            className="reference-modal-close-btn"
            onClick={() => setRecordPaymentModalVisible(false)}
          />
        </div>
        <div className="reference-modal-body">
          <Form form={paymentForm} layout="vertical" onFinish={handleRecordPayment}>
            <Row gutter={12}>
              <Col xs={12} sm={8}>
                <Form.Item
                  name="amount"
                  label="Amount Received (PKR)"
                  rules={[{ required: true, message: 'Enter payment amount' }]}
                >
                  <InputNumber
                    style={{ width: '100%' }}
                    min={1}
                    precision={2}
                    onChange={(v) => setWatchedPayAmt(Number(v) || 0)}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item name="paymentDate" label="Receipt Date" rules={[{ required: true }]}>
                  <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item name="receiptType" label="Receipt Classification">
                  <Select
                    options={[
                      { value: 'INVOICE_PAYMENT', label: 'Invoice Payment (Bill-to-Bill)' },
                      { value: 'ADVANCE_PAYMENT', label: 'Advance Payment' },
                      { value: 'ON_ACCOUNT', label: 'On Account' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item name="paymentMethod" label="Payment Mode">
                  <Select
                    onChange={(v) => setWatchedPayMode(v)}
                    options={[
                      { value: 'CASH', label: 'Cash' },
                      { value: 'BANK_TRANSFER', label: 'Bank Transfer / IBFT' },
                      { value: 'CHEQUE', label: 'Cheque' },
                      { value: 'ONLINE', label: 'Online / PayOrder' },
                      { value: 'OTHER', label: 'Other' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item name="bankAccountId" label="Deposit Account (GL)">
                  <Select
                    allowClear
                    placeholder="Auto (Cash / Bank GL)"
                    options={bankAccounts.map((a) => ({
                      value: a.id,
                      label: `${a.accountCode} — ${a.accountName}`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item name="divisionId" label="Division">
                  <Select
                    allowClear
                    placeholder="Select Division"
                    options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            {watchedPayMode === 'CHEQUE' && (
              <Row gutter={12}>
                <Col xs={12} sm={6}>
                  <Form.Item name="bankName" label="Bank Name">
                    <Input placeholder="e.g. HBL" />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={6}>
                  <Form.Item name="chequeNumber" label="Cheque #">
                    <Input placeholder="Cheque No." />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={6}>
                  <Form.Item name="chequeDate" label="Cheque Date">
                    <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={6}>
                  <Form.Item name="clearanceStatus" label="Clearance">
                    <Select
                      options={[
                        { value: 'CLEARED', label: 'Cleared' },
                        { value: 'PENDING_CLEARANCE', label: 'Pending Clearance' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>
            )}

            <Row gutter={12}>
              <Col xs={12} sm={8}>
                <Form.Item name="socNumber" label="SOC # (Optional)">
                  <Input placeholder="SOC-2026-xxxxx" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item name="poReference" label="PO Reference (Optional)">
                  <Input placeholder="Customer PO #" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="reference" label="Bank Slip / IBFT Ref">
                  <Input placeholder="Reference #" />
                </Form.Item>
              </Col>
            </Row>

            {(ledgerSummary?.openInvoices || []).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong style={{ fontSize: 12.5 }}>Bill-to-Bill Open Invoice Allocation</strong>
                  <Button
                    size="small"
                    onClick={() => {
                      let rem = watchedPayAmt;
                      const m: Record<string, number> = {};
                      for (const inv of ledgerSummary?.openInvoices || []) {
                        if (rem <= 0) break;
                        const b = Number(inv.balance) || 0;
                        if (b > 0) {
                          const take = Math.round(Math.min(rem, b) * 100) / 100;
                          m[inv.id] = take;
                          rem = Math.round((rem - take) * 100) / 100;
                        }
                      }
                      setPaymentAllocMap(m);
                    }}
                  >
                    Auto-Allocate Oldest First
                  </Button>
                </div>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={ledgerSummary?.openInvoices || []}
                  columns={[
                    { title: 'Invoice #', dataIndex: 'invoiceNo', render: (v) => <strong>{v}</strong> },
                    {
                      title: 'Balance Due',
                      dataIndex: 'balance',
                      align: 'right',
                      render: (v) => <span style={{ color: '#dc2626' }}>Rs {formatDecimal(v)}</span>,
                    },
                    {
                      title: 'Allocate Now (Rs)',
                      width: 170,
                      render: (_, inv: any) => (
                        <InputNumber
                          size="small"
                          min={0}
                          max={Number(inv.balance)}
                          precision={2}
                          style={{ width: 130 }}
                          value={paymentAllocMap[inv.id] || 0}
                          onChange={(val) => setPaymentAllocMap((p) => ({ ...p, [inv.id]: Number(val) || 0 }))}
                        />
                      ),
                    },
                  ]}
                />
              </div>
            )}

            <Form.Item name="notes" label="Remarks / Narration">
              <Input.TextArea rows={2} placeholder="Optional remarks" />
            </Form.Item>

            <div className="reference-modal-footer">
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={paymentLoading} className="btn-ref-save">
                Save Receipt Voucher
              </Button>
              <Button icon={<CloseOutlined />} className="btn-ref-cancel" onClick={() => setRecordPaymentModalVisible(false)}>
                Cancel
              </Button>
            </div>
          </Form>
        </div>
      </Modal>

      {/* Adjust Unallocated Advance Modal */}
      <Modal
        title={
          <Space>
            <SwapOutlined style={{ color: '#0284c7' }} />
            <span>Adjust Unallocated Advance — {selectedCustomer?.name}</span>
          </Space>
        }
        open={adjustAdvModalVisible}
        onCancel={() => setAdjustAdvModalVisible(false)}
        width={680}
        okText="Apply Advance to Invoices"
        confirmLoading={adjustAdvSubmitting}
        onOk={() => void handleSubmitAdjustAdvance()}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={`Available Unadjusted Advance: Rs ${formatDecimal(c360UnadjustedAdvance)}`}
        />
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={ledgerSummary?.openInvoices || []}
          columns={[
            { title: 'Invoice #', dataIndex: 'invoiceNo', render: (v) => <strong>{v}</strong> },
            { title: 'Due Date', dataIndex: 'dueDate', render: (v) => v || '-' },
            {
              title: 'Balance Due',
              dataIndex: 'balance',
              align: 'right',
              render: (v) => <span style={{ color: '#dc2626', fontWeight: 700 }}>Rs {formatDecimal(v)}</span>,
            },
            {
              title: 'Adjust Amount (Rs)',
              width: 170,
              render: (_, inv: any) => (
                <InputNumber
                  size="small"
                  min={0}
                  max={Number(inv.balance)}
                  precision={2}
                  style={{ width: 135 }}
                  value={adjustAdvAllocMap[inv.id] || 0}
                  onChange={(val) => setAdjustAdvAllocMap((p) => ({ ...p, [inv.id]: Number(val) || 0 }))}
                />
              ),
            },
          ]}
        />
        <Input
          style={{ marginTop: 10 }}
          placeholder="Adjustment remarks (optional)"
          value={adjustAdvNotes}
          onChange={(e) => setAdjustAdvNotes(e.target.value)}
        />
      </Modal>

      {/* Add Contact Person Modal */}
      <Modal title="Add Contact Person" open={contactModalVisible} onOk={handleAddContact} onCancel={() => setContactModalVisible(false)}>
        <Form form={contactForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="firstName" label="First Name" rules={[{ required: true, message: 'First name is required' }]}>
                <Input placeholder="First Name" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lastName" label="Last Name">
                <Input placeholder="Last Name" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="jobTitle" label="Designation / Role">
                <Input placeholder="e.g. Procurement Manager" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email Address">
                <Input type="email" placeholder="contact@demo.com" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Phone">
                <Input placeholder="Phone number" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="mobile" label="Mobile">
                <Input placeholder="Mobile number" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="isPrimary" valuePropName="checked" initialValue={false}>
            <Switch checkedChildren="Primary Contact" unCheckedChildren="Secondary" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add Address Modal (Multiple Shipping & Billing) */}
      <Modal title="Add Address / Delivery Location" open={addressModalVisible} onOk={handleAddAddress} onCancel={() => setAddressModalVisible(false)}>
        <Form form={addressForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="addressType" label="Address Type" rules={[{ required: true, message: 'Required' }]} initialValue="SHIPPING">
                <Select>
                  {ADDRESS_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="area" label="Area / Industrial Zone">
                <Input placeholder="e.g. Sundar Industrial Estate, Gate 2" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="addressLine1" label="Address Line 1" rules={[{ required: true, message: 'Address is required' }]}>
            <Input placeholder="Plot/Street Address" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="city" label="City" rules={[{ required: true, message: 'City is required' }]} initialValue="Lahore">
                <Input placeholder="City" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="state" label="State / Province" initialValue="Punjab">
                <Input placeholder="Province / State" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contactPerson" label="Site Contact Person">
                <Input placeholder="Receiver / Gate Contact" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="Site Phone">
                <Input placeholder="Contact phone" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="isDefault" valuePropName="checked" initialValue={false}>
            <Switch checkedChildren="Default Location" unCheckedChildren="Standard Location" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Import CSV Modal */}
      <Modal
        title="Import Customers from CSV"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setImportModalVisible(false)}>Cancel</Button>,
          <Button key="template" icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>Download Sample CSV</Button>,
        ]}
      >
        <div style={{ padding: '10px 0' }}>
          <p style={{ color: '#4b5563', fontSize: 13, marginBottom: 16 }}>
            Upload a valid customer CSV file containing columns: <code>customerCode, name, legalName, phone, email, state, city, taxNumber, creditLimit</code>.
          </p>
          <Upload.Dragger
            accept=".csv"
            showUploadList={false}
            customRequest={({ file, onSuccess }) => {
              const reader = new FileReader();
              reader.onload = async (e) => {
                try {
                  const text = e.target?.result as string;
                  const lines = text.split('\n').filter(Boolean);
                  if (lines.length <= 1) {
                    message.error('CSV file has no data rows');
                    return;
                  }
                  message.success(`Parsed ${lines.length - 1} customer rows from CSV.`);
                  setImportModalVisible(false);
                  fetchCustomers(1, pageSize);
                  if (onSuccess) onSuccess('ok');
                } catch {
                  message.error('Error processing CSV');
                }
              };
              reader.readAsText(file as Blob);
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ fontSize: 40, color: '#2ecc71' }} />
            </p>
            <p className="ant-upload-text">Click or drag CSV file to this area to import</p>
            <p className="ant-upload-hint">Support for single customer batch upload (.csv)</p>
          </Upload.Dragger>
        </div>
      </Modal>

      {/* Barcode Print Component */}
      <BarcodePrint
        open={printModal.visible}
        onClose={() => setPrintModal({ visible: false, customer: null })}
        itemCode={printModal.customer?.customerCode || ''}
        itemName={printModal.customer?.name || ''}
        sku={printModal.customer?.customerCategory || printModal.customer?.customerType}
        barcode={printModal.customer?.customerCode || ''}
        companyName="Pakistan Wire Industries (Pvt.) LTD"
      />

      {/* Enterprise Delete Confirmation Dialog */}
      <DeleteConfirmModal
        open={deleteModalVisible}
        itemType="Customer"
        itemCode={customerToDelete?.customerCode}
        itemName={customerToDelete?.name}
        description="Permanent deletion is blocked automatically if this customer is referenced by sales orders, delivery notes, or invoices."
        onConfirm={async () => {
          if (customerToDelete) {
            await handleExecuteDelete(customerToDelete);
          }
        }}
        onCancel={() => {
          setDeleteModalVisible(false);
          setCustomerToDelete(null);
        }}
        onDeactivateInstead={
          customerToDelete?.status === 'ACTIVE'
            ? async () => {
              if (customerToDelete) {
                await handleExecuteDeactivate(customerToDelete);
              }
            }
            : undefined
        }
        deactivateLabel="Deactivate Customer Instead"
      />

      {/* Enterprise Pre-Save Confirmation Dialog */}
      <Modal
        open={confirmSaveVisible}
        zIndex={2500}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>
            <SaveOutlined style={{ fontSize: 18 }} />
            <span>{editingCustomer ? 'Confirm Customer Update' : 'Confirm New Customer Registration'}</span>
          </div>
        }
        centered
        width={500}
        onCancel={() => setConfirmSaveVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setConfirmSaveVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<SaveOutlined />}
            style={{ background: '#2563eb', borderColor: '#2563eb' }}
            onClick={() => executeCustomerSave(pendingCustomerValues)}
          >
            {editingCustomer ? 'Yes, Update Customer' : 'Yes, Create Customer'}
          </Button>,
        ]}
      >
        <div style={{ padding: '12px 0' }}>
          <p style={{ fontSize: 14, marginBottom: 16, color: 'var(--cm-text-primary, #1e293b)' }}>
            Are you sure you want to {editingCustomer ? 'update details for' : 'register new master profile for'}{' '}
            <strong style={{ color: '#2563eb', fontSize: 15 }}>{pendingCustomerValues?.name}</strong>?
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
              <span style={{ color: '#64748b' }}>Contact Person:</span>
              <strong>{pendingCustomerValues?.contactPerson || 'N/A'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Phone:</span>
              <strong>{pendingCustomerValues?.phone || 'N/A'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>State / Region:</span>
              <strong>{pendingCustomerValues?.state || 'N/A'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Credit Limit:</span>
              <strong>PKR {Number(pendingCustomerValues?.creditLimit || 0).toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Status:</span>
              <Tag color={pendingCustomerValues?.isActive !== false ? 'green' : 'default'}>
                {pendingCustomerValues?.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
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
    </div>
  );
};

export default CustomerManagement;