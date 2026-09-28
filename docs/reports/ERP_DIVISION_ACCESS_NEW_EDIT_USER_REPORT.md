# Prompt #16B — Division Access in **New User** and **Edit User** (ONE implementation)

> Status: **COMPLETE** — live end-to-end verified against the running app (`:3000` / `:3001`) and the database.
> Preceded by Prompt #16 / #16A (access model + `divisionId must be a UUID`) → `docs/reports/ERP_DIVISION_ACCESS_IMPLEMENTATION.md`.

---

## 0. Result summary (exact)

| # | Required result | Outcome | Evidence |
|---|---|---|---|
| 1 | **New User** flow | **PASS** | `PHASE=new OK` (run exit 0): pending note → `create-full` 201 → empty state → grant ×2 → revoke ×1 |
| 2 | **Edit User** flow | **PASS** | `PHASE=edit OK` (run exit 0): load → grant → 409 → grant → save → reopen → remove → save → reopen → restore |
| 3 | **Actions → Divisions** (regression) | **PASS** | Opened, scopes loaded, both tags rendered, revoke worked, fell back to the exact empty text, re-opened after save shows both tags |
| 4 | **Grant** | **PASS** | `POST /admin/users/:id/org-scopes` → **201 ×4** (CCD/SPD for the edit user, CCD/SPD for the new user) |
| 5 | **Revoke** | **PASS** | `DELETE /admin/users/:id/org-scopes/:scopeId` → **200 ×3** (final runs), real UUID scope ids in the URL |
| 6 | Duplicate grant protection | **PASS** | `409` + toast `This organizational scope already assigned to user` + exactly **1** CCD tag stored |
| 7 | **UUID persistence** | **PASS** | Payloads contained `d1000000-…-0002` / `d1000000-…-0001`; DB `division_id` is a `uuid` column, **0** non-UUID values, **0** non-`DIVISION` rows carrying a `division_id` |
| 8 | **TypeScript** | **PASS** | `npx tsc --noEmit` → **exit 0** |
| 9 | **ESLint** (no `--fix`) | **PASS** | **0 errors**, 1 warning — `TagOutlined` unused in `UserManagement.tsx:17`, **pre-existing** (import present and unused in git HEAD too) |
| 10 | **Focused tests** | **PASS** | **5 suites / 31 tests passed** (`UserManagement*`, `PermissionMatrix.divisionAccess`, `usePermission.divisions`), exit 0 |
| 11 | **Build** | **PASS** | `npm run build` → **exit 0**; `build/static/js/main.7f9e4df1.js` (6,364,298 bytes) |
| 12 | **Database rows** | **PASS** | See §4 — 2 division rows for the edit user, 1 for the new user, `default_division_id` untouched (`null` for both) |
| — | Full frontend test suite | **NOT RUN (gap)** | Prior full run timed out at 3600 s; parallel jest/react-scripts OOM on this 16 GB machine. Only the division-access suites were executed (reported honestly, not claimed as full) |

---

## 1. Frontend

### 1.1 ONE implementation

`frontend/src/components/shared/DivisionAccessModal.tsx` is the single implementation used by **all three** entry points (Actions row, Edit form, New form):

- the modal shell, the company/division picker, grant validation, the revoke affordance, loading/error/empty states;
- `DivisionScopeTags` — the shared tag list rendered by the modal **and** by both form summaries;
- `isDivisionRestriction(scope)` / `formatDivisionLabel(scope)` — the two decisions nobody may duplicate:
  - `isDivisionRestriction` → `false` when `scopeLevel === 'COMPANY'` **or** `isFullScope === true`;
  - `formatDivisionLabel` → `DIV-CCD · Control Cable Division` (`CODE · Name`).

Exported through `frontend/src/components/shared/index.ts`.

`frontend/src/pages/admin/UserManagement.tsx` owns the **single** scope state and the API calls, so the summary behind the modal and the modal itself can never disagree:

```ts
const [divisionScopeLoading, setDivisionScopeLoading] = useState(false);  // L147
const [divisionScopes, setDivisionScopes] = useState<DivisionScope[]>([]);// L153
const [divisionTarget, setDivisionTarget] = useState<DivisionAccessTarget | null>(null); // L157
const [createdUser, setCreatedUser] = useState<DivisionAccessTarget | null>(null);       // L160
const [createScopeError, setCreateScopeError] = useState<string | null>(null);           // L163
```

