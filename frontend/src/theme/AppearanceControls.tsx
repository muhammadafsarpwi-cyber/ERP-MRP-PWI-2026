import React, { useMemo, useState } from 'react';
import { App, Button, ColorPicker, Modal, Segmented, Slider, Switch, Tag, Tooltip, Typography } from 'antd';
import {
  BgColorsOutlined,
  BorderOutlined,
  CheckCircleFilled,
  EyeOutlined,
  FormatPainterOutlined,
  MoonOutlined,
  RightOutlined,
  SunOutlined,
} from '@ant-design/icons';
import {
  CORNER_RADIUS_SCALE,
  CORNER_STYLE_MATRIX,
  FEATURED_PRESET_IDS,
  GLASS_BLUR,
  GLASS_OPACITY,
  PALETTES,
  findPalette,
  resolveRoles,
  PaletteDef,
  ThemeMode,
} from './palettes';
import { contrastGrade, contrastRatio, deriveRolesFromAccent } from './colorUtils';
import { selectIsDirty, useThemeStore } from './themeStore';
import { ThemePreferences } from './ThemePreferences';
import './appearance.css';

const { Text, Title } = Typography;

/**
 * How much contrast each colour has to clear before the badge reads "pass".
 * 4.5:1 is the WCAG AA threshold for normal body text.
 */
const AA_RATIO = 4.5;

export interface AppearanceControlsProps {
  /** Renders the "More theme options →" link into the full Theme Studio. */
  showStudioLink?: boolean;
}

/**
 * The full granular appearance control surface.
 *
 * Mounted in two places so users get an identical experience:
 *   - `AdvancedThemeModal` — the centred pop-up behind the header gear.
 *   - `AppearanceSettings` — System Settings › Appearance.
 *
 * Every control writes straight into the zustand `draft`, which ThemeProvider
 * renders live (CSS vars + antd tokens), so dragging the blur slider or
 * switching a corner step repaints the entire ERP — header, sider, dashboard
 * cards, filter sheets, analytical widgets — on the same tick. Nothing is
 * persisted until the host calls `applyDraft()` ("Apply & Save").
 */
