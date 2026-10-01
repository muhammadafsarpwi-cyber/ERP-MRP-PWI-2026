import React, { useState } from 'react';
import { Button } from 'antd';
import { MenuOutlined, SettingOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { Breadcrumbs, PageHeader } from '../shared';
import { findSettingsNavItem, SETTINGS_OVERVIEW } from './settingsNavigationConfig';
import SettingsNavigation from './SettingsSideNavigation';
import OrganizationScopeSelector from './OrganizationScopeSelector';
import { useSettingsResponsive } from './useSettingsResponsive';
import SettingsFolderTabs from './SettingsFolderTabs';
import './settings.css';

export interface SettingsShellProps {
  children: React.ReactNode;
}

/**
 * Shared chrome for every `/settings/*` page.
 *
 *   SettingsShell
 *   ├── PageHeader          → registers title/subtitle/icon in the app header
 *   ├── Breadcrumbs         → shared breadcrumb component
 *   ├── OrganizationScopeSelector
 *   ├── SettingsFolderTabs  → horizontal connected folder tabs (matching reference image)
 *   ├── SettingsNavigation  → left navigation (collapsible on mobile)
 *   └── Settings content    → routed children inside connected folder panel
 */
const SettingsShell: React.FC<SettingsShellProps> = ({ children }) => {
  const location = useLocation();
  const { isMobile, isTablet } = useSettingsResponsive();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeItem = findSettingsNavItem(location.pathname);
  const isOverview = !activeItem || activeItem.overview === true;
  const activePath = activeItem ? activeItem.path : SETTINGS_OVERVIEW.path;

  const title = isOverview ? 'System Settings' : activeItem!.label;
  const subtitle = isOverview
    ? 'System Settings & Customization'
    : activeItem!.description;

  return (
    <div className="erp-settings-shell" data-testid="settings-shell">
      <PageHeader
        icon={<SettingOutlined />}
        title={title}
        subtitle={subtitle}
        showBreadcrumbs
      />

      <div className="erp-settings-context">
        <Breadcrumbs style={{ marginBottom: 0 }} />
        <OrganizationScopeSelector />
      </div>

      {isMobile && (
        <Button
          type="default"
          className="erp-settings-nav-toggle"
          icon={<MenuOutlined aria-hidden="true" />}
          aria-expanded={mobileNavOpen}
          aria-controls="settings-navigation"
          onClick={() => setMobileNavOpen((open) => !open)}
          data-testid="settings-nav-toggle"
        >
          Settings sections
        </Button>
      )}

      <div className="erp-settings-layout">
        <div className="erp-settings-layout-nav">
          <SettingsNavigation
            activePath={activePath}
            compact={isTablet}
            hidden={isMobile && !mobileNavOpen}
          />
        </div>
        <div className="erp-settings-layout-content" id="settings-content">
          <SettingsFolderTabs activePath={activePath} />
          <div className="erp-settings-folder-panel">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsShell;
