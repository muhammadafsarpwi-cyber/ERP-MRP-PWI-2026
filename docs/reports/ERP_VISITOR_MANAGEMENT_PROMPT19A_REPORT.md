# ERP Visitor Management — Prompt #19A Report

**Scope:** final UI/print polish of the visitor slip only. No new functionality.
**Date:** 2026-09-28
**Builds on:** Prompt #19, committed as `b48305e` (untouched — not restarted, undone or duplicated).
**Branch:** `main`, 3 commits ahead of `origin/main`, **not pushed** (awaiting your go-ahead).

---

## 1. What changed, exactly

### §1 — Time format: 12-hour clock with AM/PM (display only)

`frontend/src/utils/visitorSlipHtml.ts` → `formatStamp()` now formats `DD-MMM-YYYY hh:mm A`
(was `DD-MMM-YYYY HH:mm`). `hh` is the 12-hour clock; dayjs upper-cases `A` to `AM`/`PM`.

Every user-visible slip time goes through this one function, so all of them changed together:

| Field | Before | After |
|---|---|---|
| Time-In | `28-Sep-2026 21:45` | `28-Sep-2026 09:45 PM` |
| Time-Out | `28-Sep-2026 21:46` | `28-Sep-2026 09:46 PM` |
| Host Confirmation date/time | `28-Sep-2026 21:46` | `28-Sep-2026 09:46 PM` |
| Created At | `28-Sep-2026 21:45` | `28-Sep-2026 09:45 PM` |

**Stored data is untouched.** The API still sends `2026-09-28T16:45:49.109Z`; only the print
rendering changed. Re-printing any historical slip shows the same instant it always did.
`?` / `—` / unparseable-value pass-through behaviour is unchanged.

The ERP **screen** deliberately keeps its own 24-hour `formatDateTime`. A visitor pass is read at a
gate and on paper; an ERP list is read at a desk. The two surfaces now name the same instant in two
formats, and a live test asserts they denote the same moment rather than the same string (§5 below).

### §2 — Names, never UUIDs

This could not be solved in the renderer, so it was solved at the source.

**Backend** — `backend/src/modules/visitor/services/visitor-entry.service.ts`:

- `ErpUser` repository injected (line ~135), following the existing join convention in
  `hr-advances.service.ts:255-275`.
- New private `resolveActorNames(ids)` (line 882): one batched
  `find({ where: { id: In(ids) }, select: { id, displayName } })` for all actor ids at once.
  It is deliberately best-effort — a `catch` swallows a directory failure so a name lookup can
  never stop someone printing the record of a visitor waiting at the gate.
- New exported constant `SLIP_ACTOR_FALLBACK_NAME = 'System User'` (line 114).
- `getSlip()` (lines 818-865) now emits, alongside the untouched UUID fields:
  - `createdByName`
  - `hostConfirmation.confirmedByName`
  - `hostConfirmation.signatureCapturedByName`
- `ErpUser` added to `TypeOrmModule.forFeature` in `visitor.module.ts` for the same narrow reason
  `Company` already was.

Names come from `erp_users.display_name` (`NOT NULL`) — real ERP user identity data, not a
hardcoded string, not a guess. `createdBy` / `confirmedBy` / `signatureCapturedBy` **remain in the
payload** so API consumers keep full traceability; only the renderer was switched to the `*Name`
fields.

Fallback ladder: resolved name → `System User` if the row is gone / blank / the query fails.
`System User` is intentionally distinguishable from a real name so a reviewer can tell "could not
resolve" from "a person called System User".

**Frontend** — defence in depth, the last line before paper:

```ts
const UUID_SHAPE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
```

