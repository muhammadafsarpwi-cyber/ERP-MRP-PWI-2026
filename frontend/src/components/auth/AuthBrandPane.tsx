import React from 'react';
import AuthBrand from './AuthBrand';

/** Left-hand industrial identity column used by Login / Forgot / Reset screens. */
const AuthBrandPane: React.FC = () => {
  return (
    <section className="erp-auth-brand-pane">
      <AuthBrand size="lg" />
      <h2 className="erp-auth-pane-title">
        Manufacturing Intelligence
        <br />
        &amp; Operations Platform
      </h2>
      <p className="erp-auth-pane-text">
        A single, secure command center for production, inventory,
        procurement and sales operations at Pakistan Wire &amp; Industry.
      </p>
      <ul className="erp-auth-pane-list">
        <li>Manufacturing</li>
        <li>Inventory</li>
        <li>Procurement</li>
        <li>Sales</li>
      </ul>
      <div className="erp-auth-status">
        <span className="erp-auth-status-dot" aria-hidden="true" />
        Systems Operational
      </div>
    </section>
  );
};

export default AuthBrandPane;