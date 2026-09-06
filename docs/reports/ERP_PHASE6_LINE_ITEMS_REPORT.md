# ERP Phase 6 — Line Items Report

**Date:** 2026-08-29
**Scope:** Transactional document line-item support

---

## 1. Reusable Component: `ERPLineItems`

**File:** `frontend/src/components/shared/ERPLineItems.tsx`
**Exported via:** `frontend/src/components/shared/index.ts`

### Capabilities
- Add/remove/edit multiple lines
- **Item search** via live API (`/master-data/items?search=`), displays `itemCode — name`
- Auto-populates UOM and rate from selected item
- UOM display
- Quantity (min 0)
- Rate (min 0)
- Discount % (0-100)
- Tax % (0-100)
- **Line amount** auto-calculated: `qty × rate × (1-disc/100) × (1+tax/100)`
- Warehouse/location select (configurable)
- **Automatic totals**: total qty, base amount, total amount
- Duplicate-item handling: user can add same item on multiple lines (allowed for different warehouses)
- Validation: numeric bounds via InputNumber

### Configurability
`showWarehouse`, `showDiscount`, `showTax`, `disabled`, `label` props allow reuse across document types.

## 2. Where Wired

| Document | Status | Notes |
|---|---|---|
| Purchase Order | ✅ | Supplier select + line items + totals |
| Purchase Requisition | ❌ | Backend supports; not yet wired |
| RFQ | ❌ | Backend supports; not yet wired |
| Supplier Quotation | ❌ | Backend supports; not yet wired |
| GRN | ❌ | Backend supports; not yet wired |
| Purchase Return | ❌ | Backend supports; not yet wired |
| Sales Quotation | ❌ | Backend supports; not yet wired |
| Sales Order | ❌ | Backend supports; not yet wired |
| Delivery | ❌ | Backend supports; not yet wired |
| Sales Invoice | ❌ | Backend supports; not yet wired |
| Sales Return | ❌ | Backend supports; not yet wired |
| Production Order | ⚠️ | Component rendered; backend lines optional |
| Journal Entry | ⚠️ | Uses JSON textarea (not ERPLineItems) |

## 3. Verification

- Component compiled in production build ✅
- PO create posts `lines[]` to backend `/procurement/orders` which persists to `purchase_order_lines` (verified in Phase 2 API) ✅
- Auto-totals calculation unit-verified by inspection ✅

## 4. Remaining Work

Wire `ERPLineItems` into the remaining 10 forms (each ~30-60 min given the reusable component). Raw UUID inputs for item/supplier/customer already replaced with selects in PO form; other forms still use UUID inputs.