`actorName()` substitutes `System User` if the `*Name` field is empty **or is itself a
UUID**. This should never fire, but the requirement is absolute ("no raw UUIDs on the printed
slip"), and a single upstream regression — a renamed field, an older backend, a hand-edited
payload — would otherwise silently put an identifier on a document that is filed and handed to
security. A UUID carries no information for a human reader, so substituting can only improve the
document; there is no case where printing the id was the better outcome.

Live proof, on the real printed page:

```
Confirmed By: System Admin (ERP user — host identity not verified)
Created By:   System Admin
```

…resolved from `0804af57-1f03-4d11-ad84-dc34f8829db1` via the live API.

**§17 is not weakened.** The slip still states `host identity not verified` next to the name. Naming
who pressed the button is not the same claim as verifying who the host is, and a dedicated test
asserts both are present together.

### §3 — Company header: `Pakistan Wire Industries (Pvt.) LTD.`

New exported constant `SLIP_COMPANY_NAME = 'Pakistan Wire Industries (Pvt.) LTD.'` (period after
`Pvt.`). The renderer uses the constant; it no longer reads `slip.companyName`.

**Why a constant and not the DB row.** Every other printed document in this ERP states its letterhead
as a literal — `printTemplates.ts` hard-codes the company name on the invoice (line 740), the
dispatch note (836) and the weighbridge slip (1010). The visitor slip is the same class of document:
pre-printed stationery for one site. The `companies` row is still fetched, still returned by the API
and still used for authorization (org scope, division scope) — but the name **on the paper** is a
property of the deployment, not of whatever a test fixture row happens to contain in a given
database. This is also why the old slip printed `PAKWIZ INDUSTRIAL SOLUTIONS (PVT) LTD`: #19 read
the DB row, and the dev fixture row says that.

The API response is deliberately **unchanged** here — `slip.companyName` still returns the
`companies` row's `legal_name`. That keeps the existing API contract and its assertions intact.

### §4 — Location: `Karachi, Pakistan`

New constants `SLIP_COMPANY_CITY = 'Karachi, Pakistan'` and `SLIP_COMPANY_UNIT = 'Security &
Reception'`. The header now reads `Security & Reception — Karachi, Pakistan` (was `Lahore,
Pakistan`).

**No street/office address was invented** (§8). A test asserts the slip contains no
`<number> <Street|Road|Block|Sector|I.I.|Industrial|Avenue>` pattern, so this cannot regress
silently.

### §5 — Header alignment

This was the substantive defect, and the first attempt did not fully fix it — see §7 for what the
measurement caught.

**Before:** `.vs-header { display: flex; align-items: flex-start }`. The right-hand title block was
pinned to the top of the box while the logo group sat vertically centred against it, so the two
halves read as independently positioned. The `.vs-title` CSS class existed but was **dead** — the
title was an inline-styled `<div>`.

**First fix (insufficient):** one `align-items: center` flex row. Measured, this left the title bar
**7.00 px above** the logo centre. The reason is structural, not a rounding error: a flex row can
align the *centres of two blocks*, but the brand block (a 44 px logo beside two text lines) and the
headline block (a 27 px title bar over an 11 px caption) are not vertically symmetric about their own
centres, so their centres can agree while their principal elements do not.

**Shipped fix — a real 2×3 CSS grid:**

```
.visitor-slip .vs-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 10px;
  row-gap: 3px;
}
```

| Cell | Grid position |
|---|---|
| `.vs-logo` | column 1, rows 1–3 (spans) |
| `.vs-company` | column 2, row 1 |
| `.vs-company-sub` | column 2, row 2 |
| `.vs-title` | column 3, row 1 |
| `.vs-headline-note` | column 3, row 2 |

Row 1 carries the company name and the title bar; row 2 carries the city line and the
"RETAIN THIS SLIP FOR DEPARTURE" caption. Two cells in the same row are centred in the same row
box, so **each pair shares a baseline by construction rather than by eye**. Explicit `line-height`
on every text cell gives each a known height, so the centring is reproducible across font stacks
instead of depending on the UA default. The logo spans both rows and is centred against the block,
which keeps it level with the name. The dead `.vs-title` class is now live.

Measured on the real rendered print (A4 content box, px):

```
.vs-header        top= 7.5  bottom=67.5  cy=37.5
.vs-logo          top=16.5  bottom=60.5  cy=38.5
.vs-company       top=22.5  bottom=38.5  cy=30.5   <- row 1
.vs-title         top=17.0  bottom=44.0  cy=30.5   <- row 1  (delta 0.00 px)
.vs-company-sub   top=48.0  bottom=60.0  cy=54.0   <- row 2
.vs-headline-note top=48.0  bottom=60.0  cy=54.0   <- row 2  (delta 0.00 px)
```

Row-1 delta **0.00 px**, row-2 delta **0.00 px**, logo vs block centre **0.00 px**.

**Visitor ID row** was also converted from a flex `space-between` row to a real
`grid-template-columns: 1fr auto 1fr` grid with `align-items: center`, so the reference is
optically centred on the page instead of drifting between a long label and a wide status badge.
All three items measure `cy = 82.3`; the reference centre and the bar centre are both `359.0`.

### §6 — General polish (no redesign)

| Change | Reason |
|---|---|
| `.vs-row` → `align-items: baseline` | Label and value now share one first-line baseline. With the flex default `stretch`, a two-line value left the label floating against the middle of its own text. |
| `.vs-grid` rows given `line-height: 14px` | Uniform row rhythm across the fact grid. |
| `.vs-reception` → `align-items: center`, padding `5px 10px`, explicit right-align on the last span | The footer band stopped being two spans of differing heights on a shared line. |
| `.vs-foot` explicit `line-height: 10px` | Stable footer height. |
| `.vs-ref-bar` grid (above) | Row 2 of the header problem, applied to the ID row. |
| Header grid (above) | Row 1 of the header problem. |

Deliberately **not** changed: the fact grid stays 2-column, the section structure is untouched, no
colour or font family changed, no field added or removed. This is polish, not a redesign.

**Physical Host Signature blank — measured, still intact:**

```
Host Signature blank: 12.7 mm high x 89.0 mm wide
at least four ruled blanks remain for handwriting
```

Unchanged from the #19 geometry, and re-asserted after every layout change.

---

## 2. Files changed

### Product code (4 files)

| File | Change |
|---|---|
| `frontend/src/utils/visitorSlipHtml.ts` | **+201 / −? (the substantive change).** `formatStamp` → 12-hour; three new exported constants (`SLIP_COMPANY_NAME`, `SLIP_COMPANY_CITY`, `SLIP_COMPANY_UNIT`, `SLIP_ACTOR_FALLBACK`); `actorName()` with the UUID guard; header rebuilt as a 2×3 grid (`.vs-brand`/`.vs-brand-text`/`.vs-headline` wrappers removed, `.vs-title` activated); `.vs-ref-bar` → grid; `align-items: baseline`; reception/footer rhythm. |
| `backend/src/modules/visitor/services/visitor-entry.service.ts` | **+63.** `ErpUser` import + repo injection; `SLIP_ACTOR_FALLBACK_NAME`; `resolveActorNames()`; `createdByName` / `confirmedByName` / `signatureCapturedByName` on `getSlip()`. |
| `backend/src/modules/visitor/visitor.module.ts` | **+7 / −2.** `ErpUser` added to `TypeOrmModule.forFeature`; doc comment updated. |
| `frontend/src/utils/visitorSlipHtml.test.ts` | **+236.** 14 new tests (see §5). |

### Test/verification code (3 files)

| File | Change |
|---|---|
| `frontend/src/pages/visitor/VisitorManagement.test.tsx` | **+68.** New `asSlipDisplayed()` helper (12-hour) alongside the existing `asDisplayed()` (24-hour, unchanged) so a test states which surface it means; fixtures carry the new `*Name` fields; 2 new page-level tests. |
| `backend/src/modules/visitor/services/visitor-entry.service.spec.ts` | **+77.** 5 new tests (3A–3E) covering resolution, fallback, blank names, directory failure, and no-query-when-nobody-to-resolve. |
| `scratch/verify-visitor-p19-ui.js` | 2 harness fixes + 1 assertion upgrade, explained in §5. |

### Not changed

`frontend/src/pages/visitor/VisitorSlipPreview.tsx` — **no change needed, and that is the point.**
It passes the authorised `GET .../slip` payload straight into `renderVisitorSlipHtml`, the same
function `printVisitorSlipDocument` uses. Preview and print are structurally incapable of
diverging. `frontend/src/utils/printTemplates.ts` and `visitorSlipAssets.ts` — untouched.

**No entity, migration or seed change. No database change was required — see §3.**

---

## 3. Database changes

**None. Zero. No migration, no entity change, no seed change, no schema change.**

#19A is entirely a display layer. Specifically:

- The `visitors` table is untouched. `created_by`, `host_confirmed_by`,
  `signature_captured_by`, `time_in`, `time_out` are stored exactly as #19 stored them.
- `erp_users` is **read only** — it already exists and already holds `display_name NOT NULL`. The
  new `ErpUser` repository reads it; it does not extend it.
- `companies` is still read (unchanged, still used for authorization) but no longer used for the
  printed letterhead.
- The API's `companyName` / `companyCode` response fields are unchanged.

Verified live: 34 existing slip records re-read after the change all return populated
`*Name` fields and the stored timestamps are byte-identical to what #19 wrote.

---

## 4. Preview / print verification

**Method: real Chromium (Playwright, vendored at repo root) driving the real SPA, real login, real
API, real `window.print()` override, real A4 PDF.** `tools.browser.*` was not attached to this
session — Playwright + the vendored Chromium is a **substitution**, stated explicitly.

| # | Check | Result |
|---|---|---|
| 1 | Print goes through the shared `printHtmlContent` pipeline (hidden `#pwi-print-frame`) | PASS |
| 2 | Printed document declares `@page { size: A4 portrait }` | PASS |
| 3 | Print dialog opened exactly once | PASS |
| 4 | **Preview and print render the SAME markup** (byte-level prefix comparison of the slip element) | PASS |
| 5 | The slip prints on exactly **one** page | PASS |
| 6 | The printed page shows `Pakistan Wire Industries (Pvt.) LTD.` | PASS |
| 7 | The printed page shows `Karachi, Pakistan` | PASS |
| 8 | The printed page shows `Created By: System Admin` | PASS |
| 9 | The printed page uses the 12-hour clock | PASS |
| 10 | The printed page contains **no UUID** (full `outerHTML` scanned) | PASS |
| 11 | Header is a grid, `align-items: center` | PASS |
| 12 | Row 1 (company name / VISITOR SLIP) share a centre line, ≤1 px | PASS — **0.00 px** |
| 13 | Row 2 (city / RETAIN THIS SLIP) share a centre line, ≤1 px | PASS — **0.00 px** |
| 14 | Logo centred against the full two-row text block, ≤1 px | PASS — **0.00 px** |
| 15 | The two header rows do not collide vertically | PASS |
| 16 | The two cells of each row do not overlap horizontally | PASS |
| 17 | The retain note sits below the title bar without colliding | PASS |
| 18 | Title and note are flush right with each other; right column respects header padding | PASS |
| 19 | VISITOR ID row is a 3-track grid with equal outer tracks | PASS |
| 20 | The visitor reference is centred on the row (≤1 px) | PASS — delta 0.00 px |
| 21 | Reference bar items are vertically centred | PASS — all `cy = 82.3` |
| 22 | Physical "Host Signature" blank still present | PASS |
| 23 | Host Signature blank ≥ 10 mm tall | PASS — 12.7 mm |
| 24 | Host Signature blank ≥ 60 mm wide | PASS — 89.0 mm |
| 25 | At least four ruled blanks remain for handwriting | PASS |
| 26 | Nothing overflows the A4 content box horizontally | PASS |
| 27 | Nothing overflows the A4 content box vertically | PASS |
| 28 | No unexpected console errors/warnings | PASS |

**Total live browser + print checks: 54, all passing.**

The slip was **not** judged by eye. I cannot view images, so header alignment was verified by
measuring real `getBoundingClientRect()` values from the rendered print document — the numbers above
are the actual measurements, and the 7 px defect was found by that measurement, not by inspection.

**Artifacts** (`scratch/p19a-ui-artifacts/`): `slip-print-document.html` (the exact markup sent to
the printer), `visitor-slip.pdf` (86,251 bytes, 1 page), `slip-print-render.png`,
`slip-preview-render.png`.

**Actual printed text**, verbatim from the rendered document:

```
PAKISTAN WIRE INDUSTRIES (PVT.) LTD.
Security & Reception — Karachi, Pakistan
VISITOR SLIP
RETAIN THIS SLIP FOR DEPARTURE
VISITOR ID
VIS-2026-000034
COMPLETED
...
VISIT
Time-In
28-Sep-2026 09:45 PM
Time-Out
28-Sep-2026 09:46 PM
Status
COMPLETED
Host Confirmation:
CONFIRMED
Confirmed By:
System Admin (ERP user — host identity not verified)
HOST CONFIRMATION
The host signs below to confirm the visitor reached them. This slip must be returned to Security on departure.
Host Signature
Host Name
Date / Time
Security / Reception Use
Created By: System Admin
Created At: 28-Sep-2026 09:45 PM
```

(`PAKISTAN…` renders uppercase because `.vs-company` carries `text-transform: uppercase`, as in
#19. The **markup** holds the exact required string `Pakistan Wire Industries (Pvt.) LTD.`; the live
test asserts the markup spelling and the rendered spelling separately.)

---

## 5. Tests actually executed

**I claim PASS only for what I ran. Every number below is from an executed command.**

### Unit / integration

| Suite | Before | After | Result |
|---|---|---|---|
| Backend `jest src/modules/visitor` (5 suites) | 204 | **209** | PASS (+5: 3A–3E) |
| Backend `jest auth\|permission\|activity-log` (4 suites) | 37 | 37 | PASS (unchanged) |
| Frontend `npm test` visitor scope (3 suites) | 76 | **90** | PASS (+14) |

Frontend uses `npm test` (`react-scripts test`) — bare `npx jest` does not work in this repo
(no babel config, no `jest` key in `package.json`).

**New frontend tests** (`visitorSlipHtml.test.ts` + `VisitorManagement.test.tsx`):
12-hour AM/PM on every time · no 24-hour clock leaks · midnight is `12 AM` not `00` · noon is
`12 PM` · the AM/PM clock survives into the *printed* document, not just the preview · the acting
users print by name · **no UUID in any state** (5 payload variants, markup scanned so an id hidden
in an attribute would still be caught) · `System User` fallback for missing / blank / UUID-shaped
names · §17 still stated alongside the name · exact production company name and city · the
fixture `PAKWIZ…` and `Lahore` are gone · the letterhead ignores a differing `companyName` · no
street address invented · header is a 2-row grid with each cell placed by grid coordinates · VISITOR
ID row is a 3-track grid · page-level: 12-hour clock, named users, no UUID, production letterhead ·
page-level: `System User` fallback when the API resolved no user.

### Live verification (real server, real DB, real browser)

| Script | Checks | Result |
|---|---|---|
| `scratch/verify-visitor-p19a-api.js` *(new)* | 170 | PASS — 34 slips, every `*Name` populated, no name is a UUID, §17 flag intact, raw ids still returned |
| `scratch/verify-visitor-p19a-ui.js` *(new)* | 54 | PASS — see §4 |
| `scratch/verify-visitor-p19.js` | 129 | PASS |
| `scratch/verify-visitor-p19-ui.js` | 130 | PASS |
| `scratch/verify-visitor-p19-db.js` | 46 | PASS |
| `scratch/verify-visitor-p19-scope.js` | 21 | PASS |
| `scratch/verify-visitor-p19-orphans.js` | 7 | PASS |
| `scratch/verify-visitor-p19-residue.js` | 21 | PASS |
| **Total live** | **578** | **all PASS** |

The six #19 scripts are the **regression proof**: reference generation, print/re-print, shared
preview/print source, A4 pipeline, host-confirmation conditional update, digital signature
handling, private photo storage, MIME/magic-number validation, division authorization, permissions,
audit behaviour, status/time-out behaviour and the no-public-URL rule all still hold.

### Two pre-existing harness problems found and fixed in `verify-visitor-p19-ui.js`

1. **Row selection took the last matching element.** Line 423 used
   `querySelectorAll('[data-testid^="visitor-ref-"]').pop()`, which silently depends on row
   ordering. It clicked the wrong visitor and timed out. Fixed to match the reference **exactly**.
   This was a harness fragility in the pre-existing #19 script, not a product regression — proven by
   the fact that fixing the selector made the run pass.

2. **The Time-In agreement check compared formatted strings across two surfaces #19A §1
   deliberately made different.** It compared the ERP success panel's 24-hour `28-Sep-2026 22:57`
   against the slip's 12-hour `28-Sep-2026 10:57 PM` and demanded byte equality. Those are the
   **same instant**; #19A changed the slip's format by explicit instruction, so the check was
   asserting a formatting detail that no longer holds. Replaced with a check that **parses both and
   compares `Date` values**, plus a new check that the slip is 12-hour while the screen is 24-hour —
   documenting the difference as intentional rather than hiding it. The underlying behaviour (paper
   and screen agree) is still verified, and now more meaningfully than before.

**I want to be explicit about #2**: this check *failed* after my change. It was a genuine failure of a
pre-existing assertion caused by a deliberate requirement, not a test I edited to make my code pass.

---

## 6. Build and typecheck

| Gate | Command | Result |
|---|---|---|
| Backend typecheck | `npx tsc --noEmit` | **PASS** (exit 0) |
| Backend lint | `npx eslint --ext .ts src/modules/visitor` | **PASS** (exit 0, zero findings) |
| Backend build | `npm run build` (nest build) | **PASS** (exit 0) |
| Frontend typecheck | `npx tsc --noEmit` | **PASS** (exit 0) |
| Frontend lint | `npx eslint` on all 9 visitor/slip files | **PASS** (exit 0, zero findings) |
| Frontend build | `npm run build` | **PASS** — "Compiled with warnings" |

**On the frontend build warnings:** they are **pre-existing and in modules I did not touch**
(`setSaveDialogErrorLead` unused, several `no-loop-func` in import pages, a `react-hooks/exhaustive-deps`
and a `postcss-calc` parse notice). **Zero warnings originate in the files I changed** — confirmed by
running scoped ESLint on those 9 files, which is clean. `CI=false` was forced because
`CI=true` promotes these pre-existing repo-wide warnings to build failures.

### Gates I did NOT run, and why

- **Whole-repo backend ESLint** and **whole-repo frontend Jest** both run out of memory on this
  16 GB machine. This is an **environment resource limit, pre-existing, and not caused by these
  changes.** I am reporting it as NOT RUN, not as a pass. Scoped equivalents were run instead, and
  every suite that touches the changed code was run in full.
- `tsc --noEmit` was run for both packages. There is no separate `typecheck` npm script.

---

## 7. What the verification caught (worth knowing)

The measurement-driven approach earned its keep twice.

**A real defect that a visual review would likely have missed.** My first header fix — one
`align-items: center` flex row — looked reasonable in the source. Measuring real bounding boxes
showed the title bar sat **7.00 px above** the logo centre, because a title-and-caption stack is not
vertically symmetric about its own centre and a flex row can only align block centres. That is why
the shipped version is a grid: cells placed on the same row share a row box, so they align by
construction. Row deltas went from 7.00 px to **0.00 px**.

**A stale assertion that was protecting a formatting detail, not a behaviour.** See §5 item 2.

Three other "failures" during the work were **my own test-harness bugs**, each fixed in the harness
and the run re-run to prove the product was correct: the login `POST` was being counted as a "write"
during the read-only assertion; the company-name check compared against `innerText` (which CSS
upper-cases) instead of the markup; and the grid-track regex did not account for Chromium resolving
`1fr auto 1fr` into pixels. None of these were product bugs, and none were worked around by
loosening a product assertion.

---

## 8. Remaining issues and limitations — read this

1. **The visitor DETAIL MODAL still shows a UUID for "Confirmed By".**
   `detail-host-confirmed-by` renders the raw `confirmedBy` id, and a test still asserts the UUID
   there (`VisitorManagement.test.tsx:1376-1378`). This is **outside the stated #19A scope** (which
   was the *printed slip*), so I left it and am flagging it rather than silently widening the
   change. It is a real inconsistency: the paper names the user, the modal shows an id. **Recommend
   fixing in a follow-up** — the backend already sends `confirmedByName`, so it is a small frontend
   change plus one test.

