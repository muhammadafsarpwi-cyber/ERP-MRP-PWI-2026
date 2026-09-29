# ERP Visitor Management — Prompt #19B Report

**Responsive QA (mobile / tablet / desktop) · Confirmed By UUID removal · Mobile print-preview letterhead**

| | |
|---|---|
| **Date** | 2026-09-29 |
| **Branch** | `main` |
| **Scope** | Visitor Management UI only — `frontend/src/pages/visitor/*`, `frontend/src/utils/visitorSlip*`, `backend/src/modules/visitor/**` |
| **Database changes** | **None.** #19B is a display-layer change. No migration, no entity change, no seed change. |
| **A4 print pipeline** | **Untouched.** `SLIP_CSS` / `renderVisitorSlipHtml` were not modified by #19B. |
| **Prompt #20** | Not started. |
| **Commit / push** | **Nothing committed or pushed.** Stopped as instructed (§10). |

---

## 1. Executive summary

Prompt #19B asked for three things. All three are done and measured.

1. **Responsive on all three form factors.** The page was audited at 390×844, 768×1024 and 1366×768, plus three deliberately awkward sizes. The audit found **one real defect** that the brief's own §2 hints at but does not name: **antd's Modal was pushing its own footer below the fold on ordinary laptop screens.** Fixed. The rest of the page already adapted correctly; it now has tests and a browser harness proving it rather than an assumption.

2. **Confirmed By UUID removed.** The backend already resolved every acting user to a display name — but only for the *printed slip*. The *detail screen* was never given those names and fell back to the raw `created_by` / `host_confirmed_by` / `exited_by` columns. Both ends are now fixed: the detail payload carries resolved `*Name` fields, and the UI has a guard that cannot print an identifier even if one is handed to it.

3. **Mobile print-preview letterhead.** Root cause found: the preview was showing a *reflowed* document, not the printed one. The fix is to pin the slip to its real A4 width and scale the whole page down — so the preview is now byte-identical in layout to the printed A4 at every viewport, and the letterhead is one line everywhere.

**Verification totals:** 562 automated browser checks + 98 frontend unit tests + 209 backend unit tests, all passing. Full detail in §7.

---

## 2. What changed, and why

### 2.1 The real responsive defect: dialog footers below the fold (§1, §2, §3)

This was the substantive find. It is not a styling nit — it made dialogs unusable.

antd caps a Modal at `100vh` but positions it at `top: 100px`. A dialog whose body is longer than `100vh - 100px` therefore reaches the cap and pushes its **own footer** off the bottom of the screen. Measured before the fix:

| Viewport | Symptom |
|---|---|
| 1366×768 (an ordinary laptop) | Visitor Detail footer sat at y **792–824**; viewport is 768. Print Slip / Confirm Host / Time Out unreachable. |
| 1366×664 | Visitor Detail footer off-screen **and** the New Visitor dialog's **Register Visitor** button off-screen. |

The New Visitor form failing at 1366×664 is the sharpest illustration: at 13" / 720p with browser chrome open — a completely normal condition — you could not register a visitor.

**Fix** — one shared constant, applied to all six visitor dialogs:

```ts
// VisitorManagement.tsx
const MODAL_BODY_STYLE: React.CSSProperties = {
  maxHeight: 'calc(100vh - 220px)',
  overflowY: 'auto',
};
```

The body already scrolls, so this changes only *where* the scroll happens. Dialog content, order, and styling are untouched. The 220px reserve covers antd's own chrome (100px top offset, ~44px modal padding, ~24px title, ~32px footer) plus slack. It is verified, not assumed — see §7.

Also in this area:

- **Detail modal columns** made responsive: `Col span={10}/span={14}` → `xs={24} md={10}` / `xs={24} md={14}`, so photo and record stack instead of squeezing on a phone.
- **Slip-preview modal** got the equivalent cap. Its document canvas already had a `58vh` limit; the cap stops the *notices above it* from pushing Print off a short screen.
- **`Card bodyStyle` → `styles={{ body }}`** in `VisitorManagement.tsx`. antd 5 deprecated the old prop; this was pre-existing and is a one-line fix in a file already in scope.

### 2.2 UUID cleanup (§6)

**Backend** — `visitor-entry.service.ts`

`toDetailView()` is now `async` and calls a new `resolveDetailActorNames()`, which reuses the *same* `resolveActorNames()` batch helper the printed slip already used. The result: one way in this module to turn a user id into a display name, and one fallback constant.

