import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Empty, Select, Space, Spin, Table, Tag } from 'antd';
import { ArrowLeftOutlined, HistoryOutlined, ReloadOutlined, TagsOutlined } from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/shared/PageHeader';
import usePermission from '../../hooks/usePermission';
import {
  fetchItemLifecycle,
  type EtaRow,
  type MaterialLifecycle,
  type MaterialLifecycleFilters,
} from '../../services/storeMaterialTrace';
import { fetchStores, type StoreOption } from '../../services/storeDashboard';
import { DocumentDetailDrawer } from './components/lifecycle/DocumentDetailDrawer';
import { DocRef, DocTypeKey, DOC_META, fmt, fmtDate, fmtDateTime, statusColor } from './components/lifecycle/helpers';
import { RequestsTable, PrsTable, OrdersTable, GrnsTable, IssuesTable, ReturnsTable, TransfersTable, AdjustmentsTable, ReservationsTable, LedgerTable } from './components/lifecycle/tables';
import { ItemInfoTab, StoreConfigTab, CurrentStockTab, MinMaxTab, ProcurementStatusTab, BarcodeTab, TimelineSteps, AuditTimeline } from './components/lifecycle/profileTabs';

const TABS = [
  'Item Information',
  'Store Configuration',
  'Current Stock',
  'Min/Max',
  'Procurement Status',
  'Material Requests',
  'PRs',
  'Supplier Orders',
  'GRNs',
  'Issues',
  'Returns',
  'Transfers',
  'Adjustments',
  'Ledger',
  'Barcode',
  'Complete Timeline',
];

const deliveryChip = (r: EtaRow): React.ReactNode => {
  switch (r.deliveryStatus) {
    case 'DELIVERED':
      return <Tag color="green">Delivered {fmtDate(r.actualDeliveryDate)}</Tag>;
    case 'OVERDUE':
      return <Tag color="volcano">Overdue by {r.overdueByDays ?? 0} days</Tag>;
    case 'UPCOMING':
      return <Tag color="gold">Expected in {r.expectedInDays ?? 0} days</Tag>;
    default:
      return <Tag color="purple">Pending</Tag>;
  }
};

const leadTimeDefs: Array<{ label: string; key: keyof EtaRow['leadTimes'] }> = [
  { label: 'Request → PR', key: 'requestToPr' },
  { label: 'Submitted → Manager Approval', key: 'requestToManagerApproval' },
  { label: 'Manager → GM Approval', key: 'managerToGmApproval' },
  { label: 'GM Approval → Conversion', key: 'gmApprovalToConversion' },
  { label: 'Conversion → Order', key: 'conversionToOrder' },
  { label: 'Order → Supplier Confirmation', key: 'orderToSupplierConfirmation' },
  { label: 'Supplier Confirmation → Delivery', key: 'supplierConfirmationToDelivery' },
  { label: 'Total Lead Time', key: 'totalLeadTime' },
];

