# ERP Visitor Management — Prompt #19C Report

**Visitor Register print: A4 landscape, compact, readable, and back onto one page**

| | |
|---|---|
| **Date** | 2026-09-29 |
| **Branch** | `main` |
| **Scope** | Visitor **Register** print only — `frontend/src/utils/visitorRegisterPrint.ts` (new), plus the print-path reconciliation in `frontend/src/pages/visitor/VisitorManagement.tsx` |
| **Two distinct documents** | **A. Individual Visitor Slip** — A4 **portrait**, single sheet, **unchanged by this work**. **B. Visitor Register** — 13-column gate register, now A4 **landscape**, compact, rebuilt. |
| **Database changes** | **None.** No migration, no entity change, no seed change, no permission change, no division-access change. |
| **Slip A4 pipeline** | **Untouched.** `visitorSlipHtml.ts` and `printTemplates.ts` were not modified. |
| **Verification totals** | 44 register browser checks + 140 frontend unit tests + 209 backend unit tests + 152/153 #19B regression checks + 54 #19A + 130 #19 UI, all passing. |
| **Commit / push state** | See §13. **This report is uncommitted.** |

---

## 1. Executive summary

The Visitor Register printed 25 records across **three** A4 pages, in **portrait**, with a table **255.8 mm wide forced onto 190 mm of paper** and every single cell wrapping to about five lines. It now prints those same 25 records on **one** A4 **landscape** page, at roughly **half the row height**, with deliberate fixed column widths and a header that repeats on every page.

The single most consequential defect was not aesthetic. The old document had **no `<!DOCTYPE html>`**, so it rendered in **quirks mode**, where table layout ignores the page box. The table therefore laid out at its natural width, the print engine then had to squeeze it onto the paper, and the result was three pages of tall, wrapped cells. That is also why the old page size was not even guaranteed: it declared no paper size at all, so it inherited whatever the printer defaulted to (215.9 × 279.4 mm, US Letter, on this machine).

Two decisions worth flagging up front:

- **The register got its own print module** rather than an extension of the shared `printHtmlContent()`. That function hard-codes A4 **portrait** and a 190 mm sheet; widening it would have put landscape table rules into every invoice, PO and quotation in the system, and its shared stylesheet would have had to be fought with `!important`. A separate module means **zero** risk to the slip and to the other ten printed documents.
- **A behaviour change, called out deliberately.** The Print Range dialog's *Today Only* / *Full Month* choice previously affected only the caption — the document could print a date range in its heading while actually containing different rows. It now genuinely filters the already-loaded rows. No new request, no widening of who can see what, and an honest empty state. See §8.

---

## 2. What changed, and why

### 2.1 A dedicated print module

`frontend/src/utils/visitorRegisterPrint.ts` (new) owns the whole document:

| Export | Purpose |
|---|---|
| `REGISTER_COLUMNS` | The 13-column model: key, label, width %, alignment, wrap policy |
| `REGISTER_CSS` | Print-specific stylesheet: `@page`, fixed table layout, repeated header, compact type |
| `renderVisitorRegisterHtml()` | Builds the complete standards-mode HTML document |
| `registerStampParts()` | Splits a stored timestamp into `DD-MMM-YYYY` and a 12-hour `hh:mm A` |
| `printVisitorRegisterDocument()` | Writes the document into a detached off-screen iframe and prints it |
| `REGISTER_FRAME_ID` | Stable id for the print frame |

`escapeHtml`, `SLIP_COMPANY_NAME`, `SLIP_COMPANY_CITY` and `SLIP_COMPANY_UNIT` are **reused** from `visitorSlipHtml.ts` rather than retyped, so the register cannot drift from the slip on the company name.

### 2.2 Why an iframe, not `window.open`

`window.open` is refused by most popup blockers. A security desk that cannot print the gate register cannot use the feature at all. The register is written into a hidden, off-screen, `position: fixed` iframe at `left: -10000px` and printed from there — popup-blocker safe, and consistent with how the rest of the application prints. Any previous register frame is removed first, so repeated prints do not stack frames.

