import React from 'react';
import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DOC_META, DocTypeKey, RefLink, fmt, fmtDate, fmtDateTime, statusColor } from './helpers';
import { AdjustmentRow, GrnRow, IssueRow, LedgerRow, OrderRow, PrRow, RequestRow, ReservationRow, ReturnRow, TransferRow } from '../../../../services/storeMaterialTrace';

type OpenDoc = (meta: DocTypeKey, id: string | null | undefined, number: string | null | undefined) => void;

const statusTag = (status: string) => <Tag color={statusColor(status) as string}>{status || '—'}</Tag>;
const chip = (text: string, color: string) => <Tag color={color}>{text}</Tag>;

const tableProps = {
  size: 'small' as const,
  pagination: { pageSize: 10, hideOnSinglePage: true },
  scroll: { x: 'max-content' as const },
  rowKey: (r: any) => r.key ?? r.id ?? String(r.line_id ?? Math.random()),
};

export const RequestsTable: React.FC<{ rows: RequestRow[]; onOpen: OpenDoc }> = ({ rows, onOpen }) => {
  const columns: ColumnsType<RequestRow> = [
    {
      title: 'Request',
      dataIndex: 'request_number',
      fixed: 'left',
      width: 170,
      render: (_: unknown, r) => (
        <RefLink meta={DOC_META.MR} id={r.id} number={r.request_number} onClick={() => onOpen('MR', r.id, r.request_number)} />
      ),
    },
    { title: 'Date', dataIndex: 'request_date', width: 110, render: (v: string) => fmtDate(v) },
    { title: 'Status', dataIndex: 'status', width: 150, render: statusTag },
    { title: 'Priority', dataIndex: 'priority', width: 100, render: (v: string) => v },
    { title: 'Store', dataIndex: 'store_name', width: 160, render: (_: unknown, r) => `${r.store_name} (${r.store_code})` },
    { title: 'Department', dataIndex: 'department_name', width: 140, render: (v: string | null) => v || '—' },
    { title: 'Requested', dataIndex: 'requested_quantity', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Issued', dataIndex: 'issued_quantity', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Required By', dataIndex: 'required_date', width: 110, render: (v: string | null) => fmtDate(v) },
    {
      title: 'PR',
      dataIndex: 'pr_number',
      width: 140,
      render: (_: unknown, r) =>
        r.pr_number ? <RefLink meta={DOC_META.PR} id={r.pr_id} number={r.pr_number} onClick={() => onOpen('PR', r.pr_id, r.pr_number)} /> : '—',
    },
    {
      title: 'PO',
      dataIndex: 'po_number',
      width: 140,
      render: (_: unknown, r) =>
        r.po_number ? <RefLink meta={DOC_META.PO} id={r.po_id} number={r.po_number} onClick={() => onOpen('PO', r.po_id, r.po_number)} /> : '—',
    },
    {
      title: 'ETA',
      dataIndex: 'deliveryStatus',
      width: 110,
      render: (_: unknown, r) =>
        r.eta_pending ? (
          chip('ETA Pending', 'purple')
        ) : r.actual_delivery_date && r.eta_pending === false ? (
          chip(`Arrived ${fmtDate(r.actual_delivery_date)}`, 'green')
        ) : (
          fmtDate(r.expected_delivery_date) || '—'
        ),
    },
    { title: 'Created By', dataIndex: 'created_by', width: 130, render: (v: unknown) => v || '—' },
  ];
  return <Table {...tableProps} rowKey={(r) => r.line_id ?? r.id} columns={columns} dataSource={rows} />;
};

