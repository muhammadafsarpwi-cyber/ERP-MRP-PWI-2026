import React, { useState } from 'react';
import { Button, Select, Space, Tooltip, Badge, Tag, Grid } from 'antd';
import { SearchOutlined, CloseOutlined, ReloadOutlined, FilterOutlined, ClearOutlined } from '@ant-design/icons';
import type { DashboardFilters as SystemFilters, FilterOption, MachinePerformanceItem } from '../../services/dashboardService';

const { useBreakpoint } = Grid;

interface DashboardFiltersProps {
  divisions: FilterOption[];
  sections: FilterOption[];
  departments: FilterOption[];
  shifts: FilterOption[];
  machines: MachinePerformanceItem[];
  filters: SystemFilters;
  appliedFilters: SystemFilters;
  optionsLoading: boolean;
  loading?: boolean;
  onChange: (key: string, value?: string) => void;
  onApply: () => void;
  onReset: () => void;
  onRemove: (key: string) => void;
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
  divisions, sections, departments, shifts, machines, filters, appliedFilters,
  optionsLoading, loading, onChange, onApply, onReset, onRemove,
}) => {
  const screens = useBreakpoint();
  const [isOpen, setIsOpen] = useState(false);
  const chips = buildChips(appliedFilters, divisions, sections, departments, shifts, machines);

  const hasDraftChanges =
    filters.divisionId !== appliedFilters.divisionId ||
    filters.sectionId !== appliedFilters.sectionId ||
    filters.departmentId !== appliedFilters.departmentId ||
    filters.shiftId !== appliedFilters.shiftId ||
    filters.machineId !== appliedFilters.machineId;

  const hasAnyFilter = !!(
    filters.divisionId || filters.sectionId || filters.departmentId ||
    filters.shiftId || filters.machineId ||
    appliedFilters.divisionId || appliedFilters.sectionId || appliedFilters.departmentId ||
    appliedFilters.shiftId || appliedFilters.machineId
  );

  const activeCount = chips.length;

  return (
    <section
      className="erp-filter-bar"
      aria-label="Dashboard filters"
      style={{
        background: 'var(--theme-surface, #ffffff)',
        border: '1px solid var(--theme-border, #e2e8f0)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 14,
      }}
    >
      {/* ── Top Bar with single unified Filters button & Active chips ── */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button
            icon={<FilterOutlined />}
            onClick={() => setIsOpen((prev) => !prev)}
            type={isOpen ? 'primary' : 'default'}
            style={{
              fontWeight: 600,
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <span>Filters</span>
            {activeCount > 0 && (
              <Badge
                count={activeCount}
                style={{
                  marginLeft: 6,
                  backgroundColor: isOpen ? '#ffffff' : 'var(--theme-primary, #3b82f6)',
                  color: isOpen ? 'var(--theme-primary, #3b82f6)' : '#ffffff',
                }}
              />
            )}
          </Button>

          {/* Inline chips of applied filters */}
          {chips.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {chips.map((chip) => (
                <Tag
                  key={chip.key}
                  closable
                  onClose={(e) => {
                    e.preventDefault();
                    onRemove(chip.key);
                  }}
                  style={{
                    borderRadius: 12,
                    padding: '2px 8px',
                    fontSize: 12,
                    background: 'var(--theme-accent-soft, #eff6ff)',
                    borderColor: 'var(--theme-accent, #bfdbfe)',
                    color: 'var(--theme-accent-dark, #1d4ed8)',
                  }}
                >
                  <strong>{chip.label}:</strong> {chip.value}
                </Tag>
              ))}
              <Button
                type="link"
                size="small"
                onClick={onReset}
                style={{ fontSize: 12, padding: '0 4px', color: 'var(--theme-danger, #ef4444)' }}
              >
                Clear all
              </Button>
            </div>
          )}
        </div>

        {hasDraftChanges && !isOpen && (
          <Button
            type="primary"
            size="small"
            icon={<SearchOutlined />}
            loading={loading}
            onClick={onApply}
          >
            Apply Pending Filters
          </Button>
        )}
      </div>

      {/* ── Collapsible Filters Panel ── */}
      {isOpen && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '12px 14px',
            background: 'var(--theme-surface-subtle, rgba(0, 0, 0, 0.02))',
            border: '1px solid var(--theme-border, #e2e8f0)',
            borderRadius: 8,
            marginTop: 12,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 6,
              borderBottom: '1px dashed var(--theme-border, #e2e8f0)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FilterOutlined style={{ color: 'var(--theme-primary, #3b82f6)', fontSize: 14 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #1e293b)' }}>
                Dashboard Filters
              </span>
              {activeCount > 0 && (
                <Tag color="blue" style={{ margin: 0, borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                  {activeCount} Active
                </Tag>
              )}
            </div>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => setIsOpen(false)}
              style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 12 }}
              title="Close Filters"
            >
              Close
            </Button>
          </div>

          {/* Grid of ALL 5 Filters */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: screens.lg
                ? 'repeat(5, 1fr)'
                : screens.md
                ? 'repeat(3, 1fr)'
                : '1fr',
              gap: 10,
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                Division
              </label>
              <Select
                placeholder="All Divisions"
                allowClear
                loading={optionsLoading}
                style={{ width: '100%' }}
                value={filters.divisionId}
                onChange={(v) => onChange('divisionId', v)}
                options={divisions.map((d) => ({ value: d.id, label: `${d.divisionCode ?? ''} ${d.name}` }))}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                Section
              </label>
              <Select
                placeholder="All Sections"
                allowClear
                loading={optionsLoading}
                style={{ width: '100%' }}
                value={filters.sectionId}
                onChange={(v) => onChange('sectionId', v)}
                options={sections.map((s) => ({ value: s.id, label: s.name }))}
                disabled={!filters.divisionId && sections.length === 0}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                Department
              </label>
              <Select
                placeholder="All Departments"
                allowClear
                loading={optionsLoading}
                style={{ width: '100%' }}
                value={filters.departmentId}
                onChange={(v) => onChange('departmentId', v)}
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                disabled={!filters.divisionId && !filters.sectionId && departments.length === 0}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                Shift
              </label>
              <Select
                placeholder="All Shifts"
                allowClear
                loading={optionsLoading}
                style={{ width: '100%' }}
                value={filters.shiftId}
                onChange={(v) => onChange('shiftId', v)}
                options={shifts.map((s) => ({
                  value: s.id,
                  label: `${s.name}${s.startTime ? ` (${s.startTime}-${s.endTime})` : ''}`,
                }))}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                Machine
              </label>
              <Select
                placeholder="All Machines"
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: '100%' }}
                value={filters.machineId}
                onChange={(v) => onChange('machineId', v)}
                options={machines.map((m) => ({ value: m.machineCode, label: `${m.machineCode} — ${m.machineName}` }))}
              />
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              paddingTop: 8,
              borderTop: '1px solid var(--theme-border, #e2e8f0)',
            }}
          >
            <Button
              icon={<ClearOutlined />}
              onClick={onReset}
              disabled={!hasAnyFilter}
              danger={hasAnyFilter}
            >
              Clear Filters
            </Button>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => setIsOpen(false)}>
                Close
              </Button>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                loading={loading}
                onClick={() => {
                  onApply();
                  setIsOpen(false);
                }}
                style={{ fontWeight: 600 }}
              >
                {hasDraftChanges ? 'Apply Filters *' : 'Apply Filters'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default DashboardFilters;