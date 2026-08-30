import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, Row, Col, Tag, Typography, Space, Button, Alert } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  ApiOutlined,
  DesktopOutlined,
  CodeOutlined,
  MinusCircleOutlined,
  LockOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from '../../services/api';

const { Title, Text } = Typography;

type ServiceStatusKey =
  | 'CONNECTED'
  | 'ERROR'
  | 'NOT_CONFIGURED'
  | 'UNAUTHORIZED'
  | 'UNAVAILABLE'
  | 'CHECKING'
  | 'NOT_TESTED';

interface ServiceStatus {
  status: ServiceStatusKey;
  detail?: string;
}

interface StatusPart {
  status?: string;
  detail?: string;
  host?: string;
  port?: number;
  provider?: string;
  api?: string;
}

interface StatusResponse {
  frontend?: StatusPart;
  backend?: StatusPart;
  database?: StatusPart;
  supabase?: StatusPart;
  timestamp?: string;
}

const API_URL = API_BASE_URL;

const STATUS_META: Record<ServiceStatusKey, { color: string; icon: React.ReactNode; label: string }> = {
  CONNECTED: { color: 'success', icon: <CheckCircleOutlined />, label: 'CONNECTED' },
  ERROR: { color: 'error', icon: <CloseCircleOutlined />, label: 'ERROR' },
  NOT_CONFIGURED: { color: 'default', icon: <MinusCircleOutlined />, label: 'NOT CONFIGURED' },
  UNAUTHORIZED: { color: 'warning', icon: <LockOutlined />, label: 'UNAUTHORIZED' },
  UNAVAILABLE: { color: 'warning', icon: <PauseCircleOutlined />, label: 'UNAVAILABLE' },
  CHECKING: { color: 'processing', icon: <LoadingOutlined />, label: 'CHECKING' },
  NOT_TESTED: { color: 'default', icon: <QuestionCircleOutlined />, label: 'NOT TESTED' },
};

const StatusIndicator: React.FC<{ label: string; icon: React.ReactNode; serviceStatus: ServiceStatus }> = ({
  label,
  icon,
  serviceStatus,
}) => {
  const meta = STATUS_META[serviceStatus.status] || STATUS_META.NOT_TESTED;
  return (
    <Card size="small" style={{ height: '100%' }}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space>
          {icon}
          <Text strong>{label}</Text>
        </Space>
        <Tag color={meta.color} icon={meta.icon} style={{ fontSize: 14, padding: '4px 12px' }}>
          {meta.label}
        </Tag>
        {serviceStatus.detail && <Text type="secondary" style={{ fontSize: 12 }}>{serviceStatus.detail}</Text>}
      </Space>
    </Card>
  );
};

/**
 * Map a backend status string to a frontend status key. Unknown values default
 * to ERROR so we never silently report a state we did not observe.
 */
function normalizeStatus(raw?: string): ServiceStatusKey {
  const value = (raw || '').toUpperCase();
  switch (value) {
    case 'CONNECTED':
      return 'CONNECTED';
    case 'ERROR':
      return 'ERROR';
    case 'NOT_CONFIGURED':
      return 'NOT_CONFIGURED';
    case 'UNAUTHORIZED':
      return 'UNAUTHORIZED';
    case 'UNAVAILABLE':
      return 'UNAVAILABLE';
    default:
      return 'ERROR';
  }
}

const NOT_TESTED_BACKEND_DOWN: ServiceStatus = {
  status: 'NOT_TESTED',
  detail: 'Backend unavailable',
};

