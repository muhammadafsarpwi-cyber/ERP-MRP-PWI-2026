# Prompt #18 — Visitor Exit / Time-Out (PENDING → COMPLETED, server-generated Time-Out)

> Status: **delivered and verified** against the running dev stack (backend `:3001`, frontend `:3000`) and the dev database.
> Migration `supabase/migrations/20260929000000_erp_00070_visitor_exit.sql` **is applied** to the dev database and re-verified.
> Implemented **additively on top of** Prompt #17 (`93648c0`), which remains **unpushed**. Prompt #18 itself is **not committed yet** — see §25.
> Two defects were found and fixed during this work; one of them (§15.2) was **pre-existing and application-wide**, not introduced here.

---

## 0. Result summary (exact)

| # | Check | Command | Result |
|---|---|---|---|
| 1 | Migration applied + verified | `node scripts/apply-migration.js` + independent SQL assertions | **PASS** — 1 nullable `uuid` column, 1 partial index, 1 permission, 0 seeded rows |
| 2 | Backend type check | `npx tsc --noEmit` (backend) | **EXIT 0** |
| 3 | Backend lint (scoped) | `npx eslint "src/modules/visitor/**/*.ts" "src/modules/audit/**/*.ts" --max-warnings=0` | **EXIT 0 — 0 errors, 0 warnings** |
| 4 | Backend tests (visitor + auth/permission) | `npx jest --runInBand --forceExit --testPathPattern "visitor\|division\|auth\|permission\|audit\|activity-log"` | **EXIT 0 — 9 suites / 166 tests PASS** |
| 5 | Backend build | `npm run build` (`nest build`) | **EXIT 0** |
| 6 | Frontend type check | `npx tsc --noEmit` (frontend) | **EXIT 0** |
| 7 | Frontend lint (scoped) | `npx eslint "src/pages/visitor/**/*.{ts,tsx}" --max-warnings=0` | **EXIT 0 — 0 errors, 0 warnings** |
| 8 | Frontend focused tests | `CI=true npx react-scripts test --watchAll=false --maxWorkers=1 --testPathPattern "(visitor\|PhotoCapture\|navigationConfig)"` | **EXIT 0 — 3 suites / 57 tests PASS** (25 of them in `VisitorManagement.test.tsx`) |
| 9 | Frontend build | `npm run build` (CRA) | **EXIT 0** |
| 10 | **Live API end-to-end** | `node p18_live_verify.js` (real HTTP against `:3001` + direct SQL assertions) | **`LIVE_SUMMARY total=59 passed=59 failed=0`, EXIT 0** |
| 11 | **Live browser UI end-to-end** | `node p18_ui_smoke.js` (raw CDP against `:3000`) | **`UI_SUMMARY total=35 passed=35 failed=0`, EXIT 0** |
| 12 | Verification data removed | SQL + disk re-check after cleanup | **PASS** — `visitor_entries` = 1 pre-existing row only, `activity_logs` = 0, `role_permission_division_scopes` = 0, `storage/visitor` = 0 files, pre-existing location `SPI-A01` untouched |
| 13 | Whole-repo backend ESLint | `npx eslint .` | **NOT CLAIMED — ENVIRONMENT RESOURCE LIMIT** (OOM, exit 134, see §21.3) |
| 14 | Whole-repo frontend Jest suite | `npx react-scripts test` without `--maxWorkers=1` | **NOT CLAIMED — ENVIRONMENT RESOURCE LIMIT** (OOM on 16 GB, see §21.2) |

Nothing in rows 1–12 was claimed without running it. Rows 13–14 are reported as *not run to completion*, never as passes.

**How the sections below map to the 20 requested report items**

| Requested item | Section |
|---|---|
| 1 Server-generated Time-Out | §3 |
| 2 Endpoint + response contract | §4 |
| 3 PENDING → COMPLETED transition | §5 |
| 4 Already-completed error handling | §6 |
| 5 Unknown / malformed id | §6 |
| 6 Fields the exit must not change | §7 |
| 7 Enum / CHECK preservation | §8 |
| 8 Division-authorized checkout | §9 |
| 9 All / Pending / Completed filters | §10 |
| 10 UI list presentation | §11 |
| 11 UI confirmation modal | §12 |
| 12 UI detail view | §13 |
| 13 Permission model | §14 |
| 14 Exit audit (`exited_by`) | §15 |
| 15 Database migration + index | §16 |
| 16 Backend tests | §17 |
| 17 Frontend tests | §18 |
| 18 Live API verification | §19 |
| 19 Live UI verification | §20 |
| 20 Quality gates, environment limits, scope discipline | §21, §22, §23, §24, §25 |

---

## 1. What Prompt #18 delivered

