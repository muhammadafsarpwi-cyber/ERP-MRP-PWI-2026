import React from 'react';
import { Link } from 'react-router-dom';
import { usePermission } from '../../hooks/usePermission';
import { visibleSettingsNavItems } from './settingsNavigationConfig';
import './settings.css';

export interface SettingsNavigationProps {
  /** Route path that must render as active. */
  activePath: string;
  /** `true` on tablet widths — short descriptions are hidden to save space. */
  compact?: boolean;
  /** Collapsed state of the mobile menu (renders `hidden` when true). */
  hidden?: boolean;
  id?: string;
}

/**
 * Left-hand settings navigation.
 *
 * - every configured category the caller may open, in the mandated order,
 * - icon + label + optional one-line description,
 * - active state driven by the current route (`aria-current="page"`),
 * - keyboard accessible: entries are real links, focus-visible is styled,
 * - permission filtered with the exact rule `ProtectedRoute` applies, so the
 *   menu never advertises a category the URL would reject.
 */
const SettingsNavigation: React.FC<SettingsNavigationProps> = ({
  activePath,
  compact = false,
  hidden = false,
  id = 'settings-navigation',
}) => {
  const { can } = usePermission();
  const items = visibleSettingsNavItems(can);
  const activeItem = items.find((item) => item.path === activePath) ?? null;

  return (
    <nav
      id={id}
      className={`erp-settings-nav${hidden ? ' erp-settings-nav--collapsed' : ''}`}
      aria-label="Settings sections"
      data-testid="settings-navigation"
      data-active-path={activeItem ? activeItem.id : ''}
    >
      <div className="erp-settings-nav-heading">Settings</div>
      <ul className="erp-settings-nav-list">
        {items.map((item) => {
          const isActive = item.path === activePath;
          return (
            <li key={item.id}>
              <Link
                to={item.path}
                className={`erp-settings-nav-item${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                data-testid={`settings-nav-${item.id}`}
              >
                <span className="erp-settings-nav-icon" aria-hidden="true">
                  <item.icon />
                </span>
                <span className="erp-settings-nav-text">
                  <span className="erp-settings-nav-label">{item.label}</span>
                  {!compact && item.description && (
                    <span className="erp-settings-nav-desc">{item.description}</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {items.length === 0 && (
        <p className="erp-settings-nav-empty">
          No settings categories are available for your role.
        </p>
      )}
    </nav>
  );
};

export default SettingsNavigation;