Added to the detail payload, beside the ids that were already there:

| Field | Replaces on screen |
|---|---|
| `createdByName` | raw `createdBy` |
| `hostConfirmedByName` | raw `hostConfirmedBy` |
| `exitedByName` | raw `exitedBy` |
| `signatureCapturedByName` | raw `signatureCapturedBy` |
| `updatedByName` | raw `updatedBy` |

The `*By` **ids are deliberately kept** — they are legitimate relational keys and the audit trail needs them. What changed is that the UI is no longer handed a choice between a person and an id.

`resolveDetailActorNames()` is best-effort by design: a deleted user, or a repository failure, degrades to `SLIP_ACTOR_FALLBACK_NAME`. A name lookup must never be able to block someone printing a departure slip or closing a visit.

`toDetailView()` had exactly 4 call sites (`checkOut`, `findOne`, `savePhoto`, `confirmHostVisit`) — all already inside `async` methods, so making it async breaks nothing. The module's 209 tests confirm this.

**Frontend** — `VisitorManagement.tsx`

```ts
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function actorName(name?: string | null, id?: string | null): string {
  const candidate = (name ?? '').trim();
  if (candidate && !UUID_SHAPE.test(candidate)) return candidate;
  return (id ?? '').trim() ? SLIP_ACTOR_FALLBACK : '—';
}
```

Three states, because they mean different things and collapsing them would be a lie:

| Screen state | Shown | Means |
|---|---|---|
| name present, not a UUID | `Gate Officer` | the person |
| no name, id present (or name is itself a UUID) | `System User` | somebody acted, directory could not name them |
| neither | `—` | **the action has not happened yet** |

That third row matters: a visit that has not been host-confirmed has *no* confirming party, and dressing that up as "System User" would invent an actor.

`SLIP_ACTOR_FALLBACK` is imported from `visitorSlipHtml` — not hardcoded, so the screen and the paper can never disagree about the fallback string.

Also stripped the remaining raw-id fallbacks: `divisionId` / `locationId` in table cells, in the detail Descriptions, and in the register print job. All now render `—`. These are relations, not actors, but their ids are UUIDs too and a record with a missing relation used to print one.

Two `bodyStyle`→`styles.body` deprecations remain at `DepartmentManagement.tsx:668` and `LocationManagement.tsx:539` — different modules, out of scope, left alone. See §11.

### 2.3 Mobile print-preview letterhead (§4, §5)

**Root cause.** `.visitor-slip` in `SLIP_CSS` has `max-width: 190mm` and **no `width`** — so it is a fluid block. In the print frame the space given to it is the A4 content box, and the document is correct. In a ~334px phone modal it is a 334px column, and the header grid `auto minmax(0,1fr) auto` hands the company name a ~100px middle track. The letterhead broke into:

```
PAKIS / TAN / WIRE / INDUS / TRIES / (PVT.) / LTD.
```

**The print pipeline was never wrong.** The preview was showing a *reflowed* document, which is both ugly and dishonest — it is not the page that prints.

**Fix: pin + scale, never reflow.**

```css
/* visitorSlipPreview.css — NEW file, preview-only */
.vs-preview-doc {
  width: 190mm;                                   /* the real A4 content width */
  max-width: none;
  transform: scale(var(--vs-preview-scale, 1));
  transform-origin: top left;
}
```

Three deliberate choices:

- **A new CSS file, not `SLIP_CSS`.** The print job is rendered into a *separate document* by `printHtmlContent()` carrying only the slip's own stylesheet. Preview rules placed outside `SLIP_CSS` cannot reach A4 output **by construction**, not by a media query that might one day be deleted. There is also an `@media print` guard in the preview file that neutralises itself if the preview markup is ever printed by accident.
- **Measurement via `offsetWidth`/`offsetHeight`, not `getBoundingClientRect()`.** A CSS transform leaves offset dimensions untouched, so the fit cannot feed back on itself. `getBoundingClientRect()` returns already-scaled values and the scale would oscillate.
- **`transform: scale()` rather than CSS `zoom`.** `zoom` is non-standard and untestable in jsdom.

`fitSlipToWidth(naturalWidth, naturalHeight, availableWidth) → {scale, width, height, scrolls}` lives in `frontend/src/utils/visitorSlipFit.ts` as a pure function, so it can be asserted directly including the degenerate inputs a first paint or jsdom produce. The frame's width and height are written from the measured fit, so the modal never reserves paper it is not showing.

