import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Result } from 'antd';
import { MailOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import apiService from '../../services/api';

const { Title, Text } = Typography;

const ForgotPassword: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const onFinish = async (values: { email: string }) => {
    setLoading(true);
    setError(null);
    try {
      await apiService.post('/auth/forgot-password', { email: values.email });
      setSubmittedEmail(values.email);
      setSent(true);
    } catch (err: any) {
      const serverMessage = err.response?.data?.message || err.response?.data?.error;
      if (err.response?.status === 0 || !err.response) {
        setError('Unable to connect to the server. Please try again later.');
      } else {
        setError(serverMessage || 'Failed to send reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      >
        <Card style={{ width: 460, borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
          <Result
            status="success"
            title="Check your email"
            subTitle={
              <span>
                If an account exists with <Text strong>{submittedEmail}</Text>, we've sent a
                password reset link. Please check your inbox and spam folder.
              </span>
            }
            extra={
              <Link to="/login">
                <Button type="primary" icon={<ArrowLeftOutlined />}>
                  Back to Sign In
                </Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card style={{ width: 420, borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ marginBottom: 4 }}>Reset Password</Title>
          <Text type="secondary">
            Enter your email address and we'll send you a link to reset your password.
          </Text>
        </div>

        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: 24 }}
          />
        )}

        <Form name="forgot-password" onFinish={onFinish} layout="vertical" requiredMark={false}>
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="Email address"
              size="large"
              autoComplete="email"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Send Reset Link
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Link to="/login">
              <Text type="secondary" style={{ fontSize: 13 }}>
                <ArrowLeftOutlined style={{ marginRight: 4 }} />
                Back to Sign In
              </Text>
            </Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default ForgotPassword;