export const PrsTable: React.FC<{ rows: PrRow[]; onOpen: OpenDoc }> = ({ rows, onOpen }) => {
  const columns: ColumnsType<PrRow> = [
    {
      title: 'Requisition #',
      dataIndex: 'requisition_code',
      fixed: 'left',
      width: 160,
      render: (_: unknown, r) => (
        <RefLink meta={DOC_META.PR} id={r.id} number={r.requisition_code} onClick={() => onOpen('PR', r.id, r.requisition_code)} />
      ),
    },
    { title: 'Status', dataIndex: 'status', width: 170, render: statusTag },
    { title: 'Type', dataIndex: 'request_type', width: 110, render: (v: string | null) => v || '—' },
    { title: 'Supplier', dataIndex: 'supplier_name', width: 180, render: (v: string | null) => v || '—' },
    { title: 'Quantity', dataIndex: 'quantity', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Converted', dataIndex: 'converted_quantity', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Est. Price', dataIndex: 'estimated_unit_price', align: 'right', width: 100, render: (v: number | null) => fmt(v, 2) },
    { title: 'Required', dataIndex: 'required_date', width: 110, render: (v: string | null) => fmtDate(v) },
    { title: 'Line Status', dataIndex: 'line_status', width: 130, render: statusTag },
    { title: 'Approved By', dataIndex: 'approved_by', width: 130, render: (v: unknown) => v || '—' },
    { title: 'Created', dataIndex: 'created_at', width: 150, render: (v: string) => fmtDateTime(v) },
  ];
  return <Table {...tableProps} rowKey={(r) => r.line_id ?? r.id} columns={columns} dataSource={rows} />;
};

export const OrdersTable: React.FC<{ rows: OrderRow[]; onOpen: OpenDoc }> = ({ rows, onOpen }) => {
  const columns: ColumnsType<OrderRow> = [
    {
      title: 'PO Number',
      dataIndex: 'po_code',
      fixed: 'left',
      width: 160,
      render: (_: unknown, r) => (
        <RefLink meta={DOC_META.PO} id={r.id} number={r.po_code} onClick={() => onOpen('PO', r.id, r.po_code)} />
      ),
    },
    { title: 'Order Date', dataIndex: 'order_date', width: 110, render: (v: string | null) => fmtDate(v) },
    { title: 'Status', dataIndex: 'status', width: 130, render: statusTag },
    { title: 'Supplier', dataIndex: 'supplier_name', width: 180, render: (v: string) => v },
    { title: 'Quantity', dataIndex: 'quantity', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Received', dataIndex: 'received_quantity', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Unit Price', dataIndex: 'unit_price', align: 'right', width: 100, render: (v: number) => fmt(v, 2) },
    { title: 'Expected Delivery', dataIndex: 'expected_delivery_date', width: 130, render: (v: string | null) => fmtDate(v) },
    { title: 'Received At', dataIndex: 'received_at', width: 150, render: (v: string | null) => fmtDateTime(v) },
  ];
  return <Table {...tableProps} rowKey={(r) => r.line_id ?? r.id} columns={columns} dataSource={rows} />;
};

export const GrnsTable: React.FC<{ rows: GrnRow[]; onOpen: OpenDoc }> = ({ rows, onOpen }) => {
  const columns: ColumnsType<GrnRow> = [
    {
      title: 'Receipt #',
      dataIndex: 'receipt_code',
      fixed: 'left',
      width: 160,
      render: (_: unknown, r) => (
        <RefLink meta={DOC_META.GRN} id={r.id} number={r.receipt_code} onClick={() => onOpen('GRN', r.id, r.receipt_code)} />
      ),
    },
    { title: 'GRN', dataIndex: 'grn_number', width: 140, render: (v: string | null) => v || '—' },
    { title: 'Receipt Date', dataIndex: 'receipt_date', width: 110, render: (v: string | null) => fmtDate(v) },
    { title: 'Status', dataIndex: 'status', width: 120, render: statusTag },
    { title: 'Supplier', dataIndex: 'supplier_name', width: 170, render: (v: string | null) => v || '—' },
    {
      title: 'Received',
      dataIndex: 'quantity_received',
      align: 'right',
      width: 90,
      render: (_: unknown, r) => <span>{fmt(r.quantity_received)} <span style={{ color: 'var(--theme-text-muted)' }}>/ {fmt(r.quantity_ordered)}</span></span>,
    },
    { title: 'Accepted', dataIndex: 'quantity_accepted', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Rejected', dataIndex: 'quantity_rejected', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Posted By', dataIndex: 'posted_by', width: 130, render: (v: string | null) => v || '—' },
    { title: 'Warehouse', dataIndex: 'warehouse_name', width: 140, render: (v: string | null) => v || '—' },
  ];
  return <Table {...tableProps} rowKey={(r) => r.line_id ?? r.id} columns={columns} dataSource={rows} />;
};