**A subtlety worth recording.** A transform leaves the document's *layout* box at the full 718px. A permanently-`auto` frame would therefore report itself horizontally scrollable and draw a scrollbar over a preview that visually fits. So `overflow-x` is written inline: `auto` only when the fit floor actually bites, `hidden` otherwise. The browser harness asserts no phantom scrollbar at every viewport.

**Measured result** (190mm = 718px; 96/25.4 = 3.7795 px/mm):

| Viewport | Stage | Scale | Frame | Letterhead |
|---|---|---|---|---|
| 390×844 | 302px | 0.4209 | scaled | **1 line box** |
| 768×1024 | — | 0.9471 | scaled | **1 line box** |
| 1366×768 | 788px | 1.0000 | 718×667 | **1 line box** |

Desktop shows the document at 1:1 — exactly what the printer produces. `MIN_SLIP_PREVIEW_SCALE = 0.34` is a readability floor: below roughly a third the letterhead stops being legible, so rather than shrink further the frame scrolls internally. In practice this only engages below a ~250px viewport; at 390px the fit lands near 0.42 and nothing scrolls. See §11.

---

## 3. Files changed

### Backend

| File | Change | Lines |
|---|---|---|
| `backend/src/modules/visitor/services/visitor-entry.service.ts` | `resolveDetailActorNames()` added; `toDetailView()` → `async`; 5 `*Name` fields on the detail payload | +119 / −? |
| `backend/src/modules/visitor/services/visitor-entry.service.spec.ts` | Actor-name tests for the new fields | +77 |
| `backend/src/modules/visitor/visitor.module.ts` | `ErpUser` repository injection | +7 |

### Frontend

| File | Change |
|---|---|
| `frontend/src/pages/visitor/VisitorManagement.tsx` | `actorName()` guard; `MODAL_BODY_STYLE` on 5 dialogs; responsive detail `Col`s; `*Name` fields on `VisitorRow`; UUID fallbacks → `—`; `Card styles.body` |
| `frontend/src/pages/visitor/VisitorSlipPreview.tsx` | Fit scaffold (stage/frame/doc) + `useLayoutEffect` + `ResizeObserver`; modal body cap |
| `frontend/src/pages/visitor/visitorSlipPreview.css` | **NEW** — preview-only `.vs-preview-stage/frame/doc` + `@media print` guard |
| `frontend/src/utils/visitorSlipFit.ts` | **NEW** — `fitSlipToWidth()`, `MIN_SLIP_PREVIEW_SCALE`, `SlipFit` |
| `frontend/src/utils/visitorSlipFit.test.ts` | **NEW** — 11 cases |
| `frontend/src/pages/visitor/VisitorManagement.test.tsx` | +6 tests; fixtures updated for `*Name`; test-hook contract restored (see §6) |

### Verification

| File | Purpose |
|---|---|
| `scratch/verify-visitor-p19b-responsive.js` | **Primary evidence.** 153 checks across 6 viewport sizes |
| `scratch/verify-visitor-p19b-responsive-artifacts/` | `slip-print-document.html`, `visitor-slip.pdf` (1 page) |

Throwaway probe scripts used during the work were deleted.

**Unrelated dirty files left untouched:** `backend/src/modules/sales/dto/sales-analytics.dto.ts`, `frontend/public/logo.png`, `frontend/public/logo-mark.png`, `frontend/src/theme/theme.css`, `scripts/.erp-dev-pids.json`, assorted `scratch/*`.

---

## 4. Mobile behaviour (390×844 and 390×667)

**No page-level horizontal scroll at any point.** The app's own viewport lock stays untouched; all overflow is contained.

| Surface | Behaviour at 390px |
|---|---|
| **KPI cards** | 1 per row (`xs={24}`), full width, no clipping |
| **Filter bar** | Stacks; every control reachable and tappable |
| **Visitor table** | Scrolls **inside** `.erp-table-wrap`; page stays still |
| **Pending / Completed tabs** | Both reachable; keyboard/tap target ≥ 32px measured via `elementFromPoint` |
| **Pagination** | Fits, no clipped control |
| **New Visitor dialog** | Fits horizontally and vertically; **Register** and **Cancel** both reachable at 390×667 |
| **Visitor Detail dialog** | Photo and record **stack** (`xs={24}`); footer actions inside the viewport at 390×667 |
| **Time-Out dialog** | Fits; Record / Cancel reachable |
| **Host Confirmation dialog** | Fits; signature pad usable; Confirm / Cancel reachable |
| **Print Slip preview** | Document scaled to 0.4209, **letterhead on one line**, no page-level overflow, Cancel + Print reachable |
| **Detail actor names** | Confirmed By / Created By / Exit Recorded By show names; **no UUID anywhere in the dialog** |

