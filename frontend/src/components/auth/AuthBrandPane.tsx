import React from 'react';
import AuthBrand from './AuthBrand';

/** Left-hand 2027 industrial identity column used by Login / Forgot / Reset screens. */
const AuthBrandPane: React.FC = () => {
  return (
    <section className="erp-auth-brand-pane erp-2027-brand-pane">
      <AuthBrand size="lg" />

      <div className="erp-pane-badge-2027">
        <span className="erp-pane-badge-dot" />
        ENTERPRISE MRP ECOSYSTEM 2027
      </div>

      <h2 className="erp-auth-pane-title erp-2027-pane-title">
        Manufacturing
        <br />
        &amp; Operations Platform
      </h2>

      <p className="erp-auth-pane-text">
        Real-time production scheduling, automated quality control, inventory
        and high-speed dispatch for Pakistan Wire &amp; Industry (Private) Limited.
      </p>

      {/* 2027 Live Plant Division Telemetry Cards */}
      <div className="erp-2027-telemetry-grid">
        <div className="erp-telemetry-card">
          <div className="telemetry-top">
            <span className="telemetry-tag">SPD DIVISION</span>
            <span className="telemetry-val">99.8%</span>
          </div>
          <div className="telemetry-name">Spoke &amp; Nipple Processing</div>
        </div>

        <div className="erp-telemetry-card">
          <div className="telemetry-top">
            <span className="telemetry-tag">WIRE DRAWING</span>
            <span className="telemetry-val">ACTIVE</span>
          </div>
          <div className="telemetry-name">Continuous Annealing &amp; Sizing</div>
        </div>

        <div className="erp-telemetry-card">
          <div className="telemetry-top">
            <span className="telemetry-tag">PLATING PLANT</span>
            <span className="telemetry-val">AUTOMATED</span>
          </div>
          <div className="telemetry-name">Nickel-Chrome Mirror Auto-Finish</div>
        </div>

        <div className="erp-telemetry-card">
          <div className="telemetry-top">
            <span className="telemetry-tag">QUALITY ASSURANCE</span>
            <span className="telemetry-val">ISO 9001</span>
          </div>
          <div className="telemetry-name">Batch-Level Lot Traceability</div>
        </div>
      </div>

      <div className="erp-auth-status erp-2027-auth-status">
        <span className="erp-auth-status-dot" aria-hidden="true" />
        <span className="status-strong">Enterprise Cluster Online</span>
        <span className="status-sep">•</span>
        <span className="status-meta">Zero Latency Sync</span>
      </div>
    </section>
  );
};

export default AuthBrandPane;