const DevelopmentStatus: React.FC = () => {
  const [backendStatus, setBackendStatus] = useState<ServiceStatus>({ status: 'CHECKING' });
  const [dbStatus, setDbStatus] = useState<ServiceStatus>({ status: 'CHECKING' });
  const [supabaseStatus, setSupabaseStatus] = useState<ServiceStatus>({ status: 'CHECKING' });
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<{ type: 'error' | 'info'; message: string } | null>(null);
  const inFlight = useRef(false);

  const checkBackend = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    // Re-enter CHECKING for a manual re-check only; the initial mount already shows CHECKING.
    setBackendStatus((prev) => (prev.status === 'ERROR' ? { status: 'CHECKING' } : prev));
    setDbStatus((prev) => (prev.status === 'ERROR' ? { status: 'CHECKING' } : prev));
    setSupabaseStatus((prev) => (prev.status === 'ERROR' ? { status: 'CHECKING' } : prev));
    setDiagnostic(null);

    const backendDownDetail = (error: AxiosError): string => {
      if (error.response) {
        return `API server responded with HTTP ${error.response.status}`;
      }
      if (error.code === 'ECONNABORTED') {
        return 'Connection timed out';
      }
      if (error.code === 'ERR_NETWORK') {
        return 'Cannot reach API server';
      }
      return 'Cannot reach API server';
    };

    try {
      const response = await axios.get<StatusResponse>(`${API_URL}/status`, { timeout: 8000 });
      const data = response.data;

      setBackendStatus({
        status: normalizeStatus(data.backend?.status) === 'CONNECTED' ? 'CONNECTED' : normalizeStatus(data.backend?.status),
        detail: data.backend?.api ? `API: ${data.backend.api}` : `Port ${new URL(API_URL).port || '80'}`,
      });

      const db = data.database;
      setDbStatus({
        status: normalizeStatus(db?.status),
        detail: db?.provider
          ? `${db.provider}${db.host ? ` (${db.host}:${db.port})` : ''}`
          : db?.detail || 'Not configured',
      });

      const sb = data.supabase;
      setSupabaseStatus({
        status: normalizeStatus(sb?.status),
        detail: sb?.detail || (sb?.status === 'NOT_CONFIGURED' ? 'Supabase not configured' : undefined),
      });

      setLastChecked(new Date().toLocaleTimeString());
      setDiagnostic(null);
    } catch (error) {
      const axiosError = error as AxiosError;
      const isAuthFailure = axiosError.response && [401, 403].includes(axiosError.response.status);
      const backendKey = isAuthFailure ? 'UNAUTHORIZED' : 'ERROR';
      const reason = backendDownDetail(axiosError);

      setBackendStatus({ status: backendKey, detail: reason });
      // Cascading rule: database & supabase cannot be tested through a dead/unauthorized backend.
      setDbStatus(NOT_TESTED_BACKEND_DOWN);
      setSupabaseStatus(NOT_TESTED_BACKEND_DOWN);

      if (isAuthFailure) {
        setDiagnostic({
          type: 'info',
          message: 'Backend is reachable but the request was not authorized. Sign in and re-check to test database/Supabase.',
        });
      } else {
        setDiagnostic({
          type: 'error',
          message: 'Backend is unreachable. Database and Supabase were not tested.',
        });
      }
      setLastChecked(new Date().toLocaleTimeString());
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    checkBackend();
    const interval = setInterval(checkBackend, 15000);
    return () => clearInterval(interval);
  }, [checkBackend]);

  return (
    <div>
      <Title level={2}>
        <CodeOutlined style={{ marginRight: 8 }} />
        ERP Development Status
      </Title>

      {diagnostic && (
        <Alert
          type={diagnostic.type}
          message={diagnostic.message}
          showIcon
          closable
          style={{ marginBottom: 16 }}
          onClose={() => setDiagnostic(null)}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <StatusIndicator
            label="Frontend"
            icon={<DesktopOutlined />}
            serviceStatus={{ status: 'CONNECTED', detail: 'React Dev Server' }}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatusIndicator
            label="Backend"
            icon={<CloudServerOutlined />}
            serviceStatus={backendStatus}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatusIndicator
            label="Supabase"
            icon={<ApiOutlined />}
            serviceStatus={supabaseStatus}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatusIndicator
            label="Database"
            icon={<DatabaseOutlined />}
            serviceStatus={dbStatus}
          />
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap size="middle">
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={backendStatus.status === 'CHECKING'}
            onClick={checkBackend}
          >
            Refresh / Recheck Status
          </Button>
          {lastChecked && <Text type="secondary">Last checked: {lastChecked}</Text>}
          <Text type="secondary">Polling every 15s</Text>
        </Space>
      </Card>

      <Card title="Project Information">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Space direction="vertical">
              <Text strong>Current Project:</Text>
              <Text>Manufacturing ERP</Text>
            </Space>
          </Col>
          <Col xs={24} sm={12}>
            <Space direction="vertical">
              <Text strong>Current Instruction:</Text>
              <Text>ERP-00004</Text>
            </Space>
          </Col>
          <Col xs={24} sm={12}>
            <Space direction="vertical">
              <Text strong>Current Phase:</Text>
              <Text>Local Live Preview</Text>
            </Space>
          </Col>
          <Col xs={24} sm={12}>
            <Space direction="vertical">
              <Text strong>Environment:</Text>
              <Tag color="orange">Development</Tag>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card title="Endpoints" style={{ marginTop: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Space direction="vertical" size="small">
              <Text strong>Frontend:</Text>
              <Text copyable>http://localhost:3000</Text>
            </Space>
          </Col>
          <Col xs={24} sm={12}>
            <Space direction="vertical" size="small">
              <Text strong>Backend API:</Text>
              <Text copyable>{API_URL}</Text>
            </Space>
          </Col>
          <Col xs={24} sm={12}>
            <Space direction="vertical" size="small">
              <Text strong>Swagger Docs:</Text>
              <Text copyable>http://localhost:3001/api/docs</Text>
            </Space>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default DevelopmentStatus;
