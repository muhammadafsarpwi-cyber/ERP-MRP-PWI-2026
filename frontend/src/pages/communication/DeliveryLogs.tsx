import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Select, DatePicker, Input, Button, Typography, Row, Col, message } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import dayjs from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const STATUS_COLORS: Record<string, string> = {
  QUEUED: 'default',
  SENDING: 'processing',
  SENT: 'success',
  DELIVERED: 'green',
  READ: 'blue',
  FAILED: 'red',
  RETRYING: 'orange',
  CANCELLED: 'default',
};

interface DeliveryRow {
  id: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'IN_APP';
  recipientAddress: string | null;
  recipientUserId: string | null;
  templateCode: string | null;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  sentAt: string | null;
}

const DeliveryLogsPage: React.FC<{ channel: 'EMAIL' | 'WHATSAPP'; title: string }> = ({ channel, title }) => {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<string | undefined>();
  const [recipient, setRecipient] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { channel, page, limit: pageSize };
      if (status) params.status = status;
      if (recipient) params.recipient = recipient;
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.dateFrom = dateRange[0].startOf('day').toISOString();
        params.dateTo = dateRange[1].endOf('day').toISOString();
      }
      const res = await apiService.get<any>('/notifications/admin/deliveries', params);
      setRows(res.data || []);
      setTotal(res.total || 0);
    } catch {
      message.error('Unable to load delivery log');
    }
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [page, pageSize, status]);

  const columns: any[] = [
    { title: 'Time', dataIndex: 'createdAt', width: 170, render: (v: string) => new Date(v).toLocaleString() },
    { title: 'Recipient', dataIndex: 'recipientAddress', width: 220, render: (v: string | null) => v || '—' },
    { title: 'Channel', dataIndex: 'channel', width: 90, render: (v: string) => <Tag color={v === 'EMAIL' ? 'blue' : 'green'}>{v}</Tag> },
    { title: 'Status', dataIndex: 'status', width: 110, render: (v: string) => <Tag color={STATUS_COLORS[v] || 'default'}>{v}</Tag> },
    { title: 'Attempts', dataIndex: 'retryCount', width: 80, render: (v: number) => <Text>{v}</Text> },
    { title: 'Provider', dataIndex: 'provider', width: 120, render: (v: string | null) => v ? <Tag>{v}</Tag> : '—' },
    { title: 'Provider ID', dataIndex: 'providerMessageId', width: 200, render: (v: string | null) => v ? <Text code style={{ fontSize: 11 }}>{v.slice(0, 30)}{v.length > 30 ? '…' : ''}</Text> : '—' },
    { title: 'Template', dataIndex: 'templateCode', width: 200, render: (v: string | null) => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : '—' },
    { title: 'Error', dataIndex: 'errorMessage', ellipsis: true, render: (v: string | null) => v ? <Text type="danger" style={{ fontSize: 11 }}>{v}</Text> : '—' },
    { title: 'Sent At', dataIndex: 'sentAt', width: 170, render: (v: string | null) => v ? new Date(v).toLocaleString() : '—' },
  ];

  return (
    <Card title={title} extra={<Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>}>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8} md={6}>
          <Select allowClear placeholder="Status" style={{ width: '100%' }} value={status} onChange={setStatus}
            options={['QUEUED','SENDING','SENT','DELIVERED','READ','FAILED','CANCELLED'].map(s => ({ value: s, label: s }))} />
        </Col>
        <Col xs={24} sm={8} md={6}>
          <Input allowClear placeholder="Recipient (email/phone)" prefix={<SearchOutlined />} value={recipient} onChange={(e) => setRecipient(e.target.value)} onPressEnter={load} />
        </Col>
        <Col xs={24} sm={8} md={8}>
          <RangePicker style={{ width: '100%' }} value={dateRange as any} onChange={(v) => setDateRange(v as any)} />
        </Col>
        <Col xs={24} sm={8} md={4}>
          <Button type="primary" onClick={load}>Filter</Button>
        </Col>
      </Row>
      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} size="middle"
        pagination={{ current: page, pageSize, total, showSizeChanger: true, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        scroll={{ x: 1400 }} />
    </Card>
  );
};

export default DeliveryLogsPage;