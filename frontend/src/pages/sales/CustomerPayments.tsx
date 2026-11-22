import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  AutoComplete,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  theme,
} from 'antd';
import {
  ApartmentOutlined,
  AuditOutlined,
  BankOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DollarCircleOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FilterOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
  UserOutlined,
  WalletOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { printPaymentReceiptVoucher, printTableList } from '../../utils/printTemplates';
import { triggerTabRefresh, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { DraggableResizableModal, PageHeader } from '../../components/shared';
import './CustomerPayments.css';
import {
  buildAllocationsPayload,
  capAllocationsToReceiptAmount,
  computeAllocationSummary,
  computeFifoAllocations,
  computeMaxRowAllocation,
  extractCustomerOrderOptions,
  extractCustomerPoOptions,
  filterCustomersByDivision,
  resolveDefaultDepositAccountId,
  resolveDivisionUuid,
  resolveInvoiceSocAndPo,
  resolvePoForSoc,
} from './customerReceiptUtils';

const { RangePicker } = DatePicker;

const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer / IBFT' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'ONLINE', label: 'Online / Mobile Banking' },
  { value: 'OTHER', label: 'Other' },
];

const RECEIPT_TYPES = [
  { value: 'INVOICE_PAYMENT', label: 'Invoice Payment (Bill-to-Bill)' },
  { value: 'ADVANCE_PAYMENT', label: 'Advance Payment' },
  { value: 'ON_ACCOUNT', label: 'On-Account Receipt' },
];

const CLEARANCE_STATUSES = [
  { value: 'CLEARED', label: 'Cleared' },
  { value: 'PENDING_CLEARANCE', label: 'Pending Clearance' },
  { value: 'BOUNCED', label: 'Bounced / Dishonored' },
];

const CustomerPayments: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const openCustomerLedger = useCallback(
    (customerId?: string) => {
      if (!customerId) return;
      navigate(`/customers?customerId=${encodeURIComponent(customerId)}&tab=ledger`);
    },
    [navigate],
  );

  const [loading, setLoading] = useState(false);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [kpis, setKpis] = useState({
    totalReceipts: 0,
    totalCollected: 0,
    totalAllocated: 0,
    unallocatedAdvances: 0,
    pendingClearance: 0,
  });

  // Filters
  const [search, setSearch] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState<string | undefined>(undefined);
  const [filterDivisionId, setFilterDivisionId] = useState<string | undefined>(undefined);
  const [filterMode, setFilterMode] = useState<string>('ALL');
  const [filterClearance, setFilterClearance] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // Reference Data
  const [customers, setCustomers] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  // Record Receipt Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receiptForm] = Form.useForm();
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | undefined>(undefined);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined);
  const [customerOpenData, setCustomerOpenData] = useState<any>(null);
  const [openInvoicesLoading, setOpenInvoicesLoading] = useState(false);
  const [allocationMap, setAllocationMap] = useState<Record<string, number>>({});
  const [watchedMode, setWatchedMode] = useState<string>('BANK_TRANSFER');
  const [watchedType, setWatchedType] = useState<string>('INVOICE_PAYMENT');
  const [watchedAmount, setWatchedAmount] = useState<number>(0);
  const [activeVoucherStep, setActiveVoucherStep] = useState<1 | 2 | 3>(1);
  const [prePostConfirm, setPrePostConfirm] = useState<{
    payload: any;
    customerName: string;
    customerCode: string;
    divisionName: string;
    receiptDate: string;
    receiptTypeLabel: string;
    paymentModeLabel: string;
    depositAccountLabel: string;
    amount: number;
    allocatedTotal: number;
    unallocatedAdvance: number;
    allocatedInvoices: Array<{ invoiceNo: string; allocatedAmount: number; remainingAfter: number }>;
    chequeNumber?: string;
    bankName?: string;
  } | null>(null);

  // Adjust Advance Modal
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [advCustomerId, setAdvCustomerId] = useState<string | undefined>(undefined);
  const [advReceiptId, setAdvReceiptId] = useState<string | undefined>(undefined);
  const [advOpenData, setAdvOpenData] = useState<any>(null);
  const [advAllocMap, setAdvAllocMap] = useState<Record<string, number>>({});
  const [advNotes, setAdvNotes] = useState<string>('');
  const [advDate, setAdvDate] = useState<dayjs.Dayjs | null>(dayjs());
  const [advSubmitting, setAdvSubmitting] = useState(false);

  // Detail & Bounce Modals
  const [detailReceipt, setDetailReceipt] = useState<any | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [bounceTarget, setBounceTarget] = useState<any | null>(null);
  const [bounceReason, setBounceReason] = useState('');
  const [bounceLoading, setBounceLoading] = useState(false);

  const loadMeta = useCallback(async () => {
    try {
      const [custRes, divRes, bankRes] = await Promise.all([
        apiService.get<any>('/customer/customers', { limit: 200 }).catch(() => ({ data: [] })),
        apiService.get<any>('/divisions', { limit: 100, status: 'ACTIVE' }).catch(() => ({ data: [] })),
        apiService.get<any>('/sales/receipts/bank-accounts').catch(() => ({ data: [] })),
      ]);
      const custList = custRes?.data || [];
      setCustomers(Array.isArray(custList) ? custList : []);
      const rawDivs = divRes?.data?.data || divRes?.data || [];
      setDivisions(Array.isArray(rawDivs) ? rawDivs : []);
      const bankList = bankRes?.data || [];
      setBankAccounts(Array.isArray(bankList) ? bankList : []);
    } catch {
      // ignore meta errors
    }
  }, []);

  const fetchReceipts = useCallback(async (targetPage = page, targetLimit = pageSize) => {
    setLoading(true);
    try {
      const params: any = {
        page: targetPage,
        limit: targetLimit,
      };
      if (filterCustomerId) params.customerId = filterCustomerId;
      if (filterDivisionId) params.divisionId = filterDivisionId;
      if (filterMode && filterMode !== 'ALL') params.paymentMode = filterMode;
      if (filterType && filterType !== 'ALL') params.receiptType = filterType;
      if (filterClearance && filterClearance !== 'ALL') params.clearanceStatus = filterClearance;
      if (search.trim()) params.search = search.trim();
      if (dateRange?.[0]) params.fromDate = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.toDate = dateRange[1].format('YYYY-MM-DD');

      const res = await apiService.get<any>('/sales/receipts', params);
      setReceipts(res?.data || []);
      setTotal(Number(res?.total || 0));
      if (res?.kpis) setKpis(res.kpis);
    } catch {
      message.error('Failed to load customer receipts');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterCustomerId, filterDivisionId, filterMode, filterType, filterClearance, search, dateRange, message]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    fetchReceipts(page, pageSize);
  }, [fetchReceipts, page, pageSize]);

  useEffect(() => {
    const handler = (e: any) => {
      if (!e?.detail?.path || e.detail.path === '/sales/receipts') {
        fetchReceipts(page, pageSize);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handler);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handler);
  }, [fetchReceipts, page, pageSize]);

  const filteredFormCustomers = useMemo(
    () => filterCustomersByDivision(customers, selectedDivisionId),
    [customers, selectedDivisionId],
  );

  // Sync default GL deposit account when bank accounts finish loading while modal is open
  useEffect(() => {
    if (!drawerOpen || bankAccounts.length === 0) return;
    if (!receiptForm.getFieldValue('bankAccountId')) {
      const defaultAccId = resolveDefaultDepositAccountId(watchedMode, bankAccounts);
      if (defaultAccId) {
        receiptForm.setFieldsValue({ bankAccountId: defaultAccId });
      }
    }
  }, [drawerOpen, bankAccounts, watchedMode, receiptForm]);

  const loadCustomerOpenDocs = useCallback(async (customerId: string, preselectInvoiceId?: string) => {
    if (!customerId) {
      setCustomerOpenData(null);
      setAllocationMap({});
      return;
    }
    setOpenInvoicesLoading(true);
    try {
      const res = await apiService.get<any>(`/sales/receipts/customer/${customerId}/open-invoices`);
      const payload = res?.data || res;
      setCustomerOpenData(payload);

      const nextMap: Record<string, number> = {};
      if (preselectInvoiceId && Array.isArray(payload?.openInvoices)) {
        const match = payload.openInvoices.find((i: any) => i.id === preselectInvoiceId);
        if (match) {
          nextMap[match.id] = Number(match.balance || 0);
          setWatchedAmount(Number(match.balance || 0));
          receiptForm.setFieldsValue({ amount: Number(match.balance || 0) });
        }
      }
      // Default all per-invoice allocations to 0 unless explicitly preselected by invoice deep-link
      setAllocationMap(nextMap);

      if (payload?.customer?.divisionId && !receiptForm.getFieldValue('divisionId')) {
        const cleanDivId = resolveDivisionUuid(payload.customer.divisionId, divisions) || payload.customer.divisionId;
        setSelectedDivisionId(cleanDivId);
        receiptForm.setFieldsValue({ divisionId: cleanDivId });
      }
    } catch {
      setCustomerOpenData(null);
      message.error('Failed to load customer open invoices');
    } finally {
      setOpenInvoicesLoading(false);
    }
  }, [receiptForm, message, divisions]);

  const openRecordDrawer = useCallback((customerId?: string, invoiceId?: string) => {
    receiptForm.resetFields();
    setAllocationMap({});
    setCustomerOpenData(null);
    setPrePostConfirm(null);
    const defaultMode = 'BANK_TRANSFER';
    const defaultType = 'INVOICE_PAYMENT';
    const matchedCust = customerId ? customers.find((c) => c.id === customerId) : undefined;
    const initialDivId = resolveDivisionUuid(matchedCust?.divisionId || filterDivisionId, divisions);
    const defaultBankAccountId = resolveDefaultDepositAccountId(defaultMode, bankAccounts);

    setWatchedMode(defaultMode);
    setWatchedType(defaultType);
    setWatchedAmount(0);
    setSelectedDivisionId(initialDivId);
    setSelectedCustomerId(customerId);
    receiptForm.setFieldsValue({
      divisionId: initialDivId,
      customerId,
      receiptDate: dayjs(),
      paymentMode: defaultMode,
      receiptType: defaultType,
      bankAccountId: defaultBankAccountId,
      clearanceStatus: 'CLEARED',
      amount: 0,
    });
    setDrawerOpen(true);
    if (customerId) {
      void loadCustomerOpenDocs(customerId, invoiceId);
    }
  }, [receiptForm, loadCustomerOpenDocs, customers, filterDivisionId, divisions, bankAccounts]);

  const openAdvanceModal = useCallback(async (customerId?: string, receiptId?: string) => {
    setAdvCustomerId(customerId);
    setAdvReceiptId(receiptId);
    setAdvOpenData(null);
    setAdvAllocMap({});
    setAdvNotes('');
    setAdvDate(dayjs());
    setAdvanceModalOpen(true);
    if (customerId) {
      try {
        const res = await apiService.get<any>(`/sales/receipts/customer/${customerId}/open-invoices`);
        setAdvOpenData(res?.data || res);
      } catch {
        message.error('Failed to load customer advances & open invoices');
      }
    }
  }, [message]);

  // Handle deep-links e.g. /sales/receipts?customerId=...&invoiceId=...&action=record
  useEffect(() => {
    const qCustomer = searchParams.get('customerId') || undefined;
    const qInvoice = searchParams.get('invoiceId') || undefined;
    const qAction = searchParams.get('action');
    if (qCustomer && qAction === 'record') {
      openRecordDrawer(qCustomer, qInvoice);
      setSearchParams({}, { replace: true });
    } else if (qCustomer && qAction === 'advance') {
      void openAdvanceModal(qCustomer);
      setSearchParams({}, { replace: true });
    } else if (qCustomer) {
      setFilterCustomerId(qCustomer);
    }
  }, [searchParams, setSearchParams, openRecordDrawer, openAdvanceModal]);

  const {
    allocatedTotal: totalAllocatedInForm,
    unallocatedAdvance: excessAdvanceInForm,
    exceedsReceipt: allocExceedsReceiptInForm,
  } = useMemo(
    () => computeAllocationSummary(watchedAmount, allocationMap),
    [watchedAmount, allocationMap],
  );

  const customerOrderOptions = useMemo(
    () => extractCustomerOrderOptions(customerOpenData?.customerOrders, customerOpenData?.openInvoices),
    [customerOpenData],
  );

  const customerPoOptions = useMemo(
    () =>
      extractCustomerPoOptions(
        customerOpenData?.customerOrders,
        customerOpenData?.customerPos,
        customerOpenData?.openInvoices,
      ),
    [customerOpenData],
  );

  const maybePrefillSocAndPoFromInvoice = useCallback(
    (invoice: any) => {
      if (!invoice) return;
      const resolved = resolveInvoiceSocAndPo(invoice, customerOrderOptions);
      const currentSoc = String(receiptForm.getFieldValue('socNumber') || '').trim();
      const currentPo = String(receiptForm.getFieldValue('poReference') || '').trim();
      const patch: Record<string, any> = {};
      if (!currentSoc && resolved.socNumber) {
        patch.socNumber = resolved.socNumber;
      }
      if (!currentPo && resolved.customerPo) {
        patch.poReference = resolved.customerPo;
      }
      if (Object.keys(patch).length > 0) {
        receiptForm.setFieldsValue(patch);
      }
    },
    [customerOrderOptions, receiptForm],
  );

  const handleSocChange = (socNumber?: string) => {
    if (!socNumber) return;
    const matchedPo = resolvePoForSoc(socNumber, customerOrderOptions, customerOpenData?.openInvoices);
    if (matchedPo) {
      receiptForm.setFieldsValue({ poReference: matchedPo });
    }
  };

  const handleDivisionChange = (divId?: string) => {
    setSelectedDivisionId(divId);
    if (selectedCustomerId && divId) {
      const allowed = filterCustomersByDivision(customers, divId);
      if (!allowed.some((c) => c.id === selectedCustomerId)) {
        setSelectedCustomerId(undefined);
        setCustomerOpenData(null);
        setAllocationMap({});
        setWatchedAmount(0);
        receiptForm.setFieldsValue({
          customerId: undefined,
          amount: 0,
          socNumber: undefined,
          poReference: undefined,
        });
      }
    }
  };

  const handlePaymentModeChange = (mode: string) => {
    setWatchedMode(mode);
    const defaultAccId = resolveDefaultDepositAccountId(mode, bankAccounts);
    receiptForm.setFieldsValue({ bankAccountId: defaultAccId });
  };

  const handleReceiptAmountChange = (val: number | null) => {
    const nextAmount = Math.max(0, Number(val) || 0);
    setWatchedAmount(nextAmount);
    setAllocationMap((prev) =>
      capAllocationsToReceiptAmount(customerOpenData?.openInvoices || [], prev, nextAmount),
    );
  };

  const handleAutoAllocateFifo = () => {
    const openInvoices = customerOpenData?.openInvoices || [];
    if (openInvoices.length === 0) {
      message.info('No open invoices available for this customer. Full amount will be saved as Advance Payment.');
      return;
    }
    const currentAmount = Number(watchedAmount) || 0;
    if (currentAmount <= 0) {
      message.warning('Enter Receipt Amount first, or click "Settle All Open Invoices" to pay all due balances.');
      return;
    }
    const fifo = computeFifoAllocations(openInvoices, currentAmount);
    setAllocationMap(fifo.allocationMap);
    const firstAllocatedInv = openInvoices.find((inv: any) => (fifo.allocationMap[inv.id] || 0) > 0 && inv.socNumber);
    if (firstAllocatedInv) {
      maybePrefillSocAndPoFromInvoice(firstAllocatedInv);
    }
  };

  const handleMatchAllInvoicesTotal = () => {
    const openInvoices = customerOpenData?.openInvoices || [];
    const matched = computeFifoAllocations(openInvoices, 0);
    setAllocationMap(matched.allocationMap);
    setWatchedAmount(matched.amount);
    receiptForm.setFieldsValue({ amount: matched.amount });
    const firstAllocatedInv = openInvoices.find((inv: any) => (matched.allocationMap[inv.id] || 0) > 0 && inv.socNumber);
    if (firstAllocatedInv) {
      maybePrefillSocAndPoFromInvoice(firstAllocatedInv);
    }
  };

  const handlePreparePostConfirmation = async () => {
    try {
      const values = await receiptForm.validateFields();
      const amount = Number(values.amount) || 0;
      if (amount <= 0) {
        message.error('Receipt amount must be greater than zero');
        return;
      }

      const cappedMap = capAllocationsToReceiptAmount(
        customerOpenData?.openInvoices || [],
        allocationMap,
        amount,
      );
      const allocations = buildAllocationsPayload(cappedMap);
      const summary = computeAllocationSummary(amount, cappedMap);
      if (summary.exceedsReceipt || allocExceedsReceiptInForm) {
        message.error(`Allocated total (Rs ${formatDecimal(summary.allocatedTotal)}) cannot exceed Receipt Amount (Rs ${formatDecimal(amount)})`);
        return;
      }

      const matchedCust = customers.find((c) => c.id === values.customerId) || customerOpenData?.customer;
      const resolvedDivisionId = resolveDivisionUuid(
        values.divisionId || selectedDivisionId || matchedCust?.divisionId,
        divisions,
      );
      const matchedDiv = divisions.find(
        (d) =>
          (resolvedDivisionId && d.id === resolvedDivisionId) ||
          d.id === values.divisionId ||
          d.name === values.divisionId,
      );
      const matchedAcc = bankAccounts.find((a) => a.id === values.bankAccountId);
      const modeObj = PAYMENT_MODES.find((m) => m.value === values.paymentMode);
      const typeObj = RECEIPT_TYPES.find((t) => t.value === values.receiptType);
      const openInvoices = customerOpenData?.openInvoices || [];

      const allocatedInvoices = allocations.map((a) => {
        const inv = openInvoices.find((i: any) => i.id === a.salesInvoiceId);
        const origBal = Number(inv?.balance || 0);
        return {
          invoiceNo: inv?.invoiceNo || a.salesInvoiceId,
          allocatedAmount: a.allocatedAmount,
          remainingAfter: Math.max(0, Math.round((origBal - a.allocatedAmount) * 100) / 100),
        };
      });

      const payload = {
        customerId: values.customerId,
        divisionId: resolvedDivisionId,
        receiptDate: values.receiptDate ? values.receiptDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        receiptType: values.receiptType,
        paymentMode: values.paymentMode,
        bankAccountId: values.bankAccountId || undefined,
        bankName: values.bankName || undefined,
        chequeNumber: values.chequeNumber || undefined,
        chequeDate: values.chequeDate ? values.chequeDate.format('YYYY-MM-DD') : undefined,
        clearanceStatus: values.clearanceStatus || 'CLEARED',
        socNumber: values.socNumber || undefined,
        poReference: values.poReference || undefined,
        referenceNo: values.referenceNo || undefined,
        remarks: values.remarks || undefined,
        amount,
        allocations,
      };

      setPrePostConfirm({
        payload,
        customerName: matchedCust?.name || matchedCust?.companyName || 'Selected Customer',
        customerCode: matchedCust?.customerCode || '',
        divisionName: matchedDiv?.name || 'All Divisions',
        receiptDate: payload.receiptDate,
        receiptTypeLabel: typeObj?.label || values.receiptType,
        paymentModeLabel: modeObj?.label || values.paymentMode,
        depositAccountLabel: matchedAcc
          ? `${matchedAcc.accountCode} — ${matchedAcc.accountName}`
          : values.paymentMode === 'CASH'
          ? '1000 — Cash (Auto)'
          : '1010 — Bank (Auto)',
        amount,
        allocatedTotal: summary.allocatedTotal,
        unallocatedAdvance: summary.unallocatedAdvance,
        allocatedInvoices,
        chequeNumber: values.chequeNumber || undefined,
        bankName: values.bankName || undefined,
      });
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || 'Please check voucher fields');
    }
  };

  const handleConfirmAndPostReceipt = async () => {
    if (!prePostConfirm) return;
    setSubmitting(true);
    try {
      const res = await apiService.post<any>('/sales/receipts', prePostConfirm.payload);
      const created = res?.data || res;
      message.success(
        `Receipt Voucher ${created?.receiptNumber || ''} saved!${created?.unallocatedAdvanceAmount > 0 ? ` Rs ${formatDecimal(created.unallocatedAdvanceAmount)} recorded as Advance.` : ''}`,
      );
      setPrePostConfirm(null);
      setDrawerOpen(false);
      triggerTabRefresh('/sales/invoices');
      triggerTabRefresh('/customers');
      triggerTabRefresh('/dashboard');
      void fetchReceipts(1, pageSize);
      if (created) {
        setDetailReceipt(created);
        setDetailModalOpen(true);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to record customer receipt';
      message.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadAdvCustomer = async (custId: string) => {
    setAdvCustomerId(custId);
    setAdvReceiptId(undefined);
    setAdvAllocMap({});
    if (!custId) {
      setAdvOpenData(null);
      return;
    }
    try {
      const res = await apiService.get<any>(`/sales/receipts/customer/${custId}/open-invoices`);
      setAdvOpenData(res?.data || res);
    } catch {
      message.error('Failed to load customer advances');
    }
  };

  const selectedAdvanceAvailable = useMemo(() => {
    const advances = advOpenData?.availableAdvances || [];
    if (advReceiptId) {
      const target = advances.find((a: any) => a.id === advReceiptId);
      return Number(target?.unallocatedAdvanceAmount || 0);
    }
    return advances.reduce((s: number, a: any) => s + (Number(a.unallocatedAdvanceAmount) || 0), 0);
  }, [advOpenData, advReceiptId]);

  const totalAdvApplying = useMemo(
    () => Object.values(advAllocMap).reduce((s, v) => s + (Number(v) || 0), 0),
    [advAllocMap],
  );

  const handleAutoAllocateAdvance = () => {
    const openInvoices = advOpenData?.openInvoices || [];
    const fifo = computeFifoAllocations(openInvoices, selectedAdvanceAvailable);
    setAdvAllocMap(fifo.allocationMap);
  };

  const handleSubmitAdvanceAdjustment = async () => {
    if (!advCustomerId) {
      message.error('Please select a customer');
      return;
    }
    const invoiceAllocations = buildAllocationsPayload(advAllocMap);
    if (invoiceAllocations.length === 0) {
      message.error('Specify at least one invoice amount to adjust');
      return;
    }
    if (totalAdvApplying > selectedAdvanceAvailable + 0.01) {
      message.error('Total adjustment exceeds available advance balance');
      return;
    }

    setAdvSubmitting(true);
    try {
      const res = await apiService.post<any>('/sales/receipts/apply-advance', {
        customerId: advCustomerId,
        receiptId: advReceiptId || undefined,
        adjustmentDate: advDate ? advDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        notes: advNotes || undefined,
        invoiceAllocations,
      });
      message.success(res?.message || 'Advance adjusted against open invoices');
      setAdvanceModalOpen(false);
      triggerTabRefresh('/sales/invoices');
      triggerTabRefresh('/customers');
      triggerTabRefresh('/dashboard');
      void fetchReceipts(page, pageSize);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to adjust advance';
      message.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setAdvSubmitting(false);
    }
  };

  const handleClearCheque = async (record: any) => {
    try {
      const res = await apiService.patch<any>(`/sales/receipts/${record.id}/clear-cheque`, {
        clearanceDate: dayjs().format('YYYY-MM-DD'),
      });
      message.success(`Cheque cleared for ${record.receiptNumber}`);
      const updated = res?.data || res;
      if (detailReceipt?.id === record.id && updated) setDetailReceipt(updated);
      void fetchReceipts(page, pageSize);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to clear cheque');
    }
  };

  const handleConfirmBounce = async () => {
    if (!bounceTarget || !bounceReason.trim()) {
      message.error('Please enter a reason for cheque bounce reversal');
      return;
    }
    setBounceLoading(true);
    try {
      const res = await apiService.patch<any>(`/sales/receipts/${bounceTarget.id}/bounce-cheque`, {
        reason: bounceReason.trim(),
        bounceDate: dayjs().format('YYYY-MM-DD'),
      });
      message.warning(`Cheque bounce reversal recorded for ${bounceTarget.receiptNumber}`);
      setBounceTarget(null);
      setBounceReason('');
      const updated = res?.data || res;
      if (detailReceipt?.id === bounceTarget.id && updated) setDetailReceipt(updated);
      triggerTabRefresh('/sales/invoices');
      triggerTabRefresh('/customers');
      void fetchReceipts(page, pageSize);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to reverse bounced cheque');
    } finally {
      setBounceLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (receipts.length === 0) {
      message.warning('No receipts to export');
      return;
    }
    const headers = [
      'Voucher #',
      'Date',
      'Customer Code',
      'Customer Name',
      'Division',
      'Type',
      'Mode',
      'Bank / Account',
      'Cheque #',
      'Clearance',
      'Amount (PKR)',
      'Allocated (PKR)',
      'Unallocated Advance (PKR)',
      'Settled Invoices',
    ];
    const rows = receipts.map((r) => [
      `"${r.receiptNumber}"`,
      `"${r.receiptDate || ''}"`,
      `"${r.customerCode || ''}"`,
      `"${r.customerName || ''}"`,
      `"${r.divisionName || 'All Divisions'}"`,
      `"${r.receiptType}"`,
      `"${r.paymentMode}"`,
      `"${r.bankAccountName || r.bankName || ''}"`,
      `"${r.chequeNumber || ''}"`,
      `"${r.clearanceStatus}"`,
      r.amount || 0,
      r.allocatedAmount || 0,
      r.unallocatedAdvanceAmount || 0,
      `"${(r.allocations || []).map((a: any) => `${a.invoiceNo}: ${a.allocatedAmount}`).join('; ')}"`,
    ]);
    const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((x) => x.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = encodeURI(csv);
    a.download = `customer_receipts_${dayjs().format('YYYYMMDD_HHmm')}.csv`;
    a.click();
  };

  const columns: ColumnsType<any> = [
    {
      title: 'Receipt Voucher #',
      key: 'receiptNumber',
      width: 170,
      render: (_, r) => (
        <div>
          <span
            style={{ fontFamily: 'monospace', fontWeight: 800, color: token.colorPrimary, cursor: 'pointer' }}
            onClick={() => {
              setDetailReceipt(r);
              setDetailModalOpen(true);
            }}
          >
            {r.receiptNumber}
          </span>
          <div style={{ fontSize: 11.5, color: token.colorTextSecondary }}>{r.receiptDate || '-'}</div>
        </div>
      ),
    },
    {
      title: 'Customer & Reference',
      key: 'customer',
      width: 240,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 700, color: token.colorText }}>{r.customerName}</div>
          <Space size={4} wrap style={{ marginTop: 2 }}>
            {r.customerCode && <Tag style={{ margin: 0, fontFamily: 'monospace', fontSize: 10.5 }}>{r.customerCode}</Tag>}
            {r.divisionName && <Tag color="blue" style={{ margin: 0, fontSize: 10.5 }}>{r.divisionName}</Tag>}
            {r.socNumber && <Tag color="purple" style={{ margin: 0, fontSize: 10.5 }}>{r.socNumber}</Tag>}
            {r.poReference && <Tag color="geekblue" style={{ margin: 0, fontSize: 10.5 }}>PO: {r.poReference}</Tag>}
          </Space>
        </div>
      ),
    },
    {
      title: 'Mode & Instrument',
      key: 'mode',
      width: 195,
      render: (_, r) => {
        const clearanceColor =
          r.clearanceStatus === 'BOUNCED' ? 'red' : r.clearanceStatus === 'PENDING_CLEARANCE' ? 'gold' : 'green';
        return (
          <div>
            <Space size={4}>
              <Tag color="cyan" style={{ margin: 0, fontWeight: 700 }}>
                {String(r.paymentMode || '').replace(/_/g, ' ')}
              </Tag>
              <Tag color={clearanceColor} style={{ margin: 0, fontSize: 10.5 }}>
                {String(r.clearanceStatus || 'CLEARED').replace(/_/g, ' ')}
              </Tag>
            </Space>
            <div style={{ fontSize: 11.5, color: token.colorTextSecondary, marginTop: 2 }}>
              {r.bankAccountName || r.bankName || 'Cash / Bank'}
              {r.chequeNumber ? ` · Chq #${r.chequeNumber}` : ''}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Invoice Allocations',
      key: 'allocations',
      width: 210,
      render: (_, r) => {
        const allocs = r.allocations || [];
        if (allocs.length === 0) {
          return <Tag color="blue">Advance / Unallocated</Tag>;
        }
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {allocs.map((a: any) => (
              <Tag key={a.id} color={a.status === 'REVERSED' ? 'red' : 'geekblue'} style={{ margin: 0, fontFamily: 'monospace' }}>
                {a.invoiceNo}: Rs {formatDecimal(a.allocatedAmount)}
              </Tag>
            ))}
          </div>
        );
      },
    },
    {
      title: 'Received (PKR)',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      width: 135,
      render: (val: number) => (
        <span style={{ fontWeight: 800, color: '#16a34a' }}>Rs {formatDecimal(val)}</span>
      ),
    },
    {
      title: 'Unadjusted Advance',
      dataIndex: 'unallocatedAdvanceAmount',
      key: 'unallocated',
      align: 'right',
      width: 145,
      render: (val: number, r) =>
        Number(val) > 0 && r.status !== 'BOUNCED' ? (
          <Tag color="blue" style={{ margin: 0, fontWeight: 700 }}>
            Rs {formatDecimal(val)}
          </Tag>
        ) : (
          <span style={{ color: token.colorTextTertiary }}>—</span>
        ),
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'center',
      width: 170,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="View Receipt Details">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setDetailReceipt(r);
                setDetailModalOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="Print Payment Receipt Voucher">
            <Button
              size="small"
              icon={<PrinterOutlined />}
              onClick={() => printPaymentReceiptVoucher(r)}
            />
          </Tooltip>
          {Number(r.unallocatedAdvanceAmount) > 0 && r.status === 'POSTED' && r.clearanceStatus !== 'BOUNCED' && (
            <Tooltip title="Adjust Advance Against Invoices">
              <Button
                size="small"
                type="primary"
                icon={<SwapOutlined />}
                onClick={() => void openAdvanceModal(r.customerId, r.id)}
              />
            </Tooltip>
          )}
          {r.clearanceStatus === 'PENDING_CLEARANCE' && r.status === 'POSTED' && (
            <Tooltip title="Mark Cheque Cleared">
              <Button
                size="small"
                style={{ color: '#16a34a', borderColor: '#16a34a' }}
                icon={<CheckCircleOutlined />}
                onClick={() => void handleClearCheque(r)}
              />
            </Tooltip>
          )}
          {r.paymentMode === 'CHEQUE' && r.clearanceStatus !== 'BOUNCED' && r.status === 'POSTED' && (
            <Tooltip title="Mark Cheque Bounced / Reversal">
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => {
                  setBounceTarget(r);
                  setBounceReason('');
                }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '12px 16px' }}>
      <PageHeader
        icon={<WalletOutlined />}
        title="Customer Payments & Advances"
        subtitle="Bill-to-bill invoice settlement, advance receipts, cheque clearance & customer subledger synchronization"
        showBreadcrumbs
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchReceipts(page, pageSize)}>
              Refresh
            </Button>
            <Button icon={<FileExcelOutlined />} onClick={handleExportCsv}>
              CSV
            </Button>
            <Button
              icon={<PrinterOutlined />}
              onClick={() =>
                printTableList(
                  'Customer Receipts Register',
                  ['Voucher #', 'Date', 'Customer', 'Mode', 'Amount (PKR)', 'Advance (PKR)', 'Status'],
                  receipts.map((r) => [
                    r.receiptNumber,
                    r.receiptDate,
                    r.customerName,
                    r.paymentMode,
                    formatDecimal(r.amount),
                    formatDecimal(r.unallocatedAdvanceAmount),
                    r.clearanceStatus,
                  ]),
                )
              }
            >
              Print Register
            </Button>
            <Button
              icon={<SwapOutlined />}
              onClick={() => void openAdvanceModal(filterCustomerId)}
            >
              Adjust Advance
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openRecordDrawer(filterCustomerId)}
              style={{ fontWeight: 700 }}
            >
              + Record Receipt / Advance
            </Button>
          </Space>
        }
      />

      {/* KPI Strip */}
      <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
        <Col xs={12} sm={12} md={6} lg={4}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic title="Receipt Vouchers" value={kpis.totalReceipts} prefix={<AuditOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6} lg={5}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title="Total Collected (PKR)"
              value={kpis.totalCollected}
              precision={2}
              prefix="Rs"
              valueStyle={{ color: '#16a34a', fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6} lg={5}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title="Allocated to Invoices"
              value={kpis.totalAllocated}
              precision={2}
              prefix="Rs"
              valueStyle={{ color: token.colorPrimary, fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6} lg={5}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title="Unadjusted Advances"
              value={kpis.unallocatedAdvances}
              precision={2}
              prefix="Rs"
              valueStyle={{ color: '#0284c7', fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6} lg={5}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title="Pending Cheque Clearance"
              value={kpis.pendingClearance}
              precision={2}
              prefix="Rs"
              valueStyle={{ color: kpis.pendingClearance > 0 ? '#d97706' : token.colorTextSecondary, fontWeight: 800 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters Card */}
      <Card size="small" style={{ borderRadius: 10, marginBottom: 14 }}>
        <Row gutter={[10, 10]} align="middle">
          <Col xs={24} md={6}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search RCV #, customer, cheque, SOC, PO..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="All Customers"
              style={{ width: '100%' }}
              value={filterCustomerId}
              onChange={(v) => {
                setFilterCustomerId(v);
                setPage(1);
              }}
              options={customers.map((c) => ({
                value: c.id,
                label: `${c.customerCode ? `[${c.customerCode}] ` : ''}${c.name}`,
              }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select
              allowClear
              placeholder="All Divisions"
              style={{ width: '100%' }}
              value={filterDivisionId}
              onChange={(v) => {
                setFilterDivisionId(v);
                setPage(1);
              }}
              options={divisions.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select
              style={{ width: '100%' }}
              value={filterMode}
              onChange={(v) => {
                setFilterMode(v);
                setPage(1);
              }}
              options={[{ value: 'ALL', label: 'All Modes' }, ...PAYMENT_MODES]}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select
              style={{ width: '100%' }}
              value={filterClearance}
              onChange={(v) => {
                setFilterClearance(v);
                setPage(1);
              }}
              options={[{ value: 'ALL', label: 'All Clearances' }, ...CLEARANCE_STATUSES]}
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <RangePicker
                style={{ width: '100%' }}
                value={dateRange}
                onChange={(vals) => {
                  setDateRange(vals as any);
                  setPage(1);
                }}
              />
              <Tooltip title="Reset Filters">
                <Button
                  icon={<FilterOutlined />}
                  onClick={() => {
                    setSearch('');
                    setFilterCustomerId(undefined);
                    setFilterDivisionId(undefined);
                    setFilterMode('ALL');
                    setFilterClearance('ALL');
                    setFilterType('ALL');
                    setDateRange(null);
                    setPage(1);
                  }}
                />
              </Tooltip>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Main Receipts Table */}
      <Card size="small" style={{ borderRadius: 10 }}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={receipts}
          scroll={{ x: 1120 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      {/* Record Receipt / Advance Executive Centered Draggable Modal */}
      <DraggableResizableModal
        wrapClassName="pwi-voucher-modal-wrap"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #2563EB 0%, #EA580C 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: 20,
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                flexShrink: 0,
              }}
            >
              <DollarCircleOutlined />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.25 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '1.1px',
                    color: '#2563EB',
                  }}
                >
                  ACCOUNTS RECEIVABLE · VOUCHER ENTRY
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: token.colorTextSecondary,
                    backgroundColor: token.colorFillAlter,
                    padding: '1px 8px',
                    borderRadius: 6,
                    border: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  Drag to Move
                </span>
              </div>
              <div
                style={{
                  fontSize: 17.5,
                  fontWeight: 900,
                  color: token.colorText,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: 2,
                }}
              >
                Record Customer Payment / Advance Voucher
              </div>
            </div>
          </div>
        }
        extra={
          <div className="pwi-voucher-step-pills" onMouseDown={(e) => e.stopPropagation()}>
            {[
              { step: 1 as const, label: '1 Customer & Area', targetId: 'pwi-voucher-card-1' },
              { step: 2 as const, label: '2 Payment & Mode', targetId: 'pwi-voucher-card-2' },
              { step: 3 as const, label: '3 Invoice Allocation', targetId: 'pwi-voucher-allocation-section' },
            ].map((item, idx) => {
              const isActive = activeVoucherStep === item.step;
              const isDone =
                (item.step === 1 && Boolean(selectedCustomerId)) ||
                (item.step === 2 && Boolean(watchedMode)) ||
                (item.step === 3 && totalAllocatedInForm > 0);
              return (
                <React.Fragment key={item.step}>
                  {idx > 0 && (
                    <span style={{ color: token.colorTextTertiary, fontSize: 11, fontWeight: 700 }}>➔</span>
                  )}
                  <button
                    type="button"
                    className="pwi-voucher-step-pill"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveVoucherStep(item.step);
                      document.getElementById(item.targetId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }}
                    style={{
                      backgroundColor: isActive
                        ? '#2563EB'
                        : isDone
                        ? 'rgba(16, 185, 129, 0.14)'
                        : token.colorFillAlter,
                      color: isActive ? '#ffffff' : isDone ? '#059669' : token.colorTextSecondary,
                      borderColor: isActive
                        ? '#2563EB'
                        : isDone
                        ? 'rgba(16, 185, 129, 0.35)'
                        : token.colorBorderSecondary,
                    }}
                  >
                    {item.label}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        }
        minimizedTitle="Record Customer Payment / Advance Voucher"
        open={drawerOpen}
        onCancel={() => {
          if (!submitting) {
            setPrePostConfirm(null);
            setDrawerOpen(false);
          }
        }}
        width={1080}
        height={740}
        centered
        allowMaximize
        allowMinimize
        destroyOnClose
        footer={
          <div className="pwi-voucher-footer">
            <Button
              size="large"
              onClick={() => {
                setPrePostConfirm(null);
                setDrawerOpen(false);
              }}
              disabled={submitting}
              style={{ borderRadius: 999, fontWeight: 700, paddingInline: 24 }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              size="large"
              className="pwi-voucher-cta-btn"
              loading={submitting}
              onClick={() => void handlePreparePostConfirmation()}
            >
              POST RECEIPT VOUCHER →
            </Button>
          </div>
        }
      >
        <Form form={receiptForm} layout="vertical">
          {/* 3-COLUMN SIDE-BY-SIDE EXECUTIVE TINTED CARDS */}
          <div className="pwi-voucher-cards-grid">
            {/* CARD 1 (Left — Soft Blue Tint): Customer & Division */}
            <div
              id="pwi-voucher-card-1"
              onClick={() => setActiveVoucherStep(1)}
              className={`pwi-voucher-card pwi-voucher-card--blue ${activeVoucherStep === 1 ? 'pwi-voucher-card--active' : ''}`}
              style={{ backgroundColor: token.colorBgContainer }}
            >
              <div>
                <div className="pwi-voucher-card-header">
                  <div
                    className="pwi-voucher-card-icon"
                    style={{
                      background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.22) 0%, rgba(37, 99, 235, 0.1) 100%)',
                      color: '#2563EB',
                    }}
                  >
                    <ApartmentOutlined />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: token.colorText }}>Customer &amp; Division</div>
                    <div style={{ fontSize: 11, color: token.colorTextSecondary }}>Division &amp; Account Selection</div>
                  </div>
                </div>

                <Form.Item
                  name="divisionId"
                  label={<span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>Division</span>}
                >
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select Division..."
                    options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                    onChange={(divId) => {
                      setActiveVoucherStep(1);
                      handleDivisionChange(divId);
                    }}
                  />
                </Form.Item>

                <Form.Item
                  name="customerId"
                  label={<span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>Customer</span>}
                  rules={[{ required: true, message: 'Please select a customer' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder={selectedDivisionId ? 'Select customer in division...' : 'Select customer...'}
                    options={filteredFormCustomers.map((c) => ({
                      value: c.id,
                      label: `${c.customerCode ? `[${c.customerCode}] ` : ''}${c.name}`,
                    }))}
                    onChange={(custId) => {
                      setSelectedCustomerId(custId);
                      setAllocationMap({});
                      setWatchedAmount(0);
                      setActiveVoucherStep(2);
                      receiptForm.setFieldsValue({
                        amount: 0,
                        socNumber: undefined,
                        poReference: undefined,
                      });
                      void loadCustomerOpenDocs(custId);
                    }}
                  />
                </Form.Item>
              </div>

              {/* Bottom Verified Status Pill */}
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  backgroundColor: token.colorFillAlter,
                  border: `1px solid ${
                    customerOpenData?.customer?.creditHold
                      ? 'rgba(220, 38, 38, 0.38)'
                      : token.colorBorderSecondary
                  }`,
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    color: token.colorTextSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                >
                  <span>Verified Account Balance &amp; Credit Terms</span>
                  {customerOpenData?.customer?.creditHold && (
                    <Tag color="red" style={{ margin: 0, fontSize: 10, fontWeight: 800 }}>
                      CREDIT HOLD
                    </Tag>
                  )}
                </div>
                {selectedCustomerId && customerOpenData ? (
                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2563EB' }}>
                      Net: Rs {formatDecimal(Math.abs(customerOpenData.summary?.netReceivableBalance || 0))}{' '}
                      {(customerOpenData.summary?.netReceivableBalance || 0) >= 0 ? 'DR' : 'CR'}
                      {' · '}
                      <span style={{ color: token.colorText, fontWeight: 700, fontSize: 12 }}>
                        {customerOpenData.customer?.paymentTerms || 'Cash / Immediate'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                      Open: <strong>{customerOpenData.openInvoices?.length || 0}</strong> (Rs{' '}
                      {formatDecimal(customerOpenData.summary?.aging?.totalOpenBalance || 0)}) · Adv:{' '}
                      <strong style={{ color: '#0284c7' }}>
                        Rs {formatDecimal(customerOpenData.summary?.unadjustedAdvanceBalance || 0)}
                      </strong>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Button
                        size="small"
                        type="link"
                        icon={<AuditOutlined />}
                        style={{ padding: 0, height: 'auto', fontSize: 11.5, fontWeight: 700 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrawerOpen(false);
                          openCustomerLedger(selectedCustomerId);
                        }}
                      >
                        Open Customer Ledger
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, fontWeight: 600, color: token.colorTextTertiary, marginTop: 4 }}>
                    Select a customer to verify account balance &amp; terms
                  </div>
                )}
              </div>
            </div>

            {/* CARD 2 (Middle — Soft Warm Amber/Orange Tint): Date & Payment Mode */}
            <div
              id="pwi-voucher-card-2"
              onClick={() => setActiveVoucherStep(2)}
              className={`pwi-voucher-card pwi-voucher-card--amber ${activeVoucherStep === 2 ? 'pwi-voucher-card--active' : ''}`}
              style={{ backgroundColor: token.colorBgContainer }}
            >
              <div>
                <div className="pwi-voucher-card-header">
                  <div
                    className="pwi-voucher-card-icon"
                    style={{
                      background: 'linear-gradient(135deg, rgba(234, 88, 12, 0.22) 0%, rgba(194, 65, 12, 0.1) 100%)',
                      color: '#EA580C',
                    }}
                  >
                    <CalendarOutlined />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: token.colorText }}>Date &amp; Payment Mode</div>
                    <div style={{ fontSize: 11, color: token.colorTextSecondary }}>Receipt Date &amp; Deposit Channel</div>
                  </div>
                </div>

                <Row gutter={8}>
                  <Col span={12}>
                    <Form.Item
                      name="receiptDate"
                      label={<span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>Receipt Date</span>}
                      rules={[{ required: true, message: 'Receipt date required' }]}
                    >
                      <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="receiptType"
                      label={<span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>Receipt Type</span>}
                      rules={[{ required: true }]}
                    >
                      <Select
                        options={RECEIPT_TYPES}
                        onChange={(v) => setWatchedType(v)}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item
                  name="paymentMode"
                  label={<span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>Payment Mode</span>}
                  rules={[{ required: true }]}
                >
                  <Select
                    options={PAYMENT_MODES}
                    onChange={(v) => {
                      setActiveVoucherStep(2);
                      handlePaymentModeChange(v);
                    }}
                  />
                </Form.Item>

                <Form.Item
                  name="bankAccountId"
                  label={<span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>Deposit Account (GL)</span>}
                >
                  <Select
                    allowClear
                    placeholder="Auto (Cash 1000 / Bank 1010)"
                    options={bankAccounts.map((a) => ({
                      value: a.id,
                      label: `${a.accountCode} — ${a.accountName}`,
                    }))}
                  />
                </Form.Item>

                {watchedMode === 'CHEQUE' && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      backgroundColor: token.colorFillAlter,
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Row gutter={8}>
                      <Col span={12}>
                        <Form.Item
                          name="bankName"
                          label={<span style={{ whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 600 }}>Bank Name</span>}
                        >
                          <Input size="small" placeholder="e.g. HBL, Meezan" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          name="chequeNumber"
                          label={<span style={{ whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 600 }}>Cheque #</span>}
                        >
                          <Input size="small" placeholder="Cheque Number" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          name="chequeDate"
                          label={<span style={{ whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 600 }}>Cheque Date</span>}
                        >
                          <DatePicker size="small" style={{ width: '100%' }} format="YYYY-MM-DD" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          name="clearanceStatus"
                          label={<span style={{ whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 600 }}>Clearance</span>}
                        >
                          <Select
                            size="small"
                            options={[
                              { value: 'CLEARED', label: 'Cleared' },
                              { value: 'PENDING_CLEARANCE', label: 'PDC (Pending)' },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                )}
              </div>
            </div>

            {/* CARD 3 (Right — Soft Mint Green Tint): Amount & Order Reference */}
            <div
              id="pwi-voucher-card-3"
              onClick={() => setActiveVoucherStep(3)}
              className={`pwi-voucher-card pwi-voucher-card--emerald ${activeVoucherStep === 3 ? 'pwi-voucher-card--active' : ''}`}
              style={{ backgroundColor: token.colorBgContainer }}
            >
              <div>
                <div className="pwi-voucher-card-header">
                  <div
                    className="pwi-voucher-card-icon"
                    style={{
                      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(5, 150, 105, 0.1) 100%)',
                      color: '#059669',
                    }}
                  >
                    <DollarCircleOutlined />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: token.colorText }}>Amount &amp; Order Reference</div>
                    <div style={{ fontSize: 11, color: token.colorTextSecondary }}>Receipt Value &amp; SOC / PO Link</div>
                  </div>
                </div>

                <Form.Item
                  name="amount"
                  label={<span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>Receipt Amount (PKR)</span>}
                  rules={[{ required: true, message: 'Enter receipt amount' }]}
                >
                  <InputNumber
                    style={{ width: '100%', fontWeight: 800 }}
                    min={0}
                    precision={2}
                    onChange={(v) => {
                      setActiveVoucherStep(3);
                      handleReceiptAmountChange(v as number | null);
                    }}
                  />
                </Form.Item>

                <Form.Item
                  name="socNumber"
                  label={<span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>SOC # (Optional)</span>}
                >
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="searchText"
                    disabled={!selectedCustomerId}
                    placeholder={
                      !selectedCustomerId
                        ? 'Select customer first...'
                        : customerOrderOptions.length > 0
                        ? 'Select customer SOC #...'
                        : 'No SOC orders for customer'
                    }
                    onChange={(val) => handleSocChange(val)}
                    options={customerOrderOptions.map((ord) => ({
                      value: ord.orderNumber,
                      searchText: `${ord.orderNumber} ${ord.orderDate || ''} ${ord.divisionName || ''} ${ord.customerPo || ''} ${ord.status || ''}`,
                      label: (
                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12.5 }}>
                            {ord.orderNumber}
                          </span>
                          <span style={{ fontSize: 10.5, color: token.colorTextSecondary }}>
                            {[
                              ord.orderDate || null,
                              ord.divisionName || null,
                              ord.totalAmount ? `Rs ${formatDecimal(ord.totalAmount)}` : null,
                              ord.status || null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                      ),
                    }))}
                  />
                </Form.Item>

                <Form.Item
                  name="poReference"
                  label={<span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>Customer PO #</span>}
                >
                  <AutoComplete
                    allowClear
                    disabled={!selectedCustomerId}
                    placeholder={
                      !selectedCustomerId
                        ? 'Select customer first...'
                        : customerPoOptions.length > 0
                        ? 'Select or search customer PO #...'
                        : 'Optional PO reference'
                    }
                    options={customerPoOptions.map((po) => ({ value: po, label: po }))}
                    filterOption={(inputValue, option) =>
                      String(option?.value || '').toUpperCase().includes(inputValue.toUpperCase())
                    }
                  />
                </Form.Item>

                <Row gutter={8}>
                  <Col span={12}>
                    <Form.Item
                      name="referenceNo"
                      label={<span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>Bank Slip / Ref #</span>}
                    >
                      <Input placeholder="IBFT / Slip Ref" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="remarks"
                      label={<span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>Remarks</span>}
                    >
                      <Input placeholder="Voucher narration" />
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            </div>
          </div>

          {/* BILL-TO-BILL INVOICE ALLOCATION CARD */}
          <Card
            id="pwi-voucher-allocation-section"
            size="small"
            onClick={() => setActiveVoucherStep(3)}
            style={{
              borderRadius: 14,
              border: `1px solid ${token.colorBorderSecondary}`,
              boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
            }}
            title={
              <Space wrap>
                <AuditOutlined style={{ color: '#2563EB' }} />
                <span style={{ fontWeight: 800 }}>Bill-to-Bill Invoice Allocation</span>
                {watchedType === 'ADVANCE_PAYMENT' && (
                  <Tag color="blue" style={{ margin: 0 }}>
                    Advance Mode — Excess stays Unallocated
                  </Tag>
                )}
              </Space>
            }
            extra={
              <Space size={8} wrap>
                <Button size="small" onClick={handleAutoAllocateFifo} disabled={!customerOpenData?.openInvoices?.length}>
                  Auto-Allocate (Oldest First)
                </Button>
                <Button size="small" onClick={handleMatchAllInvoicesTotal} disabled={!customerOpenData?.openInvoices?.length}>
                  Settle All Open Invoices
                </Button>
                <Button size="small" onClick={() => setAllocationMap({})}>
                  Clear All
                </Button>
              </Space>
            }
          >
            {openInvoicesLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: token.colorTextSecondary }}>
                Loading customer open invoices...
              </div>
            ) : !selectedCustomerId ? (
              <Empty description="Select a customer above to load open invoices" />
            ) : (customerOpenData?.openInvoices || []).length === 0 ? (
              <Empty description="No open invoices due — full receipt amount will be saved cleanly as Unallocated Customer Advance" />
            ) : (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 680 }}
                dataSource={customerOpenData.openInvoices}
                columns={[
                  {
                    title: 'Invoice #',
                    dataIndex: 'invoiceNo',
                    render: (v: string, inv: any) => (
                      <div>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{v}</span>
                        {inv.socNumber && (
                          <div style={{ fontSize: 10.5, color: token.colorTextSecondary }}>
                            {inv.socNumber}
                            {inv.customerPo ? ` · PO: ${inv.customerPo}` : ''}
                          </div>
                        )}
                      </div>
                    ),
                  },
                  {
                    title: 'Invoice / Due Date',
                    render: (_, inv: any) => (
                      <div style={{ fontSize: 11.5 }}>
                        <div>{inv.invoiceDate}</div>
                        <Space size={4}>
                          <span>Due: {inv.dueDate || '-'}</span>
                          {inv.daysOverdue > 0 && <Tag color="red" style={{ margin: 0, fontSize: 10 }}>{inv.daysOverdue}d late</Tag>}
                        </Space>
                      </div>
                    ),
                  },
                  {
                    title: 'Total',
                    dataIndex: 'totalAmount',
                    align: 'right',
                    render: (v: number) => `Rs ${formatDecimal(v)}`,
                  },
                  {
                    title: 'Balance Due',
                    dataIndex: 'balance',
                    align: 'right',
                    render: (v: number) => <strong style={{ color: '#dc2626' }}>Rs {formatDecimal(v)}</strong>,
                  },
                  {
                    title: 'Allocate Now (Rs)',
                    width: 195,
                    render: (_, inv: any) => {
                      const maxAllowable = computeMaxRowAllocation(
                        Number(inv.balance),
                        watchedAmount,
                        allocationMap,
                        inv.id,
                      );
                      return (
                        <Space size={4}>
                          <InputNumber
                            size="small"
                            min={0}
                            max={maxAllowable}
                            precision={2}
                            style={{ width: 120 }}
                            value={allocationMap[inv.id] || 0}
                            onChange={(val) => {
                              if (watchedAmount <= 0 && (Number(val) || 0) > 0) {
                                message.warning('Enter Receipt Amount first, or click "Settle All Open Invoices".');
                                return;
                              }
                              const clamped = Math.min(Math.max(0, Number(val) || 0), maxAllowable);
                              const rounded = Math.round(clamped * 100) / 100;
                              setAllocationMap((prev) => ({
                                ...prev,
                                [inv.id]: rounded,
                              }));
                              if (rounded > 0) {
                                maybePrefillSocAndPoFromInvoice(inv);
                              }
                            }}
                          />
                          <Button
                            size="small"
                            onClick={() => {
                              if (watchedAmount <= 0) {
                                message.warning('Enter Receipt Amount first, or click "Settle All Open Invoices".');
                                return;
                              }
                              setAllocationMap((prev) => ({
                                ...prev,
                                [inv.id]: maxAllowable,
                              }));
                              if (maxAllowable > 0) {
                                maybePrefillSocAndPoFromInvoice(inv);
                              }
                            }}
                          >
                            Full
                          </Button>
                        </Space>
                      );
                    },
                  },
                ]}
              />
            )}

            {/* Live Allocation Math Footer */}
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 10,
                backgroundColor: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <span>
                Receipt Amount: <strong>Rs {formatDecimal(watchedAmount)}</strong>
              </span>
              <span>
                Allocated to Invoices:{' '}
                <strong style={{ color: allocExceedsReceiptInForm ? token.colorError : '#16a34a' }}>
                  Rs {formatDecimal(totalAllocatedInForm)}
                </strong>
              </span>
              <span>
                Excess Unallocated Advance:{' '}
                <strong style={{ color: '#0284c7' }}>Rs {formatDecimal(excessAdvanceInForm)}</strong>
              </span>
            </div>
          </Card>
        </Form>
      </DraggableResizableModal>

      {/* Pre-Post Confirmation Card Modal */}
      <Modal
        open={Boolean(prePostConfirm)}
        zIndex={2600}
        centered
        width={640}
        destroyOnClose
        onCancel={() => {
          if (!submitting) setPrePostConfirm(null);
        }}
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#10b981', fontSize: 18 }} />
            <span style={{ fontWeight: 700 }}>Confirm &amp; Post Receipt Voucher</span>
          </Space>
        }
        footer={[
          <Button key="cancel" onClick={() => setPrePostConfirm(null)} disabled={submitting}>
            Cancel
          </Button>,
          <Button
            key="confirm"
            type="primary"
            loading={submitting}
            onClick={() => void handleConfirmAndPostReceipt()}
          >
            Confirm &amp; Post Voucher
          </Button>,
        ]}
      >
        {prePostConfirm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
            <div style={{ fontSize: 13.5, color: token.colorTextSecondary }}>
              Please verify the payment voucher summary below before posting to Customer Ledger and General Ledger.
            </div>

            <div
              style={{
                backgroundColor: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 10,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                  gap: '10px 16px',
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: token.colorTextTertiary }}>
                    Customer
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                    {prePostConfirm.customerCode && (
                      <Tag color="blue" style={{ width: 'fit-content', margin: 0, fontFamily: 'monospace', fontWeight: 700 }}>
                        {prePostConfirm.customerCode}
                      </Tag>
                    )}
                    <strong style={{ color: token.colorText }}>{prePostConfirm.customerName}</strong>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: token.colorTextTertiary }}>
                    Division
                  </div>
                  <div style={{ fontWeight: 700, color: token.colorText, marginTop: 2 }}>
                    {prePostConfirm.divisionName}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: token.colorTextTertiary }}>
                    Receipt Date
                  </div>
                  <div style={{ fontWeight: 700, color: token.colorText, marginTop: 2 }}>
                    {prePostConfirm.receiptDate}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: token.colorTextTertiary }}>
                    Payment Mode
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <Tag color="cyan" style={{ margin: 0, fontWeight: 700 }}>
                      {prePostConfirm.paymentModeLabel}
                    </Tag>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: token.colorTextTertiary }}>
                    Deposit Account (GL)
                  </div>
                  <div style={{ fontWeight: 600, color: token.colorText, marginTop: 2 }}>
                    {prePostConfirm.depositAccountLabel}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: token.colorTextTertiary }}>
                    Receipt Type
                  </div>
                  <div style={{ fontWeight: 600, color: token.colorText, marginTop: 2 }}>
                    {prePostConfirm.receiptTypeLabel}
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderTop: `1px solid ${token.colorBorderSecondary}`,
                  paddingTop: 10,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: token.colorTextTertiary }}>
                    Receipt Amount
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: token.colorText }}>
                    Rs {formatDecimal(prePostConfirm.amount)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: token.colorTextTertiary }}>
                    Allocated Invoices
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#16a34a' }}>
                    Rs {formatDecimal(prePostConfirm.allocatedTotal)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: token.colorTextTertiary }}>
                    Unadjusted Advance
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0284c7' }}>
                    Rs {formatDecimal(prePostConfirm.unallocatedAdvance)}
                  </div>
                </div>
              </div>
            </div>

            {prePostConfirm.allocatedInvoices.length > 0 ? (
              <Table
                rowKey="invoiceNo"
                size="small"
                pagination={false}
                dataSource={prePostConfirm.allocatedInvoices}
                columns={[
                  {
                    title: 'Allocated Invoice #',
                    dataIndex: 'invoiceNo',
                    render: (v: string) => <strong style={{ fontFamily: 'monospace' }}>{v}</strong>,
                  },
                  {
                    title: 'Allocated Amount',
                    dataIndex: 'allocatedAmount',
                    align: 'right',
                    render: (v: number) => <strong style={{ color: '#16a34a' }}>Rs {formatDecimal(v)}</strong>,
                  },
                  {
                    title: 'Remaining Balance',
                    dataIndex: 'remainingAfter',
                    align: 'right',
                    render: (v: number) => `Rs ${formatDecimal(v)}`,
                  },
                ]}
              />
            ) : (
              <Alert
                type="info"
                showIcon
                message={`No open invoices allocated — full Rs ${formatDecimal(prePostConfirm.unallocatedAdvance)} will be posted as Unadjusted Customer Advance.`}
              />
            )}
          </div>
        )}
      </Modal>

      {/* Adjust Advance Modal */}
      <Modal
        title={
          <Space>
            <SwapOutlined style={{ color: '#0284c7' }} />
            <span>Adjust Unallocated Advance Against Open Invoices</span>
          </Space>
        }
        open={advanceModalOpen}
        onCancel={() => setAdvanceModalOpen(false)}
        width={780}
        okText="Apply Advance Adjustment"
        confirmLoading={advSubmitting}
        onOk={() => void handleSubmitAdvanceAdjustment()}
        destroyOnClose
      >
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col xs={24} md={12}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Customer</div>
            <Select
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              placeholder="Select customer..."
              value={advCustomerId}
              onChange={(v) => void handleLoadAdvCustomer(v)}
              options={customers.map((c) => ({
                value: c.id,
                label: `${c.customerCode ? `[${c.customerCode}] ` : ''}${c.name}`,
              }))}
            />
          </Col>
          <Col xs={12} md={6}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Specific Advance Voucher</div>
            <Select
              allowClear
              placeholder="Auto FIFO (All Advances)"
              style={{ width: '100%' }}
              value={advReceiptId}
              onChange={(v) => setAdvReceiptId(v)}
              options={(advOpenData?.availableAdvances || []).map((a: any) => ({
                value: a.id,
                label: `${a.receiptNumber} (Rs ${formatDecimal(a.unallocatedAdvanceAmount)})`,
              }))}
            />
          </Col>
          <Col xs={12} md={6}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Adjustment Date</div>
            <DatePicker
              style={{ width: '100%' }}
              value={advDate}
              onChange={(v) => setAdvDate(v)}
              format="YYYY-MM-DD"
            />
          </Col>
        </Row>

        {advCustomerId && (
          <Alert
            type={selectedAdvanceAvailable > 0 ? 'info' : 'warning'}
            showIcon
            style={{ marginBottom: 12 }}
            message={
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <span>
                  Available Unallocated Advance: <strong>Rs {formatDecimal(selectedAdvanceAvailable)}</strong> | Adjusting
                  Now: <strong style={{ color: '#0284c7' }}>Rs {formatDecimal(totalAdvApplying)}</strong>
                </span>
                <Button size="small" onClick={handleAutoAllocateAdvance} disabled={selectedAdvanceAvailable <= 0}>
                  Auto-Apply FIFO
                </Button>
              </Space>
            }
          />
        )}

        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={advOpenData?.openInvoices || []}
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
              title: 'Apply Advance (Rs)',
              width: 185,
              render: (_, inv: any) => (
                <Space size={4}>
                  <InputNumber
                    size="small"
                    min={0}
                    max={Number(inv.balance)}
                    precision={2}
                    style={{ width: 115 }}
                    value={advAllocMap[inv.id] || 0}
                    onChange={(val) => setAdvAllocMap((p) => ({ ...p, [inv.id]: Number(val) || 0 }))}
                  />
                  <Button
                    size="small"
                    onClick={() =>
                      setAdvAllocMap((p) => ({
                        ...p,
                        [inv.id]: Math.min(Number(inv.balance), Math.max(0, selectedAdvanceAvailable - totalAdvApplying + (p[inv.id] || 0))),
                      }))
                    }
                  >
                    Max
                  </Button>
                </Space>
              ),
            },
          ]}
        />

        <Input
          style={{ marginTop: 12 }}
          placeholder="Adjustment remarks (optional)"
          value={advNotes}
          onChange={(e) => setAdvNotes(e.target.value)}
        />
      </Modal>

      {/* Receipt Voucher Detail Modal */}
      <Modal
        title={
          <Space>
            <WalletOutlined style={{ color: '#10b981' }} />
            <span style={{ whiteSpace: 'nowrap' }}>
              Payment Receipt Voucher —{' '}
              <span style={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                {detailReceipt?.receiptNumber}
              </span>
            </span>
          </Space>
        }
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        centered
        width={780}
        style={{ maxWidth: 'calc(100vw - 24px)' }}
        footer={[
          <Button key="close" onClick={() => setDetailModalOpen(false)}>
            Close
          </Button>,
          detailReceipt?.customerId ? (
            <Button
              key="ledger"
              icon={<AuditOutlined />}
              onClick={() => {
                const targetCustomerId = detailReceipt.customerId;
                setDetailModalOpen(false);
                openCustomerLedger(targetCustomerId);
              }}
            >
              Open Customer Ledger
            </Button>
          ) : null,
          <Button
            key="print"
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => detailReceipt && printPaymentReceiptVoucher(detailReceipt)}
          >
            Print Official Receipt Voucher
          </Button>,
        ].filter(Boolean)}
      >
        {detailReceipt && (
          <div>
            <Descriptions
              bordered
              size="small"
              column={{ xs: 1, sm: 2 }}
              labelStyle={{ whiteSpace: 'nowrap', width: 155, fontWeight: 600 }}
              contentStyle={{ minWidth: 185 }}
              style={{ marginBottom: 14 }}
            >
              <Descriptions.Item label="Voucher #">
                <strong
                  style={{
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {detailReceipt.receiptNumber}
                </strong>
              </Descriptions.Item>
              <Descriptions.Item label="Receipt Date">
                <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {detailReceipt.receiptDate}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Customer">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                  {detailReceipt.customerCode && (
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: 11,
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        padding: '1px 7px',
                        borderRadius: 5,
                        backgroundColor: token.colorFillAlter,
                        border: `1px solid ${token.colorBorder}`,
                        color: token.colorPrimary,
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {detailReceipt.customerCode}
                    </span>
                  )}
                  <strong style={{ color: token.colorText, lineHeight: 1.3 }}>
                    {detailReceipt.customerName}
                  </strong>
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Division">
                <span style={{ whiteSpace: 'nowrap' }}>{detailReceipt.divisionName || 'All Divisions'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Payment Mode">
                <Tag color="cyan" style={{ margin: 0, whiteSpace: 'nowrap', fontWeight: 700 }}>
                  {String(detailReceipt.paymentMode || '').replace(/_/g, ' ')}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Clearance">
                <Tag
                  color={
                    detailReceipt.clearanceStatus === 'BOUNCED'
                      ? 'red'
                      : detailReceipt.clearanceStatus === 'PENDING_CLEARANCE'
                      ? 'gold'
                      : 'green'
                  }
                  style={{ margin: 0, whiteSpace: 'nowrap', fontWeight: 700 }}
                >
                  {String(detailReceipt.clearanceStatus || 'CLEARED').replace(/_/g, ' ')}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Deposit Account">
                <span style={{ whiteSpace: 'nowrap' }}>
                  {detailReceipt.bankAccountName || detailReceipt.bankName || 'Cash / Bank'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="GL Journal #">
                <span
                  style={{
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                  }}
                >
                  {detailReceipt.journalNumber || 'Auto-Posted'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Total Amount">
                <strong
                  style={{
                    color: '#16a34a',
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  Rs {formatDecimal(detailReceipt.amount)}
                </strong>
              </Descriptions.Item>
              <Descriptions.Item label="Unallocated Advance">
                <strong
                  style={{
                    color: '#0284c7',
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  Rs {formatDecimal(detailReceipt.unallocatedAdvanceAmount)}
                </strong>
              </Descriptions.Item>
            </Descriptions>

            <Table
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 560 }}
              dataSource={detailReceipt.allocations || []}
              locale={{ emptyText: 'Recorded as Advance / On-Account Receipt (no invoices settled yet)' }}
              columns={[
                {
                  title: 'Invoice #',
                  dataIndex: 'invoiceNo',
                  render: (v) => (
                    <strong
                      style={{
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {v}
                    </strong>
                  ),
                },
                {
                  title: 'Allocation Date',
                  dataIndex: 'allocationDate',
                  render: (v) => (
                    <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  ),
                },
                {
                  title: 'Type',
                  dataIndex: 'allocationType',
                  render: (v) => (
                    <Tag style={{ margin: 0, whiteSpace: 'nowrap' }}>
                      {String(v || 'DIRECT').replace(/_/g, ' ')}
                    </Tag>
                  ),
                },
                {
                  title: 'Settled Amount',
                  dataIndex: 'allocatedAmount',
                  align: 'right',
                  render: (v) => (
                    <strong
                      style={{
                        color: '#16a34a',
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      Rs {formatDecimal(v)}
                    </strong>
                  ),
                },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  render: (v) => (
                    <span style={{ whiteSpace: 'nowrap' }}>
                      <Badge status={v === 'REVERSED' ? 'error' : 'success'} text={v} />
                    </span>
                  ),
                },
              ]}
            />
          </div>
        )}
      </Modal>

      {/* Cheque Bounce Reversal Modal */}
      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#dc2626' }} />
            <span>Cheque Bounce Reversal — {bounceTarget?.receiptNumber}</span>
          </Space>
        }
        open={Boolean(bounceTarget)}
        onCancel={() => setBounceTarget(null)}
        confirmLoading={bounceLoading}
        okButtonProps={{ danger: true }}
        okText="Confirm Bounce & Reverse Ledger"
        onOk={() => void handleConfirmBounce()}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Reversing a bounced cheque restores unpaid balances on all settled invoices, voids any unallocated advance, posts a Debit Note to Customer Ledger, and creates a reversing GL journal."
        />
        <Input.TextArea
          rows={3}
          placeholder="Enter cheque return / dishonor reason (e.g. Insufficient Funds, Signature Mismatch)..."
          value={bounceReason}
          onChange={(e) => setBounceReason(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default CustomerPayments;
