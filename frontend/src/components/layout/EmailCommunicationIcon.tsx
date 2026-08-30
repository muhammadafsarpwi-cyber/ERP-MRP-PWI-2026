import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Dropdown, List, Spin, Tooltip, Empty, Space, Tag } from 'antd';
import {
  MailOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { apiService } from '../../services/api';
import { useNavigate } from 'react-router-dom';

interface EmailSummary {
  configured: boolean;
  provider: string;
  status: string;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  lastDeliveryAt: string | null;
}

interface DeliveryRow {
  id: string;
  channel: string;
  recipientAddress: string | null;
  status: string;
  createdAt: string;
  renderedSubject: string | null;
}

interface SummaryResponse {
  success: boolean;
  data: { email: EmailSummary };
}

const POLL_INTERVAL_MS = 30000;

const EmailCommunicationIcon: React.FC = () => {
  const [summary, setSummary] = useState<EmailSummary | null>(null);
  const [recent, setRecent] = useState<DeliveryRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      const res = await apiService.get<SummaryResponse>('/communication/settings/summary');
      if (mountedRef.current && res?.data?.email) setSummary(res.data.email);
    } catch { /* non-fatal */ }
  }, []);

  const loadRecent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get<any>('/notifications/admin/deliveries', { channel: 'EMAIL', limit: 5 });
      if (mountedRef.current) setRecent(res.data || []);
    } catch { /* ignore */ } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => { mountedRef.current = false; clearInterval(timer); };
  }, [refresh]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) { loadRecent(); refresh(); }
  };

  const totalPending = (summary?.queued || 0) + (summary?.sending || 0);
  const badgeCount = totalPending > 0 ? totalPending : summary?.failed || 0;

  const panel = (
    <div data-testid="email-panel" style={{
      width: 340,
      background: 'var(--theme-surface)',
      border: '1px solid var(--theme-border)',
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--theme-border)' }}>
        <Space size={8}>
          <MailOutlined style={{ color: 'var(--theme-text)' }} />
          <span style={{ fontWeight: 600, color: 'var(--theme-text)' }}>Email Communication</span>
        </Space>
        <Space size={0}>
          <Button type="link" size="small" onClick={() => { setOpen(false); navigate('/communication/email-logs'); }} data-testid="email-open-logs">
            Logs
          </Button>
          <Button type="link" size="small" onClick={() => { setOpen(false); navigate('/communication/email-settings'); }} data-testid="email-open-settings">
            Settings
          </Button>
        </Space>
      </div>
      <div style={{ padding: 12 }}>
        {!summary?.configured ? (
          <div style={{ padding: 8, textAlign: 'center', color: 'var(--theme-text-muted)' }}>
            <SettingOutlined style={{ fontSize: 20, display: 'block', marginBottom: 6 }} />
            <div>Email delivery is not configured</div>
          </div>
        ) : (
          <Space size={6} wrap style={{ marginBottom: 10 }}>
            <Tag icon={<ClockCircleOutlined />} color="default">Queued {summary.queued}</Tag>
            <Tag icon={<SyncOutlined spin={summary.sending > 0} />} color="processing">Sending {summary.sending}</Tag>
            <Tag icon={<CheckCircleOutlined />} color="success">Sent {summary.sent}</Tag>
            <Tag icon={<CloseCircleOutlined />} color={summary.failed > 0 ? 'error' : 'default'}>Failed {summary.failed}</Tag>
          </Space>
        )}
        <div style={{ fontWeight: 600, color: 'var(--theme-text)', marginBottom: 6 }}>Recent deliveries</div>
        {loading && recent.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 12 }}><Spin /></div>
        ) : recent.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No email deliveries yet" />
        ) : (
          <List size="small" dataSource={recent} renderItem={(r) => (
            <List.Item style={{ borderBottom: '1px solid var(--theme-border)', padding: '6px 0' }}>
              <div style={{ minWidth: 0, width: '100%' }}>
                <div style={{ fontSize: 12, color: 'var(--theme-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.renderedSubject || r.recipientAddress || 'Email'}
                </div>
                <Space size={8}>
                  <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{new Date(r.createdAt).toLocaleString()}</span>
                  <Tag style={{ fontSize: 10 }} color={r.status === 'SENT' ? 'success' : r.status === 'FAILED' ? 'error' : 'default'}>{r.status}</Tag>
                </Space>
              </div>
            </List.Item>
          )} />
        )}
      </div>
    </div>
  );

  return (
    <Dropdown trigger={['click']} open={open} onOpenChange={handleOpenChange} popupRender={() => panel}>
      <Tooltip title="Email communication">
        <span
          data-testid="email-icon"
          aria-label="Email communication"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(!open); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: 8,
            cursor: 'pointer',
            color: 'var(--theme-text)',
            fontSize: 17,
          }}
        >
          <Badge count={badgeCount} overflowCount={99} showZero={false} size="small" status="default">
            <MailOutlined />
          </Badge>
        </span>
      </Tooltip>
    </Dropdown>
  );
};

export default EmailCommunicationIcon;