## 5. Tablet behaviour (768×1024)

Natural adaptation, no bespoke rules:

- KPI cards 2×2 (`sm={12}`).
- Table scrolls internally as at mobile; no column forces the page wider.
- Detail dialog photo and record sit **side by side** again (`md` breakpoint).
- Print preview scales to 0.9471 — near 1:1, letterhead one line, no page-level overflow.
- All filters, Detail, Time-Out and Host Confirmation usable.

## 6. Desktop / laptop behaviour (1366×768, and 1366×664)

- Full 4-across KPI row, full table, no internal scroll needed.
- Print preview at **scale 1.0000**, frame 718×667 — the document is shown at exactly its printed size.
- Detail modal side-by-side layout.
- **The defect case, now fixed:** at 1366×768 and 1366×664 every dialog's footer sits inside the viewport and every action is hit-testable. Before the fix these were the failing cases.

### Test-hook contract restored (found during this work)

The working tree contained an uncommitted Visitor Management **UI redesign** (KPI cards, status pills, two-line Time-Out cell, icon-only action buttons). It had silently dropped several `data-testid` hooks and one accessible name that the existing test suite depends on, leaving **12 of the existing tests red** at the start of this session — confirmed by stashing the working tree and re-running against `HEAD` (41/41 green).

This is pre-existing damage, not something #19B introduced. I fixed it because §9 makes "relevant frontend tests" a gate and it would be wrong to report green while adding tests to a file with 12 red ones. The fixes restore the *contract*, not the old styling:

- `StatusBadge` / `HostConfirmBadge` take an optional `testId`; the redesigned components keep their look.
- The icon-only View button gained `aria-label="View Details"` — an accessibility improvement in its own right, since an icon-only control previously had **no accessible name at all**.
- **Real bug found and fixed:** the redesigned Time-Out cell formatted its own `DD-MMM-YY` and **silently dropped the century** on an audit record. Both lines now derive from the shared `formatDateTime` (`DD-MMM-YYYY HH:mm`), so the compact layout cannot drift from the ERP's canonical timestamp again.
- The Time-Out `—` branch regained its `data-testid`, which the redesign had also dropped.
- One test's division/location assertion was updated to check code *and* name separately, matching the new two-line cell. This is a layout-agnostic assertion, not a weakened one.

---

## 7. Verification — what was actually executed

Every row below was run. Nothing is reported as PASS that was not run.

### 7.1 Automated browser checks (Playwright + vendored Chromium)

`tools.browser.*` is not attached to this session, so Playwright with the vendored Chromium is the stated substitution.

| Harness | Result | What it covers |
|---|---|---|
| `verify-visitor-p19b-responsive.js` | **153 / 153 PASS** | 390×844, 768×1024, 1366×768 per-viewport: page overflow, element offenders, KPI cards, filters, table internal scroll, action hit-testing via `elementFromPoint`, tabs, pagination, detail modal, §6 names + no-UUID, print preview, Time-Out, Host Confirmation. Plus short-screen dialog fit at 1366×664 / 1366×768 / 390×667, and 14 A4 print-integrity checks. |
| `verify-visitor-p19a-ui.js` | **54 / 54 PASS** | #19A slip geometry, header alignment, signature blanks, one-page fit |
| `verify-visitor-p19a-api.js` | **225 / 225 PASS** | Slip payload across 45 slips; actor resolution |
| `verify-visitor-p19-ui.js` | **130 / 130 PASS** | #19 end-to-end UI regression |

**Total: 562 browser checks, 0 failures.**

The #19B harness re-ran **after** every markup change, including the final state — the 153/153 above is the final code.

### 7.2 Unit tests

| Suite | Command | Result |
|---|---|---|
| Frontend visitor | `npx react-scripts test --testPathPattern "(pages/visitor\|utils/visitorSlip)"` | **98 / 98 PASS**, 3 suites |
| Backend visitor | `npx jest src/modules/visitor` | **209 / 209 PASS**, 5 suites |

### 7.3 Typecheck, lint, build

