import React, { useEffect, useMemo } from 'react';
import { Select, Tag, Tooltip } from 'antd';
import { ApartmentOutlined, BankOutlined, LockOutlined } from '@ant-design/icons';
import { usePermission } from '../../hooks/usePermission';
import {
  ALL_DIVISIONS_SCOPE,
  useSettingsScopeStore,
} from './settingsScopeStore';
import './settings.css';

/**
 * Organization scope selector shown in the settings header.
 *
 * Company  → the authenticated user's existing default company (no second
 *            organization concept is introduced here).
 * Division → the caller's own allowed divisions, straight out of
 *            `usePermission().allowedDivisions`, which the backend derives
 *            from `user_organization_scopes ∩ role_permission_division_scopes`.
 *
 * The selector can therefore never offer — or remember — a division outside
 * the caller's scope, and it is only a view context: every API call is still
 * re-authorized server-side.
 */
const OrganizationScopeSelector: React.FC = () => {
  const { user, allowedDivisions, allowedDivisionIds, divisionsUnrestricted } = usePermission();
  const divisionId = useSettingsScopeStore((state) => state.divisionId);
  const hydrate = useSettingsScopeStore((state) => state.hydrate);
  const setDivisionScope = useSettingsScopeStore((state) => state.setDivisionScope);

  const allowedKey = allowedDivisionIds.join(',');

  useEffect(() => {
    hydrate(allowedDivisionIds, divisionsUnrestricted);
    // `allowedDivisionIds` is memoised per permission payload; `allowedKey`
    // keeps this effect stable across renders with the same scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrate, allowedKey, divisionsUnrestricted]);

  const options = useMemo(() => {
    const allOption = {
      value: ALL_DIVISIONS_SCOPE,
      label: divisionsUnrestricted ? 'All divisions' : 'All my divisions',
    };
    const divisionOptions = allowedDivisions.map((division) => ({
      value: division.id,
      label: division.divisionCode
        ? `${division.divisionCode} · ${division.name}`
        : division.name,
    }));
    return [allOption, ...divisionOptions];
  }, [allowedDivisions, divisionsUnrestricted]);

  const companyName: string | null = useMemo(() => {
    const explicit = user?.defaultCompany?.name;
    if (typeof explicit === 'string' && explicit.trim().length > 0) return explicit;
    return null;
  }, [user]);

  const handleChange = (raw: unknown) => {
    const next = raw === ALL_DIVISIONS_SCOPE || raw === '' || raw == null ? null : String(raw);
    setDivisionScope(next, allowedDivisionIds, divisionsUnrestricted);
  };

  return (
    <div className="erp-settings-scope" data-testid="settings-scope-selector">
      <span className="erp-settings-scope-label">
        <ApartmentOutlined aria-hidden="true" /> Organization scope
      </span>
      <div className="erp-settings-scope-controls">
        {companyName && (
          <Tooltip title="Company context of the signed-in user">
            <Tag
              className="erp-settings-scope-company"
              icon={<BankOutlined aria-hidden="true" />}
              data-testid="settings-scope-company"
            >
              {companyName}
            </Tag>
          </Tooltip>
        )}
        <Select
          size="small"
          className="erp-settings-scope-division"
          aria-label="Division scope"
          value={divisionId ?? ALL_DIVISIONS_SCOPE}
          options={options}
          onChange={handleChange}
          suffixIcon={<ApartmentOutlined aria-hidden="true" />}
        />
        {!divisionsUnrestricted && (
          <Tooltip title="Your role limits you to the divisions listed above.">
            <span className="erp-settings-scope-lock" data-testid="settings-scope-lock">
              <LockOutlined aria-hidden="true" />
              <span className="erp-settings-scope-lock-text">Scoped</span>
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default OrganizationScopeSelector;
