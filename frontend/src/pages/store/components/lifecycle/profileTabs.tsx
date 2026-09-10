import React, { useEffect, useRef } from 'react';
import { Alert, Card, Descriptions, Steps, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import JsBarcode from 'jsbarcode';
import { AuditEvent, BalanceRow, MaterialLifecycle, StoreConfigRow, TimelineStage } from '../../../../services/storeMaterialTrace';
import { fmt, fmtDate, fmtDateTime, statusColor } from './helpers';

export const ItemInfoTab: React.FC<{ item: MaterialLifecycle['item'] }> = ({ item }) => {
  const bool = (v: boolean) => (v ? <Tag color="green">Yes</Tag> : <Tag color="default">No</Tag>);
  return (
    <Card bordered className="trace-card" style={{ marginBottom: 12 }}>
      <Descriptions title="Item Information" bordered column={{ xs: 1, sm: 2, md: 3 }} size="small" style={{ marginBottom: 8 }}>
        <Descriptions.Item label="Item Code">{item.item_code}</Descriptions.Item>
        <Descriptions.Item label="Item Type">{item.item_type}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag color={statusColor(item.status) as string}>{item.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Short Name">{item.short_name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Category">{item.category_name || '—'}</Descriptions.Item>
        <Descriptions.Item label="Brand">{item.brand || '—'}</Descriptions.Item>
        <Descriptions.Item label="Model">{item.model || '—'}</Descriptions.Item>
        <Descriptions.Item label="Part Number">{item.manufacturer_part_number || '—'}</Descriptions.Item>
        <Descriptions.Item label="Base UoM">{item.base_uom_code}</Descriptions.Item>
        <Descriptions.Item label="Barcode">{item.barcode || '—'}</Descriptions.Item>
        <Descriptions.Item label="Cost Price">{fmt(item.cost_price)}</Descriptions.Item>
        <Descriptions.Item label="Selling Price">{fmt(item.selling_price)}</Descriptions.Item>
        <Descriptions.Item label="Track Inventory">{bool(item.track_inventory)}</Descriptions.Item>
        <Descriptions.Item label="Batch Tracked">{bool(item.batch_tracked)}</Descriptions.Item>
        <Descriptions.Item label="Serial Tracked">{bool(item.serial_tracked)}</Descriptions.Item>
        <Descriptions.Item label="Purchasable">{bool(item.is_purchasable)}</Descriptions.Item>
        <Descriptions.Item label="Sellable">{bool(item.is_sellable)}</Descriptions.Item>
        <Descriptions.Item label="Manufacturable">{bool(item.is_manufacturable)}</Descriptions.Item>
        <Descriptions.Item label="Stock Item">{bool(item.is_stock_item)}</Descriptions.Item>
      </Descriptions>
      {item.notes && (
        <Alert type="info" showIcon message="Notes" description={item.notes} style={{ marginBottom: 8 }} />
      )}
      <Descriptions column={{ xs: 1, sm: 2 }} size="small">
        <Descriptions.Item label="Created">{fmtDateTime(item.created_at)}</Descriptions.Item>
        <Descriptions.Item label="Updated">{fmtDateTime(item.updated_at)}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

export const StoreConfigTab: React.FC<{ rows: StoreConfigRow[] }> = ({ rows }) => {
  const columns: ColumnsType<StoreConfigRow> = [
    { title: 'Store', dataIndex: 'store_name', width: 180, render: (_: unknown, r) => `${r.store_name} (${r.store_code})` },
    { title: 'Store Type', dataIndex: 'store_type', width: 130, render: (v: string | null) => v || '—' },
    { title: 'Status', dataIndex: 'store_item_status', width: 110, render: (v: string) => <Tag color="geekblue">{v}</Tag> },
    { title: 'Minimum', dataIndex: 'minimum_stock', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Reorder', dataIndex: 'reorder_level', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Maximum', dataIndex: 'maximum_stock', align: 'right', width: 90, render: (v: number) => fmt(v, 2) },
    { title: 'Issue Method', dataIndex: 'preferred_issue_method', width: 130, render: (v: string | null) => v || '—' },
    { title: 'Bin', dataIndex: 'bin', width: 90, render: (v: string | null) => v || '—' },
    { title: 'Rack', dataIndex: 'rack', width: 90, render: (v: string | null) => v || '—' },
    { title: 'Shelf', dataIndex: 'shelf', width: 90, render: (v: string | null) => v || '—' },
    { title: 'Location', dataIndex: 'location_detail', ellipsis: true, render: (v: string | null) => v || '—' },
  ];
  return <Table size="small" rowKey="store_item_id" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 'max-content' }} />;
};

export const CurrentStockTab: React.FC<{ rows: BalanceRow[] }> = ({ rows }) => {
  const columns: ColumnsType<BalanceRow> = [
    { title: 'Warehouse', dataIndex: 'warehouse_name', width: 200 },
    { title: 'On Hand', dataIndex: 'onHand', align: 'right', width: 100, render: (v: number) => fmt(v, 2) },
    { title: 'Reserved', dataIndex: 'reserved', align: 'right', width: 100, render: (v: number) => fmt(v, 2) },
    { title: 'Available', dataIndex: 'available', align: 'right', width: 100, render: (v: number) => <b>{fmt(v, 2)}</b> },
    { title: 'Minimum', dataIndex: 'minimumStock', align: 'right', width: 100, render: (v: number) => fmt(v, 2) },
    { title: 'Maximum', dataIndex: 'maximumStock', align: 'right', width: 100, render: (v: number) => fmt(v, 2) },
    { title: 'Shortage', dataIndex: 'shortage', align: 'right', width: 100, render: (v: number) => (v > 0 ? <span style={{ color: '#f5222d' }}>{fmt(v, 2)}</span> : <b>—</b>) },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 130,
      render: (v: string) =>
        v === 'OK' ? <Tag color="green">OK</Tag> : v === 'LOW' ? <Tag color="gold">LOW</Tag> : v === 'REORDER' ? <Tag color="volcano">REORDER</Tag> : <Tag color="red">OUT OF STOCK</Tag>,
    },
  ];
  return <Table size="small" rowKey="warehouseId" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 'max-content' }} />;
};