export const IssuesTable: React.FC<{ rows: IssueRow[]; onOpen: OpenDoc }> = ({ rows, onOpen }) => {
  const columns: ColumnsType<IssueRow> = [
    {
      title: 'Issue #',
      dataIndex: 'issue_number',
      fixed: 'left',
      width: 150,
      render: (_: unknown, r) => (
        <RefLink meta={DOC_META.ISSUE} id={r.id} number={r.issue_number} onClick={() => onOpen('ISSUE', r.id, r.issue_number)} />
      ),
    },
    { title: 'Issue Date', dataIndex: 'issue_date', width: 110, render: (v: string) => fmtDate(v) },
    { title: 'Status', dataIndex: 'status', width: 120, render: statusTag },
    { title: 'Purpose', dataIndex: 'purpose', ellipsis: true, render: (v: string | null) => v || '—' },
    { title: 'Quantity', dataIndex: 'quantity', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Issued To', dataIndex: 'issued_to_department_name', width: 150, render: (v: string | null) => v || '—' },
    { title: 'Store', dataIndex: 'store_name', width: 150, render: (_: unknown, r) => `${r.store_name} (${r.store_code})` },
    { title: 'Bin', dataIndex: 'bin', width: 90, render: (v: string | null) => v || '—' },
    { title: 'Rack', dataIndex: 'rack', width: 90, render: (v: string | null) => v || '—' },
    { title: 'Posted By', dataIndex: 'posted_by', width: 130, render: (v: string | null) => v || '—' },
  ];
  return <Table {...tableProps} rowKey={(r) => r.line_id ?? r.id} columns={columns} dataSource={rows} />;
};

export const ReturnsTable: React.FC<{ rows: ReturnRow[]; onOpen: OpenDoc }> = ({ rows, onOpen }) => {
  const columns: ColumnsType<ReturnRow> = [
    {
      title: 'Return #',
      dataIndex: 'return_number',
      fixed: 'left',
      width: 150,
      render: (_: unknown, r) => (
        <RefLink meta={DOC_META.RETURN} id={r.id} number={r.return_number} onClick={() => onOpen('RETURN', r.id, r.return_number)} />
      ),
    },
    { title: 'Return Date', dataIndex: 'return_date', width: 110, render: (v: string) => fmtDate(v) },
    { title: 'Status', dataIndex: 'status', width: 120, render: statusTag },
    { title: 'Reason', dataIndex: 'reason', ellipsis: true, render: (v: string | null) => v || '—' },
    { title: 'Quantity', dataIndex: 'quantity', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Condition', dataIndex: 'condition_code', width: 110, render: statusTag },
    { title: 'From', dataIndex: 'from_department_name', width: 150, render: (v: string | null) => v || '—' },
    { title: 'Store', dataIndex: 'store_name', width: 150, render: (_: unknown, r) => `${r.store_name} (${r.store_code})` },
    { title: 'Posted By', dataIndex: 'posted_by', width: 130, render: (v: string | null) => v || '—' },
  ];
  return <Table {...tableProps} rowKey={(r) => r.line_id ?? r.id} columns={columns} dataSource={rows} />;
};

const ledgerLinkCell = (r: TransferRow | LedgerRow, onOpen: OpenDoc) => {
  const refType = String(r.reference_type || '').toUpperCase();
  const metaKey: DocTypeKey | null =
    refType === 'STOCK_TRANSFER' ? 'TRANSFER' : refType === 'STOCK_ADJUSTMENT' ? 'ADJUSTMENT' : null;
  if (!metaKey || !r.reference_id) return <span style={{ color: 'var(--theme-text-muted)' }}>{r.reference_number || '—'}</span>;
  return (
    <RefLink
      meta={DOC_META[metaKey]}
      id={String(r.reference_id)}
      number={r.reference_number || metaKey}
      onClick={() => onOpen(metaKey, String(r.reference_id), r.reference_number)}
    />
  );
};

export const TransfersTable: React.FC<{ rows: TransferRow[]; onOpen: OpenDoc }> = ({ rows, onOpen }) => {
  const columns: ColumnsType<TransferRow> = [
    { title: 'Reference', dataIndex: 'reference_number', fixed: 'left', width: 150, render: (_: unknown, r) => ledgerLinkCell(r, onOpen) },
    { title: 'Date', dataIndex: 'transaction_date', width: 110, render: (v: string) => fmtDate(v) },
    { title: 'Direction', dataIndex: 'direction', width: 90, render: (v: string) => (String(v).toUpperCase() === 'IN' ? chip('IN', 'green') : chip('OUT', 'red')) },
    { title: 'Quantity', dataIndex: 'quantity', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Warehouse', dataIndex: 'warehouse_name', width: 150, render: (v: string | null) => v || '—' },
    { title: 'User', dataIndex: 'user_name', width: 140, render: (v: string | null) => v || '—' },
    { title: 'Notes', dataIndex: 'notes', ellipsis: true, render: (v: string | null) => v || '—' },
  ];
  return <Table {...tableProps} rowKey="key" columns={columns} dataSource={rows} />;
};

export const AdjustmentsTable: React.FC<{ rows: AdjustmentRow[]; onOpen: OpenDoc }> = ({ rows, onOpen }) => {
  const columns: ColumnsType<AdjustmentRow> = [
    { title: 'Reference', dataIndex: 'reference_number', fixed: 'left', width: 150, render: (_: unknown, r) => ledgerLinkCell(r, onOpen) },
    { title: 'Date', dataIndex: 'transaction_date', width: 110, render: (v: string) => fmtDate(v) },
    { title: 'Direction', dataIndex: 'direction', width: 90, render: (v: string) => (String(v).toUpperCase() === 'IN' ? chip('IN', 'green') : chip('OUT', 'red')) },
    { title: 'Change', dataIndex: 'quantity', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Warehouse', dataIndex: 'warehouse_name', width: 150, render: (v: string | null) => v || '—' },
    { title: 'User', dataIndex: 'user_name', width: 140, render: (v: string | null) => v || '—' },
    { title: 'Notes', dataIndex: 'notes', ellipsis: true, render: (v: string | null) => v || '—' },
  ];
  return <Table {...tableProps} rowKey="key" columns={columns} dataSource={rows} />;
};

export const ReservationsTable: React.FC<{ rows: ReservationRow[] }> = ({ rows }) => {
  const columns: ColumnsType<ReservationRow> = [
    { title: 'Type', dataIndex: 'reservation_type', width: 140, render: (v: string) => v },
    { title: 'Reference', dataIndex: 'reference_type', width: 140, render: (v: string | null) => v || '—' },
    { title: 'Quantity', dataIndex: 'quantity', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Status', dataIndex: 'status', width: 110, render: statusTag },
    { title: 'Warehouse', dataIndex: 'warehouse_name', width: 150, render: (v: string | null) => v || '—' },
    { title: 'Expires', dataIndex: 'expires_at', width: 130, render: (v: string | null) => fmtDateTime(v) },
    { title: 'Reserved By', dataIndex: 'user_name', width: 140, render: (v: string | null) => v || '—' },
    { title: 'Created', dataIndex: 'created_at', width: 150, render: (v: string) => fmtDateTime(v) },
  ];
  return <Table {...tableProps} rowKey="id" columns={columns} dataSource={rows} />;
};

export const LedgerTable: React.FC<{ rows: LedgerRow[]; onOpen: OpenDoc; opening: number }> = ({ rows, onOpen, opening }) => {
  const columns: ColumnsType<LedgerRow> = [
    { title: 'Date', dataIndex: 'transaction_date', fixed: 'left' as const, width: 110, render: (v: string) => fmtDate(v) },
    { title: 'Type', dataIndex: 'transaction_type', width: 160, render: statusTag },
    { title: 'Reference', dataIndex: 'reference_number', width: 150, render: (_: unknown, r) => ledgerLinkCell(r, onOpen) },
    { title: 'Dir', dataIndex: 'direction', width: 80, render: (v: string) => (String(v).toUpperCase() === 'IN' ? chip('IN', 'green') : chip('OUT', 'red')) },
    { title: 'Qty', dataIndex: 'quantity', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Balance', dataIndex: 'balance', align: 'right', width: 100, render: (v: number, r) => (r.isOpening ? <b>{fmt(v, 2)}</b> : fmt(v, 2)) },
    { title: 'User', dataIndex: 'user_name', width: 140, render: (v: string | null) => v || '—' },
    { title: 'Warehouse', dataIndex: 'warehouse_name', width: 150, render: (v: string | null) => v || '—' },
    { title: 'Notes', dataIndex: 'notes', ellipsis: true, render: (v: string | null) => v || '—' },
  ];
  return <Table {...tableProps} rowKey="key" columns={columns} dataSource={rows} pagination={{ pageSize: 10 }} />;
};