# ERP Machine Master — TASK20-A Final Report

**Title:** Diagnose and fix Machine Master runtime `TypeError: Cannot read properties of undefined (reading 'charAt')`

**Status:** Complete — reproduced, root-caused, fixed, regression-protected, browser-verified.

---

## 1. Reproduction

Reproduced against the actual production bundle served at `:3000`
(`main.6991229f.js` — the same hash the user reported).

- Does it happen immediately on Machine Master load? **No.** The list, table, 12
  columns and 20 rows render cleanly with zero console/page errors.
- Does it happen when a row/cell renders? **No.**
- Does it happen when opening an action/menu/drawer? **Yes — clicking the View
  (eye) action on any machine row.**
- Does it happen only with specific machine data? **No — every machine record
  triggers it** (the crash is in the detail-drawer mapping, independent of which
  row is clicked).
- Light/dark theme relevance? **None.** The crash is theme-independent.

Browser evidence (matrix run, pre-fix):

```
[noClick-4s]  errors=none    rows=20 body=3448
[view-first]  errors=[Cannot read properties of undefined (reading 'charAt')] rows=0 body=0   <- tree unmounted (white screen)
[edit-first]  errors=none    rows=20
[qr-first]    errors=none    rows=20
[dd-first]    errors=none    rows=20
[pagination]  errors=none    rows=20
```

The console stack matched the user report byte-for-byte:

```
TypeError: Cannot read properties of undefined (reading 'charAt')
    at Jxe (main.6991229f.js:2:2082054)
    at go (main.6991229f.js:2:163915)
    at Cs (main.6991229f.js:2:223602)
    at xc (...)
    ...
```

## 2. Mapping the minified stack to source

The minified bundle was opened at the exact column `2:2082054`:

```js
// Jxe === StatusBadge (frontend/src/components/shared/StatusBadge.tsx)
Jxe = e => { var t;
  let { status: n, colorMap: r, style: i } = e;
  const a = (...)[n] ?? "default",
  o = n.charAt(0) + n.slice(1).toLowerCase().replace(/_/g, " ");  // <-- crash line
  return jsx(Tag, { color: a, style: {...}, children: o });
};
```

`Jxe` is exactly `StatusBadge`; `n` is `status`. The crash is
`status.charAt(0)` in `StatusBadge.tsx:40`, raised with `status === undefined`.

## 3. Exact root cause

| Item | Value |
|---|---|
| Exact undefined value | `status` (and `criticality`) of the **detail drawer** — `detail.status` / `detail.criticality` |
| Exact component | `StatusBadge` (minified `Jxe`) — `frontend/src/components/shared/StatusBadge.tsx:40` |
| Render site | `MachineManagement` detail `Drawer` — `frontend/src/pages/master-data/MachineManagement.tsx:728-729` and `:759,:763` |
| Why undefined | `openDetail` stores the wrong object |
| Source function | `openDetail` in `MachineManagement.tsx:251-262` |

### The data-mapping bug

`openDetail` calls `GET /machines/:id` through `apiService.get`, which returns the
raw HTTP body. The **real** backend response for that endpoint is a wrapper:

```json
{ "success": true, "data": { "...machine...": true, "status": "ACTIVE", "criticality": "MEDIUM", "division": {...}, "section": {...}, "department": {...} } }
```

The wrapper has **no top-level `status` / `criticality` fields**. Pre-fix code:

```ts
const res = await apiService.get<Machine>(`/machines/${m.id}`);
setDetail(res);          // res = { success, data }  → detail.status === undefined
```

The drawer then renders `StatusBadge status={detail.status}` → `.charAt(0)` on
`undefined` → TypeError → React unmounts the entire app tree.

Critical nuance: the list endpoint `/machines` returns `{ data: [...], total }`
and is mapped correctly (`response.data`, `response.total`); the detail endpoint
returns `{ success, data }` and is NOT unwrapped. The QR deep-link endpoint
`GET /machines/qr/:id` returns the machine object directly and is already mapped
correctly (`setDetail(m)` at line 123 had to be left untouched).

### Was this introduced by TASK20?

No — verified against `HEAD`: `setDetail(res)`, the drawer badges, and the whole
drawer came from the original committed code. TASK20's UI refactor (shared
`HeaderCell`/`HighlightedCell`, denser rows, bordered actions) did not touch
`openDetail`. The crash surfaced because TASK20 verification exercises the full
Machine Master interactions including View. It is treated as in-scope (Machine
Master runtime defect) and fixed at its root.