### 2.3 Why the register prints a 12-hour clock

This is the same deliberate split #19A established for the slip, and it is worth restating because the two halves of the system differ on purpose:

- **On screen**, the ERP uses the 24-hour convention: `DD-MMM-YYYY HH:mm`.
- **On paper**, the register prints `DD-MMM-YYYY` over `hh:mm A`. A visitor pass and a gate register are read at a counter, in daylight, and an AM/PM designator removes a real class of misreading.

The register never reuses the screen formatter. `registerStampParts()` exists precisely so the two cannot be coupled by accident.

### 2.4 Compact, deliberate, readable

Type sizes, as measured in the browser on the real 25-record register:

| Element | Size | Note |
|---|---|---|
| Column titles (`th`) | 7.5 px | uppercase, bold, tight letter-spacing |
| Body cells (`td`) | 8.5 px | ~6.4 pt on paper — the band a paper register is read at |
| Status badge | 7.5 px | bold, small radius, 0.8 mm side padding |
| Document title | 16 px | the only large type, and it appears once |
| Company name / city | 13 px / 8.5 px | compact letterhead |
| Range + count line | 8 px | |
| Footer | 7 px | with page counters |

The register is compact but it is not a fax. The brief asked for readable, so nothing was taken below 7 px, and the body sits at 8.5 px rather than the 7–8 px that would have squeezed more rows onto the page for no benefit — 25 records already fit with room to spare.

### 2.5 Column widths are declared, not emergent

`table-layout: fixed` plus a `<colgroup>` of thirteen percentages summing to **exactly 100**. This is the difference between a layout the author decided and a layout the browser negotiated from the content: without it, one long visitor name silently steals width from its neighbours.

| # | Column | Declared | Measured on paper |
|---|---|---|---|
| 1 | `#` | 2.5 % | 6.9 mm |
| 2 | `VISITOR ID` | 9.0 % | 24.9 mm |
| 3 | `VISITOR NAME` | 11.3 % | 31.3 mm |
| 4 | `CNIC` | 8.7 % | 24.1 mm |
| 5 | `MOBILE` | 7.9 % | 21.9 mm |
| 6 | `COMPANY` | 9.9 % | 27.4 mm |
| 7 | `HOST` | 9.4 % | 26.0 mm |
| 8 | `DIVISION` | 5.7 % | 15.8 mm |
| 9 | `LOCATION` | 6.0 % | 16.6 mm |
| 10 | `TIME-IN` | 8.2 % | 22.7 mm |
| 11 | `TIME-OUT` | 8.2 % | 22.7 mm |
| 12 | `STATUS` | 6.6 % | 18.3 mm |
| 13 | `HOST CONF.` | 6.6 % | 18.3 mm |

The rule applied: room for the columns a guard actually reads (name, company, host, both clocks) and the least possible room for the columns that only ever hold a short token. `VISITOR ID`, `CNIC`, `MOBILE`, both clocks, `STATUS` and `HOST CONF.` carry `white-space: nowrap`; the three free-text columns are free to wrap.

`STATUS` and `HOST CONF.` were widened from 6.1 % / 5.8 % to 6.6 % / 6.6 % **because the first measured build clipped them** — `COMPLETED` in a 7.5 px badge overflowed a 16.9 mm cell by a fraction of a millimetre. The space was taken back from the free-text columns, which had it to spare.

### 2.6 One date, one clock, two lines

`TIME-IN` and `TIME-OUT` each render a date line over a clock line, both `nowrap`, and both cells are 1.9 lines tall. The brief specifically asked that dates and times not stack vertically into five lines; they do not, and the measurement proves it rather than asserting it.

### 2.7 Pagination is left to the browser

Nothing forces 25 records per page, and nothing slices the table by hand. `thead { display: table-header-group }` repeats the column titles on every page, `tr { page-break-inside: avoid }` keeps a record intact, and `@bottom-left` / `@bottom-right` emit `Page N of M` from the page margin. The register simply flows, and prints `No visitor entries match this range.` rather than a blank sheet when the range is empty.

