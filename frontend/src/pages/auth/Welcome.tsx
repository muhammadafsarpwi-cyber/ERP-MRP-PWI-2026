import React, { useEffect, useState } from 'react';
import { Button } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import AuthBrand from '../../components/auth/AuthBrand';
import ThemeToggle from '../../components/auth/ThemeToggle';
import WelcomeSlideshow from '../../components/auth/WelcomeSlideshow';
import './auth.css';

const Welcome: React.FC = () => {
  const navigate = useNavigate();
  const [redirecting] = useState(() => !!localStorage.getItem('token'));

  useEffect(() => {
    document.title = 'Welcome | PWI — Pakistan Wire & Industry';
  }, []);

  useEffect(() => {
    if (redirecting) {
      navigate('/dashboard', { replace: true });
    }
  }, [redirecting, navigate]);

  const handleEnter = () => {
    navigate('/login');
  };

  // Keyboard: Enter or Escape → Sign In immediately (cleanup happens on unmount).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'BUTTON' ||
          target.tagName === 'A' ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA')
      ) {
        return;
      }
      event.preventDefault();
      navigate('/login');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  if (redirecting) {
    return null;
  }

  return (
    <div className="erp-auth-root">
      <WelcomeSlideshow onComplete={() => navigate('/login')} />
      <div className="erp-auth-shade" />
      <div className="erp-auth-grid" />
      <div className="erp-auth-corners" aria-hidden="true">
        <span className="erp-corner erp-corner-tl" />
        <span className="erp-corner erp-corner-tr" />
        <span className="erp-corner erp-corner-bl" />
        <span className="erp-corner erp-corner-br" />
      </div>

      <header className="erp-auth-top">
        <AuthBrand />
        <div className="erp-auth-top-right">
          <span className="erp-auth-status">
            <span className="erp-auth-status-dot" aria-hidden="true" />
            Systems Operational
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="erp-welcome-main">
        <p className="erp-welcome-eyebrow">Industrial ERP / MRP Management System</p>
        <h1 className="erp-welcome-title">PWI</h1>
        <h2 className="erp-welcome-company">Pakistan Wire &amp; Industry</h2>
        <div className="erp-welcome-divider" aria-hidden="true" />
        <p className="erp-welcome-tagline">
          Production <span className="erp-welcome-sep" aria-hidden="true">•</span>{' '}
          Inventory <span className="erp-welcome-sep" aria-hidden="true">•</span>{' '}
          Procurement <span className="erp-welcome-sep" aria-hidden="true">•</span>{' '}
          Sales
        </p>
        <Button
          className="erp-enter-btn"
          type="primary"
          size="large"
          onClick={handleEnter}
        >
          Enter System
          <ArrowRightOutlined />
        </Button>
        <p className="erp-welcome-security">Secure Enterprise Operations Platform</p>
      </main>

      <footer className="erp-auth-footer">
        <span>PWI • Pakistan Wire &amp; Industry</span>
        <span>ERP / MRP Platform</span>
        <span>© 2026 Pakistan Wire &amp; Industry</span>
      </footer>
    </div>
  );
};

export default Welcome;