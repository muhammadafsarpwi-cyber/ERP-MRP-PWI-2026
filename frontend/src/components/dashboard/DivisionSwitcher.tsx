import React from 'react';
import { ShopOutlined } from '@ant-design/icons';
import type { FilterOption } from '../../services/dashboardService';
import CardSelectDropdown from './CardSelectDropdown';

interface DivisionSwitcherProps {
  divisions: FilterOption[];
  activeDivisionId?: string;
  onSelectDivision: (divisionId?: string) => void;
  loading?: boolean;
  style?: React.CSSProperties;
}

export const DivisionSwitcher: React.FC<DivisionSwitcherProps> = ({
  divisions,
  activeDivisionId,
  onSelectDivision,
  loading,
  style,
}) => {
  const options = divisions.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.divisionCode,
    subtext: 'Production Division',
  }));

  return (
    <CardSelectDropdown
      label="Division"
      title="Switch Division"
      subtitle="Every report and KPI follows it"
      allLabel="All Divisions"
      allSubtitle="Enterprise overview across all lines"
      icon={<ShopOutlined />}
      options={options}
      activeId={activeDivisionId}
      onSelect={onSelectDivision}
      loading={loading}
      badgeBg="#fef9c3"
      badgeColor="#854d0e"
      style={style}
    />
  );
};

export default DivisionSwitcher;
