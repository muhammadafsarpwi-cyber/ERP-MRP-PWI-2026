import React, { useMemo, useState } from 'react';
import {
  App,
  Button,
  Divider,
  Input,
  Radio,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  BgColorsOutlined,
  CheckCircleFilled,
  CheckOutlined,
  CloseOutlined,
  FireOutlined,
  GoldOutlined,
  MoonOutlined,
  ReloadOutlined,
  RocketOutlined,
  SearchOutlined,
  SunOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  PALETTES,
  PaletteCategory,
  PaletteDef,
  resolveRoles,
} from './palettes';
import { useThemeStore } from './themeStore';

const { Text, Title } = Typography;

interface ThemePreferencesProps {
  onRequestClose?: () => void;
  onApplied?: () => void;
  embedded?: boolean;
}

export const ThemePreferences: React.FC<ThemePreferencesProps> = ({
  onRequestClose,
  onApplied,
  embedded = false,
}) => {
  const { message } = App.useApp();
  const draft = useThemeStore((state) => state.draft);
  const setMode = useThemeStore((state) => state.setMode);
  const setPalette = useThemeStore((state) => state.setPalette);
  const applyDraft = useThemeStore((state) => state.applyDraft);
  const revertDraft = useThemeStore((state) => state.revertDraft);
  const resetToDefaults = useThemeStore((state) => state.resetToDefaults);

  const [selectedCategory, setSelectedCategory] = useState<PaletteCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Find active palette
  const activePalette = useMemo(
    () => PALETTES.find((p) => p.id === draft.paletteId) ?? PALETTES[0],
    [draft.paletteId]
  );
  const activeRoles = useMemo(
    () => resolveRoles(activePalette, draft.mode),
    [activePalette, draft.mode]
  );

  // Filter palettes based on category and search query
  const filteredPalettes = useMemo(() => {
    return PALETTES.filter((p) => {
      const matchesCategory =
        selectedCategory === 'all' || p.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.tag.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  // Counts by category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: PALETTES.length };
    PALETTES.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, []);

  const handleApply = () => {
    applyDraft();
    message.success('Theme settings applied and saved');
    if (onApplied) onApplied();
  };

  const handleReset = () => {
    resetToDefaults();
    message.info('Theme restored to defaults');
  };

  const handleCancel = () => {
    revertDraft();
    if (onRequestClose) onRequestClose();
  };

  return (
    <div
      className={`erp-theme-studio${embedded ? ' erp-theme-studio--embedded' : ''}`}
      role="dialog"
      aria-label="Theme Studio"
    >
      {/* ── 1. Top Header Bar ────────────────────────────────────────── */}
      <div className="erp-theme-studio__header">
        <div className="erp-theme-studio__title-area">
          <div className="erp-theme-studio__badge-icon">
            <BgColorsOutlined style={{ fontSize: 20, color: 'var(--theme-accent, #2563eb)' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Title level={4} style={{ margin: 0, fontWeight: 700, letterSpacing: '-0.01em' }}>
                Theme Studio
              </Title>
              <Tag color="blue" style={{ borderRadius: 10, margin: 0, fontWeight: 600 }}>
                {PALETTES.length} Presets
              </Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 12.5, display: 'block', marginTop: 2 }}>
              Select from curated multi-color themes. Instant live ERP preview applied on click.
            </Text>
          </div>
        </div>

        <div className="erp-theme-studio__controls">
          {/* Light / Dark Mode Toggle */}
          <Segmented
            value={draft.mode}
            onChange={(val) => setMode(val as 'light' | 'dark')}
            options={[
              {
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 4px' }}>
                    <SunOutlined style={{ color: '#ea580c' }} />
                    <span>Light</span>
                  </span>
                ),
                value: 'light',
              },
              {
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 4px' }}>
                    <MoonOutlined style={{ color: '#818cf8' }} />
                    <span>Dark</span>
                  </span>
                ),
                value: 'dark',
              },
            ]}
          />

          {onRequestClose && (
            <Tooltip title="Close">
              <Button
                type="text"
                shape="circle"
                icon={<CloseOutlined />}
                onClick={handleCancel}
                aria-label="Close"
              />
            </Tooltip>
          )}
        </div>
      </div>

      <Divider style={{ margin: 0 }} />

      {/* ── 2. Filter & Search Bar ───────────────────────────────────── */}
      <div className="erp-theme-studio__filters">
        <div className="erp-theme-studio__categories">
          <Radio.Group
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="all">
              All <span style={{ opacity: 0.7, fontSize: 11 }}>({categoryCounts.all})</span>
            </Radio.Button>
            <Radio.Button value="corporate">
              <ThunderboltOutlined style={{ marginRight: 4 }} />
              Corporate <span style={{ opacity: 0.7, fontSize: 11 }}>({categoryCounts.corporate || 0})</span>
            </Radio.Button>
            <Radio.Button value="tech">
              <RocketOutlined style={{ marginRight: 4 }} />
              Tech & Cyber <span style={{ opacity: 0.7, fontSize: 11 }}>({categoryCounts.tech || 0})</span>
            </Radio.Button>
            <Radio.Button value="vibrant">
              <FireOutlined style={{ marginRight: 4 }} />
              Bold & Vibrant <span style={{ opacity: 0.7, fontSize: 11 }}>({categoryCounts.vibrant || 0})</span>
            </Radio.Button>
            <Radio.Button value="warm">
              <GoldOutlined style={{ marginRight: 4 }} />
              Warm & Earthy <span style={{ opacity: 0.7, fontSize: 11 }}>({categoryCounts.warm || 0})</span>
            </Radio.Button>
            <Radio.Button value="minimal">
              <AppstoreOutlined style={{ marginRight: 4 }} />
              Minimal <span style={{ opacity: 0.7, fontSize: 11 }}>({categoryCounts.minimal || 0})</span>
            </Radio.Button>
          </Radio.Group>
        </div>

        <div className="erp-theme-studio__search">
          <Input
            prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted)' }} />}
            placeholder="Search themes by name or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            allowClear
            size="small"
            style={{ width: 230, borderRadius: 6 }}
          />
        </div>
      </div>

      {/* ── 3. Theme Cards Grid ──────────────────────────────────────── */}
      <div className="erp-theme-studio__grid-container">
        <div className="erp-theme-studio__grid">
          {filteredPalettes.map((palette: PaletteDef) => {
            const isSelected = draft.paletteId === palette.id;
            const roles = resolveRoles(palette, draft.mode);

            return (
              <div
                key={palette.id}
                role="button"
                tabIndex={0}
                className={`erp-theme-card ${isSelected ? 'erp-theme-card--selected' : ''}`}
                onClick={() => setPalette(palette.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPalette(palette.id);
                  }
                }}
              >
                {/* 4-Stripe Segmented Color Swatch (matching reference) */}
                <div className="erp-theme-card__swatch">
                  <span
                    className="erp-theme-card__swatch-seg"
                    style={{ background: roles.primary }}
                    title="Primary (Navigation)"
                  />
                  <span
                    className="erp-theme-card__swatch-seg"
                    style={{ background: roles.surface }}
                    title="Surface (Cards/Headers)"
                  />
                  <span
                    className="erp-theme-card__swatch-seg"
                    style={{ background: roles.accent }}
                    title="Accent (Action/Focus)"
                  />
                  <span
                    className="erp-theme-card__swatch-seg"
                    style={{ background: roles.background }}
                    title="Background (Canvas)"
                  />
                  {isSelected && (
                    <div className="erp-theme-card__check-overlay">
                      <CheckCircleFilled style={{ fontSize: 18, color: '#ffffff' }} />
                    </div>
                  )}
                </div>

                {/* Card Labels */}
                <div className="erp-theme-card__content">
                  <div className="erp-theme-card__title-row">
                    <span className="erp-theme-card__name" title={palette.name}>
                      {palette.name}
                    </span>
                    <span className="erp-theme-card__tag">{palette.tag}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredPalettes.length === 0 && (
          <div className="erp-theme-studio__empty">
            <Text type="secondary">No themes found matching "{searchQuery}".</Text>
          </div>
        )}
      </div>

      <Divider style={{ margin: 0 }} />

      {/* ── 4. Live Theme Preview Dashboard Banner (Matching Screenshot) ── */}
      <div className="erp-theme-studio__preview-section">
        <div className="erp-theme-preview-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: activeRoles.accent,
                display: 'inline-block',
              }}
            />
            <Text strong style={{ fontSize: 13 }}>
              {activePalette.name}
            </Text>
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
              {activePalette.tag} · {activePalette.category.toUpperCase()}
            </span>
          </div>
          <Tag color={draft.mode === 'dark' ? 'purple' : 'blue'}>
            {draft.mode === 'dark' ? 'Dark Mode' : 'Light Mode'}
          </Tag>
        </div>

        {/* Live Interactive Preview Box */}
        <div
          className="erp-theme-preview-banner"
          style={{
            background: activeRoles.background,
            border: `1px solid ${draft.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
          }}
        >
          {/* Mini Sider simulation */}
          <div
            className="erp-theme-preview-sider"
            style={{
              background: activeRoles.primary,
              color: '#ffffff',
            }}
          >
            <div className="erp-theme-preview-sider-icon" style={{ background: 'rgba(255,255,255,0.2)' }}>
              ★
            </div>
            <div className="erp-theme-preview-sider-icon">●</div>
            <div className="erp-theme-preview-sider-icon">■</div>
            <div className="erp-theme-preview-sider-icon">⚙</div>
          </div>

          {/* Mini Main Content Area with KPI metric cards & action elements */}
          <div className="erp-theme-preview-body">
            {/* KPI Cards Row (matching orders, revenue, growth in screenshot) */}
            <div className="erp-theme-preview-kpi-row">
              <div
                className="erp-theme-preview-kpi"
                style={{
                  background: activeRoles.surface,
                  borderLeft: `4px solid ${activeRoles.accent}`,
                }}
              >
                <span className="erp-theme-preview-kpi__val">128</span>
                <span className="erp-theme-preview-kpi__label">ORDERS</span>
              </div>

              <div
                className="erp-theme-preview-kpi"
                style={{
                  background: activeRoles.surface,
                  borderLeft: `4px solid ${activeRoles.primary}`,
                }}
              >
                <span className="erp-theme-preview-kpi__val">$9.4k</span>
                <span className="erp-theme-preview-kpi__label">REVENUE</span>
              </div>

              <div
                className="erp-theme-preview-kpi"
                style={{
                  background: activeRoles.surface,
                  borderLeft: `4px solid #10b981`,
                }}
              >
                <span className="erp-theme-preview-kpi__val" style={{ color: '#10b981' }}>
                  +18%
                </span>
                <span className="erp-theme-preview-kpi__label">GROWTH</span>
              </div>
            </div>

            {/* Actions and Status Row */}
            <div className="erp-theme-preview-actions-row">
              <button
                type="button"
                className="erp-theme-preview-btn"
                style={{
                  background: activeRoles.accent,
                  color: draft.mode === 'dark' ? '#0f1526' : '#ffffff',
                }}
              >
                Primary Action
              </button>

              <span
                className="erp-theme-preview-chip"
                style={{
                  background: `${activeRoles.accent}25`,
                  color: activeRoles.accent,
                  border: `1px solid ${activeRoles.accent}50`,
                }}
              >
                Active
              </span>
            </div>

            {/* Color Role Legend (matching reference footer) */}
            <div className="erp-theme-preview-legend">
              <span className="erp-theme-preview-legend-item">
                <span className="erp-legend-swatch" style={{ background: activeRoles.primary }} />
                <span>Primary (Nav)</span>
              </span>
              <span className="erp-theme-preview-legend-item">
                <span className="erp-legend-swatch" style={{ background: activeRoles.surface }} />
                <span>Surface (Cards)</span>
              </span>
              <span className="erp-theme-preview-legend-item">
                <span className="erp-legend-swatch" style={{ background: activeRoles.accent }} />
                <span>Accent (Buttons)</span>
              </span>
              <span className="erp-theme-preview-legend-item">
                <span className="erp-legend-swatch" style={{ background: activeRoles.background }} />
                <span>Background</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <Divider style={{ margin: 0 }} />

      {/* ── 5. Action Footer ─────────────────────────────────────────── */}
      <div className="erp-theme-studio__footer">
        <Button icon={<ReloadOutlined />} onClick={handleReset}>
          Reset to Default
        </Button>
        <Space size={10}>
          {onRequestClose && (
            <Button onClick={handleCancel}>
              Cancel
            </Button>
          )}
          <Button type="primary" icon={<CheckOutlined />} onClick={handleApply}>
            Apply & Save Theme
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default ThemePreferences;
