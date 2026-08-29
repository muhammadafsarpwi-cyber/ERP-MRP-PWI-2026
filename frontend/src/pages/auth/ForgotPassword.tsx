import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Result } from 'antd';
import { ArrowLeftOutlined, MailOutlined, SendOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import apiService from '../../services/api';
import AuthBrand from '../../components/auth/AuthBrand';
import AuthBrandPane from '../../components/auth/AuthBrandPane';
import AuthError from '../../components/auth/AuthError';
import AuthShell from '../../components/auth/AuthShell';
import './auth.css';

const ForgotPassword: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  useEffect(() => {
    document.title = 'Reset Password | PWI — Pakistan Wire & Industry';
  }, []);

  const onFinish = async (values: { email: string }) => {
    setLoading(true);
    setError(null);
    try {
      await apiService.post('/auth/forgot-password', { email: values.email });
      setSubmittedEmail(values.email);
      setSent(true);
    } catch (err: any) {
      if (err.response?.status === 0 || !err.response) {
        setError('Unable to connect to the ERP server. Please try again.');
      } else {
        setError('Failed to send reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell footer="Secure Enterprise Operations Platform">
      <AuthBrandPane />

      <section className="erp-auth-panel" aria-labelledby="forgot-heading">
        <div className="erp-auth-panel-brand">
          <AuthBrand variant="theme" />
        </div>
        {sent ? (
          <div className="erp-auth-result">
            <Result
              status="success"
              title="Check your email"
              subTitle={
                <span>
                  If an account exists with <strong>{submittedEmail}</strong>, a
                  password reset link has been sent to your inbox and spam folder.
                </span>
              }
              extra={
                <Link to="/login">
                  <Button type="primary">
                    <ArrowLeftOutlined />
                    Back to Sign In
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <h2 id="forgot-heading" className="erp-auth-panel-heading">
              Reset Password
            </h2>
            <p className="erp-auth-panel-sub">
              Enter your email address and we&apos;ll send you a secure link to reset
              your password.
            </p>

            <AuthError message={error} onClose={() => setError(null)} />

            <Form
              name="forgot-password"
              onFinish={onFinish}
              layout="vertical"
              requiredMark={false}
              disabled={loading}
            >
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Please enter your email' },
                  { type: 'email', message: 'Please enter a valid email' },
                ]}
              >
                <Input
                  prefix={<MailOutlined style={{ color: '#8c94a6' }} />}
                  placeholder="Email address"
                  size="large"
                  autoComplete="email"
                  autoFocus
                />
              </Form.Item>

              <Button
                className="erp-auth-button"
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                icon={<SendOutlined />}
              >
                Send Reset Link
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

export default ForgotPassword;