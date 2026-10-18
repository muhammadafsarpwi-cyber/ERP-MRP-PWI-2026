import React, { useState } from 'react';
import { Button, Tooltip, Tag, Grid, DatePicker, Badge } from 'antd';
import {
  CalendarOutlined, SearchOutlined, FilterOutlined, ClearOutlined, ThunderboltOutlined,
  ShopOutlined, ApartmentOutlined, BuildOutlined, ClockCircleOutlined, ToolOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { DashboardFilters as SystemFilters, FilterOption, MachinePerformanceItem } from '../../services/dashboardService';
import { DATE_RANGE_PRESET_OPTIONS, DateRangePreset } from './dashboardShared';
import CardSelectDropdown from './CardSelectDropdown';

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
  /** Active date-range preset (defaults to "Yesterday" on the main dashboard). */
  dateRangePreset: DateRangePreset;
  /** Most recent recorded entry date (e.g. "2026-10-17") if known */
  lastEntryDate?: string | null;
  /** Active custom date range [dateFrom, dateTo] */
  customRange?: [string, string];
  onChange: (key: string, value?: string) => void;
  /** Fires immediately — the dashboard re-queries for the new range. */
  onDateRangeChange: (preset: DateRangePreset, customRange?: [string, string]) => void;
  onCustomRangeChange?: (range: [string, string]) => void;
  onApplyDivision?: (divisionId?: string) => void;
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
  divisions,
  sections,
  departments,
  shifts,
  machines,
  filters,
  appliedFilters,
  optionsLoading,
  loading,
  dateRangePreset,
  lastEntryDate,
  customRange,
  onChange,
  onDateRangeChange,
  onCustomRangeChange,
  onApplyDivision,
  onApply,
  onReset,
  onRemove,
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
        borderRadius: 'var(--ui-radius-lg)',
        padding: '12px 16px',
        marginBottom: 14,
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* ── Top Header Row: Filter Toggle & Chips on Left | Quick L.E & Date Range on Right ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          paddingBottom: isOpen ? 10 : 0,
          borderBottom: isOpen ? '1px solid var(--theme-border, #e2e8f0)' : 'none',
          marginBottom: isOpen ? 12 : 0,
        }}
      >
        {/* Left: Filter Toggle Button, Active Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button
            type={isOpen ? 'primary' : 'default'}
            icon={<FilterOutlined />}
            onClick={() => setIsOpen((prev) => !prev)}
            style={{
              fontWeight: 600,
              borderRadius: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{isOpen ? 'Close Filters' : 'Filters'}</span>
            {activeCount > 0 && (
              <Badge
                count={activeCount}
                style={{
                  backgroundColor: isOpen ? '#ffffff' : 'var(--theme-primary, #3b82f6)',
                  color: isOpen ? 'var(--theme-primary, #3b82f6)' : '#ffffff',
                  fontWeight: 700,
                }}
              />
            )}
          </Button>

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

        {/* Right: Quick L.E button, Date Range Card Dropdown, Custom Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Quick L.E (Last Entry) Button */}
          <Tooltip title={lastEntryDate ? `Jump to Last Production Entry Date: ${lastEntryDate}` : 'Jump to Last Entry Date (L.E)'}>
            <Button
              size="middle"
              type={dateRangePreset === 'lastEntry' ? 'primary' : 'default'}
              icon={<ThunderboltOutlined />}
              onClick={() => onDateRangeChange('lastEntry')}
              loading={loading && dateRangePreset === 'lastEntry'}
              style={{
                fontWeight: 700,
                fontSize: 12,
                borderRadius: 8,
                borderColor: dateRangePreset === 'lastEntry' ? undefined : 'var(--theme-border, #cbd5e1)',
                color: dateRangePreset === 'lastEntry' ? '#ffffff' : 'var(--theme-primary, #0284c7)',
                background: dateRangePreset === 'lastEntry' ? undefined : 'var(--theme-accent-soft, #f0f9ff)',
              }}
            >
              L.E {lastEntryDate ? `(${lastEntryDate})` : ''}
            </Button>
          </Tooltip>

          {/* Date range selector with CardSelectDropdown */}
          <div style={{ minWidth: 175 }}>
            <CardSelectDropdown
              label="Date Range"
              title="Select Date Range"
              subtitle="Filter dashboard timeframe"
              allLabel="Select Preset"
              icon={<CalendarOutlined />}
              options={DATE_RANGE_PRESET_OPTIONS.map((o) => ({
                id: o.value,
                name: o.value === 'lastEntry' && lastEntryDate ? `Last Entry (${lastEntryDate})` : o.label,
                code: o.value === 'lastEntry' ? 'L.E' : undefined,
                subtext: o.value === 'yesterday' ? 'Default view' : undefined,
              }))}
              activeId={dateRangePreset}
              onSelect={(v) => {
                if (v) onDateRangeChange(v as DateRangePreset);
              }}
              loading={loading}
              badgeBg="#f0f9ff"
              badgeColor="#0284c7"
            />
          </div>

          {/* Custom Date Range Picker when "Custom Range..." is active */}
          {dateRangePreset === 'custom' && (
            <DatePicker.RangePicker
              aria-label="Select custom date range"
              style={{ width: 230 }}
              value={customRange && customRange[0] && customRange[1] ? [dayjs(customRange[0]), dayjs(customRange[1])] : undefined}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  const range: [string, string] = [
                    dates[0].format('YYYY-MM-DD'),
                    dates[1].format('YYYY-MM-DD'),
                  ];
                  onCustomRangeChange?.(range);
                  onDateRangeChange('custom', range);
                }
              }}
              allowClear={false}
            />
          )}
          {/* When closed but draft changes exist, quick apply */}
          {!isOpen && hasDraftChanges && (
            <Button
              type="primary"
              size="middle"
              icon={<SearchOutlined />}
              loading={loading}
              onClick={onApply}
              style={{ fontWeight: 600, borderRadius: 8 }}
            >
              Apply Pending Filters
            </Button>
          )}
        </div>
      </div>

      {/* ── Main 5 Filters Row & Actions (Visible when Filters button is clicked) ── */}
      {isOpen && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: screens.lg
                ? 'repeat(5, 1fr)'
                : screens.md
                ? 'repeat(3, 1fr)'
                : '1fr',
              gap: 10,
              alignItems: 'stretch',
            }}
          >
            {/* 1. Division */}
            <CardSelectDropdown
              label="Division"
              title="Switch Division"
              subtitle="Every report and KPI follows it"
              allLabel="All Divisions"
              allSubtitle="Enterprise overview across all lines"
              icon={<ShopOutlined />}
              options={divisions.map((d) => ({
                id: d.id,
                name: d.name,
                code: d.divisionCode,
                subtext: 'Production Division',
              }))}
              activeId={filters.divisionId}
              onSelect={(v) => {
                onChange('divisionId', v);
                onApplyDivision?.(v);
              }}
              loading={optionsLoading}
              badgeBg="#fef9c3"
              badgeColor="#854d0e"
            />

            {/* 2. Section */}
            <CardSelectDropdown
              label="Section"
              title="Switch Section"
              subtitle="Filter by workshop section"
              allLabel="All Sections"
              allSubtitle="View all workshop sections"
              icon={<ApartmentOutlined />}
              options={sections.map((s) => ({
                id: s.id,
                name: s.name,
                subtext: 'Workshop Section',
              }))}
              activeId={filters.sectionId}
              onSelect={(v) => onChange('sectionId', v)}
              loading={optionsLoading}
              disabled={!filters.divisionId && sections.length === 0}
              disabledReason="Please select a Division first"
              badgeBg="#e0f2fe"
              badgeColor="#0369a1"
            />

            {/* 3. Department */}
            <CardSelectDropdown
              label="Department"
              title="Switch Department"
              subtitle="Filter by shop floor department"
              allLabel="All Departments"
              allSubtitle="View all floor departments"
              icon={<BuildOutlined />}
              options={departments.map((d) => ({
                id: d.id,
                name: d.name,
                subtext: 'Floor Department',
              }))}
              activeId={filters.departmentId}
              onSelect={(v) => onChange('departmentId', v)}
              loading={optionsLoading}
              disabled={!filters.divisionId && !filters.sectionId && departments.length === 0}
              disabledReason="Please select Division or Section first"
              badgeBg="#f3e8ff"
              badgeColor="#7e22ce"
            />

            {/* 4. Shift */}
            <CardSelectDropdown
              label="Shift"
              title="Select Shift"
              subtitle="Filter by operating shift"
              allLabel="All Shifts"
              allSubtitle="All scheduled work shifts"
              icon={<ClockCircleOutlined />}
              options={shifts.map((s) => ({
                id: s.id,
                name: s.name,
                code: s.name.slice(0, 3).toUpperCase(),
                subtext: s.startTime && s.endTime ? `${s.startTime} - ${s.endTime}` : 'Working Shift',
              }))}
              activeId={filters.shiftId}
              onSelect={(v) => onChange('shiftId', v)}
              loading={optionsLoading}
              badgeBg="#ecfdf5"
              badgeColor="#047857"
            />

            {/* 5. Machine */}
            <CardSelectDropdown
              label="Machine"
              title="Select Machine"
              subtitle="Filter by production equipment"
              allLabel="All Machines"
              allSubtitle="All floor machines & equipment"
              icon={<ToolOutlined />}
              options={machines.map((m) => ({
                id: m.machineCode,
                name: m.machineName,
                code: m.machineCode,
                subtext: `Avg Ach ${Math.round(m.avgAchievement || 0)}% · ${m.status || 'Active'}`,
              }))}
              activeId={filters.machineId}
              onSelect={(v) => onChange('machineId', v)}
              loading={optionsLoading}
              badgeBg="#ffedd5"
              badgeColor="#c2410c"
            />
          </div>

          {/* ── Action Footer: Clear Filters on Left | Apply Filters on Right (No Close Buttons) ── */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              paddingTop: 10,
              marginTop: 10,
              borderTop: '1px solid var(--theme-border, #e2e8f0)',
            }}
          >
            <Button
              icon={<ClearOutlined />}
              onClick={onReset}
              disabled={!hasAnyFilter}
              danger={hasAnyFilter}
              style={{ borderRadius: 8 }}
            >
              Clear Filters
            </Button>

            <Button
              type="primary"
              icon={<SearchOutlined />}
              loading={loading}
              onClick={() => {
                onApply();
                setIsOpen(false);
              }}
              style={{
                fontWeight: 600,
                borderRadius: 8,
                minWidth: 120,
              }}
            >
              {hasDraftChanges ? 'Apply Filters *' : 'Apply Filters'}
            </Button>
          </div>
        </>
      )}
    </section>
  );
};

export default DashboardFilters;