import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Checkbox } from 'antd';
import { UserOutlined, LockOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import apiService from '../../services/api';

const { Title, Text } = Typography;

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email] = useState(() => {
    try {
      const stored = localStorage.getItem('erp_user');
      if (stored) {
        const user = JSON.parse(stored);
        return user.email || '';
      }
    } catch {}
    return '';
  });
  const navigate = useNavigate();

  const onFinish = async (values: { email: string; password: string; remember?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.post<{ token: string; refreshToken: string; user: any }>(
        '/auth/login',
        { email: values.email, password: values.password },
      );
      localStorage.setItem('token', response.token);
      if (response.refreshToken) {
        localStorage.setItem('refresh_token', response.refreshToken);
      }
      if (response.user) {
        localStorage.setItem('erp_user', JSON.stringify(response.user));
      }
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      const status = err.response?.status;
      const serverMessage = err.response?.data?.message || err.response?.data?.error;

      if (status === 401) {
        setError('Invalid email or password. Please try again.');
      } else if (status === 403) {
        setError('Your account has been deactivated. Contact your administrator.');
      } else if (status === 0 || !err.response) {
        setError('Unable to connect to the server. Please check your connection.');
      } else {
        setError(serverMessage || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

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
          <Title level={3} style={{ marginBottom: 4 }}>ERP System</Title>
          <Text type="secondary">Sign in to your account</Text>
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

        <Form
          name="login"
          onFinish={onFinish}
          layout="vertical"
          initialValues={{ email: email || '', remember: true }}
          requiredMark={false}
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="Email address"
              size="large"
              autoComplete="email"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="Password"
              size="large"
              autoComplete="current-password"
              iconRender={(visible) =>
                visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
              }
            />
          </Form.Item>

          <Form.Item name="remember" valuePropName="checked">
            <Checkbox>Remember me</Checkbox>
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
            >
              Sign in
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Link to="/forgot-password">
              <Text type="secondary" style={{ fontSize: 13 }}>Forgot your password?</Text>
            </Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default Login;
