import React from 'react';
import { EyeOutlined } from '@ant-design/icons';

// Reuse dashboard shared helpers where possible. This file adds lifecycle/doc-specific helpers only.
export { statusColor, fmt, fmtDate, fmtDateTime, PRESET_HEX, cardStyle, sectionTitle } from '../dashboard/helpers';
export type { StatusColor } from '../dashboard/helpers';

export type DocTypeKey = 'MR' | 'PR' | 'PO' | 'GRN' | 'ISSUE' | 'RETURN' | 'TRANSFER' | 'ADJUSTMENT' | 'RESERVATION';

export interface DocRef {
  type: DocTypeKey;
  id?: string | null;
  number: string | null | undefined;
  extra?: Record<string, unknown>;
}

export interface DocMeta {
  label: string;
  endpoint: (id: string) => string;
  numberField: string;
  dateField: string | null;
  statusField: string;
  color: string;
}

export const DOC_META: Record<DocTypeKey, DocMeta> = {
  MR: {
    label: 'Material Request',
    endpoint: (id) => `/store/material-requests/${id}`,
    numberField: 'request_number',
    dateField: 'request_date',
    statusField: 'status',
    color: 'blue',
  },
  PR: {
    label: 'Purchase Requisition',
    endpoint: (id) => `/procurement/requisitions/${id}`,
    numberField: 'requisition_code',
    dateField: null,
    statusField: 'status',
    color: 'purple',
  },
  PO: {
    label: 'Supplier Order (PO)',
    endpoint: (id) => `/procurement/orders/${id}`,
    numberField: 'po_code',
    dateField: 'order_date',
    statusField: 'status',
    color: 'geekblue',
  },
  GRN: {
    label: 'Goods Receipt (GRN)',
    endpoint: (id) => `/store/receipts/${id}`,
    numberField: 'receipt_code',
    dateField: 'receipt_date',
    statusField: 'status',
    color: 'green',
  },
  ISSUE: {
    label: 'Material Issue',
    endpoint: (id) => `/store/material-issues/${id}`,
    numberField: 'issue_number',
    dateField: 'issue_date',
    statusField: 'status',
    color: 'red',
  },
  RETURN: {
    label: 'Material Return',
    endpoint: (id) => `/store/material-returns/${id}`,
    numberField: 'return_number',
    dateField: 'return_date',
    statusField: 'status',
    color: 'orange',
  },
  TRANSFER: {
    label: 'Stock Transfer',
    endpoint: (id) => `/inventory/transfers/${id}`,
    numberField: 'transfer_number',
    dateField: 'transfer_date',
    statusField: 'status',
    color: 'cyan',
  },
  ADJUSTMENT: {
    label: 'Stock Adjustment',
    endpoint: (id) => `/inventory/adjustments/${id}`,
    numberField: 'adjustment_number',
    dateField: null,
    statusField: 'status',
    color: 'magenta',
  },
  RESERVATION: {
    label: 'Inventory Reservation',
    endpoint: () => '',
    numberField: 'reference_number',
    dateField: null,
    statusField: 'status',
    color: 'volcano',
  },
};

// Human-friendly labels for fetched document object keys (first match wins).
export const FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  request_number: 'Request Number',
  issue_number: 'Issue Number',
  return_number: 'Return Number',
  requisition_code: 'Requisition #',
  po_code: 'PO Number',
  receipt_code: 'Receipt Code',
  grn_number: 'GRN Number',
  transfer_number: 'Transfer #',
  adjustment_number: 'Adjustment #',
  order_date: 'Order Date',
  request_date: 'Request Date',
  issue_date: 'Issue Date',
  return_date: 'Return Date',
  receipt_date: 'Receipt Date',
  transfer_date: 'Transfer Date',
  required_date: 'Required By',
  expected_delivery_date: 'Expected Delivery',
  actual_delivery_date: 'Actual Delivery',
  supplier_confirmed_date: 'Supplier Confirmed',
  requested_delivery_date: 'Requested Delivery',
  status: 'Status',
  priority: 'Priority',
  purpose: 'Purpose',
  reason: 'Reason',
  remarks: 'Remarks',
  title: 'Title',
  request_type: 'Request Type',
  condition_code: 'Condition',
  store_name: 'Store',
  store_code: 'Store Code',
  warehouse_name: 'Warehouse',
  supplier_name: 'Supplier',
  warehouse_code: 'Warehouse Code',
  currency_code: 'Currency',
  notes: 'Notes',
  created_by: 'Created By',
  created_at: 'Created At',
  updated_at: 'Updated At',
  posted_by: 'Posted By',
  posted_at: 'Posted At',
  approved_by: 'Approved By',
  approved_at: 'Approved At',
  cancelled_at: 'Cancelled At',
  received_at: 'Received At',
  delivery_note_number: 'Delivery Note #',
  reference_number: 'Reference #',
  reference_type: 'Reference Type',
  transaction_type: 'Transaction Type',
  qty: 'Quantity',
  quantity: 'Quantity',
  total: 'Total',
  sub_total: 'Sub Total',
  tax_amount: 'Tax',
  unit_price: 'Unit Price',
  bin: 'Bin',
  rack: 'Rack',
  shelf: 'Shelf',
};

export const PRETTY_KEYS = new Set<string>([
  'id',
  'request_number',
  'issue_number',
  'return_number',
  'requisition_code',
  'po_code',
  'receipt_code',
  'grn_number',
  'transfer_number',
  'adjustment_number',
  'order_date',
  'request_date',
  'issue_date',
  'return_date',
  'receipt_date',
  'transfer_date',
  'required_date',
  'expected_delivery_date',
  'actual_delivery_date',
  'supplier_confirmed_date',
  'requested_delivery_date',
  'status',
  'priority',
  'purpose',
  'reason',
  'remarks',
  'title',
  'request_type',
  'condition_code',
  'store_name',
  'store_code',
  'warehouse_name',
  'supplier_name',
  'warehouse_code',
  'currency_code',
  'notes',
  'created_at',
  'updated_at',
  'posted_by',
  'posted_at',
  'approved_by',
  'approved_at',
  'cancelled_at',
  'received_at',
  'delivery_note_number',
  'reference_number',
  'reference_type',
  'transaction_type',
  'quantity',
  'unit_price',
  'bin',
  'rack',
  'shelf',
]);

export const isPlainValue = (value: unknown): boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value == null;

export interface RefLinkProps {
  meta: DocMeta;
  number: string | null | undefined;
  id?: string | null;
  enabled?: boolean;
  onClick?: () => void;
}

export const RefLink: React.FC<RefLinkProps> = ({ meta, number, id, enabled = true, onClick }) => {
  const canClick = enabled && !!id && !!onClick && id !== number;
  const text = number || '—';
  if (!canClick) return <span>{text}</span>;
  return (
    <span
      className="trace-ref-link"
      role="button"
      tabIndex={0}
      title={`Open ${meta.label}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation();
          onClick?.();
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        color: 'var(--theme-link, #1677ff)',
        fontWeight: 600,
        cursor: 'pointer',
        textDecoration: 'underline',
        textUnderlineOffset: 2,
      }}
    >
      <EyeOutlined style={{ fontSize: 11 }} />
      <span>{text}</span>
    </span>
  );
};