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
  Progress,
  Divider,
  Badge,
  Radio,
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
  BulbOutlined,
  TeamOutlined,
  InboxOutlined,
  QuestionCircleOutlined,
  PieChartOutlined,
  FilterOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { apiService } from '../../services/api';
import BarcodePrint from '../../components/shared/BarcodePrint';
import { DraggableResizableModal } from '../../components/shared';

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
  const [activeTab, setActiveTab] = useState<string>('jobcards');

  const [machineData, setMachineData] = useState<any>(null);
  const [jobCards, setJobCards] = useState<any[]>([]);
  const [machineStats, setMachineStats] = useState<any>(null);
  const [toolingChanges, setToolingChanges] = useState<any[]>([]);
  const [productionEntries, setProductionEntries] = useState<any[]>([]);
  const [printOpen, setPrintOpen] = useState(false);
  const [downtimeModalOpen, setDowntimeModalOpen] = useState(false);
  const [downtimePeriod, setDowntimePeriod] = useState<'week' | 'month' | 'year'>('month');
  const { token } = theme.useToken();

  // ── Downtime category definitions ──────────────────────────────────────────
  const DOWNTIME_CATEGORIES = [
    { key: 'ELECTRICAL', label: 'Electrical Breakdown', icon: <ThunderboltOutlined />, color: '#fa541c', keywords: ['electrical', 'electric', 'wiring', 'fuse', 'short circuit', 'control panel'] },
    { key: 'MECHANICAL', label: 'Mechanical Breakdown', icon: <SettingOutlined />, color: '#faad14', keywords: ['mechanical', 'mechanic', 'gear', 'belt', 'bearing', 'shaft', 'breakdown'] },
    { key: 'POWER', label: 'Power / Utility Failure', icon: <BulbOutlined />, color: '#722ed1', keywords: ['power', 'electricity', 'light', 'load shedding', 'generator', 'bijli', 'uts', 'gas'] },
    { key: 'MANPOWER', label: 'Manpower Shortage', icon: <TeamOutlined />, color: '#1677ff', keywords: ['manpower', 'man power', 'operator', 'worker', 'labour', 'staff', 'absent', 'shortage of worker'] },
    { key: 'MATERIAL', label: 'Material Shortage', icon: <InboxOutlined />, color: '#52c41a', keywords: ['material', 'raw material', 'supply', 'stock', 'input'] },
    { key: 'OTHER', label: 'Other / Uncategorized', icon: <QuestionCircleOutlined />, color: '#8c8c8c', keywords: [] },
  ];

  const classifyDowntimeEntry = (entry: any): string => {
    const reason = (
      entry.downtimeReason?.name ||
      entry.downtimeReasonText ||
      entry.downtimeCategory ||
      ''
    ).toLowerCase();
    if (!reason) return 'OTHER';
    for (const cat of DOWNTIME_CATEGORIES.slice(0, -1)) {
      if (cat.keywords.some((kw) => reason.includes(kw))) return cat.key;
    }
    return 'OTHER';
  };

  const getDateRangeStart = (period: 'week' | 'month' | 'year'): Date => {
    const now = new Date();
    if (period === 'week') {
      const d = new Date(now);
      d.setDate(now.getDate() - now.getDay());
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (period === 'month') {
      return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }
    return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  };

  const computeDowntimeBreakdown = (period: 'week' | 'month' | 'year') => {
    const start = getDateRangeStart(period);

    const filteredEntries = productionEntries.filter((e) => {
      const d = e.entryDate || e.date || e.createdAt;
      return !d || new Date(d) >= start;
    });

    const filteredCards = jobCards.filter((j) => {
      const d = j.requestedAt || j.createdAt;
      return !d || new Date(d) >= start;
    });

    // Production downtime per category
    const catMap: Record<string, { hours: number; count: number; reasons: Set<string> }> = {};
    DOWNTIME_CATEGORIES.forEach((c) => { catMap[c.key] = { hours: 0, count: 0, reasons: new Set() }; });

    filteredEntries.forEach((e) => {
      const hrs = Number(e.downtimeHours ?? 0);
      if (hrs <= 0) return;
      const cat = classifyDowntimeEntry(e);
      catMap[cat].hours += hrs;
      catMap[cat].count += 1;
      const r = e.downtimeReason?.name || e.downtimeReasonText;
      if (r) catMap[cat].reasons.add(r);
    });

    const totalProdDownHrs = Object.values(catMap).reduce((a, v) => a + v.hours, 0);

    // Maintenance job card downtime (minutes → hours)
    const maintDowntimeMin = filteredCards.reduce((a, j) => a + (Number(j.downtimeMinutes ?? 0)), 0);
    const maintDowntimeHrs = maintDowntimeMin / 60;

    // Add maintenance breakdown to mechanical/electrical category based on maintenanceType
    filteredCards.forEach((j) => {
      const mins = Number(j.downtimeMinutes ?? 0);
      if (mins <= 0) return;
      const t = (j.maintenanceType || '').toUpperCase();
      if (t === 'BREAKDOWN') {
        // count as mechanical by default from job cards
        catMap['MECHANICAL'].hours += mins / 60;
        catMap['MECHANICAL'].count += 1;
        catMap['MECHANICAL'].reasons.add(`Job Card: ${j.jobCardNo || j.id?.slice(0,8)}`);
      }
    });

    const grandTotalHrs = Object.values(catMap).reduce((a, v) => a + v.hours, 0);

    const categories = DOWNTIME_CATEGORIES.map((c) => ({
      ...c,
      hours: catMap[c.key].hours,
      count: catMap[c.key].count,
      reasons: Array.from(catMap[c.key].reasons),
      pct: grandTotalHrs > 0 ? (catMap[c.key].hours / grandTotalHrs) * 100 : 0,
    })).filter((c) => c.hours > 0 || c.key !== 'OTHER');

    return { categories, grandTotalHrs, maintDowntimeMin, filteredEntries, filteredCards };
  };

  /** Remove trailing zeros: 5.000 → 5, 5.50 → 5.5, 5.123 → 5.12 */
  const formatVal = (val: number | string | null | undefined, decimals = 2): string => {
    if (val === null || val === undefined || val === '') return '0';
    const n = Number(val);
    if (!Number.isFinite(n)) return String(val);
    if (Number.isInteger(n)) return String(n);
    return parseFloat(n.toFixed(decimals)).toString();
  };

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

  // ── Production KPI aggregates ─────────────────────────────────────────────
  const totalProdQty = productionEntries.reduce((acc, e) => acc + (Number(e.actualQuantity ?? e.producedQty ?? e.quantity ?? 0)), 0);
  const totalTargetQty = productionEntries.reduce((acc, e) => acc + (Number(e.targetQuantity ?? 0)), 0);
  const totalRunningHrs = productionEntries.reduce((acc, e) => acc + (Number(e.runningHours ?? 0)), 0);
  const totalDowntimeHrs = productionEntries.reduce((acc, e) => acc + (Number(e.downtimeHours ?? 0)), 0);
  const totalScrap = productionEntries.reduce((acc, e) => acc + (Number(e.scrapQuantity ?? e.scrapQty ?? e.rejectedQty ?? 0)), 0);

  // ── Dynamic KPI config per tab ────────────────────────────────────────────
  const kpiConfig: Record<string, Array<{
    label: string;
    value: number | string;
    suffix?: string;
    icon: React.ReactNode;
    color: string;
    borderColor: string;
    onClick?: () => void;
  }>> = {
    jobcards: [
      { label: 'Total Job Cards', value: machineStats?.total ?? jobCards.length, icon: <HistoryOutlined style={{ color: '#1677ff' }} />, color: token.colorTextHeading, borderColor: '#1677ff' },
      { label: 'This Month', value: machineStats?.thisMonthJobCards ?? 0, icon: <CalendarOutlined style={{ color: '#52c41a' }} />, color: '#52c41a', borderColor: '#52c41a' },
      { label: 'Breakdowns', value: machineStats?.byType?.breakdown ?? jobCards.filter((j) => j.maintenanceType === 'BREAKDOWN').length, icon: <ExclamationCircleOutlined style={{ color: '#cf1322' }} />, color: '#cf1322', borderColor: '#cf1322' },
      { label: 'Preventive', value: machineStats?.byType?.preventive ?? jobCards.filter((j) => j.maintenanceType === 'PREVENTIVE').length, icon: <CheckCircleOutlined style={{ color: '#1677ff' }} />, color: '#1677ff', borderColor: '#1677ff' },
      { label: 'Total Downtime', value: machineStats?.totalDowntimeMinutes ? Math.round(machineStats.totalDowntimeMinutes) : 0, suffix: 'min', icon: <ClockCircleOutlined style={{ color: '#722ed1' }} />, color: '#722ed1', borderColor: '#722ed1', onClick: () => setDowntimeModalOpen(true) },
      { label: 'Completed', value: machineStats?.byStatus?.completed ?? jobCards.filter((j) => j.currentStatus === 'COMPLETED').length, icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />, color: '#52c41a', borderColor: '#52c41a' },
    ],
    tooling: [
      { label: 'Total Changes', value: toolingChanges.length, icon: <SettingOutlined style={{ color: '#fa8c16' }} />, color: token.colorTextHeading, borderColor: '#fa8c16' },
      { label: 'Motor Changes', value: motorChangesCount, icon: <ThunderboltOutlined style={{ color: '#eb2f96' }} />, color: '#eb2f96', borderColor: '#eb2f96' },
      { label: 'Dies / Blades', value: toolingChanges.filter((tc) => { const t = (tc.type || tc.componentType || '').toLowerCase(); return t.includes('die') || t.includes('blade'); }).length, icon: <ToolOutlined style={{ color: '#1677ff' }} />, color: '#1677ff', borderColor: '#1677ff' },
      { label: 'Worn Parts', value: toolingChanges.filter((tc) => tc.conditionStatus === 'WORN').length, icon: <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />, color: '#fa8c16', borderColor: '#fa8c16' },
      { label: 'Broken Parts', value: toolingChanges.filter((tc) => tc.conditionStatus === 'BROKEN').length, icon: <ExclamationCircleOutlined style={{ color: '#cf1322' }} />, color: '#cf1322', borderColor: '#cf1322' },
      { label: 'This Month', value: toolingChanges.filter((tc) => { const d = tc.changeDate || tc.installedAt || tc.createdAt; if (!d) return false; const now = new Date(); const dd = new Date(d); return dd.getMonth() === now.getMonth() && dd.getFullYear() === now.getFullYear(); }).length, icon: <CalendarOutlined style={{ color: '#52c41a' }} />, color: '#52c41a', borderColor: '#52c41a' },
    ],
    production: [
      { label: 'Total Entries', value: productionEntries.length, icon: <HistoryOutlined style={{ color: '#1677ff' }} />, color: token.colorTextHeading, borderColor: '#1677ff' },
      { label: 'Total Produced', value: formatVal(totalProdQty), icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />, color: '#52c41a', borderColor: '#52c41a' },
      { label: 'Total Target', value: formatVal(totalTargetQty), icon: <CalendarOutlined style={{ color: '#1677ff' }} />, color: '#1677ff', borderColor: '#1677ff' },
      { label: 'Running Hrs', value: formatVal(totalRunningHrs), suffix: 'h', icon: <ClockCircleOutlined style={{ color: '#722ed1' }} />, color: '#722ed1', borderColor: '#722ed1' },
      { label: 'Downtime Hrs', value: formatVal(totalDowntimeHrs), suffix: 'h', icon: <PieChartOutlined style={{ color: '#cf1322' }} />, color: '#cf1322', borderColor: '#cf1322', onClick: () => setDowntimeModalOpen(true) },
      { label: 'Total Scrap', value: formatVal(totalScrap), icon: <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />, color: '#fa8c16', borderColor: '#fa8c16' },
    ],
    specs: [
      { label: 'Total Job Cards', value: machineStats?.total ?? jobCards.length, icon: <HistoryOutlined style={{ color: '#1677ff' }} />, color: token.colorTextHeading, borderColor: '#1677ff' },
      { label: 'Parts Changed', value: toolingChanges.length, icon: <SettingOutlined style={{ color: '#fa8c16' }} />, color: token.colorTextHeading, borderColor: '#fa8c16' },
      { label: 'Motor Changes', value: motorChangesCount, icon: <ThunderboltOutlined style={{ color: '#eb2f96' }} />, color: '#eb2f96', borderColor: '#eb2f96' },
      { label: 'Prod. Entries', value: productionEntries.length, icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />, color: '#52c41a', borderColor: '#52c41a' },
      { label: 'Breakdowns', value: machineStats?.byType?.breakdown ?? jobCards.filter((j) => j.maintenanceType === 'BREAKDOWN').length, icon: <ExclamationCircleOutlined style={{ color: '#cf1322' }} />, color: '#cf1322', borderColor: '#cf1322' },
      { label: 'Total Downtime', value: machineStats?.totalDowntimeMinutes ? Math.round(machineStats.totalDowntimeMinutes) : 0, suffix: 'min', icon: <ClockCircleOutlined style={{ color: '#722ed1' }} />, color: '#722ed1', borderColor: '#722ed1', onClick: () => setDowntimeModalOpen(true) },
    ],
  };

  const activeKPIs = kpiConfig[activeTab] ?? kpiConfig.jobcards;

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
      title: 'Target Qty',
      key: 'targetQuantity',
      width: 110,
      render: (_: any, r: any) => {
        const tgt = r.targetQuantity ?? r.targetQty;
        const uom = r.uom?.symbol || r.uomName || '';
        return tgt != null ? <Text strong style={{ color: '#1677ff' }}>{formatVal(tgt)} {uom}</Text> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Produced Qty',
      key: 'quantity',
      width: 120,
      render: (_: any, r: any) => {
        const qty = r.actualQuantity ?? r.producedQty ?? r.quantity ?? r.outputQty;
        const uom = r.uom?.symbol || r.uomName || '';
        return qty != null ? <Text strong style={{ color: '#52c41a' }}>{formatVal(qty)} {uom}</Text> : '-';
      },
    },
    {
      title: 'Running Hrs',
      dataIndex: 'runningHours',
      key: 'runningHours',
      width: 100,
      render: (val: number) => (val != null ? <Text style={{ color: '#722ed1' }}>{formatVal(val)} h</Text> : '-'),
    },
    {
      title: 'Downtime Hrs',
      dataIndex: 'downtimeHours',
      key: 'downtimeHours',
      width: 110,
      render: (val: number) => (val > 0 ? <Text type="danger">{formatVal(val)} h</Text> : <Text type="secondary">0 h</Text>),
    },
    {
      title: 'Scrap / Reject',
      key: 'scrap',
      width: 110,
      render: (_: any, r: any) => {
        const scrap = r.scrapQuantity ?? r.scrapQty ?? r.rejectedQty ?? 0;
        return scrap > 0 ? <Text type="danger">{formatVal(scrap)}</Text> : <Text type="secondary">0</Text>;
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
          {/* Machine Lifecycle KPI Metrics Bar — context-aware per tab */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {activeKPIs.map((kpi, idx) => (
              <Col xs={12} sm={8} md={4} key={idx}>
                <Tooltip title={kpi.onClick ? 'Click to view downtime breakdown by category' : undefined}>
                  <Card
                    size="small"
                    onClick={kpi.onClick}
                    style={{
                      background: token.colorBgContainer,
                      borderColor: kpi.onClick ? kpi.borderColor : token.colorBorderSecondary,
                      textAlign: 'center',
                      borderTop: `3px solid ${kpi.borderColor}`,
                      boxShadow: kpi.onClick ? `0 4px 14px ${kpi.borderColor}33` : '0 2px 8px rgba(0,0,0,0.1)',
                      borderRadius: 8,
                      cursor: kpi.onClick ? 'pointer' : 'default',
                      transition: 'all 0.25s ease',
                    }}
                    hoverable={!!kpi.onClick}
                  >
                    <Statistic
                      title={
                        <span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 600 }}>
                          {kpi.label}{kpi.onClick && <FilterOutlined style={{ marginLeft: 4, fontSize: 10, color: kpi.borderColor }} />}
                        </span>
                      }
                      value={kpi.value}
                      suffix={kpi.suffix}
                      prefix={kpi.icon}
                      valueStyle={{ color: kpi.color, fontWeight: 800, fontSize: 22 }}
                    />
                  </Card>
                </Tooltip>
              </Col>
            ))}
          </Row>

          {/* Machine Lifecycle Detail Tabs */}
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key)}
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
                            <div
                              style={{
                                background: '#ffffff',
                                padding: 12,
                                borderRadius: 8,
                                display: 'inline-flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                              }}
                            >
                              <QRCode
                                value={effectiveBarcode}
                                size={140}
                                type="svg"
                                color="#000000"
                                bgColor="#ffffff"
                                bordered={false}
                              />
                            </div>
                            <div style={{ width: '100%', wordBreak: 'break-all' }}>
                              <Text code copyable style={{ fontSize: 12 }}>
                                {effectiveBarcode}
                              </Text>
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

      {/* ── Downtime Breakdown Modal ─────────────────────────────────────── */}
      <Modal
        open={downtimeModalOpen}
        onCancel={() => setDowntimeModalOpen(false)}
        width={820}
        centered
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" onClick={() => setDowntimeModalOpen(false)}>Close</Button>
          </div>
        }
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PieChartOutlined style={{ fontSize: 18, color: '#cf1322' }} />
            <span>Downtime Analysis — {effectiveName}</span>
            <Tag color="red" style={{ marginLeft: 4 }}>{machineCode || machineData?.machineCode || ''}</Tag>
          </div>
        }
      >
        {/* Period Filter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text strong style={{ fontSize: 13 }}>
            <FilterOutlined style={{ marginRight: 6 }} />
            Select Time Period:
          </Text>
          <Radio.Group
            value={downtimePeriod}
            onChange={(e) => setDowntimePeriod(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="middle"
          >
            <Radio.Button value="week">Current Week</Radio.Button>
            <Radio.Button value="month">Current Month</Radio.Button>
            <Radio.Button value="year">Current Year</Radio.Button>
          </Radio.Group>
        </div>

        {(() => {
          const { categories, grandTotalHrs, maintDowntimeMin, filteredEntries } = computeDowntimeBreakdown(downtimePeriod);
          const periodLabel = downtimePeriod === 'week' ? 'This Week' : downtimePeriod === 'month' ? 'This Month' : 'This Year';
          const hasData = grandTotalHrs > 0;

          return (
            <>
              {/* Summary KPI row */}
              <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col span={8}>
                  <Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #cf1322', borderRadius: 8, background: token.colorFillAlter }}>
                    <Statistic
                      title={<span style={{ fontSize: 11, fontWeight: 600 }}>Production Downtime ({periodLabel})</span>}
                      value={formatVal(grandTotalHrs)}
                      suffix="hrs"
                      prefix={<ClockCircleOutlined style={{ color: '#cf1322' }} />}
                      valueStyle={{ color: '#cf1322', fontWeight: 800, fontSize: 20 }}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #faad14', borderRadius: 8, background: token.colorFillAlter }}>
                    <Statistic
                      title={<span style={{ fontSize: 11, fontWeight: 600 }}>Maintenance Downtime ({periodLabel})</span>}
                      value={Math.round(maintDowntimeMin)}
                      suffix="min"
                      prefix={<SettingOutlined style={{ color: '#faad14' }} />}
                      valueStyle={{ color: '#faad14', fontWeight: 800, fontSize: 20 }}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #1677ff', borderRadius: 8, background: token.colorFillAlter }}>
                    <Statistic
                      title={<span style={{ fontSize: 11, fontWeight: 600 }}>Production Entries ({periodLabel})</span>}
                      value={filteredEntries.length}
                      prefix={<HistoryOutlined style={{ color: '#1677ff' }} />}
                      valueStyle={{ color: '#1677ff', fontWeight: 800, fontSize: 20 }}
                    />
                  </Card>
                </Col>
              </Row>

              <Divider style={{ margin: '12px 0' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Downtime Breakdown by Category</Text>
              </Divider>

              {!hasData ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <span>
                      <Text type="secondary">No downtime recorded for {periodLabel.toLowerCase()}.</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Downtime is captured from Production Entries (Downtime Reason field) and Maintenance Job Cards.
                      </Text>
                    </span>
                  }
                  style={{ padding: '24px 0' }}
                />
              ) : (
                <>
                  {/* Category breakdown cards with progress bars */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    {categories.map((cat) => (
                      <Card
                        key={cat.key}
                        size="small"
                        style={{
                          borderRadius: 8,
                          borderLeft: `4px solid ${cat.color}`,
                          background: token.colorFillAlter,
                          opacity: cat.hours > 0 ? 1 : 0.45,
                        }}
                      >
                        <Row align="middle" gutter={[12, 0]}>
                          <Col style={{ width: 32, textAlign: 'center' }}>
                            <span style={{ color: cat.color, fontSize: 18 }}>{cat.icon}</span>
                          </Col>
                          <Col flex="1">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <Space size={6}>
                                <Text strong style={{ fontSize: 13 }}>{cat.label}</Text>
                                {cat.count > 0 && (
                                  <Badge
                                    count={`${cat.count} entr${cat.count === 1 ? 'y' : 'ies'}`}
                                    style={{ backgroundColor: cat.color, fontSize: 10 }}
                                  />
                                )}
                              </Space>
                              <Space size={8}>
                                <Text strong style={{ color: cat.color, fontSize: 14 }}>
                                  {formatVal(cat.hours)} h
                                </Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  ({cat.pct.toFixed(1)}%)
                                </Text>
                              </Space>
                            </div>
                            <Progress
                              percent={parseFloat(cat.pct.toFixed(1))}
                              strokeColor={cat.color}
                              trailColor={token.colorFillSecondary}
                              showInfo={false}
                              size="small"
                              style={{ margin: 0 }}
                            />
                            {cat.reasons.length > 0 && (
                              <div style={{ marginTop: 4 }}>
                                {cat.reasons.slice(0, 3).map((r, i) => (
                                  <Tag key={i} style={{ fontSize: 10, margin: '2px 2px 0 0' }}>{r}</Tag>
                                ))}
                                {cat.reasons.length > 3 && (
                                  <Text type="secondary" style={{ fontSize: 10 }}>+{cat.reasons.length - 3} more</Text>
                                )}
                              </div>
                            )}
                          </Col>
                        </Row>
                      </Card>
                    ))}
                  </div>

                  {/* Detail table */}
                  <Divider style={{ margin: '8px 0 12px' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Production Entries with Downtime</Text>
                  </Divider>
                  <Table
                    size="small"
                    pagination={{ pageSize: 6, size: 'small' }}
                    scroll={{ x: 650 }}
                    dataSource={filteredEntries.filter((e) => Number(e.downtimeHours ?? 0) > 0)}
                    rowKey="id"
                    columns={[
                      {
                        title: 'Date',
                        width: 95,
                        render: (_: any, r: any) => {
                          const d = r.entryDate || r.date || r.createdAt;
                          return d ? new Date(d).toLocaleDateString() : '-';
                        },
                      },
                      {
                        title: 'Shift',
                        width: 80,
                        render: (_: any, r: any) => r.shift?.name || r.shift?.shiftCode || '-',
                      },
                      {
                        title: 'Category',
                        width: 160,
                        render: (_: any, r: any) => {
                          const key = classifyDowntimeEntry(r);
                          const cat = DOWNTIME_CATEGORIES.find((c) => c.key === key) || DOWNTIME_CATEGORIES[DOWNTIME_CATEGORIES.length - 1];
                          return <Tag color={cat.color} icon={cat.icon}>{cat.label}</Tag>;
                        },
                      },
                      {
                        title: 'Downtime Reason',
                        render: (_: any, r: any) => (
                          <Text style={{ fontSize: 12 }}>
                            {r.downtimeReason?.name || r.downtimeReasonText || <Text type="secondary">—</Text>}
                          </Text>
                        ),
                      },
                      {
                        title: 'Hours',
                        width: 80,
                        render: (_: any, r: any) => (
                          <Text strong type="danger">{formatVal(r.downtimeHours)} h</Text>
                        ),
                      },
                      {
                        title: 'Operator',
                        width: 120,
                        render: (_: any, r: any) => r.operatorName || r.operator?.fullName || <Text type="secondary">—</Text>,
                      },
                    ]}
                    locale={{ emptyText: <Empty description="No downtime records" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                  />
                </>
              )}
            </>
          );
        })()}
      </Modal>
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
    <DraggableResizableModal
      open={open}
      onCancel={onClose}
      width={1120}
      height={740}
      minWidth={780}
      minHeight={520}
      centered={true}
      allowMaximize={true}
      allowMinimize={true}
      maskClosable={false}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <Button onClick={onClose} type="primary">
            Close
          </Button>
        </div>
      }
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ToolOutlined style={{ fontSize: 18, color: '#1677ff' }} />
          <span>Machine Lifecycle & History Tracking</span>
        </div>
      }
      subtitle="Maintenance Job Cards, Motor & Component Replacements, Production Runs & Technicians"
    >
      <MachineLifecycleContent
        machineId={machineId}
        machineCode={machineCode}
        barcodeValue={barcodeValue}
        inModal={true}
      />
    </DraggableResizableModal>
  );
};

export default ScannedMachineHistoryModal;
