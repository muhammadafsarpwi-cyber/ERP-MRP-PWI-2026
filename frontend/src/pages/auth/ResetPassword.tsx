import React, { useEffect, useState } from 'react';
import { Button, Form, Result } from 'antd';
import { ArrowLeftOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import apiService from '../../services/api';
import AuthBrand from '../../components/auth/AuthBrand';
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
    document.title = 'Set New Password | PWI — Pakistan Wire & Industry';
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
    <AuthShell footer="Secure Enterprise Operations Platform">
      <AuthBrandPane />

      <section className="erp-auth-panel" aria-labelledby="reset-heading">
        <div className="erp-auth-panel-brand">
          <AuthBrand variant="theme" />
        </div>
        {!token ? (
          <div className="erp-auth-result">
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
          </div>
        ) : success ? (
          <div className="erp-auth-result">
            <Result
              status="success"
              title="Password Reset Successfully"
              subTitle="Your password has been updated. You can now sign in with your new password."
              extra={
                <Link to="/login">
                  <Button type="primary">
                    <SafetyCertificateOutlined />
                    Sign In
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <h2 id="reset-heading" className="erp-auth-panel-heading">
              Set New Password
            </h2>
            <p className="erp-auth-panel-sub">
              Enter a new password for your account.
            </p>

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
                label="New Password"
                placeholder="New password"
                autoComplete="new-password"
                rules={PASSWORD_RULES}
                extra={
                  <span className="erp-password-help">
                    Minimum 8 characters with at least one uppercase letter, one
                    lowercase letter, and one number.
                  </span>
                }
              />

              <PasswordField
                name="confirmPassword"
                label="Confirm New Password"
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
                className="erp-auth-button"
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                icon={<SafetyCertificateOutlined />}
              >
                Reset Password
              </Button>
            </Form>

            <p className="erp-auth-note">
              <Link className="erp-auth-link" to="/login">
                <ArrowLeftOutlined />
                Back to Sign In
              </Link>
            </p>
          </>
        )}
      </section>
    </AuthShell>
  );
};

export default ResetPassword;