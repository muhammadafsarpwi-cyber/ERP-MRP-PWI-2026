import React from 'react';
import { Card, Row, Col } from 'antd';
import {
  BarChartOutlined,
  FileTextOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  SwapOutlined,
  EditOutlined,
  DatabaseOutlined,
  InboxOutlined,
  ClockCircleOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/shared/PageHeader';

interface ReportCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  color: string;
}

const reports: ReportCard[] = [
  { title: 'Store Inventory Report', description: 'View complete store inventory balances', icon: <DatabaseOutlined style={{ fontSize: 28 }} />, path: '/inventory/reports', color: '#1890ff' },
  { title: 'Store Stock Balance', description: 'Current stock levels per store', icon: <InboxOutlined style={{ fontSize: 28 }} />, path: '/store/stock-balance', color: '#52c41a' },
  { title: 'Store Movement Ledger', description: 'All stock movements for a store', icon: <DatabaseOutlined style={{ fontSize: 28 }} />, path: '/store/ledger', color: '#13c2c2' },
  { title: 'Material Issue Report', description: 'Material issues issued from store', icon: <ArrowUpOutlined style={{ fontSize: 28 }} />, path: '/store/material-issues', color: '#ff4d4f' },
  { title: 'Material Receive Report', description: 'Materials received into store', icon: <ArrowDownOutlined style={{ fontSize: 28 }} />, path: '/store/material-receipts', color: '#52c41a' },
  { title: 'GRN Report', description: 'Goods receipt notes', icon: <InboxOutlined style={{ fontSize: 28 }} />, path: '/store/material-receipts', color: '#faad14' },
  { title: 'Transfer Report', description: 'Stock transfers between warehouses', icon: <SwapOutlined style={{ fontSize: 28 }} />, path: '/inventory/transfers', color: '#722ed1' },
  { title: 'Stock Adjustment Report', description: 'Stock adjustments and corrections', icon: <EditOutlined style={{ fontSize: 28 }} />, path: '/inventory/adjustments', color: '#eb2f96' },
  { title: 'Purchase Requisition Report', description: 'Purchase requisitions and status', icon: <FileTextOutlined style={{ fontSize: 28 }} />, path: '/procurement/requisitions', color: '#fa8c16' },
  { title: 'Material Request Report', description: 'All material requests and fulfillment', icon: <FileTextOutlined style={{ fontSize: 28 }} />, path: '/store/material-requests', color: '#1890ff' },
  { title: 'Pending Approval Report', description: 'Items pending approval across store', icon: <ClockCircleOutlined style={{ fontSize: 28 }} />, path: '/store/pending-approvals', color: '#ff4d4f' },
  { title: 'Store Performance Report', description: 'Store efficiency and fulfillment metrics', icon: <RiseOutlined style={{ fontSize: 28 }} />, path: '/store/reports', color: '#2f54eb' },
];

const StoreReports: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader icon={<BarChartOutlined />} title="Store Reports" />
      <div style={{ padding: '0 24px' }}>
        <Row gutter={[16, 16]}>
          {reports.map((report) => (
            <Col xs={24} sm={12} lg={8} key={report.title}>
              <Card
                hoverable
                onClick={() => navigate(report.path)}
                style={{ cursor: 'pointer', height: '100%' }}
              >
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ color: report.color, marginBottom: 12 }}>{report.icon}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{report.title}</div>
                  <div style={{ color: '#8c8c8c', fontSize: 13 }}>{report.description}</div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    </div>
  );
};

export default StoreReports;
