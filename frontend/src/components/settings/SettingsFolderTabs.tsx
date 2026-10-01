import React, { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { usePermission } from '../../hooks/usePermission';
import { visibleSettingsNavItems, findSettingsNavItem } from './settingsNavigationConfig';
import './settingsFolderTabs.css';

export interface SettingsFolderTabsProps {
  activePath?: string;
  className?: string;
}

/**
 * Connected Folder Tabs Sub-Navigation (`Firmainnstillinger` style).
 *
 * Implements physical document folder tabs that sit directly on top of the
 * settings content container. The active tab seamlessly merges with the panel
 * below (unbroken bottom border, matching surface, glowing accent outline),
 * dynamically reacting to any active theme palette.
 */
export const SettingsFolderTabs: React.FC<SettingsFolderTabsProps> = ({
  activePath: propActivePath,
  className = '',
}) => {
  const location = useLocation();
  const { can } = usePermission();
  const tabsListRef = useRef<HTMLDivElement>(null);

  const activePath = propActivePath ?? location.pathname;
  const items = visibleSettingsNavItems(can);

  const scrollTabs = (offset: number) => {
    if (tabsListRef.current) {
      if (typeof tabsListRef.current.scrollBy === 'function') {
        tabsListRef.current.scrollBy({ left: offset, behavior: 'smooth' });
      } else {
        tabsListRef.current.scrollLeft += offset;
      }
    }
  };

  return (
    <div
      className={`erp-settings-folder-tabs-wrapper ${className}`}
      data-testid="settings-folder-tabs"
      role="navigation"
      aria-label="Settings folder sections"
    >
      <button
        type="button"
        className="erp-folder-scroll-btn erp-folder-scroll-left"
        onClick={() => scrollTabs(-240)}
        aria-label="Scroll settings tabs left"
      >
        <LeftOutlined />
      </button>

      <div
        className="erp-folder-tabs-scroll-container"
        ref={tabsListRef}
        role="tablist"
      >
        {items.map((item) => {
          const isActive =
            item.path === activePath ||
            (item.path !== '/settings' && activePath.startsWith(item.path)) ||
            (item.id === 'profile-branding' && (activePath === '/settings/company' || activePath.startsWith('/settings/company')));
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              to={item.path}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`erp-folder-tab ${isActive ? 'is-active' : ''}`}
              data-testid={`folder-tab-${item.id}`}
              title={item.description}
            >
              <span className="erp-folder-tab-content">
                <span className="erp-folder-tab-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="erp-folder-tab-label">{item.label}</span>
              </span>
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        className="erp-folder-scroll-btn erp-folder-scroll-right"
        onClick={() => scrollTabs(240)}
        aria-label="Scroll settings tabs right"
      >
        <RightOutlined />
      </button>
    </div>
  );
};

export default SettingsFolderTabs;
