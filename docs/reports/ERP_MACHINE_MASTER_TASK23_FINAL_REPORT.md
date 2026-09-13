# ERP Machine Master — TASK23 Final Report

**Title:** Machine Master — Add Workspace Layout Correction + Clean Detail/Form Pattern

**Status:** Complete — implemented, regression-protected (16 new jest tests; full Machine Management suite 48 passed), built, browser-verified (light/dark, 1920/768/390, drag/resize, single Save, live preview — 37 checkpoints, 0 failures).

---

## 1. Scope

Clean up and correct the Machine Master page (`/master-data/machines`, `frontend/src/pages/master-data/MachineManagement.tsx`) around the dual-window Add workspace and the detail rendering philosophy, reusing existing shared components only:

- **Dual-window Add workspace kept from TASK22 but corrected:** opening **Add Machine** shows two windows — Window 1 = the Add Machine form, Window 2 = the **Machine Details** live preview — but there is now **exactly ONE Save button** in the whole workflow, and it is owned by the form. Window 2 offers no Save/Submit/Create action, only Close.
- **Clean Detail/Form pattern:** every detail block (pre-save preview + View modal sections) now uses compact **Label → Value** rows (`label 12px/600 muted / value 13px/500`), no per-field cards, no oversized badges, no repeated headings. Badges remain only for **Status** (`StatusBadge`) and **Criticality**. Empty values always render as "—", never `undefined`/`null`/`NaN`.
- **Live preview:** every keystroke/select in the form updates the preview window immediately; **Machine ID and Status** are shown as "—" because they are generated on save (caption explains this).
- Preserved unchanged: View modal `Segmented` section navigation (including **Production / History**), header actions (Refresh/Export/Import/PDF/Print/Clear/Add Machine), row actions (View/Edit/QR/Print/Status/Delete), edit-mode layout (Edit opens only Window 1), and the professional Save Status popup flow (loading → "Successful Save" → OK closes + refreshes; error → persistent message + Retry re-submits the exact payload; `saving` guard prevents double submission).
- Typography per the requirement: detail title 16–18px semibold, labels 11–12px semibold muted with a fixed 104px label column, values 12–14px semibold; responsive layouts degrade to single-column grids on small screens.

Constraints honored: **no backend/API/DB changes, no commits.**

## 2. Implementation

### 2.1 Machine Management (`MachineManagement.tsx`)

**New presentational components (module scope):**
- `DetailRow` — a grid row `104px 1fr`, gap 16, aligned baseline; label column `12px/600 var(--theme-text-muted)`, white-space nowrap with ellipsis; value column `13px/500 var(--theme-text)`, `min-width: 0`, `overflow-wrap: anywhere` (long serials/remarks wrap safely).
- `DetailBlock` — optional title + a `repeat(auto-fit, minmax(230px, 1fr))` grid of rows; used by the preview and by the View sections so both are pixel-identical.
- `FormGroup` — form group shell on the same visual language: `12px/600` group title with a `var(--theme-accent)` 3px accent bar, body grid `repeat(auto-fit, minmax(170px, 1fr))`.

**MachineSection rewrite:**
- Was `Descriptions bordered` per field-card — now a `DetailBlock` of `DetailRow`s, one row per field (`Machine Code`, `Machine Name`, `Machine Type`, Manufacturer/Model/Serial, Location, Capacity/Power, Criticality/Status, Dates, Description).
- New `showTitle?: boolean` prop — the **View modal** passes `false` (the section name is already shown by the `Segmented` control, so the heading is not repeated inside the body); the **preview** passes `true` and uses the `VIEW_SECTIONS` labels as block titles. This preserves the task21/task22 expectations (View body contains a single "Machine Identity" instance) while giving the preview distinct section headings.

**Dual-window corrections:**
- `FormModal` was restructured from six `Card` groups to six `FormGroup` groups (Machine Identity, Organization, Location & Classification, Technical Information, Dates, Additional) — same fields, same `Select` wiring, cleaner shell, no cards.
- The form footer OK text is now **Save** (create) / **Save Changes** (edit) instead of "Create Machine". Window 2 keeps `footer={[Close]}` only, so the browser/Jest checks confirm there is exactly one Save button across both windows.
- The Add Machine window subtitle no longer reads "…live Machine Details preview shown alongside" (that phrase leaked the words *Machine Details* into the title text and broke modal targeting) — it now reads "Form · live preview window opens alongside". The preview window title remains "Machine Details" with subtitle **"Pre-save preview"**.
- Empty-safe rendering: every field falls back to a shared `EMPTY` = "—" constant (antd `Text type="secondary"`), never `undefined`/`null`/`NaN` strings.

### 2.2 Shared component fix — `draggableResizableModal.css`