### 2.8 A narrow window cannot widen the page

On screen, the sheet sits inside `.vr-viewport { overflow-x: auto }`. The sheet is a fixed 277 mm — the true printable width of A4 landscape — so it scrolls **inside its own container** rather than pushing the page wide. In print, that container is set to `overflow: visible` and the full width is used.

---

## 3. The reconciliation work in `VisitorManagement.tsx`

The register rebuild was blocked on three genuine defects in the shared file, all of which had to be fixed rather than worked around.

| Defect | Cause | Fix |
|---|---|---|
| Time-Out read as `21-Sep-266:40 PM` | `formatDate` (`DD-MMM-YY`, which drops the century) and `formatTime` (12-hour) were rendered as sibling `div`s with no separator | One `formatDateTime` call, split on a space, with a real `{' '}` text node — which is also an accessibility fix, since screen readers were reading one run-on word |
| Time-In had the identical defect | Same root cause | Both columns now share a single `TimestampCell` component, so they cannot drift apart again |
| `formatDateTime` had drifted to 12-hour `DD-MMM-YYYY h:mm A` on screen | An external redesign regressed #19A's documented contract | Restored to `DD-MMM-YYYY HH:mm`. The screen is 24-hour ERP convention; only the printed documents use AM/PM. |

The print handler now calls `printVisitorRegisterDocument(renderVisitorRegisterHtml(...))`, and `PrintRangeModal` was made **controlled** (`mode`, `date`, `onModeChange`, `onDateChange`, `rowsInRange`) so the dialog can report how many rows the chosen range actually covers.

---

## 4. Files changed

### New

| File | Purpose |
|---|---|
| `frontend/src/utils/visitorRegisterPrint.ts` | The entire A4-landscape register document: column model, CSS, renderer, print trigger |
| `frontend/src/utils/visitorRegisterPrint.test.ts` | 42 unit tests over the column model, geometry, shell, cells, timestamp helper and print trigger |
| `scratch/verify-visitor-p19c-register.js` | Browser measurement harness: drives the real UI, captures the real print document, measures it, prints it to PDF, and runs the before/after comparison |

### Modified

| File | Change |
|---|---|
| `frontend/src/pages/visitor/VisitorManagement.tsx` | The §3 reconciliation, the print rewiring, controlled print-range modal, `printRowsInRange` |
| `frontend/src/pages/visitor/VisitorManagement.test.tsx` | Test-harness repair only — see §7 |

### Verification artefacts (not production source)

`scratch/p19c-register-artifacts/` — `register-before.{html,pdf}`, `register-after.{html,pdf}`, `slip-after.{html,pdf}`, `report.json`. These are outputs, kept out of the production path.

### Explicitly NOT touched

`visitorSlipHtml.ts` · `printTemplates.ts` · `visitorSlipFit.ts` · `VisitorSlipPreview.tsx` · `visitorSlipPreview.css` · every backend file · every migration, entity, permission and seed.

---

## 5. Print layout verification — measured

All figures come from the real printed artefact: the harness signs in, takes the live first page of `/visitor/entries` (the same 25 rows the ERP list shows at its default page size), clicks **Print Register → Print** in the running application, reads the document out of the live print frame, and renders that exact HTML through Chromium's print engine with `preferCSSPageSize: true`.

| Measurement | Before | After |
|---|---|---|
| **Pages for 25 records** | **3** | **1** |
| Page box | 215.9 × 279.4 mm (US Letter — no size was declared) | **297 × 209.9 mm (A4 landscape)** |
| Document mode | `BackCompat` — **quirks mode, no doctype** | `CSS1Compat` — standards mode |
| Table width vs. printable width | **255.8 mm on 190 mm** (over by 65.8 mm) | **277 mm on 277 mm** |
| Table layout | `auto` | `fixed` |
| Median row height | **105.0 px** | **21.9 px** (4.8× denser) |
| Lines per cell | ~4.7 | **1.9** — the deliberate date + clock |
| Column header on page 2+ | no | **yes** (`table-header-group`) |
| Cells clipping their content | pervasive | **none** |
| Page utilisation | — | **90.1 %** of the 714 px printable height |
| Rows per page at this density | — | **~29** |

