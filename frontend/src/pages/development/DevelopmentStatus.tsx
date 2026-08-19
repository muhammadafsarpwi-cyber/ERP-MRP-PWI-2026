import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Tag, Typography, Space } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  ApiOutlined,
  DesktopOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;

interface ServiceStatus {
  status: 'CONNECTED' | 'ERROR' | 'CHECKING';
  detail?: string;
}

interface StatusResponse {
  frontend?: { status: string };
  backend?: { status: string };
  database?: { status: string; host?: string; port?: number };
  supabase?: { status: string; url?: string };
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api/v1';

const StatusIndicator: React.FC<{ label: string; icon: React.ReactNode; serviceStatus: ServiceStatus }> = ({
  label,
  icon,
  serviceStatus,
}) => {
  const colorMap = {
    CONNECTED: 'success',
    ERROR: 'error',
    CHECKING: 'processing',
  };
  const iconMap = {
    CONNECTED: <CheckCircleOutlined />,
    ERROR: <CloseCircleOutlined />,
    CHECKING: <LoadingOutlined />,
  };
  return (
    <Card size="small" style={{ height: '100%' }}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space>
          {icon}
          <Text strong>{label}</Text>
        </Space>
        <Tag color={colorMap[serviceStatus.status]} icon={iconMap[serviceStatus.status]} style={{ fontSize: 14, padding: '4px 12px' }}>
          {serviceStatus.status}
        </Tag>
        {serviceStatus.detail && <Text type="secondary" style={{ fontSize: 12 }}>{serviceStatus.detail}</Text>}
      </Space>
    </Card>
  );
};

const DevelopmentStatus: React.FC = () => {
  const [backendStatus, setBackendStatus] = useState<ServiceStatus>({ status: 'CHECKING' });
  const [dbStatus, setDbStatus] = useState<ServiceStatus>({ status: 'CHECKING' });
  const [supabaseStatus, setSupabaseStatus] = useState<ServiceStatus>({ status: 'CHECKING' });

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await axios.get<StatusResponse>(`${API_URL}/status`, { timeout: 5000 });
        const data = response.data;

        setBackendStatus({
          status: data.backend?.status === 'ok' ? 'CONNECTED' : 'ERROR',
          detail: `Port ${new URL(API_URL).port || '80'}`,
        });

        setDbStatus({
          status: data.database?.status === 'connected' ? 'CONNECTED' : 'ERROR',
          detail: data.database?.host ? `${data.database.host}:${data.database.port}` : 'Not configured',
        });

        setSupabaseStatus({
          status: data.supabase?.url && data.supabase.url !== 'configured' ? 'CONNECTED' : 'ERROR',
          detail: data.supabase?.url === 'configured' ? 'URL configured' : data.supabase?.url || 'Not configured',
        });
      } catch {
        setBackendStatus({ status: 'ERROR', detail: 'Cannot reach API server' });
        setDbStatus({ status: 'ERROR', detail: 'Backend unreachable' });
        setSupabaseStatus({ status: 'ERROR', detail: 'Backend unreachable' });
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <Title level={2}>
        <CodeOutlined style={{ marginRight: 8 }} />
        ERP Development Status
      </Title>

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
