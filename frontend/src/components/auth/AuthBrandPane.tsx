import React, { useMemo } from 'react';
import {
  formatDivisionFlowSummary,
  parseCompanyBrandParts,
} from '../../config/companyWelcomeConfig';
import { useCompanyWelcomeConfig } from '../../store/companyWelcomeStore';

/** Left-hand corporate division column used by Login / Forgot / Reset screens. */
const AuthBrandPane: React.FC = () => {
  const { config, enabledDivisions } = useCompanyWelcomeConfig();
  const brand = useMemo(
    () => parseCompanyBrandParts(config.companyName),
    [config.companyName],
  );

  return (
    <section className="erp-auth-brand-pane erp-2027-brand-pane">
      <div className="erp-pane-badge-2027">
        <span className="erp-pane-badge-dot" />
        {brand.monogram} ENTERPRISE ERP &amp; MRP • 2026
      </div>

      <h2 className="erp-auth-pane-title erp-2027-pane-title">
        Integrated Manufacturing
        <br />
        &amp; Operations Platform
      </h2>

      <p className="erp-auth-pane-text">
        Centralized production planning, material requirements, batch quality
        traceability, inventory control, and dispatch operations for{' '}
        {brand.fullName}.
      </p>

      {/* Dynamically rendered Operational Manufacturing Divisions from Company Settings */}
      <div className="erp-2027-telemetry-grid">
        {enabledDivisions.map((div, idx) => (
          <div className="erp-telemetry-card" key={div.id}>
            <div className="telemetry-top">
              <span className="telemetry-tag">{div.name.toUpperCase()}</span>
              <span className="telemetry-val">
                {div.code || `DIV 0${idx + 1}`}
              </span>
            </div>
            <div className="telemetry-name">{formatDivisionFlowSummary(div)}</div>
          </div>
        ))}
      </div>

      <div className="erp-auth-status erp-2027-auth-status">
        <span className="erp-auth-status-dot" aria-hidden="true" />
        <span className="status-strong">{brand.fullName}</span>
        <span className="status-sep">•</span>
        <span className="status-meta">Established Industrial Excellence</span>
      </div>
    </section>
  );
};

export default AuthBrandPane;