const EtaDetail: React.FC<{ row: EtaRow }> = ({ row }) => {
  const measured = leadTimeDefs.reduce((acc, d) => acc + (row.leadTimes[d.key] != null ? 1 : 0), 0);
  return (
    <div style={{ padding: '8px 16px', maxWidth: 1100 }}>
      <Descriptions title="Tracking Dates" bordered size="small" column={{ xs: 2, md: 3 }}>
        <Descriptions.Item label="Request Date">{row.dates.request ? fmtDate(row.dates.request) : '—'}</Descriptions.Item>
        <Descriptions.Item label="Submitted">{row.dates.submitted ? fmtDateTime(row.dates.submitted) : '—'}</Descriptions.Item>
        <Descriptions.Item label="Manager Approval">{row.dates.approval ? fmtDateTime(row.dates.approval) : '—'}</Descriptions.Item>
        <Descriptions.Item label="GM Approval">{row.dates.gmApproval ? fmtDateTime(row.dates.gmApproval) : '—'}</Descriptions.Item>
        <Descriptions.Item label="PR Created">{row.dates.conversion ? fmtDateTime(row.dates.conversion) : '—'}</Descriptions.Item>
        <Descriptions.Item label="Order Date">{row.dates.order ? fmtDate(row.dates.order) : '—'}</Descriptions.Item>
        <Descriptions.Item label="Supplier Confirmed">{row.dates.supplierConfirmed ? fmtDate(row.dates.supplierConfirmed) : '—'}</Descriptions.Item>
        <Descriptions.Item label="Expected Delivery">{row.dates.expected ? fmtDate(row.dates.expected) : '—'}</Descriptions.Item>
        <Descriptions.Item label="Actual Delivery">{row.dates.actual ? fmtDate(row.dates.actual) : '—'}</Descriptions.Item>
      </Descriptions>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 8px' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Lead Time Breakdown</span>
        <Tag color="default">
          {measured}/{leadTimeDefs.length} stages measured
        </Tag>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        {leadTimeDefs.map((d) => (
          <div key={d.key} className="trace-metric">
            <div style={{ fontSize: 18, fontWeight: 600 }}>{row.leadTimes[d.key] != null ? `${row.leadTimes[d.key]} days` : '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>{d.label}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>{deliveryChip(row)}</div>
    </div>
  );
};

const EtaTable: React.FC<{ rows: EtaRow[]; onOpen: (type: 'MR' | 'PR' | 'PO', id: string | null | undefined, number: string | null | undefined) => void }> = ({ rows, onOpen }) => {
  const columns = [
    { title: 'MR', dataIndex: 'requestNumber', width: 150, render: (v: string, r: EtaRow) => <span className="trace-ref-link" role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onOpen('MR', r.requestId, r.requestNumber); }} onKeyDown={(e) => { if (e.key === 'Enter') onOpen('MR', r.requestId, r.requestNumber); }} style={{ textDecoration: 'underline', cursor: 'pointer' }}>{v}</span> },
    { title: 'Request Date', dataIndex: 'requestDate', width: 110, render: (v: string) => fmtDate(v) },
    { title: 'Store', dataIndex: 'storeName', width: 150, render: (_: unknown, r: EtaRow) => `${r.storeName} (${r.storeCode})` },
    { title: 'Status', dataIndex: 'status', width: 120, render: (v: string) => <Tag color={statusColor(v) as string}>{v}</Tag> },
    { title: 'Priority', dataIndex: 'priority', width: 90, render: (v: string) => v },
    { title: 'PR', dataIndex: 'prNumber', width: 140, render: (v: string | null, r: EtaRow) => (v ? <span className="trace-ref-link" role="button" tabIndex={0} onClick={() => onOpen('PR', r.prId ?? undefined, v)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen('PR', r.prId ?? undefined, v); }} style={{ textDecoration: 'underline', cursor: 'pointer' }}>{v}</span> : '—') },
    { title: 'PO', dataIndex: 'poNumber', width: 140, render: (v: string | null, r: EtaRow) => (v ? <span className="trace-ref-link" role="button" tabIndex={0} onClick={() => onOpen('PO', r.poId ?? undefined, v)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen('PO', r.poId ?? undefined, v); }} style={{ textDecoration: 'underline', cursor: 'pointer' }}>{v}</span> : '—') },
    { title: 'Expected', dataIndex: 'expectedDeliveryDate', width: 110, render: (v: string | null) => fmtDate(v) },
    { title: 'Lead Time', dataIndex: 'totalLeadTime', width: 110, render: (_: unknown, r: EtaRow) => (r.leadTimes.totalLeadTime != null ? <Tag color={r.deliveryStatus === 'OVERDUE' ? 'volcano' : 'geekblue'}>{r.leadTimes.totalLeadTime} days</Tag> : '—') },
    { title: 'Delivery', dataIndex: 'deliveryStatus', width: 150, render: (_: unknown, r: EtaRow) => deliveryChip(r) },
  ];
  return (
    <Table
      size="small"
      rowKey="requestId"
      columns={columns}
      dataSource={rows}
      pagination={{ pageSize: 8, hideOnSinglePage: true }}
      scroll={{ x: 'max-content' }}
      expandable={{ expandedRowRender: (r: EtaRow) => <EtaDetail row={r} />, rowExpandable: () => true }}
    />
  );
};