1. **Visitor Exit / Time-Out** — one endpoint, `PATCH /api/v1/visitor/entries/:id/exit`, that closes a visit.
2. **Server-generated Time-Out** — the timestamp is `new Date()` on the server; every client-owned spelling of a Time-Out is rejected with **400** before the service runs.
3. **The `PENDING → COMPLETED` transition**, written with **one conditional `UPDATE`**, so a double-click or two officers at the gate can never double-close a visit or overwrite the first Time-Out.
4. **`exited_by`** — who recorded the exit, on the visitor row itself (a new nullable `uuid`, no FK, matching `created_by`).
5. **Business-error semantics** — already-checked-out is **409** with `Visitor has already checked out.`, never a 500, never a silent overwrite.
6. **Division-authorized checkout** — enforced in the service (403), built on the unchanged Prompt #16 intersection model.
7. **All / Pending / Completed list filters**, decided on the **server**, where *Pending* is `status = PENDING AND time_out IS NULL` and *Completed* is `status = COMPLETED AND time_out IS NOT NULL`.
8. **A current-day filter** (`today=true`) computed from the server's own clock — no new timezone or date system.
9. **UI**: a *Time-Out* column that spells out *Pending* for an open visit and shows the real timestamp for a closed one, a *Time Out* action only while the visitor is on site, a confirmation dialog, and a detail view with Time-Out / Status / Created By / Created At.
10. **One new permission** — `visitor.entry.update` — instead of reusing `visitor.entry.create`.
11. **Tests** — 37 new backend cases (across 3 visitor specs + 1 new audit-entity guard), 14 new frontend cases, 59 live API checks, 35 live browser checks.
12. **One pre-existing application-wide audit defect found and fixed** (§15.2), plus a permanent guard against its class.

## 2. Explicitly NOT in this prompt

| Deferred | Prompt |
|---|---|
| Visitor slip / printing, host signature, vehicle fields | #19 / #20 |
| Dashboard, current-day monitoring widgets, analytics | #19 / #21 |
| Vehicle Management | out of scope per the prompt |
| SMS / WhatsApp notifications | out of scope per the prompt |
| Advanced reporting / exports | #21 |

Nothing in this prompt touched Prompts #19–#21, and nothing about them was pre-built.

---

## 3. Server-generated Time-Out — the rule and how it is enforced

**Rule.** The Time-Out is the server's. A client can neither choose nor influence it, at any spelling.

**Mechanism (deliberate, and not the obvious one).** The exit body is typed as a plain record, not a DTO class:

```ts
// backend/src/modules/visitor/dto/visitor-entry.dto.ts
export type ExitVisitorEntryBody = Record<string, unknown>;
```

> **Why not `class ExitVisitorEntryDto {}`?** That was the first implementation and it is a trap. The global `ValidationPipe` runs with `whitelist: true, forbidNonWhitelisted: true`. For an *empty* class, class-validator emits `unknownValue: "an unknown value was passed to the validate function"` for **every** payload — including `{}` — so the endpoint would answer **400 to every single checkout**. Nest's `ValidationPipe.toValidate()` skips a plain `Object` metatype, so the record type is safe.
> This was found before the live run and is now pinned by `visitor-entry.dto.spec.ts` → *"an empty DTO class is NOT a safe way to forbid a body — it rejects everything"*.

Because nothing else validates that body, the prohibition is enforced explicitly and **before** the service is called (`visitor-entry.controller.ts`, `CLIENT_OWNED_EXIT_KEYS` — all **15** keys):

`timeOut` · `time_out` · `exitTime` · `exit_time` · `completedAt` · `completed_at` · `status` · `exitedBy` · `exited_by` · `updatedBy` · `companyId` · `divisionId` · `locationId` · `timeIn` · `time_in`

```ts
throw new BadRequestException(
  `Time-Out is generated by the server; these fields are not accepted: ${offending.join(', ')}`);
```

The Time-Out value itself is `const timeOut = new Date();` inside the service. The existing server clock convention from Prompt #17 is reused unchanged — no new timezone handling, no client clock, no `time_in` comparison.

**Live proof (§19):** all 15 keys were sent one at a time against a real PENDING visitor — **15 × 400**, and the visitor was still `PENDING` with `time_out IS NULL` afterwards. An *unrelated* extra key (`{ note: … }`) is ignored rather than fatal, and the Time-Out is still the server's (live check passes: HTTP 200, `timeOut=2026-09-28T10:33:44.023Z`).

---

## 4. API contract

```
PATCH /api/v1/visitor/entries/:id/exit
Authorization: Bearer <jwt>
Body: {}   (or any body without a server-owned key)

200 { "success": true,
      "data": { …the updated visitor record… },
      "message": "Visitor exit recorded successfully" }
```

