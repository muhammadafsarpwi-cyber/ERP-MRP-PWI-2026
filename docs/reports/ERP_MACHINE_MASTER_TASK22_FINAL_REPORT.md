# ERP Machine Master — TASK22 Final Report

**Title:** Machine Master UX 2 — interactive section-based View modal + dual-window Add workspace + professional Save Status popup

**Status:** Complete — implemented, regression-protected (32 jest tests), built, browser-verified (light/dark, desktop/tablet/mobile, 33 checkpoints).

---

## 1. Scope

Bring the Machine Master page (`/master-data/machines`, `frontend/src/pages/master-data/MachineManagement.tsx`) to the same professional UX level as the rest of the ERP screens, reusing existing shared components only:

- **Part A — View modal section navigation:** the detail modal now presents five interactive sections (**Machine Identity / Organization + Location / Technical Information / Dates + Description / Production / History**) through a `Segmented` tab bar. Only the active section renders, so long records no longer force one tall scroll. The **Production / History** tab is backed by the real production endpoints and renders the last machine targets and production entries inline.
- **Part B — Dual Add workspace:** opening **Add Machine** shows two draggable/resizable windows side-by-side (responsive offsets): Window 1 = the Add/Edit form, Window 2 = a live **"Machine Details — Pre-save preview"** that re-renders on every keystroke from the form values (Machine ID/Status shown as "—" because they are auto-generated on save). Edit mode intentionally opens only Window 1.
- **Part C — Professional Save Status popup:** after submitting, a `SaveResultDialog` shows the loading → success → error state machine with a "Successful Save" success screen (OK closes everything + refreshes the list), a persistent error screen with the normalized API message and a **Retry** button that re-submits the exact same payload, and a `saving` guard so double-clicking can never double-submit.

Constraints honored: no backend/API/DB changes; no commits; shared components reused (`DraggableResizableModal`, `SaveResultDialog`, `StatusBadge`); the old import/QR/print/edit/delete/status flows are untouched.

## 2. Implementation

### 2.1 Shared component extensions

- **`DraggableResizableModal`** (`frontend/src/components/shared/DraggableResizableModal.tsx`) — added the `initialOffset?: { x?: number; y?: number }` prop. On open the modal is translated by the given offset from center (clamped to stay ≥ 24px inside the viewport) so two windows can be positioned side-by-side. Drag/resize/min-size behavior is unchanged.
- **`SaveResultDialog`** (`frontend/src/components/shared/SaveResultDialog.tsx`) — added three optional props: `successTitle` (success headline, default "Successful"), `okLabel` (success confirm button label, default "Close"), and `errorLead` (failure message line, default "The request was not persisted."). Loading/success/error visuals untouched.

### 2.2 Machine Management (`MachineManagement.tsx`)

**Data model / helpers (module scope):**
- `MachineDetailModel` — unified value bag (nullable strings plus `divisionName/sectionName/departmentName`) consumed by both the View sections and the pre-save preview, with safe "—" rendering for anything missing.
- `ProductionEntry`, `MachineTargetLite` — light shapes for the production data fetched from `GET /production/entries` and `GET /production/machine-targets` (confirmed real endpoints; narrow `item/shift` projections).
- `VIEW_SECTIONS` (5 tab definitions), `detailToModel()`, `extractApiError()`, and `badge()` — null-safe wrapper around `StatusBadge` that renders "—" instead of crashing on `status.charAt(0)` when status is still null (preview) or absent.

**Part A — View modal:**
- The stacked one-page section list was replaced by a horizontal, scrollable `Segmented` control (block, small, 5 options) plus a section switch. The four static sections are rendered by a shared `MachineSection` component so View and Preview are pixel-identical.
- `Production / History` fetches on tab activation (once per opened record) and renders:
  - **Machine Targets** — small table (Shift / Item / Target Qty / Std Hrs / Effective From/To) + "Open Machine Targets" link.
  - **Production History** — small table (Date / Shift / Item / Target / Actual / Achievement %) + "Open Daily Production Entry" link.
  - Loading spinners per table and friendly empty states; the modal body keeps its internal scroll so small viewports never overflow.
- Opening a record resets the active section to **Machine Identity**.

**Part B — Dual Add workspace:**
- Responsive window geometry (`vw` from the existing resize listener): desktop ≥1200 → `{x:-260,0}` / `{x:+260,0}`; tablet 768–1199 → `{x:-130,0}` / `{x:+150,0}`; mobile <768 → `{x:0,-70}` / `{x:+150}` (both title bars stay visible). Widths/heights adapt per breakpoint.
- Window 1 (`FormModal`) was switched from plain `<Modal>` to `<DraggableResizableModal>` (title "Add Machine" / "Edit Machine — code", subtitle "Form · …", responsive width/height/min-size/`initialOffset`, footer OK/Cancel with `confirmLoading`).
- Window 2 is a "Machine Details" `DraggableResizableModal` (subtitle "Pre-save preview", Close footer) opened only for **create** (`modalVisible && !editing && previewVisible`). It renders the four static `MachineSection`s from `previewModel`, which is rebuilt on every form keystroke through a `formTick` counter wired to the form's `onValuesChange`. Machine ID and Status render "—" (auto-generated) and a caption explains this. Closing the preview leaves the form open; Cancel closes both.
- `openEdit` explicitly hides the preview.