// Maps backend audit document / reference types to drawer document types so every
// audit entry stays click-through without opening a wrong (or missing) endpoint.
const REF_TYPE_TO_DOC: Record<string, DocTypeKey> = {
  MR: 'MR',
  PR: 'PR',
  PO: 'PO',
  GRN: 'GRN',
  GOODS_RECEIPT: 'GRN',
  MATERIAL_ISSUE: 'ISSUE',
  MATERIAL_RETURN: 'RETURN',
  STOCK_TRANSFER: 'TRANSFER',
  STOCK_ADJUSTMENT: 'ADJUSTMENT',
};

const auditDocType = (raw: string | null | undefined): DocTypeKey | null => {
  if (!raw) return null;
  return REF_TYPE_TO_DOC[String(raw).toUpperCase()] ?? null;
};

const reconciliationMetrics: Array<{ label: string; key: keyof MaterialLifecycle['reconciliation']; color?: string }> = [
  { label: 'Requested', key: 'requested' },
  { label: 'PR Quantity', key: 'prQty' },
  { label: 'Approved', key: 'approved' },
  { label: 'Ordered', key: 'orderedQty' },
  { label: 'Supplier Confirmed', key: 'supplierConfirmed' },
  { label: 'Received', key: 'receivedQty' },
  { label: 'Accepted', key: 'acceptedQty' },
  { label: 'Rejected', key: 'rejectedQty' },
  { label: 'Pending Receipt', key: 'pendingReceiptQty', color: '#faad14' },
  { label: 'Issued', key: 'issuedQty' },
  { label: 'Returned', key: 'returnedQty' },
  { label: 'Transferred In', key: 'transferredInQty' },
  { label: 'Transferred Out', key: 'transferredOutQty' },
  { label: 'Reserved', key: 'reservedQty', color: '#722ed1' },
  { label: 'Available', key: 'availableQty', color: '#52c41a' },
];

const storeHistoryMetrics = (lc: MaterialLifecycle): Array<{ label: string; value: number; color?: string }> => [
  { label: 'Opening Stock', value: lc.ledger.opening },
  { label: 'GRN Receipts', value: lc.ledger.totals.grnsIn, color: '#52c41a' },
  { label: 'Store Receipts', value: lc.ledger.totals.materialReceiptsIn, color: '#13c2c2' },
  { label: 'Production Consumption', value: lc.ledger.totals.productionConsumption, color: '#fa541c' },
  { label: 'Material Issues', value: lc.ledger.totals.issuesOut, color: '#f5222d' },
  { label: 'Returns', value: lc.ledger.totals.returnsIn, color: '#fa8c16' },
  { label: 'Transfers In', value: lc.ledger.totals.transfersIn, color: '#1677ff' },
  { label: 'Transfers Out', value: lc.ledger.totals.transfersOut, color: '#2f54eb' },
  { label: 'Adjustments (in)', value: lc.reconciliation.adjustedInQty, color: '#eb2f96' },
  { label: 'Adjustments (out)', value: lc.reconciliation.adjustedOutQty, color: '#c41d7f' },
  { label: 'Reservations', value: lc.ledger.reservations, color: '#722ed1' },
  { label: 'Closing Stock', value: lc.ledger.closing, color: '#3f8600' },
];