| Gate | Command | Result |
|---|---|---|
| Backend typecheck | `npx tsc --noEmit` | **PASS** (exit 0) |
| Frontend typecheck | `npx tsc --noEmit` | **PASS** (exit 0) |
| Backend ESLint (scoped) | `npx eslint <3 changed files>` | **PASS** (exit 0) |
| Frontend ESLint (scoped) | `npx eslint --max-warnings=0 <7 changed files>` | **PASS** (exit 0) |
| Production build | `npm run build` | **PASS** (exit 0) |

ESLint was run **scoped to changed files**, not whole-repo: whole-repo lint and whole-repo Jest both OOM on this 16 GB machine. That is a pre-existing environment limit and is reported as **NOT RUN** in §11, never as a pass.

### 7.4 A4 print integrity — unchanged

Six independent checks confirm #19B did not touch printed output:

1. The print path still runs through the shared `printHtmlContent` pipeline.
2. The print document declares A4 portrait.
3. The print document contains **none** of the `vs-preview-*` wrappers.
4. The print document applies **no** `transform: scale`.
5. `max-width: 190mm` preserved, with **no** hard `width: 190mm` added.
6. The header grid `auto minmax(0,1fr) auto` is intact.

Measured: the slip still prints on **exactly one page**; the printed letterhead is **one line box**; the printed document is **not scaled**; the printed `transform` is `none`; the printed document does not overflow the A4 content box (718×1062px, widest element right edge 714px); the physical Host Signature blank is intact. All #19A alignment deltas — row 1, row 2, logo-vs-content-box — are **≤ 0.5px**. A regenerated PDF is 1 page.

### 7.5 Live API

Backend rebuilt and restarted on :3001. Live response for a completed, host-confirmed visit returns `createdByName`, `hostConfirmedByName`, `exitedByName`, `signatureCapturedByName` — all resolving to real display names with no UUID.

---

## 8. What was explicitly NOT changed (§8)

Confirmed untouched:

- Stored timestamps, and AM/PM backend data. The 12-hour clock is a **print-layer** decision; the ERP screen keeps its 24-hour `formatDateTime`. Time-Out now derives from that same helper rather than a private format string.
- Visitor reference generation.
- Permissions, division access scoping.
- Host-confirmation concurrency logic.
- Photo and signature security — the private-storage-path rule and authenticated endpoints are unchanged; the preview still inlines images as data URLs with the session.
- The A4 print pipeline. `SLIP_CSS` and `renderVisitorSlipHtml` were **not modified by #19B**.
- #19 database behaviour.
- No database change for #19A or #19B.

---

## 9. Requirement-by-requirement

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Responsive list, form, detail, filters, Pending/Completed, Time-Out, Host Confirmation, Print Slip, Detail modal, Print Preview, KPI cards. Overflow inside the container, never page-level. No unnecessary redesign. | **Done** | 153/153 harness; detail `Col`s made responsive; shared `erp-table.css` reused rather than page-specific rules |
| 2 | Mobile QA at real viewport — no page-level scroll, buttons accessible, table usable, modal content fits, actions/close/cancel/print reachable, filters + Detail + Time-Out + Host Confirmation usable | **Done** | 390×844 and 390×667 in the harness, with `elementFromPoint` hit-testing |
| 3 | Tablet/laptop QA at 768 and 1366 | **Done** | 768×1024, 1366×768, plus 1366×664 |
| 4 | A4 output stays a fixed professional A4 document; desktop preview comfortable; mobile preview scaled/fitted, readable, no page-level overflow; A4 HTML not broken at narrow widths | **Done** | 14 print-integrity checks + 3-viewport letterhead measurement |
| 5 | Improve mobile preview presentation without compromising A4; preview-only scaling acceptable | **Done** | Pin-and-scale in a **separate** CSS file, so A4 cannot be reached by construction |
| 6 | UUID cleanup via existing `confirmedByName` / `createdByName` / `signatureCapturedByName`; no hardcoding; `System User` fallback; no raw UUIDs; search `created_by`, `confirmed_by`, `exited_by`, `signature_captured_by` | **Done** | Backend batch resolver + frontend `UUID_SHAPE` guard; source search shows the only remaining `*Id` uses are **request payloads** and test fixtures, never display; 0 raw-id fallbacks left in the visitor screens |
| 7 | Verify at ~390 / ~768 / ~1366 — list, detail, print preview, host confirmation, Time-Out; no page-level overflow; desktop preview correct | **Done** | All three viewports covered per-surface |
| 8 | Do not change timestamps, AM/PM, reference generation, permissions, division access, concurrency, photo/signature security, print pipeline, #19 DB behaviour | **Done** | §8 |
| 9 | Gates: typecheck, scoped ESLint, relevant frontend tests, relevant backend tests, production build, browser verification. Report covering 11 items. Never claim PASS for a check not run. | **Done** | §7 and §11; NOT RUN items are named as such |
| 10 | **STOP after reporting. Do not commit or push.** | **Done** | Nothing committed, nothing pushed. `main` remains 3 commits ahead of `origin/main` from #17/#18/#19, with #19A and #19B uncommitted in the working tree |

