import React, { useState, useMemo } from 'react';
import { Dropdown, Input } from 'antd';
import {
  DownOutlined, CheckOutlined, SearchOutlined, AppstoreOutlined,
} from '@ant-design/icons';

export interface CardSelectOption {
  id: string;
  name: string;
  code?: string;
  subtext?: string;
}

interface CardSelectDropdownProps {
  label: string;
  title: string;
  subtitle?: string;
  allLabel?: string;
  allSubtitle?: string;
  icon: React.ReactNode;
  options: CardSelectOption[];
  activeId?: string;
  onSelect: (id?: string) => void;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
  badgeBg?: string;
  badgeColor?: string;
  style?: React.CSSProperties;
}

export const CardSelectDropdown: React.FC<CardSelectDropdownProps> = ({
  label,
  title,
  subtitle,
  allLabel = 'All',
  allSubtitle = 'View all items',
  icon,
  options = [],
  activeId,
  onSelect,
  loading = false,
  disabled = false,
  disabledReason,
  placeholder,
  badgeBg = '#fef9c3',
  badgeColor = '#854d0e',
  style,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const activeOption = useMemo(
    () => options.find((o) => o.id === activeId),
    [options, activeId],
  );

  const displayLabel = activeOption
    ? activeOption.code
      ? `${activeOption.code} ${activeOption.name}`.trim()
      : activeOption.name
    : allLabel;

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.code && o.code.toLowerCase().includes(q)) ||
        (o.subtext && o.subtext.toLowerCase().includes(q)),
    );
  }, [options, search]);

  const menuContent = (
    <div
      style={{
        background: 'var(--theme-card-bg, #ffffff)',
        borderRadius: 12,
        boxShadow: '0 12px 30px -4px rgba(0, 0, 0, 0.25), 0 4px 12px -2px rgba(0, 0, 0, 0.1)',
        border: '1px solid var(--theme-border, #e2e8f0)',
        minWidth: 280,
        maxWidth: 340,
        overflow: 'hidden',
        padding: '6px',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 12px 8px 12px',
          borderBottom: '1px solid var(--theme-border, #f1f5f9)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: badgeBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: badgeColor,
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-heading, #0f172a)', lineHeight: 1.2 }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Search Bar if > 5 options */}
      {options.length > 5 && (
        <div style={{ padding: '8px 6px 4px 6px' }}>
          <Input
            size="small"
            placeholder={`Search ${label}...`}
            prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted, #94a3b8)', fontSize: 12 }} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ borderRadius: 6 }}
          />
        </div>
      )}

      {/* Options List */}
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 0' }}>
        {/* "All" Option */}
        {!search && (
          <div
            onClick={() => {
              onSelect(undefined);
              setOpen(false);
              setSearch('');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
              background: !activeId ? 'var(--theme-surface-alt, #f8fafc)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'var(--theme-hover, #f1f5f9)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = !activeId ? 'var(--theme-surface-alt, #f8fafc)' : 'transparent';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AppstoreOutlined style={{ fontSize: 15, color: 'var(--theme-text-muted, #64748b)' }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: !activeId ? 700 : 500, color: 'var(--theme-heading, #1e293b)' }}>
                  {allLabel}
                </div>
                {allSubtitle && (
                  <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)' }}>
                    {allSubtitle}
                  </div>
                )}
              </div>
            </div>
            {!activeId && (
              <CheckOutlined style={{ color: 'var(--theme-primary, #2563eb)', fontSize: 13, fontWeight: 700 }} />
            )}
          </div>
        )}

        {/* Divider if All option is shown */}
        {!search && options.length > 0 && (
          <div style={{ height: 1, background: 'var(--theme-border, #f1f5f9)', margin: '4px 8px' }} />
        )}

        {/* Individual Options */}
        {filteredOptions.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)' }}>
            No matching {label.toLowerCase()} found
          </div>
        ) : (
          filteredOptions.map((opt) => {
            const isSelected = opt.id === activeId;
            return (
              <div
                key={opt.id}
                onClick={() => {
                  onSelect(opt.id);
                  setOpen(false);
                  setSearch('');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  background: isSelected ? 'var(--theme-accent-soft, #fef9c3)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = isSelected
                    ? 'var(--theme-active, #fef08a)'
                    : 'var(--theme-hover, #f8fafc)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = isSelected
                    ? 'var(--theme-accent-soft, #fef9c3)'
                    : 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  {opt.code ? (
                    <div
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: isSelected ? 'var(--theme-primary, #fde047)' : 'var(--theme-surface-alt, #f1f5f9)',
                        color: isSelected ? '#ffffff' : 'var(--theme-text, #475569)',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        flexShrink: 0,
                      }}
                    >
                      {opt.code}
                    </div>
                  ) : (
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        background: isSelected ? 'var(--theme-primary, #fde047)' : 'var(--theme-surface-alt, #f1f5f9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? '#ffffff' : 'var(--theme-text-muted, #64748b)',
                        fontSize: 12,
                        flexShrink: 0,
                      }}
                    >
                      {icon}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: isSelected ? 700 : 500,
                        color: 'var(--theme-heading, #0f172a)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {opt.name}
                    </div>
                    {opt.subtext && (
                      <div
                        style={{
                          fontSize: 10,
                          color: 'var(--theme-text-muted, #64748b)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {opt.subtext}
                      </div>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <CheckOutlined style={{ color: 'var(--theme-primary, #2563eb)', fontSize: 13, fontWeight: 700, marginLeft: 8 }} />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <Dropdown
      open={disabled ? false : open}
      onOpenChange={(v) => !disabled && setOpen(v)}
      dropdownRender={() => menuContent}
      trigger={['click']}
      placement="bottomLeft"
      disabled={disabled}
    >
      <div
        title={disabled && disabledReason ? disabledReason : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          background: disabled ? 'var(--theme-surface-alt, #f8fafc)' : 'var(--theme-card-bg, #ffffff)',
          border: open ? '1px solid var(--theme-primary, #3b82f6)' : '1px solid var(--theme-border, #e2e8f0)',
          borderRadius: 10,
          padding: '6px 10px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: open
            ? '0 0 0 3px var(--theme-focus, rgba(59, 130, 246, 0.15))'
            : '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
          opacity: disabled ? 0.6 : 1,
          width: '100%',
          userSelect: 'none',
          ...style,
        }}
        onMouseEnter={(e) => {
          if (!disabled && !open) {
            e.currentTarget.style.borderColor = 'var(--theme-border-strong, #cbd5e1)';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.06)';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !open) {
            e.currentTarget.style.borderColor = 'var(--theme-border, #e2e8f0)';
            e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.04)';
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {/* Left Icon Badge */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: badgeBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: badgeColor,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>

          {/* Text Stack */}
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left', lineHeight: 1.15 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--theme-text-muted, #64748b)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--theme-heading, #0f172a)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: 2,
              }}
            >
              {displayLabel}
            </div>
          </div>
        </div>

        {/* Right Arrow */}
        <DownOutlined
          style={{
            fontSize: 10,
            color: 'var(--theme-text-muted, #94a3b8)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
            marginLeft: 4,
          }}
        />
      </div>
    </Dropdown>
  );
};

export default CardSelectDropdown;
