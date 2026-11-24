import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Row,
  Col,
  Statistic,
  Select,
  DatePicker,
  Button,
  Space,
  Tag,
  Typography,
  Modal,
  Form,
  InputNumber,
  Input,
  App,
  theme,
} from 'antd';
import {
  BankOutlined,
  SwapOutlined,
  PrinterOutlined,
  DownloadOutlined,
  ReloadOutlined,
  WalletOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import apiService from '../../services/api';
import { PageHeader } from '../../components/shared';
import { formatPkr, downloadCsvFile, FISCAL_PRESETS, resolveFiscalPresetRange, FiscalPresetKey } from '../../utils/financeHelpers';
import { printFinancialStatementHtml } from '../../utils/printTemplates';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const CashBankBook: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const navigate = useNavigate();

  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [divisions, setDivisions] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | undefined>();
  const [preset, setPreset] = useState<FiscalPresetKey>('ALL');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);

  const [contraOpen, setContraOpen] = useState(false);
  const [submittingContra, setSubmittingContra] = useState(false);
  const [contraForm] = Form.useForm();

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
      .catch(() => {});
  }, []);

  const fetchBook = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get<any>('/finance/reports/cash-bank-book', {
        companyId: companyId || undefined,
        accountId: selectedAccountId || undefined,
        divisionId: selectedDivisionId || undefined,
        from: dateRange ? dateRange[0].format('YYYY-MM-DD') : undefined,
        to: dateRange ? dateRange[1].format('YYYY-MM-DD') : undefined,
      });
      setData(res);
    } catch {
      message.error('Failed to load Cash & Bank Book');
    } finally {
      setLoading(false);
    }
  }, [companyId, selectedAccountId, selectedDivisionId, dateRange, message]);

  useEffect(() => {
    fetchBook();
  }, [fetchBook]);

  const handlePresetChange = (val: FiscalPresetKey) => {
    setPreset(val);
    setDateRange(resolveFiscalPresetRange(val));
  };

  const handleContraSubmit = async () => {
    try {
      const values = await contraForm.validateFields();
      setSubmittingContra(true);
      await apiService.post('/finance/vouchers/contra', {
        companyId: companyId || undefined,
        entryDate: values.entryDate.format('YYYY-MM-DD'),
        fromAccountId: values.fromAccountId,
        toAccountId: values.toAccountId,
        amount: Number(values.amount),
        divisionId: values.divisionId || undefined,
        paymentMode: values.paymentMode || 'BANK_TRANSFER',
        chequeNumber: values.chequeNumber || undefined,
        description: values.description || undefined,
        postImmediately: true,
      });
      message.success('Contra transfer voucher posted successfully');
      setContraOpen(false);
      contraForm.resetFields();
      fetchBook();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to create contra transfer');
    } finally {
      setSubmittingContra(false);
    }
  };

  const accounts: any[] = data?.accounts || [];
  const transactions: any[] = data?.transactions || [];
  const sum = data?.summary || { totalCash: 0, totalBank: 0, totalChequesInHand: 0, grandTotal: 0 };

  const handlePrint = () => {
    const selAcct = accounts.find((a) => a.id === selectedAccountId);
    printFinancialStatementHtml({
      title: selAcct ? `Cash & Bank Book — ${selAcct.accountCode} ${selAcct.accountName}` : 'Cash & Bank Book (Consolidated)',
      periodLabel: dateRange
        ? `${dateRange[0].format('DD MMM YYYY')} to ${dateRange[1].format('DD MMM YYYY')}`
        : 'All Dates (Cumulative)',
      divisionLabel: divisions.find((d) => d.id === selectedDivisionId)?.name || 'All Divisions',
      summaryPairs: [
        { label: 'Cash in Hand (1000)', value: formatPkr(sum.totalCash) },
        { label: 'Bank Balances', value: formatPkr(sum.totalBank) },
        { label: 'Total Inflows', value: formatPkr(data?.totalInflow || 0) },
        { label: 'Closing Balance', value: formatPkr(data?.closingBalance || 0) },
      ],
      headers: ['Date', 'Voucher #', 'Account', 'Particulars', 'Mode / Chq', 'Inflow (Dr)', 'Outflow (Cr)', 'Balance (PKR)'],
      rows: transactions.map((t) => [
        t.entryDate ? dayjs(t.entryDate).format('DD MMM YYYY') : '-',
        t.journalNumber || '-',
        `${t.accountCode} ${t.accountName}`,
        t.description || '-',
        [t.paymentMode, t.chequeNumber ? `Chq #${t.chequeNumber}` : ''].filter(Boolean).join(' ') || '-',
        t.inflow > 0 ? formatPkr(t.inflow) : '-',
        t.outflow > 0 ? formatPkr(t.outflow) : '-',
        formatPkr(t.runningBalance),
      ]),
      rightAlignCols: [5, 6, 7],
    });
  };

  const handleExportCsv = () => {
    downloadCsvFile(
      'PWI_Cash_Bank_Book',
      ['Date', 'Voucher #', 'Voucher Type', 'Account Code', 'Account Title', 'Description', 'Mode', 'Cheque #', 'Inflow (Dr)', 'Outflow (Cr)', 'Running Balance'],
      transactions.map((t) => [
        t.entryDate ? dayjs(t.entryDate).format('YYYY-MM-DD') : '',
        t.journalNumber || '',
        t.voucherType || 'JV',
        t.accountCode || '',
        t.accountName || '',
        t.description || '',
        t.paymentMode || '',
        t.chequeNumber || '',
        t.inflow || 0,
        t.outflow || 0,
        t.runningBalance || 0,
      ]),
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Cash & Bank Book"
        subtitle="Real-time Cash in Hand, corporate Bank balances, Uncleared Cheques, and Contra transfers in PKR"
        icon={<BankOutlined />}
        extra={
          <Space wrap>
            <Button icon={<BankOutlined />} onClick={() => navigate('/finance/accounts')}>
              Manage Bank Accounts
            </Button>
            <Button
              type="primary"
              icon={<SwapOutlined />}
              onClick={() => {
                contraForm.setFieldsValue({ entryDate: dayjs(), paymentMode: 'BANK_TRANSFER' });
                setContraOpen(true);
              }}
            >
              Contra Transfer (CV)
            </Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="Cash in Hand (1000)"
              value={formatPkr(sum.totalCash)}
              prefix={<WalletOutlined />}
              valueStyle={{ color: token.colorSuccess }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="Bank Accounts (PKR)"
              value={formatPkr(sum.totalBank)}
              prefix={<BankOutlined />}
              valueStyle={{ color: token.colorPrimary }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="Cheques in Hand (1020)"
              value={formatPkr(sum.totalChequesInHand)}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="Total Liquid Treasury"
              value={formatPkr(sum.grandTotal)}
              valueStyle={{ color: token.colorPrimary, fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Cash & Bank Account Balances" size="small" style={{ marginBottom: 16 }}>
        <Table
          dataSource={accounts}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 760 }}
          columns={[
            {
              title: 'Code',
              dataIndex: 'accountCode',
              width: 90,
              render: (c) => <Text code strong>{c}</Text>,
            },
            {
              title: 'Account / Bank Name',
              key: 'name',
              render: (_, a) => (
                <Space>
                  <Button
                    type="link"
                    style={{ padding: 0, fontWeight: selectedAccountId === a.id ? 700 : 500 }}
                    onClick={() => setSelectedAccountId(selectedAccountId === a.id ? undefined : a.id)}
                  >
                    {a.accountName}
                  </Button>
                  {a.bankName ? <Tag>{a.bankName}</Tag> : null}
                  {a.bankAccountNumber ? <Text type="secondary">A/C: {a.bankAccountNumber}</Text> : null}
                </Space>
              ),
            },
            { title: 'Opening', dataIndex: 'openingBalance', align: 'right', render: (v) => formatPkr(v) },
            { title: 'Total Receipts (Dr)', dataIndex: 'totalInflow', align: 'right', render: (v) => formatPkr(v) },
            { title: 'Total Payments (Cr)', dataIndex: 'totalOutflow', align: 'right', render: (v) => formatPkr(v) },
            {
              title: 'Closing Balance',
              dataIndex: 'closingBalance',
              align: 'right',
              render: (v) => <Text strong>{formatPkr(v)}</Text>,
            },
          ]}
        />
      </Card>

      <Card>
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }} align="middle">
          <Col xs={24} sm={12} lg={5}>
            <Select
              allowClear
              placeholder="All Cash & Bank Accounts"
              style={{ width: '100%' }}
              value={selectedAccountId}
              onChange={setSelectedAccountId}
              options={accounts.map((a) => ({
                value: a.id,
                label: `${a.accountCode} - ${a.accountName}`,
              }))}
            />
          </Col>
          <Col xs={24} sm={12} lg={5}>
            <Select
              value={preset}
              onChange={handlePresetChange}
              style={{ width: '100%' }}
              options={FISCAL_PRESETS}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <RangePicker
              style={{ width: '100%' }}
              value={dateRange}
              onChange={(vals) => {
                setPreset(vals ? 'CUSTOM' : 'ALL');
                setDateRange(vals ? [vals[0]!, vals[1]!] : null);
              }}
            />
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <Select
              allowClear
              placeholder="All Divisions"
              style={{ width: '100%' }}
              value={selectedDivisionId}
              onChange={setSelectedDivisionId}
              options={divisions.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Col>
          <Col xs={24} lg={4} style={{ textAlign: 'right' }}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={fetchBook} loading={loading} />
              <Button icon={<DownloadOutlined />} onClick={handleExportCsv} />
              <Button icon={<PrinterOutlined />} onClick={handlePrint} />
            </Space>
          </Col>
        </Row>

        <Table
          loading={loading}
          dataSource={transactions}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 25 }}
          scroll={{ x: 900 }}
          columns={[
            {
              title: 'Date',
              dataIndex: 'entryDate',
              width: 110,
              render: (d) => (d ? dayjs(d).format('DD MMM YYYY') : '-'),
            },
            {
              title: 'Voucher #',
              dataIndex: 'journalNumber',
              width: 150,
              render: (v, r) => (
                <Space size={4}>
                  <Tag color={r.voucherType === 'RV' ? 'green' : r.voucherType === 'PV' ? 'red' : 'blue'}>
                    {r.voucherType || 'JV'}
                  </Tag>
                  <Text code>{v}</Text>
                </Space>
              ),
            },
            {
              title: 'Cash / Bank Account',
              key: 'acct',
              width: 210,
              render: (_, r) => `${r.accountCode} - ${r.accountName}`,
            },
            { title: 'Particulars', dataIndex: 'description' },
            {
              title: 'Inflow (Debit)',
              dataIndex: 'inflow',
              align: 'right',
              width: 130,
              render: (v) => (Number(v) > 0 ? <Text style={{ color: token.colorSuccess }} strong>{formatPkr(v)}</Text> : '-'),
            },
            {
              title: 'Outflow (Credit)',
              dataIndex: 'outflow',
              align: 'right',
              width: 130,
              render: (v) => (Number(v) > 0 ? <Text style={{ color: token.colorError }} strong>{formatPkr(v)}</Text> : '-'),
            },
            {
              title: 'Running Balance',
              dataIndex: 'runningBalance',
              align: 'right',
              width: 145,
              render: (v) => <Text strong>{formatPkr(v)}</Text>,
            },
          ]}
        />
      </Card>

      <Modal
        title="New Cash / Bank Contra Transfer (CV)"
        open={contraOpen}
        onOk={handleContraSubmit}
        confirmLoading={submittingContra}
        onCancel={() => setContraOpen(false)}
        okText="Post Contra Transfer"
        width={560}
      >
        <Form form={contraForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="entryDate" label="Transfer Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="amount" label="Transfer Amount (PKR)" rules={[{ required: true }]}>
                <InputNumber min={1} precision={2} prefix="Rs " style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fromAccountId" label="From (Credit / Source)" rules={[{ required: true }]}>
                <Select
                  placeholder="Select source Cash/Bank"
                  options={accounts.map((a) => ({
                    value: a.id,
                    label: `${a.accountCode} - ${a.accountName} (${formatPkr(a.closingBalance)})`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="toAccountId" label="To (Debit / Destination)" rules={[{ required: true }]}>
                <Select
                  placeholder="Select destination Cash/Bank"
                  options={accounts.map((a) => ({
                    value: a.id,
                    label: `${a.accountCode} - ${a.accountName}`,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="paymentMode" label="Transfer Mode">
                <Select
                  options={[
                    { label: 'Bank Transfer / IBFT', value: 'BANK_TRANSFER' },
                    { label: 'Cash Deposit / Withdrawal', value: 'CASH' },
                    { label: 'Cheque Deposit', value: 'CHEQUE' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="chequeNumber" label="Cheque / Slip Reference">
                <Input placeholder="Optional slip or cheque #" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Narration">
            <Input.TextArea rows={2} placeholder="e.g. Cash deposited from factory cash desk to primary current bank account" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CashBankBook;
