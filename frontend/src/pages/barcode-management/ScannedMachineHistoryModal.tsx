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
} from '@ant-design/icons';
import { apiService } from '../../services/api';
import BarcodePrint from '../../components/shared/BarcodePrint';

const { Text, Title } = Typography;

interface ScannedMachineHistoryModalProps {
  open: boolean;
  onClose: () => void;
  machineId: string;
  machineCode?: string;
  barcodeValue?: string;
}

export const ScannedMachineHistoryModal: React.FC<ScannedMachineHistoryModalProps> = ({
  open,
  onClose,
  machineId,
  machineCode,
  barcodeValue,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [machineData, setMachineData] = useState<any>(null);
  const [jobCards, setJobCards] = useState<any[]>([]);
  const [machineStats, setMachineStats] = useState<any>(null);
  const [toolingChanges, setToolingChanges] = useState<any[]>([]);
  const [productionEntries, setProductionEntries] = useState<any[]>([]);

  const [printOpen, setPrintOpen] = useState(false);

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

      if (machineRes.status === 'fulfilled') {
        const val = machineRes.value as any;
        setMachineData(val?.data || val || null);
      }

      if (jobCardsRes.status === 'fulfilled') {
        const val = jobCardsRes.value as any;
        const list = Array.isArray(val) ? val : val?.data || val?.items || [];
        setJobCards(list);
      } else {
        // Fallback: try querying job cards with query param
        try {
          const fb = await apiService.get<any>('/master-data/maintenance/job-cards', { machineId, limit: 50 });
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
    if (open && machineId) {
      loadAllHistory();
    }
  }, [open, machineId]);

  const effectiveBarcode = barcodeValue || machineData?.barcode || machineCode || machineData?.machineCode || machineData?.code;
  const effectiveName = machineData?.machineName || machineData?.name || machineCode || 'Machine';

  // Job cards table columns
  const jobCardColumns = [
    {
      title: 'Job Card No',
      dataIndex: 'jobCardNo',
      key: 'jobCardNo',
      render: (val: string) => <Text strong style={{ color: '#1677ff' }}>{val || '-'}</Text>,
    },
    {
      title: 'Date',
      dataIndex: 'requestedAt',
      key: 'requestedAt',
      render: (val: string) => val ? new Date(val).toLocaleDateString() : '-',
    },
    {
      title: 'Type',
      dataIndex: 'maintenanceType',
      key: 'maintenanceType',
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
      title: 'Complaint / Issue',
      dataIndex: 'complaint',
      key: 'complaint',
      ellipsis: true,
      render: (val: string, r: any) => val || r.description || '-',
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (val: string) => {
        const col = val === 'CRITICAL' || val === 'HIGH' ? 'red' : val === 'MEDIUM' ? 'gold' : 'green';
        return <Tag color={col}>{val || 'NORMAL'}</Tag>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'currentStatus',
      key: 'currentStatus',
      render: (val: string, r: any) => {
        const s = val || r.status;
        const color = s === 'COMPLETED' || s === 'APPROVED' ? 'green' : s === 'IN_PROGRESS' ? 'processing' : 'default';
        return <Tag color={color}>{s || '-'}</Tag>;
      },
    },
    {
      title: 'Downtime (min)',
      dataIndex: 'downtimeMinutes',
      key: 'downtimeMinutes',
      render: (val: number) => val != null ? <Text strong>{val} m</Text> : '-',
    },
    {
      title: 'Requested By',
      dataIndex: 'requestedByUser',
      key: 'requestedByUser',
      render: (val: any) => val?.fullName || val?.name || '-',
    },
  ];

  // Tooling / Parts changed columns
  const toolingColumns = [
    {
      title: 'Part / Component',
      dataIndex: 'componentName',
      key: 'componentName',
      render: (val: string, r: any) => (
        <div>
          <Text strong>{val || r.name || r.toolName || '-'}</Text>
          {(r.componentCode || r.code) && (
            <div style={{ fontSize: 11, color: '#888' }}>{r.componentCode || r.code}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (val: string) => <Tag color="cyan">{val || 'SPARE PART'}</Tag>,
    },
    {
      title: 'Change Date',
      dataIndex: 'changeDate',
      key: 'changeDate',
      render: (val: string, r: any) => {
        const d = val || r.installedAt || r.createdAt;
        return d ? new Date(d).toLocaleDateString() : '-';
      },
    },
    {
      title: 'Condition',
      dataIndex: 'conditionStatus',
      key: 'conditionStatus',
      render: (val: string) => {
        const color = val === 'WORN' ? 'orange' : val === 'BROKEN' ? 'red' : 'green';
        return <Tag color={color}>{val || 'REPLACED'}</Tag>;
      },
    },
    {
      title: 'Cycles / Production',
      dataIndex: 'productionAtChange',
      key: 'productionAtChange',
      render: (val: number, r: any) => val ?? r.cyclesCount ?? '-',
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
      dataIndex: 'jobCardNo',
      key: 'jobCardNo',
      render: (val: string, r: any) => val || (r.jobCardId ? <Text code>{r.jobCardId.slice(0, 8)}</Text> : '-'),
    },
  ];

  // Production entries columns
  const productionColumns = [
    {
      title: 'Date',
      dataIndex: 'entryDate',
      key: 'entryDate',
      render: (val: string, r: any) => {
        const d = val || r.date || r.createdAt;
        return d ? new Date(d).toLocaleDateString() : '-';
      },
    },
    {
      title: 'Shift',
      dataIndex: 'shift',
      key: 'shift',
      render: (val: any) => val?.name || val?.shiftName || val || '-',
    },
    {
      title: 'Item Produced',
      dataIndex: 'item',
      key: 'item',
      render: (val: any, r: any) => val?.name || r.itemName || val?.code || '-',
    },
    {
      title: 'Produced Qty',
      dataIndex: 'producedQty',
      key: 'producedQty',
      render: (val: number, r: any) => {
        const qty = val ?? r.quantity ?? r.outputQty;
        const uom = r.uom?.symbol || r.uomName || '';
        return qty != null ? <Text strong style={{ color: '#52c41a' }}>{qty} {uom}</Text> : '-';
      },
    },
    {
      title: 'Scrap / Reject',
      dataIndex: 'scrapQty',
      key: 'scrapQty',
      render: (val: number, r: any) => {
        const scrap = val ?? r.rejectedQty ?? 0;
        return scrap > 0 ? <Text type="danger">{scrap}</Text> : '0';
      },
    },
    {
      title: 'Operator',
      dataIndex: 'operator',
      key: 'operator',
      render: (val: any, r: any) => val?.fullName || val?.name || r.operatorName || '-',
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={1000}
      style={{ top: 20 }}
      footer={
        <Space style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <Button icon={<ReloadOutlined />} onClick={loadAllHistory} loading={loading}>
            Refresh
          </Button>
          <Space>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={() => setPrintOpen(true)}
              disabled={!effectiveBarcode}
            >
              Print QR / Barcode Label
            </Button>
            <Button onClick={onClose}>Close</Button>
          </Space>
        </Space>
      }
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ToolOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 'bold' }}>
              {effectiveName}
              <Tag
                color={
                  machineData?.status === 'ACTIVE'
                    ? 'green'
                    : machineData?.status === 'MAINTENANCE'
                    ? 'orange'
                    : 'red'
                }
                style={{ marginLeft: 10 }}
              >
                {machineData?.status || 'ACTIVE'}
              </Tag>
            </div>
            <div style={{ fontSize: 12, color: 'gray', fontWeight: 'normal' }}>
              Machine Code: <Text code>{machineCode || machineData?.machineCode || machineData?.code || machineId}</Text>
              {effectiveBarcode && (
                <span style={{ marginLeft: 12 }}>
                  Barcode/QR: <Text code>{effectiveBarcode}</Text>
                </span>
              )}
            </div>
          </div>
        </div>
      }
    >
      {error && <Alert type="warning" message={error} showIcon style={{ marginBottom: 16 }} />}

      <Spin spinning={loading}>
        {/* KPI Metrics Row */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ background: 'var(--theme-bg-secondary, #fafafa)', textAlign: 'center' }}>
              <Statistic
                title="Job Cards Executed"
                value={machineStats?.total ?? jobCards.length}
                prefix={<HistoryOutlined style={{ color: '#1677ff' }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ background: 'var(--theme-bg-secondary, #fafafa)', textAlign: 'center' }}>
              <Statistic
                title="Breakdowns"
                value={machineStats?.byType?.breakdown ?? jobCards.filter((j) => j.maintenanceType === 'BREAKDOWN').length}
                valueStyle={{ color: '#cf1322' }}
                prefix={<ExclamationCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ background: 'var(--theme-bg-secondary, #fafafa)', textAlign: 'center' }}>
              <Statistic
                title="Parts Changed"
                value={toolingChanges.length}
                prefix={<SettingOutlined style={{ color: '#fa8c16' }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ background: 'var(--theme-bg-secondary, #fafafa)', textAlign: 'center' }}>
              <Statistic
                title="Total Downtime"
                value={machineStats?.totalDowntimeMinutes ? Math.round(machineStats.totalDowntimeMinutes) : 0}
                suffix="mins"
                prefix={<ClockCircleOutlined style={{ color: '#722ed1' }} />}
              />
            </Card>
          </Col>
        </Row>

        {/* Tabbed Detail Sections */}
        <Tabs
          defaultActiveKey="maintenance"
          items={[
            {
              key: 'overview',
              label: (
                <span>
                  <SettingOutlined /> Specifications & QR
                </span>
              ),
              children: (
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={16}>
                    <Descriptions bordered size="small" column={2} labelStyle={{ width: 140, fontWeight: 500 }}>
                      <Descriptions.Item label="Machine Code">
                        <Text strong>{machineData?.machineCode || machineData?.code || machineCode || '-'}</Text>
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
                          <QrcodeOutlined /> Machine QR & Barcode
                        </Space>
                      }
                      style={{ textAlign: 'center' }}
                    >
                      {effectiveBarcode ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                          <QRCode value={effectiveBarcode} size={130} />
                          <div>
                            <Text code style={{ fontSize: 13 }}>{effectiveBarcode}</Text>
                          </div>
                          <Button
                            type="primary"
                            icon={<PrinterOutlined />}
                            size="small"
                            onClick={() => setPrintOpen(true)}
                          >
                            Print QR Label
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
            {
              key: 'maintenance',
              label: (
                <span>
                  <HistoryOutlined /> Maintenance Job Cards ({jobCards.length})
                </span>
              ),
              children: (
                <div>
                  <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong>Complete Job Card History for this Machine</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Showing past and active maintenance interventions
                    </Text>
                  </div>
                  <Table
                    columns={jobCardColumns}
                    dataSource={jobCards}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 8 }}
                    scroll={{ x: 750 }}
                    locale={{ emptyText: <Empty description="No maintenance job cards found for this machine" /> }}
                  />
                </div>
              ),
            },
            {
              key: 'tooling',
              label: (
                <span>
                  <ToolOutlined /> Parts & Tooling Changed ({toolingChanges.length})
                </span>
              ),
              children: (
                <div>
                  <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong>Replaced Spares, Dies, Blades & Tools</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Tracking all component wear and replacements
                    </Text>
                  </div>
                  <Table
                    columns={toolingColumns}
                    dataSource={toolingChanges}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 8 }}
                    scroll={{ x: 700 }}
                    locale={{ emptyText: <Empty description="No component or tooling changes logged for this machine" /> }}
                  />
                </div>
              ),
            },
            {
              key: 'production',
              label: (
                <span>
                  <CheckCircleOutlined /> Production Output ({productionEntries.length})
                </span>
              ),
              children: (
                <div>
                  <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong>Daily Production Entries</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Recorded output, shifts, and scrap
                    </Text>
                  </div>
                  <Table
                    columns={productionColumns}
                    dataSource={productionEntries}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 8 }}
                    scroll={{ x: 650 }}
                    locale={{ emptyText: <Empty description="No production logs found for this machine" /> }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Spin>

      {/* Barcode & QR Code Print Dialog */}
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
    </Modal>
  );
};

export default ScannedMachineHistoryModal;
