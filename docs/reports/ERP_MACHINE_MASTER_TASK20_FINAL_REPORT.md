# ERP Machine Master — TASK20 Final Report

**Task:** Bring the Machine Master table (`MachineManagement.tsx`) to the same professional ERP table standard as Machine Targets — two-line HeaderCell headers, HighlightedCell highlight pattern, primary/secondary text hierarchy, no-wrapping cells, TASK19-style bordered action buttons, dense rows, light/dark theme correctness, responsive (no page-level overflow).

**Project:** `D:\ERP-MRP-PWI-2026`
**Scope:** Presentation only. No machine data, API, backend, permission, routing, or business-logic changes. No records created/updated/deleted during verification. No commits made.

---

## 1. Exact Files Changed

| File | Change |
|---|---|
| `frontend/src/components/shared/TableCells.tsx` | **NEW shared component** — `HeaderCell` + `HighlightedCell` extracted verbatim from TargetManagement (promoting the Machine Targets canon into the reusable design system). |
| `frontend/src/components/shared/index.ts` | Re-export `HeaderCell`, `HighlightedCell` from `./TableCells`. |
| `frontend/src/pages/production/TargetManagement.tsx` | Removed the two local component definitions (now imported from shared); renamed the Actions-column modifier class `erp-table-actions--machine-targets → erp-table-actions--bordered` and per-action classes `mt-act-* → act-*`. Zero visual change (verified by re-running the TASK18A/19 regression suites). |
| `frontend/src/pages/master-data/MachineManagement.tsx` | Table upgrade (details in §3–§5): all 12 columns re-rendered with `HeaderCell` titles + icons, primary/secondary cell hierarchy, HighlightedCell highlights, tooltips + nowrap/ellipsis, bordered `TableActions` (now 6 controls incl. existing status Dropdown + QR/Print), Actions column `170 → 230px`, scroll `x: 1500 → 1600`, wrapped table in the shared dense container pair `erp-table-container erp-table-container--dense`. |
| `frontend/src/styles/erp-table.css` | §7b generalized from a Machine-Targets-specific scope to the reusable `erp-table-actions--bordered` + semantic `.act-view / .act-edit / .act-activate / .act-deactivate / .act-delete / .act-neutral` tones. Machine Master reuses the exact same styles. |

**Untouched:** `ERPTable.tsx` / `TableActions` (still the shared components — no new/duplicate button or cell components), `theme.css`, all other modules.

## 2. Reusable Design-System Work (no duplication)

- **Promoted** `HeaderCell` and `HighlightedCell` from TargetManagement-local constants into a shared module (`components/shared/TableCells.tsx`), exported via the shared barrel `index.ts`. Both Target Management and Machine Master now import the single canonical implementation. The extraction is byte-for-byte identical (same CSS-var-driven styling, same `labelColor`/`secondarySize`/`tooltip` API), so Target output is unchanged.
- **Generalized** the TASK19 action-button CSS from Machine-Targets-only (`.erp-table-actions--machine-targets`, `.mt-act-*`) into the reusable `erp-table-actions--bordered` + `.act-*` set, adding a new neutral tone (`.act-neutral`) for QR/Print/status. No other ~30 modules using `TableActions` are affected (scoped by the new modifier class).
- **Reused existing** `TableActions`, `StatusBadge`, `getMachineColor` (`utils/colorMapping.ts` — already shared), `EmptyState`, `LoadingState`, `PageHeader`, `BarcodePrint`.

## 3. Machine Master Column Design Delivered

| Column | Header (icon) | Cell |
|---|---|---|
| Machine ID | `Machine ID` (Tag) | muted mono `<code>` 11px + tooltip (Targets mirror) |
| Code | `Code` (Setting) | `getMachineColor` badge + `serialNumber` secondary |
| Machine No. | `Machine No.` (Number) | secondary style, nowrap + ellipsis + tooltip |
| Name | `Machine Name` (Apartment) | `HighlightedCell` — name (machine-color accent) + `machineType` secondary |
| Division | `Division Section` (Shop) | `HighlightedCell` — division + section secondary with `SubnodeOutlined` prefix |
| Section | `Section` (Subnode) | secondary style, nowrap + ellipsis + tooltip |
| Department | `Department` (Team) | `HighlightedCell` (accent) |
| Location | `Location` (Environment) | secondary style, nowrap + ellipsis + tooltip |
| Make / Model | `Make / Model` (Tags) | two-line hierarchy: manufacturer (600) / model (secondary) |
| Criticality | `Criticality` (Alert) | `StatusBadge` (unchanged) |
| Status | `Status` (CheckCircle) | `StatusBadge` (unchanged) |
| Actions | `Actions` (no icon) | bordered `TableActions` (below) |

Header `textContent` is exact to the previous plain titles (`Machine ID`, `Code`, `Machine No.`, `Machine Name`, `Division Section`, `Section`, `Department`, `Location`, `Make / Model`, `Criticality`, `Status`, `Actions`) so nothing a user relies on changed.

