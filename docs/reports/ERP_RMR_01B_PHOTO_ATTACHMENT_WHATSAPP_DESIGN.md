# ERP RMR-01-B — Receipt Photo / Attachments / WhatsApp — Design & Architecture

## Decision summary

RMR-01-B adds three capabilities to the Raw Material Receiving workflow
(SECTION 3 · Documents & Photos + WhatsApp sharing), built **entirely on the
existing ERP infrastructure** — no new storage backend, no mocked delivery.

| Concern | Decision |
| --- | --- |
| File bytes | Reuse the existing local-FS pattern (`STORAGE_PATH`, served at `/uploads/...`) already used for avatars and document URLs. No S3/Supabase Storage. |
| Persistence model | New table `raw_material_receipt_documents` = **metadata row + `file_url` string**, exactly like the rest of the ERP's attachment entities. |
| Upload timing | **Upload-after-save (Option B)**: files stay in memory (zustand draft store) until the receipt header save succeeds; only then are bytes uploaded per file. Zero orphan files; cancel/fail ⇒ nothing uploaded. |
| Validation | Photos = JPEG/PNG/WebP ≤ 5 MB with magic-byte verification. Attachments = safe-document allow-list (PDF/Word/Excel/PPT/txt/csv) ≤ 10 MB with magic-byte verification (PDF/OLE/ZIP/TEXT), executable extensions blocked. |
| Company isolation | `company_id` on every row + `erp_core.company_in_scope` RLS (mirrors `raw_material_receipts`). |
| WhatsApp | **Dual-mode, never faked.** If a WHATSAPP `communication_settings` row is configured + enabled → enqueue a `notification_deliveries` row (QUEUED) reusing the existing delivery processor → honest `enqueued:true`. Otherwise the frontend falls back to a `https://wa.me/<phone>?text=...` deep link labelled **"Open WhatsApp"** + Copy Message. The UI never claims a message was "sent" unless the real provider processor reports it. |

## Why upload-after-save (not multipart-on-save, not temp-first)

- `POST /inventory/receipts/gate-pass` already creates the header and posts stock
  atomically. Uploading bytes inside the same request would require converting
  the create endpoint to multipart (breaking 12 existing tests + E2E) for no
  benefit.
- There is no temp/orphan cleanup in the ERP; a temp-first design would create
  orphan risk. Upload-after-save guarantees files only exist once the receipt
  exists.
- Client-side File objects live in the in-memory draft store, so minimize →
  restore and SPA navigation preserve photos/attachments exactly like the rest
  of the draft.

## Backend surface (added to `inventory-receipt.controller.ts`)

| Endpoint | Method | Permission | Purpose |
| --- | --- | --- | --- |
| `gate-pass/:id/documents` | POST (multipart `file` + `kind`) | `material_receiving.update` | Upload one photo/attachment; magic-byte + size validated; stores bytes + metadata row. |
| `gate-pass/:id/documents` | GET | `material_receiving.view` | List documents for a receipt. |
| `gate-pass/:id/documents/:docId` | DELETE | `material_receiving.update` | Remove document metadata row + delete bytes from disk. |
| `gate-pass/:id/whatsapp-share` | POST `{ phone, message }` | `material_receiving.view` | Enqueue real delivery when provider configured; otherwise return `{ enqueued:false }`. |

- `findReceiptById` now returns `documents[]` so the detail drawer and edit form
  render current files.
- `removeReceipt` also deletes the receipt's files from disk (no disk orphans
  after a hard receipt delete).

## Storage layout

```
{STORAGE_PATH}/receipts/{companyId}/{receiptId}/{uuid}.{ext}
→ served at     /uploads/receipts/{companyId}/{receiptId}/{uuid}.{ext}
```

`STORAGE_MAX_SIZE = 10485760` (10 MB) is the attachment ceiling; photos capped
at 5 MB client- and server-side.

## WhatsApp message (SECTION 14 of brief)

Built client-side from **real receipt data** (not hardcoded): header
(receipt code, gate pass no, date, org + warehouse) + one line per material
(item code/name, UOM, gate pass qty, received qty, difference) + totals.
Editable in the share dialog before sending.

## Frontend

- `rawReceiptDraftStore`: `ReceiptDraft` gains `pendingFiles: PendingFile[]`
  (File objects + kind + metadata) so the minimized dock / navigation keep them.
- Modal gains **SECTION 3 · Documents & Photos**: photo capture/add (accept
  `image/jpeg,image/png,image/webp`, `capture` hint), attachment add
  (document allow-list), preview thumbnails, per-file remove, size/type
  rejection with clear message. Remarks becomes SECTION 4.
- Save flow: header save → per-file upload → `SaveResultDialog`. Partial upload
  failure shows an honest error ("receipt saved, N files failed") whose Retry
  re-attempts **only the remaining uploads** (never re-creates the receipt).
- Edit mode: current documents listed with Remove (deletes immediately);
  pending new files upload after PATCH.
- Detail drawer: "Documents & Photos" block + "Share on WhatsApp" action.
- Save success dialog: `result.extra` renders a WhatsApp share action.
- WhatsApp modal: phone (country code) + editable message + **Copy Message** /
  **Open WhatsApp** (wa.me) / **Send via WhatsApp** (POST → honest queued /
  unconfigured fallback).

## Non-goals (explicitly out of RMR-01-B)

Excel export/import outside receiving, PDF/print generation, item ledger /
stock balance pages, daily production, accounting, modifying any unrelated
module or the existing RMR-01-A behaviors.