**Part C — Save Status popup:**
- Save was refactored into `buildPayload()` (date formatting only) + `submitMachine(payload)` (the state machine) + `handleSave()` (validate → submit; `saving` guard prevents double-submission) + `handleResultClose()` + `handleResultRetry()`.
- `submitMachine` opens the `SaveResultDialog` at `loading` ("Saving..."), performs the real `POST /machines` / `PATCH /machines/:id`, then flips to `success` (with the saved code/name) or `error` (persistent, with the normalized API message). The last payload is retained so **Retry** re-submits identical data.
- Success **OK** ("Successful Save") closes both windows, resets the form, and refreshes the list; error **Close** keeps the form open. The old `message.success` was removed (superseded by the dialog). The dialog is rendered at the component root next to the other modals.

## 3. Regression tests (CRA Jest)

- `MachineManagement.task21.test.tsx` — updated for section navigation: segmented options rendered; identity default; **Organization + Location / Technical Information / Dates + Description** tabs switch the visible data (location, serial, description).
- `MachineManagement.task22.test.tsx` — **new**, 24 tests in three groups:

| Group | Tests |
|---|---|
| **A — View modal sections** | 7 (identity default, 5 tabs present, org/tech/dates switch, production fetch + empty state, production renders real rows) |
| **B — Dual Add workspace** | 8 (two windows open, preview mirrors code, preview hidden on edit, auto-gen "—", Cancel closes both, Close preview keeps form, draggable class ×2, distinct subtitles) |
| **C — Save status popup** | 9 (loading spinner, success title, OK closes + refreshes, error + message, Retry button, Retry re-submits same payload, double-click guarded, validation blocks (no API call), edit success) |

Matcher notes: `Add Machine`/`Edit/View` buttons live in the header store (`PageHeader`), so the helper renders the toolbars via `useHeaderActions`; antd keeps closed modal content mounted but hidden, so close assertions use a visibility helper (`visibleModalTitles`) instead of DOM presence; `SAV-001` appears twice (title + record-code chip), matched with `getAllByText`.

Result — full Machine Management suite (20a + 21 + 22):

```
Test Suites: 3 passed, 3 total
Tests:       32 passed, 32 total
```

## 4. Browser verification

Custom Playwright matrix (`mm-task22-verify.js`) against the rebuilt production bundle (`main.f27b7876.js`) with the live mock API at `:3001` — single login reused across all contexts.

```
PASS: 33   FAIL: 0
```

Light / Desktop 1920:
- View modal: 5 section tabs; identity default; org / tech / dates / production tabs each render their content (production shows Machine Targets + Production History).
- Add workspace: both windows open; preview mirrors the typed code in real-time; distinct subtitles (Form vs Pre-save preview); closing the preview keeps the form open.
- Save: loading spinner → "Successful Save"; payload verified on the wire (`machineCode` + `name`); success OK closes both windows; list refreshed.
- No page/console errors.

Dark / Desktop 1920:
- `data-theme="dark"`; detail modal renders with the section nav; production section renders; dual workspace opens; no errors.

Responsive:
- 768 tablet and 390 mobile: no horizontal overflow; view modal fits the viewport with the internal scroll; 5 tabs still reachable; dual Add workspace still renders with the form accessible; no errors.

## 5. Build / type check / suites

- **Build:** `REACT_APP_API_URL=http://127.0.0.1:3001/api/v1 npm run build` → **PASS** (`main.f27b7876.js`).
- **TypeScript:** `npx tsc --noEmit` → only the pre-existing unrelated error `src/pages/__tests__/permission-gating.test.ts(1,38): Cannot find module 'vitest'`.
- **Machine Targets regression** `playwright-machine-targets.js`: **56 PASS / 0 FAIL**.
- **Final verification** `final-verification.js`: **27 PASS / 0 FAIL**.

## 6. Files changed

- `frontend/src/components/shared/DraggableResizableModal.tsx` — new `initialOffset` prop (clamped side-by-side placement).
- `frontend/src/components/shared/SaveResultDialog.tsx` — new `successTitle` / `okLabel` / `errorLead` props.
- `frontend/src/pages/master-data/MachineManagement.tsx` — types/helpers; section nav in the View modal; `MachineSection` shared renderer; Production/History fetch + tables; `FormModal` on `DraggableResizableModal`; W2 pre-save preview window; SaveResultDialog state machine + root render; `onValuesChange` form tick; responsive dual-window geometry.
- `frontend/src/pages/master-data/MachineManagement.task21.test.tsx` — updated for section navigation.
- `frontend/src/pages/master-data/MachineManagement.task22.test.tsx` — new 24-test regression suite.

No backend/API/DB changes. No commits made.

## 7. Unrelated pre-existing failures

- `permission-gating.test.ts` imports `vitest` (not installed) → `tsc` error; unrelated to this task.