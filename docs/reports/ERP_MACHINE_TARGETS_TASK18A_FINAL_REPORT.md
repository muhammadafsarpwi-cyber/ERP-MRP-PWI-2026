# TASK18-A — Machine Targets Table Header and Secondary Text Readability Refinement

**Date:** 2026-09-12
**Status:** COMPLETED
**Scope:** Focused typography/spacing/readability pass only. No table redesign, no table structure/data/API/business-logic/column-order changes. `HighlightedCell` **visual design** (container, border, radius, padding, background, primary style) left identical to TASK17-A.

---

## Summary

- Introduced a reusable two-line `HeaderCell` component for compound column headings.
- Increased header typography clarity (12.5px, 600 weight, letter-spacing, comfortable line-height).
- Guaranteed body values never split across lines (`white-space: nowrap` + ellipsis) while preserving the full value via existing tooltips.
- Improved secondary text readability inside the existing `HighlightedCell` pattern and other secondary values.
- Added a theme-aware `--theme-text-secondary` token for light and dark modes.
- All column widths and `scroll.x` left exactly as before (compact, Actions column intact).

---

## 1. Files Changed

| File | Change |
|------|--------|
| `frontend/src/pages/production/TargetManagement.tsx` | Added `HeaderCell` component; converted all 15 column headers; readability updates to `HighlightedCell` secondary + non-cell secondary values. |
| `frontend/src/theme/theme.css` | Added `--theme-text-secondary` token (light + dark). |

No other files were modified. No unrelated modules were touched.

---

## 2. Header Changes

### New reusable `HeaderCell` component
```tsx
const HeaderCell: React.FC<{
  icon?: React.ReactNode;
  first: React.ReactNode;
  second?: React.ReactNode;
}>
```
- `display: inline-flex; flex-direction: column` → intentional two-line heading.
- `align-items: center`, `text-align: center`, `line-height: 1.45`, `gap: 1px` → clear vertical separation, no overlap.
- Both lines: `font-weight: 600`, `font-size: 12.5px`, `letter-spacing: 0.01em`, `white-space: nowrap` → consistent typography, no collision.
- Icon rendered inline on the first line (same positions/icons as before).
- Stable classes: `.erp-th`, `.erp-th__line`, `.erp-th__icon`.
- A literal space is preserved in the second line's text content so existing `textContent`-based assertions (e.g. `'Machine Name'`, `'MACHINE ID'`, `'Std Hours'`) keep matching.

### Headers converted to two-line format
| Column | Line 1 | Line 2 |
|--------|--------|--------|
| Machine ID | MACHINE | ID |
| Machine (number) | Machine | — (single-line) |
| Machine Name | Machine | Name |
| Division / Section | Division | Section |
| Department | Department | — (single-line) |
| Item | Item | — (single-line) |
| Shift | Shift | — (single-line) |
| UOM | UOM | — (single-line) |
| Std Hours | Std | Hours |
| Standard Target | Standard | Target |
| Effective From | Effective | From |
| Status | Status | — (single-line) |
| Created By | Created | By |
| Updated By | Updated | By |
| Actions | Actions | — (single-line) |

Single-word headers upgraded to the same inline-flex typography for consistency.

---

## 3. Body Text / Readability Changes

### No wrapping of body values
`HighlightedCell` primary and secondary lines now use `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` with `max-width: 100%` on the container.

- Values stay on **one line** (never split like `Nipple Plating / APS-01`).
- Long values ellipsize visually but the **complete value is preserved** via the existing tooltip on every `HighlightedCell`.
- Applies to Machine Name, Division/Section, Department, Item, Shift, and Standard Target.

### Secondary text readability (design unchanged)
| Property | Before | After |
|----------|--------|-------|
| `secondarySize` (default) | 9px | **10px** |
| `secondaryWeight` (default) | 400 | **500** |
| Secondary color | `--theme-text-muted` fallback (alpha 0.55) | `--theme-text-secondary` (alpha 0.72 light / 0.78 dark) |

Affected secondaries: **Section** (Division/Section cell), **Item name**, **Shift name**, plus the machine-code secondary under Machine number, the `→ effective-to` line, and the Created/Updated timestamps.

