# Prompt #19 — Visitor Slip, Printing, and Host Confirmation / Signature

> Status: **delivered and verified** against the running dev stack (backend `:3001`, frontend `:3000`) and the dev database.
> Migration `supabase/migrations/20260930000000_erp_00071_visitor_slip.sql` **is applied** to the dev database and re-verified.
> Implemented **additively on top of** Prompt #18 (`ae0b2e0`), which itself sits on Prompt #17 (`93648c0`). Both remain **unpushed**; Prompt #19 is **not committed yet** — see §27.
> **Three** defects were found during this work. Two were §13 print-layout violations and one was a **pre-existing image-content validation hole** in the Prompt #17 photo upload (§23.1). All three are fixed and each has a permanent guard.

---

## 0. Result summary (exact)

| # | Check | Command | Result |
|---|---|---|---|
| 1 | Migration applied + verified | applied + independent SQL assertions | **PASS** — 8 columns, 1 unique index, 1 permission, rollback block present |
| 2 | Backend type check | `npx tsc --noEmit` (backend) | **EXIT 0** |
| 3 | Backend lint (scoped) | `npx eslint --ext .ts src/modules/visitor` | **EXIT 0 — 0 errors, 0 warnings** |
| 4 | Backend tests (visitor module) | `npx jest src/modules/visitor --maxWorkers=1` | **EXIT 0 — 5 suites / 204 tests PASS** |
| 5 | Backend build | `npm run build` (`nest build`) | **EXIT 0** |
| 6 | Frontend type check | `npx tsc --noEmit` (frontend) | **EXIT 0** |
| 7 | Frontend lint (scoped) | `npx eslint` over the 9 touched frontend files | **EXIT 0 — 0 errors, 0 warnings** |
| 8 | Frontend focused tests | `npm test -- --testPathPattern="visitor\|SignaturePad\|visitorSlipHtml" --maxWorkers=1` | **EXIT 0 — 3 suites / 76 tests PASS** |
| 9 | Frontend build | `npm run build` (CRA, `CI=false` forced by the project's own script) | **EXIT 0** |
| 10 | **Live API end-to-end** | `node scratch/verify-visitor-p19.js` | **129 / 129 PASS, EXIT 0** |
| 11 | **Live database end-to-end** | `node scratch/verify-visitor-p19-db.js` | **46 / 46 PASS, EXIT 0** |
| 12 | **Live division-scope probe** | `node scratch/verify-visitor-p19-scope.js` (self-restoring) | **21 / 21 PASS, EXIT 0** |
| 13 | **Live upload side-effect probe** | `node scratch/verify-visitor-p19-orphans.js` | **7 / 7 PASS, EXIT 0** |
| 14 | **Live residue / audit / storage review** | `node scratch/verify-visitor-p19-residue.js` | **21 / 21 PASS, EXIT 0** |
| 15 | **Live browser UI end-to-end** | `node scratch/verify-visitor-p19-ui.js` (Playwright + Chromium) | **129 / 129 PASS, EXIT 0** |
| 16 | Backend auth/permission suites | `npx jest --testPathPattern "auth\|permission\|activity-log" --maxWorkers=1` | **EXIT 0 — 4 suites / 37 tests PASS** |
| 17 | Whole-repo backend ESLint | `npx eslint .` | **NOT CLAIMED — ENVIRONMENT RESOURCE LIMIT** (OOM on 16 GB, pre-existing, §24.1) |
| 18 | Whole-repo frontend Jest suite | `npm test` without `--maxWorkers=1` | **NOT CLAIMED — ENVIRONMENT RESOURCE LIMIT** (OOM on 16 GB, pre-existing, §24.2) |

Rows 1–16 were each executed in this session. Rows 17–18 are reported as *not run to completion*, **never** as passes. Live non-UI checks total **224**; live browser checks total **129**; **353 live checks in all**.

**How the sections below map to the requested report items**

| Requested item | Section |
|---|---|
| 1 What the printed slip shows | §5 |
| 2 Reuse of the existing print architecture | §7 |
| 3 Server-generated `visitor_reference` | §4 |
| 4 Mandatory physical signature area | §6 |
| 5 Optional digital signature | §8 |
| 6 Private, authorised image storage | §9 |
| 7 Host confirmation fields | §10 |
| 8 What host confirmation must not change | §10.3 |
| 9 No false identity-verification claim | §11 |
| 10 Permissions and guards | §12 |
| 11 Activity logging | §13 |
| 12 Division-scoped slip access | §12.3 |
| 13 Print output quality (A4, margins, single page) | §14 |
| 14 Preview modal is non-mutating | §15 |
| 15 Where printing is offered | §15.3 |
| 16 Completed visitors remain printable | §16 |
| 17 Migration shape and reversibility | §17 |
| 18 Tests | §18 |
| 19 Live verification | §19, §20 |
| 20 Quality gates, environment limits, scope discipline, commit status | §21–§27 |

---

## 1. What Prompt #19 delivered

1. **A printable visitor slip** — company, visitor name, masked CNIC, mobile, visitor company/source, host, host department, division, location, Time-In, Time-Out, status, photo, visitor reference, created by/at, host-confirmation status, and a physical signature block.
2. **One slip layout source** (`frontend/src/utils/visitorSlipHtml.ts`) used by **both** the on-screen preview and the printed document, so the preview cannot drift from what the printer receives.
3. **No second printing system** — the slip goes through the project's existing `printHtmlContent` → hidden-iframe → A4 `@page` pipeline.
4. **A server-generated `visitor_reference`** — `VIS-<UTC year>-<6 digits>`, unique, searchable, printable, and never a raw UUID in any human-facing place.
5. **A mandatory physical signature area** — always present, always large enough for handwriting, **even when a digital signature exists**.
6. **An optional digital signature** — draw / clear / save, stored as a private file, never as base64 in the visitor row.
7. **Host confirmation** — `host_confirmed`, `host_confirmed_at`, `host_confirmed_by`, recorded on the server, which does **not** set a Time-Out, does **not** move `PENDING → COMPLETED`, and does **not** touch Time-In / Division / Location.
8. **A private, authorised image path** — the photo and the signature are fetched through their own permission-checked endpoints; the internal `STORAGE_PATH` value never leaves the server.
9. **A non-mutating print preview modal** with Cancel / Print, and print entry points from the list row, the detail view, and the post-creation success panel.
10. **One new permission**, `visitor.slip.print`, rather than widening an existing one.
11. **224 live non-UI checks and 129 live browser checks**, all passing.
12. **Three defects found and fixed** — two §13 print-layout violations (§23.2, §23.3) and one pre-existing content-validation hole in the Prompt #17 photo upload (§23.1).

## 2. Explicitly NOT in this prompt

| Deferred | Prompt |
|---|---|
| Vehicle Management | #20 |
| SMS / WhatsApp notifications | out of scope per the prompt |
| Dashboard widgets / advanced analytics / exports | #21 |

Nothing in this prompt touched Prompts #20–#21, and nothing about them was pre-built.

---

## 3. Database migration — `ERP-00071`

`supabase/migrations/20260930000000_erp_00071_visitor_slip.sql`

**Additive only.** Nothing was dropped, renamed, retyped, or re-constrained. The `status` `CHECK` and every Prompt #17/#18 column were verified intact after the migration ran.

| Change | Definition | Why |
|---|---|---|
| `visitor_reference VARCHAR(30)` | added **NULL** first, backfilled, then set `NOT NULL` | adding it `NOT NULL` directly would fail on the pre-existing row; the backfill had to run before the constraint could be applied safely |
| `uq_visitor_entries_reference` | `CREATE UNIQUE INDEX` | a duplicate reference is a security identifier collision — the database must be the final arbiter, not the application |
| `host_confirmed BOOLEAN NOT NULL DEFAULT FALSE` | | §10 |
| `host_confirmed_at TIMESTAMPTZ NULL` | | §10 |
| `host_confirmed_by UUID NULL` | **no FK** | matches the existing `created_by` / `updated_by` / `exited_by` convention, which deliberately carries no FK |
| `signature_path VARCHAR(500) NULL` | | §9 — a *storage reference*, never image data |
| `signature_mime VARCHAR(100) NULL` | | recorded from the file's own content (§23.1) |
| `signature_captured_at TIMESTAMPTZ NULL` | | §5 |
| `signature_captured_by UUID NULL` | **no FK** | same convention as the other actor columns |
| `visitor.slip.print` permission | granted to `SUPER_ADMIN`, `ADMIN`, `MANAGEMENT` | §12 |

**Backfill.** Existing rows were numbered `VIS-<year>-<6 digits>` in `created_at` order, so the seeded visitor received `VIS-2026-000001`. Verified live.

**Reversibility.** The migration carries an explicit rollback block, and §17 of the live DB script re-reads the column, index and permission catalogue to prove the shape rather than trusting the file.

**No speculative index.** Exactly one index was added, and it exists to enforce a stated invariant (uniqueness), not to guess at query patterns.

**RLS unchanged.** The table's existing row-level policy was left exactly as Prompt #16/#17 defined it; the new columns inherit it.

---

## 4. The server-generated `visitor_reference`

**Rule.** The reference is the server's, it is human-readable, it is unique, and it is stable for the life of the visit.

```
VIS-2026-000027
```

**Generation.** `nextVisitorReference()` reads the highest existing number for the current `VIS-<year>-` prefix and adds one, zero-padded to six digits — the project's own document-number convention, the same one `DispatchPackageService.generateNextPackageNo` already uses.

**Why a retry loop.** "Highest existing + 1" is inherently race-prone: two visitors registered in the same second can read the same high-water mark. A reference that reception reads aloud over a gate intercom is a security identifier, so a duplicate is not acceptable. A Postgres `23505` unique violation is therefore caught and retried with a fresh number, up to `REFERENCE_MAX_ATTEMPTS = 5` (exported so the test can assert the bound). Any **other** database error is rethrown immediately rather than retried — a genuine failure is never disguised as a collision.

**Assigned last.** The reference is written in a separate, dedicated `saveWithVisitorReference()` call, after the entry payload is built. The column is `NOT NULL`, so the value is assigned before the insert reaches the database, and a collision can be retried without touching any other field.

**Raw UUIDs are never a visual identifier.** The entry `id` remains the primary key it always was and is used by every existing endpoint; the reference is an *additional* human identifier. Nothing that showed an id before was changed, and nothing new shows one.

**Searchable.** `visitor_reference` was added to the list endpoint's existing `search` parameter, so a slip that is handed back at the gate can be looked up by the number printed on it.

**Live proof.** §19 step 2 asserts a freshly created visitor receives a well-formed reference; §19 step 9 re-reads the sequence after several creations; the residue script (§20.4) re-checks that **every** reference in the table matches `^VIS-\d{4}-\d{6}$` and that none is duplicated.

---

## 5. What the printed slip shows

Rendered by `renderVisitorSlipHtml(slip, assets, logoUrl)`:

```
┌────────────────────────────────────────────────────────────────┐
│ [logo]  PAKWIZ INDUSTRIAL SOLUTIONS (PVT) LTD                 │
│         Security & Reception — Lahore, Pakistan               │
│                          VISITOR SLIP          ┌─────────────┐ │
│                          RETAIN THIS SLIP …    │  VIS-2026-  │ │
│                                                 │  000027     │ │
│                                                 │   PENDING   │ │
│                                                 │  ┌───────┐  │ │
│                                                 │  │ PHOTO │  │ │
│                                                 │  └───────┘  │ │
├─────────────────────────────────────────────────┴─────────────┴─┤
│ VISITOR INFORMATION                                              │
│ Visitor Name │ CNIC (masked) │ Mobile │ Company / Source         │
│ PERSON BEING VISITED (HOST)                                       │
│ Host Name │ Department │ Division │ Location                    │
│ VISIT                                                            │
│ Time-In │ Time-Out │ Status │ Host Confirmation │ Confirmed By  │
├──────────────────────────────────────────────────────────────────┤
│ HOST CONFIRMATION                                                │
│ The host signs below … must be returned to Security on departure.│
│ ────────────────────────   Host Signature (digital, captured …)  │
│ ──────────────   Host Name        │  ──────────────  Date / Time  │
│ ───────────────────────────── Security / Reception Use            │
├──────────────────────────────────────────────────────────────────┤
│ Created By: … │ Created At: 28-Sep-2026 16:05                    │
│ This slip is issued by Security at the gate. …                   │
└──────────────────────────────────────────────────────────────────┘
```

**Every field the brief requires is present**, and the reading order matches how a gate officer uses the document: who is here → who they came for → the visit itself → the signature.

**The company name is real.** The `Company` repository is injected into `VisitorEntryService` and the slip prints the actual `legalName` (in the dev database, `PakWiz Industrial Solutions (Pvt) Ltd`), with a documented fallback constant if a row has none. It is not hard-coded to the seeded name.

**The CNIC is masked** through the project's existing `maskCnic` helper, so the printed slip carries `35202-*******-9`, not the full identity number.

**Times are printed for humans.** The API returns UTC ISO-8601; the slip renders `DD-MMM-YYYY HH:mm` local — exactly the format the rest of the ERP uses — so the paper and the screen agree. A missing value becomes an em dash; an unparseable stored value is passed through verbatim rather than printed as `Invalid Date` or silently discarded. This was a **defect found by live verification** and is covered in §23.4.

**The slip exposes images only as booleans plus authorised URLs.** `hasPhoto` / `photoUrl` and `hasSignature` / `signatureUrl` — never `photoPath` or `signaturePath`. Live check: the printed markup contains no `visitors/<uuid>/` path and no `photoPath` / `signaturePath` key at all.

---

## 6. The physical signature area is mandatory

**Rule.** A printed slip always has somewhere to sign by hand, whether or not a digital signature was captured.

This is the requirement most easily broken by a plausible-looking implementation, and it **was** broken — twice — before the browser run (§23.2, §23.3). The final layout is pinned by a test that asserts the blank survives the presence of a digital signature, and by a live geometry assertion that measures the rendered box in millimetres.

The confirmation block has **four** ruled lines:

| Blank | Rendered size | Purpose |
|---|---|---|
| **Host Signature** | **12.7 mm tall × 89 mm wide** | the mandatory signature |
| Host Name | 9 mm × 89 mm | the signer prints their name |
| Date / Time | 6.9 mm × 89 mm | when they signed |
| Security / Reception Use | 6.9 mm × 182.7 mm | the gate officer's own mark |

The signature blank is roughly 12.7 mm tall — more than enough for a handwritten signature — and the live run asserts both bounds, plus that *every* other ruled blank is at least 6 mm so nothing degrades into a hairline.

**A digital signature is an addition, never a replacement.** When one exists it is printed on its **own, separately labelled** line ("Host Signature — digital, captured 28-Sep-2026 16:05"). It does not occupy the blank, and it does not create a second "Host Signature" label that could be mistaken for the physical one.

---

## 7. Reuse of the existing print architecture

**No second printing system was introduced.** The slip flows through the pipeline the project already had:

```
renderVisitorSlipHtml()          ← ONE layout source
        │
        ├── VisitorSlipPreview   ← the on-screen modal
        │
        └── printVisitorSlipDocument()  (printTemplates.ts)
                    │
                    └── printHtmlContent()  ← the pre-existing helper
                                │
                                └── hidden iframe → A4 @page → window.print()
```

`printHtmlContent` was already used by other modules; `printVisitorSlipDocument` is a thin, visitor-specific wrapper that supplies the same markup the preview showed.

**Images are fetched with session auth, not public URLs.** The photo and signature are retrieved through `apiService.getFile` (an authenticated request), downscaled, and inlined as `data:` URLs. A fetch failure returns `null` rather than throwing, so a missing image degrades the slip and never blocks printing.

**Print output is the same on every path.** Because preview and print share one renderer, the live UI run captured the *actual* document the print frame produced and asserted against it — not a re-implementation.

---

## 8. The optional digital signature

**Optional, in the full sense.** A visitor can be confirmed with no signature at all; the detail view then reads `Not captured (physical slip only)`.

`SignaturePad.tsx` is a canvas control using pointer events, with **Clear** and **Save**, exporting at most `MAX_EXPORT_EDGE = 480` px on the long edge.

| Limit | Value | Why that value |
|---|---|---|
| `MAX_SIGNATURE_BYTES` | `60 * 1024` | a signature is line art; 60 KB is generous and bounds storage |
| `MAX_SIGNATURE_DATA_URL_CHARS` | `85_000` | deliberately **below** Express's 100 KB body cap, so an oversized signature produces an **explained 400** instead of an opaque **413** |
| content check | PNG magic number | a data URL can lie about its content; the PNG signature cannot |

**Storage is a reference, never image data.** The decoded bytes are written to a private file and the row stores `signature_path`, `signature_mime`, `signature_captured_at`, `signature_captured_by`. Live assertions confirm no visitor column contains base64 or a data URL, and that every stored signature is a real PNG by its on-disk magic number.

**A failed confirmation leaves nothing behind.** `persistSignature` writes the file only once the confirmation is known to be going ahead, and a lost race triggers `discardSignature`. Live check: **no `signature-*` file exists that is not referenced by a row** — the rollback path demonstrably cleans up after itself.

---

## 9. Private, authorised image storage

Both images live under the server's private `STORAGE_PATH` at
`visitors/<companyId>/<entryId>/<uuid>.<ext>` and are served only through permission-checked endpoints.

| Property | How it is enforced | Live check |
|---|---|---|
| Never a public URL | the value returned to the client is `/visitor/entries/:id/photo`, a route, not a path | the printed markup contains no `visitors/<uuid>/` string |
| Never an absolute path or URL in the row | every stored path matches `^visitors/<0-9a-f-]{36}/[0-9a-f-]{36}/` | asserted for every row |
| Never inline image data | storage reference only | no column exceeds 300 characters; no `base64` / `data:image` anywhere |
| Traversal defence in depth | paths are server-built; both readers resolve and re-check containment | a `..%2f..%2f..%2fetc%2fpasswd` id is refused and leaves no file |
| Content is verified, not just labelled | JPEG / PNG / WebP detected from the bytes (§23.1) | a body of plain text declared `image/jpeg` is refused |

---

## 10. Host confirmation

### 10.1 Endpoint

```
POST /api/v1/visitor/entries/:id/host-confirmation
Authorization: Bearer <jwt>
```

```jsonc
// request — the ONLY two things a client may state
{ "signatureDataUrl": "data:image/png;base64,…",  // optional
  "note": "Visitor met the team" }                // optional

// 201
{ "success": true,
  "data": { /* the updated record, confirmation included */ },
  "message": "Host visit confirmed successfully" }
```

| Status | Meaning |
|---|---|
| 201 | confirmed; the updated record is returned |
| 400 | invalid signature payload, or a client tried to send a server-owned field |
| 403 | the division is outside the caller's access scope |
| 404 | no such entry |
| 409 | already confirmed — including a concurrent request |

### 10.2 Server-owned fields

`CLIENT_OWNED_HOST_KEYS` is the same explicit mechanism the Prompt #18 exit uses: the two sets are kept separate so a rejection message names the rule the user actually hit. It contains all 15 exit keys plus:

`hostConfirmed` · `host_confirmed` · `hostConfirmedAt` · `host_confirmed_at` · `hostConfirmedBy` · `host_confirmed_by` · `hostEmployeeId` · `host_employee_id` · `hostNameSnapshot` · `signaturePath` · `signature_path` · `signatureMime` · `signature_mime` · `signatureCapturedAt` · `signature_captured_at` · `signatureCapturedBy` · `signature_captured_by` · `visitorReference` · `visitor_reference`

`ConfirmHostVisitDto` also declares none of them, so the global `ValidationPipe` (`forbidNonWhitelisted: true`) already answers 400 on its own — the explicit list makes the guarantee independent of the pipe's configuration. **Live: all 19 keys sent one at a time → 19 × 400, and the visitor was unchanged.**

### 10.3 What host confirmation must not change

This is the invariant the whole feature rests on, so it is enforced by the **query**, not by omission:

```ts
const updateResult = await this.visitorRepo.update(
  { id, companyId, hostConfirmed: false },   // ← the ONLY predicate
  { hostConfirmed: true, hostConfirmedAt: now, hostConfirmedBy: userId, /* …signature… */ },
);
if ((updateResult?.affected ?? 0) === 0) { /* 409, and the signature file is removed */ }
```

- `status` is **not** in the payload → a confirmed host is still `PENDING`.
- `timeOut` is **not** in the payload → departure is still the exit's job.
- `timeIn`, `divisionId`, `locationId`, `hostEmployeeId` are **not** in the payload.
- The predicate includes `hostConfirmed: false`, so two officers confirming at once produce **one** 201 and **one** 409 — and the loser does not get a half-written record.
- The service **never calls `save()`**, so an unchanged field cannot be clobbered by a full-entity write.

**Live proof.** A dedicated step confirms a visitor, then re-reads the row and asserts `status` is still `PENDING`, `time_out IS NULL`, and Time-In / Division / Location are byte-identical to before. The residue script re-asserts `status = COMPLETED ⇔ time_out IS NOT NULL` on **every** row in the table, and that no unconfirmed row carries a confirmation timestamp or actor.

---

## 11. No false identity-verification claim

The system never verifies that the person signing is the host. It records **which authenticated ERP user performed the confirmation**, and it says so on the document.

- `host_confirmed_by` is the **authenticated ERP user id** that performed the confirmation.
- The host remains `host_employee_id` / `host_name_snapshot` — `person_being_visited` is never overwritten by the confirmer.
- The slip payload carries `hostIdentityVerified: false`, **hard-wired**, not derived from anything.
- The printed slip renders `Confirmed By: <id> (ERP user — host identity not verified)`.
- The **host name** is read through the employee master, not inferred from the confirmer.

**No identity matching was implemented, deliberately.** `erp_users.employee_id` is a loose `varchar(100)` with no uniqueness guarantee and no referential integrity, so any attempt to match a signer to a host would produce confident-looking nonsense. This is recorded in the code as a decision, not left as an omission.

The brief's "don't use a raw UUID as a visual identifier" applies to the **visitor reference** — which is now `VIS-YYYY-NNNNNN` everywhere a human reads it. The confirming ERP user's id is retained verbatim because replacing it with a display name would require a join to `erp_users` and, more importantly, printing a *name* there would imply an identity check the system never performed. The slip states the limitation on its face instead.

---

## 12. Permissions, guards, and scope

### 12.1 Guards — the existing chain, unchanged

`SupabaseJwtGuard → PermissionGuard → OrgScopeGuard → DivisionScopeGuard`

Every new endpoint uses the same decorators the rest of the module already uses. No guard was added, weakened, or bypassed.

### 12.2 Permission split

| Action | Permission | Rationale |
|---|---|---|
| print a slip | **`visitor.slip.print`** (new) | printing a document that leaves the building is a distinct act from viewing a row |
| confirm the host visit | `visitor.entry.update` (existing) | it is an update to the entry, and reusing it avoids a permission explosion |
| fetch the signature / photo image | `visitor.entry.view` (existing) | it is the row's own image |

`visitor.slip.print` is granted to `SUPER_ADMIN`, `ADMIN`, `MANAGEMENT`. Frontend `can('visitor.slip.print')` controls only whether the button is offered — **the backend is the enforcement point**, and the live API script proves an unauthorised caller gets a refusal regardless of what the UI would have shown.

### 12.3 Division-scoped slip access

```
GET /api/v1/visitor/entries/:id/slip
```

The slip is built by `getSlip()`, which resolves the row through the **same** `findRow(id, companyId, allowedDivisionIds)` used by every other read — so a guessed id or a guessed reference is answered before any payload is assembled.

**Live, three ways:**
- A division-restricted account narrowing its own scope sees its own visitors and gets **403** for the others — the scope probe narrows a real seeded account and restores it byte-for-byte in a `finally`.
- A **guessed UUID** is answered **404**, never a slip.
- A **guessed reference** finds nothing, because the list filter is division-scoped too.

---

## 13. Activity logging

The existing `ActivityLogService` is reused. No new logging mechanism, no new table.

```
UPDATE  target=visitor_entry/P19UI412713 Sana Yousaf
  details=Host visit confirmed for VIS-2026-000027 (digital signature captured)
```

**What the detail contains:** that a host visit was confirmed, the printable reference, whether a digital signature was captured, and an optional free-text note.

**What it never contains** — asserted live against the real `activity_logs` rows, not against the code that writes them:

- no full CNIC (13 digits, in any spelling)
- no mobile number
- no base64 or `data:` image content
- no internal storage path
- the visitor is named by its **printable reference**, not a raw UUID
- the actor is the authenticated ERP user

**One honest note on how this was verified.** The audit module is **write-only** — there is no activity-log *read* endpoint in the application. The rows were therefore verified by reading `activity_logs` directly over a SQL connection, which is a stronger check than an API read would have been, and is why §20.4 exists as a separate script.

---

## 14. Print output quality

Measured, not assumed. The live UI run sizes the browser viewport to the **A4 content box** (190 × 281 mm at 96 dpi = 718 × 1062 px), produces a real PDF with `printBackground: true, preferCSSPageSize: true`, and parses `/Count` to count pages.

| Assertion | Result |
|---|---|
| Page size | A4 via the project's existing `@page` rule (8 mm top/bottom, 10 mm sides) |
| Page count | **exactly 1**, for PENDING and for COMPLETED |
| No blank pages | confirmed by the single-page count and by the content-height measurement |
| No clipping | no slip text overflows its own box |
| No margin crossing | nothing crosses the 10 mm side margins |
| Fits the printable height | the slip is 718 × **649** px inside a 718 × **1062** px content box — **61 %** of the page, so it cannot spill |
| ERP navigation hidden | the printed document contains no antd navigation markup, no session/sign-out control, no button of any kind, no ERP page shell, no page action, no preview-modal footer |
| Works with no photo | renders a `No Photo` placeholder; the print still succeeds |
| Block cohesion | the confirmation block carries `break-inside: avoid` |

---

## 15. The print preview modal

### 15.1 It mutates nothing

`VisitorSlipPreview.tsx` is **GET-only**: it issues exactly one `GET .../slip` and the two image reads. The live run records every network call across the whole session and asserts:

- opening the preview produced **reads only** — **zero** writes;
- pressing **Cancel** issued **zero** writes;
- the modal states plainly that printing saves nothing.

### 15.2 It is a preview of the real thing

The modal renders `renderVisitorSlipHtml` — the identical function the printer uses. A test asserts the markup in the print frame is `innerHTML`-identical to the preview's.

### 15.3 Where printing is offered

| Entry point | Test id | Notes |
|---|---|---|
| List row | `visitor-slip-<id>` | reception's most common path |
| Visitor detail footer | `visitor-detail-print` | where a re-print normally happens |
| Post-creation success panel | `created-print-slip` | the slip is printed at the moment of issue |

The host-confirmation action sits in the same detail footer and is **hidden once the visit is confirmed**, so a second confirmation is not offered in the UI (and is refused with 409 if forced).

---

## 16. Completed visitors remain printable

A `COMPLETED` visitor prints normally, with the real Time-Out in place of `Pending`, the same reference, and the host confirmation intact. Verified in the live browser run for both a PENDING and a COMPLETED visitor, and re-verified after the exit within the same session: exit → print again → `COMPLETED` on the paper, the real Time-Out, `CONFIRMED` preserved.

---

## 17. Backend implementation notes

`backend/src/modules/visitor/services/visitor-entry.service.ts`

| Function | Responsibility |
|---|---|
| `getSlip(id, companyId, allowedDivisionIds)` | the print payload; purpose-built, not the list row reused |
| `confirmHostVisit(...)` | the one-way transition, with the conditional update |
| `assertHostConfirmationAllowed(current)` | 409 when already confirmed, 409 when `CANCELLED` |
| `persistSignature(...)` / `discardSignature(...)` | write-then-commit, and the compensating delete |
| `resolveSignature(...)` | permission-checked read, containment re-checked |
| `saveWithVisitorReference(...)` / `nextVisitorReference(...)` / `isUniqueViolation(...)` | the reference, with bounded retry |

`Company` is injected into the service and registered in `visitor.module.ts` `forFeature`, so the slip prints the real company legal name.

---

## 18. Frontend implementation notes

| File | Role |
|---|---|
| `frontend/src/utils/visitorSlipHtml.ts` | **the** slip layout; the single source for preview and print |
| `frontend/src/utils/visitorSlipAssets.ts` | authenticated image fetch + downscale, failing to `null` |
| `frontend/src/utils/printTemplates.ts` | `printVisitorSlipDocument` → the existing `printHtmlContent` |
| `frontend/src/components/shared/SignaturePad.tsx` | canvas, pointer events, Clear / Save |
| `frontend/src/pages/visitor/VisitorSlipPreview.tsx` | the GET-only modal |
| `frontend/src/pages/visitor/VisitorManagement.tsx` | print actions, host-confirmation modal, preview mount |

---

## 19. Tests

### 19.1 Backend

`npx jest src/modules/visitor --maxWorkers=1` → **5 suites / 204 tests PASS**

New Prompt #19 coverage includes: the slip payload's field set; the masked CNIC; the absence of any internal storage path; the hard-wired `hostIdentityVerified: false`; a PENDING slip; a COMPLETED slip; re-print after exit; the company-name fallback; the confirmation recording actor and server clock; the `hostConfirmed: false` predicate; the §28 "never touches status / Time-In / Time-Out / division / location" guarantee; a confirmed host remaining on-site PENDING; the reference continuing the year's sequence; retry on a unique violation; giving up rather than looping; a non-unique error surfacing immediately; reference searchability; a new entry starting clean; the exit running unchanged after a confirmation; the exit never writing a confirmation column; division scope on slip / confirmation / signature; and the photo-content guards of §23.1.

### 19.2 Frontend

`npm test -- --testPathPattern="visitor|SignaturePad|visitorSlipHtml" --maxWorkers=1` → **3 suites / 76 tests PASS**

Covers the slip layout contract, the mandatory physical blank **surviving a digital signature**, the print-pipeline handoff, the signature pad's clear/save, the preview's read-only nature, Cancel issuing no write, and the §23.4 timestamp formatting.

---

## 20. Live verification

### 20.1 API — 129 / 129 (`scratch/verify-visitor-p19.js`)

Ten groups against real HTTP on `:3001`, each with direct SQL corroboration: authentication and the new permission; create (server Time-In + reference); slip content, masking and scope; division scope on the slip; client-owned field rejection; confirmation with a digital signature; private signature retrieval; the slip after confirmation; exit then re-print the completed slip; the activity log; and that the rejected probes left no residue.

### 20.2 Database — 46 / 46 (`scratch/verify-visitor-p19-db.js`)

The migration's real effect: every new column, the unique index, the permission grant, the backfill, and proof that the Prompt #17/#18 columns and the `status` `CHECK` are untouched.

### 20.3 Division scope — 21 / 21 (`scratch/verify-visitor-p19-scope.js`)

A genuinely division-restricted seeded account has its `user_organization_scopes` row narrowed inside a `try`, and restored **byte-for-byte** in a `finally`, so the probe is self-restoring even on failure.

### 20.4 Residue, audit and storage — 21 / 21 (`scratch/verify-visitor-p19-residue.js`)

Reads the real `activity_logs` rows, walks the real `STORAGE_PATH` on disk, and reconciles the two:

- the pre-existing seeded visitor is untouched; no duplicate reference; **every** reference is `VIS-YYYY-NNNNNN`
- every stored path is a relative storage key; no inline image data
- **Prompt #19 left no orphan file** — every file it wrote is referenced by a row
- the signature rollback path left nothing behind; every stored signature is a real PNG; none exceeds the 60 KB cap
- no dangling reference; no lost Time-In; `COMPLETED ⇔ Time-Out` holds on every row
- audit details leak no CNIC, no mobile, no base64, no storage path, and name the visitor by reference

### 20.5 Upload side effects — 7 / 7 (`scratch/verify-visitor-p19-orphans.js`)

Establishes, against the running server, that a refused upload writes nothing (§23.1).

### 20.6 Browser UI — 129 / 129 (`scratch/verify-visitor-p19-ui.js`)

A real Chromium session drives the actual product: log in, create a visitor through the form, print from the success panel, confirm the host visit with a **mouse-drawn** signature, re-print from the detail, exit, re-print the completed slip, and prove the first visitor stayed `PENDING` throughout. Network calls are intercepted and asserted, so "the preview issued zero writes" is measured rather than assumed. The print frame's own `window.print()` is intercepted via an init script installed in **every** frame, so the pipeline is verified end to end rather than simulated.

> **Tooling note.** The `tools.browser.*` desktop browser reported *"No desktop browser is connected to this session"*. Verification therefore used the repo-root vendored **Playwright** with the installed Chromium, with `$env:NODE_PATH` pointed at the root `node_modules`.

### 20.7 One attributed pre-existing warning

The run surfaced exactly one console warning — antd's *"There may be circular references"* from `rc-util` `isEqual`. It was **attributed, not dismissed**:

- The call path was captured: `Field.triggerMetaEvent → rc-util isEqual`.
- `Set.prototype.has` was instrumented in-page, showing the repeated value is an **empty array** — a false positive in `isEqual`'s "already visited" guard, with no runtime effect.
- It fires on a required `Select` value change. A control page untouched by #19 (Visitor Location Management) does **not** produce it, so it is specific to this form, not universal.
- **Decisively:** re-running the probe against the **committed Prompt #18 build** of `VisitorManagement.tsx` — `git stash` of the #19 file, zero #19 markers, identical stack — reproduced the warning exactly. **It is pre-existing, not a #19 regression.**

The verification script classifies it explicitly as attributed library noise and still fails on anything else, so it is neither swallowed nor counted as a pass.

---

## 21. Quality gates — what was actually run

### 21.1 Backend

| Gate | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | **EXIT 0** |
| Lint (scoped) | `npx eslint --ext .ts src/modules/visitor` | **EXIT 0** |
| Tests | `npx jest src/modules/visitor --maxWorkers=1` | **EXIT 0 — 5 suites / 204 tests PASS** |
| Auth / permission / audit suites | `npx jest --testPathPattern "auth\|permission\|activity-log" --maxWorkers=1` | **EXIT 0 — 4 suites / 37 tests PASS** |
| Build | `npm run build` | **EXIT 0** |

### 21.2 Frontend

| Gate | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | **EXIT 0** |
| Lint (scoped) | `npx eslint` over the 9 touched files | **EXIT 0** |
| Tests | `npm test -- --testPathPattern="…" --maxWorkers=1` | **3 suites / 76 PASS** |
| Build | `npm run build` | **EXIT 0** |

> **A nuance worth recording, because it looks like a failure and is not.** The frontend build must go through the project's **own** `npm run build`, whose script forces `CI=false`. Forcing `CI=true` promotes the repository's **pre-existing** ESLint warnings to build errors and the build fails on warnings that have nothing to do with this prompt. The gate was run the way the project runs it.
>
> The build still emits a pre-existing, non-fatal `postcss-calc` warning about `frontend/src/pages/maintenance/jobCardCreate.css`, which this prompt did not touch.

> **Test-runner nuance.** This is a Create React App project, so the runner is `react-scripts test`. Invoking `npx jest` directly bypasses CRA's Babel preset and produces misleading parse errors on valid TypeScript — the project runner was used instead.

---

## 22. Test technique notes

- `visitorRepo.createQueryBuilder` defaults to a `makeQb()` builder in the visitor specs, and `FindOperator<unknown>` is used for `IsNull()` predicates, so query-shape assertions are real rather than mocked away.
- The shared photo storage directory in the specs is **not** wiped between tests, so new assertions are written against the **delta** — a rejected upload must *add* nothing — rather than against an absolute count. (The first draft asserted an absolute count and failed for exactly this reason.)
- jsdom stubs in the frontend specs must be **plain functions**, not `jest.fn()`; CRA's `resetMocks: true` strips implementations, silently turning a stub into a no-op.
- The test environment runs at UTC+5, so timestamp assertions use an `asDisplayed(iso)` helper that mirrors the slip's own `dayjs` format rather than hard-coding a wall-clock string. A hard-coded time would fail in every timezone that is not UTC.

---

## 23. Defects found during this work

### 23.1 Pre-existing: the photo upload trusted the client's declared content type — **FIXED**

**Found by** the live upload side-effect probe (§20.5), which sent a body of plain text with `Content-Type: image/jpeg` to a real visitor and compared the file listing on disk before and after.

**What happened.** The request returned **201** and the text was written into the private photo store as `<uuid>.jpg`. `savePhoto` validated only `PHOTO_MIME_EXT[file.mimetype]` — a value the client chooses — and the size. It never looked at the bytes.

**Why it matters here.** The printed slip inlines the stored photo, and the slip's safety argument rests on that file being an image. Accepting arbitrary content silently removes it. The file is also served back through the authorised photo endpoint.

**Fix.** `detectImageMime()` verifies the bytes by their own leading bytes — JPEG (SOI **plus** a real marker byte, so a three-byte stub is refused), PNG, and RIFF/WEBP — and the check runs **before** anything is written, so a rejected upload leaves no residue at all. The recorded `photo_mime` and the stored extension now follow the **content**, so a row can no longer claim a type its file is not. This mirrors the defence the Prompt #19 signature path already used for PNG, and makes the two upload paths consistent.

**Guards.** Five new backend cases cover text-as-JPEG, an empty file, a three-byte SOI stub, an SVG (scriptable, never acceptable here) and a PDF; plus two cases proving the recorded mime follows the content and that a real PNG and WebP are still accepted with the usual replace-on-upload lifecycle.

**Live re-verification.** 7 / 7 — the plain-text upload is now refused, and the traversal and empty uploads leave no file.

### 23.2 §13 violation: a digital signature replaced the physical blank — **FIXED**

**Found by** the live browser run, which reads the printed document and asks whether a **person** could sign it.

Previously, when a digital signature existed, the image was rendered **in place of** the "Host Signature" blank, and a **duplicate "Host Name"** cell appeared. The slip then had nothing to sign by hand — the exact opposite of the requirement.

**Fix.** The physical line is now rendered **unconditionally**; the digital signature is an **additional**, separately labelled line. The duplicate Host Name cell was removed. Heights were raised: `.vs-sign-rule` 26 px → 34 px, `.vs-sign-rule-main` 48 px (12.7 mm), and a `.vs-sign-line-full` variant covers the reception cell.

**Guards.** A test asserts the blank survives the presence of a digital signature; a live geometry assertion measures it in millimetres.

### 23.3 §13 violation: the signature blank was too small for handwriting — **FIXED**

Same run, same method. The "Host Signature" ruled area was too short to comfortably sign in. It is now **12.7 mm × 89 mm**, and the live run asserts that height, that width, and that **every** other ruled blank is at least 6 mm.

### 23.4 Raw ISO timestamps on a hand-signed document — **FIXED**

**Found by** a structural dump of the captured print document, which showed `Time-In: 2026-09-28T16:05:01.271Z`, `Created At: 2026-09-28T16:05:00.882Z`, and `Host Signature — digital, captured 2026-09-28T16:05:14.521Z`.

**Why it matters.** Millisecond precision and a trailing `Z` on a document a person signs is a machine artefact, and it does **not** agree with the Time-In the same row shows on screen.

**Fix.** `formatStamp()` renders `DD-MMM-YYYY HH:mm` local — the ERP's existing convention — so paper and screen agree. A missing value becomes an em dash; an unparseable stored value is passed through verbatim, so a slip never prints `Invalid Date` and a stored value is never silently discarded.

**Guards.** Two new cases (no raw ISO, no `Invalid Date`) plus a **live** check that the paper Time-In equals the Time-In the success panel showed.

---

## 24. Environment limits and items not claimed

### 24.1 Whole-repo backend ESLint — NOT CLAIMED

`npx eslint .` over the entire backend exhausts memory on this 16 GB machine (exit 134). This is **pre-existing and unrelated to this prompt**. Lint was run **scoped** to the module under change, where it is clean.

### 24.2 Whole-repo frontend Jest suite — NOT CLAIMED

The full CRA suite OOMs on 16 GB without `--maxWorkers=1`. Frontend tests were run as a **focused** set covering every file this prompt added or changed. The full suite is not claimed as passing.

### 24.3 Desktop browser unavailable

`tools.browser.*` reported *"No desktop browser is connected to this session"*. The vendored Playwright + installed Chromium was used instead. This is a substitution, and it is stated rather than presented as if the primary path had been used.

### 24.4 Verification data retained, not deleted

The live runs necessarily created real rows. The table now holds the pre-existing seeded visitor plus 33 verification visitors (`VIS-2026-000002` … `VIS-2026-000034`), all clearly named `P19*`, and 26 files under the private storage root.

**This is a deliberate, reversible decision, not an oversight.** These rows are the evidence behind every number in this report, and they are all inactive-by-nature test data in a dev database. `verify-visitor-p19-residue.js` supports `CLEAN=1` to soft-deactivate them. Nothing was hard-deleted: removing rows that an audit trail points at is an operator decision, not a verification side effect.

**Reported, not failed:** 8 files under the storage root predate this prompt (two avatars, one receipt, two dev logs, and three 417-byte visitor photos from Prompt #17/#18 verification whose entry ids no longer exist). They were identified by mtime against the first #19 row, reported explicitly, and **not** attributed to this prompt.

> **A note on my own verification tooling, recorded because it nearly produced a false pass.** The restore script for §23.1 originally omitted the `visitors/` prefix from the file key it was asked to delete. Its existence check therefore examined a path that does not exist, skipped the delete, and reported **PASS**. The independent residue script caught the file immediately. The script now resolves the key relative to `STORAGE_PATH` and asserts the file was really present before deleting, so a wrong path can never report success again. This is exactly why the orphan check was worth writing separately.

---

## 25. Scope discipline

| Boundary | Status |
|---|---|
| Additive only | ✅ no drop, rename, retype or re-constraint |
| Existing entry / exit behaviour | ✅ unchanged; re-verified live after #19 |
| `time_out` / `status` reused | ✅ never duplicated with a new column |
| Reversible | ✅ migration carries a rollback block |
| Indexes justified | ✅ exactly one, enforcing a stated invariant |
| No second printing system | ✅ the existing `printHtmlContent` pipeline |
| Frontend is UX only | ✅ every rule enforced server-side |
| No CNIC / mobile / signature / photo URL in logs | ✅ asserted against real audit rows |
| Out-of-scope prompts untouched | ✅ #20 vehicle, #21 analytics, SMS — none touched |

---

## 26. Files changed by Prompt #19

**Backend**
- `supabase/migrations/20260930000000_erp_00071_visitor_slip.sql` *(new)*
- `backend/src/modules/visitor/entities/visitor-entry.entity.ts`
- `backend/src/modules/visitor/entities/visitor-entry.entity.spec.ts` *(new)*
- `backend/src/modules/visitor/services/visitor-entry.service.ts`
- `backend/src/modules/visitor/services/visitor-entry.service.spec.ts`
- `backend/src/modules/visitor/controllers/visitor-entry.controller.ts`
- `backend/src/modules/visitor/controllers/visitor-entry.controller.spec.ts`
- `backend/src/modules/visitor/dto/visitor-entry.dto.ts`
- `backend/src/modules/visitor/dto/visitor-entry.dto.spec.ts`
- `backend/src/modules/visitor/dto/index.ts`
- `backend/src/modules/visitor/visitor.module.ts`

**Frontend**
- `frontend/src/utils/visitorSlipHtml.ts` *(new)*
- `frontend/src/utils/visitorSlipHtml.test.ts` *(new)*
- `frontend/src/utils/visitorSlipAssets.ts` *(new)*
- `frontend/src/utils/printTemplates.ts`
- `frontend/src/components/shared/SignaturePad.tsx` *(new)*
- `frontend/src/components/shared/SignaturePad.test.tsx` *(new)*
- `frontend/src/components/shared/index.ts`
- `frontend/src/pages/visitor/VisitorSlipPreview.tsx` *(new)*
- `frontend/src/pages/visitor/VisitorManagement.tsx`
- `frontend/src/pages/visitor/VisitorManagement.test.tsx`

**Verification (not shipped)**
- `scratch/verify-visitor-p19.js` · `-db.js` · `-scope.js` · `-ui.js` · `-residue.js` · `-orphans.js`
- `scratch/restore-visitor-p19-probe.js`
- `scratch/p19-ui-artifacts/` — captured print documents and PDFs

**Deliberately left unstaged** (pre-existing dirty state, unrelated to this prompt):
`backend/src/modules/sales/dto/sales-analytics.dto.ts` · `frontend/public/logo.png` · `frontend/public/logo-mark.png` · `frontend/src/theme/theme.css` · `scripts/.erp-dev-pids.json` · assorted `scratch/` images and probes.

---

## 27. Commit status and the push question

- **`ae0b2e0`** — Prompt #18, on `main`, **2 commits ahead of `origin/main`, not pushed.**
- **Prompt #19 is fully implemented, verified and written, but NOT committed.**

Nothing has been pushed. Prompt #19 is ready to be committed as a single reviewable change; whether to commit it, and whether to push the three visitor commits together, is the user's call and is being asked rather than assumed.
