import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Tag, Button, Space, Spin, App, Typography, Divider, Popconfirm, Row, Col, Table, Alert, Skeleton,
} from 'antd';
import { ArrowLeftOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber, formatDimension, toNum } from '../../../utils/numberFormat';
import { ITEM_TYPES } from '../../master-data/items/itemTypes';
import KpiPercentage from '../../../components/kpi/KpiPercentage';

const { Title, Text } = Typography;

interface DowntimeDetail {
  id: string;
  lineNumber: number;
  downtimeReasonId: string | null;
  downtimeReasonText?: string | null;
  downtimeReason?: { id: string; name: string } | null;
  downtimeHours: number | string;
  remarks: string | null;
}

interface ProductionItemDetail {
  id: string;
  lineNumber: number;
  itemId: string | null;
  item?: { itemCode: string; name: string; wireSizeMm?: number | null; weightPerMeter?: number | null } | null;
  uom?: { code: string; symbol: string } | null;
  targetQuantity: number | string;
  actualQuantity: number | string;
  scrapQuantity: number | string;
  runningHours: number | string;
  remarks: string | null;
}

interface StockBalance {
  id: string;
  item?: { id: string; name: string; itemCode: string };
  warehouse?: { id: string; name: string };
  onHand: number;
  reserved: number;
  available: number;
  uom?: { id: string; code: string; name: string };
}

interface DetailData {
  id: string;
  entryDate: string;
  division?: { divisionCode: string; name: string };
  section?: { name: string };
  department?: { name: string; departmentCode: string };
  shiftId?: string;
  shift?: { id: string; name: string; startTime: string | null; endTime: string | null; plannedHours: number };
  machineNo: string;
  operatorName: string;
  supervisorName: string | null;
  itemId: string;
  item?: {
    itemCode: string; name: string; wireSizeMm?: number | null; baseUom?: { code: string; symbol?: string } | null;
    /** TASK #34B: the exact input material consumed by the current item's production stage. */
    productionInItem?: { id: string; itemCode: string; name: string; wireSizeMm?: number | null; itemType?: string | null } | null;
  };
  uom?: { code: string; symbol: string };
  targetQuantity: number | string;
  actualQuantity: number | string;
  achievementPercentage: number | string;
  efficiencyPercentage: number | string;
  runningHours: number | string;
  downtimeHours: number | string;
  downtimeReasonText?: string | null;
  scrapQuantity: number | string;
  remarks: string | null;
  productionOrder?: { id: string; orderNumber: string } | null;
  productionOrderOperationId: string | null;
  inventoryReferenceId: string | null;
  createdByUser?: { fullName: string };
  downtime?: { plannedHours: number } | null;
  downtimes?: DowntimeDetail[];
  items?: ProductionItemDetail[];
  route?: {
    routingCode?: string; name?: string;
    operations?: Array<{ sequenceNo: number; operationName?: string; department?: { name?: string } | null }>;
  } | null;
}

/** Short, reusable lettered section header (hierarchical A–I view). */
const Section: React.FC<{ letter: string; title: string; children: React.ReactNode }> = ({ letter, title, children }) => (
  <Card
    size="small"
    style={{ marginTop: 16 }}
    title={
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 22, height: 22, borderRadius: 4,
            background: 'var(--theme-primary)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '0 6px',
          }}
        >
          {letter}
        </span>
        <span>{title}</span>
      </span>
    }
  >
    {children}
  </Card>
);

