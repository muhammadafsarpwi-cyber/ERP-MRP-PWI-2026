import React, { useState, useEffect } from 'react';
import {
  Modal,
  Tabs,
  Card,
  Descriptions,
  Table,
  Tag,
  Typography,
  Space,
  Button,
  Row,
  Col,
  Statistic,
  Spin,
  Alert,
  Empty,
  QRCode,
  Tooltip,
  theme,
} from 'antd';
import {
  ToolOutlined,
  HistoryOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  PrinterOutlined,
  QrcodeOutlined,
  BarcodeOutlined,
  ReloadOutlined,
  UserOutlined,
  ThunderboltOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { apiService } from '../../services/api';
import BarcodePrint from '../../components/shared/BarcodePrint';

const { Text, Title } = Typography;

export interface MachineLifecycleContentProps {
  machineId: string;
  machineCode?: string;
  barcodeValue?: string;
  inModal?: boolean;
}

export const MachineLifecycleContent: React.FC<MachineLifecycleContentProps> = ({
  machineId,
  machineCode,
  barcodeValue,
  inModal = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [machineData, setMachineData] = useState<any>(null);
  const [jobCards, setJobCards] = useState<any[]>([]);
  const [machineStats, setMachineStats] = useState<any>(null);
  const [toolingChanges, setToolingChanges] = useState<any[]>([]);
  const [productionEntries, setProductionEntries] = useState<any[]>([]);
  const [printOpen, setPrintOpen] = useState(false);
  const { token } = theme.useToken();

  const loadAllHistory = async () => {
    if (!machineId) return;
    try {
      setLoading(true);
      setError(null);

      // Run parallel requests
      const [machineRes, jobCardsRes, statsRes, toolingRes, prodRes] = await Promise.allSettled([
        apiService.get<{ success?: boolean; data?: any }>(`/machines/${machineId}`),
        apiService.get<any>(`/master-data/maintenance/job-cards/machine/${machineId}`),
        apiService.get<any>(`/master-data/maintenance/job-cards/machine/${machineId}/stats`),
        apiService.get<any>('/machine-tooling/changes', { machineId, limit: 50 }),
        apiService.get<any>('/production/entries', { machineId, limit: 50 }),
      ]);

      let resolvedMachine = null;
      if (machineRes.status === 'fulfilled') {
        const val = machineRes.value as any;
        resolvedMachine = val?.data || val || null;
      }

      if (!resolvedMachine) {
        // Fallback: search machine by code or query parameter
        try {
          const listRes = await apiService.get<any>('/machines', { search: machineCode || machineId, limit: 1 });
          const list = Array.isArray(listRes) ? listRes : listRes?.data || listRes?.items || [];
          if (list.length > 0) resolvedMachine = list[0];
        } catch {
          // ignore fallback error
        }
      }
      setMachineData(resolvedMachine);

      const targetId = resolvedMachine?.id || machineId;

      if (jobCardsRes.status === 'fulfilled') {
        const val = jobCardsRes.value as any;
        const list = Array.isArray(val) ? val : val?.data || val?.items || [];
        setJobCards(list);
      } else {
        try {
          const fb = await apiService.get<any>('/master-data/maintenance/job-cards', { machineId: targetId, limit: 50 });
          setJobCards(Array.isArray(fb) ? fb : fb?.data || fb?.items || []);
        } catch {
          setJobCards([]);
        }
      }

      if (statsRes.status === 'fulfilled') {
        const val = statsRes.value as any;
        setMachineStats(val?.data || val || null);
      }

      if (toolingRes.status === 'fulfilled') {
        const val = toolingRes.value as any;
        const list = Array.isArray(val) ? val : val?.data || val?.items || [];
        setToolingChanges(list);
      } else {
        setToolingChanges([]);
      }

      if (prodRes.status === 'fulfilled') {
        const val = prodRes.value as any;
        const list = Array.isArray(val) ? val : val?.data || val?.items || [];
        setProductionEntries(list);
      } else {
        setProductionEntries([]);
      }
    } catch (err: any) {
      console.error('Failed to load machine history:', err);
      setError('Failed to fetch full machine history. Please check network connectivity.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (machineId) {
      loadAllHistory();
    }
  }, [machineId]);

  const effectiveBarcode = barcodeValue || machineData?.barcode || machineCode || machineData?.machineCode || machineData?.code;
  const effectiveName = machineData?.machineName || machineData?.name || machineCode || 'Machine';

  // Count motor changes specifically
  const motorChangesCount = toolingChanges.filter((tc: any) => {
    const name = (tc.componentName || tc.name || tc.toolName || tc.component?.componentName || '').toLowerCase();
    const type = (tc.type || tc.componentType || tc.component?.componentType || '').toLowerCase();
    return name.includes('motor') || type.includes('motor');
  }).length;

  // Maintenance Job Cards Columns
  const jobCardColumns = [
    {
      title: 'Job Card No',
      dataIndex: 'jobCardNo',
      key: 'jobCardNo',
      width: 140,
      render: (val: string) => <Text strong style={{ color: '#1677ff' }}>{val || '-'}</Text>,
    },
    {
      title: 'Date',
      dataIndex: 'requestedAt',
      key: 'requestedAt',
      width: 100,
      render: (val: string) => (val ? new Date(val).toLocaleDateString() : '-'),
    },
    {
      title: 'Type',
      dataIndex: 'maintenanceType',
      key: 'maintenanceType',
      width: 120,
      render: (val: string) => {
        let color = 'default';
        if (val === 'BREAKDOWN') color = 'red';
        else if (val === 'PREVENTIVE') color = 'blue';
        else if (val === 'CORRECTIVE') color = 'orange';
        else if (val === 'EMERGENCY') color = 'magenta';
        return <Tag color={color}>{val || '-'}</Tag>;
      },
    },
    {
      title: 'Issue / Complaint',
      dataIndex: 'complaint',
      key: 'complaint',
      ellipsis: true,
      render: (val: string, r: any) => val || r.description || '-',
    },
    {
      title: 'Technician(s)',
      key: 'technicians',
      width: 180,
      render: (_: any, r: any) => {
        const techs = r.technicians || r.assignedTechnicians || [];
        if (!techs.length) return <Text type="secondary">Unassigned</Text>;
        return (
          <Space wrap size={[4, 2]}>
            {techs.map((t: any, idx: number) => {
              const name = t.technician?.name || t.technicianUser?.fullName || t.technicianUser?.displayName || t.name || 'Tech';
              return (
                <Tag color="cyan" key={t.id || idx} icon={<UserOutlined />}>
                  {name}
                </Tag>
              );
            })}
          </Space>
        );
      },
    },
    {
      title: 'Parts Replaced',
      key: 'parts',
      width: 180,
      render: (_: any, r: any) => {
        const parts = r.parts || [];
        if (!parts.length) return <Text type="secondary">None</Text>;
        return (
          <Space wrap size={[4, 2]}>
            {parts.map((p: any, idx: number) => {
              const pName = p.item?.name || p.itemName || 'Part';
              const qty = p.quantity ? ` (${p.quantity} ${p.uom?.symbol || ''})` : '';
              return (
                <Tag color="volcano" key={p.id || idx} icon={<ToolOutlined />}>
                  {pName}{qty}
                </Tag>
              );
            })}
          </Space>
        );
      },
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 90,
      render: (val: string) => {
        const col = val === 'CRITICAL' || val === 'HIGH' ? 'red' : val === 'MEDIUM' ? 'gold' : 'green';
        return <Tag color={col}>{val || 'NORMAL'}</Tag>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'currentStatus',
      key: 'currentStatus',
      width: 100,
      render: (val: string, r: any) => {
        const s = val || r.status;
        const color = s === 'COMPLETED' || s === 'APPROVED' ? 'green' : s === 'IN_PROGRESS' ? 'processing' : 'default';
        return <Tag color={color}>{s || '-'}</Tag>;
      },
    },
    {
      title: 'Downtime',
      dataIndex: 'downtimeMinutes',
      key: 'downtimeMinutes',
      width: 90,
      render: (val: number) => (val != null ? <Text strong>{val}m</Text> : '-'),
    },
  ];

  // Tooling / Parts changed columns
  const toolingColumns = [
    {
      title: 'Part / Component',
      dataIndex: 'componentName',
      key: 'componentName',
      render: (val: string, r: any) => {
        const name = val || r.name || r.toolName || r.component?.componentName || '-';
        const isMotor = name.toLowerCase().includes('motor');
        return (
          <div>
            <Space>
              {isMotor && <Tag color="magenta" icon={<ThunderboltOutlined />}>MOTOR</Tag>}
              <Text strong>{name}</Text>
            </Space>
            {(r.componentCode || r.code || r.component?.componentCode) && (
              <div style={{ fontSize: 11, color: '#888' }}>
                Code: {r.componentCode || r.code || r.component?.componentCode}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Category',
      dataIndex: 'type',
      key: 'type',
      width: 130,
      render: (val: string, r: any) => {
        const t = val || r.componentType || r.component?.componentType || 'SPARE PART';
        return <Tag color="cyan">{t}</Tag>;
      },
    },
    {
      title: 'Change Date',
      dataIndex: 'changeDate',
      key: 'changeDate',
      width: 110,
      render: (val: string, r: any) => {
        const d = val || r.installedAt || r.createdAt;
        return d ? new Date(d).toLocaleDateString() : '-';
      },
    },
    {
      title: 'Condition',
      dataIndex: 'conditionStatus',
      key: 'conditionStatus',
      width: 110,
      render: (val: string) => {
        const color = val === 'WORN' ? 'orange' : val === 'BROKEN' ? 'red' : 'green';
        return <Tag color={color}>{val || 'REPLACED'}</Tag>;
      },
    },
    {
      title: 'Cycles / Production',
      dataIndex: 'productionSincePrevious',
      key: 'productionSincePrevious',
      width: 130,
      render: (val: number, r: any) => val ?? r.productionAtChange ?? r.cyclesCount ?? '-',
    },
    {
      title: 'Technician',
      key: 'technician',
      width: 140,
      render: (_: any, r: any) => {
        const u = r.changedByUser;
        return u?.fullName || u?.displayName || r.technicianName || '-';
      },
    },
    {
      title: 'Reason / Remarks',
      dataIndex: 'remarks',
      key: 'remarks',
      ellipsis: true,
      render: (val: string, r: any) => val || r.reason || '-',
    },
    {
      title: 'Job Card Ref',
      dataIndex: 'jobCard',
      key: 'jobCard',
      width: 130,
      render: (val: any, r: any) => val?.jobCardNo || r.jobCardNo || (r.jobCardId ? <Text code>{r.jobCardId.slice(0, 8)}</Text> : '-'),
    },
  ];

  // Production entries columns
  const productionColumns = [
    {
      title: 'Date',
      dataIndex: 'entryDate',
      key: 'entryDate',
      width: 100,
      render: (val: string, r: any) => {
        const d = val || r.date || r.createdAt;
        return d ? new Date(d).toLocaleDateString() : '-';
      },
    },
    {
      title: 'Shift',
      dataIndex: 'shift',
      key: 'shift',
      width: 90,
      render: (val: any) => val?.name || val?.shiftName || val || '-',
    },
    {
      title: 'Item Produced',
      dataIndex: 'item',
      key: 'item',
      render: (val: any, r: any) => val?.name || r.itemName || val?.itemCode || '-',
    },
    {
      title: 'Coil / Gauge',
      dataIndex: 'coilSize',
      key: 'coilSize',
      width: 110,
      render: (val: string) => val || '-',
    },
    {
      title: 'Produced Qty',
      key: 'quantity',
      width: 130,
      render: (_: any, r: any) => {
        const qty = r.actualQuantity ?? r.producedQty ?? r.quantity ?? r.outputQty;
        const uom = r.uom?.symbol || r.uomName || '';
        return qty != null ? <Text strong style={{ color: '#52c41a' }}>{qty} {uom}</Text> : '-';
      },
    },
    {
      title: 'Running Hours',
      dataIndex: 'runningHours',
      key: 'runningHours',
      width: 110,
      render: (val: number) => (val != null ? `${val} hrs` : '-'),
    },
    {
      title: 'Downtime',
      dataIndex: 'downtimeHours',
      key: 'downtimeHours',
      width: 100,
      render: (val: number) => (val > 0 ? <Text type="danger">{val} hrs</Text> : '0 hrs'),
    },
    {
      title: 'Scrap / Reject',
      key: 'scrap',
      width: 110,
      render: (_: any, r: any) => {
        const scrap = r.scrapQuantity ?? r.scrapQty ?? r.rejectedQty ?? 0;
        return scrap > 0 ? <Text type="danger">{scrap}</Text> : '0';
      },
    },
    {
      title: 'Operator',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 140,
      render: (val: string, r: any) => val || r.operator?.fullName || r.operator?.name || '-',
    },
  ];

  return (
    <div style={{ marginTop: inModal ? 0 : 16 }}>
      {/* Top Machine Header Banner if embedded outside modal */}
      {!inModal && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(90deg, #1e1b4b 0%, #312e81 100%)',
            color: '#fff',
            padding: '14px 18px',
            borderRadius: '8px 8px 0 0',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ToolOutlined style={{ fontSize: 24, color: '#38bdf8' }} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>
                {effectiveName}
                <Tag color="cyan" style={{ marginLeft: 8 }}>
                  {machineData?.status || 'ACTIVE'}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                Machine Code: <Text code style={{ color: '#f8fafc', background: '#334155' }}>{machineCode || machineData?.machineCode || machineData?.code || machineId}</Text>
                {effectiveBarcode && (
                  <span style={{ marginLeft: 12 }}>
                    Barcode: <Text code style={{ color: '#f8fafc', background: '#334155' }}>{effectiveBarcode}</Text>
                  </span>
                )}
              </div>
            </div>
          </div>

          <Space>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={() => setPrintOpen(true)}
              style={{ background: '#4f46e5', borderColor: '#4f46e5' }}
            >
              Print Machine Label
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadAllHistory} loading={loading}>
              Refresh History
            </Button>
          </Space>
        </div>
      )}

      <Card style={{ borderRadius: inModal ? 8 : '0 0 8px 8px', background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}>
        {error && <Alert type="warning" message={error} showIcon style={{ marginBottom: 16 }} />}

        <Spin spinning={loading}>
          {/* Machine Lifecycle KPI Metrics Bar */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={8} md={4}>
              <Card
                size="small"
                style={{
                  background: token.colorBgContainer,
                  borderColor: token.colorBorderSecondary,
                  textAlign: 'center',
                  borderTop: '3px solid #1677ff',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                  borderRadius: 8,
                }}
              >
                <Statistic
                  title={<span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 600 }}>Total Job Cards</span>}
                  value={machineStats?.total ?? jobCards.length}
                  prefix={<HistoryOutlined style={{ color: '#1677ff' }} />}
                  valueStyle={{ color: token.colorTextHeading, fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card
                size="small"
                style={{
                  background: token.colorBgContainer,
                  borderColor: token.colorBorderSecondary,
                  textAlign: 'center',
                  borderTop: '3px solid #52c41a',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                  borderRadius: 8,
                }}
              >
                <Statistic
                  title={<span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 600 }}>This Month Jobs</span>}
                  value={machineStats?.thisMonthJobCards ?? 0}
                  prefix={<CalendarOutlined style={{ color: '#52c41a' }} />}
                  valueStyle={{ color: '#52c41a', fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card
                size="small"
                style={{
                  background: token.colorBgContainer,
                  borderColor: token.colorBorderSecondary,
                  textAlign: 'center',
                  borderTop: '3px solid #eb2f96',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                  borderRadius: 8,
                }}
              >
                <Statistic
                  title={<span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 600 }}>Motor Changes</span>}
                  value={motorChangesCount}
                  prefix={<ThunderboltOutlined style={{ color: '#eb2f96' }} />}
                  valueStyle={{ color: '#eb2f96', fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card
                size="small"
                style={{
                  background: token.colorBgContainer,
                  borderColor: token.colorBorderSecondary,
                  textAlign: 'center',
                  borderTop: '3px solid #fa8c16',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                  borderRadius: 8,
                }}
              >
                <Statistic
                  title={<span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 600 }}>Parts Changed</span>}
                  value={toolingChanges.length}
                  prefix={<SettingOutlined style={{ color: '#fa8c16' }} />}
                  valueStyle={{ color: token.colorTextHeading, fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card
                size="small"
                style={{
                  background: token.colorBgContainer,
                  borderColor: token.colorBorderSecondary,
                  textAlign: 'center',
                  borderTop: '3px solid #cf1322',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                  borderRadius: 8,
                }}
              >
                <Statistic
                  title={<span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 600 }}>Breakdowns</span>}
                  value={machineStats?.byType?.breakdown ?? jobCards.filter((j) => j.maintenanceType === 'BREAKDOWN').length}
                  valueStyle={{ color: '#cf1322', fontWeight: 700 }}
                  prefix={<ExclamationCircleOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card
                size="small"
                style={{
                  background: token.colorBgContainer,
                  borderColor: token.colorBorderSecondary,
                  textAlign: 'center',
                  borderTop: '3px solid #722ed1',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                  borderRadius: 8,
                }}
              >
                <Statistic
                  title={<span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 600 }}>Total Downtime</span>}
                  value={machineStats?.totalDowntimeMinutes ? Math.round(machineStats.totalDowntimeMinutes) : 0}
                  suffix="min"
                  prefix={<ClockCircleOutlined style={{ color: '#722ed1' }} />}
                  valueStyle={{ color: token.colorTextHeading, fontWeight: 700 }}
                />
              </Card>
            </Col>
          </Row>

          {/* Machine Lifecycle Detail Tabs */}
          <Tabs
            defaultActiveKey="jobcards"
            type="card"
            items={[
              {
                key: 'jobcards',
                label: (
                  <span>
                    <HistoryOutlined /> Maintenance Job Cards ({jobCards.length})
                  </span>
                ),
                children: (
                  <div>
                    <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong style={{ fontSize: 14 }}>
                        Maintenance & Breakdown History (Operators, Technicians, Replaced Spares)
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Click row to expand spare parts and assigned technicians
                      </Text>
                    </div>
                    <Table
                      columns={jobCardColumns}
                      dataSource={jobCards}
                      rowKey="id"
                      size="small"
                      pagination={{ pageSize: 8 }}
                      scroll={{ x: 900 }}
                      expandable={{
                        expandedRowRender: (record) => {
                          const parts = record.parts || [];
                          const techs = record.technicians || record.assignedTechnicians || [];
                          return (
                            <div style={{ padding: '8px 12px', background: token.colorFillAlter, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6 }}>
                              <Row gutter={[16, 16]}>
                                <Col xs={24} md={12}>
                                  <Text strong style={{ display: 'block', marginBottom: 6 }}>
                                    <ToolOutlined /> Replaced Spare Parts & Motors in this Job Card:
                                  </Text>
                                  {parts.length === 0 ? (
                                    <Text type="secondary">No spare parts recorded for this job card.</Text>
                                  ) : (
                                    <Table
                                      dataSource={parts}
                                      rowKey="id"
                                      size="small"
                                      pagination={false}
                                      columns={[
                                        { title: 'Item', render: (_: any, p: any) => p.item?.name || p.itemName || '-' },
                                        { title: 'Code', render: (_: any, p: any) => p.item?.itemCode || p.itemCode || '-' },
                                        { title: 'Quantity', render: (_: any, p: any) => `${p.quantity || 1} ${p.uom?.symbol || ''}` },
                                      ]}
                                    />
                                  )}
                                </Col>
                                <Col xs={24} md={12}>
                                  <Text strong style={{ display: 'block', marginBottom: 6 }}>
                                    <UserOutlined /> Assigned Technicians & Work Status:
                                  </Text>
                                  {techs.length === 0 ? (
                                    <Text type="secondary">No assigned technicians.</Text>
                                  ) : (
                                    <Table
                                      dataSource={techs}
                                      rowKey="id"
                                      size="small"
                                      pagination={false}
                                      columns={[
                                        { title: 'Technician', render: (_: any, t: any) => t.technician?.name || t.technicianUser?.fullName || 'Technician' },
                                        { title: 'Role', dataIndex: 'role', render: (val: string) => <Tag color="blue">{val || 'PRIMARY'}</Tag> },
                                        { title: 'Assigned At', dataIndex: 'assignedAt', render: (val: string) => (val ? new Date(val).toLocaleTimeString() : '-') },
                                      ]}
                                    />
                                  )}
                                </Col>
                              </Row>
                            </div>
                          );
                        },
                      }}
                      locale={{ emptyText: <Empty description="No maintenance job cards found for this machine" /> }}
                    />
                  </div>
                ),
              },
              {
                key: 'tooling',
                label: (
                  <span>
                    <ThunderboltOutlined /> Motor & Tooling Changes ({toolingChanges.length})
                  </span>
                ),
                children: (
                  <div>
                    <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong style={{ fontSize: 14 }}>
                        Motor Overhauls, Dies, Blades, and Component Replacements
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Tracks component wear, motor changes, and replaced components
                      </Text>
                    </div>
                    <Table
                      columns={toolingColumns}
                      dataSource={toolingChanges}
                      rowKey="id"
                      size="small"
                      pagination={{ pageSize: 8 }}
                      scroll={{ x: 850 }}
                      locale={{ emptyText: <Empty description="No component or motor changes logged for this machine" /> }}
                    />
                  </div>
                ),
              },
              {
                key: 'production',
                label: (
                  <span>
                    <CheckCircleOutlined /> Daily Production & Operators ({productionEntries.length})
                  </span>
                ),
                children: (
                  <div>
                    <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong style={{ fontSize: 14 }}>
                        Daily Production Entries & Machine Operators
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Output quantities, wire gauge, shift, running vs downtime hours, and operator names
                      </Text>
                    </div>
                    <Table
                      columns={productionColumns}
                      dataSource={productionEntries}
                      rowKey="id"
                      size="small"
                      pagination={{ pageSize: 8 }}
                      scroll={{ x: 800 }}
                      locale={{ emptyText: <Empty description="No production logs found for this machine" /> }}
                    />
                  </div>
                ),
              },
              {
                key: 'specs',
                label: (
                  <span>
                    <SettingOutlined /> Specifications & QR Code
                  </span>
                ),
                children: (
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={16}>
                      <Descriptions bordered size="small" column={2} labelStyle={{ width: 140, fontWeight: 500 }}>
                        <Descriptions.Item label="Machine Code">
                          <Text strong>{machineData?.machineCode || machineData?.code || machineCode || '-'}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Machine Name">
                          {machineData?.machineName || machineData?.name || effectiveName}
                        </Descriptions.Item>
                        <Descriptions.Item label="Status">
                          <Tag color={machineData?.status === 'ACTIVE' ? 'green' : 'orange'}>
                            {machineData?.status || 'ACTIVE'}
                          </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Division">
                          {machineData?.division?.name || machineData?.divisionName || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Section">
                          {machineData?.section?.name || machineData?.sectionName || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Department">
                          {machineData?.department?.name || machineData?.departmentName || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Location">
                          {machineData?.location || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Manufacturer">
                          {machineData?.manufacturer || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Model">
                          {machineData?.model || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Serial No">
                          {machineData?.serialNumber || machineData?.serialNo || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Capacity">
                          {machineData?.capacity ? `${machineData.capacity} ${machineData.capacityUnit || ''}` : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Description" span={2}>
                          {machineData?.description || 'No description provided'}
                        </Descriptions.Item>
                      </Descriptions>
                    </Col>

                    <Col xs={24} md={8}>
                      <Card
                        size="small"
                        title={
                          <Space>
                            <QrcodeOutlined /> Machine Barcode & QR Code
                          </Space>
                        }
                        style={{ textAlign: 'center', background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
                      >
                        {effectiveBarcode ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                            <div style={{ background: '#ffffff', padding: 8, borderRadius: 8, display: 'inline-block', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                              <QRCode value={effectiveBarcode} size={130} />
                            </div>
                            <div>
                              <Text code style={{ fontSize: 13 }}>{effectiveBarcode}</Text>
                            </div>
                            <Button
                              type="primary"
                              icon={<PrinterOutlined />}
                              size="small"
                              onClick={() => setPrintOpen(true)}
                            >
                              Print Machine Label
                            </Button>
                          </div>
                        ) : (
                          <Empty description="No barcode value" />
                        )}
                      </Card>
                    </Col>
                  </Row>
                ),
              },
            ]}
          />
        </Spin>
      </Card>

      {/* Barcode & QR Print Dialog */}
      {printOpen && (
        <BarcodePrint
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          itemCode={machineCode || machineData?.machineCode || machineData?.code || 'MACHINE'}
          itemName={effectiveName}
          sku={machineData?.model || machineData?.serialNumber}
          barcode={effectiveBarcode}
          initialFormat="BOTH"
        />
      )}
    </div>
  );
};

export const ScannedMachineHistoryModal: React.FC<{
  open: boolean;
  onClose: () => void;
  machineId: string;
  machineCode?: string;
  barcodeValue?: string;
}> = ({ open, onClose, machineId, machineCode, barcodeValue }) => {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={1050}
      style={{ top: 20 }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <Button onClick={onClose}>Close</Button>
        </div>
      }
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ToolOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 'bold' }}>
              Machine Lifecycle & History Tracking
            </div>
            <div style={{ fontSize: 12, color: 'gray', fontWeight: 'normal' }}>
              Maintenance Job Cards, Motor & Component Replacements, Production Runs & Technicians
            </div>
          </div>
        </div>
      }
    >
      <MachineLifecycleContent
        machineId={machineId}
        machineCode={machineCode}
        barcodeValue={barcodeValue}
        inModal={true}
      />
    </Modal>
  );
};

export default ScannedMachineHistoryModal;