Found during browser verification: two `DraggableResizableModal` windows stacked as full-viewport `antd` wraps at the same z-index, so the later wrap (the preview) silently intercepted every pointer event over the form — meaning a real user could not focus/click the form (including the single **Save**) while the preview was open. Fix:
- `.erp-draggable-modal-wrap` and its mask are now `pointer-events: none` (pass-through), while the draggable window box (`.erp-draggable-modal` + its `.ant-modal`) re-enables `pointer-events: auto`.
- Result: both windows accept input simultaneously, form fields/Select/Save and the preview's Close/drag/resize all work while both are open — verified in the matrix by clicking **Save** with the preview window open (no preview close required).

This is a genuine interaction bug that the jsdom tests cannot catch (no hit-testing), found and fixed via the browser matrix.

## 3. Regression tests (CRA Jest)

- `MachineManagement.task22.test.tsx` — updated create-mode button matchers from `/Create Machine/` to `/^Save$/` (tests 16–23) to match the corrected footer label.
- `MachineManagement.task23.test.tsx` — **new**, 16 tests, numbered to the 16 required checkpoints:
  1. Add Machine opens both windows with distinct titles (Add Machine / Machine Details).
  2. exactly one Save button exists in the whole workflow.
  3. Machine Details window contains no Save/Submit/Create button; footer only closes.
  4. form input updates the preview immediately (live preview, typed name + code).
  5. Select fields update the preview immediately (Division → CCD).
  6. empty values render safely ("—", never undefined/null/NaN text).
  7. detail fields use the Label→Value row layout (`.erp-detail-row`, exactly 2 children per row).
  8. no repeated field headings in the preview (each of Machine Name/Machine Code appears once).
  9. no per-field cards in the preview (`.ant-card` count = 0) while rows render.
  10. View modal retains the 5-tab Segmented navigation.
  11. View sections render clean label/value details (no per-field cards).
  12. Save Status popup still appears after clicking the single Save.
  13. success state works (OK closes both windows and refreshes the list).
  14. error state works (persistent message, Retry re-submits).
  15. existing header actions remain available.
  16. existing row actions remain functional (View opens with section nav).

Result — full Machine Management suite (20a + 21 + 22 + 23):

```
Test Suites: 4 passed, 4 total
Tests:       48 passed, 48 total
```

## 4. Browser verification

Custom Playwright matrix (`mm-task23-verify.js`) against the rebuilt production bundle (`main.4d10c6af.js`) with the live mock API at `:3001` — single login reused, real save performed on the wire.

```
PASS: 37   FAIL: 0   INFO: 0
```

Light / Desktop 1920:
- View modal: 5 Segmented tabs incl. Production/History; identity section renders 6 Label→Value rows; **zero** `.ant-card` in the view sections.
- Add workspace: both windows open; **exactly one** Save button; the Machine Details window has no Save/Submit/Create and its footer only closes; preview renders 23 Label→Value rows, zero cards, "—" empty values, no undefined/null/NaN, and each of Machine Name/Code appears exactly once (no repeat headings).
- Live preview: typing code + name reflects in the preview with no other interaction.
- Save (with the preview window still open): the single Save is clickable (pointer fix), loading spinner → **"Successful Save"**, payload verified on the wire (`machineCode`), success OK closes both windows, list refreshes.
- Drag (header) and resize (bottom-right handle) both move/scale the preview window.
- No page/console errors.

Dark / Desktop 1920:
- `data-theme="dark"`; view modal renders with section nav; dual workspace opens; exactly one Save; preview uses Label→Value rows; no errors.

Responsive:
- 768 tablet and 390 mobile: no page overflow; dual workspace renders; exactly one Save; no errors.

## 5. Build / type check / suites

- **Build:** `REACT_APP_API_URL=http://127.0.0.1:3001/api/v1 npm run build` → **PASS** (`main.4d10c6af.js` served at `:3000`).
- **TypeScript:** `npx tsc --noEmit` → only the pre-existing unrelated error `src/pages/__tests__/permission-gating.test.ts(1,38): Cannot find module 'vitest'`.
- **Machine Targets regression** `playwright-machine-targets.js`: **56 PASS / 0 FAIL**.
- **Final verification** `final-verification.js`: **PASS 25 / FAIL 0**.

## 6. Files changed

- `frontend/src/pages/master-data/MachineManagement.tsx` — `DetailRow` / `DetailBlock` / `FormGroup` components; `MachineSection` rewritten to Label→Value rows (added `showTitle`); preview body switched to four titled `DetailBlock`s + caption; `FormModal` Card groups → `FormGroup`; footer label Save / Save Changes; subtitle reworded (removes leaked "Machine Details" phrase); `EMPTY` "—" fallbacks.
- `frontend/src/components/shared/draggableResizableModal.css` — pass-through modal wraps + auto pointer-events on the draggable window boxes (dual-window click fix).
- `frontend/src/pages/master-data/MachineManagement.task22.test.tsx` — button matchers updated to `/^Save$/`.
- `frontend/src/pages/master-data/MachineManagement.task23.test.tsx` — new 16-checkpoint regression suite.

No backend/API/DB changes. No commits made.

## 7. Unrelated pre-existing failures

- `permission-gating.test.ts` imports `vitest` (not installed) → `tsc` error; unrelated to this task.