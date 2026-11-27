import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  App,
  Tag,
  Space,
  Row,
  Col,
  Statistic,
  Drawer,
  Tabs,
  Descriptions,
  Typography,
  Switch,
  Popconfirm,
  theme,
} from 'antd';
import {
  PlusOutlined,
  CheckCircleOutlined,
  RollbackOutlined,
  DeleteOutlined,
  PrinterOutlined,
  EyeOutlined,
  SearchOutlined,
  DownloadOutlined,
  EditOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import apiService from '../../services/api';
import { PageHeader, FinanceJournalLineEditor, TableColumnSelector, useColumnVisibility, type JournalLine } from '../../components/shared';
import { formatPkr, downloadCsvFile } from '../../utils/financeHelpers';
import { printFinanceVoucherDocument } from '../../utils/printTemplates';
import { usePermission } from '../../hooks/usePermission';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const VOUCHER_TAG_COLOR: Record<string, string> = {
  PV: 'red',
  RV: 'green',
  CV: 'cyan',
  JV: 'blue',
};

const JournalEntries: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { can } = usePermission();
  const canCreate = can('finance.journal.create');
  const canPost = can('finance.journal.post');
  const canReverse = can('finance.journal.reverse');
  const canDelete = can('finance.journal.delete');
  const canExport = can('finance.journal.export');
  const canPrint = can('finance.journal.print');

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<Array<{ id: string; name: string }>>([]);

  // Filters
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL_ACTIVE');
  const [voucherTypeFilter, setVoucherTypeFilter] = useState<string>('ALL');
  const [divisionFilter, setDivisionFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);

  // Create Voucher modal
  const [modalVisible, setModalVisible] = useState(false);
  const [voucherMode, setVoucherMode] = useState<'PAYMENT' | 'RECEIPT' | 'CONTRA' | 'GENERAL'>('PAYMENT');
  const [submitting, setSubmitting] = useState(false);
  const [lines, setLines] = useState<JournalLine[]>([
    { key: '1', debit: 0, credit: 0 },
    { key: '2', debit: 0, credit: 0 },
  ]);
  const [form] = Form.useForm();

  // Detail Drawer
  const [detailVoucher, setDetailVoucher] = useState<any>(null);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try {
        const p = JSON.parse(erpUser);
        if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId);
      } catch {
        // ignore
      }
    }
    apiService
      .get<any>('/dashboard/divisions')
      .then((res) => setDivisions(res?.data || []))
      .catch(() => { });
  }, []);

  useEffect(() => {
    apiService
      .get<{ data: any[] }>('/finance/accounts', companyId ? { companyId } : undefined)
      .then((res) => setAccounts(res.data || []))
      .catch(() => { });
  }, [companyId]);

  const bankCashAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => a.status === 'ACTIVE' && (a.isBankCash || ['1000', '1010', '1011', '1012', '1020'].includes(a.accountCode)),
      ),
    [accounts],
  );

  const nonBankAccounts = useMemo(
    () => accounts.filter((a) => a.status === 'ACTIVE'),
    [accounts],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get<{ data: any[]; total: number }>('/finance/journals', {
        companyId: companyId || undefined,
        page,
        limit: 25,
        search: search || undefined,
        status: statusFilter === 'ALL_ACTIVE' ? undefined : statusFilter,
        voucherType: voucherTypeFilter === 'ALL' ? undefined : voucherTypeFilter,
        divisionId: divisionFilter || undefined,
        from: dateRange ? dateRange[0].format('YYYY-MM-DD') : undefined,
        to: dateRange ? dateRange[1].format('YYYY-MM-DD') : undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch {
      message.error('Failed to load vouchers & journals');
    } finally {
      setLoading(false);
    }
  }, [companyId, page, search, statusFilter, voucherTypeFilter, divisionFilter, dateRange, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openNewVoucherModal = (mode: 'PAYMENT' | 'RECEIPT' | 'CONTRA' | 'GENERAL' = 'PAYMENT') => {
    setVoucherMode(mode);
    form.resetFields();
    form.setFieldsValue({
      entryDate: dayjs(),
      paymentMode: 'BANK_TRANSFER',
      postImmediately: true,
    });
    setLines([
      { key: '1', debit: 0, credit: 0 },
      { key: '2', debit: 0, credit: 0 },
    ]);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (voucherMode === 'CONTRA') {
        await apiService.post('/finance/vouchers/contra', {
          companyId: companyId || undefined,
          entryDate: values.entryDate.format('YYYY-MM-DD'),
          fromAccountId: values.fromAccountId,
          toAccountId: values.toAccountId,
          amount: Number(values.amount),
          divisionId: values.divisionId || null,
          paymentMode: values.paymentMode || 'BANK_TRANSFER',
          chequeNumber: values.chequeNumber || null,
          description: values.description || undefined,
          postImmediately: values.postImmediately !== false,
        });
      } else if (voucherMode === 'PAYMENT' || voucherMode === 'RECEIPT') {
        const amt = Number(values.amount || 0);
        if (amt <= 0) {
          message.error('Voucher amount must be greater than zero');
          setSubmitting(false);
          return;
        }
        const payloadLines =
          voucherMode === 'PAYMENT'
            ? [
              {
                accountId: values.counterAccountId,
                debit: amt,
                credit: 0,
                description: values.description || 'Expense / Party payment',
              },
              {
                accountId: values.cashBankAccountId,
                debit: 0,
                credit: amt,
                description: values.description || 'Cash / Bank disbursement',
              },
            ]
            : [
              {
                accountId: values.cashBankAccountId,
                debit: amt,
                credit: 0,
                description: values.description || 'Cash / Bank receipt',
              },
              {
                accountId: values.counterAccountId,
                debit: 0,
                credit: amt,
                description: values.description || 'Receipt credit',
              },
            ];

        await apiService.post('/finance/journals', {
          companyId: companyId || undefined,
          journalType: voucherMode,
          voucherType: voucherMode === 'PAYMENT' ? 'PV' : 'RV',
          entryDate: values.entryDate.format('YYYY-MM-DD'),
          divisionId: values.divisionId || null,
          paymentMode: values.paymentMode || 'BANK_TRANSFER',
          chequeNumber: values.chequeNumber || null,
          chequeDate: values.chequeDate ? values.chequeDate.format('YYYY-MM-DD') : null,
          bankAccountId: values.cashBankAccountId || null,
          description: values.description || `${voucherMode === 'PAYMENT' ? 'Payment' : 'Receipt'} Voucher`,
          postImmediately: values.postImmediately !== false,
          lines: payloadLines,
        });
      } else {
        const cleanLines = lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          description: l.description,
        }));
        await apiService.post('/finance/journals', {
          companyId: companyId || undefined,
          journalType: 'GENERAL',
          voucherType: 'JV',
          entryDate: values.entryDate.format('YYYY-MM-DD'),
          divisionId: values.divisionId || null,
          description: values.description || 'General Journal Voucher',
          postImmediately: values.postImmediately !== false,
          lines: cleanLines,
        });
      }

      message.success(
        values.postImmediately !== false
          ? 'Voucher saved and posted to General Ledger'
          : 'Voucher saved as Draft',
      );
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Failed to save voucher');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: 'post' | 'reverse') => {
    try {
      await apiService.post(`/finance/journals/${id}/${action}`, undefined);
      message.success(action === 'post' ? 'Voucher posted successfully' : 'Voucher reversed cleanly');
      if (detailVoucher?.id === id) setDetailVoucher(null);
      fetchData();
    } catch (e: any) {
      message.error(e?.response?.data?.message || `Failed to ${action} voucher`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/finance/journals/${id}`);
      message.success('Draft voucher deleted');
      if (detailVoucher?.id === id) setDetailVoucher(null);
      fetchData();
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Cannot delete posted voucher');
    }
  };

  const handleExportCsv = () => {
    downloadCsvFile(
      'PWI_Finance_Vouchers',
      ['Voucher #', 'V-Type', 'Date', 'Accounting Type', 'Division', 'Party', 'Description', 'Debit (PKR)', 'Credit (PKR)', 'Status'],
      data.map((r) => [
        r.journalNumber,
        r.voucherType || 'JV',
        r.entryDate ? dayjs(r.entryDate).format('YYYY-MM-DD') : '',
        r.journalType,
        r.divisionName || '',
        r.partyName || '',
        r.description || '',
        Number(r.totalDebit || 0),
        Number(r.totalCredit || 0),
        r.status,
      ]),
    );
  };

  const summaryStats = useMemo(() => {
    const postedAmt = data
      .filter((r) => r.status === 'POSTED')
      .reduce((s, r) => s + Number(r.totalDebit || 0), 0);
    const postedCount = data.filter((r) => r.status === 'POSTED').length;
    const draftCount = data.filter((r) => r.status === 'DRAFT').length;
    return { postedAmt, postedCount, draftCount };
  }, [data]);

  const columns: ColumnsType<any> = [
    {
      title: 'Voucher #',
      dataIndex: 'journalNumber',
      key: 'journalNumber',
      render: (num: string, r) => (
        <Space size={6}>
          <Tag color={VOUCHER_TAG_COLOR[r.voucherType || 'JV'] || 'blue'}>
            {r.voucherType || 'JV'}
          </Tag>
          <Button
            type="link"
            size="small"
            style={{ padding: 0, fontFamily: 'monospace', fontWeight: 700 }}
            onClick={() => setDetailVoucher(r)}
          >
            {num}
          </Button>
        </Space>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'entryDate',
      key: 'entryDate',
      render: (d: string) => (d ? dayjs(d).format('DD MMM YYYY') : '-'),
    },
    {
      title: 'Source / Category',
      dataIndex: 'journalType',
      key: 'journalType',
      render: (t: string) => <Tag>{String(t || 'GENERAL').replace(/_/g, ' ')}</Tag>,
    },
    {
      title: 'Narration & Party',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string, r) => (
        <div>
          <Text strong>{desc || '-'}</Text>
          {(r.divisionName || r.partyName) && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {[r.divisionName, r.partyName].filter(Boolean).join(' • ')}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Debit (PKR)',
      dataIndex: 'totalDebit',
      key: 'totalDebit',
      align: 'right',
      render: (v) => <Text strong>{formatPkr(v)}</Text>,
    },
    {
      title: 'Credit (PKR)',
      dataIndex: 'totalCredit',
      key: 'totalCredit',
      align: 'right',
      render: (v) => <Text strong>{formatPkr(v)}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <Tag color={s === 'POSTED' ? 'success' : s === 'DRAFT' ? 'processing' : s === 'ARCHIVED' ? 'default' : 'error'}>
          {s}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, r) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<EyeOutlined />} title="View Details" onClick={() => setDetailVoucher(r)} />
          {canPrint && (
            <Button type="text" size="small" icon={<PrinterOutlined />} title="Print Formal Voucher" onClick={() => printFinanceVoucherDocument(r)} />
          )}
          {canPost && r.status === 'DRAFT' && (
            <Button
              type="text"
              size="small"
              icon={<CheckCircleOutlined />}
              style={{ color: token.colorSuccess }}
              title="Post Voucher"
              onClick={() => handleAction(r.id, 'post')}
            />
          )}
          {canReverse && r.status === 'POSTED' && (
            <Popconfirm
              title="Create reversing voucher?"
              onConfirm={() => handleAction(r.id, 'reverse')}
              okText="Reverse"
            >
              <Button type="text" size="small" danger icon={<RollbackOutlined />} title="Reverse Voucher" />
            </Popconfirm>
          )}
          {canDelete && r.status === 'DRAFT' && (
            <Popconfirm title="Delete draft voucher?" onConfirm={() => handleDelete(r.id)} okText="Delete">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} title="Delete Draft" />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const { visibleColumns, selectorProps } = useColumnVisibility('pwi_cols_finance_journals', columns);

  return (
    <div style={{ padding: '24px 24px 56px 24px' }}>
      <PageHeader
        title="Vouchers & Journal Entries"
        subtitle="Record Payment Vouchers (PV), Receipt Vouchers (RV), Contra Transfers (CV), and Journal Vouchers (JV)"
        icon={<EditOutlined />}
        extra={
          <Space wrap>
            <TableColumnSelector {...selectorProps} />
            {canExport && (
              <Button icon={<DownloadOutlined />} onClick={handleExportCsv}>
                Export CSV
              </Button>
            )}
            {canCreate && (
              <>
                <Button onClick={() => openNewVoucherModal('PAYMENT')}>+ Payment (PV)</Button>
                <Button onClick={() => openNewVoucherModal('RECEIPT')}>+ Receipt (RV)</Button>
                <Button onClick={() => openNewVoucherModal('CONTRA')}>+ Contra (CV)</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openNewVoucherModal('GENERAL')}>
                  New Voucher
                </Button>
              </>
            )}
          </Space>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Matching Vouchers" value={total} suffix={`(${summaryStats.postedCount} posted on page)`} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Posted Page Volume" value={formatPkr(summaryStats.postedAmt)} valueStyle={{ color: token.colorPrimary }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="Unposted Drafts (Page)" value={summaryStats.draftCount} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
          <Col xs={24} md={6}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Search voucher #, narration, cheque #..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              allowClear
            />
          </Col>
          <Col xs={12} md={4}>
            <Select
              value={voucherTypeFilter}
              onChange={(v) => {
                setVoucherTypeFilter(v);
                setPage(1);
              }}
              style={{ width: '100%' }}
              options={[
                { label: 'All Voucher Types', value: 'ALL' },
                { label: 'PV — Payment Voucher', value: 'PV' },
                { label: 'RV — Receipt Voucher', value: 'RV' },
                { label: 'CV — Contra Voucher', value: 'CV' },
                { label: 'JV — Journal Voucher', value: 'JV' },
              ]}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
              style={{ width: '100%' }}
              options={[
                { label: 'Active (Excl. Archived)', value: 'ALL_ACTIVE' },
                { label: 'POSTED Only', value: 'POSTED' },
                { label: 'DRAFT Only', value: 'DRAFT' },
                { label: 'REVERSED Only', value: 'REVERSED' },
                { label: 'Archived Test History', value: 'ARCHIVED' },
              ]}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select
              allowClear
              placeholder="All Divisions"
              style={{ width: '100%' }}
              value={divisionFilter}
              onChange={(v) => {
                setDivisionFilter(v);
                setPage(1);
              }}
              options={divisions.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Col>
          <Col xs={12} md={6}>
            <RangePicker
              style={{ width: '100%' }}
              value={dateRange}
              onChange={(vals) => {
                setDateRange(vals ? [vals[0]!, vals[1]!] : null);
                setPage(1);
              }}
            />
          </Col>
        </Row>

        <Table
          columns={visibleColumns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: page,
            total,
            pageSize: 25,
            onChange: setPage,
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        title="Create Accounting Voucher"
        open={modalVisible}
        onOk={handleSubmit}
        confirmLoading={submitting}
        onCancel={() => setModalVisible(false)}
        width={920}
        okText="Save Voucher"
      >
        <Tabs
          activeKey={voucherMode}
          onChange={(k) => setVoucherMode(k as any)}
          items={[
            { key: 'PAYMENT', label: 'Payment Voucher (PV)' },
            { key: 'RECEIPT', label: 'Receipt Voucher (RV)' },
            { key: 'CONTRA', label: 'Contra Transfer (CV)' },
            { key: 'GENERAL', label: 'Multi-Line Journal (JV)' },
          ]}
        />

        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item name="entryDate" label="Voucher Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="divisionId" label="Division / Cost Center">
                <Select
                  allowClear
                  placeholder="Head Office / Shared"
                  options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="postImmediately" label="Post to GL Immediately" valuePropName="checked">
                <Switch checkedChildren="Post Now" unCheckedChildren="Draft" />
              </Form.Item>
            </Col>
          </Row>

          {(voucherMode === 'PAYMENT' || voucherMode === 'RECEIPT') && (
            <>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="cashBankAccountId"
                    label={voucherMode === 'PAYMENT' ? 'Paid From (Cash / Bank Account)' : 'Deposited To (Cash / Bank Account)'}
                    rules={[{ required: true, message: 'Select Cash or Bank account' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select Cash or Bank account"
                      options={bankCashAccounts.map((a) => ({
                        value: a.id,
                        label: `${a.accountCode} - ${a.accountName} (${formatPkr(a.balance || 0)})`,
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="counterAccountId"
                    label={voucherMode === 'PAYMENT' ? 'Expense / Liability Account (Debit)' : 'Income / Capital / Party Account (Credit)'}
                    rules={[{ required: true, message: 'Select ledger account' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select ledger account (e.g. 5400 Utilities, 3000 Capital)"
                      options={nonBankAccounts.map((a) => ({
                        value: a.id,
                        label: `${a.accountCode} - ${a.accountName} (${a.accountType})`,
                      }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col xs={24} sm={8}>
                  <Form.Item name="amount" label="Amount (PKR)" rules={[{ required: true }]}>
                    <InputNumber min={1} precision={2} prefix="Rs " style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="paymentMode" label="Payment Mode">
                    <Select
                      options={[
                        { label: 'Bank Transfer / IBFT', value: 'BANK_TRANSFER' },
                        { label: 'Cheque', value: 'CHEQUE' },
                        { label: 'Cash', value: 'CASH' },
                        { label: 'Pay Order / PO', value: 'PAY_ORDER' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="chequeNumber" label="Cheque / Ref #">
                    <Input placeholder="Optional cheque or ref #" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {voucherMode === 'CONTRA' && (
            <Row gutter={12}>
              <Col xs={24} sm={8}>
                <Form.Item name="fromAccountId" label="From Account (Credit)" rules={[{ required: true }]}>
                  <Select
                    options={bankCashAccounts.map((a) => ({
                      value: a.id,
                      label: `${a.accountCode} - ${a.accountName} (${formatPkr(a.balance || 0)})`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="toAccountId" label="To Account (Debit)" rules={[{ required: true }]}>
                  <Select
                    options={bankCashAccounts.map((a) => ({
                      value: a.id,
                      label: `${a.accountCode} - ${a.accountName}`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="amount" label="Transfer Amount (PKR)" rules={[{ required: true }]}>
                  <InputNumber min={1} precision={2} prefix="Rs " style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          )}

          <Form.Item name="description" label="Voucher Narration" rules={[{ required: true, message: 'Enter voucher narration' }]}>
            <Input.TextArea rows={2} placeholder="Clear accounting description for audit trail..." />
          </Form.Item>

          {voucherMode === 'GENERAL' && (
            <FinanceJournalLineEditor companyId={companyId} value={lines} onChange={setLines} />
          )}
        </Form>
      </Modal>

      <Drawer
        title={
          detailVoucher ? (
            <Space>
              <Tag color={VOUCHER_TAG_COLOR[detailVoucher.voucherType || 'JV'] || 'blue'}>
                {detailVoucher.voucherType || 'JV'}
              </Tag>
              <span>Voucher {detailVoucher.journalNumber}</span>
              <Tag color={detailVoucher.status === 'POSTED' ? 'success' : 'processing'}>
                {detailVoucher.status}
              </Tag>
            </Space>
          ) : (
            'Voucher Details'
          )
        }
        open={Boolean(detailVoucher)}
        onClose={() => setDetailVoucher(null)}
        width={760}
        extra={
          detailVoucher && (
            <Space>
              {canPrint && (
                <Button icon={<PrinterOutlined />} type="primary" onClick={() => printFinanceVoucherDocument(detailVoucher)}>
                  Print Voucher
                </Button>
              )}
              {canPost && detailVoucher.status === 'DRAFT' && (
                <Button onClick={() => handleAction(detailVoucher.id, 'post')}>Post Now</Button>
              )}
            </Space>
          )
        }
      >
        {detailVoucher && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Voucher #">{detailVoucher.journalNumber}</Descriptions.Item>
              <Descriptions.Item label="Date">
                {detailVoucher.entryDate ? dayjs(detailVoucher.entryDate).format('DD MMM YYYY') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Accounting Type">
                {String(detailVoucher.journalType || '').replace(/_/g, ' ')}
              </Descriptions.Item>
              <Descriptions.Item label="Period">
                {detailVoucher.period?.periodName || detailVoucher.period?.periodCode || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Division">
                {detailVoucher.divisionName || 'Head Office / Shared'}
              </Descriptions.Item>
              <Descriptions.Item label="Party / Counterparty">
                {detailVoucher.partyName || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Narration" span={2}>
                {detailVoucher.description || '-'}
              </Descriptions.Item>
            </Descriptions>

            <Table
              dataSource={detailVoucher.lines || []}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
              columns={[
                { title: '#', dataIndex: 'lineNumber', width: 45 },
                {
                  title: 'Account',
                  key: 'acct',
                  render: (_: unknown, l: any) => (
                    <Space>
                      <Text code>{l.account?.accountCode}</Text>
                      <Text>{l.account?.accountName}</Text>
                    </Space>
                  ),
                },
                { title: 'Particulars', dataIndex: 'description' },
                {
                  title: 'Debit (PKR)',
                  dataIndex: 'debit',
                  align: 'right',
                  render: (v) => (Number(v) > 0 ? formatPkr(v) : '-'),
                },
                {
                  title: 'Credit (PKR)',
                  dataIndex: 'credit',
                  align: 'right',
                  render: (v) => (Number(v) > 0 ? formatPkr(v) : '-'),
                },
              ]}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3} align="right">
                    <Text strong>TOTAL (PKR)</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Text strong>{formatPkr(detailVoucher.totalDebit)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Text strong>{formatPkr(detailVoucher.totalCredit)}</Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </>
        )}
      </Drawer>
    </div>
  );
};

export default JournalEntries;