const EntryDetail: React.FC = () => {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await apiService.get<{ success: boolean } & { data: DetailData }>(`/production/entries/${id}`);
        setEntry(res.data);
      } catch {
        message.error('Failed to load production entry');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, message]);

  // Real inventory balances from the existing inventory-balance architecture
  // (never fabricated): the same /inventory/balances endpoint + filter the
  // Inventory Reports screen uses, scoped to this entry's item.
  useEffect(() => {
    if (!entry?.itemId) return;
    let cancelled = false;
    setBalancesLoading(true);
    setBalancesError(null);
    void (async () => {
      try {
        const r = await apiService.get<{ data: StockBalance[] }>('/inventory/balances', { itemId: entry.itemId, limit: 100 });
        if (!cancelled) setBalances(r.data || []);
      } catch {
        if (!cancelled) setBalancesError('Stock balances are unavailable for this item (inventory.view permission required).');
      } finally {
        if (!cancelled) setBalancesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entry?.itemId]);

  if (loading) return <Card><Spin style={{ width: '100%', marginTop: 80 }} /></Card>;
  if (!entry) return <Card>Entry not found.</Card>;

  const ach = toNum(entry.achievementPercentage);
  const eff = toNum(entry.efficiencyPercentage);
  const planned = entry.downtime?.plannedHours ?? null;
  const totalDowntime = toNum(entry.downtimeHours);
  const running = toNum(entry.runningHours);
  const remaining = planned != null ? Math.max(0, planned - running - totalDowntime) : null;
  const wireSize = entry.item?.wireSizeMm != null ? `${formatDimension(entry.item.wireSizeMm)} mm` : '—';

  const sectionCtx = (
    <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
      <Descriptions.Item label="Entry ID"><Text type="secondary" style={{ fontSize: 12 }}>{entry.id}</Text></Descriptions.Item>
      <Descriptions.Item label="Division">{entry.division?.divisionCode} — {entry.division?.name}</Descriptions.Item>
      <Descriptions.Item label="Section">{entry.section?.name}</Descriptions.Item>
      <Descriptions.Item label="Department">{entry.department?.departmentCode} — {entry.department?.name}</Descriptions.Item>
      <Descriptions.Item label="Date">{dayjs(entry.entryDate).format('DD-MMM-YYYY')}</Descriptions.Item>
      <Descriptions.Item label="Shift">
        {entry.shift ? `${entry.shift.name} (${entry.shift.startTime ?? ''}–${entry.shift.endTime ?? ''})` : '—'}
      </Descriptions.Item>
      <Descriptions.Item label="Machine No."><Text strong>{entry.machineNo}</Text></Descriptions.Item>
      <Descriptions.Item label="Operator">{entry.operatorName}</Descriptions.Item>
      <Descriptions.Item label="Supervisor">{entry.supervisorName ?? '—'}</Descriptions.Item>
    </Descriptions>
  );

  const sectionItem = (
    <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
      <Descriptions.Item label="Item" span={2}>
        <Text strong>{entry.item?.itemCode}</Text> — {entry.item?.name}
      </Descriptions.Item>
      <Descriptions.Item label="Wire Size">
        <Text strong>{wireSize}</Text>
      </Descriptions.Item>
      <Descriptions.Item label="UOM">{entry.uom?.code}{entry.uom?.symbol ? ` (${entry.uom.symbol})` : ''}</Descriptions.Item>
      <Descriptions.Item label="Base UOM">{entry.item?.baseUom?.code ?? '—'}</Descriptions.Item>
      {/* TASK #34B/#34C: the current item IS the output product; show its exact input
          material together with useful Item Master details (type, wire size). */}
      <Descriptions.Item label="Input Material" span={2}>
        {(() => {
          const productionInput = entry.item?.productionInItem ?? null;
          if (!productionInput) {
            return <Text type="secondary">— (raw material / root item)</Text>;
          }
          const typeLabel =
            (productionInput.itemType &&
              ITEM_TYPES.find((t) => t.value === productionInput.itemType)?.label) ||
            productionInput.itemType ||
            '';
          return (
            <span style={{ color: 'var(--theme-primary)' }}>
              <Text strong>{productionInput.itemCode}</Text> — {productionInput.name}
              {typeLabel ? ` · ${typeLabel}` : ''}
              {productionInput.wireSizeMm != null ? ` · Wire ${formatDimension(productionInput.wireSizeMm)} mm` : ''}
            </span>
          );
        })()}
      </Descriptions.Item>
    </Descriptions>
  );

  const sectionFigures = (
    <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
      <Descriptions.Item label="Target Production">{formatNumber(entry.targetQuantity, 3)}</Descriptions.Item>
      <Descriptions.Item label="Actual Good Production"><Text strong>{formatNumber(entry.actualQuantity, 3)}</Text></Descriptions.Item>
      <Descriptions.Item label="Rejection / Scrap">{formatNumber(entry.scrapQuantity, 3)}</Descriptions.Item>
      <Descriptions.Item label="Running Hours">{formatNumber(running, 2)}h</Descriptions.Item>
      <Descriptions.Item
        label="Downtime Hours"
        contentStyle={totalDowntime > 0 ? { background: 'var(--theme-warning-soft)' } : undefined}
      >
        {formatNumber(totalDowntime, 2)}h
      </Descriptions.Item>
      <Descriptions.Item label="Achievement %"><KpiPercentage value={ach} /></Descriptions.Item>
      <Descriptions.Item label="Efficiency %"><KpiPercentage value={eff} /></Descriptions.Item>
    </Descriptions>
  );

  const sectionDowntime = (
    <DowntimeView
      downtimeHours={entry.downtimeHours}
      runningHours={entry.runningHours}
      plannedHours={planned}
      remainingHours={remaining}
      lines={entry.downtimes ?? []}
    />
  );

  const sectionRoute = entry.route && entry.route.operations && entry.route.operations.length > 0 ? (
    <div>
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
        {entry.route.routingCode}{entry.route.name ? ` — ${entry.route.name}` : ''} · {entry.route.operations.length} operation(s)
      </Text>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {entry.route.operations.slice().sort((a, b) => a.sequenceNo - b.sequenceNo).map((op, idx, arr) => (
          <React.Fragment key={idx}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px',
                background: 'var(--theme-surface-alt)',
                borderRadius: 4,
                border: '1px solid var(--theme-border)',
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--theme-primary)', color: '#fff',
                fontSize: 11, fontWeight: 600, flexShrink: 0,
              }}>
                {idx + 1}
              </span>
              <Text strong style={{ fontSize: 12 }}>{op.operationName ?? 'Operation'}</Text>
              {op.department?.name && (
                <Text type="secondary" style={{ fontSize: 11 }}>({op.department.name})</Text>
              )}
            </div>
            {idx < arr.length - 1 && (
              <div style={{ textAlign: 'center', color: 'var(--theme-text-muted)', fontSize: 14, lineHeight: '16px' }}>
                ↓
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  ) : (
    <Text type="secondary">No production route configured for this item.</Text>
  );

  const sectionStock = (
    <div>
      <div style={{ marginBottom: 12 }}>
        {entry.inventoryReferenceId ? (
          <Tag color="green">Posted to stock (ref {entry.inventoryReferenceId.slice(0, 8)}…)</Tag>
        ) : (
          <Tag>Not posted to stock</Tag>
        )}
      </div>
      {balancesLoading ? (
        <Skeleton active paragraph={{ rows: 1 }} />
      ) : balancesError ? (
        <Alert type="warning" showIcon message={balancesError} />
      ) : balances.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          No stock balances recorded for {entry.item?.itemCode ?? 'this item'} across any warehouse.
        </Text>
      ) : (
        <Table
          key={balances.map((b) => b.id).join('|')}
          rowKey="id" size="small" pagination={false}
          dataSource={balances}
          columns={[
            { title: 'Warehouse', key: 'warehouse', render: (_, r) => r.warehouse?.name ?? '—' },
            { title: 'On Hand', dataIndex: 'onHand', align: 'right' as const, render: (v) => formatNumber(v, 3) },
            { title: 'Reserved', dataIndex: 'reserved', align: 'right' as const, render: (v) => formatNumber(v, 3) },
            { title: 'Available', dataIndex: 'available', align: 'right' as const, render: (v) => formatNumber(v, 3) },
            { title: 'UOM', key: 'uom', render: (_, r) => r.uom?.code ?? '—' },
          ]}
        />
      )}
    </div>
  );

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/production/entries')}>Back</Button>
        <Title level={4} style={{ margin: 0 }}>Production Entry — {dayjs(entry.entryDate).format('YYYY-MM-DD')}</Title>
      </Space>

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Section letter="A" title="Production Context">{sectionCtx}</Section>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Section letter="B" title="Item & Wire Size">{sectionItem}</Section>
            </Col>
            <Col xs={24} md={12}>
              <Section letter="C" title="Production Figures">{sectionFigures}</Section>
            </Col>
          </Row>

          <Section letter="D" title="Downtime Breakdown">{sectionDowntime}</Section>

          {entry.items && entry.items.length > 0 && (
            <Section letter="E" title="Production Output Lines">
              <Table rowKey="id" size="small" pagination={false}
                dataSource={entry.items}
                columns={[
                  { title: '#', dataIndex: 'lineNumber', width: 40 },
                  {
                    title: 'Item', key: 'item',
                    render: (_, r) => r.item ? <Text strong>{r.item.itemCode} — {r.item.name}</Text> : '—',
                  },
                  {
                    title: 'Wire Size', key: 'wire', width: 110,
                    render: (_, r) => r.item?.wireSizeMm != null ? `${formatDimension(r.item.wireSizeMm)} mm` : '—',
                  },
                  { title: 'Actual', dataIndex: 'actualQuantity', width: 90, align: 'right', render: (v) => formatNumber(v, 3) },
                  { title: 'Scrap', dataIndex: 'scrapQuantity', width: 90, align: 'right', render: (v) => formatNumber(v, 3) },
                  { title: 'UOM', key: 'uom', width: 70, render: (_, r) => r.uom?.code ?? '—' },
                  { title: 'KG', key: 'kg', width: 90, align: 'right', render: (_, r) => r.item?.weightPerMeter != null ? formatNumber(toNum(r.actualQuantity) * toNum(r.item.weightPerMeter), 3) : '—' },
                ]}
              />
            </Section>
          )}

          <Section letter="F" title="Production Route">{sectionRoute}</Section>

          <Section letter="G" title="Stock & Posting">{sectionStock}</Section>

          <Section letter="H" title="Linkages">
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="Production Order">
                {entry.productionOrder ? (
                  <Button type="link" size="small" onClick={() => navigate(`/production/orders/${entry.productionOrder!.id}`)}>
                    {entry.productionOrder.orderNumber}
                  </Button>
                ) : (
                  '—'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Operation ID">{entry.productionOrderOperationId?.slice(0, 8) || '—'}</Descriptions.Item>
            </Descriptions>
          </Section>

          <Section letter="I" title="Remarks & Entry Metadata">
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
              <Descriptions.Item label="Remarks" span={2}>{entry.remarks ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Created By">{entry.createdByUser?.fullName ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Entry ID"><Text type="secondary" style={{ fontSize: 12 }}>{entry.id}</Text></Descriptions.Item>
            </Descriptions>
          </Section>
        </Col>

        <Col xs={24} lg={8}>
          <Card size="small">
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <Text type="secondary">Achievement vs Target</Text>
              <div>
                <KpiPercentage value={ach} fontSize={40} fontWeight={700} />
              </div>
              <Divider />
              <Text type="secondary">Efficiency</Text>
              <div>
                <KpiPercentage value={eff} fontSize={28} fontWeight={600} />
              </div>
              <div style={{ marginTop: 4 }}>
                <Text type="secondary">
                  {formatNumber(entry.actualQuantity, 3)} of {formatNumber(entry.targetQuantity, 3)} {entry.uom?.code} produced
                </Text>
              </div>
            </div>
          </Card>
          <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
            <Button type="primary" icon={<EditOutlined />} block onClick={() => navigate(`/production/entries/${id}/edit`)}>
              Edit Entry
            </Button>
            <PopconfirmDelete onDeleted={() => navigate('/production/entries')} id={id!} />
          </Space>
        </Col>
      </Row>
    </div>
  );
};

const PopconfirmDelete: React.FC<{ id: string; onDeleted: () => void }> = ({ id, onDeleted }) => {
  const { message } = App.useApp();
  return (
    <Popconfirm
      title="Delete this production entry?"
      onConfirm={async () => {
        try {
          await apiService.delete(`/production/entries/${id}`);
          message.success('Entry deleted');
          onDeleted();
        } catch { message.error('Failed to delete entry'); }
      }}
    >
      <Button danger icon={<DeleteOutlined />} block>Delete Entry</Button>
    </Popconfirm>
  );
};

/** Downtime breakdown: planned / running / total / remaining summary + every line. */
const DowntimeView: React.FC<{
  downtimeHours: number | string;
  runningHours: number | string;
  plannedHours: number | null;
  remainingHours: number | null;
  lines: DowntimeDetail[];
}> = ({ downtimeHours, runningHours, plannedHours, remainingHours, lines }) => {
  const total = toNum(downtimeHours);
  const running = toNum(runningHours);
  const summary = [
    { label: 'Planned', value: plannedHours != null ? `${formatNumber(plannedHours, 2)}h` : '—' },
    { label: 'Running', value: `${formatNumber(running, 2)}h` },
    { label: 'Total Downtime', value: `${formatNumber(total, 2)}h`, accent: total > 0 },
    { label: 'Remaining', value: remainingHours != null ? `${formatNumber(remainingHours, 2)}h` : '—', strong: true },
  ];
  return (
    <div>
      <Row gutter={[8, 8]}>
        {summary.map((s) => (
          <Col xs={12} md={6} key={s.label}>
            <div style={{
              background: s.accent ? 'var(--theme-warning-soft)' : 'var(--theme-surface-alt)',
              borderRadius: 6, padding: '4px 8px',
            }}>
              <Text type="secondary" style={{ fontSize: 11 }}>{s.label}</Text>
              <div><Text strong={s.strong}>{s.value}</Text></div>
            </div>
          </Col>
        ))}
      </Row>
      <Divider style={{ margin: '12px 0' }} />
      {lines.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>No downtime entries were recorded for this production entry.</Text>
      ) : (
        <Table
          rowKey={(l) => l.id || `${l.lineNumber}`}
          size="small" pagination={false}
          dataSource={lines}
          columns={[
            { title: '#', key: 'idx', width: 40, render: (_: unknown, _r: DowntimeDetail, idx: number) => idx + 1 },
            { title: 'Reason', key: 'reason', render: (_: unknown, l: DowntimeDetail) => <Text strong style={{ fontSize: 12 }}>{l.downtimeReason?.name ?? l.downtimeReasonText ?? 'Downtime'}</Text> },
            { title: 'Hours', key: 'hours', width: 90, align: 'right', render: (_: unknown, l: DowntimeDetail) => `${formatNumber(l.downtimeHours, 2)}h` },
            {
              title: 'Other / Custom Text', key: 'other', render: (_: unknown, l: DowntimeDetail) => {
                const showOther = l.downtimeReasonText && (!l.downtimeReason?.name || (l.downtimeReasonText.toLowerCase() === 'other' ? true : l.downtimeReasonText !== l.downtimeReason?.name));
                return showOther ? <Text style={{ fontSize: 12 }}>{l.downtimeReasonText}</Text> : '—';
              },
            },
            { title: 'Notes', key: 'notes', render: (_: unknown, l: DowntimeDetail) => l.remarks ? <Text style={{ fontSize: 12 }}>{l.remarks}</Text> : '—' },
          ]}
        />
      )}
    </div>
  );
};

export default EntryDetail;
