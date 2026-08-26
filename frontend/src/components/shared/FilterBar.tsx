import React from 'react';
import { Select } from 'antd';

export interface FilterOption {
  key: string;
  placeholder: string;
  value: string | undefined;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  width?: number;
}

interface FilterBarProps {
  filters: FilterOption[];
  visible: boolean;
}

const FilterBar: React.FC<FilterBarProps> = ({ filters, visible }) => {
  if (!visible) return null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        padding: '14px 0 16px',
        marginTop: 12,
        borderTop: '1px solid #f0f0f0',
      }}
    >
      {filters.map((f) => (
        <Select
          key={f.key}
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={f.placeholder}
          style={{ width: f.width ?? '100%' }}
          value={f.value}
          options={f.options}
          onChange={f.onChange}
          disabled={f.disabled}
        />
      ))}
    </div>
  );
};

export default FilterBar;
