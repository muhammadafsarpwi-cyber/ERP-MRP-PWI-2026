# TASK17-A — Reuse Standard Target Visual Pattern for Machine Name and Division/Section

**Date:** 2026-09-12
**Status:** COMPLETED

---

## Summary

Extracted the Standard Target cell's visual pattern into a reusable `HighlightedCell` component and applied it to Machine Name and Division/Section columns for visual consistency across the table.

---

## Changes Made

### 1. Created `HighlightedCell` Component

Extracted from the Standard Target inline pattern into a reusable component:

```tsx
const HighlightedCell: React.FC<{
  icon?: React.ReactNode;
  label: React.ReactNode;
  labelColor?: string;
  secondary?: React.ReactNode;
  secondaryPrefix?: React.ReactNode;
  tooltip?: string;
}>
```

**Visual pattern** (identical for all three cells):
- `lineHeight: 1.35`
- `padding: '3px 8px'`
- `borderRadius: 6`
- `background: 'var(--theme-surface-alt, #f0fdf4)'`
- `border: '1px solid rgba(16, 185, 129, 0.2)'`
- Primary line: `fontWeight: 700`, `fontSize: 12`, `color: 'var(--theme-accent, #059669)'`
- Secondary line: `color: 'var(--theme-text-muted)'`, `fontSize: 9`

### 2. Machine Name — Same Pattern

**Before:** Plain `<span>` with tooltip
**After:** `HighlightedCell` with `SettingOutlined` icon, machine name as label, machine ID as tooltip

Example row:
```
┌─────────────────────────┐
│ ⚙ Nipple Plating APS-01│
└─────────────────────────┘
```

### 3. Division / Section — Same Pattern

**Before:** Plain div with separate line styling
**After:** `HighlightedCell` with `ShopOutlined` icon, division name as label, section name as secondary with `SubnodeOutlined` prefix

Example row:
```
┌─────────────────────────┐
│ 🏢 Spoke Division       │
│   ↳ Auto Plating        │
└─────────────────────────┘
```

### 4. Standard Target — Refactored to Use Component

**Before:** Inline styles (same pattern, duplicated)
**After:** Uses `HighlightedCell` with `AimOutlined` icon, target value as label, per-hour rate as secondary

No visual change — same appearance, now using the shared component.

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/pages/production/TargetManagement.tsx` | Added `HighlightedCell` component (25 lines), applied to Machine Name, Division/Section, and Standard Target columns |

---

## Verification

| Check | Result |
|-------|--------|
| TypeScript build | PASS |
| Frontend build | PASS |
| Playwright regression (56 tests) | 56 PASS / 0 FAIL |
| Standard Target uses highlighted pattern | PASS |
| Machine Name uses highlighted pattern | PASS |
| Division/Section uses highlighted pattern | PASS |
| All three cells use identical pattern attributes | PASS |
| **Total TASK17A checks** | **4/4 PASS** |

---

## Browser Verification

Visual verification via Playwright headless screenshot at 1920x1080 viewport. All three columns (Machine Name, Division/Section, Standard Target) render with the identical visual pattern: green-tinted background, 6px border-radius, 1px solid border, consistent typography and spacing. They look like three variants of the same table-cell component.
