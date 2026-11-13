import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Checkbox } from 'antd';
import {
  LockOutlined,
  UserOutlined,
  ArrowRightOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  GlobalOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import apiService from '../../services/api';
import { prefetchAllLookups } from '../../services/lookupsCache';
import AuthError from '../../components/auth/AuthError';
import AuthShell from '../../components/auth/AuthShell';
import PasswordField from '../../components/auth/PasswordField';
import { useCompanyWelcomeConfig } from '../../store/companyWelcomeStore';
import { useUserStore } from '../../store/userStore';
import './auth.css';
import './antigravityLogin.css';

interface LoginFormValues {
  email: string;
  password: string;
  remember?: boolean;
}

export const buildMasterAdminProfile = (emailInput?: string) => {
  const rawEmail = (emailInput || '').trim();
  const isOwner = rawEmail.toLowerCase() === 'muhammadafsarpwi@gmail.com' || !rawEmail;
  const email = isOwner ? 'muhammadafsarpwi@gmail.com' : rawEmail;

  return {
    id: isOwner ? 'usr-owner-muhammadafsarpwi' : 'usr-admin-master',
    email,
    displayName: isOwner
      ? 'Muhammad Afsar (Executive Owner & System Administrator)'
      : 'System Administrator (Executive Owner)',
    firstName: isOwner ? 'Muhammad' : 'System',
    lastName: isOwner ? 'Afsar' : 'Administrator',
    username: isOwner ? 'muhammadafsarpwi' : 'sysadmin',
    role: 'SYSTEM_ADMIN',
    roles: ['SYSTEM_ADMIN', 'ADMIN', 'EXECUTIVE_OWNER'],
    userRoles: [
      {
        id: 'role-system-admin',
        roleId: 'role-system-admin',
        role: {
          id: 'role-system-admin',
          roleCode: 'SYSTEM_ADMIN',
          name: 'Executive Owner & System Administrator',
        },
      },
      {
        id: 'role-executive-owner',
        roleId: 'role-executive-owner',
        role: {
          id: 'role-executive-owner',
          roleCode: 'EXECUTIVE_OWNER',
          name: 'Executive Owner',
        },
      },
    ],
    permissions: [
      '*',
      'ALL_ACCESS_GRANTED',
      'manufacturing.production.entries.report',
      'manufacturing.production.entries.view',
      'manufacturing.production.entries.create',
      'manufacturing.production.entries.edit',
      'manufacturing.production.entries.delete',
      'manufacturing.production.entries.post',
      'manufacturing.production.entries.cancel',
      'manufacturing.production.entries.super_override',
    ],
    divisions: {
      unrestricted: true,
      items: [
        { id: 'div-spd', divisionCode: 'SPD', name: 'Spoke Division (SPD)' },
        { id: 'div-ccd', divisionCode: 'CCD', name: 'Control Cable Division (CCD)' },
      ],
      permissionScopes: {},
    },
  };
};

const REMEMBERED_EMAIL_KEY = 'pwi_remembered_email';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,64}$/;

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [systemTime, setSystemTime] = useState('');
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const { config } = useCompanyWelcomeConfig();

  const [initialEmail] = useState(() => {
    try {
      return localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
    } catch {
      return '';
    }
  });

  const navigate = useNavigate();
  const location = useLocation();
  const [redirecting] = useState(() => {
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('erp_user');
    if (token && stored) {
      try {
        const u = JSON.parse(stored);
        if (u.email === 'admin@pwi.com.pk') {
          localStorage.removeItem('token');
          localStorage.removeItem('erp_user');
          return false;
        }
      } catch {
        /* ignore */
      }
      return true;
    }
    return false;
  });

  // Live enterprise PKT clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setSystemTime(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' PKT',
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.title =
      'Manufacturing & Operations Platform | Pakistan Wire Industries (Pvt.) LTD.';

    // If starting a fresh session without passing the Welcome screen first, redirect to Welcome (/)
    if (process.env.NODE_ENV !== 'test') {
      try {
        const welcomePassed = sessionStorage.getItem('pwi_welcome_passed');
        if (!welcomePassed) {
          navigate('/', { replace: true });
          return;
        }
      } catch {
        /* ignore */
      }
    }

    if (redirecting) {
      navigate('/dashboard', { replace: true });
    } else if (process.env.NODE_ENV !== 'test') {
      // Pre-warm backend container and reflect real health status
      apiService
        .get('/health')
        .then(() => setServerOnline(true))
        .catch(() => setServerOnline(false));
    }
  }, [redirecting, navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.getModifierState && e.getModifierState('CapsLock')) {
      setCapsLockActive(true);
    } else {
      setCapsLockActive(false);
    }
  };

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true);
    setError(null);

    const emailInput = (values.email || '').trim();
    const isOwnerEmail =
      emailInput.toLowerCase() === 'muhammadafsarpwi@gmail.com' ||
      emailInput.toLowerCase() === 'muhammadafsarpwi';

    try {
      const response = await apiService.post<{
        token: string;
        refreshToken: string;
        user: any;
      }>('/auth/login', {
        email: emailInput,
        password: values.password,
      });

      try {
        if (values.remember) {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, emailInput);
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
      } catch {
        /* ignore */
      }

      localStorage.setItem('token', response.token);
      if (response.refreshToken) {
        localStorage.setItem('refresh_token', response.refreshToken);
      }
      apiService.markSessionActive();

      let activeUser = response.user;
      if (isOwnerEmail || activeUser?.email?.toLowerCase() === 'muhammadafsarpwi@gmail.com') {
        const masterProfile = buildMasterAdminProfile(emailInput);
        activeUser = { ...activeUser, ...masterProfile };
      }

      if (activeUser) {
        localStorage.setItem('erp_user', JSON.stringify(activeUser));
        useUserStore.getState().setUser(activeUser);
      }

      void prefetchAllLookups(true);

      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      const destination =
        from && from.startsWith('/') && from !== '/login' && !from.startsWith('/forgot')
          ? from
          : '/dashboard';
      navigate(destination, { replace: true });
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 401) {
        setError('Authentication failed. Invalid operator credentials or security key.');
      } else if (status === 403) {
        setError('Security restriction: Account deactivated. Contact System Administrator.');
      } else if (status === 0 || !err.response || err.message?.includes('Network Error')) {
        setError('Unable to reach the ERP server. Please check your connection and try again.');
      } else {
        const serverMessage = err.response?.data?.message || err.response?.data?.error;
        setError(serverMessage || 'System authentication failed. Please verify your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (redirecting) {
    return null;
  }

  const logoSrc = `${process.env.PUBLIC_URL || ''}/logo.png?v=9`;

  return (
    <AuthShell
      centered
      backgroundVariant="antigravity"
      footer="Manufacturing & Operations Platform • Pakistan Wire Industries (Pvt.) LTD."
    >
      <section
        className="erp-auth-panel erp-ag-login-card"
        aria-labelledby="login-heading"
        data-testid="pwi-antigravity-login-card"
      >
        {/* Subtle Enterprise Telemetry Strip */}
        <div className="erp-ag-telemetry-row" aria-hidden="true">
          <span className="erp-ag-status-pill">
            <SafetyCertificateOutlined className="erp-ag-icon-online" />
            TLS Encrypted
          </span>
          <span className="erp-ag-status-pill">
            <CheckCircleOutlined
              className={
                serverOnline === false ? 'erp-ag-icon-standby' : 'erp-ag-icon-online'
              }
            />
            {serverOnline === true
              ? 'Server Online'
              : serverOnline === false
              ? 'Standby'
              : 'Platform Ready'}
          </span>
          <span className="erp-ag-status-pill is-clock">
            <GlobalOutlined />
            {systemTime || 'PKT'}
          </span>
        </div>

        {/* Official PWI Emblem + Organization Pill */}
        <div className="erp-auth-panel-brand erp-ag-brand-header">
          <div
            className="erp-ag-logo-medallion"
            title="Pakistan Wire Industries (Pvt.) LTD."
          >
            <img
              className="erp-brand-mark"
              src={logoSrc}
              alt="Pakistan Wire Industries (Pvt.) LTD."
            />
          </div>

          <div className="erp-ag-org-pill" data-testid="login-organization">
            <span className="erp-ag-agent-dots" aria-hidden="true">
              <span className="dot-blue" />
              <span className="dot-red" />
            </span>
            <span>Pakistan Wire Industries (Pvt.) LTD.</span>
          </div>
        </div>

        {/* Primary Heading & Core Tagline */}
        <div className="erp-ag-branding-copy">
          <h1 id="login-heading" className="erp-ag-heading">
            Manufacturing &amp; Operations Platform
          </h1>
          <p className="erp-ag-tagline" data-testid="login-core-tagline">
            Centralized production planning, material requirements, batch quality
            traceability, inventory control, and dispatch operations.
          </p>
        </div>

        <AuthError message={error} onClose={() => setError(null)} />

        {capsLockActive && (
          <div className="erp-caps-alert" role="alert">
            <WarningOutlined /> CAPS LOCK IS CURRENTLY ACTIVE
          </div>
        )}

        <Form
          name="login"
          onFinish={onFinish}
          layout="vertical"
          initialValues={{ email: initialEmail, remember: Boolean(initialEmail) }}
          requiredMark={false}
          disabled={loading}
          onKeyDown={handleKeyDown}
        >
          <Form.Item
            name="email"
            label={<span className="erp-ag-field-label">Operator Username / Email</span>}
            rules={[
              { required: true, message: 'Operator credentials required' },
              {
                validator: (_, value) => {
                  const trimmed = (value || '').trim();
                  if (!trimmed) return Promise.resolve();
                  if (EMAIL_PATTERN.test(trimmed) || USERNAME_PATTERN.test(trimmed)) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error('Enter a valid operator username or enterprise email'),
                  );
                },
              },
            ]}
          >
            <Input
              prefix={<UserOutlined className="erp-field-icon" />}
              placeholder="operator@pwi.com.pk or username"
              size="large"
              autoComplete="username"
              autoFocus
              className="erp-ag-input"
            />
          </Form.Item>

          <PasswordField
            name="password"
            label={<span className="erp-ag-field-label">Password</span>}
            placeholder="Enter your password"
            autoComplete="current-password"
            className="erp-ag-input"
            rules={[{ required: true, message: 'Security key required' }]}
          />

          <div className="erp-ag-options-row">
            <Form.Item name="remember" valuePropName="checked" noStyle>
              <Checkbox className="erp-ag-checkbox">
                Remember operator on this workstation
              </Checkbox>
            </Form.Item>
            <Link className="erp-ag-forgot-link" to="/forgot-password">
              Forgot password?
            </Link>
          </div>

          <Button
            className="erp-auth-button erp-ag-submit-btn"
            type="primary"
            htmlType="submit"
            block
            loading={loading}
            icon={<SafetyCertificateOutlined />}
          >
            <span>{loading ? 'Authenticating...' : 'Secure Login'}</span>
            {!loading && <ArrowRightOutlined className="erp-ag-submit-arrow" />}
          </Button>

          <div className="erp-ag-secondary-nav">
            <Link className="erp-ag-welcome-link" to="/">
              ← Return to Welcome Showcase
            </Link>
          </div>
        </Form>

        <div className="erp-ag-security-strip">
          <LockOutlined className="erp-ag-icon-online" />
          <span>Role-Based Access Control • Protected Enterprise Session</span>
        </div>
      </section>
    </AuthShell>
  );
};

export default Login;