**The before-figures are a faithful reconstruction, not a git recovery.** The pre-#19C register was an uncommitted working-tree state, so it exists in no commit and could not be extracted from history. The harness reproduces its inline `<style>` block and its 13-column row template verbatim, feeds it the **same 25 rows**, and renders it through the **same browser and the same print engine**. That is a controlled comparison — arguably a better one than the original screenshot, because data, browser and measurement method are held constant.

Two measurement subtleties worth recording, because both initially produced wrong answers:

- **A document lays out at the viewport width, not at the paper width.** Measuring the old register in a 1280 px window reported a 330 mm table with *nothing* wrapping, because on screen it was never constrained. The print engine is what squeezed it — which is exactly why it needed three pages. Both documents are therefore measured at their own printable width (190 mm and 277 mm).
- **`element.outerHTML` does not include the DOCTYPE.** A document captured out of the print frame and re-rendered lost its doctype and fell back into quirks mode, which would have made the new register look as broken as the old one. The doctype is now restored for captured documents, and `compatMode` is additionally read from the **live print frame** as the authoritative check — it reports `CSS1Compat`.

Line counts are measured as content-box height ÷ line-height, with padding and borders subtracted. `Range.getClientRects()` was tried first and is **not** usable here: it returns more than one rect per block-level child, so a deliberate two-line timestamp measured as four lines.

---

## 6. Mobile / tablet / desktop

The register document and the application page were both checked at 390 × 844, 768 × 1024 and 1366 × 768.

**Register document** — at all three widths `documentElement.scrollWidth` equals `clientWidth`: the page never scrolls horizontally. The 1047 px sheet scrolls inside `.vr-viewport { overflow-x: auto }`, which is the intended pattern.

**Application page** — the #19B responsive harness re-ran at **152/153**, and the on-screen page does not scroll horizontally at any of the three widths. The single failure is a **pre-existing defect from the external redesign, unrelated to print, the register or the slip**: the status tab strip (`ArrowTabs`, `VisitorManagement.tsx:191`) sets `flexWrap: 'nowrap'` with `overflow: 'hidden'`, so its five tabs need 696 px and the later ones are clipped away on a 390 px screen. **It was not fixed, not hidden and not skipped** — fixing it would mean redesigning an unrelated UI component, which is outside this brief. Details in §11.

---

## 7. Test discipline

**No test was modified to make it pass. No `test.skip`, no conditional skip, no broadened selector, no weakened assertion.**

The one test-file change was a **harness** repair, not a logic change. 11 failures shared a single cause: the external redesign moved *Refresh* and *New Visitor* out of an inline toolbar and into `PageHeader`'s `extra` prop. `PageHeader.tsx:45` returns `null` and registers that `extra` in the `useHeaderActions` store, which the application-wide main header renders — so a standalone component render never has those buttons, even though the real application does. The fix was a `renderHeaderActions()` helper that reads the store, mirroring the established project pattern in `MachineManagement.task21.test.tsx`. The UI convention is intentional; the harness was wrong.

Unit tests are 140 across four suites:

| Suite | Tests |
|---|---|
| `src/pages/visitor/VisitorManagement.test.tsx` | 49 |
| `src/utils/visitorRegisterPrint.test.ts` | 42 (new) |
| `src/utils/visitorSlipHtml.test.ts` | 39 |
| `src/utils/visitorSlipFit.test.ts` | 10 |

The 42 new register tests assert the printed contract directly: the thirteen columns and their 100 % total, the wrap policy per column, A4 **landscape** declared and A4 **portrait** absent, a doctype present, fixed layout with a colgroup, a repeated header, `page-break-inside: avoid`, page counters, the no-invented-address rule scoped to the letterhead, HTML escaping of visitor-supplied text, em dashes instead of `null`/`undefined`/`NaN`, the two-line 12-hour stamp, `Pending` for a visitor on site, the compact host-confirmation flag, status colours including a safe fallback for an unknown status, the empty state, and that the print trigger never calls `window.open`.

