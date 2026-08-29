import React from 'react';
import { Button, Select } from 'antd';
import { SearchOutlined, CloseOutlined } from '@ant-design/icons';
import type { DashboardFilters as SystemFilters, FilterOption, MachinePerformanceItem } from '../../services/dashboardService';

interface DashboardFiltersProps {
  divisions: FilterOption[];
  sections: FilterOption[];
  departments: FilterOption[];
  shifts: FilterOption[];
  machines: MachinePerformanceItem[];
  filters: SystemFilters;
  optionsLoading: boolean;
  onChange: (key: string, value?: string) => void;
  onClearAll: () => void;
}

const buildChips = (
  filters: SystemFilters,
  divisions: FilterOption[],
  sections: FilterOption[],
  departments: FilterOption[],
  shifts: FilterOption[],
  machines: MachinePerformanceItem[],
): Array<{ key: string; label: string; value: string }> => {
  const chips: Array<{ key: string; label: string; value: string }> = [];
  if (filters.divisionId) {
    const d = divisions.find((x) => x.id === filters.divisionId);
    chips.push({ key: 'divisionId', label: 'Division', value: d ? `${d.divisionCode ?? ''} ${d.name}`.trim() : filters.divisionId });
  }
  if (filters.sectionId) {
    const s = sections.find((x) => x.id === filters.sectionId);
    chips.push({ key: 'sectionId', label: 'Section', value: s?.name ?? filters.sectionId });
  }
  if (filters.departmentId) {
    const dp = departments.find((x) => x.id === filters.departmentId);
    chips.push({ key: 'departmentId', label: 'Dept', value: dp?.name ?? filters.departmentId });
  }
  if (filters.shiftId) {
    const s = shifts.find((x) => x.id === filters.shiftId);
    chips.push({ key: 'shiftId', label: 'Shift', value: s?.name ?? filters.shiftId });
  }
  if (filters.machineId) {
    const m = machines.find((x) => x.machineCode === filters.machineId);
    chips.push({ key: 'machineId', label: 'Machine', value: m ? `${m.machineCode} — ${m.machineName}` : filters.machineId });
  }
  return chips;
};

const DashboardFilters: React.FC<DashboardFiltersProps> = ({
  divisions, sections, departments, shifts, machines, filters,
  optionsLoading, onChange, onClearAll,
}) => {
  const chips = buildChips(filters, divisions, sections, departments, shifts, machines);

  return (
    <section className="erp-filter-bar" aria-label="Dashboard filters">
      <div className="erp-filter-bar__top">
        <div className="erp-filter-bar__label">
          <SearchOutlined aria-hidden="true" /> Filters
        </div>
        <div className="erp-filter-bar__selects">
          <Select
            placeholder="Division"
            allowClear
            size="small"
            loading={optionsLoading}
            className="erp-filter-select"
            value={filters.divisionId}
            onChange={(v) => onChange('divisionId', v)}
            options={divisions.map((d) => ({ value: d.id, label: `${d.divisionCode ?? ''} ${d.name}` }))}
          />
          <Select
            placeholder="Section"
            allowClear
            size="small"
            loading={optionsLoading}
            className="erp-filter-select"
            value={filters.sectionId}
            onChange={(v) => onChange('sectionId', v)}
            options={sections.map((s) => ({ value: s.id, label: s.name }))}
            disabled={!filters.divisionId && sections.length === 0}
          />
          <Select
            placeholder="Department"
            allowClear
            size="small"
            loading={optionsLoading}
            className="erp-filter-select"
            value={filters.departmentId}
            onChange={(v) => onChange('departmentId', v)}
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
            disabled={!filters.divisionId && !filters.sectionId && departments.length === 0}
          />
          <Select
            placeholder="Shift"
            allowClear
            size="small"
            loading={optionsLoading}
            className="erp-filter-select"
            value={filters.shiftId}
            onChange={(v) => onChange('shiftId', v)}
            options={shifts.map((s) => ({
              value: s.id,
              label: `${s.name}${s.startTime ? ` (${s.startTime}-${s.endTime})` : ''}`,
            }))}
          />
          <Select
            placeholder="Machine"
            allowClear
            showSearch
            optionFilterProp="label"
            size="small"
            className="erp-filter-select"
            value={filters.machineId}
            onChange={(v) => onChange('machineId', v)}
            options={machines.map((m) => ({ value: m.machineCode, label: `${m.machineCode} — ${m.machineName}` }))}
          />
        </div>
        <div className="erp-filter-bar__actions">
          {chips.length > 0 && (
            <span className="erp-filter-bar__count">
              {chips.length} active
            </span>
          )}
          {chips.length > 0 && (
            <Button size="small" className="erp-filter-bar__clear" onClick={onClearAll}>
              Clear All
            </Button>
          )}
        </div>
      </div>
      {chips.length > 0 && (
        <div className="erp-filter-chips">
          {chips.map((chip) => (
            <span key={chip.key} className="erp-filter-chip">
              <span className="erp-filter-chip__label">{chip.label}:</span>
              <span className="erp-filter-chip__value">{chip.value}</span>
              <button
                type="button"
                className="erp-filter-chip__remove"
                onClick={() => onChange(chip.key, undefined)}
                aria-label={`Remove ${chip.label} filter`}
              >
                <CloseOutlined aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
};

export default DashboardFilters;