---

## 10. Risk assessment

| Change | Risk | Why |
|---|---|---|
| `toDetailView()` → `async` | **Low** | 4 call sites, all already in `async` methods. 209 backend tests pass. |
| `ErpUser` repository injection | **Low** | Additive constructor param. Module compiles and all its tests pass. |
| `resolveDetailActorNames()` best-effort | **Low, by design** | Cannot widen access — the row was already authorised by `findRow` before this runs. Can only narrow what is displayed. |
| `transform: scale()` on the preview | **Low** | Scoped to `.vs-preview-doc`, which exists only in the modal. Verified absent from the print document. |
| `MODAL_BODY_STYLE` on 6 dialogs | **Low** | Only relocates an existing scroll. Measured at 6 viewport sizes. |
| `testId` props on the two badges | **Very low** | Additive optional prop, no visual effect. |
| View button `aria-label` | **Very low** | Adds an accessible name that was missing. |
| Time-Out cell → shared `formatDateTime` | **Very low** | Restores the century; makes display consistent with the rest of the ERP |

No database, schema, permission or concurrency risk in this change set.

---

## 11. Remaining limitations and NOT-RUN items

Stated plainly, because §9 forbids claiming a PASS for a check that was not executed.

**NOT RUN (environment limits, pre-existing):**

- **Whole-repo backend ESLint** — OOM on this 16 GB machine. Scoped lint on all changed backend files **did** run and passed.
- **Whole-repo frontend Jest** — OOM on this 16 GB machine. Scoped Jest across all visitor suites **did** run and passed (98/98).
- Neither of these is a pass. Both remain unverified and were already unverified before this work.

**Known limitations of the delivered change:**

1. **Preview readability floor.** `MIN_SLIP_PREVIEW_SCALE = 0.34`. Below roughly a 250px viewport the preview stops shrinking and the frame scrolls **horizontally inside the modal** — the same pattern the ERP table uses, never page-level. This is a deliberate trade: an illegible letterhead is worse than a scroll. It does not engage at 390px (fit ≈ 0.42).
2. **Visual quality verified numerically, not by eye.** I cannot view images. Typographic and layout quality is asserted through bounding boxes, line-box counts, page counts and overflow measurements — not by looking. A human should still eyeball the mobile preview once.
3. **Two `bodyStyle` deprecations remain** at `DepartmentManagement.tsx:668` and `LocationManagement.tsx:539`. antd 5 deprecates the prop; they still work. Different modules, out of scope, left alone. One-line fixes if wanted.
4. **A raw-id fallback exists in a different visitor page:** `VisitorLocationManagement.tsx:165` renders `row.division ? code · name : row.divisionId`. It is the same class of issue as §6, but it is a different screen from the four actor fields §6 named, so I did not change it. Flagging rather than silently widening scope.
5. **The pre-existing redesign is uncommitted and unreviewed.** The 12 broken tests it caused are now fixed, but the redesign itself — KPI cards, status pills, table restyle — is not something #19B was asked to assess. It is in the working tree, not in `HEAD`.
6. **Ant Design's "circular references" console warning** is pre-existing library noise (an `rc-util isEqual` false positive on an empty array). It reproduces on the committed #18 build and is filtered in the harness. No runtime effect.
7. **Frontend build warnings** are pre-existing and live in modules untouched by this work.
8. **Bundle size warning** from CRA is pre-existing and unrelated.

---

## 12. Next step — awaiting your decision

Per §10, **nothing has been committed or pushed.** The working tree currently holds #19A **and** #19B together, uncommitted.

If you want them committed, the natural split is two commits (#19A, then #19B) so the slip work and the responsive/UUID work can be reviewed independently. The untracked `scratch/verify-visitor-p19*.js` harnesses are the reproducible evidence for both — I recommend including them, since they are what backs the 562 passing checks in §7.1.

Tell me what you want committed and I will do it. **I will not push** unless you ask separately.