Per-Hour keeps its explicit `secondarySize={11}` / `secondaryWeight={600}` from TASK18.

---

## 4. HighlightedCell Changes

The **visual design is unchanged** (identical `padding: 3px 8px`, `border-radius: 6`, `background: var(--theme-surface-alt)` with green tint, `border: 1px solid rgba(16,185,129,0.2)`, `font-weight: 700 / font-size: 12` primary). Only the requested readability parameters changed:

- Default secondary size 9 → 10, weight 400 → 500.
- Secondary color now uses the new theme token `--theme-text-secondary`.
- Primary/secondary lines are `nowrap` with ellipsis (value preserved via tooltip).

---

## 5. Theme

Added to `frontend/src/theme/theme.css`:
```css
:root { --theme-text-secondary: rgba(15, 23, 42, 0.72); }
html[data-theme='dark'] { --theme-text-secondary: rgba(214, 221, 244, 0.78); }
```
All new styling uses existing/via-token theme CSS variables — no hardcoded colors.

---

## 6. Verification

### Pre-existing unrelated failure (not caused by this task)
`npx tsc --noEmit` reports one pre-existing error: `src/pages/__tests__/permission-gating.test.ts(1,38): error TS2307: Cannot find module 'vitest'`. It is in an unrelated test file; `vitest` is not installed in this workspace. The production build (`npm run build`, `react-scripts`) completes successfully.

### Results
| Check | Result |
|-------|--------|
| Frontend build (`npm run build`, API URL = local backend) | PASS |
| Playwright Machine Targets regression (`playwright-machine-targets.js`) | **56 PASS / 0 FAIL** |
| Final verification suite (`final-verification.js`) | **27 PASS / 0 FAIL** |
| TASK18-A targeted suite (35 checks) | **35 PASS / 0 FAIL** |
| Real dark-mode suite (booted via theme store) | **4 PASS / 0 FAIL** |

### TASK18-A targeted checks (all PASS)
- Two-line headers: MACHINE/ID, Machine/Name, Division/Section, Std/Hours, Standard/Target, Effective/From, Created/By, Updated/By — each splits into exactly 2 stacked lines.
- Single-line headers (Machine, Department, Item, Shift, UOM, Status) keep 1 line.
- **No header collision/overlap** between adjacent columns.
- Header lines have clear vertical separation.
- Machine ID (col 0) and Machine Name (col 2) remain separate columns.
- Machine Name value stays on a single line (`white-space: nowrap`) and the value is visible.
- Division (primary) + Section (secondary) both visible; Section ≥ 10px and weight ≥ 500.
- Item primary + item-name secondary visible.
- Standard Target still uses the `HighlightedCell` container; **all 60 HighlightedCells share the identical visual pattern** (single pattern key across the table).
- Per Hour visible (`8,333.33 PCS/h`), **exactly 2 decimal places**, font-size 11px, weight 600.
- Actions column shows all 4 buttons; none clipped.
- Responsive: at 1280px the wide table scrolls horizontally with columns intact (no collapsed/overlapping layout); at 1920px headers have no overlap.
- Dark mode (real app theme): header text `rgba(226, 232, 255, 0.92)` at 12.5px/600 (readable), secondary uses `rgba(214, 221, 244, 0.78)` at 10px/500, HighlightedCell background resolves to dark surface.

### Browser visual verification
Headless Chromium 1920×1080 with the real app (local static build + local backend). Screenshots saved for review:
- `C:\Users\afsar\AppData\Local\Temp\opencode\task18a-baseline.png` (before)
- `C:\Users\afsar\AppData\Local\Temp\opencode\task18a-final-light.png` (after, manual-dark-state reference)
- `C:\Users\afsar\AppData\Local\Temp\opencode\task18a-final-dark.png` (after, manual dark)
- `C:\Users\afsar\AppData\Local\Temp\opencode\task18a-real-dark.png` (after, true app dark mode)

---

## 7. Notes

- Column widths and `scroll.x` were intentionally kept at their previous values: the visible table region is ~1615px; widening columns beyond the total caused the fixed-right Actions header cell to overlap the adjacent column (verified by geometry debug), so the compact configuration was retained and long values are handled by one-line ellipsis + tooltip exactly as the task permits.
- No commits made.