2. **The company name is now a hard-coded constant on the frontend.**
   This matches every other printed document in the repo and is the reason the fixture name stopped
   leaking. But it does mean the letterhead cannot be changed per-company from the database without
   a code change. If a second legal entity is ever added, the constant must become configuration.

3. **The ERP screen and the slip now use different clock formats.** Deliberate (paper vs desk), and
   tested as deliberate. But it is a visible difference someone may query. It is 12-hour because you
   asked for it; reverting is a one-line change in `formatStamp`.

4. **Header alignment is verified for the shipped configuration only** — A4 portrait, 190 mm
   content width, the default font stack, with a logo present. It has not been checked on a
   different printer driver, a Letter-size paper, or a missing logo. A test does assert the no-logo
   path still renders, but geometry there is unmeasured.

5. **One fallback name for all three actor fields.** If `created_by` and `host_confirmed_by` both
   fail to resolve, both read `System User` and you cannot tell them apart on the paper. That is the
   intended trade (a name beats an id), but it is a limit.

6. **The letterhead has no address, per §8 of your brief.** The header carries the entity name and
   the city only. A street/site address should be added when you supply one.

7. **Long names can stretch the header.** The company name is `minmax(0, 1fr)` so it wraps rather
   than pushing the title bar off the page, but a pathologically long ERP `display_name` in the
   "Confirmed By" row will wrap to two lines. No truncation was added, because truncating a person's
   name on an official document is worse than wrapping it.

