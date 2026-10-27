import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Space, Tag, Form, Input, Select, App, Card,
  Row, Col, DatePicker, Segmented, Badge, Modal, Empty, Spin,
  Descriptions, Divider,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, SendOutlined, StopOutlined,
  ReloadOutlined, ApartmentOutlined, ShopOutlined, GlobalOutlined,
  FileSearchOutlined, FileDoneOutlined, TrophyOutlined,
  DollarCircleOutlined, CheckCircleOutlined, ShoppingCartOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { ERPLineItems, ERPLine, DraggableResizableModal } from '../../components/shared';

interface Rfq {
  id: string;
  rfqCode: string;
  title?: string;
  supplierId?: string;
  supplier?: { id: string; name: string };
  supplierName?: string;
  issueDate?: string;
  dueDate?: string;
  divisionId?: string;
  divisionName?: string;
  warehouseId?: string;
  warehouseName?: string;
  purchaseType?: string;
  status: string;
  lines?: any[];
}

interface DropdownOption { id: string; name: string; }
interface DivisionOption { id: string; code?: string; name: string; }
interface RequisitionOption { id: string; requisitionCode: string; title?: string; status: string; }

const DEFAULT_DIVISIONS: DivisionOption[] = [
  { id: 'd1000000-0000-0000-0000-000000000001', code: 'DIV-SPD', name: 'Spoke Division' },
  { id: 'd1000000-0000-0000-0000-000000000002', code: 'DIV-CCD', name: 'Control Cable Division' },
  { id: '50824516-9c24-4122-86e7-c8e6fa1c5869', code: 'DIV-001', name: 'Manufacturing Division' },
  { id: 'b28f9d4f-53f3-4883-afb4-2af73c4dcca7', code: 'DIV-002', name: 'Sales & Marketing Division' },
  { id: '3f222d46-6f96-44f6-9ead-27467c7e93a1', code: 'DIV-003', name: 'Supply Chain Division' },
  { id: '83ecd746-1cc9-4849-bec4-d00bcc3ceeec', code: 'DIV-PWI', name: 'Main Division E-51' },
];

const STATUS_OPTIONS = ['DRAFT', 'SENT', 'PARTIAL_RESPONSE', 'RESPONSE_RECEIVED', 'EVALUATED', 'CANCELLED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', SENT: 'blue', PARTIAL_RESPONSE: 'orange',
  RESPONSE_RECEIVED: 'cyan', EVALUATED: 'green', CANCELLED: 'red',
};

