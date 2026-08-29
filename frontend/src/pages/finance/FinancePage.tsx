import React from 'react';
import { Card, Table, Tabs, Button, Space, Row, Col, Statistic, Tag, Typography } from 'antd';
import { PlusOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title } = Typography;

const FinancePage: React.FC = () => {
  const navigate = useNavigate();

  const tabs = [
    {
      key: 'overview',
      label: 'Overview',
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="Total Accounts" value={22} prefix={<FileTextOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="Fiscal Year" value="FY2026" />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="Periods" value={12} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="Journals" value={2} />
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'journals',
      label: 'Journal Entries',
      children: (
        <Card
          title="Journal Entries"
          extra={<Button type="primary" icon={<PlusOutlined />}>New Journal</Button>}
        >
          <Table
            dataSource={[]}
            columns={[
              { title: 'Journal #', dataIndex: 'journalNumber', key: 'number' },
              { title: 'Date', dataIndex: 'entryDate', key: 'date' },
              { title: 'Type', dataIndex: 'journalType', key: 'type' },
              { title: 'Description', dataIndex: 'description', key: 'desc' },
              { title: 'Debit', dataIndex: 'totalDebit', key: 'debit', render: (v) => v?.toLocaleString() },
              { title: 'Credit', dataIndex: 'totalCredit', key: 'credit', render: (v) => v?.toLocaleString() },
              { title: 'Status', dataIndex: 'status', key: 'status', render: (s) => <Tag color={s === 'POSTED' ? 'green' : s === 'DRAFT' ? 'blue' : 'red'}>{s}</Tag> },
            ]}
            rowKey="id"
            pagination={{ pageSize: 20 }}
          />
        </Card>
      ),
    },
    {
      key: 'reports',
      label: 'Reports',
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <Card hoverable onClick={() => navigate('/finance/reports/trial-balance')}>
              <Statistic title="Trial Balance" value="View" />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card hoverable>
              <Statistic title="P&L Statement" value="View" />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card hoverable>
              <Statistic title="Balance Sheet" value="View" />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card hoverable>
              <Statistic title="General Ledger" value="View" />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card hoverable>
              <Statistic title="AR Report" value="View" />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card hoverable>
              <Statistic title="AP Report" value="View" />
            </Card>
          </Col>
        </Row>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Finance</Title>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/finance/journals/new')}>New Journal</Button>
        </Space>
      </div>
      <Card>
        <Tabs defaultActiveKey="overview" items={tabs} />
      </Card>
    </div>
  );
};

export default FinancePage;