export const MinMaxTab: React.FC<{ lc: MaterialLifecycle }> = ({ lc }) => {
  const { global } = lc.minMax;
  return (
    <>
      <Card size="small" className="trace-card" style={{ marginBottom: 12 }}>
        <Descriptions title="Item Level Reorder Settings" bordered column={{ xs: 1, sm: 2, md: 4 }} size="small">
          <Descriptions.Item label="Minimum Level">{fmt(global.minimumStockLevel)}</Descriptions.Item>
          <Descriptions.Item label="Maximum Level">{fmt(global.maximumStockLevel)}</Descriptions.Item>
          <Descriptions.Item label="Reorder Level">{fmt(global.reorderLevel)}</Descriptions.Item>
          <Descriptions.Item label="Safety Stock">{fmt(global.safetyStockLevel)}</Descriptions.Item>
          <Descriptions.Item label="Lead Time (days)">{global.leadTimeDays ?? '—'}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card size="small" className="trace-card" title="Store Level Min / Max">
        <Table
          size="small"
          rowKey="storeItemId"
          dataSource={lc.minMax.perStore}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Store', dataIndex: 'store_name', render: (_: unknown, r: any) => `${r.store_name} (${r.store_code})` },
            { title: 'Minimum', dataIndex: 'minimumStock', align: 'right', render: (v: number) => fmt(v, 2) },
            { title: 'Reorder', dataIndex: 'reorderLevel', align: 'right', render: (v: number) => fmt(v, 2) },
            { title: 'Maximum', dataIndex: 'maximumStock', align: 'right', render: (v: number) => fmt(v, 2) },
            { title: 'Issue Method', dataIndex: 'preferredIssueMethod', render: (v: string) => v || '—' },
          ]}
        />
      </Card>
    </>
  );
};

const reconciliationDefinitions: Array<{ key: keyof MaterialLifecycle['reconciliation']; label: string }> = [
  { key: 'requested', label: 'Requested Qty' },
  { key: 'approved', label: 'Manager Approved' },
  { key: 'gmApproved', label: 'GM Approved' },
  { key: 'supplierConfirmed', label: 'Supplier Confirmed' },
  { key: 'prQty', label: 'PR Converted Qty' },
  { key: 'orderedQty', label: 'Ordered Qty (PO)' },
  { key: 'receivedQty', label: 'Received Qty (GRN)' },
  { key: 'acceptedQty', label: 'Accepted Qty' },
  { key: 'rejectedQty', label: 'Rejected Qty' },
  { key: 'pendingReceiptQty', label: 'Pending Receipt' },
  { key: 'issuedQty', label: 'Issued from Store' },
  { key: 'returnedQty', label: 'Returned to Store' },
  { key: 'transferredInQty', label: 'Transferred In' },
  { key: 'transferredOutQty', label: 'Transferred Out' },
  { key: 'adjustedInQty', label: 'Adjusted In' },
  { key: 'adjustedOutQty', label: 'Adjusted Out' },
  { key: 'reservedQty', label: 'Reserved' },
  { key: 'availableQty', label: 'Available (Balance)' },
];

