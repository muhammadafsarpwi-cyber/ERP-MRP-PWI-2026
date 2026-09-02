import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Tag, Button, Space, Spin, message, Typography, Divider, Popconfirm, Row, Col, Table,
} from 'antd';
import { ArrowLeftOutlined, EditOutlined, DeleteOutlined, ClockCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber, toNum } from '../../../utils/numberFormat';
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
  coilSize: string | null;
  item?: { itemCode: string; name: string };
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

const EntryDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, [id]);

  if (loading) return <Card><Spin style={{ width: '100%', marginTop: 80 }} /></Card>;
  if (!entry) return <Card>Entry not found.</Card>;

  const ach = toNum(entry.achievementPercentage);
  const eff = toNum(entry.efficiencyPercentage);

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/production/entries')}>Back</Button>
        <Title level={4} style={{ margin: 0 }}>Production Entry — {dayjs(entry.entryDate).format('YYYY-MM-DD')}</Title>
      </Space>

      <Row gutter={16}>
        <Col span={16}>
          <Card size="small" title="Department Context">
            <Descriptions column={3} size="small" bordered>
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
              <Descriptions.Item label="Coil Size">{entry.coilSize ?? '—'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card size="small" title="Production Figures" style={{ marginTop: 16 }}>
            <Descriptions column={3} size="small" bordered>
              <Descriptions.Item label="Item">
                <Text strong>{entry.item?.itemCode}</Text> — {entry.item?.name}
              </Descriptions.Item>
              <Descriptions.Item label="UOM">{entry.uom?.code}</Descriptions.Item>
              <Descriptions.Item label="Target Production">{formatNumber(entry.targetQuantity, 0)}</Descriptions.Item>
              <Descriptions.Item label="Actual Good Production">{formatNumber(entry.actualQuantity, 0)}</Descriptions.Item>
              <Descriptions.Item label="Rejection / Scrap">{formatNumber(entry.scrapQuantity, 0)}</Descriptions.Item>
              <Descriptions.Item label="Running Hours">{formatNumber(entry.runningHours, 2)}</Descriptions.Item>
              <Descriptions.Item
                label="Downtime Hours"
                contentStyle={toNum(entry.downtimeHours) > 0 ? { background: 'var(--theme-warning-soft)' } : undefined}
              >
                {formatNumber(entry.downtimeHours, 2)}
                {entry.downtimeReasonText ? ` (${entry.downtimeReasonText})` : ''}
              </Descriptions.Item>
              <Descriptions.Item label="Achievement %">
                <KpiPercentage value={ach} />
              </Descriptions.Item>
              <Descriptions.Item label="Efficiency %">
                <KpiPercentage value={eff} />
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card
            size="small"
            title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClockCircleOutlined /> Downtime
            </span>}
            style={{ marginTop: 16 }}
          >
            <DowntimeView downtimeHours={entry.downtimeHours} runningHours={entry.runningHours} plannedHours={entry.downtime?.plannedHours ?? null} lines={entry.downtimes ?? []} />
          </Card>

          {entry.items && entry.items.length > 0 && (
            <Card size="small" title="Production Items" style={{ marginTop: 16 }}>
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
                    render: (_, r) => r.item?.wireSizeMm != null ? `${formatNumber(r.item.wireSizeMm, 3)} mm` : '—',
                  },
                  { title: 'Actual', dataIndex: 'actualQuantity', width: 90, align: 'right', render: (v) => formatNumber(v, 3) },
                  { title: 'Scrap', dataIndex: 'scrapQuantity', width: 90, align: 'right', render: (v) => formatNumber(v, 3) },
                  { title: 'UOM', key: 'uom', width: 70, render: (_, r) => r.uom?.code ?? '—' },
                  { title: 'KG', key: 'kg', width: 90, align: 'right', render: (_, r) => r.item?.weightPerMeter != null ? formatNumber(toNum(r.actualQuantity) * toNum(r.item.weightPerMeter), 3) : '—' },
                ]}
              />
            </Card>
          )}

          <Card size="small" title="Linkages & Posting" style={{ marginTop: 16 }}>
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
              <Descriptions.Item label="Inventory Posting">
                {entry.inventoryReferenceId ? (
                  <Tag color="green">Posted to stock (ref {entry.inventoryReferenceId.slice(0, 8)}…)</Tag>
                ) : (
                  <Tag>Not posted</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Remarks" span={2}>{entry.remarks ?? '—'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card size="small" title="Production Route" style={{ marginTop: 16 }}>
            {entry.route && entry.route.operations && entry.route.operations.length > 0 ? (
              <div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
                  {entry.route.routingCode}{entry.route.name ? ` — ${entry.route.name}` : ''} · {entry.route.operations.length} operation(s)
                </Text>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {entry.route.operations.sort((a, b) => a.sequenceNo - b.sequenceNo).map((op, idx, arr) => (
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
            )}
          </Card>
        </Col>

        <Col span={8}>
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
                  {formatNumber(entry.actualQuantity, 0)} of {formatNumber(entry.targetQuantity, 0)} {entry.uom?.code} produced
                </Text>
              </div>
            </div>
          </Card>
          <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
            <Button icon={<EditOutlined />} block onClick={() => navigate(`/production/entries/${id}/edit`)}>
              Edit Entry
            </Button>
            <PopconfirmDelete onDeleted={() => navigate('/production/entries')} id={id!} />
          </Space>
        </Col>
      </Row>
    </div>
  );
};

const PopconfirmDelete: React.FC<{ id: string; onDeleted: () => void }> = ({ id, onDeleted }) => (
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

/** Downtime breakdown card: planned / running / total summary + every line. */
const DowntimeView: React.FC<{
  downtimeHours: number | string;
  runningHours: number | string;
  plannedHours: number | null;
  lines: DowntimeDetail[];
}> = ({ downtimeHours, runningHours, plannedHours, lines }) => {
  const total = toNum(downtimeHours);
  const running = toNum(runningHours);
  const summary = [
    { label: 'Planned', value: plannedHours != null ? `${formatNumber(plannedHours, 2)}h` : '—' },
    { label: 'Running', value: `${formatNumber(running, 2)}h` },
    { label: 'Total Downtime', value: `${formatNumber(total, 2)}h`, accent: total > 0 },
  ];
  return (
    <div>
      <Row gutter={8} style={{ marginBottom: 8 }}>
        {summary.map((s) => (
          <Col span={8} key={s.label}>
            <div style={{
              background: s.accent ? 'var(--theme-warning-soft)' : 'var(--theme-surface-alt)',
              borderRadius: 6, padding: '4px 8px',
            }}>
              <Text type="secondary" style={{ fontSize: 11 }}>{s.label}</Text>
              <div><Text strong>{s.value}</Text></div>
            </div>
          </Col>
        ))}
      </Row>
      {lines.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>No downtime recorded.</Text>
      ) : (
        lines.map((l, idx) => (
          <div key={l.id || idx} style={{ paddingBottom: 6, marginBottom: 6, borderBottom: idx < lines.length - 1 ? '1px solid var(--theme-border)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text strong style={{ fontSize: 12 }}>
                {idx + 1}. {l.downtimeReason?.name ?? l.downtimeReasonText ?? 'Downtime'}
              </Text>
              <Text strong style={{ fontSize: 12 }}>
                {formatNumber(l.downtimeHours, 2)}h
              </Text>
            </div>
            {l.downtimeReasonText && (!l.downtimeReason?.name || (l.downtimeReasonText.toLowerCase() === 'other' ? true : l.downtimeReasonText !== l.downtimeReason?.name)) && (
              <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Other: {l.downtimeReasonText}</Text>
            )}
            {l.remarks && <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Notes: {l.remarks}</Text>}
          </div>
        ))
      )}
    </div>
  );
};

export default EntryDetail;