const StoreItemLifecycle: React.FC = () => {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();

  const [lc, setLc] = useState<MaterialLifecycle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [activeTab, setActiveTab] = useState('Item Information');
  const [doc, setDoc] = useState<DocRef | null>(null);

  const storeId = searchParams.get('storeId') || undefined;
  const applied = useMemo<MaterialLifecycleFilters>(() => ({ storeId }), [storeId]);

  useEffect(() => {
    fetchStores().then(setStores).catch(() => setStores([]));
  }, []);

  useEffect(() => {
    if (!itemId) return;
    setLoading(true);
    setError(null);
    fetchItemLifecycle(itemId, applied)
      .then(setLc)
      .catch((err: any) => setError(err?.message || 'Failed to load item lifecycle'))
      .finally(() => setLoading(false));
  }, [itemId, applied]);

  const handleStoreChange = (value?: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('storeId', value);
    else next.delete('storeId');
    setSearchParams(next);
  };

  if (!itemId) {
    return (
      <>
        <PageHeader icon={<TagsOutlined />} title="Material Trace" subtitle="Full item lifecycle, history & ETA tracking" />
        <div className="page-container">
          <Empty description="Select an item to trace its complete lifecycle.">
            <Space>
              <Button type="primary" onClick={() => navigate('/store/stock-balance')}>
                Browse Store Stock
              </Button>
              <Button onClick={() => navigate('/store/material-requests')}>
                Browse Material Requests
              </Button>
            </Space>
          </Empty>
        </div>
      </>
    );
  }

  const item = lc?.item;

  const tabRender = (): React.ReactNode => {
    if (!lc) return null;
    switch (activeTab) {
      case 'Item Information': return <ItemInfoTab item={lc.item} />;
      case 'Store Configuration': return <StoreConfigTab rows={lc.storeConfigs} />;
      case 'Current Stock': return <CurrentStockTab rows={lc.currentStock.rows} />;
      case 'Min/Max': return <MinMaxTab lc={lc} />;
      case 'Procurement Status': return <ProcurementStatusTab lc={lc} />;
      case 'Material Requests': return <RequestsTable rows={lc.requests} onOpen={(t, id, num) => setDoc({ type: t, id, number: num })} />;
      case 'PRs': return <PrsTable rows={lc.prs} onOpen={(t, id, num) => setDoc({ type: t, id, number: num })} />;
      case 'Supplier Orders': return <OrdersTable rows={lc.orders} onOpen={(t, id, num) => setDoc({ type: t, id, number: num })} />;
      case 'GRNs': return <GrnsTable rows={lc.grns} onOpen={(t, id, num) => setDoc({ type: t, id, number: num })} />;
      case 'Issues': return <IssuesTable rows={lc.issues} onOpen={(t, id, num) => setDoc({ type: t, id, number: num })} />;
      case 'Returns': return <ReturnsTable rows={lc.returns} onOpen={(t, id, num) => setDoc({ type: t, id, number: num })} />;
      case 'Transfers': return <TransfersTable rows={lc.transfers} onOpen={(t, id, num) => setDoc({ type: t, id, number: num })} />;
      case 'Adjustments': return <AdjustmentsTable rows={lc.adjustments} onOpen={(t, id, num) => setDoc({ type: t, id, number: num })} />;
      case 'Ledger': return <LedgerTable rows={lc.ledger.rows} opening={lc.ledger.opening} onOpen={(t, id, num) => setDoc({ type: t, id, number: num })} />;
      case 'Barcode': return <BarcodeTab item={lc.item} />;
      case 'Complete Timeline':
        return (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small" className="trace-card" title="14-Stage Procurement Timeline">
              <TimelineSteps stages={lc.timeline.stages} />
            </Card>
            <Card size="small" className="trace-card">
              <AuditTimeline
                events={lc.audit}
                onOpenEvent={(e) => {
                  const type = auditDocType(e.documentType);
                  if (e.referenceId && type && DOC_META[type]) {
                    setDoc({ type, id: e.referenceId, number: e.document });
                  }
                }}
              />
            </Card>
          </Space>
        );
      default:
        return null;
    }
  };

  const reservations = lc && lc.reservations.length > 0 ? (
    <Card size="small" className="trace-card" title="Active Reservations" style={{ marginBottom: 12 }}>
      <ReservationsTable rows={lc.reservations} />
    </Card>
  ) : null;

  return (
    <>
      <PageHeader icon={<TagsOutlined />} title="Store Material Lifecycle" subtitle={item ? `${item.item_code} · ${item.name}` : 'Traceability & ETA'} />
      <div className="page-container">
        <Space style={{ marginBottom: 12 }} wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/store/stock-balance')}>
            Back to Stock Balance
          </Button>
          <Select
            allowClear
            placeholder="Filter by store"
            style={{ minWidth: 220 }}
            value={storeId}
            onChange={handleStoreChange}
            options={stores.map((s) => ({ value: s.id, label: `${s.storeName} (${s.storeCode})` }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => { setLoading(true); fetchItemLifecycle(itemId, applied).then(setLc).catch((e: any) => setError(e?.message || 'Failed to reload')).finally(() => setLoading(false)); }}>
            Reload
          </Button>
          {lc && !loading && (
            <Tag color="default">
              Updated {new Date(lc.generatedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Tag>
          )}
        </Space>

        {!can('store.item.view') ? (
          <Alert type="warning" showIcon message="You do not have permission to view store item history." />
        ) : loading && !lc ? (
          <div style={{ textAlign: 'center', padding: 64 }}>
            <Spin size="large" />
          </div>
        ) : error ? (
          <Alert type="error" showIcon message={error} description="Make sure the item exists and you have access." />
        ) : !lc ? (
          <Empty description="No data" />
        ) : (
          <>
            {reservations}
            <Card size="small" className="trace-card" title="Item Procurement Timeline (14 stages)" style={{ marginBottom: 12 }}>
              <TimelineSteps stages={lc.timeline.stages} />
            </Card>
            <Card size="small" className="trace-card" title="Quantity Reconciliation" style={{ marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {reconciliationMetrics.map((m) => (
                  <div key={m.key} className="trace-metric">
                    <div style={{ fontSize: 18, fontWeight: 600, color: m.color || 'var(--theme-text)' }}>{fmt(lc.reconciliation[m.key], 0)}</div>
                    <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card size="small" className="trace-card" title="Store Material History (Stock Ledger Summary)" style={{ marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {storeHistoryMetrics(lc).map((m) => (
                  <div key={m.label} className="trace-metric">
                    <div style={{ fontSize: 18, fontWeight: 600, color: m.color || 'var(--theme-text)' }}>{fmt(m.value, 0)}</div>
                    <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card size="small" className="trace-card" title="Purchase & Delivery ETA" style={{ marginBottom: 12 }}>
              {lc.eta.length > 0 ? (
                <EtaTable rows={lc.eta} onOpen={(t, id, num) => setDoc({ type: t, id, number: num })} />
              ) : (
                <Empty description="No procurement ETA data for this item yet." />
              )}
            </Card>
            <Card size="small" className="trace-card">
              <div className="store-tabs-wrap" style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
                  <div role="tablist" className="store-trace-tabs" style={{ display: 'flex', gap: 8, width: 'max-content', minWidth: '100%' }}>
                    {TABS.map((t) => (
                      <span
                        key={t}
                        role="tab"
                        aria-selected={activeTab === t}
                        className={activeTab === t ? 'trace-tab active' : 'trace-tab'}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          fontWeight: activeTab === t ? 600 : 400,
                          fontSize: 13,
                          color: activeTab === t ? 'var(--theme-text)' : 'var(--theme-text-muted)',
                          background: activeTab === t ? 'var(--theme-bg-elevated, rgba(23,125,220,0.12))' : 'transparent',
                        }}
                        onClick={() => setActiveTab(t)}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>{tabRender()}</div>
              </div>
            </Card>
          </>
        )}
      </div>
      <DocumentDetailDrawer doc={doc} onClose={() => setDoc(null)} />
    </>
  );
};

export default StoreItemLifecycle;