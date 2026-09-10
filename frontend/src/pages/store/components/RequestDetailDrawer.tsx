import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, Descriptions, Table, Tag, Timeline, Spin, Button, Space, App, Typography } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, CarOutlined, HistoryOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import apiService from '../../../services/api';

interface RequestLine {
  id: string;
  lineNumber: number;
  itemId: string;
  itemName?: string;
  itemCode?: string;
  requestedQuantity: number;
  issuedQuantity: number;
  uomId: string;
  uomCode?: string;
  availableStock: number;
  minimumStock: number;
  maximumStock: number;
  currentShortage: number;
  prCreatedQty: number;
  prRemainingQty: number;
  prStatus: string;
}

interface MaterialRequestDetail {
  id: string;
  requestNumber: string;
  requestDate: string;
  requiredDate?: string | null;
  storeId: string;
  storeName?: string;
  departmentId?: string | null;
  divisionId?: string | null;
  sectionId?: string | null;
  purpose?: string | null;
  reason?: string | null;
  remarks?: string | null;
  priority?: string;
  status: string;
  createdBy?: string | null;
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  gmApprovedBy?: string | null;
  gmApprovedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  convertedAt?: string | null;
  convertedBy?: string | null;
  prId?: string | null;
  prNumber?: string | null;
  poId?: string | null;
  poNumber?: string | null;
  supplierId?: string | null;
  expectedDeliveryDate?: string | null;
  actualDeliveryDate?: string | null;
  supplierConfirmedDate?: string | null;
  etaPending?: boolean;
  createdAt?: string | null;
  lines: RequestLine[];
}

interface TimelineEvent {
  action: string;
  user: string | null;
  date: string | Date | null;
  document: string;
}

const statusColors: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  APPROVED: 'success',
  PARTIALLY_CONVERTED: 'orange',
  FULLY_CONVERTED: 'geekblue',
  REJECTED: 'error',
  CANCELLED: 'error',
  CLOSED: 'cyan',
};

const prStatusColors: Record<string, string> = {
  NONE: 'default',
  PARTIALLY_CONVERTED: 'orange',
  FULLY_CONVERTED: 'success',
  ISSUED: 'geekblue',
};