## 4. Actions Column (reuses the TASK19 design)

`TableActions className="erp-table-actions--bordered"` with 5 structured actions + 1 `extraActions` status Dropdown (all 30×30 bordered buttons, 4px gap, tooltips, `aria-label`s):

- **View** `EyeOutlined` — `.act-view` (info) → detail drawer
- **Edit** `EditOutlined` — `.act-edit` (warning) → edit form
- **QR** `QrcodeOutlined` — `.act-neutral` → QR modal
- **Print** `PrinterOutlined` — `.act-neutral` → `BarcodePrint`
- **Status** `MoreOutlined` (Dropdown, `.act-neutral`) → Set Active / Set Maintenance / Deactivate / Retire (unchanged handler); menu opens on click
- **Delete** `DeleteOutlined`, danger, `.act-delete` with `Popconfirm` (`Blocked if referenced by production data.`) — unchanged handler

All original actions/handlers/order are preserved; only presentation changed.

## 5. Density & Geometry

- Row height measured **53.3px** on Machine Master vs **54.7px** on the canonical Machine Targets page — parity via the shared `erp-table-container--dense` padding (7px 10px cells).
- Table renders **1613px** wide (scroll `x: 1600`), no page-level horizontal overflow at 1920 / 1600 / 1280 (delta = 0px).
- Fixed-left Machine ID and fixed-right Actions stay pinned; at 1280 the fixed-right Actions remain flush with the container edge (delta 0px).
- No cell wrapping: every data-present row measured identical height (53.3px), so no row ever wraps and none collides into the header row.

## 6. Theme Behavior (Light + Dark)

Verification ran in light mode (`@1920/1600/1280`) and a real dark boot seeded via the theme store (`erp_theme_prefs_v1` → scope `user:{id}` → `{ paletteId: 'indigo', mode: 'dark' }`):

- `data-theme="dark"` applied; `--theme-surface-alt` #eef0f9 → #24273d and `--theme-text-secondary` resolved to the dark token — HighlightedCells, secondary text, and code badges remain visible.
- Bordered action buttons keep their 30×30 geometry and semantic tones in both themes (token-driven `--act` / `color-mix`).
- No hardcoded colors introduced: every tone comes from existing `theme.css` tokens.

## 7. Accessibility

- All 6 icon-only controls carry descriptive `aria-label`s (e.g. `View machine — HD-04`, `Change status — HD-04`).
- Tooltips on every action and on truncated cells (Machine ID, Code, Name, Division, Section, Department, Location, Make/Model, Machine No.).
- Native buttons; `:focus-visible` 2px `var(--theme-focus)` outline verified via keyboard focus.

## 8. Build & TypeScript

- `npm run build` (with `REACT_APP_API_URL=http://127.0.0.1:3001/api/v1`): **PASS**
- `npx tsc --noEmit`: **only the pre-existing unrelated error** — `src/pages/__tests__/permission-gating.test.ts(1,38): error TS2307: Cannot find module 'vitest'` (`vitest` not installed). No new type errors.

## 9. Test Results

| Suite | Result |
|---|---|
| `playwright-machine-targets.js` (TASK18A/19 regression — Targets unchanged by the refactor) | **56 PASS / 0 FAIL** / 2 INFO |
| `final-verification.js` (Targets final checks) | **27 PASS / 0 FAIL** |
| TASK20 Machine Master suite (light @1920/1600/1280, dark @1920; headers, icons, fixed columns, widths, density, cell hierarchy, badges, action tones, hover fills, focus ring, status dropdown, tooltip, overflow, pinned Actions, dark tokens) | **58 PASS / 0 FAIL** / 3 INFO |

The 3 INFO entries are data-dependent (current dataset has no `machineType`, no `location`, and no `manufacturer/model` records); each is rendered by-design as a muted `—` and the HighlightedCell secondary is hidden when absent — the styling path itself is asserted via the Division/Section secondary which is present on all 20 rows.

## 10. Constraints Honored

- **No business logic changes** — all original handlers (save/delete/status/detail/QR/print/filters/sort/pagination) untouched, only cell/header/action *presentation* was restyled.
- **No duplicated components** — `HeaderCell`/`HighlightedCell` promoted to shared and imported by both pages; `getMachineColor`, `TableActions`, `StatusBadge` reused.
- **No hardcoded demo data** — no fixtures added; verification ran against the real `/machines` data.
- **No fake verification** — every assertion is a live DOM/computed-style measurement via Playwright.
- **No data mutations** — the status Dropdown was only opened (menu rendered 3 options), never activated.
- **No commits made.**

## 11. Artifacts

- Light full-page: `C:\Users\afsar\AppData\Local\Temp\opencode\task20-01-light-full.png`
- Dark full-page: `C:\Users\afsar\AppData\Local\Temp\opencode\task20-02-dark.png`
- Temporary verification scripts were deleted after the run (same convention as prior tasks).