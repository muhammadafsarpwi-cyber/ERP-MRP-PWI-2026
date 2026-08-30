import React, { useCallback, useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, Space, Alert, Button, Typography, Divider, Spin } from 'antd';
import {
  MailOutlined,
  MessageOutlined,
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { apiService } from '../../services/api';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

interface ChannelSummary {
  configured: boolean;
  provider: string;
  status: string;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  lastDeliveryAt: string | null;
}

interface SummaryData {
  unreadCount: number;
  email: ChannelSummary;
  whatsapp: ChannelSummary;
}

const CommunicationCenterPage: React.FC = () => {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get<any>('/communication/settings/summary');
      if (res?.data) setSummary(res.data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ChannelCard: React.FC<{ channel: 'email' | 'whatsapp'; title: string; icon: React.ReactNode; settings: string; logs: string; templates: string; rules: string }> =
    ({ channel, title, icon, settings, logs, templates, rules }) => {
      const data = channel === 'email' ? summary?.email : summary?.whatsapp;
      const pending = (data?.queued || 0) + (data?.sending || 0);
      return (
        <Card
          title={<Space><span style={{ color: 'var(--theme-text)' }}>{icon}</span><span style={{ color: 'var(--theme-text)' }}>{title}</span></Space>}
          extra={data ? (
            data.configured
              ? <Tag color={data.failed > 0 ? 'error' : pending > 0 ? 'processing' : 'success'}>{data.status}</Tag>
              : <Tag>NOT CONFIGURED</Tag>
          ) : <Tag>Loading</Tag>}
        >
          {!data?.configured ? (
            <Alert type="warning" showIcon message={`${title} delivery is not configured`}
              description={`Configure ${title.toLowerCase()} provider settings to enable delivery.`}
              action={<Button size="small" onClick={() => navigate(settings)}>Configure</Button>} />
          ) : (
            <>
              <Row gutter={[12, 12]}>
                <Col xs={12} sm={6}><Statistic title="Queued" value={data.queued} prefix={<ClockCircleOutlined />} valueStyle={{ color: 'var(--theme-text)' }} /></Col>
                <Col xs={12} sm={6}><Statistic title="Sending" value={data.sending} prefix={<SyncOutlined />} valueStyle={{ color: 'var(--theme-text)' }} /></Col>
                <Col xs={12} sm={6}><Statistic title="Sent" value={data.sent} prefix={<CheckCircleOutlined />} valueStyle={{ color: 'var(--theme-success)' }} /></Col>
                <Col xs={12} sm={6}><Statistic title="Failed" value={data.failed} prefix={<CloseCircleOutlined />} valueStyle={{ color: 'var(--theme-danger)' }} /></Col>
              </Row>
              <Divider style={{ margin: '12px 0' }} />
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Text type="secondary">Provider: <Text strong>{data.provider}</Text></Text>
                <Text type="secondary">Last delivery: <Text strong>{data.lastDeliveryAt ? new Date(data.lastDeliveryAt).toLocaleString() : '—'}</Text></Text>
              </Space>
            </>
          )}
          <Divider style={{ margin: '12px 0' }} />
          <Space wrap>
            <Button size="small" icon={<SettingOutlined />} onClick={() => navigate(settings)}>Settings</Button>
            <Button size="small" icon={<UnorderedListOutlined />} onClick={() => navigate(logs)}>Delivery Logs</Button>
            <Button size="small" icon={<PlusOutlined />} onClick={() => navigate(templates)}>Templates</Button>
            <Button size="small" onClick={() => navigate(rules)}>Rules</Button>
          </Space>
        </Card>
      );
    };

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, color: 'var(--theme-text)' }}>
          <BellOutlined style={{ marginRight: 8 }} />Communication Center
        </Title>
        <Text type="secondary">Live status of email and WhatsApp delivery channels from the notification engine and delivery queue.</Text>
        {loading && !summary && <Spin style={{ display: 'block', marginTop: 12 }} />}
        {summary && (
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col xs={24} sm={8}>
              <Statistic title="Unread Notifications" value={summary.unreadCount} prefix={<BellOutlined />} valueStyle={{ color: 'var(--theme-text)' }} />
            </Col>
          </Row>
        )}
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <ChannelCard channel="email" title="Email" icon={<MailOutlined style={{ color: 'var(--theme-icon-info)' }} />}
            settings="/communication/email-settings" logs="/communication/email-logs" templates="/communication/email-templates" rules="/communication/rules" />
        </Col>
        <Col xs={24} lg={12}>
          <ChannelCard channel="whatsapp" title="WhatsApp" icon={<MessageOutlined style={{ color: 'var(--theme-icon-success)' }} />}
            settings="/communication/whatsapp-settings" logs="/communication/whatsapp-logs" templates="/communication/whatsapp-templates" rules="/communication/rules" />
        </Col>
      </Row>
    </div>
  );
};

export default CommunicationCenterPage;