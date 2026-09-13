# ERP Machine Master — TASK24 Final Report

**Title:** Machine Master — Architecture Correction: single-popup 6-tab View + unified Add/Edit workspace (Form pane + live Machine Details pane)

**Status:** Complete — implemented, regression-protected (new 38-checkpoint `MachineManagement.task24.test.tsx` suite; full Machine Management regression 86 tests passed across 5 suites), built, and browser-verified (light/dark, 1920/768/390, drag/resize, single Save, real Production + Job Cards endpoints — 58 checkpoints, 0 failures; Machine Targets + final-verification regressions green).

---

## 1. Scope

Architecture correction for the Machine Master page (`/master-data/machines`, `frontend/src/pages/master-data/MachineManagement.tsx`) replacing the TASK22/23 dual-window arrangement with **one professional popup at a time**:

- **View = ONE draggable/resizable popup** titled **Machine Details** with a compact **6-option Segmented navigation**: Machine Identity, Organization + Location, Technical Information, **Production**, **Job Cards**, Dates + Description. No per-field cards — every section renders clean **Label → Value** rows (`.erp-detail-row`).
- **Production tab** (real data): Machine Targets table + Production History table, fetched from the real endpoints `/production/machine-targets` and `/production/entries`, linked to the Production Targets page.
- **Job Cards tab** (real data): fetches the maintenance per-machine endpoint `GET /master-data/maintenance/job-cards/machine/:machineId` (SearchRequest: `ACTIVE` only, `requestedAt` desc, cap 50) and renders a 10-column table (Job Card No, Requested Date, Complaint, Status badge, Priority, Type, Requested By, Started, Closed, Downtime) or a clear empty state. **No fake or client-only data.**
- **Add/Edit = ONE unified parent popup** (a single `DraggableResizableModal`) containing a **Form pane** + a **read-only live Machine Details pane**. Single title bar, single header close (X), single footer action (Save / Save Changes + Cancel in edit) — the whole workspace drags and resizes as **one unit** (exactly one resize handle, no per-pane handles).
- Live preview works in **both** modes: Add renders "—" for Machine ID/Status (generated on save) with an explanatory caption; Edit is pre-filled and each form edit updates the details pane immediately, keeping the real `machineId`.
- Responsive: panes sit side-by-side on wide viewports and stack in a column (`erp-workspace-panes--column`) below 720px viewport width; body/panes scroll internally (never the page).

Constraints honored: **frontend-only** (existing shared components, existing APIs), **no backend/API/DB changes, no commits, no fake data.**

## 2. Implementation

### 2.1 `MachineManagement.tsx`

- **Types/nav:** `JobCardLite` interface for the job-card rows; `ViewSection = 'identity' | 'org' | 'tech' | 'production' | 'jobcards' | 'dates'`; `VIEW_SECTIONS` — the six required sections in order.
- **Helpers:** `fmtDate` / `fmtDateTime` / `fmtMinutes` for job-card dates and downtime; `label()` imported from `../maintenance/jobCards.types` renders Priority (`HIGH`→`High`) and Type (`CORRECTIVE`→`Corrective`).
- **View modal:** plain `<Modal>` replaced with `DraggableResizableModal` (`title="Machine Details"`, subtitle `name · machineCode`, width 900 / height 640 / min 560×420, `destroyOnHidden`, `styles.body.overflow:auto`); body = `.erp-modal-nav` (compact Segmented) + section branch (standard section / Production tables / Job Cards table + link / empty + loading states). Footer: **QR / Edit / Close**.
- **Data fetching:** `fetchJobCards` callback + effect fires when the Job Cards tab is active and a detail is loaded, calling `/master-data/maintenance/job-cards/machine/${machineId}` via `apiService.get<T>` (returns the parsed array) with a loading state and safe fallback to `[]`.
- **Unified workspace:** removed the separate preview window (`previewVisible` state deleted). `FormModal` now takes `stacked` + `previewModel`; renders `.erp-workspace-panes` (`.erp-pane-form` with the full Form → `.erp-pane-details` with pane title `Machine Details`, per-mode caption, and four `MachineSection showTitle` blocks). Outer title `Add Machine` / `Edit Machine — <code>`; subtitle `Form · live Machine Details preview` / `Form · updates the existing record`; `okText` `Save` / `Save Changes` — so there is exactly one Save per workflow.
- **`previewModel`** computes in **both** modes: Add → `machineId`/`status` = `null` (renders "—"); Edit → seeded from the editing record, all other fields tracked live from the form values.
- **Geometry:** single `workspace` object (width `isMobile ? max(360, vw-16) : vw < 1200 ? 980 : 1040`, height 640; minWidth `isMobile ? min(340, vw-16) : 720`, minHeight 420) + `workspaceStacked = vw < 720`.

### 2.2 `draggableResizableModal.css`

- `.erp-workspace-panes` (row flex, gap 16) + `--column` variant (stacked, `overflow-y:auto`), `.erp-workspace-pane` (flex 1, `overflow-y:auto`), `.erp-pane-details` divider (row: left border; column: top border), `.erp-workspace-pane-title` (12.5px/600 uppercase), `.erp-modal-nav` compact Segmented label (12px/600, line-height 28).

### 2.3 Test suites updated to the new architecture

- `MachineManagement.task21/22/23.test.tsx` — tab counts updated to six (incl. **Production** and **Job Cards**), helpers scoped to the unified workspace (`workspace()` / `detailsPane()` / `formPane()`), PART B rewritten to single-popup assertions (two panes, live mirror, "—", one close X, one resize handle, single subtitle).

## 3. Regression tests (CRA Jest)

New `MachineManagement.task24.test.tsx` — **38 checkpoints**, zero expected failures:

