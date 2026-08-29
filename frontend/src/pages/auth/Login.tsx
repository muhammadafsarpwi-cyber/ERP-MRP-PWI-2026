import React, { useEffect, useState } from 'react';
import { Button, Form, Input } from 'antd';
import {
  LockOutlined,
  LoginOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import apiService from '../../services/api';
import AuthBrand from '../../components/auth/AuthBrand';
import AuthBrandPane from '../../components/auth/AuthBrandPane';
import AuthError from '../../components/auth/AuthError';
import AuthShell from '../../components/auth/AuthShell';
import PasswordField from '../../components/auth/PasswordField';
import './auth.css';

interface LoginFormValues {
  email: string;
  password: string;
}

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialEmail] = useState(() => {
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
  const location = useLocation();
  const [redirecting] = useState(() => !!localStorage.getItem('token'));

  useEffect(() => {
    document.title = 'Sign In | PWI — Pakistan Wire & Industry';
    if (redirecting) {
      navigate('/dashboard', { replace: true });
    }
  }, [redirecting, navigate]);

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.post<{
        token: string;
        refreshToken: string;
        user: any;
      }>('/auth/login', {
        email: values.email,
        password: values.password,
      });

      localStorage.setItem('token', response.token);
      if (response.refreshToken) {
        localStorage.setItem('refresh_token', response.refreshToken);
      }
      if (response.user) {
        localStorage.setItem('erp_user', JSON.stringify(response.user));
      }

      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      const destination =
        from && from.startsWith('/') && from !== '/login' && !from.startsWith('/forgot')
          ? from
          : '/dashboard';
      navigate(destination, { replace: true });
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 401) {
        setError('Invalid email or password. Please try again.');
      } else if (status === 403) {
        setError('Your account has been deactivated. Contact your administrator.');
      } else if (status === 0 || !err.response) {
        setError('Unable to connect to the ERP server. Please try again.');
      } else {
        const serverMessage = err.response?.data?.message || err.response?.data?.error;
        setError(serverMessage || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (redirecting) {
    return null;
  }

  return (
    <AuthShell footer="Secure Enterprise Operations Platform">
      <AuthBrandPane />

      <section className="erp-auth-panel" aria-labelledby="login-heading">
        <div className="erp-auth-panel-brand">
          <AuthBrand variant="theme" />
        </div>
        <h2 id="login-heading" className="erp-auth-panel-heading">
          Secure ERP / MRP Access
        </h2>
        <p className="erp-auth-panel-sub">
          Sign in to continue to your command center.
        </p>

        <AuthError message={error} onClose={() => setError(null)} />

        <Form
          name="login"
          onFinish={onFinish}
          layout="vertical"
          initialValues={{ email: initialEmail }}
          requiredMark={false}
          disabled={loading}
        >
          <Form.Item
            name="email"
            label="Username / Email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#8c94a6' }} />}
              placeholder="Email address"
              size="large"
              autoComplete="username"
              autoFocus
            />
          </Form.Item>

          <PasswordField
            name="password"
            label="Password"
            placeholder="Password"
            autoComplete="current-password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          />

          <div className="erp-auth-panel-row">
            <Link className="erp-auth-link" to="/forgot-password">
              Forgot password?
            </Link>
          </div>

          <Button
            className="erp-auth-button"
            type="primary"
            htmlType="submit"
            block
            loading={loading}
            icon={<LoginOutlined />}
          >
            Sign In
          </Button>
        </Form>

        <p className="erp-auth-note">
          <LockOutlined aria-hidden="true" />
          New user accounts are provisioned by your system administrator.
        </p>
      </section>
    </AuthShell>
  );
};

export default Login;