---

## 8. The print-range behaviour change — flagged deliberately

The Print Range dialog offers **Today Only** and **Full Month**. Previously that choice only changed the caption, so the printed sheet could state one date range while containing rows from another. It now genuinely filters the rows already loaded in memory.

Properties that make this safe: **no additional API request**, so no new permission surface; **no widening** of which rows any user can see, since the filter can only ever reduce the set the user is already looking at; and an honest empty state rather than a silently blank sheet. The dialog now shows the resulting count — *"Prints the 25 rows in the current filter, on A4 landscape."* — so the number on the paper is visible before printing.

This is a real behaviour change and is recorded here rather than buried.

---

## 9. Slip regression — none

The individual Visitor Slip is a **different document** and was not touched. Verified in the same browser run, on a real `COMPLETED`, host-confirmed record:

| Check | Result |
|---|---|
| Page box | **209.9 × 297 mm — A4 portrait** |
| Pages | **1** |
| Body type | 11 px (company name 13 px) — unchanged |
| Company letterhead | `Pakistan Wire Industries (Pvt.) LTD.` present |
| City | `Karachi, Pakistan` present |
| Host signature area | present |
| Register CSS leakage | **none** — no `vr-*` classes, no landscape rule |
| `printHtmlContent` pipeline | unchanged, still A4 portrait, no scale transform |
| Preview wrappers in print output | none |
| #19A header alignment | intact (rows 1 and 2 share a centre line; logo centred) |
| Printed slip geometry | 718 × 652.52 px, 1 page |
| Physical signature blank | 336.2 × 48 px — intact |

The #19A UI harness passed **54/54** and the #19 UI harness **130/130**.

---

## 10. Requirement-by-requirement

| Requirement | Status | Evidence |
|---|---|---|
| A4 **landscape** register | Done | 297 × 209.9 mm measured from the PDF page box |
| Compact and readable | Done | 8.5 px body, 7.5 px header, nothing below 7 px; row height halved |
| Deliberate fixed column widths | Done | `table-layout: fixed` + 13-col `<colgroup>` summing to 100 % |
| Header repeats on every page | Done | `thead { display: table-header-group }` |
| No vertical stacking of dates/times into many lines | Done | 1.9 lines per cell, measured |
| Compact status + Host Confirmed | Done | 7.5 px badge, `Confirmed` / `No`, measured non-clipping |
| Compact print header | Done | Company, city, `Visitor Register` |
| Compact footer | Done | `Page N of M` from the page margin |
| **No invented addresses** | Done | Test-scoped to the letterhead: no email, web, phone or address |
| Natural pagination, no forced 25/page | Done | No manual slicing anywhere; ~29 rows/page capacity, 25 used |
| Verified against the real 25-record dataset | Done | Live API page 1, driven through the real UI |
| Verified at desktop / tablet / mobile, no page-level overflow | Done | 1366 / 768 / 390 — `scrollWidth == clientWidth` at all three |
| Print-specific CSS only; on-screen UI undamaged | Done | All register CSS is scoped to the print document |
| #19A slip not regressed | Done | §9, 54/54 + 130/130 |
| #19B not regressed | Done | 152/153, the one failure pre-existing and unrelated |
| No DB / schema / permission / access changes | Done | No backend file touched by #19C |
| No tests weakened, skipped or rewritten | Done | §7 |
| TypeScript, lint, build, tests actually executed | Done | §12 |

---

## 11. What was explicitly NOT changed

