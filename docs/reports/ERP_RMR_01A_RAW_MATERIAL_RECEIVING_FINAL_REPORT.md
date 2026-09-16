# RMR-01-A — Raw Material Receiving: Header Actions + Persistent Dock

**Status:** COMPLETE (PASS 12 of 12 unit, 25 of 25 browser E2E)
**Date:** 2026-09-16
**Route:** `/production/receiving`
**Branches touched:** frontend only (single-flight guard inside existing page), backend already deployed (form-data bundles sections/departments).

---

## 1. Scope

Move Raw Material Receiving onto the gen-2027 interaction model without touching
WhatsApp / photo / attachment / Excel / PDF / print / import / export / ledgers /
stock-balance work:

1. Header-based actions (New Receipt / Refresh) instead of a page-embedded action bar.
2. Draggable + resizable New Receipt modal (centered on open, transform-based drag,
   bottom-right resize handle, `maskClosable=false`, `keyboard=false`).
3. Persistent minimized dock (`RawReceiptMinimizedDock`), app-level in `MainLayout`,
   preserving the in-progress draft across real SPA navigation; restore reopens the
   exact same draft; close discards it.
4. Client-side Division → Section → Department cascades driven by real master-data
   from a **single bundled form-data lookup** — zero per-lookup `/organization/sections`
   or `/organization/departments` calls. Single-section / single-department
   auto-selection only when exactly one option exists. No hardcoded master data.
5. Session refCache (5-minute TTL, in-memory) so revisiting the page never refetches.
6. Responsive: no document-level horizontal overflow at 1920 / 1280 / 768 / 390.

---

## 2. Result Checklist

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | Header actions `New Receipt (Gate Pass)` + `Refresh` rendered in shared header | **PASS** | E2E `01-receiving-history.png`, `hr08-style` header harness |
| 2 | Opening the modal issues exactly **one** form-data lookup (no duplicate) | **PASS** | E2E `form-data called exactly once :: count=1` (single-flight guard even under dev StrictMode double-mount) |
| 3 | Nested dropdown API calls eliminated | **PASS** | E2E `ZERO calls to /organization/sections|departments :: count=0` |
| 4 | Section/Department data bundled into the single lookup | **PASS** | Backend probe + E2E bundle: `sections=16 departments=31` (keys in one payload) |
| 5 | Division → Section → Department cascade works against live data | **PASS** | E2E picked `DIV-CCD — Control Cable Division` → `SEC-017 — CCD Packing` → `CENT-FIN — Accounts & Finance` |
| 6 | Single-option auto-select (client-side, no API) | **PASS** | Jest `auto-selects a single Section/Department client-side with zero per-lookup API calls` |
| 7 | Division switch invalidates cleared downstream values; never auto-selects when multiple sections exist | **PASS** | Jest `switching Division clears invalid downstream values and does NOT auto-select` |
| 8 | Modal draggable by header (transform-based) | **PASS** | E2E `translate(0,0) → translate(200px,120px)`; resize `dW=151 dH=91` |
| 9 | Minimize → dock mounted app-wide; survives real sidebar SPA navigation | **PASS** | E2E `persists across real sidebar SPA navigation` (`04-dock-on-other-page.png`) |
| 10 | Restore reopens same draft with values intact | **PASS** | E2E gatePassNo `GP-RMR01-E2E` restored verbatim (`05-restored-draft.png`) |
| 11 | Dock close discards the draft entirely | **PASS** | E2E bar disappears after close |
| 12 | Session refCache — no refetch on re-mount | **PASS** | Jest `never refetches form-data on re-mount`; E2E single call across whole session |
| 13 | Responsive | **PASS** | E2E overflow 0px at 1920 / 1280 / 768 / 390 (`06-responsive-*.png`) |
| 14 | No page/console errors | **PASS** | E2E final check (only pre-existing dev antd/rc-util `circular references` isEqual warning, documented below) |
| 15 | TypeScript (frontend + backend) | **PASS** | `npx tsc --noEmit` both, `nest build` OK |
| 16 | Production build | **PASS** | `npm run build` (CRA, warnings pre-existing) |
| 17 | Unit tests | **PASS** | Jest `2 suites / 12 tests` (RawMaterialReceiving 8 + RawReceiptMinimizedDock 4) |

---

## 3. Measured Lookup Timing (single call)

| Measurement | Before (sequential) | After (bundled, one call) |
|---|---|---|
| form-data payload carrying sections + departments | — | **~1.0 s** (modal-ready cumulative in E2E run); probe readings 2.1 s and 3.0 s on later pooler hits |
| `/inventory/receipts/organization/sections` direct | ~1.7 s | no longer called by this page (0 calls) |
| `/inventory/receipts/organization/departments` direct | ~1.7 s | no longer called by this page (0 calls) |
| Worst case sequential (form-data + sections + departments) | **~5.5 s+** | **1 call → ~1–3 s** down to a single round trip |

Notes: the DB pooler (Supabase remote) shows run-to-run variance; the single bundle
cut the receiving-page reference load from up to three round trips to one. The
standalone `/organization/sections` endpoint remains live (200) for other consumers.

---

## 4. Implementation Notes

- **Single-flight guard** (`RawMaterialReceiving.tsx`): `loadRef` now shares one
  in-flight `form-data` request across concurrent mounts, so React StrictMode in
  dev does not double-fetch. The session `setRefCache` still short-circuits later
  visits within the 5-minute TTL.
- **Nested dropdown elimination** was a backend change (already deployed to the
  running `node dist/main.js` on :3001): `getFormReferenceData` bundles sections and
  departments into the existing `gate-pass/form-data` response.
- **Known dev-only noise:** antd/rc-util `isEqual` logs `Warning: There may be
  circular references` during field re-render (also visible in the jest output).
  This is a known, pre-existing dev-mode warning for this codebase (see explicit
  workaround comment in `EntryForm.tsx`); it is not emitted in the production build
  and is not a regression from RMR-01-A.

---

## 5. Deliverables & Evidence

- `frontend/src/pages/production/receiving/RawMaterialReceiving.tsx` — header actions,
  single-flight loadRef, cascades, restore/minimize/close wiring.
- `frontend/src/components/layout/RawReceiptMinimizedDock.tsx` + `rawReceiptMinimizedDock.css` — persistent dock (clickable tab, badge, N-lines, pulse, ≤768px full-width).
- `frontend/src/store/rawReceiptDraftStore.ts` — draft + refCache store (already present).
- Tests: `RawMaterialReceiving.test.tsx` (8), `RawReceiptMinimizedDock.test.tsx` (4).
- E2E: `rmr01-e2e.cjs` (repo root) — **25/25 PASS**.
- Screenshots: `docs/evidence/rmr01/` (history, modal-open, modal-filled, dock-on-other-page, restored-draft, responsive 1920/1280/768/390).

---

## 6. Next Phase: RMR-01-B — Photo/Attachment + WhatsApp ONLY

Photo capture, attachment management, and WhatsApp sharing for the New Receipt flow.
No Excel/PDF/print/import/export/ledger/stock-balance work in this phase.