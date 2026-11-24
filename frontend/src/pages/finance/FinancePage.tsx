import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Row,
  Col,
  Statistic,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  PlusOutlined,
  BankOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  EditOutlined,
  WalletOutlined,
  ReloadOutlined,
  CalculatorOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { PageHeader } from '../../components/shared';
import { formatPkr } from '../../utils/financeHelpers';

const { Text } = Typography;

const FinancePage: React.FC = () => {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [accountsCount, setAccountsCount] = useState(0);
  const [cashBank, setCashBank] = useState<any>(null);
  const [pl, setPl] = useState<any>(null);
  const [bs, setBs] = useState<any>(null);
  const [ar, setAr] = useState<any>(null);
  const [ap, setAp] = useState<any>(null);
  const [recentJournals, setRecentJournals] = useState<any[]>([]);

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
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const q = companyId ? { companyId } : undefined;
      const [acctRes, cbRes, plRes, bsRes, arRes, apRes, jvRes] = await Promise.allSettled([
        apiService.get<{ data: any[] }>('/finance/accounts', q),
        apiService.get<any>('/finance/reports/cash-bank-book', q),
        apiService.get<any>('/finance/reports/pl', q),
        apiService.get<any>('/finance/reports/balance-sheet', q),
        apiService.get<any>('/finance/reports/ar', q),
        apiService.get<any>('/finance/reports/ap', q),
        apiService.get<{ data: any[] }>('/finance/journals', { ...q, limit: 10 }),
      ]);
      if (acctRes.status === 'fulfilled') setAccountsCount((acctRes.value.data || []).length);
      if (cbRes.status === 'fulfilled') setCashBank(cbRes.value);
      if (plRes.status === 'fulfilled') setPl(plRes.value);
      if (bsRes.status === 'fulfilled') setBs(bsRes.value);
      if (arRes.status === 'fulfilled') setAr(arRes.value);
      if (apRes.status === 'fulfilled') setAp(apRes.value);
      if (jvRes.status === 'fulfilled') setRecentJournals(jvRes.value.data || []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Finance & Accounting Overview"
        subtitle="Real-time PKR Treasury, Receivables, Payables, GST, and Financial Statements for Pakistan Wire Industries"
        icon={<CalculatorOutlined />}
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={loadOverview} loading={loading}>
              Refresh
            </Button>
            <Button icon={<DatabaseOutlined />} onClick={() => navigate('/finance/accounts')}>
              Chart of Accounts
            </Button>
            <Button icon={<BankOutlined />} onClick={() => navigate('/finance/cash-bank')}>
              Cash & Bank Book
            </Button>
            <Button icon={<BarChartOutlined />} onClick={() => navigate('/finance/reports')}>
              Financial Reports
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/finance/journals')}>
              New Voucher
            </Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/finance/cash-bank')}>
            <Statistic
              title="Liquid Cash & Bank (PKR)"
              value={formatPkr(cashBank?.summary?.grandTotal ?? 0)}
              prefix={<WalletOutlined />}
              valueStyle={{ color: token.colorSuccess }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/finance/reports?tab=ar')}>
            <Statistic
              title="Accounts Receivable (AR)"
              value={formatPkr(ar?.summary?.totalOutstanding ?? ar?.total ?? 0)}
              valueStyle={{ color: token.colorPrimary }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/finance/reports?tab=ap')}>
            <Statistic
              title="AP & Unbilled GRNs"
              value={formatPkr(ap?.summary?.totalLiability ?? ap?.total ?? 0)}
              valueStyle={{ color: token.colorWarning }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/finance/reports?tab=pl')}>
            <Statistic
              title="FY Net Revenue / Profit"
              value={formatPkr(pl?.netProfit ?? 0)}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>Rev: {formatPkr(pl?.revenue ?? 0)}</Text>}
              valueStyle={{ color: token.colorPrimary }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic title="Active Ledger Accounts" value={accountsCount} suffix="PKR COA" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic title="Balance Sheet Assets" value={formatPkr(bs?.assets ?? 0)} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic title="Liabilities + Equity" value={formatPkr(bs?.totalLiabilitiesAndEquity ?? 0)} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="Balance Sheet Integrity"
              value={bs?.balanced ? 'BALANCED' : 'CHECK'}
              valueStyle={{ color: bs?.balanced ? token.colorSuccess : token.colorError }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="Recent Posted Vouchers & Automated Journals"
        extra={
          <Button icon={<EditOutlined />} onClick={() => navigate('/finance/journals')}>
            Open Voucher Register
          </Button>
        }
      >
        <Table
          loading={loading}
          dataSource={recentJournals}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 820 }}
          columns={[
            {
              title: 'Voucher #',
              dataIndex: 'journalNumber',
              width: 170,
              render: (v, r) => (
                <Space size={4}>
                  <Tag color={r.voucherType === 'RV' ? 'green' : r.voucherType === 'PV' ? 'red' : 'blue'}>
                    {r.voucherType || 'JV'}
                  </Tag>
                  <Text code strong>{v}</Text>
                </Space>
              ),
            },
            {
              title: 'Date',
              dataIndex: 'entryDate',
              width: 115,
              render: (d) => (d ? dayjs(d).format('DD MMM YYYY') : '-'),
            },
            {
              title: 'Category',
              dataIndex: 'journalType',
              width: 145,
              render: (t) => <Tag>{String(t || 'GENERAL').replace(/_/g, ' ')}</Tag>,
            },
            { title: 'Description', dataIndex: 'description' },
            {
              title: 'Amount (PKR)',
              dataIndex: 'totalDebit',
              align: 'right',
              width: 145,
              render: (v) => <Text strong>{formatPkr(v)}</Text>,
            },
            {
              title: 'Status',
              dataIndex: 'status',
              width: 100,
              render: (s) => <Tag color={s === 'POSTED' ? 'success' : 'processing'}>{s}</Tag>,
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default FinancePage;