**VIEW (1–9):** 1 single draggable popup titled Machine Details, one X + one footer Close; 2 compact nav lists all six sections; 3 identity rows + Active/High badges; 4 Production fetches real `/production/entries` + `/production/machine-targets`; 5 Job Cards hits the exact `/master-data/maintenance/job-cards/machine/:id` URL and empty state; 6 real rows (JC no, status, priority, type, requested-by); 7 Dates + Description; 8 section resets to Machine Identity on reopen; 9 body self-scrolls (overflow auto) with 640px-constrained popup.

**ADD (10–21):** 10 single parent popup, one X, one Save; 11 two panes with pane titles; 12 details pane read-only; 13–14 live mirror of text + Select inputs; 15 "—" for Machine ID and never `undefined`/`null`/`NaN`; 16 no repeated headings; 17 header X closes the whole workspace; 18 single Save → successful Save → OK closes + refreshes; 19 error phase + Retry; 20 validation blocks empty submit; 21 one moveable/resizable unit (single resize handle, none inside panes).

**EDIT (22–30):** 22 one unified Edit workspace; 23 pane titles; 24 pre-filled form + details; 25 real machineId kept; 26 live updates; 27 exactly one Save + Cancel; 28 status/criticality rendered; 29 save success flow; 30 single draggable unit.

**REGRESSION (31–38):** 31 row actions intact; 32 View→Edit transition closes View then opens Edit workspace; 33 header actions intact; 34 Import modal; 35 Production tab real rows; 36 Clear; 37 Refresh re-fetches; 38 real job-card endpoint URL.

```
Test Suites: 5 passed, 5 total          (20a + 21 + 22 + 23 + 24)
Tests:       86 passed, 86 total
```

## 4. Browser verification

Custom Playwright matrix (`mm-task24-verify.js`) against the rebuilt production bundle served at `:3000` with the live API at `:3001` (single login; real Production + Job Cards endpoints; save intercepted on the wire to avoid DB pollution).

```
PASS: 58   FAIL: 0   INFO: 3
```

The 3 INFOs are benign: antd puts the modal subtitle text inside the same `.ant-modal-title` (so "Add title" reads `Add Machine · Form · live Machine Details preview`), and CSS `text-transform: uppercase` makes `innerText` of the pane titles read `ADD MACHINE FORM | MACHINE DETAILS` while the DOM text (and the Jest suite) is the correct title case.

Light / Desktop 1920:
- View opens as **ONE** popup (no separate windows), one resize handle, 6-tab nav in order; label/value rows, zero per-field cards; all six sections verified (Org, Technical, Production Targets+History, Job Cards via the real endpoint, Dates+Description); body self-scrolls.
- View→**Edit**: closes View, opens ONE `Edit Machine — <code>` workspace with Form + Details panes, single **Save Changes**, real machineId shown.
- **Add**: one unified workspace; pane titles "Add Machine Form" / "Machine Details"; "—" for not-yet-set values; no undefined/null/NaN; details pane read-only; both panes `overflow-y:auto`; one X, one Save, one resize handle, none inside panes; live mirror of typed code + name; whole workspace drags by header and resizes as one unit (1040 → 1104px); Save → spinner → **Successful Save** → payload verified → OK closes everything.
- No page/console errors.

Dark / Desktop 1920:
- `data-theme="dark"`; View nav = 6 sections; Job Cards renders; unified Add workspace (Form + Details panes, one Save); no errors.

Responsive 768px / 390px:
- No page overflow; View = single popup with 6 tabs; workspace lays out **row** at 768, **column (stacked)** at 390; Form + Details panes present; exactly one Save; no undefined/null/NaN; no errors.

## 5. Build / type check / suites

- **Build:** `REACT_APP_API_URL=http://127.0.0.1:3001/api/v1 npm run build` → **PASS**, served at `:3000`.
- **TypeScript:** `npx tsc --noEmit` → only the pre-existing unrelated error `src/pages/__tests__/permission-gating.test.ts(1,38): Cannot find module 'vitest'`.
- **Machine Targets regression** `playwright-machine-targets.js`: **56 PASS / 0 FAIL**.
- **Final verification** `final-verification.js`: **PASS 25 / FAIL 0**.

## 6. Files changed

- `frontend/src/pages/master-data/MachineManagement.tsx` — Job Card History tab + real endpoint fetch, 6-tab compact nav, View as single DraggableResizableModal (`destroyOnHidden`, scrollable body, QR/Edit/Close footer), unified Add/Edit workspace (Form + live Details panes, both-mode `previewModel`, single Save/Save Changes), removed dual-window geometry (`workspace`/`workspaceStacked`), `fmtDate/fmtDateTime/fmtMinutes`, `label()` reuse, `JobCardLite`.
- `frontend/src/components/shared/draggableResizableModal.css` — `.erp-workspace-panes` (+ `--column`), pane/details/divider styles, `.erp-workspace-pane-title`, `.erp-modal-nav` segmented sizing, `.erp-draggable-modal .ant-modal-body` flex/overflow rules.
- `frontend/src/pages/master-data/MachineManagement.task21.test.tsx` — updated to 6 tabs + unified workspace.
- `frontend/src/pages/master-data/MachineManagement.task22.test.tsx` — updated (PART B unified-workspace assertions, Production label, six tabs).
- `frontend/src/pages/master-data/MachineManagement.task23.test.tsx` — updated (previewPane, section-reset, single workspace).
- `frontend/src/pages/master-data/MachineManagement.task24.test.tsx` — **new**, 38-checkpoint regression suite.

No backend/API/DB changes. No commits made.

## 7. Unrelated pre-existing failures

- `permission-gating.test.ts` imports `vitest` (not installed) → `tsc` error; unrelated to this task.