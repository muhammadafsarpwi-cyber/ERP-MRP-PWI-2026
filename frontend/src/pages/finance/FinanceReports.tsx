import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tabs,  Row, Col, Statistic, Typography } from 'antd';
import apiService from '../../services/api';
import { PageHeader } from '../../components/shared';

const FinanceReports: React.FC = () => {
  const [companyId, setCompanyId] = useState('');
  const [tb, setTb] = useState<any>(null);
  const [pl, setPl] = useState<any>(null);
  const [bs, setBs] = useState<any>(null);
  const [ar, setAr] = useState<any>(null);
  const [ap, setAp] = useState<any>(null);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    const g = async (path: string) => { try { const r = await apiService.get(path, { companyId }); return r; } catch { return null; } };
    setTb(await g('/finance/reports/trial-balance'));
    setPl(await g('/finance/reports/pl'));
    setBs(await g('/finance/reports/balance-sheet'));
    setAr(await g('/finance/reports/ar'));
    setAp(await g('/finance/reports/ap'));
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const tbCols = [
    { title: 'Code', dataIndex: 'accountCode', key: 'code', width: 90 },
    { title: 'Account', dataIndex: 'accountName', key: 'name' },
    { title: 'Type', dataIndex: 'accountType', key: 'type', width: 100 },
    { title: 'Debit', dataIndex: 'totalDebit', key: 'debit', align: 'right' as const, render: (v: string) => Number(v).toLocaleString() },
    { title: 'Credit', dataIndex: 'totalCredit', key: 'credit', align: 'right' as const, render: (v: string) => Number(v).toLocaleString() },
  ];

  const balanceCols = [
    { title: 'Code', dataIndex: 'accountCode', key: 'code', width: 90 },
    { title: 'Account', dataIndex: 'accountName', key: 'name' },
    { title: 'Type', dataIndex: 'accountType', key: 'type', width: 100 },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', align: 'right' as const, render: (v: number) => Number(v).toLocaleString() },
  ];

  const tabs = [
    {
      key: 'tb', label: 'Trial Balance',
      children: (
        <div>
          <Row gutter={16} style={{ marginBottom: 12 }}>
            <Col span={8}><Card><Statistic title="Total Debit" value={tb?.totalDebit ?? 0} precision={2} /></Card></Col>
            <Col span={8}><Card><Statistic title="Total Credit" value={tb?.totalCredit ?? 0} precision={2} /></Card></Col>
            <Col span={8}><Card><Statistic title="Balanced" value={tb?.balanced ? 'YES' : 'NO'} valueStyle={{ color: tb?.balanced ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
          </Row>
          <Table size="small" rowKey="accountCode" dataSource={tb?.data ?? []} columns={tbCols} pagination={false} />
        </div>
      ),
    },
    {
      key: 'pl', label: 'P&L Statement',
      children: (
        <div>
          <Row gutter={16} style={{ marginBottom: 12 }}>
            <Col span={8}><Card><Statistic title="Revenue" value={pl?.revenue ?? 0} precision={2} /></Card></Col>
            <Col span={8}><Card><Statistic title="Expenses" value={pl?.expenses ?? 0} precision={2} /></Card></Col>
            <Col span={8}><Card><Statistic title="Net Profit" value={pl?.netProfit ?? 0} precision={2} valueStyle={{ color: (pl?.netProfit ?? 0) >= 0 ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
          </Row>
          <Table size="small" rowKey="accountCode" dataSource={pl?.data ?? []} columns={balanceCols} pagination={false} />
        </div>
      ),
    },
    {
      key: 'bs', label: 'Balance Sheet',
      children: (
        <div>
          <Row gutter={16} style={{ marginBottom: 12 }}>
            <Col span={6}><Card><Statistic title="Assets" value={bs?.assets ?? 0} precision={2} /></Card></Col>
            <Col span={6}><Card><Statistic title="Liabilities" value={bs?.liabilities ?? 0} precision={2} /></Card></Col>
            <Col span={6}><Card><Statistic title="Equity" value={bs?.equity ?? 0} precision={2} /></Card></Col>
            <Col span={6}><Card><Statistic title="Balanced" value={bs?.balanced ? 'YES' : 'NO'} valueStyle={{ color: bs?.balanced ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
          </Row>
          <Table size="small" rowKey="accountCode" dataSource={bs?.data ?? []} columns={balanceCols} pagination={false} />
        </div>
      ),
    },
    {
      key: 'ar', label: 'AR Report',
      children: (
        <div>
          <Typography.Text strong>Total Receivable: ${Number(ar?.total ?? 0).toLocaleString()}</Typography.Text>
          <Table size="small" style={{ marginTop: 8 }} rowKey="accountCode" dataSource={ar?.data ?? []}
            columns={[{ title: 'Code', dataIndex: 'accountCode', key: 'c' }, { title: 'Account', dataIndex: 'accountName', key: 'n' }, { title: 'Balance', dataIndex: 'balance', key: 'b', align: 'right' }]}
            pagination={false} />
        </div>
      ),
    },
    {
      key: 'ap', label: 'AP Report',
      children: (
        <div>
          <Typography.Text strong>Total Payable: ${Number(ap?.total ?? 0).toLocaleString()}</Typography.Text>
          <Table size="small" style={{ marginTop: 8 }} rowKey="accountCode" dataSource={ap?.data ?? []}
            columns={[{ title: 'Code', dataIndex: 'accountCode', key: 'c' }, { title: 'Account', dataIndex: 'accountName', key: 'n' }, { title: 'Balance', dataIndex: 'balance', key: 'b', align: 'right' }]}
            pagination={false} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader icon={<Typography.Text>F</Typography.Text>} title="Finance Reports" showBreadcrumbs
        subtitle="Trial Balance, P&L, Balance Sheet, AR and AP from real journal data" />
      <Card style={{ marginTop: 12 }}>
        <Tabs items={tabs} />
      </Card>
    </div>
  );
};

export default FinanceReports;