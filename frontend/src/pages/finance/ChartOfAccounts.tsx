import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  App,
  Row,
  Col,
  Tag,
  Space,
  Switch,
  Statistic,
  Typography,
  Popconfirm,
  theme,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  DeleteOutlined,
  EditOutlined,
  BookOutlined,
  DownloadOutlined,
  BankOutlined,
  SafetyCertificateOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader } from '../../components/shared';
import { formatPkr, downloadCsvFile } from '../../utils/financeHelpers';
import AccountLedgerModal from './AccountLedgerModal';
import { usePermission } from '../../hooks/usePermission';

const { Text } = Typography;

interface Account {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  normalBalance: 'DEBIT' | 'CREDIT';
  parentAccountId?: string | null;
  parentAccount?: { id: string; accountCode: string; accountName: string } | null;
  currency: string;
  isBankCash: boolean;
  isAr: boolean;
  isAp: boolean;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  notes?: string | null;
  status: string;
  totalDebit?: number;
  totalCredit?: number;
  balance?: number;
}

const TYPE_COLOR_MAP: Record<string, string> = {
  ASSET: 'blue',
  LIABILITY: 'orange',
  EQUITY: 'purple',
  REVENUE: 'green',
  EXPENSE: 'red',
};

const ChartOfAccounts: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { can } = usePermission();
  const canCreate = can('finance.account.create');
  const canUpdate = can('finance.account.update');
  const canDelete = can('finance.account.delete');
  const canExport = can('finance.account.export');
  const [data, setData] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [ledgerModalAccount, setLedgerModalAccount] = useState<Account | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try {
        const p = JSON.parse(erpUser);
        if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId);
      } catch {
        // ignore parse failure
      }
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get<{ data: Account[] }>('/finance/accounts', {
        companyId: companyId || undefined,
        search: search || undefined,
      });
      setData(res.data || []);
    } catch {
      message.error('Failed to fetch Chart of Accounts');
    } finally {
      setLoading(false);
    }
  }, [companyId, search, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredData = useMemo(() => {
    if (typeFilter === 'ALL') return data;
    if (typeFilter === 'BANK_CASH') {
      return data.filter(
        (a) => a.isBankCash || ['1000', '1010', '1011', '1012', '1020'].includes(a.accountCode),
      );
    }
    return data.filter((a) => a.accountType === typeFilter);
  }, [data, typeFilter]);

  const summary = useMemo(() => {
    const assets = data
      .filter((a) => a.accountType === 'ASSET')
      .reduce((s, a) => s + Number(a.balance || 0), 0);
    const liabilities = data
      .filter((a) => a.accountType === 'LIABILITY')
      .reduce((s, a) => s + Number(a.balance || 0), 0);
    const revenue = data
      .filter((a) => a.accountType === 'REVENUE')
      .reduce((s, a) => s + Number(a.balance || 0), 0);
    const bankCashCount = data.filter((a) => a.isBankCash).length;
    return { assets, liabilities, revenue, bankCashCount };
  }, [data]);

  const openCreateModal = () => {
    setEditingAccount(null);
    form.resetFields();
    form.setFieldsValue({
      accountType: 'ASSET',
      normalBalance: 'DEBIT',
      currency: 'PKR',
      isBankCash: false,
      isAr: false,
      isAp: false,
      status: 'ACTIVE',
    });
    setModalVisible(true);
  };

  const openEditModal = (record: Account) => {
    setEditingAccount(record);
    form.setFieldsValue({
      accountCode: record.accountCode,
      accountName: record.accountName,
      accountType: record.accountType,
      normalBalance: record.normalBalance,
      parentAccountId: record.parentAccountId || undefined,
      currency: record.currency || 'PKR',
      isBankCash: Boolean(record.isBankCash),
      isAr: Boolean(record.isAr),
      isAp: Boolean(record.isAp),
      bankName: record.bankName || '',
      bankAccountNumber: record.bankAccountNumber || '',
      notes: record.notes || '',
      status: record.status || 'ACTIVE',
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingAccount) {
        await apiService.patch(`/finance/accounts/${editingAccount.id}`, values);
        message.success('Ledger account updated successfully');
      } else {
        await apiService.post('/finance/accounts', { ...values, companyId: companyId || undefined });
        message.success('Ledger account created successfully');
      }
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to save account');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/finance/accounts/${id}`);
      message.success('Account deleted');
      fetchData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Cannot delete account with journal entries or child accounts');
    }
  };

  const handleSeedStandard = async () => {
    setSeeding(true);
    try {
      const res = await apiService.post<{ data?: { seededCount?: number } }>(
        '/finance/accounts/seed-standard',
        undefined,
      );
      const count = res?.data?.seededCount ?? 0;
      message.success(
        count > 0
          ? `Added ${count} missing corporate COA account(s) in PKR`
          : 'All standard Pakistani corporate COA accounts are already configured',
      );
      fetchData();
    } catch {
      message.error('Failed to verify corporate COA');
    } finally {
      setSeeding(false);
    }
  };

  const handleExportCsv = () => {
    downloadCsvFile(
      'PWI_Chart_of_Accounts',
      ['Code', 'Account Title', 'Type', 'Normal Balance', 'Parent', 'Bank/Control', 'Bank Details', 'Currency', 'Debit (PKR)', 'Credit (PKR)', 'Closing Balance (PKR)', 'Status'],
      filteredData.map((a) => [
        a.accountCode,
        a.accountName,
        a.accountType,
        a.normalBalance,
        a.parentAccount ? `${a.parentAccount.accountCode} ${a.parentAccount.accountName}` : '',
        a.isBankCash ? 'Bank/Cash' : a.isAr ? 'AR Control' : a.isAp ? 'AP Control' : '',
        [a.bankName, a.bankAccountNumber].filter(Boolean).join(' - '),
        a.currency || 'PKR',
        Number(a.totalDebit || 0),
        Number(a.totalCredit || 0),
        Number(a.balance || 0),
        a.status,
      ]),
    );
  };

  const columns: ColumnsType<Account> = [
    {
      title: 'Code',
      dataIndex: 'accountCode',
      key: 'accountCode',
      render: (code, r) => (
        <Space size={4}>
          {r.parentAccountId ? <Text type="secondary">{'\u2514'}</Text> : null}
          <Text code strong>
            {code}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Account Title',
      dataIndex: 'accountName',
      key: 'accountName',
      render: (name, r) => (
        <div>
          <Text strong={!r.parentAccountId}>{name}</Text>
          {r.bankName || r.bankAccountNumber ? (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {[r.bankName, r.bankAccountNumber].filter(Boolean).join(' | A/C: ')}
              </Text>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Class',
      dataIndex: 'accountType',
      key: 'accountType',
      render: (t: string) => <Tag color={TYPE_COLOR_MAP[t] || 'default'}>{t}</Tag>,
    },
    {
      title: 'Normal',
      dataIndex: 'normalBalance',
      key: 'normalBalance',
      render: (n: string) => <Tag>{n}</Tag>,
    },
    {
      title: 'Classification',
      key: 'flags',
      render: (_, r) => (
        <Space size={4} wrap>
          {r.isBankCash && (
            <Tag icon={<BankOutlined />} color="cyan">
              Bank / Cash
            </Tag>
          )}
          {r.isAr && <Tag color="blue">AR Control</Tag>}
          {r.isAp && <Tag color="orange">AP Control</Tag>}
          {!r.isBankCash && !r.isAr && !r.isAp && r.parentAccount && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Sub of {r.parentAccount.accountCode}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Currency',
      dataIndex: 'currency',
      key: 'currency',
      align: 'center',
      render: (c) => <Tag>{c || 'PKR'}</Tag>,
    },
    {
      title: 'Live Balance (PKR)',
      dataIndex: 'balance',
      key: 'balance',
      align: 'right',
      render: (val: number, r) => {
        const bal = Number(val || 0);
        const color =
          Math.abs(bal) < 0.01
            ? token.colorTextTertiary
            : r.accountType === 'REVENUE' || r.accountType === 'ASSET'
              ? token.colorPrimary
              : token.colorText;
        return (
          <Button
            type="link"
            size="small"
            onClick={() => setLedgerModalAccount(r)}
            style={{ fontWeight: 700, padding: 0, color }}
          >
            {formatPkr(bal)}
          </Button>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (s: string) => <Tag color={s === 'ACTIVE' ? 'success' : 'default'}>{s}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 145,
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<BookOutlined />}
            title="View Account Ledger"
            onClick={() => setLedgerModalAccount(record)}
          />
          {canUpdate && (
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              title="Edit Account"
              onClick={() => openEditModal(record)}
            />
          )}
          {canDelete && (
            <Popconfirm
              title="Delete this account?"
              description="Only accounts with zero journal entries and no sub-accounts can be deleted."
              onConfirm={() => handleDelete(record.id)}
              okText="Delete"
            >
              <Button type="text" danger size="small" icon={<DeleteOutlined />} title="Delete Account" />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const isBankCashWatched = Form.useWatch('isBankCash', form);

  return (
    <div style={{ padding: '24px 24px 56px 24px' }}>
      <PageHeader
        title="Chart of Accounts"
        subtitle="Corporate General Ledger structure, configurable bank sub-accounts, and live PKR balances"
        icon={<DatabaseOutlined />}
        extra={
          <Space wrap>
            {(canCreate || canUpdate) && (
              <Button icon={<SafetyCertificateOutlined />} loading={seeding} onClick={handleSeedStandard}>
                Verify Corporate COA
              </Button>
            )}
            {canExport && (
              <Button icon={<DownloadOutlined />} onClick={handleExportCsv}>
                Export CSV
              </Button>
            )}
            {canCreate && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                Add Ledger / Bank Account
              </Button>
            )}
          </Space>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Total Ledger Accounts" value={data.length} suffix={`(${summary.bankCashCount} Cash/Bank)`} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Total Assets" value={formatPkr(summary.assets)} valueStyle={{ color: token.colorPrimary }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Total Liabilities" value={formatPkr(summary.liabilities)} valueStyle={{ color: token.colorWarning }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Posted Sales / Revenue" value={formatPkr(summary.revenue)} valueStyle={{ color: token.colorSuccess }} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }} align="middle">
          <Col xs={24} md={10}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Search by account code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} md={14}>
            <Space wrap>
              {[
                { key: 'ALL', label: `All (${data.length})` },
                { key: 'BANK_CASH', label: 'Bank & Cash' },
                { key: 'ASSET', label: 'Assets' },
                { key: 'LIABILITY', label: 'Liabilities' },
                { key: 'EQUITY', label: 'Equity' },
                { key: 'REVENUE', label: 'Revenue' },
                { key: 'EXPENSE', label: 'Expenses' },
              ].map((btn) => (
                <Button
                  key={btn.key}
                  size="small"
                  type={typeFilter === btn.key ? 'primary' : 'default'}
                  onClick={() => setTypeFilter(btn.key)}
                >
                  {btn.label}
                </Button>
              ))}
            </Space>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 50, showSizeChanger: true }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        title={editingAccount ? `Edit Account: ${editingAccount.accountCode}` : 'Create Ledger / Bank Account'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={620}
        okText={editingAccount ? 'Save Changes' : 'Create Account'}
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={(changed) => {
            if (changed.accountType) {
              const isDr = changed.accountType === 'ASSET' || changed.accountType === 'EXPENSE';
              form.setFieldValue('normalBalance', isDr ? 'DEBIT' : 'CREDIT');
            }
          }}
        >
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="accountCode" label="Account Code" rules={[{ required: true }]}>
                <Input placeholder="e.g. 1013" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="accountName" label="Account Title" rules={[{ required: true }]}>
                <Input placeholder="e.g. Meezan Bank - Main Collection (PKR)" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="accountType" label="Account Class" rules={[{ required: true }]}>
                <Select
                  options={['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((v) => ({
                    label: v,
                    value: v,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="normalBalance" label="Normal Balance" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: 'DEBIT', value: 'DEBIT' },
                    { label: 'CREDIT', value: 'CREDIT' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: 'PKR (Pakistani Rupee)', value: 'PKR' },
                    { label: 'USD', value: 'USD' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={16}>
              <Form.Item name="parentAccountId" label="Parent Header Account (Optional)">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select parent account (e.g. 1010 Bank Accounts)"
                  options={data
                    .filter((a) => !editingAccount || a.id !== editingAccount.id)
                    .map((a) => ({
                      value: a.id,
                      label: `${a.accountCode} - ${a.accountName}`,
                    }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="Status">
                <Select
                  options={[
                    { label: 'ACTIVE', value: 'ACTIVE' },
                    { label: 'INACTIVE', value: 'INACTIVE' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 8 }}>
            <Col span={8}>
              <Form.Item name="isBankCash" label="Bank / Cash Account" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isAr" label="AR Control Account" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isAp" label="AP Control Account" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          {isBankCashWatched && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="bankName" label="Bank Name & Branch">
                  <Input placeholder="e.g. Meezan Bank, SITE II Karachi" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="bankAccountNumber" label="Account # / IBAN">
                  <Input placeholder="e.g. PK45MEZN0002..." />
                </Form.Item>
              </Col>
            </Row>
          )}

          <Form.Item name="notes" label="Notes / Purpose">
            <Input.TextArea rows={2} placeholder="Optional accounting description or posting rules" />
          </Form.Item>
        </Form>
      </Modal>

      <AccountLedgerModal
        open={Boolean(ledgerModalAccount)}
        onClose={() => setLedgerModalAccount(null)}
        companyId={companyId}
        accountId={ledgerModalAccount?.id || null}
        accountLabel={
          ledgerModalAccount
            ? `${ledgerModalAccount.accountCode} — ${ledgerModalAccount.accountName}`
            : undefined
        }
      />
    </div>
  );
};

export default ChartOfAccounts;
