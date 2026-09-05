import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Switch, Button, Row, Col, Alert, Divider, Typography, Select, App, Space, Tag, Tooltip } from 'antd';
import { MailOutlined, SaveOutlined, SendOutlined, InfoCircleOutlined } from '@ant-design/icons';
import apiService from '../../services/api';

const { Text } = Typography;

const SECURITY_OPTIONS = [
  { value: 'STARTTLS', label: 'STARTTLS (port 587)' },
  { value: 'SSL', label: 'SSL/TLS (port 465)' },
  { value: 'NONE', label: 'None (port 25)' },
];

const EmailSettingsPage: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [hasSetting, setHasSetting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiService.get<any>('/communication/settings');
      const list = res.data || [];
      const email = list.find((s: any) => s.settingType === 'EMAIL');
      if (email) {
        setHasSetting(true);
        form.setFieldsValue({
          enabled: !!email.enabled,
          provider: email.provider || 'smtp',
          host: email.config?.host || '',
          port: email.config?.port || 587,
          security: email.config?.security || 'STARTTLS',
          username: email.config?.username || '',
          fromEmail: email.config?.fromEmail || '',
          fromName: email.config?.fromName || '',
          replyTo: email.config?.replyTo || '',
          passwordRef: email.config?.passwordRef || '',
        });
      } else {
        setHasSetting(false);
        form.setFieldsValue({ enabled: false, provider: 'smtp', port: 587, security: 'STARTTLS' });
      }
    } catch {
      message.error('Unable to load email settings');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const save = async (values: any) => {
    setSaving(true);
    try {
      const payload = {
        settingType: 'EMAIL',
        provider: values.provider || 'smtp',
        enabled: !!values.enabled,
        config: {
          host: values.host,
          port: Number(values.port) || 587,
          security: values.security,
          username: values.username,
          passwordRef: values.passwordRef,
          fromEmail: values.fromEmail,
          fromName: values.fromName,
          replyTo: values.replyTo,
          useTls: values.security !== 'NONE',
        },
      };
      const res = await apiService.post<any>('/communication/settings', payload);
      if (res.data) setHasSetting(true);
      message.success('Email settings saved');
    } catch {
      message.error('Failed to save email settings');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    const values = form.getFieldsValue();
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiService.post<any>('/communication/settings/test-email', { to: values.fromEmail || 'test@erp.local' });
      setTestResult({ success: !!res.success, message: res.message || (res.success ? 'Test email sent' : 'Test failed') });
    } catch (e: any) {
      setTestResult({ success: false, message: e?.response?.data?.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card loading={loading} title={<Space><MailOutlined />Email Settings</Space>}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="SMTP configuration"
        description="Passwords are stored as environment-variable references (e.g. env:SMTP_PASSWORD). Secrets are never exposed to the browser."
      />
      <Form form={form} layout="vertical" onFinish={save}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="enabled" label="Enable Email Delivery" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="provider" label="Provider">
              <Select options={[{ value: 'smtp', label: 'SMTP' }, { value: 'ses', label: 'Amazon SES' }, { value: 'sendgrid', label: 'SendGrid' }]} />
            </Form.Item>
          </Col>
        </Row>
        <Divider orientation="left" plain style={{ margin: '8px 0 16px' }}>
          <Text type="secondary">SMTP Server</Text>
        </Divider>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="host" label="SMTP Host" rules={[{ required: true, message: 'SMTP host is required' }]}>
              <Input placeholder="smtp.company.com" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item name="port" label="SMTP Port">
              <Input type="number" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item name="security" label="Security">
              <Select options={SECURITY_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="username" label="Username">
              <Input autoComplete="off" placeholder="SMTP username" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="passwordRef"
              label={
                <Space size={4}>
                  Password (env reference)
                  <Tooltip title="Reference an environment variable, e.g. env:SMTP_PASSWORD. The actual secret is resolved server-side.">
                    <InfoCircleOutlined style={{ color: 'var(--theme-text-muted)' }} />
                  </Tooltip>
                </Space>
              }
            >
              <Input placeholder="env:SMTP_PASSWORD" autoComplete="off" />
            </Form.Item>
          </Col>
        </Row>
        <Divider orientation="left" plain style={{ margin: '8px 0 16px' }}>
          <Text type="secondary">Sender</Text>
        </Divider>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="fromEmail" label="From Email" rules={[{ required: true, message: 'From email is required' }]}>
              <Input placeholder="noreply@company.com" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="fromName" label="From Name">
              <Input placeholder="ERP System" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="replyTo" label="Reply-To">
              <Input placeholder="support@company.com" />
            </Form.Item>
          </Col>
        </Row>

        {testResult && (
          <Alert
            type={testResult.success ? 'success' : 'error'}
            showIcon
            style={{ marginBottom: 16 }}
            message={testResult.success ? 'Connection test' : 'Connection test failed'}
            description={testResult.message}
            closable
            onClose={() => setTestResult(null)}
          />
        )}

        <Space>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>Save Settings</Button>
          <Button icon={<SendOutlined />} loading={testing} onClick={testConnection}>Test Email</Button>
          {hasSetting && <Tag color="green">Configured</Tag>}
        </Space>
      </Form>
    </Card>
  );
};

export default EmailSettingsPage;