export const AppearanceControls: React.FC<AppearanceControlsProps> = ({
  showStudioLink = true,
}) => {
  const draft = useThemeStore((state) => state.draft);
  const setMode = useThemeStore((state) => state.setMode);
  const setPalette = useThemeStore((state) => state.setPalette);
  const setCornerStyle = useThemeStore((state) => state.setCornerStyle);
  const setGlass = useThemeStore((state) => state.setGlass);
  const setGlassBlur = useThemeStore((state) => state.setGlassBlur);
  const setGlassOpacity = useThemeStore((state) => state.setGlassOpacity);
  const setCustomAccent = useThemeStore((state) => state.setCustomAccent);

  const [studioOpen, setStudioOpen] = useState(false);

  // Featured presets, filtered to those that actually exist in PALETTES so a
  // stale id in FEATURED_PRESET_IDS degrades to fewer chips, not a crash.
  const featuredPalettes = useMemo(
    () =>
      FEATURED_PRESET_IDS.map((id) => PALETTES.find((p) => p.id === id)).filter(
        (p): p is PaletteDef => Boolean(p)
      ),
    []
  );

  // The roles the UI is actually painting right now — palette-derived, or
  // derived from the custom hex if one is set.
  const activeRoles = useMemo(() => {
    if (!draft.customAccent) return resolveRoles(findPalette(draft.paletteId), draft.mode);
    return deriveRolesFromAccent(draft.customAccent, draft.mode);
  }, [draft.paletteId, draft.mode, draft.customAccent]);

  const glassOn = draft.glass;
  const isCustom = Boolean(draft.customAccent);

  return (
    <div className="erp-appearance">
      {/* ── 1. MODE ──────────────────────────────────────────────────── */}
      <Section
        title="Mode"
        hint="Light and dark are independent of the palette: switch any time without losing your colour scheme."
        icon={<SunOutlined className="erp-appearance-section-icon" />}
      >
        <Segmented
          block
          value={draft.mode}
          onChange={(value) => setMode(value as ThemeMode)}
          options={[
            {
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <SunOutlined style={{ color: '#ea580c' }} /> Light
                </span>
              ),
              value: 'light',
            },
            {
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <MoonOutlined style={{ color: '#818cf8' }} /> Dark
                </span>
              ),
              value: 'dark',
            },
          ]}
        />
      </Section>

      <div className="erp-appearance-columns">
        {/* ── 2. CORNER STYLE MATRIX ─────────────────────────────────── */}
        <Section
          title="Corner Style"
          hint="Four radius steps. Rewrites the --ui-radius-* ladder and antd's borderRadius token for every card, input, button and menu item."
          icon={<BorderOutlined className="erp-appearance-section-icon" />}
        >
          <div className="erp-corner-matrix" role="radiogroup" aria-label="Corner style">
            {CORNER_STYLE_MATRIX.map((option) => {
              const scale = CORNER_RADIUS_SCALE[option.id];
              const isActive = draft.cornerStyle === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  className={`erp-corner-option${isActive ? ' is-active' : ''}`}
                  onClick={() => setCornerStyle(option.id)}
                >
                  <span className="erp-corner-tile" style={{ borderRadius: scale.lg }}>
                    <span
                      className="erp-corner-tile-pill"
                      style={{ borderRadius: scale.antd }}
                    />
                  </span>
                  <span className="erp-corner-meta">
                    <span className="erp-corner-name">{option.label}</span>
                    <span className="erp-corner-range">{option.range}</span>
                  </span>
                  {isActive && <CheckCircleFilled className="erp-corner-check" />}
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── 3. ADVANCED GLASSMORPHISM ──────────────────────────────── */}
        <Section
          title="Glassmorphism"
          hint="Frosted surfaces for the header, sider, cards and filter bars. Tables, data grids and modals always stay opaque."
          icon={<EyeOutlined className="erp-appearance-section-icon" />}
        >
          <div className="erp-appearance-panel">
            <div className="erp-appearance-row">
              <Text strong style={{ fontSize: 12.5 }}>
                Glass surfaces
              </Text>
              <Switch
                checked={glassOn}
                onChange={setGlass}
                checkedChildren="On"
                unCheckedChildren="Off"
                aria-label="Toggle glassmorphism"
              />
            </div>

            {glassOn ? (
              <div className="erp-glass-controls">
                <div>
                  <div className="erp-slider-head">
                    <span>Blur intensity</span>
                    <span className="erp-slider-value">{draft.glassBlur}px</span>
                  </div>
                  <Slider
                    min={GLASS_BLUR.min}
                    max={GLASS_BLUR.max}
                    step={GLASS_BLUR.step}
                    value={draft.glassBlur}
                    onChange={setGlassBlur}
                    ariaLabelForHandle="Blur intensity"
                    marks={{ 0: '0', 8: '8', 16: '16', 24: '24' }}
                    tooltip={{ formatter: (value) => `${value ?? 0}px` }}
                  />
                  <div className="erp-slider-note">
                    Backdrop blur sampled behind each frosted pane.
                  </div>
                </div>

                <div>
                  <div className="erp-slider-head">
                    <span>Surface opacity</span>
                    <span className="erp-slider-value">
                      {Math.round(draft.glassOpacity * 100)}%
                    </span>
                  </div>
                  <Slider
                    min={GLASS_OPACITY.min}
                    max={GLASS_OPACITY.max}
                    step={GLASS_OPACITY.step}
                    value={draft.glassOpacity}
                    onChange={setGlassOpacity}
                    ariaLabelForHandle="Surface opacity"
                    marks={{ 0.1: '10%', 0.5: '50%', 0.9: '90%' }}
                    tooltip={{
                      formatter: (value) => `${Math.round((value ?? 0) * 100)}%`,
                    }}
                  />
                  <div className="erp-slider-note">
                    Alpha of the translucent tint — 10% is barely there, 90% nearly solid.
                  </div>
                </div>

                <div
                  className={`erp-glass-preview${glassOn ? ' is-on' : ''}`}
                  aria-hidden="true"
                >
                  <span className="erp-glass-preview-scene" />
                  <span className="erp-glass-preview-pane">Frosted preview</span>
                </div>
              </div>
            ) : (
              <p className="erp-glass-locked">
                Turn on to unlock the blur and opacity controls. Opting out of
                transparency effects in your OS still wins over this setting.
              </p>
            )}
          </div>
        </Section>
      </div>

      {/* ── 4. THEME COLOR ───────────────────────────────────────────── */}
      <Section
        title="Theme Color"
        hint="Curated presets, or a custom hex that is expanded into the four ERP roles (primary, surface, accent, background) with WCAG contrast checks."
        icon={<BgColorsOutlined className="erp-appearance-section-icon" />}
      >
        <div className="erp-palette-grid">
          {featuredPalettes.map((palette) => {
            const roles = resolveRoles(palette, draft.mode);
            const isSelected = !isCustom && draft.paletteId === palette.id;
            return (
              <Tooltip key={palette.id} title={`${palette.name} — ${palette.tag}`}>
                <button
                  type="button"
                  className={`erp-palette-swatch${isSelected ? ' is-active' : ''}`}
                  aria-pressed={isSelected}
                  aria-label={palette.name}
                  onClick={() => {
                    // Picking a preset hands colour back to the palette.
                    setCustomAccent(null);
                    setPalette(palette.id);
                  }}
                >
                  <span className="erp-palette-chips">
                    <span className="erp-palette-chip" style={{ background: roles.primary }} />
                    <span className="erp-palette-chip" style={{ background: roles.surface }} />
                    <span className="erp-palette-chip" style={{ background: roles.accent }} />
                    <span className="erp-palette-chip" style={{ background: roles.background }} />
                  </span>
                  {isSelected && <CheckCircleFilled className="erp-palette-check" />}
                  <span className="erp-palette-name">{palette.name}</span>
                </button>
              </Tooltip>
            );
          })}
        </div>

        {/* Custom hex picker — derives all four roles from one colour. */}
        <div className="erp-custom-color-block">
          <span className="erp-custom-color-label">Custom accent</span>
          <ColorPicker
            value={draft.customAccent ?? activeRoles.accent}
            format="hex"
            showText
            allowClear={isCustom}
            onChange={(color) => setCustomAccent(color.toHexString())}
            onClear={() => setCustomAccent(null)}
            presets={[
              {
                label: 'Featured accents',
                colors: featuredPalettes.map((p) => resolveRoles(p, draft.mode).accent),
              },
            ]}
            getPopupContainer={(node) => node.parentElement ?? document.body}
            aria-label="Pick a custom accent colour"
          />
          <Tag color={isCustom ? 'processing' : 'default'}>
            {isCustom ? 'Custom accent' : 'Palette accent'}
          </Tag>
          <Button
            size="small"
            disabled={!isCustom}
            onClick={() => setCustomAccent(null)}
            icon={<FormatPainterOutlined />}
          >
            Use palette accent
          </Button>
        </div>

        {/* Live derived-role preview with a contrast grade per role. */}
        <div className="erp-role-grid">
          {buildRoleChecks(activeRoles, draft.mode).map((check) => {
            const ratio = contrastRatio(check.hex, check.against);
            const grade = contrastGrade(ratio);
            const pass = ratio >= AA_RATIO;
            return (
              <div key={check.key} className="erp-role-chip">
                <span className="erp-role-dot" style={{ background: check.hex }} />
                <span className="erp-role-meta">
                  <span className="erp-role-label">{check.label}</span>
                  <span className="erp-role-hex">{check.hex}</span>
                </span>
                <Tooltip
                  title={`${check.label} vs ${check.note}: ${ratio.toFixed(2)}:1 — WCAG ${grade}`}
                >
                  <span className={`erp-contrast-badge${pass ? ' is-pass' : ' is-fail'}`}>
                    {grade} · {ratio.toFixed(1)}:1
                  </span>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── 5. FULL THEME STUDIO ─────────────────────────────────────── */}
      {showStudioLink && (
        <>
          <Button
            type="link"
            block
            style={{ paddingLeft: 0, textAlign: 'left' }}
            onClick={() => setStudioOpen(true)}
            icon={<BgColorsOutlined />}
            iconPosition="end"
          >
            More theme options
            <RightOutlined style={{ fontSize: 10, marginLeft: 4 }} />
          </Button>
          <ThemeStudioModal open={studioOpen} onClose={() => setStudioOpen(false)} />
        </>
      )}
    </div>
  );
};

/* ── Small local building blocks ─────────────────────────────────────── */

const Section: React.FC<{
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, hint, icon, children }) => (
  <section className="erp-appearance-section">
    <div className="erp-appearance-section-head">
      <div>
        <Title level={5} className="erp-appearance-section-title">
          {icon}
          {title}
        </Title>
        {hint && <p className="erp-appearance-section-hint">{hint}</p>}
      </div>
    </div>
    {children}
  </section>
);

interface RoleCheck {
  key: string;
  label: string;
  hex: string;
  /** The colour this role is read against (what determines its legibility). */
  against: string;
  note: string;
}

/**
 * The four contrast pairs that actually decide readability in the ERP:
 * white labels on the brand slab, body text on surface/background, and
 * links + focus rings (accent) on the surface they sit on.
 */
const buildRoleChecks = (
  roles: { primary: string; surface: string; accent: string; background: string },
  mode: ThemeMode
): RoleCheck[] => {
  const bodyText = mode === 'dark' ? '#e2e8ff' : '#0f172a';
  return [
    { key: 'primary', label: 'Primary', hex: roles.primary, against: '#ffffff', note: 'white label' },
    { key: 'surface', label: 'Surface', hex: roles.surface, against: bodyText, note: 'body text' },
    { key: 'accent', label: 'Accent', hex: roles.accent, against: roles.surface, note: 'surface' },
    {
      key: 'background',
      label: 'Background',
      hex: roles.background,
      against: bodyText,
      note: 'body text',
    },
  ];
};

/**
 * The full 39-palette Theme Studio, opened from "More theme options".
 * Wraps the existing ThemePreferences component in a Modal so palette
 * browsing reuses the same draft store this panel writes to — applying a
 * theme there and closing this panel stays consistent.
 */
const ThemeStudioModal: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => (
  <Modal
    open={open}
    onCancel={onClose}
    footer={null}
    width="min(1040px, 96vw)"
    centered
    destroyOnHidden={false}
    className="erp-theme-studio-modal"
    styles={{ body: { padding: 0, maxHeight: '85vh', overflowY: 'auto' } }}
  >
    <ThemePreferences onApplied={onClose} onRequestClose={onClose} />
  </Modal>
);

/* ── Shared action bar ───────────────────────────────────────────────── */

export interface AppearanceActionsProps {
  /** Persists the draft (applyDraft) — wired to "Apply & Save"/"Save Changes". */
  onApply: () => void;
  applyLabel?: string;
  /**
   * Reverts the live-previewed draft. Omit in hosts that have nothing to
   * cancel (the button hides itself).
   */
  onCancel?: () => void;
  cancelLabel?: string;
}

/**
 * Footer shared by the modal and the Settings page so the persistence
 * contract is identical everywhere: the draft previews live, "Apply & Save"
 * is the only thing that writes to localStorage, and the button is disabled
 * until there is actually something to save.
 */
export const AppearanceActions: React.FC<AppearanceActionsProps> = ({
  onApply,
  applyLabel = 'Apply & Save',
  onCancel,
  cancelLabel = 'Cancel',
}) => {
  const { message } = App.useApp();
  const isDirty = useThemeStore(selectIsDirty);
  const resetDraft = useThemeStore((state) => state.resetDraft);

  return (
    <div className="erp-appearance-actions">
      <div className="erp-appearance-actions-right">
        <Button
          type="text"
          size="small"
          onClick={() => {
            resetDraft();
            message.info('Appearance reset to defaults — apply to save it');
          }}
        >
          Reset to defaults
        </Button>
        {isDirty && (
          <span className="erp-appearance-dirty-note">Unsaved preview</span>
        )}
      </div>
      <div className="erp-appearance-actions-right">
        {onCancel && <Button onClick={onCancel}>{cancelLabel}</Button>}
        <Button
          type="primary"
          icon={<CheckCircleFilled />}
          disabled={!isDirty}
          onClick={onApply}
        >
          {applyLabel}
        </Button>
      </div>
    </div>
  );
};

export default AppearanceControls;
