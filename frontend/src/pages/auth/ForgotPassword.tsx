import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Result } from 'antd';
import { ArrowLeftOutlined, MailOutlined, SendOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import apiService from '../../services/api';
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
    document.title = 'Reset Password | PWI — Pakistan Wire Industries (Pvt.) LTD';
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
    <AuthShell footer="PWI Enterprise Manufacturing & MRP Platform • Pakistan Wire Industries (Pvt.) LTD">
      <AuthBrandPane />

      <section className="erp-auth-panel erp-2027-login-card" aria-labelledby="forgot-heading">
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
                  <Button type="primary" className="erp-auth-button erp-2027-auth-button">
                    <ArrowLeftOutlined />
                    Back to Sign In
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <div className="erp-auth-header-block">
              <div className="erp-auth-tagline-badge">ACCOUNT RECOVERY</div>
              <h2 id="forgot-heading" className="erp-auth-panel-heading">
                Reset Password
              </h2>
              <p className="erp-auth-panel-sub">
                Enter your registered email address and we&apos;ll send a secure link to reset your password.
              </p>
            </div>

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
                label={<span className="erp-2027-field-label">REGISTERED EMAIL</span>}
                rules={[
                  { required: true, message: 'Please enter your email' },
                  { type: 'email', message: 'Please enter a valid email' },
                ]}
              >
                <Input
                  prefix={<MailOutlined className="erp-field-icon" />}
                  placeholder="name@pwi.com.pk"
                  size="large"
                  autoComplete="email"
                  autoFocus
                  className="erp-2027-input"
                />
              </Form.Item>

              <Button
                className="erp-auth-button erp-2027-auth-button"
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                icon={<SendOutlined />}
              >
                Send Reset Link
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

export default ForgotPassword;
