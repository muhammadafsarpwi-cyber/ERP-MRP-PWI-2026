import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Switch, Button, Row, Col, Alert, Select, App, Space, Tag, Tooltip } from 'antd';
import { WhatsAppOutlined, SaveOutlined, SendOutlined, InfoCircleOutlined } from '@ant-design/icons';
import apiService from '../../services/api';

const PROVIDERS = [
  { value: 'whatsapp_meta', label: 'Meta WhatsApp Cloud API' },
  { value: 'twilio', label: 'Twilio WhatsApp' },
  { value: 'other', label: 'Other / Custom' },
];

const WhatsAppSettingsPage: React.FC = () => {
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
      const wa = list.find((s: any) => s.settingType === 'WHATSAPP');
      if (wa) {
        setHasSetting(true);
        form.setFieldsValue({
          enabled: !!wa.enabled,
          provider: wa.provider || 'whatsapp_meta',
          phoneNumberId: wa.config?.phoneNumberId || '',
          businessAccountId: wa.config?.businessAccountId || '',
          webhookUrl: wa.config?.webhookUrl || '',
          apiVersion: wa.config?.apiVersion || 'v18.0',
          tokenRef: wa.config?.tokenRef || '',
        });
      } else {
        setHasSetting(false);
        form.setFieldsValue({ enabled: false, provider: 'whatsapp_meta', apiVersion: 'v18.0' });
      }
    } catch { message.error('Unable to load WhatsApp settings'); }
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const save = async (values: any) => {
    setSaving(true);
    try {
      const payload = {
        settingType: 'WHATSAPP',
        provider: values.provider || 'whatsapp_meta',
        enabled: !!values.enabled,
        config: {
          phoneNumberId: values.phoneNumberId,
          businessAccountId: values.businessAccountId,
          webhookUrl: values.webhookUrl,
          apiVersion: values.apiVersion,
          tokenRef: values.tokenRef,
        },
      };
      const res = await apiService.post<any>('/communication/settings', payload);
      if (res.data) setHasSetting(true);
      message.success('WhatsApp settings saved');
    } catch { message.error('Failed to save WhatsApp settings'); }
    setSaving(false);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const values = form.getFieldsValue();
      const res = await apiService.post<any>('/communication/settings/test-whatsapp', { to: values.testPhone || '' });
      setTestResult({ success: !!res.success, message: res.message || 'Test result' });
    } catch (e: any) {
      setTestResult({ success: false, message: e?.response?.data?.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card loading={loading} title={<Space><WhatsAppOutlined />WhatsApp Settings</Space>}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Meta WhatsApp Cloud API"
        description="Access tokens are stored as environment-variable references (e.g. env:WHATSAPP_TOKEN). Never hardcode tokens in the frontend. Delivery is only attempted when provider credentials are configured and enabled."
      />
      <Form form={form} layout="vertical" onFinish={save}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="enabled" label="Enable WhatsApp Delivery" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="provider" label="Provider">
              <Select options={PROVIDERS} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="phoneNumberId" label="Phone Number ID" rules={[{ required: true, message: 'Phone Number ID is required' }]}>
              <Input placeholder="123456789012345" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="businessAccountId" label="Business Account ID">
              <Input placeholder="102290129340398" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="apiVersion" label="API Version">
              <Input placeholder="v18.0" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="webhookUrl" label="Webhook URL (optional)">
              <Input placeholder="https://erp.example.com/api/v1/communication/webhooks/whatsapp" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="tokenRef"
              label={
                <Space size={4}>
                  Access Token (env reference)
                  <Tooltip title="Reference an environment variable, e.g. env:WHATSAPP_TOKEN. Resolved server-side.">
                    <InfoCircleOutlined style={{ color: 'var(--theme-text-muted)' }} />
                  </Tooltip>
                </Space>
              }
            >
              <Input placeholder="env:WHATSAPP_TOKEN" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="testPhone" label="Test Phone Number (for test message)">
              <Input placeholder="+923001234567" />
            </Form.Item>
          </Col>
        </Row>

        {testResult && (
          <Alert
            type={testResult.success ? 'success' : 'error'}
            showIcon
            style={{ marginBottom: 16 }}
            message={testResult.success ? 'Test result' : 'Test failed'}
            description={testResult.message}
            closable
            onClose={() => setTestResult(null)}
          />
        )}

        <Space>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>Save Settings</Button>
          <Button icon={<SendOutlined />} loading={testing} onClick={testConnection}>Test WhatsApp</Button>
          {hasSetting && <Tag color="green">Configured</Tag>}
        </Space>
      </Form>
    </Card>
  );
};

export default WhatsAppSettingsPage;