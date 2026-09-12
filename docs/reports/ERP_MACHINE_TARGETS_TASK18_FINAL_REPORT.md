# TASK18 — Reuse Standard Target Highlighted Pattern for Department, Item, Shift + Per-Hour Improvement

**Date:** 2026-09-12
**Status:** COMPLETED

---

## Summary

Applied the existing `HighlightedCell` component (Standard Target visual pattern) to Department, Item, and Shift columns. Improved Per-Hour visibility with larger font and bold weight. Fixed number formatting to always show exactly 2 decimal places.

---

## Changes Made

### 1. Enhanced `HighlightedCell` Component

Added two optional props for configurable secondary text styling:
- `secondarySize` (default: 9) — font size of secondary line
- `secondaryWeight` (default: 400) — font weight of secondary line

Also added `var(--theme-text-secondary)` as fallback for dark mode support.

### 2. Department — HighlightedCell

**Before:** `<DepartmentBadge>` component
**After:** `HighlightedCell` with `TeamOutlined` icon, department name as label

### 3. Item — HighlightedCell

**Before:** Custom div with item code (bold) and name (muted)
**After:** `HighlightedCell` with `ShoppingOutlined` icon, item code as label, item name as secondary

### 4. Shift — HighlightedCell

**Before:** `<ShiftBadge>` component
**After:** `HighlightedCell` with `ClockCircleOutlined` icon, shift code as label, shift name as secondary

### 5. Standard Target Per-Hour Improvement

**Before:** `fontSize: 9`, `fontWeight: 400` (faint, small)
**After:** `fontSize: 11`, `fontWeight: 600` (bold, clearly visible)

### 6. Number Formatting Fix

**Before:** `maximumFractionDigits: 2` (could show 0-2 decimals: `12`, `8`, `100,000`)
**After:** `minimumFractionDigits: 2, maximumFractionDigits: 2` (always 2 decimals: `12.00`, `8.00`, `100,000.00`)

### 7. Removed Unused Imports

- `DepartmentBadge` — no longer used after Department column refactor
- `ShiftBadge` — no longer used after Shift column refactor

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/pages/production/TargetManagement.tsx` | Enhanced `HighlightedCell` (secondarySize, secondaryWeight props), applied to Department/Item/Shift columns, improved Per-Hour styling, fixed fmtQty to 2 decimal places, removed unused imports |

---

## Visual Pattern (identical for all 5 highlighted cells)

```
┌────────────────────────────┐
│ [icon] Primary Label       │
│   Secondary Value          │
└────────────────────────────┘

Container: padding 3px 8px, borderRadius 6px
Background: var(--theme-surface-alt, #f0fdf4)
Border: 1px solid rgba(16, 185, 129, 0.2)
Primary: fontWeight 700, fontSize 12
Secondary: fontWeight 400 (default) or 600 (Per-Hour), fontSize 9 (default) or 11 (Per-Hour)
```

---

## Verification

| Check | Result |
|-------|--------|
| TypeScript build | PASS |
| Frontend build | PASS |
| Playwright regression (56 tests) | 56 PASS / 0 FAIL |
| Department uses highlighted pattern | PASS |
| Item uses highlighted pattern | PASS |
| Shift uses highlighted pattern | PASS |
| Standard Target uses highlighted pattern | PASS |
| All highlighted cells use identical pattern attributes | PASS |
| Per-Hour has exactly 2 decimal places | PASS |
| Per-Hour text is bold (fontWeight >= 600) | PASS |
| Per-Hour text is larger (fontSize >= 11px) | PASS |
| **Total TASK18 checks** | **8/8 PASS** |

---

## Browser Verification

Visual verification via Playwright headless screenshot at 1920x1080 viewport. All five columns (Machine Name, Division/Section, Department, Item, Shift, Standard Target) render with the identical HighlightedCell visual pattern. Per-Hour values are clearly visible with bold 11px text. All numbers display exactly 2 decimal places (e.g., 12.00, 8.00, 100,000.00, 8,333.33).