## 4. The fix

One line, `frontend/src/pages/master-data/MachineManagement.tsx` (`openDetail`):

```ts
// before
const res = await apiService.get<Machine>(`/machines/${m.id}`);
setDetail(res);

// after
const res = await apiService.get<{ data: Machine }>(`/machines/${m.id}`);
setDetail(res.data);
```

- Corrects the data mapping (unwrap the real backend shape) — the "smallest
  correct fix" per the task.
- No `?.charAt()` sprinkling, no exception swallow, no fabricated data, no API/DB
  change, no rewrite of unrelated components.
- `GET /machines/qr/:id` (deep-link) path was verified to already return the
  machine directly and was NOT changed.
- Machine Targets behavior untouched.

## 5. Regression test (fails before / passes after)

New file: `frontend/src/pages/master-data/MachineManagement.task20a.test.tsx`

It mocks `apiService` so that `GET /machines` returns the list shape and
`GET /machines/:id` returns the **real wrapper shape** `{ success, data }`, then
renders `<MachineManagement/>`, clicks the View action, and asserts the drawer
renders the unwrapped detail (machineId `MCH-T20A`, Status badge `Active`,
Criticality badge `High`) and the table stays mounted.

Result:

```
WITH FIX (post-TASK20-A build):
  Test Suites: 1 passed, 1 total
  Tests:       1 passed, 1 total
  Time:        8.191 s

WITHOUT FIX (setDetail(res) reverted temporarily):
  Test Suites: 1 failed, 1 total
  Tests:       1 failed, 1 total
  Failure: "Error: Uncaught [TypeError: Cannot read properties of undefined
            (reading 'charAt')]"  (the exact runtime error)
```

## 6. Browser verification (after fix)

Playwright against the rebuilt bundle (`main.7311d514.js`), light + dark:

```
PASS light: 20 rows render
PASS view: no page errors
PASS view: drawer opened
PASS view: shows Active badge
PASS view: shows Medium badge
PASS view: shows machine code (APS-01)
PASS view: shows machineId (MCH)
PASS view: shows Division / Section / Department
PASS view: table still mounted
PASS edit: modal opens
PASS qr: modal opens with QR image
PASS print: modal opens
PASS status dropdown: opens with options (Set Maintenance/Deactivate/Retire)
PASS delete: Popconfirm opens
PASS page2: 20 rows; view on page 2 loads detail without crash
PASS dark: theme applied; view drawer renders badges, no crash
PASS zero runtime errors total []
```

No `charAt` TypeError in the browser console; no uncaught runtime exceptions;
all action buttons visible; the detail drawer renders the full machine record
with working Status/Criticality badges in both themes.

## 7. Build / type check / suites

- **Build:** `REACT_APP_API_URL=http://127.0.0.1:3001/api/v1 npm run build` → **PASS**
  (served bundle updated to `main.7311d514.js`).
- **TypeScript:** `npx tsc --noEmit` → only the pre-existing unrelated error
  `src/pages/__tests__/permission-gating.test.ts(1,38): Cannot find module 'vitest'`
  (vitest is not installed; unrelated to this task).
- **Machine Targets regression** `playwright-machine-targets.js`: **56 PASS / 0 FAIL** (2 INFO) — Targets visual design & functionality unchanged.
- **Final verification** `final-verification.js`: **27 PASS / 0 FAIL**.
- TASK17-A / TASK18-A / TASK19 playwright suites were ad-hoc temp scripts removed
  per repo convention and are not present under the workspace; their scope is
  covered live by the Machine Targets regressions and Machine Master drills above.

## 8. Files changed

- `frontend/src/pages/master-data/MachineManagement.tsx` — 1-line data-mapping fix in `openDetail`.
- `frontend/src/pages/master-data/MachineManagement.task20a.test.tsx` — new focused regression test.

No backend/API/DB changes. No commits made.

## 9. Unrelated pre-existing failures

- `permission-gating.test.ts` imports `vitest`, which is not installed → `tsc` error (pre-existing; not caused by this task).
- Page-2 machine detail requests can take ~6s on the backend (200 OK) — a backend performance quirk, not a defect of this fix.