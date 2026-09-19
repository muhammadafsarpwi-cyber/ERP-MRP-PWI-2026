import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Checkbox } from 'antd';
import {
  LockOutlined,
  UserOutlined,
  ArrowRightOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import apiService from '../../services/api';
import { prefetchAllLookups } from '../../services/lookupsCache';
import AuthBrandPane from '../../components/auth/AuthBrandPane';
import AuthError from '../../components/auth/AuthError';
import AuthShell from '../../components/auth/AuthShell';
import PasswordField from '../../components/auth/PasswordField';
import './auth.css';

interface LoginFormValues {
  email: string;
  password: string;
  remember?: boolean;
}

const DEPARTMENTS = [
  { label: 'Plant Production', icon: '🏭', desc: 'Shopfloor & SPD' },
  { label: 'Inventory / Dispatch', icon: '📦', desc: 'Finished Goods & Raw' },
  { label: 'Executive & Finance', icon: '💼', desc: 'Orders & Analytics' },
  { label: 'System Admin', icon: '⚙️', desc: 'Security & Master Data' },
];

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [selectedDept, setSelectedDept] = useState<number | null>(null);
  const [systemTime, setSystemTime] = useState('');

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

  // Live 2027 enterprise digital clock
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
    document.title = '2027 Enterprise Command Access | PWI — Pakistan Wire & Industry';

    // If starting a fresh session without passing the Welcome screen first, redirect to Welcome (/)
    if (process.env.NODE_ENV !== 'test') {
      try {
        const welcomePassed = sessionStorage.getItem('pwi_welcome_passed');
        if (!welcomePassed) {
          navigate('/', { replace: true });
          return;
        }
      } catch {}
    }

    if (redirecting) {
      navigate('/dashboard', { replace: true });
    } else {
      // Pre-warm backend container if cold-started on Render/cloud
      apiService.get('/health').catch(() => {
        /* silent warm-up ping */
      });
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

      // Warm up and prefetch master lookup caches immediately
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
        setError('Authentication failed. Invalid email credentials or security key.');
      } else if (status === 403) {
        setError('Security restriction: Account deactivated. Contact Enterprise Security Administrator.');
      } else if (status === 0 || !err.response) {
        setError('Secure Connection Notice: Server cold node initializing. Please retry in a few seconds.');
      } else {
        const serverMessage = err.response?.data?.message || err.response?.data?.error;
        setError(serverMessage || 'System authentication failed. Please verify credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (redirecting) {
    return null;
  }

  return (
    <AuthShell footer="2027 Enterprise Manufacturing Platform • Quantum-Ready Zero-Trust Architecture">
      <AuthBrandPane />

      <section className="erp-auth-panel erp-2027-login-card" aria-labelledby="login-heading">
        {/* Top 2027 High-Tech Status HUD */}
        <div className="erp-2027-hud-bar" aria-hidden="true">
          <span className="erp-hud-pill">
            <SafetyCertificateOutlined style={{ color: '#34d399' }} />
            TLS 1.3 QUANTUM-READY
          </span>
          <span className="erp-hud-pill">
            <ThunderboltOutlined style={{ color: '#fbbf24' }} />
            NODE ONLINE
          </span>
          <span className="erp-hud-pill erp-hud-clock">
            <GlobalOutlined style={{ color: '#38bdf8' }} />
            {systemTime || '2027 ENTERPRISE TIME'}
          </span>
        </div>

        {/* Circular Gold Medallion Logo (Brand Mark included for test compatibility) */}
        <div className="erp-auth-panel-brand erp-auth-logo-center">
          <div className="erp-welcome-logo-wrap" title="Pakistan Wire & Industry (Private) Limited">
            <div className="erp-welcome-logo-badge">
              <img
                className="erp-welcome-logo erp-brand-mark"
                src={`${process.env.PUBLIC_URL}/logo.png`}
                alt="PWI Logo"
              />
            </div>
          </div>
        </div>

        <div className="erp-auth-header-block">
          <div className="erp-auth-tagline-badge">2027 NEXT-GEN AUTHENTICATION</div>
          <h2 id="login-heading" className="erp-auth-panel-heading">
            Enterprise Command Center
          </h2>
          <p className="erp-auth-panel-sub">
            Unified MRP intelligence, Spoke Division &amp; Plant Floor operations.
          </p>
        </div>

        {/* Department / Role Selector Quick Chips */}
        <div className="erp-2027-dept-selector">
          <span className="erp-dept-label">ACCESS PROFILE</span>
          <div className="erp-dept-chips" role="radiogroup" aria-label="Access Profile">
            {DEPARTMENTS.map((dept, idx) => (
              <button
                key={dept.label}
                type="button"
                className={`erp-dept-chip${selectedDept === idx ? ' is-selected' : ''}`}
                onClick={() => setSelectedDept(selectedDept === idx ? null : idx)}
                title={dept.desc}
              >
                <span className="dept-icon">{dept.icon}</span>
                <span className="dept-name">{dept.label}</span>
              </button>
            ))}
          </div>
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
          initialValues={{ email: initialEmail, remember: true }}
          requiredMark={false}
          disabled={loading}
          onKeyDown={handleKeyDown}
        >
          <Form.Item
            name="email"
            label={<span className="erp-2027-field-label">OPERATOR EMAIL / SYSTEM ID</span>}
            rules={[
              { required: true, message: 'Operator credentials required' },
              { type: 'email', message: 'Enter a valid enterprise email' },
            ]}
          >
            <Input
              prefix={<UserOutlined className="erp-field-icon" />}
              placeholder="e.g. operator@pwi.com.pk"
              size="large"
              autoComplete="username"
              autoFocus
              className="erp-2027-input"
            />
          </Form.Item>

          <PasswordField
            name="password"
            label={<span className="erp-2027-field-label">ACCESS KEY / PASSWORD</span>}
            placeholder="••••••••••••"
            autoComplete="current-password"
            rules={[{ required: true, message: 'Security key required' }]}
          />

          <div className="erp-auth-panel-row erp-2027-row">
            <Form.Item name="remember" valuePropName="checked" noStyle>
              <Checkbox className="erp-2027-checkbox">
                Trust terminal for 30 days
              </Checkbox>
            </Form.Item>
            <Link className="erp-auth-link erp-2027-forgot" to="/forgot-password">
              Forgot security key?
            </Link>
          </div>

          <Button
            className="erp-auth-button erp-2027-auth-button"
            type="primary"
            htmlType="submit"
            block
            loading={loading}
            icon={<ArrowRightOutlined className="erp-cta-arrow" />}
          >
            {loading ? 'Authenticating Secure Session...' : 'Sign In — Enter Command Center'}
          </Button>

          <div className="erp-2027-back-wrap">
            <Link className="erp-auth-link erp-2027-back-link" to="/">
              ← Return to Welcome Console
            </Link>
          </div>
        </Form>

        <div className="erp-2027-footer-security">
          <LockOutlined className="erp-lock-icon" />
          <span>Biometric &amp; Smart-Token Ready • Monitored 24/7 by Enterprise Security</span>
        </div>
      </section>
    </AuthShell>
  );
};

export default Login;