import React from 'react';
import { Card } from 'antd';
import { ToolOutlined } from '@ant-design/icons';
import PageHeader from '../../components/shared/PageHeader';

interface HrComingSoonProps {
  /** Human-readable module name shown in the page header. */
  section: string;
}

/**
 * Truthful placeholder for HR modules that are not implemented yet.
 *
 * This is a real registered route (the sidebar entry is fully functional and
 * the breadcrumb/title resolve from navigationConfig), but the page content
 * clearly states the module is not implemented. No fake or placeholder data is
 * ever rendered — a module either reports real data or says it is unavailable.
 */
const HrComingSoon: React.FC<HrComingSoonProps> = ({ section }) => (
  <>
    <PageHeader icon={<ToolOutlined />} title={section} subtitle="Module is planned but not implemented yet" />
    <div className="erp-dashboard">
      <Card size="small" className="erp-section-card">
        <div className="erp-empty-state" style={{ padding: '48px 14px' }}>
          <div className="erp-empty-state__icon">
            <ToolOutlined />
          </div>
          <div className="erp-empty-state__title">{section} — not implemented yet</div>
          <div className="erp-empty-state__desc">
            This module is registered for navigation but has not been built. It will return live data
            once implemented — no sample or placeholder data is shown.
          </div>
        </div>
      </Card>
    </div>
  </>
);

export default HrComingSoon;