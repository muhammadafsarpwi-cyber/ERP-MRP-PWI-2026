# Prompt #17 — Visitor Management foundation + Visitor Entry (ONE implementation)

> Status: **delivered and verified** against the running dev stack (backend `:3001`, frontend `:3000`) and the dev database.
> Migration `20260928000000_erp_00069_visitor_management.sql` **is applied** to the dev database.
> All work in this repository is still **uncommitted** (Prompt #16 / #16A / #16B / #17 share one working tree).

---

## 0. Result summary (exact)

| Check | Command | Result |
|---|---|---|
| Migration applied + verified | `node scripts/apply-migration.js` + SQL assertions | **PASS** — 2 tables, 8 RLS policies, 10 indexes, 6 permissions, **0 seeded rows** |
| Backend type check | `npx tsc --noEmit -p tsconfig.json` | **EXIT 0** |
| Backend build | `npm run build` (`nest build`) | **EXIT 0** |
| Backend lint (scoped) | `npx eslint "src/modules/visitor/**/*.ts" "src/common/validators.ts" "src/app.module.ts"` | **EXIT 0 — 0 errors, 0 warnings** |
| Backend tests | `npx jest --runInBand --forceExit --testPathPattern "visitor"` | **EXIT 0 — 4 suites / 66 tests PASS** |
| Frontend type check | `npx tsc --noEmit` | **EXIT 0** |
| Frontend lint (scoped) | `npx eslint` over App/nav/shared/PhotoCapture/api/`pages/visitor` | **EXIT 0 — 0 errors, 4 pre-existing warnings** |
| Frontend focused tests | `CI=true npx react-scripts test --watchAll=false --maxWorkers=1 --testPathPattern "(visitor\|PhotoCapture\|navigationConfig)"` | **EXIT 0 — 3 suites / 43 tests PASS** |
| Frontend build | `npm run build` (CRA) | **EXIT 0** |
| **Live API end-to-end** | `node p17_live_verify.js` (real HTTP against `:3001`) | **`LIVE_SUMMARY total=24 passed=24 failed=0`, EXIT 0** |
| **Browser UI end-to-end** | `node p17_ui_smoke.js` (raw CDP against `:3000`) | **`UI_SUMMARY total=27 passed=27 failed=0`, EXIT 0** |
| Test data cleaned up | SQL re-count after cleanup | **`locations=0 visitor_entries=0 visitor_permissions=6`**, photo dir emptied |

Nothing in the table above was claimed without running it.

---

## 1. What Prompt #17 delivered

1. **Module foundation** — a new backend module `backend/src/modules/visitor/` plugged into `AppModule` (no parallel auth system; it reuses the existing guard stack).
2. **`locations` master** — a new, additive `locations` table in the shape **Company → Division → Location**, with its own CRUD API, page and permissions.
3. **`visitor_entries` table** — visitor register with division/location snapshots, host snapshot, photo reference, server-generated Time-In.
4. **Visitor Entry create/list/detail APIs** with server-side authorization and division filtering.
5. **Photo capture** — camera capture + upload fallback component (`PhotoCapture`), stored on disk and served only through an authenticated endpoint.
6. **Host selection** from the existing employee master (`hr_employees`), filtered to the caller's authorized divisions.
7. **Route/menu integration** — new nav group *Visitor Management* with *Visitors* and *Locations* leaves, permission-gated.
8. **Permissions** — 6 new codes, seeded with role grants by the migration.
9. **Tests** — backend 4 suites/66 tests, frontend 3 suites/43 tests, plus live API (24) and live browser (27) verification.
10. **Audit** — `created_by` / `created_at` written through the existing audit conventions.

## 2. Explicitly NOT in this prompt (deferred)

| Deferred | Prompt |
|---|---|
| Visitor Exit / Time-Out UI (the column already exists, nullable) | #18 |
| Dashboard, mobile | #19 |
| Vehicle fields, host signature, printing | #20 |
| Reporting / analytics / notifications | #21 |

Schema-wise nothing blocks #18: `time_out` is already nullable and `status` already accepts `PENDING | INSIDE | COMPLETED | CANCELLED`.

## 3. Location architecture (the decision that mattered)

* **New additive table `public.locations`**, scoped by `company_id` + `division_id`.
* **Not reused:** `warehouse_locations` (a different concept, owned by Inventory), and **not** the existing Branch / Warehouse / Store / Department masters.
* **Existing feature untouched:** `/organization/locations` (`LocationManagement`, permission `warehouse.view`) was not modified.
* **New page** `/visitor-management/locations` (`VisitorLocationManagement`) and **new API prefix** `/locations`.
* **No hard-coded division/location ids or names anywhere.** No "Nooriabad" division was created, and **no location rows are seeded** — locations are created by the user through the UI/API.
* `companyId` is **derived from the division row** on create (the client cannot choose it).
* Uniqueness: `CONSTRAINT uq_locations_code_company UNIQUE (location_code, company_id)`; live verification confirms a duplicate code → **409**.
* `status CHECK (status IN ('ACTIVE','INACTIVE'))`, default `ACTIVE`.

## 4. Migration

**File:** `supabase/migrations/20260928000000_erp_00069_visitor_management.sql` (218 lines, additive only, wrapped in `IF NOT EXISTS` → re-runnable).

Creates:

| Object | Detail |
|---|---|
| `public.locations` | `id`, `created_at`, `updated_at`, `is_active`, `created_by`, `updated_by`, `company_id`, `division_id`, `location_code`, `name`, `description`, `status`, unique code constraint |
| `public.visitor_entries` | `id`, audit columns, `company_id`, `division_id`, `location_id`, `visitor_name`, `cnic`, `mobile`, `visitor_company`, `host_employee_id`, `host_name_snapshot`, `photo_path`, `photo_mime`, `time_in NOT NULL DEFAULT NOW()`, `time_out NULL`, `status DEFAULT 'PENDING' CHECK (PENDING/INSIDE/COMPLETED/CANCELLED)`, `chk_visitor_time_out_after_time_in` |
| Indexes | **10** (3 on `locations`, 7 on `visitor_entries`, incl. `(division_id, time_in DESC)` for list paging) |
| RLS | enabled on **both** tables, **8 policies** (`_select/_insert/_update/_delete`) using `erp_core.company_in_scope(company_id)` |
| Permissions | **6** rows (see §17) + role grants for SUPER_ADMIN / ADMIN / MANAGEMENT / REPORT_VIEWER |
| Seed data | **none** — verified live: `SELECT count(*) FROM locations` = **0** before any API call |

The migration was applied with `node scripts/apply-migration.js` and re-verified afterwards with an independent SQL assertion script (tables, column types/defaults, policies, permissions, role grants, indexes, row counts).

## 5. Data model — `locations`

```
locations
├── id            uuid PK
├── company_id    uuid NOT NULL → companies
├── division_id   uuid NOT NULL → divisions        (Company → Division → Location)
├── location_code varchar(50)  NOT NULL            (unique per company)
├── name          varchar(255) NOT NULL
├── description   text NULL
├── status        varchar(20)  NOT NULL DEFAULT 'ACTIVE'  CHECK (ACTIVE|INACTIVE)
└── created_by / created_at / updated_by / updated_at / is_active
```

## 6. Data model — `visitor_entries`

```
visitor_entries
├── company_id, division_id, location_id            (division + location validated server-side)
├── visitor_name varchar(255) NOT NULL
├── cnic         varchar(20)  NOT NULL              (normalised, masked in list)
├── mobile       varchar(20)  NULL
├── visitor_company varchar(255) NULL
├── host_employee_id uuid NULL → hr_employees
├── host_name_snapshot varchar(255) NULL            (survives employee changes)
├── photo_path varchar(500) NULL, photo_mime varchar(100) NULL
├── time_in  timestamptz NOT NULL DEFAULT now()     ← SERVER GENERATED
├── time_out timestamptz NULL                       ← empty for #17
└── status   varchar(20) DEFAULT 'PENDING' CHECK (PENDING|INSIDE|COMPLETED|CANCELLED)
```

## 7. Backend module layout (17 new files)

```
backend/src/modules/visitor/
├── visitor.module.ts
├── entities/    index.ts, location.entity.ts, visitor-entry.entity.ts
├── dto/         index.ts, location.dto.ts, visitor-entry.dto.ts, visitor-entry.dto.spec.ts
├── services/    index.ts, location.service.ts, location.service.spec.ts,
│                visitor-entry.service.ts, visitor-entry.service.spec.ts
└── controllers/ index.ts, location.controller.ts,
                 visitor-entry.controller.ts, visitor-entry.controller.spec.ts
```

Registered in `backend/src/app.module.ts`. Shared validation helpers live in `backend/src/common/validators.ts` (`CNIC_PATTERN`, `MOBILE_PATTERN`, `normalizeCnic`, `maskCnic`, `normalizeMobile`, `stripPhoneSeparators`).

## 8. API endpoints

Class guards on **both** controllers: `SupabaseJwtGuard → PermissionGuard → OrgScopeGuard → DivisionScopeGuard`.
Every handler also carries `@RequirePermission(...)` **and** `@RequireOrgScope()`.

### Locations — `@Controller('locations')`

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/locations` | `location.view` | filters by `divisionId`, `search`, `status`, paging |
| `GET` | `/locations/:id` | `location.view` | 404 unknown, 403 outside authorized divisions |
| `POST` | `/locations` | `location.create` | `companyId` derived from the division; duplicate → 409 |
| `PATCH` | `/locations/:id` | `location.update` | |
| `DELETE` | `/locations/:id` | `location.delete` | |

### Visitor — `@Controller('visitor')`

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/visitor/hosts` | `visitor.entry.create` | employee master lookup, division-scoped, `search`/`divisionId`/`limit` |
| `GET` | `/visitor/entries` | `visitor.entry.view` | division-filtered list, **CNIC masked** |
| `POST` | `/visitor/entries` | `visitor.entry.create` | server Time-In, `status=PENDING`, `time_out=NULL` |
| `GET` | `/visitor/entries/:id` | `visitor.entry.view` | **full CNIC** + division/location snapshots |
| `POST` | `/visitor/entries/:id/photo` | `visitor.entry.create` | multipart `file`, ≤ 5 MB, image only |
| `GET` | `/visitor/entries/:id/photo` | `visitor.entry.view` | authenticated image stream only (no public URL) |

Anonymous calls → **401** (verified live for `/locations`, `/visitor/hosts`, `/visitor/entries` and the photo endpoint).

## 9. Authorization behavior

* **Effective divisions = user's `user_organization_scopes` INTERSECTED WITH the role-permission division scope** (`role_permission_division_scopes`) — the Prompt #16 utilities are reused (`applyDivisionScopeFilter`, `DivisionAccess`); no new mechanism.
* Enforcement points, all server-side:
  * **list**: `applyDivisionScopeFilter` on `division_id` for every list query (locations + entries + hosts);
  * **GET-by-ID**: row outside the allowed set → `403 You do not have access to this visitor record.` / `403 You do not have access to this location.`; unknown id → `404`;
  * **create**: division not authorized → `403 You do not have access to this division.`;
  * **location ↔ division**: `400 Selected location does not belong to the selected division` (verified live);
  * **host ↔ division**: `403 The selected person belongs to a division you do not have access to.`;
  * **photo**: `resolvePhoto` applies the same division check before streaming the file, plus a path-escape guard (`absolutePath.startsWith(storagePath + sep)`).
* **Frontend shows only authorized divisions** — `GET /divisions` is intersected with `usePermission().allowedDivisionIds` when `divisionsUnrestricted === false`, so the user never sees a division they cannot post into.
* The limited account `division.access.test@pwi.test` returned **403** on `POST /locations` and was scope-limited on the list — verified live.

## 10. Server-side Time-In + create rules

* `timeIn` **does not exist** on `CreateVisitorEntryDto`, and `forbidNonWhitelisted: true` is active → a client-sent `time_in`, `status`, `companyId`, `hostNameSnapshot` or `photoPath` yields **400**. Verified live: `client-supplied time_in/status rejected with 400`.
* `timeIn` is set inside the service transaction (`new Date()`), so the stored value falls inside the request window — verified: `timeIn=2026-09-28T08:30:35.874Z` while the request was in flight.
* Create always yields `status = 'PENDING'` and `time_out = null` — both asserted live.
* `hostEmployeeId` is **required** (live: `hostEmployeeId should not be empty` / `hostEmployeeId must be a UUID`).
* Cross-division location → **400** with the exact message quoted in §9.

## 11. CNIC / mobile handling

* Accepts **13 digits** or **`00000-0000000-0`**, and normalises without destroying meaning: `1234512345671` → `12345-1234567-1` (confirmed live: the detail returned the normalised full number).
* Invalid input → **400** (verified live).
* **List masks the CNIC**: `12345-*******-1` (region + check digit kept, personal digits dropped) — verified in both the API (`cnic=12345-*******-1`) and the rendered table (`list shows the MASKED CNIC`), with `list never shows the full CNIC` asserted in both suites.
* Full CNIC is returned only by the authorised `GET /visitor/entries/:id`.
* Full CNIC values are never written to logs (only the masked form appears in list responses/verification output).
* Mobile follows the existing `MOBILE_PATTERN` + `normalizeMobile` conventions (`0300-1234567` shape).

## 12. Photo capture, storage and serving

* Component `frontend/src/components/shared/PhotoCapture.tsx` — **camera capture** (`getUserMedia`) with an **upload fallback**; it is controlled (`value: File | null`, `onChange`), and degrades to the upload path when the camera is denied.
* Upload: `POST /visitor/entries/:id/photo` with `FileInterceptor('file', { limits: { fileSize: 5 MB } })`; a missing file or a non-`image/jpeg|png|webp` mimetype → **400** (`Visitor photo must be a JPEG, PNG or WebP image`), and > 5 MB → **400** (`… must be 5 MB or smaller`). These two rejections are covered by the unit suite (the live run exercised the happy path).
* Storage: `STORAGE_PATH/visitors/<companyId>/<entryId>/<uuid>.jpg`; the DB stores a **relative** `photo_path`, never a public URL.
  * In this dev environment `STORAGE_PATH` resolves relative to the backend process, so files land in `D:\ERP-MRP-PWI-2026\backend\storage\visitors\`.
* Serving: **only** `GET /visitor/entries/:id/photo` behind auth → live verification: authenticated `200 image/jpeg`, anonymous **401**.
* Frontend reads it with the existing `apiService.getFile()` (`frontend/src/services/api.ts`) and renders an object URL; `VisitorManagement.test.tsx` asserts `getFile` is called with `/visitor/entries/<id>/photo`.
* Uploading a new photo unlinks the previously stored file for that entry.

## 13. Host selection from the employee master

* `GET /visitor/hosts` queries `hr_employees` (`status='ACTIVE'`, joined to `departments`) — no new host table.
* Division filter: explicit `divisionId` → `dept.division_id = :id`; otherwise the caller's authorized division set.
* Options are `id`, `employeeCode`, `name` (`firstName lastName`, falling back to the code), `department`, `divisionId`; frontend label format `Name · employeeCode`, search placeholder `Search employee…`.
* Live result: `GET /visitor/hosts returns employee master rows | HTTP 200, rows=5`.
* **Host division is enforced on create** (403, §9).

## 14. Frontend routes and pages

| Route | Component | File |
|---|---|---|
| `/visitor-management/visitors` | `VisitorManagement` | `frontend/src/pages/visitor/VisitorManagement.tsx` |
| `/visitor-management/locations` | `VisitorLocationManagement` | `frontend/src/pages/visitor/VisitorLocationManagement.tsx` |

Both are registered inside `ProtectedRoute` in `frontend/src/App.tsx` (lines 262–263) and exported through `frontend/src/pages/visitor/index.ts`.

Both pages use the established `PageHeader`/Card conventions; because `PageHeader` returns `null` in this layout, **Refresh / New action buttons live in an in-card toolbar** on both pages (testids `visitor-refresh`, `new-visitor-button`, `location-refresh`, `new-location-button`).

## 15. Navigation integration

`frontend/src/components/layout/navigationConfig.tsx`:

* New group `key: 'visitor-management'` (violet, `UsergroupAddOutlined`) placed **between Organization and Administration**.
* Children: `'/visitor-management/visitors'` → `permissions: ['visitor.entry.view']`; `'/visitor-management/locations'` → `permissions: ['location.view']`.
* `navigationConfig.test.tsx` asserts group order, leaf permissions, route discovery and active-key resolution — and the route/permission reconciliation also covers 4 previously missing registered routes (`/reports`, `/barcode-management/gate-passes`, `/dispatch/packages`, `/production/units`), which was a pre-existing gap in that test.

## 16. Frontend form behavior

* **Division → Location dependency**: the Location `Select` shows *"Select a division first"* until a division is chosen, and after a division is chosen its options are re-fetched for that division only, **clearing any stale selection**. Verified live in the browser: with `DIV-CCD` selected the dropdown listed `P17-TEST-A · …` and `P17-UI-TEST · …` and **did not** list `P17-TEST-B` (which belongs to `DIV-SPD`).
* Division options are limited to the caller's authorized divisions (§9).
* Host field is a searchable select backed by `/visitor/hosts`.
* CNIC/mobile inputs are format-checked client-side with the same patterns the server enforces (`CNIC_SHAPE`, `MOBILE_SHAPE`), and the client cannot edit Time-In or Status.
* `Modal` keeps its content mounted (no `destroyOnClose`) so form state survives a reopen; `Form.Item` children are **not** wrapped in `data-testid` divs (that would break antd value/onChange injection).
* Success view shows the **server** Time-In, `PENDING` status and `time_out —`, and warns when a photo upload fails after the entry was saved.

## 17. Permissions

| Code | Description |
|---|---|
| `visitor.entry.view` | View visitor entries (list/detail/photo) |
| `visitor.entry.create` | Register a visitor + host lookup + photo upload |
| `location.view` | View division locations |
| `location.create` | Create a location under a division |
| `location.update` | Update code/name/status |
| `location.delete` | Delete an unused location |

Grants seeded by the migration (**verified live in the database**):

| Role | Granted |
|---|---|
| SUPER_ADMIN | all 6 |
| ADMIN | all except `location.delete` |
| MANAGEMENT | `visitor.entry.view`, `visitor.entry.create`, `location.view` |
| REPORT_VIEWER | `visitor.entry.view`, `location.view` |

Menu gating uses the 2 view codes; the create/update/delete codes are enforced by the backend on every mutating call.

## 18. Audit

* `created_by` / `created_at` / `updated_by` / `updated_at` come from the shared `BaseEntity` and are populated on every insert.
* The module imports the existing `AuditModule`; permission checks go through the existing `PermissionModule`.
* Visitor entries keep immutable division/location **snapshots** (division/location are re-read and embedded in the detail response, so later renames do not rewrite history), plus `host_name_snapshot`.

## 19. Backend tests — 4 suites / 66 tests (all PASS)

| Suite | Focus |
|---|---|
| `services/location.service.spec.ts` | create/list/filter/duplicate 409/403 outside scope/404 unknown |
| `services/visitor-entry.service.spec.ts` | create rules, **server Time-In**, `PENDING`, client `time_in` rejected, division/location/host authorization, list masking, detail full CNIC, photo storage + authorised URL, division-scoped host lookup |
| `controllers/visitor-entry.controller.spec.ts` | guard chain metadata + `@RequirePermission`/`@RequireOrgScope` on every handler |
| `dto/visitor-entry.dto.spec.ts` | CNIC/mobile/whitelist validation |

Service tests assert enforcement with the **real** `applyDivisionScopeFilter` (repositories mocked) so the division semantics under test are the production ones; fixtures use real-shaped UUIDs.

> Caveat, stated honestly: because repositories are mocked, these suites cannot catch TypeORM query-builder misuse — one such bug was found by **live** verification instead (§24).

## 20. Frontend tests — 3 suites / 43 tests (all PASS)

Run with `CI=true npx react-scripts test --watchAll=false --maxWorkers=1 --testPathPattern "(visitor|PhotoCapture|navigationConfig)"` (`NODE_OPTIONS=--max-old-space-size=4096`).

* `pages/visitor/VisitorManagement.test.tsx` — 11 tests: division-limited rendering, list load + masked CNIC, create flow + server Time-In display, validation errors, detail modal + photo fetch through `getFile`, permission gating (no `visitor.entry.view` → no list call).
* `components/shared/PhotoCapture.test.tsx` — controlled-harness suite: capture, upload fallback, denied-camera message, preview testid.
* `components/layout/navigationConfig.test.tsx` — group/leaf permissions, route ↔ permission reconciliation, active-key resolution.

> `npx jest` (bare) must **not** be used for frontend tests — it has no TS/TSX preset here; `react-scripts test` is required.

## 21. Live API verification — 24 / 24 (exit 0)

Against the running backend with a real admin login:

1. login as system admin → `201`, token issued
2. `GET /locations` → `200`
3. **no location rows were seeded by the migration** → `rows=0`
4. `POST /locations` (CCD) → `201`
5. `POST /locations` (SPD) → `201`
6. `GET /locations?divisionId=…` → only that division (`rows=1`)
7. duplicate location code → `409`
8. `GET /visitor/hosts` → `200, rows=5`
9. `POST /visitor/entries` → `201`
10. **time_in generated by the server (within the request)**
11. `status = PENDING`
12. `time_out = null`
13. client-supplied `time_in`/`status` → `400`
14. location from another division → `400 Selected location does not belong to the selected division`
15. `GET /visitor/entries` → `200, rows=1`
16. list masks the CNIC → `12345-*******-1`
17. detail returns the **full** CNIC → `12345-1234567-1` (normalised, never `*`)
18. detail carries division/location snapshots
19. `POST /visitor/entries/:id/photo` → `201`
20. authenticated `GET …/photo` → `200 image/jpeg`
21. anonymous `GET …/photo` → `401`
22. invalid CNIC → `400`
23. limited account (`division.access.test@pwi.test`) → `403`
24. account without `location.create` → `403`

**`LIVE_SUMMARY total=24 passed=24 failed=0`** (re-run at the end of the prompt; test data then deleted).

## 22. Browser UI verification — 27 / 27 (exit 0)

Hand-written raw CDP (Node 24 global WebSocket) driving headless Chrome against `http://localhost:3000`:

* welcome console renders → `sessionStorage.pwi_welcome_passed` → `/login` → `#login-heading` → submit → **`/dashboard`**
* sidebar shows the **Visitor Management** group and, after expanding it, the **Visitors** and **Locations** leaves
* `/visitor-management/locations` renders, *New Location* button present, both live rows visible, no "Nooriabad" copy
* **create a location through the UI**: open modal → choose `DIV-CCD · Control Cable Division` → fill code/name → Save → row `P17-UI-TEST` appears
* `/visitor-management/visitors` renders, *New Visitor* button present, live row visible, **masked CNIC shown, full CNIC absent, `PENDING` visible**
* New Visitor modal: fields render → **Location select blocked with "Select a division first"** → division chosen → **location options filtered to that division** → Cancel closes the modal without creating a row
* sidebar Visitors/Locations leaves present on a page inside the group

**`UI_SUMMARY total=27 passed=27 failed=0`**.

## 23. Type-check / lint / build results (all re-run after the last source change)

**Backend** (`NODE_OPTIONS=--max-old-space-size=4096`)

```
npx tsc --noEmit -p tsconfig.json                 → EXIT 0
npm run build                                     → EXIT 0
npx eslint "src/modules/visitor/**/*.ts" \
          "src/common/validators.ts" \
          "src/app.module.ts"                     → EXIT 0 (0 errors, 0 warnings)
npx jest --runInBand --forceExit \
          --testPathPattern "visitor"             → EXIT 0 (4 suites, 66 tests)
```

**Frontend** (`CI=true`, `NODE_OPTIONS=--max-old-space-size=4096`)

```
npx tsc --noEmit                                  → EXIT 0
npx eslint (App, nav config + test, shared/index,
            PhotoCapture + test, api.ts,
            pages/visitor/**)                     → EXIT 0 (0 errors, 4 warnings — all pre-existing)
npx react-scripts test --watchAll=false --maxWorkers=1 \
   --testPathPattern "(visitor|PhotoCapture|navigationConfig)"   → EXIT 0 (3 suites, 43 tests)
npm run build                                     → EXIT 0
```

The 4 frontend warnings are unused imports that exist at HEAD and are unrelated to visitor work: `MaterialIssueManagement`, `MaterialReturnManagement` (`App.tsx`), `NavItem` (`navigationConfig.test.tsx`), `RiseOutlined` (`navigationConfig.tsx`). ESLint was run **without `--fix`**.

## 24. Bug found and fixed during verification

**`GET /visitor/hosts` returned HTTP 500** on the live stack while the unit tests were green.

* Stack: `TypeError: Cannot read properties of undefined (reading 'databaseName')` at TypeORM `createOrderByCombinedWithSelectExpression`.
* Cause: `qb.orderBy('e.first_name', 'ASC')` — TypeORM resolves `ORDER BY` through **entity property paths**, not raw column names.
* Fix in `visitor-entry.service.ts`: `qb.orderBy('e.firstName', 'ASC').addOrderBy('e.lastName', 'ASC')`, with an explanatory comment. Re-verified live (`rows=5`) and by re-running the whole backend battery afterwards.
* Why tests missed it: repositories are mocked, so query-builder misuse cannot surface in unit tests — this is exactly why the live API run is part of the delivery.

Also in this session: removed an unused destructured `_` in `maskCnic` (`validators.ts`) so the scoped lint is warning-free.

## 25. Known limitations and environment gaps (honest list)

1. **Full frontend test suite not run** — it OOMs on this 16 GB machine; only the focused suites were executed (always `--maxWorkers=1`). Never to be reported as passed.
2. **Backend repository-wide ESLint not run** — it OOMs (exit 134); only the touched paths were linted.
3. **4 pre-existing frontend ESLint warnings** remain (listed in §23) — untouched on purpose.
4. **No seeded locations** — the Locations page starts empty by design; the first user must create locations before registering visitors.
5. **Photo files are on local disk** (`backend/storage/visitors/…`), not object storage; the path is relative and served only through the authenticated endpoint.
6. Live/browser verification scripts live outside the repo (temp dir) — they are verification artefacts, not part of the delivered test suite.
7. `GET /visitor/hosts` paging is capped at 100 rows per request (search-driven, not a full employee list).

## 26. Files changed by Prompt #17, deferred work, commit status

**New backend (17 files)** — `backend/src/modules/visitor/**` (§7) + `backend/src/app.module.ts` (module registration) + `backend/src/common/validators.ts` (CNIC/mobile helpers).

**New frontend** — `frontend/src/pages/visitor/{VisitorManagement.tsx, VisitorLocationManagement.tsx, index.ts, VisitorManagement.test.tsx}`, `frontend/src/components/shared/{PhotoCapture.tsx, PhotoCapture.test.tsx}`.

**Modified frontend** — `App.tsx` (2 routes), `components/layout/navigationConfig.tsx` (+ test), `components/shared/index.ts` (PhotoCapture export), `services/api.ts` (`getFile()`), `hooks/usePermission.ts` (division scope shape used by both pages).

**New migration** — `supabase/migrations/20260928000000_erp_00069_visitor_management.sql`; helper `scripts/apply-migration.js`.

**Verification artefacts (not committed)** — `p17_live_verify.js` (24 checks), `p17_ui_smoke.js` (27 checks), cleanup/SQL assertion helpers, in the temp directory.

**Deferred to #18–#21** — see §2.

**Commit status** — nothing is committed yet: Prompt #16 / #16A / #16B and #17 changes are all in the same working tree alongside unrelated pre-existing modified files (`frontend/public/*`, `scratch/*`, dashboard/production/machine-target/sales modules, …).

**Database state after delivery** — migration applied, permissions seeded, **0 locations**, **0 visitor entries**, photo directory emptied (all verification data removed).

### How to reproduce the verification

```bash
# backend
cd backend && npx tsc --noEmit && npm run build
npx eslint "src/modules/visitor/**/*.ts" "src/common/validators.ts" "src/app.module.ts"
npx jest --runInBand --forceExit --testPathPattern "visitor"

# frontend
cd frontend && npx tsc --noEmit && npm run build
CI=true npx eslint src/App.tsx src/components/layout/navigationConfig.tsx src/pages/visitor/**/*.tsx
CI=true NODE_OPTIONS=--max-old-space-size=4096 npx react-scripts test \
  --watchAll=false --maxWorkers=1 --testPathPattern "(visitor|PhotoCapture|navigationConfig)"

# migration (dev DB)
node scripts/apply-migration.js
```
