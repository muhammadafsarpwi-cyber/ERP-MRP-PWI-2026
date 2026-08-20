import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Result } from 'antd';
import { LockOutlined, EyeInvisibleOutlined, EyeTwoTone, ArrowLeftOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import apiService from '../../services/api';

const { Title, Text } = Typography;

const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!token) {
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
          <Result
            status="error"
            title="Invalid Reset Link"
            subTitle="This password reset link is invalid or has expired. Please request a new one."
            extra={
              <Link to="/forgot-password">
                <Button type="primary">Request New Reset Link</Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const onFinish = async (values: { password: string; confirmPassword: string }) => {
    setLoading(true);
    setError(null);
    try {
      await apiService.post('/auth/reset-password', {
        token,
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      setSuccess(true);
    } catch (err: any) {
      const serverMessage = err.response?.data?.message || err.response?.data?.error;
      if (err.response?.status === 0 || !err.response) {
        setError('Unable to connect to the server. Please try again later.');
      } else {
        setError(serverMessage || 'Failed to reset password. The link may have expired.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
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
          <Result
            status="success"
            title="Password Reset Successfully"
            subTitle="Your password has been updated. You can now sign in with your new password."
            extra={
              <Link to="/login">
                <Button type="primary">Sign In</Button>
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
          <Title level={3} style={{ marginBottom: 4 }}>Set New Password</Title>
          <Text type="secondary">Enter your new password below.</Text>
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

        <Form name="reset-password" onFinish={onFinish} layout="vertical" requiredMark={false}>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: 'Please enter a new password' },
              { min: 8, message: 'Password must be at least 8 characters' },
              {
                pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
                message: 'Must contain uppercase, lowercase, and a number',
              },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="New password"
              size="large"
              autoComplete="new-password"
              iconRender={(visible) =>
                visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
              }
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Please confirm your password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Passwords do not match'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="Confirm new password"
              size="large"
              autoComplete="new-password"
              iconRender={(visible) =>
                visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
              }
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Reset Password
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

export default ResetPassword;