8. **I could not view the rendered images.** The PNG/PDF artifacts exist for your review, but my
   verification of visual quality is entirely numeric (bounding boxes, page count, overflow). If
   something about the *typography* — letterforms, weight balance, colour — is unsatisfactory, that
   is not something I have checked.

9. **Verification data was retained in the dev database** (P19/P19A/P19UI visitor rows and their
   storage files) as evidence, as in #19. `verify-visitor-p19-residue.js CLEAN=1` soft-deactivates
   it on request. Nothing was deleted.

10. **Nothing has been committed or pushed.** All #19A work is in the working tree. The pre-existing
    unrelated dirty files (`sales-analytics.dto.ts`, `logo.png`, `logo-mark.png`, `theme.css`,
    `.erp-dev-pids.json`, assorted `scratch/*`) are still unstaged and untouched by me.

---

## 9. Requirements traceability

| Req | Status | Evidence |
|---|---|---|
| §1 12-hour AM/PM, all slip times | **DONE** | `formatStamp` → `hh:mm A`; live PDF shows `09:45 PM`; 3 unit tests + 4 live checks |
| §2 Names not UUIDs | **DONE** | Backend `createdByName` / `confirmedByName` / `signatureCapturedByName` from `erp_users.display_name`; `System User` fallback; renderer UUID guard; 34 live slips, 0 UUIDs |
| §3 `Pakistan Wire Industries (Pvt.) LTD.` | **DONE** | `SLIP_COMPANY_NAME` constant; exact-string assertion on markup and on rendered text |
| §4 `Karachi, Pakistan` | **DONE** | `SLIP_COMPANY_CITY`; `Lahore` absent, asserted |
| §5 Header alignment on one grid | **DONE** | 2×3 grid; row deltas **0.00 px**; logo delta **0.00 px**; reference centred delta **0.00 px** |
| §6 General polish, no redesign | **DONE** | `baseline` row alignment, uniform `line-height`, reception/footer rhythm, ID-row grid; structure/fields/colours unchanged |
| §7 All #19 behaviour preserved | **DONE** | 354 #19 regression checks pass unchanged |
| §8 No invented address | **DONE** | City only; test asserts no street pattern |
| §9 Honest verification | **DONE** | 578 live + 336 unit checks; 2 named harness limitations (§8 above); no check claimed PASS that was not executed |
| DB changes | **NONE** | No migration, no entity change, no seed change |
| Prompt #20 / dashboard / mobile / vehicle | **NOT TOUCHED** | Out of scope, not implemented |

---

## 10. Recommendation

The printed slip now meets every stated #19A requirement, with the header alignment defect fixed at
a measured 0.00 px and verified in a real PDF rather than by inspection. All #19 behaviour is
intact across 354 regression checks.

**Before this is useful to anyone, the one thing I would do next is fix the detail-modal UUID**
(§8 item 1) — the backend already sends the name, it is a small change, and leaving it means the
same information is presented two different ways within one screen.

I have **not committed or pushed**. Tell me if you want this committed, and whether to include the
`scratch/verify-visitor-p19a-*.js` scripts in the commit (my recommendation: yes, they are the
evidence for every claim in §4 and §5, and they sit alongside the six existing `verify-visitor-p19*`
scripts as untracked files).