const RfqManagement: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<Rfq | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'ALL' | 'DRAFT' | 'SENT' | 'EVALUATED'>('ALL');
  const [pageSize] = useState(20);
  const [suppliers, setSuppliers] = useState<DropdownOption[]>([]);
  const [requisitions, setRequisitions] = useState<RequisitionOption[]>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>(DEFAULT_DIVISIONS);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string; warehouseType?: string }>>([]);
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');

  // Comparative Statement State
  const [comparisonModalVisible, setComparisonModalVisible] = useState(false);
  const [comparingRfq, setComparingRfq] = useState<Rfq | null>(null);
  const [rfqQuotations, setRfqQuotations] = useState<any[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  // Quick Quotation Entry State
  const [quoteModalVisible, setQuoteModalVisible] = useState(false);
  const [quoteForm] = Form.useForm();
  const [quoteLineItems, setQuoteLineItems] = useState<ERPLine[]>([]);
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);
  const [targetRfqForQuote, setTargetRfqForQuote] = useState<Rfq | null>(null);

  const watchedDivisionId = Form.useWatch('divisionId', form);
  const watchedWarehouseId = Form.useWatch('warehouseId', form);
  const selectedWarehouse = warehouses.find((w) => w.id === watchedWarehouseId);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (activeTab === 'DRAFT') {
        params.status = 'DRAFT';
      } else if (activeTab === 'SENT') {
        params.status = 'SENT';
      } else if (activeTab === 'EVALUATED') {
        params.status = 'EVALUATED';
      } else if (filterStatus) {
        params.status = filterStatus;
      }
      const response = await apiService.get<{ data: Rfq[]; total: number }>('/procurement/rfqs', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch RFQs');
    } finally {
      setLoading(false);
    }
  }, [search, activeTab, filterStatus, pageSize, message]);

  // Stage counts for badges
  const [allRfqsForCounts, setAllRfqsForCounts] = useState<Rfq[]>([]);
  const fetchCounts = useCallback(async () => {
    try {
      const res = await apiService.get<{ data: Rfq[] }>('/procurement/rfqs', { limit: 100 });
      setAllRfqsForCounts(res.data || []);
    } catch { /* ignore */ }
  }, []);

  const statusCounts = useMemo(() => {
    const list = allRfqsForCounts.length > 0 ? allRfqsForCounts : data;
    return {
      ALL: list.length,
      DRAFT: list.filter(r => r.status === 'DRAFT').length,
      SENT: list.filter(r => r.status === 'SENT').length,
      EVALUATED: list.filter(r => ['EVALUATED', 'RESPONSE_RECEIVED', 'PARTIAL_RESPONSE'].includes(r.status)).length,
    };
  }, [allRfqsForCounts, data]);

  const fetchMasters = useCallback(async () => {
    try {
      const res = await apiService.get<{ data: DropdownOption[] }>('/procurement/suppliers', { limit: 200 });
      setSuppliers(res.data || []);
    } catch { /* ignore */ }
    try {
      const prRes = await apiService.get<any>('/procurement/requisitions', { limit: 200 });
      const prList = Array.isArray(prRes) ? prRes : prRes?.data || [];
      setRequisitions(prList);
    } catch { /* ignore */ }
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
    try {
      const d = await apiService.get<any>('/divisions', { limit: 50 });
      const divItems = Array.isArray(d) ? d : d?.data?.items || d?.data || [];
      if (divItems.length > 0) {
        setDivisions(divItems.map((x: any) => ({ id: x.id, code: x.divisionCode, name: x.name })));
      }
    } catch { /* keep defaults */ }
  }, []);

  useEffect(() => { fetchMasters(); fetchCounts(); }, [fetchMasters, fetchCounts]);
  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const generateRfqCode = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const nextSeq = (total || data.length || 0) + 1;
    return `RFQ-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
  }, [total, data.length]);

  const handleRequisitionChange = async (reqId: string | null) => {
    if (!reqId) return;
    try {
      const res = await apiService.get<any>(`/procurement/requisitions/${reqId}`);
      const pr = res?.data || res;
      if (!pr) return;

      const rawNotes = pr.notes || '';
      const divMatch = rawNotes.match(/\[Division:\s*([^\]]+)\]/i);
      const storeMatch = rawNotes.match(/\[Store:\s*([^\]]+)\]/i);
      const originMatch = rawNotes.match(/\[Origin:\s*([^\]]+)\]/i);

      let matchedDivisionId = pr.divisionId;
      if (!matchedDivisionId && divMatch) {
        const found = divisions.find(d =>
          d.name?.toLowerCase().includes(divMatch[1].toLowerCase()) ||
          d.code?.toLowerCase().includes(divMatch[1].toLowerCase())
        );
        if (found) matchedDivisionId = found.id;
      }

      let matchedWarehouseId = pr.warehouseId;
      if (!matchedWarehouseId && storeMatch) {
        const found = warehouses.find(w =>
          w.name?.toLowerCase().includes(storeMatch[1].toLowerCase()) ||
          w.warehouseCode?.toLowerCase().includes(storeMatch[1].toLowerCase())
        );
        if (found) matchedWarehouseId = found.id;
      }
      if (!matchedWarehouseId && pr.lines?.[0]?.warehouseId) {
        matchedWarehouseId = pr.lines[0].warehouseId;
      }

      form.setFieldsValue({
        title: pr.title || `RFQ for ${pr.requisitionCode}`,
        description: pr.description || `Sourced from PR: ${pr.requisitionCode}`,
        purchaseType: pr.purchaseType || (originMatch ? originMatch[1] : 'LOCAL'),
        divisionId: matchedDivisionId,
        warehouseId: matchedWarehouseId,
      });

      if (pr.lines && Array.isArray(pr.lines) && pr.lines.length > 0) {
        const mappedLines: ERPLine[] = pr.lines.map((l: any, i: number) => {
          const qty = Number(l.quantity || 0);
          const unitRate = Number(l.estimatedUnitPrice || l.unitPrice || 0);
          const totalVal = Number(l.estimatedTotalPrice || (qty * unitRate));
          return {
            id: `pr_line_${i}_${Date.now()}`,
            itemId: l.itemId,
            itemCode: l.item?.itemCode || l.itemCode || '',
            itemName: l.justification || l.item?.name || l.itemName || 'Raw Material',
            uomId: l.uomId,
            uomCode: l.uom?.code || l.uomCode || 'PCS',
            quantity: qty,
            rate: unitRate,
            unitPrice: unitRate,
            discountPercent: 0,
            taxPercent: 0,
            lineTotal: totalVal,
            totalPrice: totalVal,
          };
        });
        setLineItems(mappedLines);
        message.success(`Requisition ${pr.requisitionCode} loaded with ${mappedLines.length} item(s)!`);
      }
    } catch {
      message.error('Failed to load requisition items');
    }
  };

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      rfqCode: generateRfqCode(),
      purchaseType: 'LOCAL',
      issueDate: dayjs(),
      dueDate: dayjs().add(14, 'day'),
    });
    setLineItems([]);
    setModalVisible(true);
  };

  const handleEdit = (record: Rfq) => {
    setEditingItem(record);
    form.setFieldsValue({
      ...record,
      issueDate: record.issueDate ? dayjs(record.issueDate) : undefined,
      dueDate: record.dueDate ? dayjs(record.dueDate) : undefined,
      purchaseType: record.purchaseType || 'LOCAL',
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one line item');
        return;
      }
      setSubmitting(true);
      const payload = {
        ...values,
        companyId: companyId || values.companyId,
        issueDate: values.issueDate ? dayjs(values.issueDate).format('YYYY-MM-DD') : undefined,
        dueDate: values.dueDate ? dayjs(values.dueDate).format('YYYY-MM-DD') : undefined,
        lines: lineItems.map((l, i) => ({
          lineNumber: i + 1,
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: Number(l.quantity || 0),
          notes: l.itemName || l.itemCode,
        })),
      };
      if (editingItem) {
        await apiService.patch(`/procurement/rfqs/${editingItem.id}`, payload);
        message.success('RFQ updated');
      } else {
        await apiService.post('/procurement/rfqs', payload);
        message.success(`RFQ ${values.rfqCode} created`);
      }
      setModalVisible(false);
      fetchData(page);
      fetchCounts();
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to save RFQ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/rfqs/${id}/${action}`);
      if (action === 'send') {
        message.success('RFQ sent to supplier successfully! Moved to Sent stage.');
      } else {
        message.success(`RFQ ${action}ed successfully`);
      }
      fetchData(page);
      fetchCounts();
    } catch {
      message.error(`Failed to ${action} RFQ`);
    }
  };

  // Comparative Statement Modal Handler
  const handleOpenComparison = async (rfq: Rfq) => {
    setComparingRfq(rfq);
    setComparisonModalVisible(true);
    setComparisonLoading(true);
    try {
      // 1. Fetch full RFQ details
      const rfqRes = await apiService.get<any>(`/procurement/rfqs/${rfq.id}`);
      const detailedRfq = rfqRes?.data || rfqRes;
      if (detailedRfq) setComparingRfq(detailedRfq);

      // 2. Fetch all vendor quotations received against this RFQ
      const qRes = await apiService.get<any>('/procurement/quotations', { rfqId: rfq.id, limit: 100 });
      const qList = Array.isArray(qRes) ? qRes : qRes?.data || [];
      setRfqQuotations(qList);
    } catch {
      message.error('Failed to load comparative statement data');
    } finally {
      setComparisonLoading(false);
    }
  };

  // Select winning quotation from comparison
  const handleSelectWinningQuotation = async (quotationId: string) => {
    try {
      await apiService.patch(`/procurement/quotations/${quotationId}/select`);
      message.success('Quotation selected as winning bid!');
      if (comparingRfq) {
        handleOpenComparison(comparingRfq);
      }
      fetchData(page);
      fetchCounts();
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to select quotation');
    }
  };

  // Quick Quotation Entry modal for an RFQ
  const handleOpenAddQuotation = async (rfq: Rfq) => {
    setTargetRfqForQuote(rfq);
    quoteForm.resetFields();
    try {
      const rfqRes = await apiService.get<any>(`/procurement/rfqs/${rfq.id}`);
      const fullRfq = rfqRes?.data || rfqRes || rfq;
      const nextSeq = Math.floor(1000 + Math.random() * 9000);
      const code = `QT-${new Date().getFullYear()}-${nextSeq}`;

      quoteForm.setFieldsValue({
        quotationCode: code,
        rfqId: fullRfq.id,
        supplierId: fullRfq.supplierId,
        purchaseType: fullRfq.purchaseType || 'LOCAL',
        quotationDate: dayjs(),
        validUntil: dayjs().add(30, 'day'),
        divisionId: fullRfq.divisionId,
        warehouseId: fullRfq.warehouseId,
      });

      if (fullRfq.lines && Array.isArray(fullRfq.lines)) {
        const mapped: ERPLine[] = fullRfq.lines.map((l: any, i: number) => ({
          id: `q_line_${i}_${Date.now()}`,
          itemId: l.itemId,
          itemCode: l.item?.itemCode || l.itemCode || '',
          itemName: l.item?.name || l.notes || l.itemName || 'Raw Material',
          uomId: l.uomId,
          uomCode: l.uom?.code || l.uomCode || 'KG',
          quantity: Number(l.quantity || 1),
          rate: 0,
          unitPrice: 0,
          discountPercent: 0,
          taxPercent: 18,
          lineTotal: 0,
          totalPrice: 0,
        }));
        setQuoteLineItems(mapped);
      } else {
        setQuoteLineItems([]);
      }
      setQuoteModalVisible(true);
    } catch {
      message.error('Failed to load RFQ items for quotation');
    }
  };

  const handleSaveQuotation = async () => {
    try {
      const values = await quoteForm.validateFields();
      if (quoteLineItems.length === 0) {
        message.warning('Please include at least one quoted item');
        return;
      }
      setQuoteSubmitting(true);

      let grandTotal = 0;
      const formattedLines = quoteLineItems.map((l, idx) => {
        const qty = Number(l.quantity || 0);
        const rate = Number(l.rate || (l as any).unitPrice || 0);
        const disc = Number(l.discountPercent || 0);
        const tax = Number(l.taxPercent || 18);
        const lineBase = qty * rate * (1 - disc / 100);
        const lineWithTax = lineBase * (1 + tax / 100);
        grandTotal += lineWithTax;
        return {
          lineNumber: idx + 1,
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: qty,
          unitPrice: rate,
          discountPercent: disc,
          taxPercent: tax,
          lineTotal: Math.round(lineWithTax * 100) / 100,
        };
      });

      const payload = {
        ...values,
        companyId: companyId || values.companyId,
        totalAmount: Math.round(grandTotal * 100) / 100,
        quotationDate: values.quotationDate ? dayjs(values.quotationDate).format('YYYY-MM-DD') : undefined,
        validUntil: values.validUntil ? dayjs(values.validUntil).format('YYYY-MM-DD') : undefined,
        lines: formattedLines,
      };
      await apiService.post('/procurement/quotations', payload);
      message.success(`Vendor quotation ${values.quotationCode} saved successfully!`);
      setQuoteModalVisible(false);
      fetchData(page);
      fetchCounts();
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to save quotation');
    } finally {
      setQuoteSubmitting(false);
    }
  };

  // Find lowest total quotation in comparison
  const minQuotationAmount = useMemo(() => {
    const valid = rfqQuotations.filter((q) => Number(q.totalAmount) > 0);
    if (valid.length === 0) return null;
    return Math.min(...valid.map((q) => Number(q.totalAmount)));
  }, [rfqQuotations]);

  const columns: ColumnsType<Rfq> = [
    {
      title: 'RFQ Code',
      dataIndex: 'rfqCode',
      key: 'rfqCode',
      width: 140,
      render: (code) => <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#38bdf8' }}>{code}</span>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: 240,
      render: (t) => <span style={{ fontWeight: 600 }}>{t || '—'}</span>,
    },
    {
      title: 'Supplier',
      key: 'supplier',
      width: 220,
      render: (_, record: Rfq) => {
        const name = record.supplier?.name || record.supplierName || suppliers.find(s => s.id === record.supplierId)?.name || '—';
        return <span style={{ fontWeight: 600 }}>{name}</span>;
      },
    },
    {
      title: 'Issue Date',
      dataIndex: 'issueDate',
      key: 'issueDate',
      width: 110,
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 110,
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => <Tag color={statusColorMap[status] || 'default'} style={{ fontWeight: 700 }}>{status}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 270,
      render: (_, record) => (
        <Space size="small" wrap>
          {record.status === 'DRAFT' && (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
              <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleAction(record.id, 'send')}>
                Send
              </Button>
            </>
          )}

          {record.status === 'SENT' && (
            <>
              <Button
                size="small"
                style={{ borderColor: '#38bdf8', color: '#38bdf8', fontWeight: 600 }}
                icon={<PlusOutlined />}
                onClick={() => handleOpenAddQuotation(record)}
              >
                + Add Quotation
              </Button>
              <Button
                size="small"
                type="primary"
                style={{ background: '#10b981', borderColor: '#10b981', fontWeight: 600 }}
                icon={<TrophyOutlined />}
                onClick={() => handleOpenComparison(record)}
              >
                Compare Quotes
              </Button>
            </>
          )}

          {record.status !== 'CANCELLED' && record.status !== 'SENT' && record.status !== 'DRAFT' && (
            <Button
              size="small"
              type="primary"
              style={{ background: '#10b981', borderColor: '#10b981', fontWeight: 600 }}
              icon={<TrophyOutlined />}
              onClick={() => handleOpenComparison(record)}
            >
              Compare Quotes
            </Button>
          )}

          {record.status === 'DRAFT' && (
            <Button size="small" danger icon={<StopOutlined />} onClick={() => handleAction(record.id, 'cancel')}>
              Cancel
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileSearchOutlined style={{ fontSize: 20, color: '#f59e0b' }} />
          <span>Request for Quotations (RFQ)</span>
        </div>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => { fetchData(page); fetchCounts(); }}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ fontWeight: 600 }}>Create RFQ</Button>
        </Space>
      }
    >
      {/* Workflow Stage Tabs / Chevrons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <Button
          type={activeTab === 'ALL' ? 'primary' : 'default'}
          onClick={() => { setActiveTab('ALL'); setPage(1); }}
          style={{ borderRadius: 6, fontWeight: 600 }}
        >
          All RFQs <Badge count={statusCounts.ALL} style={{ marginLeft: 6, backgroundColor: activeTab === 'ALL' ? '#ffffff' : '#64748b', color: activeTab === 'ALL' ? '#0f172a' : '#ffffff' }} />
        </Button>
        <Button
          type={activeTab === 'DRAFT' ? 'primary' : 'default'}
          onClick={() => { setActiveTab('DRAFT'); setPage(1); }}
          style={{
            borderRadius: 6,
            fontWeight: 600,
            borderColor: activeTab === 'DRAFT' ? '#eab308' : undefined,
            backgroundColor: activeTab === 'DRAFT' ? '#ca8a04' : undefined,
            color: activeTab === 'DRAFT' ? '#ffffff' : undefined,
          }}
        >
          Draft (Needs Sending) <Badge count={statusCounts.DRAFT} style={{ marginLeft: 6, backgroundColor: '#eab308' }} />
        </Button>
        <Button
          type={activeTab === 'SENT' ? 'primary' : 'default'}
          onClick={() => { setActiveTab('SENT'); setPage(1); }}
          style={{
            borderRadius: 6,
            fontWeight: 600,
            borderColor: activeTab === 'SENT' ? '#38bdf8' : undefined,
            backgroundColor: activeTab === 'SENT' ? '#0284c7' : undefined,
            color: activeTab === 'SENT' ? '#ffffff' : undefined,
          }}
        >
          Sent (Awaiting Quotations) <Badge count={statusCounts.SENT} style={{ marginLeft: 6, backgroundColor: '#38bdf8' }} />
        </Button>
        <Button
          type={activeTab === 'EVALUATED' ? 'primary' : 'default'}
          onClick={() => { setActiveTab('EVALUATED'); setPage(1); }}
          style={{
            borderRadius: 6,
            fontWeight: 600,
            borderColor: activeTab === 'EVALUATED' ? '#10b981' : undefined,
            backgroundColor: activeTab === 'EVALUATED' ? '#059669' : undefined,
            color: activeTab === 'EVALUATED' ? '#ffffff' : undefined,
          }}
        >
          Evaluated / Winner <Badge count={statusCounts.EVALUATED} style={{ marginLeft: 6, backgroundColor: '#10b981' }} />
        </Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search RFQs..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} allowClear />
        </Col>
        <Col span={6}>
          <Select placeholder="Filter by status" allowClear style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus}>
            {STATUS_OPTIONS.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
        </Col>
        <Col span={4}>
          <Button type="primary" onClick={() => fetchData(1)}>Search</Button>
        </Col>
      </Row>

      <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize, onChange: setPage, showSizeChanger: false }} />

      {/* 1. Create/Edit RFQ Modal */}
      <DraggableResizableModal
        title={editingItem ? `Edit RFQ (${editingItem.rfqCode})` : 'Create Request for Quotation (RFQ)'}
        subtitle="📑 Solicit competitive quotations from vendors with division routing, live stock inspection & delivery dates"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={1120}
        height={760}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>Cancel</Button>,
          <Button key="submit" type="primary" loading={submitting} onClick={handleSubmit} style={{ fontWeight: 600 }}>
            {editingItem ? 'Update RFQ' : 'Create & Save RFQ'}
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>

          <Card size="small" style={{ marginBottom: 14, background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <Row gutter={16} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px dashed rgba(255, 255, 255, 0.1)' }}>
              <Col span={14}>
                <Form.Item
                  name="requisitionId"
                  label={
                    <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                      <FileDoneOutlined style={{ marginRight: 6 }} />
                      Link Purchase Requisition (PR)
                    </span>
                  }
                  style={{ marginBottom: 0 }}
                >
                  <Select
                    showSearch
                    allowClear
                    placeholder="Select approved PR (e.g. PR-2026-0005) to auto-fill all items..."
                    optionFilterProp="label"
                    onChange={handleRequisitionChange}
                    options={requisitions.map((r) => ({
                      value: r.id,
                      label: `${r.requisitionCode}${r.title ? ` — ${r.title}` : ''} [${r.status}]`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col span={10}>
                <div style={{ marginTop: 28, fontSize: 12, color: '#94a3b8', lineHeight: '1.4' }}>
                  ⚡ Selecting a PR will automatically populate all requisitioned items, quantities & details.
                </div>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="rfqCode" label={<span style={{ fontWeight: 600 }}>RFQ Code <Tag color="blue">Auto RFQ</Tag></span>} rules={[{ required: true }]}>
                  <Input style={{ fontWeight: 700, fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="title" label={<span style={{ fontWeight: 600 }}>Title / Subject</span>}>
                  <Input placeholder="e.g. Inquiries for Nipple & Spoke Galvanized Wire" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="supplierId" label={<span style={{ fontWeight: 600 }}>Supplier</span>} rules={[{ required: true }]}>
                  <Select showSearch optionFilterProp="label" placeholder="Select supplier..." options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name="purchaseType" label={<span style={{ fontWeight: 600 }}><GlobalOutlined style={{ marginRight: 4 }} />Origin</span>} initialValue="LOCAL">
                  <Segmented block options={[{ label: 'Local', value: 'LOCAL' }, { label: 'Import', value: 'IMPORT' }]} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="divisionId" label={<span style={{ fontWeight: 600 }}><ApartmentOutlined style={{ marginRight: 4, color: '#10b981' }} />Division</span>}>
                  <Select placeholder="Select division..." allowClear options={divisions.map((d) => ({ value: d.id, label: `${d.code ? `[${d.code}] ` : ''}${d.name}` }))} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="warehouseId" label={<span style={{ fontWeight: 600 }}><ShopOutlined style={{ marginRight: 4, color: '#f59e0b' }} />Target Warehouse / Store</span>}>
                  <Select placeholder="Select warehouse..." allowClear options={warehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="issueDate" label={<span style={{ fontWeight: 600 }}>Issue Date</span>}>
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="dueDate" label={<span style={{ fontWeight: 600 }}>Due Date</span>}>
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Form.Item name="description" label={<span style={{ fontWeight: 600 }}>Description / RFQ Scope</span>}>
            <Input.TextArea rows={2} placeholder="Scope, technical specs, or bidding requirements..." />
          </Form.Item>

          <ERPLineItems
            companyId={companyId}
            value={lineItems}
            onChange={setLineItems}
            context="purchase"
            isPurchasable={true}
            divisionId={watchedDivisionId}
            warehouseId={watchedWarehouseId}
            warehouseType={selectedWarehouse?.warehouseType}
            label="RFQ Items"
            showDiscount={false}
            showTax={false}
            showAvailability={true}
          />
        </Form>
      </DraggableResizableModal>

      {/* 2. Comparative Statement Modal */}
      <DraggableResizableModal
        title={`Comparative Statement — ${comparingRfq?.rfqCode || ''}`}
        subtitle="📊 Side-by-side comparison of supplier quotes, rates, delivery terms & winner selection"
        open={comparisonModalVisible}
        onCancel={() => setComparisonModalVisible(false)}
        width={1160}
        height={760}
        footer={[
          <Button key="close" onClick={() => setComparisonModalVisible(false)}>Close</Button>,
          <Button
            key="add-quote"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              if (comparingRfq) handleOpenAddQuotation(comparingRfq);
            }}
            style={{ fontWeight: 600 }}
          >
            + Add Another Supplier Quote
          </Button>,
        ]}
      >
        {comparisonLoading ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Spin size="large" />
          </div>
        ) : (
          <div>
            {/* RFQ Summary Card */}
            <Card size="small" style={{ marginBottom: 16, background: 'rgba(255, 255, 255, 0.02)' }}>
              <Descriptions size="small" column={{ xs: 1, sm: 2, md: 4 }}>
                <Descriptions.Item label="RFQ Code"><Tag color="blue" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{comparingRfq?.rfqCode}</Tag></Descriptions.Item>
                <Descriptions.Item label="Title">{comparingRfq?.title || '—'}</Descriptions.Item>
                <Descriptions.Item label="Due Date">{comparingRfq?.dueDate ? dayjs(comparingRfq.dueDate).format('DD/MM/YYYY') : '—'}</Descriptions.Item>
                <Descriptions.Item label="Quotations Received">
                  <Tag color={rfqQuotations.length > 0 ? 'green' : 'orange'} style={{ fontWeight: 700 }}>
                    {rfqQuotations.length} Quote(s) Received
                  </Tag>
                </Descriptions.Item>
              </Descriptions>

              {/* Items in this RFQ */}
              {comparingRfq?.lines && comparingRfq.lines.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontWeight: 600, fontSize: 12, color: '#94a3b8' }}>Requisitioned Line Items: </span>
                  {comparingRfq.lines.map((l: any, idx: number) => (
                    <Tag key={idx} color="cyan" style={{ margin: '2px 4px' }}>
                      {l.item?.name || l.notes || l.itemCode} — <strong>{formatDecimal(l.quantity)} {l.uom?.code || 'Units'}</strong>
                    </Tag>
                  ))}
                </div>
              )}
            </Card>

            {/* Quotations Comparison Cards / List */}
            {rfqQuotations.length === 0 ? (
              <Empty
                description="No supplier quotations recorded yet for this RFQ."
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    if (comparingRfq) handleOpenAddQuotation(comparingRfq);
                  }}
                  style={{ fontWeight: 600 }}
                >
                  Enter First Supplier Quotation
                </Button>
              </Empty>
            ) : (
              <div>
                <Row gutter={[16, 16]}>
                  {rfqQuotations.map((quote: any) => {
                    const isLowest = minQuotationAmount !== null && Number(quote.totalAmount) === minQuotationAmount;
                    const isSelected = quote.status === 'SELECTED';
                    const supName = quote.supplier?.name || quote.supplierName || 'Vendor';

                    return (
                      <Col xs={24} md={12} lg={8} key={quote.id}>
                        <Card
                          size="small"
                          style={{
                            border: isSelected
                              ? '2px solid #10b981'
                              : isLowest
                              ? '2px solid #38bdf8'
                              : '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: 8,
                            position: 'relative',
                            background: isSelected ? 'rgba(16, 185, 129, 0.06)' : undefined,
                          }}
                        >
                          {isSelected && (
                            <div style={{ position: 'absolute', top: -10, right: 12 }}>
                              <Tag color="success" style={{ fontWeight: 800, padding: '2px 8px' }}>
                                <CheckCircleOutlined /> WINNING BID (SELECTED)
                              </Tag>
                            </div>
                          )}
                          {!isSelected && isLowest && (
                            <div style={{ position: 'absolute', top: -10, right: 12 }}>
                              <Tag color="processing" style={{ fontWeight: 800, padding: '2px 8px' }}>
                                <TrophyOutlined /> BEST / LOWEST PRICE
                              </Tag>
                            </div>
                          )}

                          <div style={{ fontWeight: 700, fontSize: 16, color: '#f1f5f9', marginBottom: 4 }}>
                            {supName}
                          </div>
                          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
                            Quote Ref: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#38bdf8' }}>{quote.quotationCode}</span>
                            <span style={{ margin: '0 6px' }}>•</span>
                            Valid: {quote.validUntil ? dayjs(quote.validUntil).format('DD/MM/YYYY') : '—'}
                          </div>

                          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 6, marginBottom: 12 }}>
                            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Total Quoted Bid</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: isLowest ? '#10b981' : '#f8fafc' }}>
                              PKR {formatDecimal(quote.totalAmount || 0)}
                            </div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>
                              Status: <Tag color={statusColorMap[quote.status] || 'default'}>{quote.status}</Tag>
                            </div>
                          </div>

                          {/* Line items quote rates preview */}
                          {quote.lines && quote.lines.length > 0 && (
                            <div style={{ fontSize: 12, marginBottom: 14 }}>
                              <div style={{ fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>Quoted Unit Rates:</div>
                              {quote.lines.slice(0, 3).map((l: any, idx: number) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dashed rgba(255,255,255,0.05)' }}>
                                  <span style={{ color: '#94a3b8' }}>{l.item?.name || `Item ${idx + 1}`}</span>
                                  <span style={{ fontWeight: 600, color: '#e2e8f0' }}>PKR {formatDecimal(l.unitPrice || 0)} / {l.uom?.code || 'Unit'}</span>
                                </div>
                              ))}
                              {quote.lines.length > 3 && (
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                  +{quote.lines.length - 3} more item(s)
                                </div>
                              )}
                            </div>
                          )}

                          <Space direction="vertical" style={{ width: '100%' }}>
                            {!isSelected && (
                              <Button
                                block
                                type="primary"
                                icon={<CheckCircleOutlined />}
                                onClick={() => handleSelectWinningQuotation(quote.id)}
                                style={{
                                  background: isLowest ? '#10b981' : undefined,
                                  borderColor: isLowest ? '#10b981' : undefined,
                                  fontWeight: 600,
                                }}
                              >
                                Select Winning Quotation
                              </Button>
                            )}

                            {isSelected && (
                              <Button
                                block
                                type="primary"
                                icon={<ShoppingCartOutlined />}
                                onClick={() => {
                                  setComparisonModalVisible(false);
                                  navigate(`/procurement/orders?quotationId=${quote.id}`);
                                }}
                                style={{ background: '#10b981', borderColor: '#10b981', fontWeight: 700 }}
                              >
                                Generate Purchase Order (PO)
                              </Button>
                            )}
                          </Space>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              </div>
            )}
          </div>
        )}
      </DraggableResizableModal>

      {/* 3. Quick Enter Vendor Quotation Modal */}
      <DraggableResizableModal
        title={`Enter Vendor Quotation for ${targetRfqForQuote?.rfqCode || ''}`}
        subtitle="📝 Record quoted unit rates, delivery validity and terms submitted by supplier"
        open={quoteModalVisible}
        onCancel={() => setQuoteModalVisible(false)}
        width={1120}
        height={760}
        footer={[
          <Button key="cancel" onClick={() => setQuoteModalVisible(false)}>Cancel</Button>,
          <Button key="submit" type="primary" loading={quoteSubmitting} onClick={handleSaveQuotation} style={{ fontWeight: 600 }}>
            Save Vendor Quotation
          </Button>,
        ]}
      >
        <Form form={quoteForm} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>
          <Form.Item name="rfqId" hidden><Input /></Form.Item>

          <Card size="small" style={{ marginBottom: 14, background: 'rgba(255, 255, 255, 0.02)' }}>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="quotationCode" label={<span style={{ fontWeight: 600 }}>Quotation Code <Tag color="blue">Auto QT</Tag></span>} rules={[{ required: true }]}>
                  <Input style={{ fontWeight: 700, fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="supplierId" label={<span style={{ fontWeight: 600 }}>Supplier</span>} rules={[{ required: true }]}>
                  <Select showSearch optionFilterProp="label" placeholder="Select supplier..." options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="quotationDate" label={<span style={{ fontWeight: 600 }}>Quotation Date</span>}>
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="validUntil" label={<span style={{ fontWeight: 600 }}>Valid Until</span>}>
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="divisionId" label={<span style={{ fontWeight: 600 }}>Division</span>}>
                  <Select placeholder="Select division..." allowClear options={divisions.map((d) => ({ value: d.id, label: `${d.code ? `[${d.code}] ` : ''}${d.name}` }))} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="warehouseId" label={<span style={{ fontWeight: 600 }}>Target Store</span>}>
                  <Select placeholder="Select warehouse..." allowClear options={warehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="purchaseType" label={<span style={{ fontWeight: 600 }}>Origin</span>} initialValue="LOCAL">
                  <Segmented block options={[{ label: 'Local', value: 'LOCAL' }, { label: 'Import', value: 'IMPORT' }]} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <ERPLineItems
            companyId={companyId}
            value={quoteLineItems}
            onChange={setQuoteLineItems}
            context="purchase"
            isPurchasable={true}
            divisionId={quoteForm.getFieldValue('divisionId')}
            warehouseId={quoteForm.getFieldValue('warehouseId')}
            label="Quoted Line Items (Enter supplier unit rates)"
            showAvailability={false}
          />
        </Form>
      </DraggableResizableModal>
    </Card>
  );
};

export default RfqManagement;