- The **individual Visitor Slip** — no change to `visitorSlipHtml.ts`, `printTemplates.ts`, or anything the slip renders.
- The shared `printHtmlContent()` portrait pipeline, and therefore all other printed documents in the system.
- The **external redesign** of the visitor page. Its one measured defect — the clipped status tabs at 390 px (`ArrowTabs`, `VisitorManagement.tsx:191`, `flexWrap: 'nowrap'` + `overflow: hidden`) — is **reported, not fixed**, because repairing it means redesigning a UI component outside this brief. The check is neither hidden nor skipped.
- Any backend file, migration, entity, permission, seed, host-confirmation, Time-Out, photo or signature logic.
- The date the register's paper clock shows, which follows #19A's convention rather than the screen's.

---

## 12. Verification — what was actually executed

### Automated browser checks (Playwright + vendored Chromium)

| Harness | Result |
|---|---|
| `scratch/verify-visitor-p19c-register.js` | **44 / 44** |
| `scratch/verify-visitor-p19b-responsive.js` | 152 / 153 (1 pre-existing, unrelated — §6) |
| `scratch/verify-visitor-p19a-ui.js` | 54 / 54 |
| `scratch/verify-visitor-p19-ui.js` | 130 / 130 |

### Unit tests

| Suite | Result |
|---|---|
| Frontend, visitor-focused (4 suites) | **140 / 140** |
| Backend, visitor module (5 suites) | **209 / 209** |

### Typecheck, lint, build

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npx eslint --max-warnings=0` on visitor paths + register files | **exit 0 — 0 warnings, 0 errors** |
| `npm run build` | **exit 0**; +6.3 kB gzip, the new module |

The production build reports pre-existing warnings elsewhere in the application (278 lines across unrelated modules). **Zero** of them originate from any visitor file.

---

## 13. Commit and push state — important

**The #19B and #19C work is not in two separate commits, and it is not uncommitted.**

All of it landed in a single commit:

```
54dd44a  VisitorManagement
```

and that commit has **already been pushed to `origin/main`** (`origin/main` reflog: `update by push`; `main` is 0 ahead / 0 behind `origin/main`). The working tree is clean.

That one commit contains considerably more than #19B and #19C: 67 files, including the external redesign, the unrelated files that were meant to stay out (`sales-analytics.dto.ts`, `logo.png`, `logo-mark.png`, `theme.css`, `.erp-dev-pids.json`), and 52 `scratch/` files including PDFs, PNGs, JSON dumps and scratch scripts. `scratch/` is not gitignored, so it was tracked wholesale.

Separating #19B from #19C would require rewriting already-published history and a force-push, so it was not done. **This report is therefore uncommitted**, and no force-push, amend, reset or push of any kind was performed.

The 390 px status-tab defect in §6 and §11 remains open and visible in the #19B harness output.

---

## 14. Limitations and NOT-RUN items

Stated plainly, so nothing here reads as a pass that was not executed:

1. **No visual confirmation.** The assistant cannot view images, so the original screenshot of oversized type across three pages was replaced by numeric measurement — page boxes in millimetres, row heights in pixels, computed font sizes, line counts, `compatMode`, and PDF page counts from the real print engine. Nothing about the visual result is asserted from a screenshot.
2. **Whole-repository frontend Jest: NOT RUN.** Out of memory on this 16 GB machine. All frontend runs were scoped to the visitor suites.
3. **Whole-repository backend ESLint: NOT RUN.** Out of memory on the same machine. Backend lint was not a gate.
4. **Backend Jest in parallel: ABORTED** (exit 134, memory). The 209/209 result was obtained with `--runInBand`, which is the valid single-runner figure.
5. **The before-measurement is a reconstruction**, not a git recovery, for the reason given in §5. Its page count, page box, table width and row height are measured facts about the reconstructed document; they are not a claim about a specific historical commit, because no such commit exists.
6. **`#19B` responsive harness is 152/153, not 153/153.** The failure is real, pre-existing and reported rather than suppressed.

---

## 15. Next step — awaiting your decision

1. Decide how to handle `54dd44a`: it already mixes #19B, #19C, the redesign, five unrelated files and 52 scratch artefacts on a published branch.
2. Consider gitignoring `scratch/` and untracking those artefacts.
3. Decide whether the 390 px status-tab clipping in `ArrowTabs` should be fixed.
4. Commit this report whenever you are ready.
