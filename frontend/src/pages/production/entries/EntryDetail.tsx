import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Tag, Button, Space, Spin, message, Typography, Divider, Popconfirm, Row, Col,
} from 'antd';
import { ArrowLeftOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber, toNum } from '../../../utils/numberFormat';

const { Title, Text } = Typography;

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

  const pctColor = (v: number) => (v >= 100 ? 'green' : v >= 90 ? 'orange' : 'red');
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
                <Tag color={pctColor(ach)}>{ach.toFixed(2)}%</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Efficiency %">
                <Tag color={pctColor(eff)}>{eff.toFixed(2)}%</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>

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
        </Col>

        <Col span={8}>
          <Card size="small">
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <Text type="secondary">Achievement vs Target</Text>
              <div style={{ fontSize: 40, fontWeight: 700, color: pctColor(ach) === 'green' ? 'var(--theme-success)' : 'var(--theme-danger)' }}>
                {ach.toFixed(1)}%
              </div>
              <Divider />
              <Text type="secondary">Efficiency</Text>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{eff.toFixed(1)}%</div>
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

export default EntryDetail;
