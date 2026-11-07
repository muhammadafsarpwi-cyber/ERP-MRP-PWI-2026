import React, { useEffect, useState } from 'react';
import { Button, Form, Result } from 'antd';
import { ArrowLeftOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import apiService from '../../services/api';
import AuthBrandPane from '../../components/auth/AuthBrandPane';
import AuthError from '../../components/auth/AuthError';
import AuthShell from '../../components/auth/AuthShell';
import PasswordField from '../../components/auth/PasswordField';
import './auth.css';

const PASSWORD_RULES = [
  { required: true, message: 'Please enter a new password' },
  { min: 8, message: 'Password must be at least 8 characters' },
  {
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
    message: 'Must contain an uppercase letter, a lowercase letter, and a number',
  },
];

const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    document.title = 'Set New Password | PWI — Pakistan Wire Industries (Pvt.) LTD';
  }, []);

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
      if (err.response?.status === 0 || !err.response) {
        setError('Unable to connect to the ERP server. Please try again.');
      } else {
        setError('Failed to reset password. The link may have expired. Please request a new one.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell footer="PWI Enterprise Manufacturing & MRP Platform • Pakistan Wire Industries (Pvt.) LTD">
      <AuthBrandPane />

      <section className="erp-auth-panel erp-2027-login-card" aria-labelledby="reset-heading">
        <div className="erp-auth-panel-brand erp-auth-logo-center">
          <div className="erp-welcome-logo-wrap" title="Pakistan Wire Industries (Pvt.) LTD">
            <div className="erp-welcome-logo-badge">
              <img
                className="erp-welcome-logo erp-brand-mark"
                src={`${process.env.PUBLIC_URL}/logo.png`}
                alt="PWI Logo"
              />
            </div>
          </div>
        </div>

        {!token ? (
          <div className="erp-auth-result">
            <Result
              status="error"
              title="Invalid Reset Link"
              subTitle="This password reset link is invalid or has expired. Please request a new one."
              extra={
                <Link to="/forgot-password">
                  <Button type="primary" className="erp-auth-button erp-2027-auth-button">
                    Request New Reset Link
                  </Button>
                </Link>
              }
            />
          </div>
        ) : success ? (
          <div className="erp-auth-result">
            <Result
              status="success"
              title="Password Reset Successfully"
              subTitle="Your password has been updated. You can now sign in with your new password."
              extra={
                <Link to="/login">
                  <Button type="primary" className="erp-auth-button erp-2027-auth-button">
                    <SafetyCertificateOutlined />
                    Sign In
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <div className="erp-auth-header-block">
              <div className="erp-auth-tagline-badge">CREDENTIAL UPDATE</div>
              <h2 id="reset-heading" className="erp-auth-panel-heading">
                Set New Password
              </h2>
              <p className="erp-auth-panel-sub">
                Choose a strong new password for your PWI enterprise account.
              </p>
            </div>

            <AuthError message={error} onClose={() => setError(null)} />

            <Form
              name="reset-password"
              onFinish={onFinish}
              layout="vertical"
              requiredMark={false}
              disabled={loading}
            >
              <PasswordField
                name="password"
                label={<span className="erp-2027-field-label">NEW PASSWORD</span>}
                placeholder="New password"
                autoComplete="new-password"
                rules={PASSWORD_RULES}
                extra={
                  <span className="erp-password-help">
                    Minimum 8 characters with uppercase, lowercase, and a number.
                  </span>
                }
              />

              <PasswordField
                name="confirmPassword"
                label={<span className="erp-2027-field-label">CONFIRM NEW PASSWORD</span>}
                placeholder="Confirm new password"
                autoComplete="new-password"
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
              />

              <Button
                className="erp-auth-button erp-2027-auth-button"
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                icon={<SafetyCertificateOutlined />}
              >
                Reset Password
              </Button>
            </Form>

            <div className="erp-2027-back-wrap">
              <Link className="erp-auth-link erp-2027-back-link" to="/login">
                <ArrowLeftOutlined /> Back to Sign In
              </Link>
            </div>
          </>
        )}
      </section>
    </AuthShell>
  );
};

export default ResetPassword;
