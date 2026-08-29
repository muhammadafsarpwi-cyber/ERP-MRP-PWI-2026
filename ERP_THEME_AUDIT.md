# ERP Theme Audit Report

**Scope:** `frontend/src/theme/` (ThemeProvider, themeStore, palettes, colorUtils, theme.css, ThemePreferences), theme integration across pages, antd theming.
**Verified by:** full code read of theme files + components; live frontend build (passes).

---

## 1. Theme Architecture (verified)

| Piece | File | Role |
|---|---|---|
| Palette definitions | `palettes.ts` | 20 named palettes × light/dark roles (primary/surface/accent/background) |
| State store | `themeStore.ts` | zustand store; per-user scope keyed by `erp_user` identity, persisted to `localStorage` (`erp_theme_prefs_v1`) |
| Provider | `ThemeProvider.tsx` | Applies antd `ConfigProvider` algorithm + CSS vars on `document.documentElement`; sets `data-theme` attr |
| CSS variables | `theme.css` | Base `:root` + `html[data-theme='dark']` variable sets; component classes |
| Customizer | `ThemeCustomizer.tsx` / `ThemePreferences.tsx` | Palette swatches + mode toggle, draft/save/revert |
| Color utils | `colorUtils.ts` | darken/lighten/mix/rgba helpers |

**Strengths**
- Real per-user theming: scope key derived from logged-in user; prefs survive reload; guest default.
- Clean CSS-variable architecture consumed by shared classes (`.erp-app-header`, `.erp-app-content`, panels).
- 20 palettes with tuned dark-mode roles; antd dark/default algorithm switching works.
- `prefers-reduced-motion` respected (theme.css:273).
- Build-verified (react-scripts build passes with theme imports).

---

## 2. Issues Found

### TH-1 — `--theme-icon-*` variables are static (MEDIUM)
`theme.css:31-41` defines `--theme-icon-primary/success/warning/danger/info/purple/cyan/orange/indigo/violet/neutral` for light and dark, hardcoded to the **indigo** palette. `ThemeProvider.buildCssVars` (ThemeProvider.tsx:14-84) does **not** regenerate them, so switching to another palette (e.g. emerald/rose) leaves icon colors indigo-toned → inconsistent branding.
**Fix:** derive `--theme-icon-*` from the active palette in `buildCssVars`, or remove them and use the standard `--theme-*` tokens.

### TH-2 — Indentation defect (COSMETIC / LOW)
`ThemeProvider.tsx:72` — `'--theme-success': '#52c41a',` is not indented (leading whitespace missing vs. surrounding lines). Valid JS, but breaks formatting/lint consistency.
**Fix:** fix indentation.

### TH-3 — Theme bypassed by hardcoded antd `Tag` colors (MEDIUM)
Organization pages (`CompanyManagement`, `BranchManagement`, `DivisionManagement`, `SectionManagement`, `DepartmentManagement`, `WarehouseManagement`, `LocationManagement`) render statuses with raw `<Tag color="green|red">` instead of the shared `StatusBadge` component. Procurement/sales pages hardcode antd preset color maps (`statusColorMap`) that ignore the active palette.
**Fix:** route status rendering through `StatusBadge`/`--theme-*` tokens.

### TH-4 — Hardcoded border/background in shared components (LOW)
- `FilterBar.tsx:29` hardcodes `borderTop: '1px solid #f0f0f0'` instead of `var(--theme-border)`.
- Several dashboard components use inline styles with static hex colors rather than `var(--theme-*)`.

### TH-5 — localStorage XSS exposure (LOW)
Theme prefs and `erp_user` are stored in `localStorage`; if XSS occurs, tokens/prefs are readable. Standard for this stack; flag only because no CSP/helmet headers on the app (see SEC-20).

### TH-6 — Customizer double-revert risk (LOW)
`ThemeCustomizer.tsx` calls `handleOpenChange` on open and `onRequestClose` also calls it — draft-revert logic has two code paths that can both run; guarded but fragile.
**Fix:** single explicit close handler.

### TH-7 — `!important` usage (LOW)
`theme.css:120` (`.erp-theme-trigger-btn:hover`) and `sidebar-nav.css:120` use `!important` — specificity coupling risk.
**Fix:** restructure selectors instead.

### TH-8 — Contrast not auto-validated (INFO)
Palette roles are hand-tuned; no automated WCAG contrast check on `--theme-on-accent`/`--theme-on-primary` across all 20 palettes × 2 modes. Most look reasonable by inspection, but a dark palette (e.g. amber/coffee) with `--theme-on-accent:#ffffff` may be low-contrast.
**Fix:** add a contrast assertion in `ThemeProvider` or CI.

---

## 3. Theme Coverage Matrix

| Page group | Uses theme tokens | Notes |
|---|---|---|
| Layout (header, sider, content) | ✅ | `ThemeProvider` Layout/Menu components config |
| Auth screens | ✅ | `auth.css` uses theme vars + custom palette classes |
| Dashboard | ⚠️ | Charts/KPIs use recharts + antd tokens; some inline hex |
| Master data (items/UOM/machines) | ⚠️ | Status via `StatusBadge` mostly; some raw tags |
| Procurement/Sales | ⚠️ | `statusColorMap` preset colors ignore palette |
| Organization | ⚠️ | Raw `<Tag>` (TH-3) |
| Inventory | ⚠️ | Mixed |
| Maintenance | ✅ | Dedicated `maintTheme.css`/`maintTheme.ts` + themed dashboard |
| Admin (users/roles/permissions) | ⚠️ | Standard antd, palette-agnostic |
| Settings | ✅ | Embedded ThemePreferences |

---

## 4. Theme Verdict

**Overall theme quality: 75/100.** A genuinely good, functional theming foundation (per-user, 20 palettes, dark mode, CSS variables, antd integration) with a few gaps: static icon variables (TH-1), hardcoded status colors bypassing the system (TH-3), inline-style drift, and no automated contrast checks. These are polish issues, not blockers.