There is **no** second copy of the data (no `newUser.divisions`, no `editDivisionScopes`, no per-form scope array).

### 1.2 New User flow (§2 / §6 / §16)

1. Opening the form renders `create-division-access-pending`: *"Division Access becomes available after the account is created — organization scopes can only be saved against the real database user id."* — `create-division-access-configure` does **not** exist yet.
2. `handleCreate` posts `POST /admin/users/create-full` **first**, then captures `created.data.id` (the real database id) into `createdUser` and keeps the form open.
3. `Create User` becomes disabled (`okButtonProps={{ disabled: !!createdUser }}`) → no second account, no duplicate user on retry.
4. The section then shows the success banner + `Division Access — <user>` block, and only now is `Configure` clickable → `POST /org-scopes` against the real id.
5. On success `setDivisionScopes([])` is forced before the fresh `GET` (stale-state fix: a previously selected user's scopes must never be displayed for a brand-new account).

Failure safety:

| Failure | Behaviour | Test |
|---|---|---|
| User creation fails | Dialog shows the backend message (`formatApiError`), **zero** `org-scopes` calls, section stays `pending`, form stays open for retry | test **7** (added in #16B) |
| User OK, scope save fails | Banner `User created, but Division Access could not be saved.` + toast + retry through `Configure`; `POST /admin/users/create-full` is never re-issued while `createdUser` is set | test **4** |

### 1.3 Edit User flow (§4 / §8)

- The section summary is loaded through `refreshDivisionScopes(user.id)` → `GET /admin/users/:id`, so the form shows server truth, not the row payload.
- Empty state text is exact: **`No division restriction — this user currently has full company access`**.
- Save follows **Pattern A**: `PATCH /admin/users/:id` (unchanged update API) for the profile; scopes are written only through the separate scope API. The update API was **not** rewritten.
- The PATCH body contains no `divisionId`, no `scopeLevel`, no `defaultDivisionId` (captured live, §3).

### 1.4 Division Access ≠ Default Division

- No Default Division field was added anywhere; `UpdateErpUserDto` has no `defaultDivisionId`, so the Save payload cannot carry one.
- Granting a division never writes `erp_users.default_division_id`, and nothing in the flow seeds a division scope from the default division. Verified live: both users still report `default_division_id=null`.
- Company → Division options come only from `GET /companies` and `GET /divisions?companyId=…` (DB relationships). No hard-coded division id exists in the source; the ids in this document are query results used for assertions only.

### 1.5 Rendering rule that the database audit forced (§6 / §3)

The live audit showed **12 of 12** `user_organization_scopes` rows were the auto-provisioned **COMPANY-wide** row (`scope_level='COMPANY'`, `is_full_scope=true`, `division_id=NULL`), and `createFull` inserts exactly that row for every new account (`erp-user.service.ts:180`). Consequences before the fix:

- the required empty state was unreachable for every real account;
- an unrestricted user was counted as *"1 division scope configured"*;
- a **Remove** button was offered under "Division Access" for a row that means *full access*.

Fix: `refreshDivisionScopes` and the modal placeholder filter the raw list through `isDivisionRestriction`, while the unfiltered list stays on `divisionTarget.organizationScopes`. A company-wide row therefore renders as *no restriction*, and it can never be revoked (unit test 6 asserts `deleteCalls` stays `0`).

---

## 2. Backend

**No backend code was changed in Prompt #16B**, and no new endpoint was added.

| Concern | How it is satisfied |
|---|---|
| One implementation, server as source of truth | Existing `POST /admin/users/:id/org-scopes`, `GET /admin/users/:id`, `DELETE /admin/users/:id/org-scopes/:scopeId` fully cover grant / list / revoke — the "new API" escape hatch was not needed |
| Authorization | Unchanged and authoritative: the backend org-scope guard decides; the frontend only reflects it |
| Duplicate scope protection | Backend-only, `409 This organizational scope already assigned to user` (no client-side pre-check that could drift) |
| UUID validation | `UUID_LOOSE` in `backend/src/modules/user/dto/user.dto.ts` untouched; error text still byte-identical `divisionId must be a UUID`; codes such as `DIV-CCD` are still rejected with 400 |
| Profile save | `PATCH /admin/users/:id` (`UpdateErpUserDto`) reused as-is — Pattern A |
| Audit finding | `createFull` (`erp-user.service.ts`) inserts into `auth.users` + `auth.identities` + `erp_users` **and** auto-provisions a COMPANY org-scope row (line 180) — this row is what the frontend now filters out |

---

## 3. Live end-to-end verification (real browser, real API, raw CDP)

Script: `C:\Users\afsar\AppData\Local\Temp\opencode\p16a\p16b.js` (`PHASE=edit` | `PHASE=new`), DB reader `db-final.js`.
Login `system.admin@erp.com` → `/admin/users`.

### 3.1 `PHASE=edit` → **PHASE=edit OK** (exit 0)

```
STEP 2 /admin/users loaded, division buttons = 14
ACTIONS baseline state: {"emptyState":false,"hadCcd":false,"hadSpd":true}
BASELINE cleanup: revoking DIV-SPD
REVOKE DIV-SPD: DELETE HTTP 200 …/org-scopes/0ff2dbc2-d4c8-4d91-96b4-8789453ca1b4
ACTIONS modal after revoke: "…Current division access No division restriction — this user currently has full company access…"
EDIT summary on open: "No division restriction — this user currently has full company access Configure Division Access"
GRANT DIV-CCD: HTTP 201  body={"companyId":"7725aa04-…","divisionId":"d1000000-0000-0000-0000-000000000002","scopeLevel":"DIVISION","isFullScope":false}
GRANT DIV-CCD: HTTP 409  (same payload)
DUPLICATE toast: "This organizational scope already assigned to user"
CCD tags in modal after duplicate attempt: 1
GRANT DIV-SPD: HTTP 201  body={…"divisionId":"d1000000-0000-0000-0000-000000000001"…}
EDIT summary while modal open: "DIV-CCD · Control Cable Division DIV-SPD · Spoke Division 2 division scopes configured Configure Division Access"
SAVE user: PATCH HTTP 200 body= {"displayName":…,"defaultCompanyId":"7725aa04-…" }   ← no division / scope fields
EDIT summary after reopen: "…2 division scopes configured…"                             ← persisted
REVOKE DIV-SPD: DELETE HTTP 200 …/org-scopes/effbe300-ec5d-4627-b37e-fd73ffdb906b
EDIT summary after remove: "DIV-CCD · Control Cable Division 1 division scope configured …"
SAVE user: PATCH HTTP 200
EDIT summary after removing SPD + reopen: "DIV-CCD · Control Cable Division 1 division scope configured …"
GRANT DIV-SPD: HTTP 201   → EDIT summary after restore: "…2 division scopes configured …"
ACTIONS modal (after save): "…DIV-CCD · Control Cable Division…DIV-SPD · Spoke Division…"
PHASE=edit OK
```

Covered: Actions open / load / grant / revoke / refresh / friendly names / real UUID scope ids; Edit summary load, exact empty state, persistence across reopen, remove, restore, Pattern A save.

### 3.2 `PHASE=new` → **PHASE=new OK** (exit 0)

```
STEP create form open, pending note = "Division Access becomes available after the account is created — organization scopes can only be saved against the real database user id."
Configure available BEFORE create: false
[capture] POST /api/v1/admin/users/create-full  … "email":"division.access.test@pwi.test" … → 201
CREATE section: "User created successfully. No division restriction — this user currently has full company access Configure Division Access"
Create button after create (must be disabled): true
org-scopes POSTs BEFORE configure: 0                                   ← no temp/frontend id, ever
MODAL tags before: ["No division restriction — this user currently has full company access"]
GRANT DIV-CCD: HTTP 201  {"companyId":"7725aa04-…","divisionId":"d1000000-0000-0000-0000-000000000002","scopeLevel":"DIVISION","isFullScope":false}
GRANT DIV-SPD: HTTP 201  {"…"divisionId":"d1000000-0000-0000-0000-000000000001"…}
NEW_USER_ID= 15cec9fa-4c0b-4fad-a395-73dfce1b06d3                    ← real UUID, both grants hit that URL
divisionIds sent: ["d1000000-…-0002","d1000000-…-0001"]
REVOKE DIV-SPD: DELETE HTTP 200 …/users/15cec9fa-…/org-scopes/67e53006-e010-417e-affa-492d4d021163
MODAL tags after revoke: ["DIV-CCD · Control Cable Division"]         ← friendly `CODE · Name`
PHASE=new OK  NEW_USER_ID=15cec9fa-4c0b-4fad-a395-73dfce1b06d3
```

Captured before this run: **0** `org-scopes` requests, `Configure` unreachable, Create disabled after creation.

---

## 4. Database

Read-only verification (`db-final.js`, run after the final `PHASE=edit` run):

```
user_id | division_id | code | scope_level | is_full_scope | status | scope_id
--------+-------------+------+-------------+---------------+--------+---------
Anasccd71 — 98d2e7c7-75af-44ab-a60a-190ac260a4ec (Anasccd71@gmail.com)
98d2e7c7-75af-44ab-a60a-190ac260a4ec | NULL                              | –      | COMPANY | true  | ACTIVE | facbee53-ff02-49f2-bf01-9ba51dec1055
98d2e7c7-75af-44ab-a60a-190ac260a4ec | d1000000-0000-0000-0000-000000000002 | DIV-CCD | DIVISION | false | ACTIVE | 14df543b-d5e3-4867-bb69-d50dfec7a621
98d2e7c7-75af-44ab-a60a-190ac260a4ec | d1000000-0000-0000-0000-000000000001 | DIV-SPD | DIVISION | false | ACTIVE | d14b7f3a-cd1a-4ffb-b87d-dc3959d48c00
rows=3  division_rows=2

New user — 15cec9fa-4c0b-4fad-a395-73dfce1b06d3 (division.access.test@pwi.test)
15cec9fa-4c0b-4fad-a395-73dfce1b06d3 | NULL                              | –      | COMPANY | true  | ACTIVE | ba9be238-eae8-4e46-a9f9-821d071a042c
15cec9fa-4c0b-4fad-a395-73dfce1b06d3 | d1000000-0000-0000-0000-000000000002 | DIV-CCD | DIVISION | false | ACTIVE | 3b9e8340-4e6f-419f-ae42-ba6276937793
rows=2  division_rows=1
```

Totals and invariants:

```json
{"users":14,"scopes":16,"division_scopes":3,"company_scopes":13}
non-DIVISION rows carrying a division_id : 0
division_id values that are NOT uuid-shaped : 0
```

- `user_organization_scopes.division_id` is a native **`uuid`** column → a code like `DIV-CCD` cannot be stored even if validation were bypassed.
- `default_division_id` = `null` for **both** users → Division Access never touched Default Division, and no division was auto-granted from it.
- Division rows exist only where the UI granted them: 2 for the edit user (CCD+SPD, the state required for the §14 restore), 1 for the new user (CCD — SPD was revoked live).
- Baseline before this work: 12 rows, all `COMPANY`, 0 `DIVISION`. The +3 division rows and the extra account are the documented test artefacts of Prompt #16/#16A/#16B.

Test artefact left in place (documented, not hidden): **`division.access.test@pwi.test`** / password `Testuser123!` / id `15cec9fa-4c0b-4fad-a395-73dfce1b06d3`, with its COMPANY + DIV-CCD rows, so a reviewer can re-run `db-final.js` and see the same result. To remove it, `p16a/cleanup-test-user.js` deletes `auth.identities`, `auth.users`, `user_organization_scopes`, `user_roles`, `erp_users` in a single transaction (it was used twice during this prompt to replay the create flow from scratch; both runs ended with `CLEANUP OK`).

---

## 5. Testing

Commands (all from `frontend/`, `NODE_OPTIONS=--max-old-space-size=4096`):

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **exit 0** |
| ESLint | `npx eslint src/components/shared/DivisionAccessModal.tsx src/components/shared/index.ts src/pages/admin/UserManagement.tsx src/pages/admin/UserManagement.divisionAccessForms.test.tsx src/pages/admin/UserManagement.divisionAccess.test.tsx` (no `--fix`) | **exit 0** — 0 errors, 1 pre-existing warning (`TagOutlined`) |
| Focused tests | `CI=true npx react-scripts test --watchAll=false --maxWorkers=1 --testPathPattern="(UserManagement\|divisionAccess\|usePermission.divisions\|PermissionMatrix.division)"` | **exit 0 — 5 suites / 31 tests passed** |
| Build | `npm run build` | **exit 0** |
| Full frontend suite | — | **NOT run** (see gaps) |

Suite breakdown of the focused run:

```
PASS src/pages/admin/UserManagement.divisionAccessForms.test.tsx   (20 tests)
PASS src/pages/admin/UserManagement.test.tsx
PASS src/pages/admin/UserManagement.divisionAccess.test.tsx
PASS src/pages/admin/PermissionMatrix.divisionAccess.test.tsx
PASS src/hooks/usePermission.divisions.test.ts
Test Suites: 5 passed, 5 total     Tests: 31 passed, 31 total
```

`UserManagement.divisionAccessForms.test.tsx` cases:

1. Actions → Divisions opens, loads both scopes, revokes one (DELETE routed to the scope id).
2. Edit User loads existing scopes, saves the profile, changes survive reopening (remove → reopen → restore).
3. New User — creates the account first, then grants CCD + SPD with real UUIDs and revokes SPD.
4. New User — a failed scope save is reported, retry never duplicates the user.
5. Duplicate scope protection: 409 surfaced, the division is stored once.
6. The COMPANY-wide row is not a division restriction: exact empty state, honest count, no Remove button, `deleteCalls === 0`.
7. **Added in #16B** — a failed create leaves the form pending: one `create-full` attempt, **zero** `org-scopes` calls, `scopesByUser[NEW_USER_ID]` still `undefined`, no success dialog, Configure unreachable, Create User still available for retry.

Duplicate-protection regression (must stay byte-identical / unchanged from #16A):

- backend still rejects codes and non-UUID values with `divisionId must be a UUID`;
- `UUID_LOOSE` and all `@Matches` decorators untouched in this prompt.

---

## 6. Files changed in Prompt #16B

**Added**

- `frontend/src/components/shared/DivisionAccessModal.tsx` — the ONE implementation (`DivisionAccessModal`, `DivisionScopeTags`, `isDivisionRestriction`, `formatDivisionLabel`).
- `frontend/src/pages/admin/UserManagement.divisionAccessForms.test.tsx` — 20 tests (Actions / New / Edit / failure safety / duplicate / company-row).
- `frontend/src/pages/admin/UserManagement.divisionAccess.test.tsx` — Actions regression suite (5 tests).

**Modified**

- `frontend/src/pages/admin/UserManagement.tsx` — single scope state, `refreshDivisionScopes(userId)` + company filtering, create-first capture of the real id, `setDivisionScopes([])` on create, `createScopeError` retry banner, both summaries reuse `DivisionScopeTags`.
- `frontend/src/components/shared/index.ts` — exports for the component and the two helpers.

**Not changed:** every backend file, `user.dto.ts` (`UUID_LOOSE`), the update API, the migration, the DB schema.

---

## 7. Known gaps and pre-existing issues (not fixed here)

1. **Full frontend suite not executed.** A previous attempt timed out at 3600 s, and running jest/react-scripts in parallel exhausts memory on this 16 GB machine — every run in this prompt used `--maxWorkers=1`. Only the five division-access suites (31 tests) were run; no claim is made about the rest of the suite.
2. **Backend full-repo ESLint OOM'd** (exit 134) in Prompt #16 and was not retried here; frontend ESLint on all modified files is clean.
3. **Test account** `division.access.test@pwi.test` remains in the dev database (§4) — documented, with a one-command cleanup script.
4. Pre-existing, observed but untouched: `ILIKE '%admin%'` search bypass in user listing, dead `PermissionGate.tsx`, `canModule()` case quirk, backend `assignPermissions` add-only, unused `TagOutlined` / `user.dto.ts` imports, 7 `sections` + 13 `departments` rows with non-RFC ids.
5. Harness-only races found while verifying (not product defects): the modal's list is a spinner during every refetch, so a tag-presence read must wait for idle; and the toast read must wait for React to render after the response header. Both were fixed in the verification script and the corresponding waits are now part of it.
