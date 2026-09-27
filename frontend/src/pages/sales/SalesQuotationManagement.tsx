import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Form, Input, Select, App,
  InputNumber, Row, Col, Descriptions, Divider, Tooltip,
  Tag, Card, Statistic, Space, Alert, Modal, Badge,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, EyeOutlined, SendOutlined,
  CheckOutlined, StopOutlined, CloseOutlined, ReloadOutlined, FileExcelOutlined,
  PrinterOutlined, FilterOutlined, CloseCircleOutlined, UserOutlined,
  CalendarOutlined, FileTextOutlined, DollarOutlined,
  HistoryOutlined, ShoppingCartOutlined, SaveOutlined, ClearOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { ERPLineItems, ERPLine, DraggableResizableModal, SaveResultDialog } from '../../components/shared';
import type { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import { TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import './SalesInvoiceManagement.css';
import { printQuotationDocument } from '../../utils/printTemplates';

dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

interface RelatedSalesOrder {
  id: string;
  orderNumber: string;
  orderDate?: string;
  status: string;
  totalAmount?: number;
}

interface SalesQuotation {
  id: string;
  quotationNumber: string;
  customerId: string;
  customerName?: string;
  companyName?: string;
  quotationDate: string;
  validUntil: string;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  status: string;
  items?: any[];
  relatedSalesOrder?: RelatedSalesOrder | null;
}

interface CustomerOption {
  id: string;
  name: string;
  companyName?: string;
  customerCode?: string;
  customerType?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  currencyCode?: string;
  paymentTerms?: string;
  creditDays?: number;
  creditLimit?: number;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  taxNumber?: string;
}

interface CustomerSummary {
  customerId: string;
  totalQuotations: number;
  draftCount: number;
  sentCount: number;
  acceptedCount: number;
  rejectedCount: number;
  cancelledCount: number;
  convertedCount: number;
  expiredCount: number;
  totalQuotedValue: number;
  totalConvertedValue: number;
}

const STATUS_OPTIONS = [
  'All statuses',
  'Draft',
  'Sent',
  'Accepted',
  'Converted',
  'Expired',
  'Rejected',
  'Cancelled',
];

export function buildSalesQuotationPayload(values: any, lineItems: ERPLine[]): any {
  return {
    ...values,
    items: lineItems.map((l) => ({
      itemId: l.itemId,
      description: l.itemName,
      quantity: l.quantity,
      uomId: l.uomId,
      unitPrice: l.rate,
      discountPercent: l.discountPercent || 0,
      taxAmount: ((l.quantity * l.rate * (1 - (l.discountPercent || 0) / 100)) * (l.taxPercent || 0)) / 100,
      lineTotal: l.lineTotal,
    })),
  };
}

const SalesQuotationManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const [data, setData] = useState<SalesQuotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Chevron Process filter state
  const [activeChevron, setActiveChevron] = useState<string>('ALL');

  // Filter States
  const [filterCurrency, setFilterCurrency] = useState<string | undefined>(undefined);
  const [filterCustomer, setFilterCustomer] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterDateFrom, setFilterDateFrom] = useState<string | undefined>(undefined);
  const [filterDateTo, setFilterDateTo] = useState<string | undefined>(undefined);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [search, setSearch] = useState('');

  const activeFilterCount = useMemo(
    () => [filterCurrency, filterCustomer, filterStatus, filterDateFrom, filterDateTo].filter(Boolean).length,
    [filterCurrency, filterCustomer, filterStatus, filterDateFrom, filterDateTo],
  );

  // Modals & Drawers
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<SalesQuotation | null>(null);
  const [editingItem, setEditingItem] = useState<SalesQuotation | null>(null);

  // Save confirmation & SaveResultDialog states
  const [confirmQuotationVisible, setConfirmQuotationVisible] = useState(false);
  const [pendingQuotationValues, setPendingQuotationValues] = useState<any>(null);
  const [saveResultOpen, setSaveResultOpen] = useState(false);
  const [saveResultPhase, setSaveResultPhase] = useState<SaveResultPhase>('loading');
  const [saveResultData, setSaveResultData] = useState<SaveResultData | null>(null);
  const [saveResultError, setSaveResultError] = useState<string | undefined>(undefined);
  const [saveResultSuccessTitle, setSaveResultSuccessTitle] = useState<string>('Successful');
  const [saveResultRetry, setSaveResultRetry] = useState<(() => void) | undefined>(undefined);
  const [form] = Form.useForm();
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerMeta, setSelectedCustomerMeta] = useState<CustomerOption | null>(null);

  // Print Modal
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printQuotation, setPrintQuotation] = useState<SalesQuotation | null>(null);

  // Customer Quotation Summary Modal
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);
  const [summaryCustomer, setSummaryCustomer] = useState<CustomerOption | null>(null);
  const [summaryData, setSummaryData] = useState<CustomerSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try {
        const p = JSON.parse(erpUser);
        if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId);
      } catch {
        /* ignore */
      }
    }
    (async () => {
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
                customerType: cust.customerType || 'B2B',
                contactPerson: cust.contactPerson,
                phone: cust.phone,
                email: cust.email,
                currencyCode: cust.currencyCode || 'PKR',
                paymentTerms: cust.paymentTerms || 'Net 30',
                creditDays: cust.creditDays || 30,
                creditLimit: cust.creditLimit || 0,
                addressLine1: cust.billingAddress || cust.addressLine1,
                addressLine2: cust.addressLine2,
                city: cust.city,
                taxNumber: cust.taxNumber,
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
                customerType: cust.customerType || 'B2B',
                contactPerson: cust.contactPerson,
                phone: cust.phone,
                email: cust.email,
                currencyCode: cust.currencyCode || 'PKR',
                paymentTerms: cust.paymentTerms || 'Net 30',
                creditDays: cust.creditDays || 30,
                creditLimit: cust.creditLimit || 0,
                addressLine1: cust.addressLine1,
                addressLine2: cust.addressLine2,
                city: cust.city,
                taxNumber: cust.taxNumber,
              });
            }
          });
        } catch { /* ignore */ }

        setCustomers(Array.from(combinedMap.values()));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const fetchData = useCallback(
    async (pageNum: number = 1, currentLimit: number = pageSize) => {
      setLoading(true);
      try {
        const params: any = { page: pageNum, limit: currentLimit };
        if (search) params.search = search;
        if (filterCustomer) params.customerId = filterCustomer;
        if (filterStatus && filterStatus !== 'All statuses') params.status = filterStatus;
        const response = await apiService.get<{ data: SalesQuotation[]; total: number }>('/sales/quotations', params);
        setData(response.data || []);
        setTotal(response.total || 0);
      } catch {
        message.error('Failed to fetch quotations');
      } finally {
        setLoading(false);
      }
    },
    [search, filterCustomer, filterStatus, pageSize, message],
  );

  useEffect(() => {
    fetchData(page, pageSize);
  }, [page, pageSize, fetchData]);

  // Global header tab refresh
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).includes('quotation')) {
        void fetchData(page, pageSize);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
  }, [fetchData, page, pageSize]);

  // Status helper: Check if quotation is expired
  const isQuotationExpired = useCallback((q: SalesQuotation): boolean => {
    if (['converted', 'cancelled', 'rejected'].includes((q.status || '').toLowerCase())) {
      return false;
    }
    if ((q.status || '').toLowerCase() === 'expired') return true;
    if (q.validUntil && dayjs(q.validUntil).isBefore(dayjs(), 'day')) {
      return true;
    }
    return false;
  }, []);

  // Chevron status counts
  const chevronCounts = useMemo(() => {
    const today = dayjs();
    let draft = 0;
    let sent = 0;
    let accepted = 0;
    let converted = 0;
    let expired = 0;
    let cancelled = 0;

    data.forEach((d) => {
      const s = (d.status || '').toLowerCase();
      if (s === 'converted') {
        converted++;
      } else if (s === 'cancelled' || s === 'rejected') {
        cancelled++;
      } else if (d.validUntil && dayjs(d.validUntil).isBefore(today, 'day')) {
        expired++;
      } else if (s === 'accepted') {
        accepted++;
      } else if (s === 'sent') {
        sent++;
      } else if (s === 'draft') {
        draft++;
      }
    });

    return {
      all: total || data.length,
      draft,
      sent,
      accepted,
      converted,
      expired,
      cancelled,
    };
  }, [data, total]);

  // Available currencies
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>(['PKR', 'USD', 'EUR', 'GBP']);
    data.forEach((d) => {
      if (d.currency) set.add(d.currency);
    });
    return Array.from(set);
  }, [data]);

  // Client-side filtering
  const displayedQuotations = useMemo(() => {
    return data.filter((d) => {
      const s = (d.status || '').toLowerCase();
      const expired = isQuotationExpired(d);

      // Chevron filter
      if (activeChevron === 'DRAFT' && s !== 'draft') return false;
      if (activeChevron === 'SENT' && s !== 'sent') return false;
      if (activeChevron === 'ACCEPTED' && s !== 'accepted') return false;
      if (activeChevron === 'CONVERTED' && s !== 'converted') return false;
      if (activeChevron === 'EXPIRED' && !expired) return false;
      if (activeChevron === 'CANCELLED' && !['rejected', 'cancelled'].includes(s)) return false;

      // Currency filter
      if (filterCurrency && d.currency?.toUpperCase() !== filterCurrency.toUpperCase()) return false;

      // Customer filter
      if (filterCustomer && d.customerId !== filterCustomer) return false;

      // Status filter
      if (filterStatus && filterStatus !== 'All statuses') {
        if (filterStatus === 'Expired' && !expired) return false;
        if (filterStatus !== 'Expired' && s !== filterStatus.toLowerCase()) return false;
      }

      // Date Range filter
      if (filterDateFrom && d.quotationDate && dayjs(d.quotationDate).isBefore(dayjs(filterDateFrom), 'day')) return false;
      if (filterDateTo && d.quotationDate && dayjs(d.quotationDate).isAfter(dayjs(filterDateTo), 'day')) return false;

      return true;
    });
  }, [data, activeChevron, filterCurrency, filterCustomer, filterStatus, filterDateFrom, filterDateTo, isQuotationExpired]);

  // Clear all filters handler
  const handleClearAll = () => {
    setActiveChevron('ALL');
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
    if (displayedQuotations.length === 0) {
      message.warning('No quotation records to export');
      return;
    }
    const headers = [
      'Quotation #',
      'Customer Code',
      'Customer Name',
      'Date',
      'Valid Until',
      'Currency',
      'Subtotal',
      'Discount',
      'Tax',
      'Total Amount',
      'Status',
      'Related Sales Order',
    ];
    const rows = displayedQuotations.map((q) => {
      const cust = customers.find((c) => c.id === q.customerId);
      const custCode = cust?.customerCode || '';
      const custName = cust?.companyName || cust?.name || q.companyName || q.customerName || q.customerId;
      const soNum = q.relatedSalesOrder?.orderNumber || '';
      return [
        `"${q.quotationNumber}"`,
        `"${custCode}"`,
        `"${custName}"`,
        `"${q.quotationDate || ''}"`,
        `"${q.validUntil || ''}"`,
        `"${q.currency || 'PKR'}"`,
        q.subtotal || 0,
        q.discountAmount || 0,
        q.taxAmount || 0,
        q.totalAmount || 0,
        `"${q.status}"`,
        `"${soNum}"`,
      ];
    });
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `quotations_export_${dayjs().format('YYYYMMDD_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Quotations exported to CSV');
  }, [displayedQuotations, customers, message]);

  // Open Full Commercial Quotation Print Preview
  const handleOpenPrintPreview = useCallback(
    (record?: SalesQuotation) => {
      const target = record || detailItem || displayedQuotations[0];
      if (!target) {
        message.warning('Select a quotation to print');
        return;
      }
      setPrintQuotation(target);
      setPrintModalVisible(true);
    },
    [detailItem, displayedQuotations, message],
  );

  const handleCreate = useCallback(() => {
    setEditingItem(null);
    form.resetFields();
    setSelectedCustomerMeta(null);
    form.setFieldsValue({
      currency: 'PKR',
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
      quotationDate: dayjs().format('YYYY-MM-DD'),
      validUntil: dayjs().add(30, 'day').format('YYYY-MM-DD'),
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
        key: 'new-quotation',
        node: (
          <Button className="btn-new-invoice" icon={<PlusOutlined />} onClick={handleCreate}>
            + New Quotation
          </Button>
        ),
      },
      {
        key: 'refresh',
        node: (
          <Button className="btn-inv-white" icon={<ReloadOutlined />} onClick={() => fetchData(page, pageSize)}>
            Refresh
          </Button>
        ),
      },
      {
        key: 'csv',
        node: (
          <Button className="btn-inv-white" icon={<FileExcelOutlined />} onClick={handleExportCsv}>
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
            onClick={() => handleOpenPrintPreview(detailItem || undefined)}
          >
            Print
          </Button>
        ),
      },
    ]);

    return () => {
      clearHeaderActions();
    };
  }, [page, pageSize, handleCreate, handleExportCsv, handleOpenPrintPreview, detailItem, fetchData]);

  const handleCustomerChange = (custId: string) => {
    const cust = customers.find((c) => c.id === custId);
    if (cust) {
      setSelectedCustomerMeta(cust);
      form.setFieldsValue({
        currency: cust.currencyCode || 'PKR',
      });
    } else {
      setSelectedCustomerMeta(null);
    }
  };

  const handleEdit = (record: SalesQuotation) => {
    setEditingItem(record);
    const cust = customers.find((c) => c.id === record.customerId);
    setSelectedCustomerMeta(cust || null);
    form.setFieldsValue({
      customerId: record.customerId,
      quotationDate: record.quotationDate ? dayjs(record.quotationDate).format('YYYY-MM-DD') : undefined,
      validUntil: record.validUntil ? dayjs(record.validUntil).format('YYYY-MM-DD') : undefined,
      currency: record.currency || 'PKR',
      notes: record.notes,
      subtotal: record.subtotal,
      discountAmount: record.discountAmount,
      taxAmount: record.taxAmount,
      totalAmount: record.totalAmount,
    });
    setModalVisible(true);
  };

  const handleViewDetail = async (record: SalesQuotation) => {
    try {
      const response = await apiService.get<any>(`/sales/quotations/${record.id}`);
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
        message.warning('Add at least one line item to the quotation');
        return;
      }
      setPendingQuotationValues(values);
      setConfirmQuotationVisible(true);
    } catch {
      // Form highlights validation errors
    }
  };

  const executeQuotationSave = async (values: any) => {
    setConfirmQuotationVisible(false);
    setSaveResultOpen(true);
    setSaveResultPhase('loading');
    setSaveResultError(undefined);

    const isEdit = Boolean(editingItem);
    const customerObj = customers.find(c => c.id === values.customerId);
    const custName = customerObj?.companyName || customerObj?.name || 'Customer';

    try {
      const payload = buildSalesQuotationPayload(values, lineItems);
      let res: any;
      if (isEdit && editingItem) {
        res = await apiService.patch(`/sales/quotations/${editingItem.id}`, payload);
      } else {
        res = await apiService.post('/sales/quotations', payload);
      }
      const saved = res?.data || res || {};
      const qNum = saved.quotationNumber || editingItem?.quotationNumber || 'QT-RECORDED';
      setSaveResultPhase('success');
      setSaveResultSuccessTitle(isEdit ? 'Quotation Updated Successfully' : 'Quotation Created Successfully');
      setSaveResultData({
        title: isEdit ? 'Quotation Updated Successfully' : 'Quotation Created Successfully',
        message: `Quotation ${qNum} for "${custName}" has been successfully saved.`,
        recordType: 'Quotation Number',
        recordCode: qNum,
        recordName: custName,
        tags: [
          { label: `${lineItems.length} line item(s)`, color: 'blue' },
          { label: isEdit ? 'UPDATED' : 'DRAFT', color: 'green' },
        ],
      });
      setModalVisible(false);
      fetchData(page, pageSize);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message || (error as any)?.message || 'Failed to save quotation';
      setSaveResultPhase('error');
      setSaveResultError(Array.isArray(msg) ? msg.join(', ') : msg);
      setSaveResultRetry(() => () => executeQuotationSave(values));
    }
  };

  const handleAction = async (id: string, action: string) => {
    setSaveResultOpen(true);
    setSaveResultPhase('loading');
    setSaveResultError(undefined);

    try {
      await apiService.patch(`/sales/quotations/${id}/${action}`);
      setSaveResultPhase('success');
      setSaveResultSuccessTitle(`Quotation ${action.toUpperCase()} Successfully`);
      setSaveResultData({
        title: `Quotation ${action.toUpperCase()} Successfully`,
        message: `Quotation workflow state updated to "${action}".`,
        recordType: 'Action',
        recordCode: action.toUpperCase(),
        tags: [{ label: action.toUpperCase(), color: 'green' }],
      });
      fetchData(page, pageSize);
      if (detailVisible && detailItem?.id === id) {
        const updated = await apiService.get<SalesQuotation>(`/sales/quotations/${id}`);
        setDetailItem(updated);
      }
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message || (error as any)?.message || `Failed to ${action} quotation`;
      setSaveResultPhase('error');
      setSaveResultError(Array.isArray(msg) ? msg.join(', ') : msg);
      setSaveResultRetry(() => () => handleAction(id, action));
    }
  };

  // Convert to Sales Order Workflow with strict Idempotency & Duplicate Protection
  const handleConvertToSalesOrder = (record: SalesQuotation) => {
    const cust = customers.find((c) => c.id === record.customerId);
    const custName = cust?.companyName || cust?.name || record.companyName || record.customerName || 'Customer';

    modal.confirm({
      title: 'Convert Quotation to Sales Order?',
      icon: <ShoppingCartOutlined style={{ color: '#10b981' }} />,
      content: (
        <div>
          <p>
            You are about to convert Quotation <strong>{record.quotationNumber}</strong> for <strong>{custName}</strong> into a formal Sales Order.
          </p>
          <div style={{ backgroundColor: '#f1f5f9', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}>
            <div><strong>Subtotal:</strong> {record.currency || 'PKR'} {formatDecimal(record.subtotal)}</div>
            <div><strong>Total Value:</strong> {record.currency || 'PKR'} {formatDecimal(record.totalAmount)}</div>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
              * Line items and agreed commercial pricing will be copied. Quotation will be marked as CONVERTED.
            </div>
          </div>
        </div>
      ),
      okText: 'Confirm & Convert',
      cancelText: 'Cancel',
      okButtonProps: { style: { backgroundColor: '#10b981', borderColor: '#10b981' } },
      onOk: async () => {
        try {
          const res = await apiService.post<{ success: boolean; data: any; isExisting: boolean; message: string }>(
            `/sales/quotations/${record.id}/convert-to-order`,
          );
          if (res.isExisting) {
            message.info(res.message || 'Quotation was already converted to a Sales Order.');
          } else {
            message.success(res.message || 'Sales Order created successfully!');
          }
          fetchData(page, pageSize);
          if (detailVisible && detailItem?.id === record.id) {
            const updated = await apiService.get<SalesQuotation>(`/sales/quotations/${record.id}`);
            setDetailItem(updated);
          }
        } catch (error) {
          const msg: any = (error as any)?.response?.data?.message;
          message.error(Array.isArray(msg) ? msg[0] : 'Failed to convert quotation to Sales Order');
        }
      },
    });
  };

  // Open Customer Quotation Summary (Customer 360 Quotation History)
  const handleOpenCustomerSummary = async (custId: string) => {
    const cust = customers.find((c) => c.id === custId);
    if (!cust) return;
    setSummaryCustomer(cust);
    setSummaryModalVisible(true);
    setSummaryLoading(true);
    try {
      const res = await apiService.get<{ success: boolean; data: CustomerSummary }>(
        `/sales/quotations/customer/${custId}/summary`,
      );
      setSummaryData(res.data);
    } catch {
      message.error('Failed to load customer quotation summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  // Pixel-Perfect Multi-line Columns mirroring Invoices Design
  const columns: ColumnsType<SalesQuotation> = [
    {
      title: 'Quotation',
      key: 'quotation',
      width: 250,
      render: (_, record) => {
        const cust = customers.find((c) => c.id === record.customerId);
        const custName = cust?.companyName || cust?.name || record.companyName || record.customerName || 'Customer';
        const isConverted = (record.status || '').toLowerCase() === 'converted';
        return (
          <div className="inv-doc-cell">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="inv-doc-code">{record.quotationNumber}</span>
              {isConverted && record.relatedSalesOrder && (
                <Tag color="purple" style={{ fontSize: 10, margin: 0, fontWeight: 700 }}>
                  SO: {record.relatedSalesOrder.orderNumber}
                </Tag>
              )}
            </div>
            <div className="inv-sub-row">
              <span className="badge-inv-type">
                <FileTextOutlined style={{ marginRight: 3 }} /> Quotation
              </span>
              <span className="inv-sub-val" style={{ textTransform: 'lowercase' }}>
                {record.currency || 'PKR'}
              </span>
            </div>
            <div className="inv-sub-row">
              <span className="badge-inv-customer">
                <UserOutlined style={{ marginRight: 3 }} /> Customer
              </span>
              <Tooltip title="Click to view Customer Quotation History">
                <span
                  className="inv-sub-val"
                  style={{ color: '#2563eb', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenCustomerSummary(record.customerId);
                  }}
                >
                  {custName}
                </span>
              </Tooltip>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Dates & Validity',
      key: 'dates',
      width: 180,
      render: (_, record) => {
        const expired = isQuotationExpired(record);
        return (
          <div className="inv-dates-cell">
            <div className="inv-date-row">
              <span className="badge-inv-date">
                <CalendarOutlined style={{ marginRight: 3 }} /> Date
              </span>
              <span className="inv-date-val">
                {record.quotationDate ? dayjs(record.quotationDate).format('MMM DD, YYYY') : '-'}
              </span>
            </div>
            {record.validUntil && (
              <div className="inv-date-row">
                <span className={`badge-inv-due ${expired ? 'badge-inv-balance' : ''}`}>
                  <CalendarOutlined style={{ marginRight: 3 }} /> Valid
                </span>
                <span className={`inv-date-val ${expired ? 'text-red-500' : ''}`} style={expired ? { color: '#dc2626', fontWeight: 600 } : {}}>
                  {dayjs(record.validUntil).format('MMM DD, YYYY')}
                  {expired && <span style={{ fontSize: 10, marginLeft: 4 }}>(Expired)</span>}
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Amounts',
      key: 'amounts',
      width: 200,
      render: (_, record) => (
        <div className="inv-amounts-cell">
          <div className="inv-amt-row">
            <span className="badge-inv-subtotal">Subtotal</span>
            <span className="inv-amt-val">{record.currency || 'Rs'} {formatDecimal(record.subtotal || 0)}</span>
          </div>
          {Number(record.discountAmount || 0) > 0 && (
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
      width: 140,
      align: 'center',
      render: (_, record) => {
        const s = (record.status || '').toLowerCase();
        const expired = isQuotationExpired(record);
        let cls = 'status-pending';
        let label = record.status;

        if (s === 'converted') {
          cls = 'status-converted';
          label = 'Converted';
        } else if (s === 'accepted') {
          cls = 'status-paid';
          label = 'Accepted';
        } else if (expired) {
          cls = 'status-expired';
          label = 'Expired';
        } else if (s === 'sent') {
          cls = 'status-partial';
          label = 'Sent';
        } else if (s === 'rejected' || s === 'cancelled') {
          cls = 'status-cancelled';
          label = s === 'rejected' ? 'Rejected' : 'Cancelled';
        }

        return <span className={`inv-status-pill ${cls}`}>{label}</span>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
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

            <Tooltip title="Print Commercial Quotation">
              <button className="inv-action-btn inv-btn-print" onClick={() => printQuotationDocument(record)}>
                <PrinterOutlined />
              </button>
            </Tooltip>

            {/* Convert to Sales Order for Accepted Quotations */}
            {s === 'accepted' && (
              <Tooltip title="Convert to Sales Order">
                <button
                  className="inv-action-btn inv-btn-convert"
                  onClick={() => handleConvertToSalesOrder(record)}
                >
                  <ShoppingCartOutlined />
                </button>
              </Tooltip>
            )}

            <Tooltip title="Edit Quotation">
              <button
                className="inv-action-btn inv-btn-edit"
                onClick={() => handleEdit(record)}
                disabled={s !== 'draft'}
              >
                <EditOutlined />
              </button>
            </Tooltip>

            {s === 'draft' && (
              <Tooltip title="Send to Customer">
                <button
                  className="inv-action-btn inv-btn-pay"
                  style={{ backgroundColor: '#3b82f6', color: '#fff' }}
                  onClick={() => handleAction(record.id, 'submit')}
                >
                  <SendOutlined />
                </button>
              </Tooltip>
            )}

            {s === 'sent' && (
              <Tooltip title="Accept Quotation">
                <button
                  className="inv-action-btn inv-btn-pay"
                  style={{ backgroundColor: '#10b981', color: '#fff' }}
                  onClick={() => handleAction(record.id, 'accept')}
                >
                  <CheckOutlined />
                </button>
              </Tooltip>
            )}

            {s === 'sent' && (
              <Tooltip title="Reject Quotation">
                <button className="inv-action-btn inv-btn-cancel" onClick={() => handleAction(record.id, 'reject')}>
                  <StopOutlined />
                </button>
              </Tooltip>
            )}

            {s !== 'cancelled' && s !== 'accepted' && s !== 'converted' && s !== 'rejected' && (
              <Tooltip title="Cancel Quotation">
                <button className="inv-action-btn inv-btn-delete" onClick={() => handleAction(record.id, 'cancel')}>
                  <CloseOutlined />
                </button>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  // Pagination calculation
  const totalEntries = total > 0 ? total : displayedQuotations.length;
  const startEntry = totalEntries === 0 ? 0 : (page - 1) * pageSize + 1;
  const endEntry = Math.min(page * pageSize, totalEntries);
  const totalPages = Math.ceil(totalEntries / pageSize) || 1;

  return (
    <div className="inv-page-container">
      {/* Main Card */}
      <div className="inv-main-card">
        {/* Card Header Title */}
        <div className="inv-card-header">
          <FileTextOutlined className="inv-card-header-icon" />
          <h2 className="inv-card-header-title">Sales Quotation Management</h2>
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
            className={`inv-chevron-item chev-partial ${activeChevron === 'SENT' ? 'active' : ''}`}
            onClick={() => setActiveChevron('SENT')}
          >
            SENT ({chevronCounts.sent})
          </div>
          <div
            className={`inv-chevron-item chev-paid ${activeChevron === 'ACCEPTED' ? 'active' : ''}`}
            onClick={() => setActiveChevron('ACCEPTED')}
          >
            ACCEPTED ({chevronCounts.accepted})
          </div>
          <div
            className={`inv-chevron-item chev-paid ${activeChevron === 'CONVERTED' ? 'active' : ''}`}
            style={{ backgroundColor: activeChevron === 'CONVERTED' ? '#6366f1' : undefined }}
            onClick={() => setActiveChevron('CONVERTED')}
          >
            CONVERTED ({chevronCounts.converted})
          </div>
          <div
            className={`inv-chevron-item chev-pending ${activeChevron === 'EXPIRED' ? 'active' : ''}`}
            style={{ backgroundColor: activeChevron === 'EXPIRED' ? '#78716c' : undefined }}
            onClick={() => setActiveChevron('EXPIRED')}
          >
            EXPIRED ({chevronCounts.expired})
          </div>
          <div
            className={`inv-chevron-item chev-cancelled ${activeChevron === 'CANCELLED' ? 'active' : ''}`}
            onClick={() => setActiveChevron('CANCELLED')}
          >
            CANCELLED / REJECTED ({chevronCounts.cancelled})
          </div>
        </div>

        {/* Distinctive Mint Green Accent Line */}
        <div className="inv-mint-accent-line" />

        {/* 5 Filters Grid */}
        {/* Controls Row: Search Bar & Unified Filters Button & Show Entries */}
        <div className="inv-controls-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="inv-search-control" style={{ flex: '1 1 240px', maxWidth: 360 }}>
            <Input
              className="inv-search-input"
              placeholder="Search quotations, customer..."
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
            onClick={() => setShowFilters((prev) => !prev)}
            type={showFilters ? 'primary' : 'default'}
            style={{ fontWeight: 600 }}
          >
            Filters
            {activeFilterCount > 0 && (
              <Badge
                count={activeFilterCount}
                style={{
                  marginLeft: 6,
                  backgroundColor: showFilters ? '#ffffff' : 'var(--theme-primary, #3b82f6)',
                  color: showFilters ? 'var(--theme-primary, #3b82f6)' : '#ffffff',
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
              onChange={(val) => {
                setPageSize(val);
                setPage(1);
              }}
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
        {showFilters && (
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
                  Filter Quotations
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
                onClick={() => setShowFilters(false)}
                style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 12 }}
                title="Close Filters"
              >
                Close
              </Button>
            </div>

            {/* Grid of the 5 Filter Boxes */}
            <div className="inv-filter-boxes-grid">
              {/* Box 1: CURRENCY */}
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
                  {availableCurrencies.map((c) => (
                    <Select.Option key={c} value={c}>
                      {c}
                    </Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 2: CUSTOMER */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span><UserOutlined /> CUSTOMER</span>
                  {filterCustomer && (
                    <span
                      style={{ fontSize: 11, color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => handleOpenCustomerSummary(filterCustomer)}
                    >
                      View History
                    </span>
                  )}
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
                  {customers.map((c) => (
                    <Select.Option key={c.id} value={c.id}>
                      {c.customerCode ? `[${c.customerCode}] ` : ''}{c.companyName || c.name}
                    </Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 3: STATUS */}
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
                  {STATUS_OPTIONS.map((s) => (
                    <Select.Option key={s} value={s}>
                      {s}
                    </Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 4: DATE FROM */}
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

              {/* Box 5: DATE TO */}
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

            {/* Footer with Clear Filters and Close inside */}
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
                <Button onClick={() => setShowFilters(false)}>
                  Close
                </Button>
                <Button
                  type="primary"
                  icon={<FilterOutlined />}
                  onClick={() => {
                    fetchData(1, pageSize);
                    setShowFilters(false);
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
          dataSource={displayedQuotations}
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
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <span className="inv-page-indicator">
              Page {page} of {totalPages}
            </span>
            <button
              className="inv-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Create / Edit Quotation Modal */}
      <DraggableResizableModal
        title={editingItem ? `Edit Quotation: ${editingItem.quotationNumber}` : 'Create Commercial Sales Quotation'}
        open={modalVisible}
        onOk={handleSubmitForm}
        onCancel={() => setModalVisible(false)}
        width={1040}
      >
        <Form form={form} layout="vertical">
          <Alert
            message="Commercial Transaction Policy"
            description="Sales Quotation is an authoritative commercial offer. It connects to Finished Goods availability but does NOT deduct stock or post accounting receivables until converted to a Sales Order."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="customerId"
                label="Customer (Master Data)"
                rules={[{ required: true, message: 'Please select customer' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select customer from Master"
                  onChange={handleCustomerChange}
                  options={customers.map((c) => ({
                    value: c.id,
                    label: `${c.customerCode ? `[${c.customerCode}] ` : ''}${c.companyName || c.name}${c.phone ? ` (${c.phone})` : ''}`,
                  }))}
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

          {/* Customer Master Details Box */}
          {selectedCustomerMeta && (
            <div
              style={{
                backgroundColor: 'rgba(37, 99, 235, 0.04)',
                border: '1px solid rgba(37, 99, 235, 0.15)',
                padding: '10px 14px',
                borderRadius: 6,
                marginBottom: 16,
                fontSize: 12,
              }}
            >
              <Row gutter={16}>
                <Col span={6}>
                  <span style={{ color: '#64748b' }}>Customer Code:</span>{' '}
                  <strong style={{ color: '#2563eb' }}>{selectedCustomerMeta.customerCode || 'N/A'}</strong>
                </Col>
                <Col span={6}>
                  <span style={{ color: '#64748b' }}>Contact Person:</span>{' '}
                  <strong>{selectedCustomerMeta.contactPerson || '-'}</strong>
                </Col>
                <Col span={6}>
                  <span style={{ color: '#64748b' }}>Phone:</span>{' '}
                  <strong>{selectedCustomerMeta.phone || '-'}</strong>
                </Col>
                <Col span={6}>
                  <span style={{ color: '#64748b' }}>Payment Terms:</span>{' '}
                  <Tag color="blue">{selectedCustomerMeta.paymentTerms || 'Standard'}</Tag>
                </Col>
              </Row>
              {(selectedCustomerMeta.addressLine1 || selectedCustomerMeta.city) && (
                <div style={{ marginTop: 4, color: '#64748b' }}>
                  <span>Address: </span>
                  <span style={{ color: '#334155' }}>
                    {[selectedCustomerMeta.addressLine1, selectedCustomerMeta.addressLine2, selectedCustomerMeta.city]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="quotationDate" label="Quotation Date" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="validUntil" label="Valid Until Date">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>

          <ERPLineItems
            companyId={companyId}
            value={lineItems}
            onChange={(items) => {
              setLineItems(items);
              const sub = items.reduce((acc, curr) => acc + (curr.lineTotal || 0), 0);
              const disc = form.getFieldValue('discountAmount') || 0;
              const tax = form.getFieldValue('taxAmount') || 0;
              form.setFieldsValue({
                subtotal: sub,
                totalAmount: Math.max(0, sub - disc + tax),
              });
            }}
            label="Quotation Line Items (Finished Goods / Products)"
            currency={form.getFieldValue('currency') || 'PKR'}
          />

          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={8}>
              <Form.Item name="discountAmount" label="Discount Amount">
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  precision={2}
                  onChange={(val) => {
                    const sub = form.getFieldValue('subtotal') || 0;
                    const tax = form.getFieldValue('taxAmount') || 0;
                    form.setFieldsValue({ totalAmount: Math.max(0, sub - (val || 0) + tax) });
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="taxAmount" label="Tax Amount">
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  precision={2}
                  onChange={(val) => {
                    const sub = form.getFieldValue('subtotal') || 0;
                    const disc = form.getFieldValue('discountAmount') || 0;
                    form.setFieldsValue({ totalAmount: Math.max(0, sub - disc + (val || 0)) });
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="totalAmount" label="Total Amount (Authoritative)">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} disabled />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notes" label="Commercial Terms & Notes">
            <Input.TextArea
              rows={3}
              placeholder="Commercial payment terms, delivery schedule, validity clause, warranty terms..."
            />
          </Form.Item>
        </Form>
      </DraggableResizableModal>

      {/* Detail Modal */}
      <DraggableResizableModal
        title={`Quotation Details: ${detailItem?.quotationNumber || ''}`}
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            Close
          </Button>,
          <Button
            key="print"
            icon={<PrinterOutlined />}
            onClick={() => {
              setDetailVisible(false);
              handleOpenPrintPreview(detailItem || undefined);
            }}
          >
            Print Quotation
          </Button>,
          detailItem?.status?.toLowerCase() === 'accepted' && (
            <Button
              key="convert"
              type="primary"
              style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
              icon={<ShoppingCartOutlined />}
              onClick={() => {
                if (detailItem) handleConvertToSalesOrder(detailItem);
              }}
            >
              Convert to Sales Order
            </Button>
          ),
        ]}
        width={880}
      >
        {detailItem && (
          <>
            {detailItem.status?.toLowerCase() === 'converted' && detailItem.relatedSalesOrder && (
              <Alert
                message="Converted to Sales Order"
                description={`This quotation has been successfully converted into Sales Order ${detailItem.relatedSalesOrder.orderNumber} (Status: ${detailItem.relatedSalesOrder.status}). Duplicate conversion is prevented.`}
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Quotation #">{detailItem.quotationNumber}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <span
                  className={`inv-status-pill ${
                    detailItem.status?.toLowerCase() === 'converted'
                      ? 'status-converted'
                      : detailItem.status?.toLowerCase() === 'accepted'
                      ? 'status-paid'
                      : 'status-pending'
                  }`}
                >
                  {detailItem.status}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Customer">
                <Space>
                  <span style={{ fontWeight: 600, color: '#2563eb' }}>
                    {(() => {
                      const c = customers.find((cust) => cust.id === detailItem.customerId);
                      if (c) return `${c.customerCode ? `[${c.customerCode}] ` : ''}${c.companyName || c.name}`;
                      return detailItem.companyName || detailItem.customerName || 'Customer';
                    })()}
                  </span>
                  <Button
                    size="small"
                    type="link"
                    icon={<HistoryOutlined />}
                    onClick={() => handleOpenCustomerSummary(detailItem.customerId)}
                  >
                    History
                  </Button>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Currency">{detailItem.currency || 'PKR'}</Descriptions.Item>
              <Descriptions.Item label="Quotation Date">{detailItem.quotationDate || '-'}</Descriptions.Item>
              <Descriptions.Item label="Valid Until">{detailItem.validUntil || '-'}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">
                {detailItem.currency || 'Rs'} {formatDecimal(detailItem.subtotal)}
              </Descriptions.Item>
              <Descriptions.Item label="Discount">
                {detailItem.currency || 'Rs'} {formatDecimal(detailItem.discountAmount)}
              </Descriptions.Item>
              <Descriptions.Item label="Tax">
                {detailItem.currency || 'Rs'} {formatDecimal(detailItem.taxAmount)}
              </Descriptions.Item>
              <Descriptions.Item label="Total Amount">
                <span style={{ fontWeight: 800, fontSize: 16, color: '#16a34a' }}>
                  {detailItem.currency || 'Rs'} {formatDecimal(detailItem.totalAmount)}
                </span>
              </Descriptions.Item>
              {detailItem.relatedSalesOrder && (
                <Descriptions.Item label="Related Sales Order" span={2}>
                  <Tag color="purple" style={{ fontSize: 12, padding: '2px 8px' }}>
                    {detailItem.relatedSalesOrder.orderNumber}
                  </Tag>
                  <span style={{ color: '#64748b', fontSize: 12 }}>
                    Status: {detailItem.relatedSalesOrder.status}
                  </span>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Commercial Notes" span={2}>
                {detailItem.notes || '-'}
              </Descriptions.Item>
            </Descriptions>

            {detailItem.items && detailItem.items.length > 0 && (
              <>
                <Divider orientation="left" style={{ margin: '16px 0 10px' }}>
                  Quoted Line Items (Commercial Availability)
                </Divider>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={detailItem.items}
                  columns={[
                    {
                      title: 'Item Code / Name',
                      key: 'item',
                      render: (_, item) => (
                        <div>
                          <strong>{item.item?.itemCode || item.itemCode || 'ITEM'}</strong>
                          <div style={{ color: '#64748b', fontSize: 12 }}>
                            {item.description || item.item?.name || '-'}
                          </div>
                        </div>
                      ),
                    },
                    {
                      title: 'UOM',
                      dataIndex: ['uom', 'code'],
                      key: 'uom',
                      width: 80,
                      render: (v, item) => v || item.uomCode || 'PCS',
                    },
                    {
                      title: 'Quoted Qty',
                      dataIndex: 'quantity',
                      key: 'quantity',
                      width: 100,
                      align: 'right',
                      render: (v) => formatDecimal(v),
                    },
                    {
                      title: 'Unit Price',
                      dataIndex: 'unitPrice',
                      key: 'unitPrice',
                      width: 130,
                      align: 'right',
                      render: (v) => `${detailItem.currency || 'Rs'} ${formatDecimal(v)}`,
                    },
                    {
                      title: 'Disc %',
                      dataIndex: 'discountPercent',
                      key: 'discountPercent',
                      width: 80,
                      align: 'right',
                      render: (v) => (v ? `${v}%` : '0%'),
                    },
                    {
                      title: 'Line Total',
                      dataIndex: 'lineTotal',
                      key: 'lineTotal',
                      width: 140,
                      align: 'right',
                      render: (v) => (
                        <strong>
                          {detailItem.currency || 'Rs'} {formatDecimal(v)}
                        </strong>
                      ),
                    },
                  ]}
                />
              </>
            )}
          </>
        )}
      </DraggableResizableModal>

      {/* Customer 360 Quotation History Modal */}
      <DraggableResizableModal
        title={`Customer Quotation History: ${summaryCustomer?.companyName || summaryCustomer?.name || ''}`}
        open={summaryModalVisible}
        onCancel={() => setSummaryModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setSummaryModalVisible(false)}>
            Close
          </Button>,
        ]}
        width={780}
      >
        {summaryCustomer && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Customer Code">
                  <strong>{summaryCustomer.customerCode || 'N/A'}</strong>
                </Descriptions.Item>
                <Descriptions.Item label="Customer Type">{summaryCustomer.customerType || 'B2B'}</Descriptions.Item>
                <Descriptions.Item label="Contact Person">{summaryCustomer.contactPerson || '-'}</Descriptions.Item>
                <Descriptions.Item label="Phone">{summaryCustomer.phone || '-'}</Descriptions.Item>
                <Descriptions.Item label="Payment Terms">{summaryCustomer.paymentTerms || 'Standard'}</Descriptions.Item>
                <Descriptions.Item label="Credit Days">{summaryCustomer.creditDays || 30} Days</Descriptions.Item>
              </Descriptions>
            </div>

            {summaryLoading ? (
              <div style={{ textAlign: 'center', padding: 24 }}>Loading quotation analytics...</div>
            ) : summaryData ? (
              <div>
                <Row gutter={16}>
                  <Col span={6}>
                    <Card size="small" style={{ textAlign: 'center', backgroundColor: 'var(--inv-bg-card-alt, rgba(148, 163, 184, 0.08))' }}>
                      <Statistic title="Total Quotations" value={summaryData.totalQuotations} />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small" style={{ textAlign: 'center', backgroundColor: 'rgba(22, 163, 74, 0.08)' }}>
                      <Statistic
                        title="Accepted"
                        value={summaryData.acceptedCount}
                        valueStyle={{ color: '#16a34a' }}
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small" style={{ textAlign: 'center', backgroundColor: 'rgba(99, 102, 241, 0.08)' }}>
                      <Statistic
                        title="Converted to Order"
                        value={summaryData.convertedCount}
                        valueStyle={{ color: '#6366f1' }}
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small" style={{ textAlign: 'center', backgroundColor: 'rgba(234, 88, 12, 0.08)' }}>
                      <Statistic
                        title="Expired"
                        value={summaryData.expiredCount}
                        valueStyle={{ color: '#ea580c' }}
                      />
                    </Card>
                  </Col>
                </Row>

                <Row gutter={16} style={{ marginTop: 12 }}>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic
                        title="Total Quoted Commercial Value"
                        value={summaryData.totalQuotedValue}
                        precision={2}
                        prefix="PKR"
                      />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic
                        title="Total Converted Order Value"
                        value={summaryData.totalConvertedValue}
                        precision={2}
                        prefix="PKR"
                        valueStyle={{ color: '#16a34a' }}
                      />
                    </Card>
                  </Col>
                </Row>
              </div>
            ) : null}
          </div>
        )}
      </DraggableResizableModal>

      {/* Professional Commercial Quotation Print Modal */}
      <DraggableResizableModal
        title="Commercial Sales Quotation Document"
        open={printModalVisible}
        onCancel={() => setPrintModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setPrintModalVisible(false)}>
            Close
          </Button>,
          <Button
            key="print"
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => printQuotation && printQuotationDocument(printQuotation)}
          >
            Print Quotation
          </Button>,
        ]}
        width={850}
      >
        {printQuotation && (
          <div
            id="quotation-print-area"
            style={{
              padding: 24,
              backgroundColor: '#fff',
              color: '#0f172a',
              fontFamily: 'Inter, system-ui, sans-serif',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: 16 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '0.5px' }}>
                  PAKISTAN WIRE INDUSTRIES (PVT) LTD
                </h1>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                  Manufacturers of High Tensile Steel Wire, Galvanized Wire & Fasteners
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  Plot No. 123-125, Industrial Estate, Kot Lakhpat, Lahore, Pakistan
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  Tel: +92 42 35115555 | NTN: 0812345-6 | STRN: 03-05-9999-001-19
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#2563eb', textTransform: 'uppercase' }}>
                  COMMERCIAL QUOTATION
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{printQuotation.quotationNumber}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  Date: {dayjs(printQuotation.quotationDate).format('DD MMM YYYY')}
                </div>
                <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                  Valid Until: {printQuotation.validUntil ? dayjs(printQuotation.validUntil).format('DD MMM YYYY') : '30 Days'}
                </div>
              </div>
            </div>

            {/* Customer & Billing Details */}
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '16px 0', fontSize: 12 }}>
              <div style={{ width: '48%' }}>
                <div style={{ fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
                  Commercial Offer Prepared For:
                </div>
                {(() => {
                  const cust = customers.find((c) => c.id === printQuotation.customerId);
                  return (
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                        {cust?.companyName || cust?.name || printQuotation.companyName || printQuotation.customerName}
                      </div>
                      {cust?.customerCode && <div>Customer Code: {cust.customerCode}</div>}
                      {cust?.contactPerson && <div>Attn: {cust.contactPerson}</div>}
                      {cust?.phone && <div>Phone: {cust.phone}</div>}
                      {cust?.addressLine1 && <div>Address: {[cust.addressLine1, cust.city].filter(Boolean).join(', ')}</div>}
                    </div>
                  );
                })()}
              </div>
              <div style={{ width: '48%', textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
                  Commercial Terms:
                </div>
                <div>Currency: <strong>{printQuotation.currency || 'PKR'}</strong></div>
                <div>Price Basis: <strong>Ex-Works Lahore</strong></div>
                <div>Payment Terms: <strong>Standard / As Agreed</strong></div>
                <div>Document Status: <strong>{printQuotation.status}</strong></div>
              </div>
            </div>

            {/* Line Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, margin: '16px 0' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>#</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Item Description</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>UOM</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Quantity</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Unit Rate</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Disc %</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Tax</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {(printQuotation.items || []).map((item: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 10px' }}>{idx + 1}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 600 }}>{item.item?.name || item.itemName || item.description || 'Finished Good'}</div>
                      {item.item?.itemCode && <div style={{ fontSize: 10, color: '#64748b' }}>Code: {item.item.itemCode}</div>}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{item.uom?.code || item.uomCode || 'PCS'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatDecimal(item.quantity)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatDecimal(item.unitPrice)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{item.discountPercent ? `${item.discountPercent}%` : '-'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatDecimal(item.taxAmount || 0)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{formatDecimal(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Financial Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <div style={{ width: 280, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span style={{ color: '#64748b' }}>Subtotal:</span>
                  <strong>{printQuotation.currency || 'PKR'} {formatDecimal(printQuotation.subtotal)}</strong>
                </div>
                {Number(printQuotation.discountAmount || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#ea580c' }}>
                    <span>Discount:</span>
                    <span>-{formatDecimal(printQuotation.discountAmount)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span style={{ color: '#64748b' }}>Sales Tax:</span>
                  <span>{printQuotation.currency || 'PKR'} {formatDecimal(printQuotation.taxAmount || 0)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderTop: '2px solid #0f172a',
                    borderBottom: '2px solid #0f172a',
                    marginTop: 6,
                    fontSize: 15,
                    fontWeight: 800,
                    color: '#16a34a',
                  }}
                >
                  <span>Grand Total:</span>
                  <span>{printQuotation.currency || 'PKR'} {formatDecimal(printQuotation.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Terms and Signatures */}
            <div style={{ marginTop: 24, fontSize: 11, color: '#475569' }}>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Standard Commercial Terms:</div>
              <div>1. All quotations are subject to confirmation upon formal acceptance and conversion to Sales Order.</div>
              <div>2. Prices quoted are based on current raw material costs and prevailing government duties/taxes.</div>
              <div>3. Delivery schedule commences upon formal customer acceptance and receipt of advance payment if applicable.</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, paddingTop: 16 }}>
              <div style={{ textAlign: 'center', width: 220 }}>
                <div style={{ borderBottom: '1px solid #94a3b8', height: 30 }} />
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: '#0f172a' }}>
                  Prepared / Authorized By (PWI)
                </div>
              </div>
              <div style={{ textAlign: 'center', width: 220 }}>
                <div style={{ borderBottom: '1px solid #94a3b8', height: 30 }} />
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: '#0f172a' }}>
                  Customer Acceptance (Sign & Stamp)
                </div>
              </div>
            </div>
          </div>
        )}
      </DraggableResizableModal>

      {/* Enterprise Pre-Save Quotation Confirmation Dialog */}
      <Modal
        open={confirmQuotationVisible}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>
            <SaveOutlined style={{ fontSize: 18 }} />
            <span>{editingItem ? 'Confirm Quotation Update' : 'Confirm Quotation Creation'}</span>
          </div>
        }
        centered
        width={500}
        onCancel={() => setConfirmQuotationVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setConfirmQuotationVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<SaveOutlined />}
            style={{ background: '#2563eb', borderColor: '#2563eb' }}
            onClick={() => executeQuotationSave(pendingQuotationValues)}
          >
            {editingItem ? 'Yes, Update Quotation' : 'Yes, Create Quotation'}
          </Button>,
        ]}
      >
        <div style={{ padding: '12px 0' }}>
          <p style={{ fontSize: 14, marginBottom: 16 }}>
            Are you sure you want to {editingItem ? 'update quotation' : 'create sales quotation for'}{' '}
            <strong style={{ color: '#2563eb', fontSize: 15 }}>
              {customers.find(c => c.id === pendingQuotationValues?.customerId)?.companyName || customers.find(c => c.id === pendingQuotationValues?.customerId)?.name || 'Selected Customer'}
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
              <span style={{ color: '#64748b' }}>Valid Until:</span>
              <strong>{pendingQuotationValues?.validUntil ? dayjs(pendingQuotationValues.validUntil).format('YYYY-MM-DD') : dayjs().add(15, 'day').format('YYYY-MM-DD')}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Status:</span>
              <Tag color="blue">{editingItem ? 'UPDATE' : 'DRAFT'}</Tag>
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

export default SalesQuotationManagement;