export interface RequestDetailDrawerProps {
  requestId: string | null;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

const formatDate = (d?: string | null) => (d ? String(d).slice(0, 10) : '—');

const formatDateTime = (d?: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleString();
};

const RequestDetailDrawer: React.FC<RequestDetailDrawerProps> = ({ requestId, open, onClose, onRefresh }) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<MaterialRequestDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [eta, setEta] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    try {
      const [d, t, e] = await Promise.all([
        apiService.get<MaterialRequestDetail>(`/store/material-requests/${requestId}`),
        apiService.get<TimelineEvent[]>(`/store/material-requests/${requestId}/timeline`).catch(() => []),
        apiService.get<any>(`/store/material-requests/${requestId}/eta`).catch(() => null),
      ]);
      setDetail(d);
      setTimeline(t || []);
      setEta(e);
    } catch {
      message.error('Failed to load request detail');
    } finally {
      setLoading(false);
    }
  }, [requestId, message]);

  useEffect(() => {
    if (open && requestId) load();
  }, [open, requestId, load]);

  const handleApprove = async () => {
    if (!requestId) return;
    try {
      await apiService.post(`/store/material-requests/${requestId}/approve`);
      message.success('Request approved');
      onRefresh();
      load();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Approval failed');
    }
  };

  const handleGmApprove = async () => {
    if (!requestId) return;
    try {
      await apiService.post(`/store/material-requests/${requestId}/gm-approve`);
      message.success('GM approval recorded');
      onRefresh();
      load();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'GM approval failed');
    }
  };

  const handleSubmit = async () => {
    if (!requestId) return;
    try {
      await apiService.post(`/store/material-requests/${requestId}/submit`);
      message.success('Request submitted');
      onRefresh();
      load();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Submit failed');
    }
  };

  const handleConvertPr = async () => {
    if (!requestId) return;
    try {
      await apiService.post(`/store/material-requests/${requestId}/convert-pr`, {});
      message.success('Purchase Requisition created');
      onRefresh();
      load();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'PR conversion failed');
    }
  };

  const lineColumns: ColumnsType<RequestLine> = [
    { title: '#', dataIndex: 'lineNumber', width: 40 },
    {
      title: 'Item',
      key: 'item',
      render: (_, r) => r.itemCode ? `${r.itemCode}${r.itemName ? ` — ${r.itemName}` : ''}` : r.itemId,
    },
    { title: 'Requested', dataIndex: 'requestedQuantity', width: 90, align: 'right' },
    { title: 'Available', dataIndex: 'availableStock', width: 90, align: 'right' },
    {
      title: 'Shortage',
      key: 'shortage',
      width: 90,
      align: 'right',
      render: (_, r) => {
        const s = Number(r.currentShortage || r.requestedQuantity - r.availableStock || 0);
        return <Typography.Text type={s > 0 ? 'danger' : 'success'}>{s.toLocaleString()}</Typography.Text>;
      },
    },
    { title: 'PR Created', dataIndex: 'prCreatedQty', width: 100, align: 'right' },
    { title: 'PR Remaining', dataIndex: 'prRemainingQty', width: 110, align: 'right' },
    {
      title: 'PR Status',
      dataIndex: 'prStatus',
      width: 130,
      render: (s: string) => <Tag color={prStatusColors[s] || 'default'}>{s}</Tag>,
    },
    { title: 'Issued', dataIndex: 'issuedQuantity', width: 80, align: 'right' },
    {
      title: '',
      key: 'trace',
      width: 96,
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          icon={<HistoryOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
            navigate(`/store/material-trace/${r.itemId}`);
          }}
        >
          Trace
        </Button>
      ),
    },
  ];

  return (
    <Drawer
      title={
        <Space>
          <span>Request Detail</span>
          {detail && <Tag color={statusColors[detail.status] || 'default'}>{detail.status}</Tag>}
          {eta?.etaStatus === 'OVERDUE' && <Tag color="red">OVERDUE</Tag>}
          {eta?.etaPending && <Tag color="orange">ETA Pending</Tag>}
        </Space>
      }
      open={open}
      onClose={onClose}
      width={1100}
    >
      {loading && <Spin />}
      {!loading && detail && (
        <>
          <Descriptions
            bordered
            size="small"
            column={3}
            title="Header Information"
            items={[
              { key: 'n', label: 'Request Number', children: detail.requestNumber },
              { key: 'd', label: 'Request Date', children: formatDate(detail.requestDate) },
              { key: 'r', label: 'Required Date', children: formatDate(detail.requiredDate) },
              { key: 'store', label: 'Store', children: detail.storeName || detail.storeId },
              { key: 'p', label: 'Priority', children: <Tag color={detail.priority === 'URGENT' ? 'red' : 'blue'}>{detail.priority || 'NORMAL'}</Tag> },
              { key: 'prid', label: 'PR Number', children: detail.prNumber || '—' },
              { key: 'po', label: 'PO Number', children: detail.poNumber || '—' },
              { key: 'purpose', label: 'Purpose', children: detail.purpose || '—', span: 3 },
              { key: 'reason', label: 'Reason', children: detail.reason || '—', span: 3 },
              { key: 'remarks', label: 'Remarks', children: detail.remarks || '—', span: 3 },
            ]}
          />

          <Typography.Title level={5} style={{ marginTop: 24 }}>Line Items & Quantity Status</Typography.Title>
          <Table
            size="small"
            columns={lineColumns}
            dataSource={detail.lines || []}
            rowKey="id"
            pagination={false}
            scroll={{ x: 900 }}
          />

          <Typography.Title level={5} style={{ marginTop: 24 }}>Approval Status</Typography.Title>
          <Descriptions bordered size="small" column={3}>
            <Descriptions.Item label="Manager Approval Status">
              {detail.approvedAt ? <Tag color="success">Approved</Tag> : <Tag>{detail.status === 'SUBMITTED' ? 'Pending' : 'N/A'}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Manager">
              {detail.approvedAt ? formatDateTime(detail.approvedAt) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="GM Approval Status">
              {detail.gmApprovedAt ? <Tag color="success">GM Approved</Tag> : <Tag>Pending</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="GM Approved At">{detail.gmApprovedAt ? formatDateTime(detail.gmApprovedAt) : '—'}</Descriptions.Item>
            <Descriptions.Item label="Submitted At">{detail.submittedAt ? formatDateTime(detail.submittedAt) : '—'}</Descriptions.Item>
            <Descriptions.Item label="Created At">{detail?.createdAt ? formatDateTime(detail.createdAt) : '—'}</Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 24 }}>Supplier & ETA</Typography.Title>
          <Descriptions bordered size="small" column={3}>
            <Descriptions.Item label="Supplier">{detail.supplierId || '—'}</Descriptions.Item>
            <Descriptions.Item label="Supplier Confirmed">{formatDate(detail.supplierConfirmedDate)}</Descriptions.Item>
            <Descriptions.Item label="Expected Delivery">{formatDate(detail.expectedDeliveryDate)}</Descriptions.Item>
            <Descriptions.Item label="Actual Delivery">{formatDate(detail.actualDeliveryDate)}</Descriptions.Item>
            <Descriptions.Item label="ETA Status">
              <Space size={4}>
                {eta?.etaStatus === 'OVERDUE' && <Tag color="red"><ClockCircleOutlined /> Overdue</Tag>}
                {eta?.etaStatus === 'PENDING' && eta.remainingDays != null && (
                  <Tag color={eta.remainingDays <= 3 ? 'orange' : 'blue'}><ClockCircleOutlined /> {eta.remainingDays}d left</Tag>
                )}
                {eta?.etaStatus === 'RECEIVED' && <Tag color="success"><CheckCircleOutlined /> Received</Tag>}
                {eta?.etaStatus === 'ETA_PENDING' && <Tag color="orange"><ClockCircleOutlined /> ETA Pending</Tag>}
                {eta?.etaPending && !eta?.etaStatus && <Tag color="orange">ETA Pending</Tag>}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Total Procurement Lead Time">
              {eta?.leadTimes?.totalProcurementLeadTime != null ? `${eta.leadTimes.totalProcurementLeadTime} days` : '—'}
            </Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 24 }}>Timeline / History</Typography.Title>
          <Timeline
            items={(timeline || []).map((ev) => ({
              color: ev.action.includes('Approved') || ev.action.includes('Received') || ev.action.includes('Submitted') ? 'green' : 'blue',
              children: (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{ev.action}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {ev.date ? formatDateTime(String(ev.date)) : ''} · Doc: {ev.document} {ev.user ? `· User: ${ev.user}` : ''}
                  </Typography.Text>
                </Space>
              ),
            }))}
          />

          {/* Workflow action buttons */}
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {detail.status === 'DRAFT' && (
              <><Button type="primary" icon={<CarOutlined />} onClick={handleSubmit}>Submit for Approval</Button></>
            )}
            {detail.status === 'SUBMITTED' && (
              <Button type="primary" onClick={handleApprove}>Manager Approve</Button>
            )}
            {detail.status === 'APPROVED' && !detail.gmApprovedAt && (
              <Button onClick={handleGmApprove}>GM Approve</Button>
            )}
            {(detail.status === 'PARTIALLY_CONVERTED' || detail.status === 'FULLY_CONVERTED') && (
              <Tag color="geekblue">PR Created: {detail.prNumber}</Tag>
            )}
          </div>
          {detail.status === 'APPROVED' && detail.gmApprovedAt && (
            <div style={{ marginTop: 8 }}>
              <Button type="primary" onClick={handleConvertPr}>Convert to Purchase Requisition</Button>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
};

export default RequestDetailDrawer;