* Same `{ success, data }` wrapper as every other endpoint in the module.
* **`data` is the same shape the detail endpoint returns** (`toDetailView`), so the client can drop the response straight into its list and detail state without a refetch. Verified live: `data.onSite === false`, `data.exitedBy`, `data.timeOut`, `data.status`.
* Guards on the route, in the module's existing order: `SupabaseJwtGuard → PermissionGuard → OrgScopeGuard → DivisionScopeGuard`, with `@RequirePermission('visitor.entry.update')` and `@RequireOrgScope()`.
* The recorded `create` response is intentionally **unchanged** (Prompt #17's contract): it returns the created record, and the derived `onSite` flag is a *view-level* field that the list, detail and exit responses carry. The frontend never depends on it after create (it reloads the list).

**Live proof:** 200, `success: true`, `id` echoed, and the derived `onSite=false`.

---

## 5. The state transition and its concurrency safety

`VisitorEntryService.checkOut()` in strict order:

1. `findRow(id, companyId, allowedDivisionIds)` — 404 for a malformed/missing id, **403 for a foreign division before any conflict check**, so an outsider cannot even learn whether the visitor is already checked out.
2. `assertCheckOutAllowed(entry)` — **409** `Visitor has already checked out.` when `time_out IS NOT NULL`; a `CANCELLED` entry is refused with a status-specific message; `INSIDE` is allowed through, because the `status` CHECK from Prompt #17 already permits `COMPLETED` from `INSIDE`.
3. **One** conditional write:

```ts
const timeOut = new Date();
const updateResult = await this.visitorRepo.update(
  { id, companyId, status: In([PENDING, INSIDE]), timeOut: IsNull() },
  { status: COMPLETED, timeOut, exitedBy: userId ?? null, updatedBy: userId ?? null },
);
```

4. `affected === 0` → re-read and answer with the **same controlled 409** a plain second call would give (the row-level lock means exactly one writer can win; the loser never overwrites the first Time-Out).
5. Re-read → `toDetailView` → one `ActivityLogService.log({ action: 'UPDATE', targetType: 'visitor_entry' })`.

**Why `repo.update()` and not `repo.save()`:** `save()` would load the entity, mutate it and write every changed column, which is exactly how a stale read ends up overwriting somebody else's Time-Out. A conditional `UPDATE … WHERE time_out IS NULL` is atomic in the database, and `affected` tells the caller whether it won.

**Live proof (§19):** two `PATCH`es fired simultaneously against one PENDING visitor → **200 + 409** (one each, never two 200s), the row ended `COMPLETED` with exactly one `time_out`, and `time_in` was byte-identical to the value the create call had returned.

---

## 6. Error taxonomy — never a 500

| Situation | Status | Message | Live result |
|---|---|---|---|
| Already checked out | **409** | `Visitor has already checked out.` | PASS, and the first Time-Out was unchanged afterwards |
| Concurrent / double checkout | **409** | same wording | PASS (one 200, one 409) |
| Client sent a server-owned field | **400** | `Time-Out is generated by the server; these fields are not accepted: …` | PASS (15/15 keys) |
| Malformed id (`not-a-uuid`) | **404** | not found | PASS — not 500, not 409 |
| Unknown uuid | **404** | not found | PASS |
| Division outside the caller's effective scope | **403** | `You do not have access to this visitor record.` | PASS |
| `?today=maybe` | **200** | coerced to "no day filter" (never widens the window) | PASS |

---

## 7. What the exit must not change

The exit writes **three** columns and nothing else: `status`, `time_out`, `exited_by` (plus the `updated_by`/`updated_at` pair the audit convention already maintains). It never touches `company_id`, `division_id`, `location_id`, the visitor identity (`visitor_name`, `cnic`, `mobile`, `visitor_company`), the host (`host_employee_id`, `host_name_snapshot`), or `time_in`.

**Live proof:** the API response after the exit was compared field by field with the create response (identical `timeIn`, `divisionId`, `locationId`, `visitorName`, `cnic`, `mobile`, `hostEmployeeId`), and the same was re-checked with a direct `SELECT` on `visitor_entries` (`time_in` ISO-identical to what the API returned at create time; `company_id`/`division_id`/`location_id` unchanged).

The enum and the `CHECK` are untouched: the migration does not alter `status`, and the live assertion prints the constraint as it stands —
`CHECK (((status)::text = ANY (ARRAY['PENDING','INSIDE','COMPLETED','CANCELLED'])))`.

---

## 8. Enum and CHECK preservation

* `VisitorEntryStatus.PENDING | INSIDE | COMPLETED | CANCELLED` — **unchanged**, no new member, no retyped column.
* `chk_visitor_time_out_after_time_in` from Prompt #17 is untouched; the server clock satisfies it by construction.
* `CANCELLED` cannot be checked out (§5 step 2) and `INSIDE` can — both asserted by unit tests **and** by the live `CHECK` re-read.

---

## 9. Division-authorized checkout

The effective division set is **unchanged from Prompt #16** — `user org scope ∩ role permission division scope` — and it is resolved by the existing `DivisionAccessService` / `DivisionScopeGuard`. The exit endpoint adds no new authorization concept; it simply refuses to act on a row outside that set, in the **service** (so a guessed id cannot be probed) as well as in the guard.

**Live proof (§19), the strict version — same user, same permission, one variable changed:**

1. A temporary `role_permission_division_scopes` row pinned **Management × `visitor.entry.update`** and **Management × `visitor.entry.view`** to `DIV-CCD` (that table was empty, so per Prompt #16 §12 a row means *restricted*).
2. A `MANAGEMENT` user logged in **inside** the pinned division → **200**, `exitedBy` = that user.
3. The same user on a visitor in `DIV-NB` → **403** `You do not have access to this visitor record.`
4. The refused call wrote **nothing**: the row was still `PENDING`, `time_out IS NULL`, `exited_by IS NULL` in the database.
5. The list for that user contained only `DIV-CCD` rows.
6. The scope row was deleted and the **identical** call was retried with the **same token** → **200**. That is the proof the 403 came from the division scope and never from a missing permission.
7. The temporary rows were removed; the table is back to 0 rows.

---

## 10. All / Pending / Completed list filters

`GET /visitor/entries` gains one parameter semantics, decided **on the server** after the authorization filter — never in the browser:

| Filter | Server-side clause |
|---|---|
| **All** (no `status`) | no implicit status or Time-Out clause at all |
| **Pending** | `status = 'PENDING' AND time_out IS NULL` — i.e. *still on site* |
| **Completed** | `status = 'COMPLETED' AND time_out IS NOT NULL` — i.e. *closed* |

A row can never satisfy both, so the two views can never overlap (asserted by unit test and by a live intersection count of **0**). `?today=true` adds server-computed local day boundaries around `time_in`, using the same clock convention that generated the Time-In.

**Live proof (§19):** `status=PENDING` returned only open rows (2), `status=COMPLETED` only closed rows (3), their intersection was empty, `?divisionId=` was honoured, `?today=true` kept only the current day, and a non-boolean `today` degrades to "no day filter" instead of failing or widening.

---

## 11. UI — how a list row reads

`frontend/src/pages/visitor/VisitorManagement.tsx`

| State | Time-Out cell | Status | Actions |
|---|---|---|---|
| On site (`PENDING` + no Time-Out) | an orange tag that **says "Pending"** — `data-testid="visitor-timeout-pending-<id>"` | `PENDING` | **Time Out** + View |
| Checked out | the **actual server timestamp** — `data-testid="visitor-timeout-<id>"` | `COMPLETED` | View only |
| Closed but not on site | `—` | as stored | View only |

* Every state is carried by **text**, not only by colour (the orange tag literally reads "Pending", the status tag literally reads `PENDING`).
* The *Time Out* button is gated on `can('visitor.entry.update')` **and** `isOnSite(row)`, so a completed row has no active action at all.
* Filters: an `allowClear` select (placeholder *All visitors* → **All**, with *Pending (still on site)*, *Completed*, *Inside*, *Cancelled*) plus a *Today only* switch and a summary chip that spells the active filter out (`ALL`, `PENDING`, …).

**Live browser proof (§20):** `visitor-timeout-pending-<id>="Pending"`, the closed row rendered `28-Sep-2026 15:46`, no `visitor-exit-<id>` existed for it, and the full row text was
`"P18 UI Open UIMUL4OUHL 12345-*******-1 03007654321 Prompt18 UI Check Abdul Hameed DIV-CCD · Control Cable Division SPI-A01 · Mohammed Afsar 28-Sep-2026 15:52 Pending PENDING Time Out View"`.

---

## 12. UI — the confirmation dialog

*Clicking "Time Out" mutates nothing.* The dialog names the visitor, the host, the division, the location and the Time-In, and offers exactly two buttons: **Cancel** and **Confirm Time-Out** (`visitor-exit-cancel`, `visitor-exit-confirm`). While the request is in flight the dialog cannot be closed and the confirm button shows a spinner, so an impatient double-click cannot produce two requests.

**Live browser proof (§20):**
* Cancel → **0 PATCH requests** observed on the wire (the request log is recorded through CDP, so "nothing was sent" is measured, not assumed) and the row was still `Pending`.
* Confirm → **exactly one** `PATCH http://localhost:3001/api/v1/visitor/entries/<id>/exit`, then the row switched to `COMPLETED` in place, the Time-Out cell changed from the word *Pending* to `28-Sep-2026 15:53`, and the *Time Out* button disappeared.

The row is updated **in place from the server's own response**, so the table can never display a Time-Out the backend did not record; when a status or day filter is active the list is also refetched, because the closed visit no longer belongs in that view.

---

## 13. UI — the detail view

The detail drawer now shows **Time-Out** (the real timestamp for a closed visit, an explicit `Pending` for an open one), **Status**, **Created By** and **Created At** alongside the existing fields, and it offers the *Time Out* action **only** while the visitor is on site. The full (unmasked) CNIC in the detail and the masked CNIC in the list are unchanged from Prompt #17.

**Live browser proof (§20):** the detail for a just-closed visitor rendered with `detail-time-out="28-Sep-2026 15:53"`, `COMPLETED`, `Created By` and `Created At`, and no `visitor-detail-exit` element existed.

---

## 14. Permission model

One new code, following the existing three-segment `<module>.<resource>.<action>` convention that Prompt #17 established (`visitor.entry.view`, `visitor.entry.create`):

```
visitor.entry.update   →  "Update a visitor entry (record the Time-Out)"
```

Granted to **SUPER_ADMIN, ADMIN, MANAGEMENT** — **not** to `REPORT_VIEWER` (a report reader has no business closing a visit). `visitor.entry.create` is untouched, and the Time-Out is deliberately **not** folded into it.

**Live proof:** the database shows exactly three role grants (`Administrator`, `Management`, `Super Administrator`); the backend refuses a checkout without the permission (unit test on the route metadata); and the frontend hides the action for a user without it (unit test 10a).

---

## 15. Audit

### 15.1 What was added
`exited_by` on the visitor row, written in the same statement as the Time-Out, plus the existing `updated_by` / `updated_at` pair. **No new audit system, no new history table, no duplicate trail** — the exit reuses `ActivityLogService` exactly like Prompt #17's create did, and completed visits are retained, never deleted.

`exited_by` is a **new** column rather than a reuse of `updated_by` on purpose: a photo uploaded after the exit bumps `updated_by` to whoever uploaded it, and the exit actor would be lost.

**Live proof (§19):** `exited_by` persisted, `updated_by` = the same actor, `updated_at` moved, and after a *subsequent* photo upload `exited_by` still named the officer who checked the visitor out. Exactly **one** audit row per successful exit, named action `UPDATE`, actor id, target name, details `Visitor exit recorded (Time-Out) for …`; a refused replay and a refused 403 wrote **no** row; the Prompt #17 create row is still there (one shared trail, not two). No CNIC or other identity payload appears in any audit row.

### 15.2 PRE-EXISTING DEFECT FOUND AND FIXED — the application-wide audit trail was silently empty

While verifying §15.1 the exit returned **200** but `activity_logs` held **0 rows — for every target type in the whole application**. The backend log gave the cause:

```
error: column "targetType" of relation "activity_logs" does not exist
```

`ActivityLog.targetType` was mapped with `@Column({ type: 'varchar', length: 100 })` and **no `name`**, while this project runs **no snake_case NamingStrategy** — every other column in the codebase names its database column explicitly (see `BaseEntity`). Postgres therefore rejected **every** insert, and `ActivityLogService.log()` swallows the error into a logger line, so the failure was invisible: the endpoint succeeded and the audit simply never existed. This affected every module that uses the shared service (maintenance, permission matrix, dashboard, visitor).

**Fix — one mapping, no new system, no behaviour change other than rows actually being written:**

```diff
-  @Column({ type: 'varchar', length: 100 })
+  @Column({ name: 'target_type', type: 'varchar', length: 100 })
   targetType: string;
```

**Permanent guard —** `backend/src/modules/audit/entities/activity-log.entity.spec.ts` (3 tests): it asserts the `ActivityLog` mapping and then scans **all 162 entity files** for a camelCase property mapped by `@Column` / `@CreateDateColumn` / `@UpdateDateColumn` without an explicit `name`. The scan is clean, and the guard was proven to fail (3/3 red) when the defect is reintroduced and to pass again after it is restored.

---

## 16. Database migration

**File:** `supabase/migrations/20260929000000_erp_00070_visitor_exit.sql` (87 lines, additive only, re-runnable, with a documented rollback). Applied with `node scripts/apply-migration.js` and re-verified with an independent SQL assertion script.

| Object | Detail | Justification |
|---|---|---|
| `visitor_entries.exited_by` | `uuid NULL`, no FK | Same shape as `created_by` / `updated_by` (which are not FK-constrained either); nullable, so existing rows are untouched |
| `idx_visitor_entries_pending` | `btree (division_id, time_in DESC) WHERE status = 'PENDING' AND time_out IS NULL` | Serves the exact query the *Pending* filter and the current-day view issue. Rows **leave** the index the moment they are checked out, so it stays small however much visit history accumulates. The existing `idx_visitor_entries_status` / `idx_visitor_entries_division_time_in` keep the unfiltered list fast, so **no other index was added**. |
| `visitor.entry.update` | 1 permission row + 3 role grants | §14 |
| Reused, not duplicated | `time_out`, `status` | Already exist and already accept `COMPLETED` |
| Seeded rows | **none** | verified: 0 rows inserted by the migration |
| RLS | unchanged | the table's policies from Prompt #17 still apply |

**Rollback** is documented in the file: `DROP INDEX idx_visitor_entries_pending; ALTER TABLE visitor_entries DROP COLUMN exited_by;` plus the permission and grant removal.

**Live re-verification:** `exited_by` is `uuid` / nullable; the partial index definition prints as
`CREATE INDEX idx_visitor_entries_pending ON public.visitor_entries USING btree (division_id, time_in DESC) WHERE (((status)::text = 'PENDING'::text) AND (time_out IS NULL))`; the `status` `CHECK` is unchanged; the three role grants are exactly as specified.

---

## 17. Backend tests

`npx jest --runInBand --forceExit --testPathPattern "visitor|division|auth|permission|audit|activity-log"` → **9 suites / 166 tests, all PASS**.

**Prompt #18 additions — 37 new executed cases**

*`visitor-entry.service.spec.ts` — 18 cases in `Prompt #18 — visitor exit / Time-Out`:*
server-generated Time-Out + exit audit · the conditional `UPDATE` guard (company + open status + NULL Time-Out) · replay refused and the first Time-Out never overwritten · a row whose Time-Out is set while the status still says `PENDING` is refused · `CANCELLED` kept out of the transition · `INSIDE` may be completed · concurrent/double checkout answered with a conflict and written once · "still open but not updated" retry answer · unauthorized division → 403 and nothing written · 403 without leaking visitor state · missing/malformed id → 404 · empty effective division set denies everything · `PENDING` filter = `status AND time_out IS NULL` · `COMPLETED` filter = `status AND time_out IS NOT NULL` · the unfiltered list gets no implicit clause · `today` bounded by the server clock · `onSite` only while PENDING with a NULL Time-Out · the Prompt #17 create → exit lifecycle on the same service.

*`visitor-entry.controller.spec.ts` — 11 cases in `VisitorEntryController — exit / Time-Out`:* route shape (`PATCH entries/:id/exit`) · the company / actor / effective division set forwarded to the service and the `{ success, data, message }` wrapper · a **400 for each of** `timeOut`, `time_out`, `exitTime`, `completed_at`, `status`, `exitedBy`, `divisionId`, `updatedBy` — each asserted to be rejected **before the service is called** · an empty (or absent) body is accepted, as a double-clicked confirm sends. The existing guard-chain table also gained one row: `checkOut → visitor.entry.update`.

*`visitor-entry.dto.spec.ts` — 5 cases:* the empty-DTO-class trap (§3), the plain-record exit body, and `ListVisitorEntriesQueryDto` cases for the `PENDING` and `COMPLETED` filters.

*`activity-log.entity.spec.ts` — 3 cases (new file):* the §15.2 guard.

## 18. Frontend tests

`CI=true npx react-scripts test --watchAll=false --maxWorkers=1 --testPathPattern "(visitor|PhotoCapture|navigationConfig)"` → **3 suites / 57 tests, all PASS** (25 in `VisitorManagement.test.tsx`, of which **14 are Prompt #18**):

pending row renders *Pending* + a Time Out action · a completed row shows the server Time-Out and offers no action · confirmation is required before any request · cancelling leaves the visitor untouched · confirm refreshes the row from the server response · a refetch happens when a filter is active · Pending filter · Completed filter · the current-day flag · the action is hidden without `visitor.entry.update` · a 403 is reported without claiming success · an already-completed visitor is reported and the list reloaded · the pending detail · the completed detail with the real Time-Out and who recorded it.

*(One deliberate test-fixture decision: the `CHECKED_OUT` fixture deliberately keeps the **same row id** as `PENDING_ROW`. With a different id the in-place row update became a silent no-op and the test passed while a real bug was present.)*

## 19. Live API verification — 59 / 59 (exit 0)

`node p18_live_verify.js` — real HTTP against `:3001` as a SUPER_ADMIN **and** as a MANAGEMENT user, plus direct `SELECT` assertions against the dev database. Full output: `LIVE_SUMMARY total=59 passed=59 failed=0`.

Highlights, verbatim:

```
LIVE_PASS | §5 time_out is the server clock (this request) | timeOut=2026-09-28T10:33:46.401Z (request at 2026-09-28T10:33:45.002Z)
LIVE_PASS | §4 every server-owned key in the exit body is rejected with 400 | 15 keys tried
LIVE_PASS | §6 second checkout → 409 business error (never 500) | HTTP 409: Visitor has already checked out.
LIVE_PASS | §6 the original Time-Out is never overwritten | first=2026-09-28T10:33:46.401Z, after replay=2026-09-28T10:33:46.401Z
LIVE_PASS | §15 two simultaneous checkouts → exactly one 200 and one 409 | statuses=200,409
LIVE_PASS | §7 malformed and unknown ids are 404, not 500 or 409 | malformed=404, unknown=404
LIVE_PASS | §11/§14 checkout outside the effective scope → 403 | HTTP 403: You do not have access to this visitor record.
LIVE_PASS | §11 the identical call succeeds once the scope restriction is removed | HTTP 200
LIVE_PASS | §13 the pending and completed views can never overlap | overlapping=0
LIVE_PASS | §8 time_in is byte-identical to the value the create call returned | db=…15:33:08 GMT+0500, api=2026-09-28T10:33:08.718Z
LIVE_PASS | §16 exactly one audit row is written per successful exit | exit rows=1, all visitor rows=2
LIVE_PASS | §19 the visitor audit trail stores no CNIC or other identity payload | rows leaking identity=0
LIVE_PASS | §16 a later photo upload bumps updated_by but keeps exited_by | exited_by=0804af57-…
LIVE_PASS | §9 the status CHECK constraint is untouched by the migration | CHECK ((status = ANY (ARRAY['PENDING','INSIDE','COMPLETED','CANCELLED'])))
```

Prompt #17 regression was checked in the same run: detail still returns the full CNIC (`12345-1234567-1`) and the division/location snapshots, the list still masks it (`12345-*******-1`), and photo upload + authenticated retrieval still work **after** an exit.

## 20. Live browser UI verification — 35 / 35 (exit 0)

`node p18_ui_smoke.js` — headless Chrome over raw CDP against the running frontend `:3000`, real login, real clicks, real network trace. `UI_SUMMARY total=35 passed=35 failed=0`. The exit flow was driven end to end: pending row → *Time Out* → dialog → **Cancel** (0 requests) → *Time Out* → **Confirm** (exactly 1 PATCH) → row becomes `COMPLETED` with the server Time-Out → Pending / Completed / All filters → detail. Highlights:

```
UI_PASS | §11 an open visitor shows the WORD "Pending" in the Time-Out cell | ="Pending"
UI_PASS | §12 cancelling sends NO request and leaves the visitor open | exit PATCH requests before=0 after=0
UI_PASS | §13 confirming sends exactly ONE PATCH to the exit endpoint | ["PATCH …/visitor/entries/<id>/exit"] (before=0)
UI_PASS | §13 the row switches to COMPLETED in place (no page reload needed)
UI_PASS | §5 the Time-Out the UI displayed is the SERVER time for this visitor | db time_out=Mon Sep 28 2026 15:53:49 GMT+0500
UI_PASS | §17 the database records WHO checked the visitor out | exited_by=0804af57-1f03-4d11-ad84-dc34f8829db1
UI_PASS | §10 the filter is server-side: the query string carries the status | a GET …/visitor/entries?...status=COMPLETED request was observed
UI_PASS | §16 the detail Time-Out is the real server timestamp | detail-time-out="28-Sep-2026 15:53"
UI_PASS | §13 the detail offers no Time Out action for a closed visitor | visitor-detail-exit absent
```

Two harness bugs were found and fixed **in the harness**, not the app, and are recorded here so the numbers are not over-read: (a) the request log counted URLs only, so a CORS preflight `OPTIONS` to the same URL read as a second PATCH; (b) the filter assertions used fixed sleeps and sampled the table mid-refetch. Both now record the HTTP method / poll for the settled state.

---

## 21. Quality gates

### 21.1 Re-run after the last source change — all PASS
Backend `tsc --noEmit` **0**, scoped ESLint (visitor + audit) **0 errors / 0 warnings**, Jest **166/166**, `nest build` **0**. Frontend `tsc --noEmit` **0**, scoped ESLint **0 errors / 0 warnings**, Jest **57/57**, CRA build **0**.

### 21.2 ENVIRONMENT RESOURCE LIMIT — full frontend test suite
Running the **whole** frontend Jest suite without `--maxWorkers=1` exhausts the 16 GB machine (worker OOM). All frontend results in this report are therefore from the **scoped** run in row 8. The full suite is **not claimed as passing**; this is a machine limit, not a code failure, and it existed before this prompt.

### 21.3 ENVIRONMENT RESOURCE LIMIT — full-repo backend ESLint
`npx eslint .` over the entire backend dies with exit 134 (out of memory). All backend lint results here are from the **scoped** run in row 3. Again **not claimed as passing**.

### 21.4 Pre-existing lint warnings in unrelated files
4 unused-import warnings in frontend files untouched by this prompt remain as they were. They are **not** in the visitor pages, and the scoped run reports **zero** warnings there.

---

## 22. Defects found and fixed during this prompt

| # | Defect | Origin | Fix | Guard |
|---|---|---|---|---|
| 1 | An empty `ExitVisitorEntryDto` class makes class-validator emit `unknownValue` for **every** body → the endpoint would answer **400 to every checkout** | introduced during this prompt, caught before the live run | the exit body is `Record<string, unknown>` + explicit key rejection | `visitor-entry.dto.spec.ts` — 2 cases |
| 2 | `ActivityLog.targetType` mapped without `name` → **every audit write in the entire application failed silently** | **pre-existing** (§15.2), found by live verification | one column mapping | `activity-log.entity.spec.ts` — 3 cases, incl. a repo-wide scan of all 162 entities |
| 3 | A test fixture used a different row id for the completed visitor, making the in-place row update a no-op and hiding a real bug | this prompt's own test | fixture shares the id with the pending row | the same test now fails on a real regression |

---

## 23. Pre-existing issues found, flagged, NOT fixed (out of this prompt's scope)

1. `PermissionGuard` treats any role whose **name** `ILIKE '%admin%'` as a superuser — a real authorization weakness, unchanged by Prompt #16/#17/#18.
2. `frontend/src/components/auth/PermissionGate.tsx` is dead code.
3. `canModule()` has a case-sensitivity quirk.
4. `RoleService.assignPermissions` is add-only (it cannot remove a grant).
5. `HrService.getEmployeeLookup` falls back to a hard-coded `companyId`.
6. 7 `sections` and 13 `departments` rows carry non-RFC ids (from Prompt #16 seeding).
7. `location_code` rejects lowercase (`Location code must contain only uppercase letters, numbers, hyphens and underscores`) — found while writing the live harness, not a defect, but worth knowing.

None of these was introduced, worsened, or silently patched here.

---

## 24. Files changed by Prompt #18

**New**
```
supabase/migrations/20260929000000_erp_00070_visitor_exit.sql     migration ERP-00070 (87 lines)
backend/src/modules/audit/entities/activity-log.entity.spec.ts    §15.2 defect guard
```

**Modified — backend (7 + 1 shared-entity fix)**
```
backend/src/modules/visitor/services/visitor-entry.service.ts          checkOut, assertCheckOutAllowed, refreshOne, filter semantics, today, onSite/exitedBy views
backend/src/modules/visitor/controllers/visitor-entry.controller.ts    PATCH entries/:id/exit, CLIENT_OWNED_EXIT_KEYS, assertNoClientExitFields
backend/src/modules/visitor/dto/visitor-entry.dto.ts                   ExitVisitorEntryBody, today
backend/src/modules/visitor/dto/index.ts                              export
backend/src/modules/visitor/entities/visitor-entry.entity.ts          exitedBy
backend/src/modules/visitor/services/visitor-entry.service.spec.ts    +18 cases
backend/src/modules/visitor/controllers/visitor-entry.controller.spec.ts  +11 cases
backend/src/modules/visitor/dto/visitor-entry.dto.spec.ts             +5 cases
backend/src/modules/audit/entities/activity-log.entity.ts             §15.2 one-line mapping fix
```

**Modified — frontend (2)**
```
frontend/src/pages/visitor/VisitorManagement.tsx        Time-Out column, Time Out action, confirm dialog, detail fields, filters
frontend/src/pages/visitor/VisitorManagement.test.tsx   +14 cases
```

Total: **13 source files** — 11 modified (+1396 / −41 lines) and 2 new (migration 87 lines, defect-guard spec 74 lines) — plus this report. Nothing else was touched: no new module, no new guard, no new auth system, no change to Prompts #16/#17 behaviour, and no duplicate of any of it.

**Verification data removed.** After the live runs: the seeded locations were deleted, all test visitors and their audit rows were deleted, the temporary `role_permission_division_scopes` rows were deleted (table back to 0), the uploaded photo files were removed, and the pre-existing `AS` visitor row and `SPI-A01` location were left **exactly** as they were.

## 25. Commit status and the push question

* `93648c0 feat(visitor): Visitor Management foundation + Division Access (Prompts #16-#17)` — committed, **still unpushed** (branch `main` is 1 ahead of `origin/main`).
* Prompt #18 is **not committed yet**. Unrelated dirty files that were already in the working tree and were deliberately **left alone**: `backend/src/modules/sales/dto/sales-analytics.dto.ts`, `frontend/public/logo.png`, `frontend/public/logo-mark.png`, `frontend/src/theme/theme.css`, `scripts/.erp-dev-pids.json`, `scratch/*`.
* Migration `ERP-00070` is **applied to the dev database** but, as always, migrations are committed as files and applied by the pipeline — please confirm that is still the intended workflow before anything is pushed.
* **Nothing has been pushed.** Say the word and I will commit Prompt #18 and push both commits.