export const ProcurementStatusTab: React.FC<{ lc: MaterialLifecycle }> = ({ lc }) => {
  const r = lc.reconciliation;
  const steps = [
    { key: 'requested', label: 'Requested', value: r.requested, color: '#1677ff' },
    { key: 'managerApproved', label: 'Manager Approved', value: r.approved, color: '#2f54eb' },
    { key: 'gmApproved', label: 'GM Approved', value: r.gmApproved, color: '#722ed1' },
    { key: 'supplierConfirmed', label: 'Supplier Confirmed', value: r.supplierConfirmed, color: '#13c2c2' },
    { key: 'prCreated', label: 'PR Created', value: r.prQty, color: '#faad14' },
    { key: 'ordered', label: 'Ordered', value: r.orderedQty, color: '#fa8c16' },
    { key: 'received', label: 'Received', value: r.receivedQty, color: '#52c41a' },
  ];
  const max = Math.max(1, r.requested || r.orderedQty || 1);
  return (
    <>
      <Alert
        showIcon
        type="info"
        message="Quantity reconciliation across the full procurement pipeline"
        description={`Ordered ${fmt(r.orderedQty)} vs Received ${fmt(r.receivedQty)} — pending receipt ${fmt(r.pendingReceiptQty)}. Available in stock ${fmt(r.availableQty)} (${fmt(r.reservedQty)} reserved on ${fmt(r.reservedQty)} active reservations).`}
        style={{ marginBottom: 12 }}
      />
      <Card size="small" className="trace-card" title="Procurement Funnel" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {steps.map((s) => (
            <div key={s.key} style={{ flex: '1 1 110px', minWidth: 110 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{fmt(s.value, 0)}</div>
              <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>{s.label}</div>
              <div
                style={{
                  height: 6,
                  borderRadius: 4,
                  marginTop: 4,
                  background: 'var(--theme-border)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ height: '100%', width: `${Math.min(100, (s.value / max) * 100)}%`, background: s.color }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card size="small" className="trace-card" title="Reconciliation Detail">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
          {reconciliationDefinitions.map((def) => (
            <div key={def.key} className="trace-metric">
              <div style={{ fontSize: 18, fontWeight: 600 }}>{fmt(r[def.key], 0)}</div>
              <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>{def.label}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
};

export const BarcodeTab: React.FC<{ item: MaterialLifecycle['item'] }> = ({ item }) => {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && item.barcode) {
      try {
        JsBarcode(ref.current, item.barcode, {
          format: 'CODE128',
          width: 2,
          height: 72,
          displayValue: true,
          fontSize: 16,
          margin: 10,
        });
      } catch {
        // malformed barcode - fall back to text
      }
    }
  }, [item.barcode]);
  return (
    <div style={{ textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
        {item.name} <span style={{ color: 'var(--theme-text-muted)' }}>({item.item_code})</span>
      </div>
      {item.barcode ? (
        <svg ref={ref} style={{ maxWidth: '100%' }} />
      ) : (
        <Alert type="warning" showIcon message="No barcode assigned to this item." />
      )}
    </div>
  );
};

export const TimelineSteps: React.FC<{ stages: TimelineStage[] }> = ({ stages }) => {
  const reached = stages.filter((s) => s.reached).length;
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Tag color="green">
          {reached} / {stages.length} stages reached
        </Tag>
      </div>
      <Steps
        direction="horizontal"
        current={reached}
        size="small"
        responsive
        style={{ overflowX: 'auto', paddingBottom: 8 }}
        items={stages.map((s) => ({
          status: s.reached ? 'finish' : 'wait',
          title: s.label,
          description: <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{s.reached && s.date ? fmtDate(s.date) : s.note || ''}</span>,
        }))}
      />
    </>
  );
};

export const AuditTimeline: React.FC<{ events: AuditEvent[]; onOpenEvent?: (e: AuditEvent) => void }> = ({ events, onOpenEvent }) => {
  if (!events.length) {
    return <Alert type="info" showIcon message="No audit activity found for this item yet." />;
  }
  return (
    <div style={{ maxHeight: 460, overflow: 'auto', paddingRight: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Complete Audit Timeline</span>
        <Tag color="default">{events.length} events</Tag>
      </div>
      <div style={{ borderLeft: '2px solid var(--theme-border)', paddingLeft: 16, position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {events.map((e, idx) => (
          <div key={`${e.timestamp}-${idx}`} style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: -21,
                top: 4,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: dotColor(e.documentType),
              }}
            />
            <div style={{ fontWeight: 600, fontSize: 13 }}>{e.action}</div>
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted)', marginTop: 2 }}>
              {fmtDateTime(e.timestamp)}
              {e.user ? ` · ${e.user}` : ''}
              {e.department ? ` · ${e.department}` : ''}
              {e.store ? ` · ${e.store}` : ''}
              {e.document ? (
                <span
                  role="button"
                  tabIndex={0}
                  className="trace-ref-link"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onOpenEvent?.(e);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') {
                      ev.stopPropagation();
                      onOpenEvent?.(e);
                    }
                  }}
                  style={{ marginLeft: 6, color: 'var(--theme-link, #1677ff)', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  {e.document}
                </span>
              ) : null}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>
                Qty <b style={{ color: 'var(--theme-text)' }}>{fmt(e.quantity)}</b>
              </span>
              {e.status ? <Tag color={statusColor(e.status) as string} style={{ fontSize: 11 }}>{e.status}</Tag> : null}
            </div>
            {e.remarks ? <div style={{ fontSize: 12, marginTop: 4 }}>{e.remarks}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
};

function dotColor(docType: string | null): string {
  const map: Record<string, string> = {
    MR: '#1677ff',
    ISSUE: '#f5222d',
    RETURN: '#fa8c16',
    GRN: '#52c41a',
    PR: '#722ed1',
    STOCK_TRANSFER: '#13c2c2',
    STOCK_ADJUSTMENT: '#eb2f96',
  };
  return map[String(docType || '').toUpperCase()] ?? '#8c8c8c';
}