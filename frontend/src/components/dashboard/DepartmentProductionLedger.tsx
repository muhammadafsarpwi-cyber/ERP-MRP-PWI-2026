import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Card,
  Tabs,
  Select,
  Table,
  Tag,
  Typography,
  Space,
  Row,
  Col,
  Button,
  DatePicker,
  Input,
  Empty,
  Spin,
  Tooltip,
  Switch,
} from 'antd';
import {
  SwapOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  InboxOutlined,
  SendOutlined,
  WarningOutlined,
  FileTextOutlined,
  DownloadOutlined,
  SearchOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ApartmentOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import dashboardService, {
  DepartmentLedgerData,
  DepartmentLedgerTransaction,
  DepartmentLedgerTicket,
} from '../../services/dashboardService';
import {
  CANONICAL_SPOKE_LIFECYCLE_STAGES,
  CANONICAL_CCD_LIFECYCLE_STAGES,
} from '../../services/lookupsCache';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const SPOKE_DIVISION_ID = 'd1000000-0000-0000-0000-000000000001';
const CCD_DIVISION_ID = 'd1000000-0000-0000-0000-000000000002';

/**
 * Circular Progress Ring matching the user's rejection percentage icon.
 * Displays a clean circular gauge with an active stroke and percentage in the center.
 */
const CircularProgressRing: React.FC<{
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
}> = ({
  percent,
  size = 46,
  strokeWidth = 4.5,
  color = '#ef4444',
  trackColor = 'rgba(239, 68, 68, 0.18)',
  label,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePercent = Math.min(100, Math.max(0, percent));
  // If percent is positive but tiny (e.g. 0.05%), show a minimum visual notch of at least 3% so the arc is visible
  const visualPercent = safePercent > 0 && safePercent < 3 ? 3 : safePercent;
  const strokeDashoffset = circumference - (visualPercent / 100) * circumference;
  const displayLabel =
    label !== undefined
      ? label
      : safePercent >= 10
      ? `${Math.round(safePercent)}%`
      : safePercent > 0
      ? `${safePercent.toFixed(1)}%`
      : '0%';

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          fontSize: size < 36 ? 8.5 : 10,
          fontWeight: 800,
          color,
          textAlign: 'center',
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {displayLabel}
      </span>
    </div>
  );
};

/**
 * Diagonal Expand/Collapse Icon matching user's reference screenshot.
 * Displays outward diagonal arrows (↖ ↘) when collapsed, and inward diagonal arrows (↘ ↖) when expanded.
 */
const DiagonalExpandIcon: React.FC<{ expanded: boolean }> = ({ expanded }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 22,
      height: 22,
      borderRadius: 5,
      background: expanded ? 'rgba(2, 132, 199, 0.2)' : 'var(--theme-surface-alt, rgba(255, 255, 255, 0.06))',
      border: expanded ? '1px solid #0284c7' : '1px solid var(--theme-border, rgba(148, 163, 184, 0.35))',
      color: expanded ? '#0284c7' : 'var(--theme-text-secondary, #94a3b8)',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
    }}
  >
    {expanded ? (
      // Collapsing / Inward diagonal arrows
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2v4H2" />
        <path d="M2 6l5-5" />
        <path d="M10 14v-4h4" />
        <path d="M14 10l-5 5" />
      </svg>
    ) : (
      // Expanding diagonal arrows (exact match to user screenshot)
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2H2v4" />
        <path d="M2 2l5 5" />
        <path d="M10 14h4v-4" />
        <path d="M14 14l-5-5" />
      </svg>
    )}
  </span>
);

interface DepartmentProductionLedgerProps {
  divisionId?: string;
  departmentId?: string;
  onDepartmentChange?: (deptId: string) => void;
  defaultDepartmentCode?: string;
}

export const DepartmentProductionLedger: React.FC<DepartmentProductionLedgerProps> = ({
  divisionId,
  departmentId,
  onDepartmentChange,
  defaultDepartmentCode = 'SPD-DEPT001',
}) => {
  const [selectedDeptCode, setSelectedDeptCode] = useState<string>(() => {
    if (departmentId && departmentId !== 'all') return departmentId;
    if (divisionId && divisionId !== SPOKE_DIVISION_ID) return '';
    return defaultDepartmentCode;
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<DepartmentLedgerData | null>(null);
  const [searchText, setSearchText] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const prevDivisionRef = useRef<string | undefined>(divisionId);
  const requestSeqRef = useRef<number>(0);
  const [isLedgerOpen, setIsLedgerOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('pwi_ledger_expanded');
    return saved !== null ? saved === 'true' : true;
  });

  const handleToggleLedger = (checked: boolean) => {
    setIsLedgerOpen(checked);
    localStorage.setItem('pwi_ledger_expanded', String(checked));
  };

  // Synchronize when departmentId prop from parent changes
  useEffect(() => {
    if (departmentId && departmentId !== 'all') {
      setSelectedDeptCode(departmentId);
    } else if (departmentId === 'all' || !departmentId) {
      if (divisionId && divisionId !== SPOKE_DIVISION_ID) {
        setSelectedDeptCode('');
      }
    }
  }, [departmentId, divisionId]);

  // Synchronize and strictly isolate state when divisionId prop from parent changes
  useEffect(() => {
    if (prevDivisionRef.current !== divisionId) {
      prevDivisionRef.current = divisionId;
      // Immediately purge cached ghost figures from previous operating division
      setData(null);
      setSearchText('');
      if (departmentId && departmentId !== 'all') {
        setSelectedDeptCode(departmentId);
      } else if (divisionId && divisionId !== SPOKE_DIVISION_ID) {
        setSelectedDeptCode('');
      } else {
        setSelectedDeptCode(defaultDepartmentCode);
      }
    }
  }, [divisionId, departmentId, defaultDepartmentCode]);

  const handleSelectDept = (val: string) => {
    setSelectedDeptCode(val);
    if (onDepartmentChange) {
      onDepartmentChange(val);
    }
  };

  // Fetch Ledger data from API with strict request sequence isolation
  const fetchLedger = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (selectedDeptCode && selectedDeptCode !== 'all') {
        params.departmentId = selectedDeptCode;
      }
      if (divisionId) {
        params.divisionId = divisionId;
      }
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.dateFrom = dateRange[0].format('YYYY-MM-DD');
        params.dateTo = dateRange[1].format('YYYY-MM-DD');
      }

      const res = await dashboardService.getDepartmentProductionLedger(params);
      if (seq !== requestSeqRef.current) return;

      if (res && res.success && res.data) {
        const incoming = { ...res.data };
        // Guard against legacy/stale backend payloads overwriting RM-STORE or FG-DISPATCH selection
        if (
          (selectedDeptCode === 'RM-STORE' || selectedDeptCode === 'FG-DISPATCH') &&
          incoming.department?.code !== selectedDeptCode &&
          incoming.department?.id !== selectedDeptCode
        ) {
          const isRmStore = selectedDeptCode === 'RM-STORE';
          incoming.department = {
            ...incoming.department,
            id: selectedDeptCode,
            code: selectedDeptCode,
            name: isRmStore ? 'Raw Material Stores (RM Wire Coil)' : 'Dispatch / FG Logistics',
            sourceDepartment: isRmStore
              ? 'Vendor / Steel Wire Mill (GRN Receipt)'
              : divisionId === CCD_DIVISION_ID
                ? 'Final Inspection & Cable Packing'
                : 'Spoke Packing',
            targetDepartment: isRmStore
              ? divisionId === CCD_DIVISION_ID
                ? 'Inner Wire Stranding & Cutting'
                : 'Straightener'
              : 'Customer Dispatch / Delivery Challan',
          };
        }
        setData(incoming);
      } else {
        setData(null);
      }
    } catch (err) {
      if (seq === requestSeqRef.current) {
        console.error('Failed to load department ledger:', err);
        setData(null);
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [selectedDeptCode, divisionId, dateRange]);

  useEffect(() => {
    void fetchLedger();
  }, [fetchLedger]);

  // Quick preset handlers
  const handlePresetChange = (preset: 'all' | '7d' | '30d' | 'month') => {
    if (preset === 'all') {
      setDateRange(null);
    } else if (preset === '7d') {
      setDateRange([dayjs().subtract(7, 'day'), dayjs()]);
    } else if (preset === '30d') {
      setDateRange([dayjs().subtract(30, 'day'), dayjs()]);
    } else if (preset === 'month') {
      setDateRange([dayjs().startOf('month'), dayjs().endOf('month')]);
    }
  };

  // Strictly scope department dropdown options to active division & ACTIVE status only,
  // permanently anchoring the canonical 7-stage lifecycle so async payloads never shrink the list
  const scopedDepartments = useMemo(() => {
    const raw = (data?.allDepartments || []).filter(
      (d: any) =>
        (!d.status || String(d.status).toUpperCase() === 'ACTIVE') &&
        d.isActive !== false &&
        d.is_active !== false,
    );
    const filtered = !divisionId ? raw : raw.filter((d) => !d.divisionId || d.divisionId === divisionId);

    const canonicalTemplate =
      !divisionId || divisionId === SPOKE_DIVISION_ID
        ? CANONICAL_SPOKE_LIFECYCLE_STAGES
        : divisionId === CCD_DIVISION_ID
          ? CANONICAL_CCD_LIFECYCLE_STAGES
          : null;

    if (!canonicalTemplate) return filtered;

    const targetDivId = divisionId || SPOKE_DIVISION_ID;
    return canonicalTemplate.map((stage) => {
      const matched = filtered.find(
        (d) =>
          d.code === stage.code ||
          d.id === stage.defaultDepartmentId ||
          d.id === stage.code ||
          d.name?.toLowerCase() === stage.name.toLowerCase(),
      );
      if (matched) {
        return {
          ...matched,
          code: matched.code || stage.code,
          name: stage.code === 'RM-STORE' || stage.code === 'FG-DISPATCH' ? stage.name : matched.name || stage.name,
        };
      }
      return {
        id: stage.defaultDepartmentId,
        code: stage.code,
        name: stage.name,
        divisionId: targetDivId,
      };
    });
  }, [data?.allDepartments, divisionId]);

  // Canonical 7-Stage Manufacturing Lifecycle is the Single Source of Truth:
  // [1. RM-STORE ➔ 2. STR ➔ 3. SWG ➔ 4. SPK ➔ 5. PL ➔ 6. PKG ➔ 7. FG-DISPATCH]
  // Incoming background sync or cached server responses can enrich department UUIDs
  // but are strictly prevented from overwriting or shrinking the 7-stage array back to 5 stages.
  const scopedStages = useMemo(() => {
    const canonicalTemplate =
      !divisionId || divisionId === SPOKE_DIVISION_ID
        ? CANONICAL_SPOKE_LIFECYCLE_STAGES
        : divisionId === CCD_DIVISION_ID
          ? CANONICAL_CCD_LIFECYCLE_STAGES
          : null;

    if (canonicalTemplate) {
      const serverStages = (data?.stages || []).filter((s: any) => {
        if (s.status && String(s.status).toUpperCase() !== 'ACTIVE') return false;
        if (s.isActive === false || s.is_active === false) return false;
        return true;
      });

      return canonicalTemplate.map((canonical) => {
        const isBoundaryAnchor = canonical.code === 'RM-STORE' || canonical.code === 'FG-DISPATCH';
        const matchedServerStage = serverStages.find(
          (s: any) =>
            s.code === canonical.code ||
            s.key === canonical.key ||
            s.departmentId === canonical.defaultDepartmentId,
        );
        const matchedDept = scopedDepartments.find(
          (d) => d.code === canonical.code || d.id === canonical.defaultDepartmentId,
        );
        const resolvedDeptId = isBoundaryAnchor
          ? canonical.code
          : matchedServerStage?.departmentId || matchedDept?.id || canonical.defaultDepartmentId;

        const isActive =
          selectedDeptCode === resolvedDeptId ||
          selectedDeptCode === canonical.code ||
          selectedDeptCode === canonical.key ||
          (!selectedDeptCode && canonical.code === 'SPD-DEPT001');

        return {
          key: canonical.key,
          code: canonical.code,
          name: canonical.name,
          departmentId: resolvedDeptId,
          active: isActive,
        };
      });
    }

    if (data?.stages && data.stages.length > 0) {
      return data.stages.filter((s: any) => {
        if (s.status && String(s.status).toUpperCase() !== 'ACTIVE') return false;
        if (s.isActive === false || s.is_active === false) return false;
        if (scopedDepartments.length > 0 && s.departmentId) {
          return scopedDepartments.some((d) => d.id === s.departmentId || d.code === s.code);
        }
        return true;
      });
    }
    if (scopedDepartments.length > 0) {
      return scopedDepartments.map((d) => ({
        key: d.id,
        code: d.code || d.id,
        name: d.name,
        departmentId: d.id,
        active: d.id === selectedDeptCode || d.code === selectedDeptCode,
      }));
    }
    return [];
  }, [data?.stages, scopedDepartments, divisionId, selectedDeptCode]);

  // Filtered transactions by search query
  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    if (!searchText.trim()) return data.transactions;
    const q = searchText.toLowerCase().trim();
    return data.transactions.filter((tx) => {
      const matchDate = tx.date.toLowerCase().includes(q);
      const matchSource = tx.sourceDepartment.toLowerCase().includes(q);
      const matchTarget = tx.targetDepartment.toLowerCase().includes(q);
      const matchTicket = tx.tickets.some(
        (t) =>
          t.entryNumber.toLowerCase().includes(q) ||
          t.itemCode.toLowerCase().includes(q) ||
          t.itemName.toLowerCase().includes(q) ||
          t.operatorName.toLowerCase().includes(q) ||
          t.machineNo.toLowerCase().includes(q)
      );
      return matchDate || matchSource || matchTarget || matchTicket;
    });
  }, [data?.transactions, searchText]);

  // Export to CSV
  const exportToCsv = () => {
    if (!data || !filteredTransactions.length) return;
    const headers = [
      'Date',
      'Source Process',
      'Inflow PCS',
      'Inflow KG',
      'Target Process',
      'Outflow PCS',
      'Outflow KG',
      'Scrap PCS',
      'Scrap KG',
      'Floor Net Balance PCS',
      'Floor Net Balance KG',
      'Shift Entries',
      'OT Hours',
    ];

    const rows = filteredTransactions.map((tx) => [
      tx.date,
      `"${tx.sourceDepartment}"`,
      tx.inflowPcs,
      tx.inflowKg.toFixed(2),
      `"${tx.targetDepartment}"`,
      tx.outflowPcs,
      tx.outflowKg.toFixed(2),
      tx.scrapPcs,
      tx.scrapKg.toFixed(2),
      tx.runningFloorBalancePcs,
      tx.runningFloorBalanceKg.toFixed(2),
      tx.entryCount,
      tx.overtimeHours,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Production_Ledger_${(data.department?.name || 'Department').replace(/\s+/g, '_')}_${dayjs().format('YYYYMMDD')}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Determine whether the active stage receives Raw Material Wire Coil in KG (1. RM-STORE and 2. Straightener / Flattening)
  const activeDeptCodeUpper = (data?.department?.code || selectedDeptCode || '').toUpperCase();
  const activeDeptNameLower = (data?.department?.name || '').toLowerCase();
  const isRmStoreStage = activeDeptCodeUpper === 'RM-STORE' || activeDeptNameLower.includes('raw material');
  const isWireInflowStage =
    isRmStoreStage ||
    activeDeptCodeUpper === 'SPD-DEPT001' ||
    activeDeptCodeUpper === 'CCD-DEPT001' ||
    activeDeptNameLower.includes('straight') ||
    activeDeptNameLower.includes('flatten');

  const formatScrapKg = (val: number): string => {
    const n = Number(val) || 0;
    if (n > 0 && n < 1 && Number((n * 1000).toFixed(0)) % 10 !== 0) {
      return n.toFixed(3);
    }
    return n.toFixed(2);
  };

  // Sub-table for shift ticket drilldown
  const expandedRowRender = (record: DepartmentLedgerTransaction) => {
    const ticketColumns = [
      {
        title: 'Entry #',
        dataIndex: 'entryNumber',
        key: 'entryNumber',
        render: (no: string) => <Tag color="blue" style={{ fontWeight: 600 }}>{no}</Tag>,
      },
      {
        title: 'Shift',
        dataIndex: 'shiftName',
        key: 'shiftName',
        render: (name: string, r: DepartmentLedgerTicket) => (
          <span className="pwi-ledger-text-primary">
            {name}{' '}
            {r.overtimeHours > 0 && (
              <Tag color="orange" style={{ fontSize: 10, padding: '0 4px' }}>
                +{r.overtimeHours}h OT
              </Tag>
            )}
          </span>
        ),
      },
      {
        title: 'Machine / Operator',
        key: 'machineOperator',
        render: (_: unknown, r: DepartmentLedgerTicket) => (
          <div>
            <div className="pwi-ledger-text-primary" style={{ fontWeight: 600 }}>{r.machineNo}</div>
            <div className="pwi-ledger-text-muted" style={{ fontSize: 11 }}>{r.operatorName}</div>
          </div>
        ),
      },
      {
        title: 'Item Produced & Target Route',
        key: 'item',
        render: (_: unknown, r: DepartmentLedgerTicket) => (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: '#0284c7' }} className="pwi-ledger-accent-cyan">{r.itemCode}</span>
              {r.nextProcess && (
                <Tag color={r.nextProcess.toLowerCase().includes('swag') ? 'purple' : 'cyan'} style={{ fontSize: 10, margin: 0, fontWeight: 700 }}>
                  ➔ {r.nextProcess}
                </Tag>
              )}
            </div>
            <div className="pwi-ledger-text-muted" style={{ fontSize: 11, maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.itemName}
            </div>
          </div>
        ),
      },
      {
        title: 'Good Output',
        key: 'quantity',
        align: 'right' as const,
        render: (_: unknown, r: DepartmentLedgerTicket) => (
          <div>
            <div style={{ fontWeight: 700, color: '#10b981' }}>{r.quantityPcs.toLocaleString()} PCS</div>
            <div className="pwi-ledger-text-muted" style={{ fontSize: 11 }}>({r.quantityKg.toFixed(2)} KG)</div>
          </div>
        ),
      },
      {
        title: 'Scrap / Rejection',
        key: 'scrap',
        align: 'right' as const,
        render: (_: unknown, r: DepartmentLedgerTicket) => {
          const ticketThroughput = r.quantityPcs + r.scrapPcs;
          const ticketPctPcs = ticketThroughput > 0 ? (r.scrapPcs / ticketThroughput) * 100 : 0;
          return (
            <Tooltip
              title={`Ticket Rejection: ${ticketPctPcs.toFixed(3)}% — Recorded: ${formatScrapKg(r.scrapKg)} KG / ${Math.round(r.scrapPcs).toLocaleString()} PCS`}
            >
              <div>
                <div style={{ fontWeight: 800, color: r.scrapKg > 0 ? '#ef4444' : 'var(--theme-text-muted, #94a3b8)' }}>
                  {r.scrapPcs > 0 ? `${Math.round(r.scrapPcs).toLocaleString()} PCS` : '0 PCS'}
                </div>
                {r.scrapKg > 0 && (
                  <div className="pwi-ledger-text-muted" style={{ fontSize: 10.5, fontWeight: 600 }}>
                    ({formatScrapKg(r.scrapKg)} KG)
                  </div>
                )}
                {ticketPctPcs > 0 && (
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: '#ef4444' }}>
                    {ticketPctPcs.toFixed(2)}% Rej
                  </div>
                )}
              </div>
            </Tooltip>
          );
        },
      },
      {
        title: 'Remarks',
        dataIndex: 'remarks',
        key: 'remarks',
        render: (txt: string) => (
          <span className="pwi-ledger-text-muted" style={{ fontSize: 11, fontStyle: txt ? 'normal' : 'italic' }}>
            {txt || 'No remarks logged'}
          </span>
        ),
      },
    ];

    return (
      <div className="pwi-ledger-expanded-box">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text strong className="pwi-ledger-text-primary" style={{ fontSize: 12.5 }}>
            <FileTextOutlined style={{ marginRight: 6, color: '#38bdf8' }} />
            Shift Log Tickets for {record.date} ({record.tickets.length} entries)
          </Text>
          <Tag color="cyan">Total Day Outflow: {record.outflowPcs.toLocaleString()} PCS ({record.outflowKg.toFixed(2)} KG)</Tag>
        </div>
        <Table
          size="small"
          dataSource={record.tickets}
          columns={ticketColumns}
          rowKey="id"
          pagination={false}
        />
      </div>
    );
  };

  // Main Ledger Columns (Operating identically to a Customer Ledger)
  const columns = [
    {
      title: (
        <span className="pwi-ledger-th-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <CalendarOutlined style={{ color: '#0284c7' }} /> Transaction Date
        </span>
      ),
      dataIndex: 'date',
      key: 'date',
      width: 150,
      render: (dStr: string) => {
        const dt = dayjs(dStr);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <CalendarOutlined style={{ color: '#0284c7', fontSize: 12.5 }} />
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 13,
                  color: '#0284c7', // Distinct date color (Cyan / Blue)
                  letterSpacing: '0.01em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {dt.isValid() ? dt.format('DD/MM/YYYY') : dStr}
              </span>
            </div>
            <div style={{ paddingLeft: 18 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#8b5cf6', // Distinct day of week color (Purple)
                  background: 'rgba(139, 92, 246, 0.12)',
                  padding: '1px 6px',
                  borderRadius: 4,
                  display: 'inline-block',
                  textTransform: 'capitalize',
                  lineHeight: 1.3,
                }}
              >
                {dt.isValid() ? dt.format('dddd') : ''}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: (
        <span className="pwi-ledger-th-title">
          {isWireInflowStage ? 'Inflow (Wire Coil Received in KG)' : 'Inflow (From Preceding Process)'}
        </span>
      ),
      key: 'inflow',
      width: 240,
      render: (_: unknown, r: DepartmentLedgerTransaction) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <ArrowDownOutlined className="pwi-ledger-accent-cyan" style={{ fontSize: 12 }} />
            {isWireInflowStage ? (
              <>
                <span className="pwi-ledger-accent-cyan" style={{ fontWeight: 800, fontSize: 13.5 }}>
                  {r.inflowKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                  <span style={{ fontSize: 10, fontWeight: 700 }}>KG</span>
                </span>
                {!isRmStoreStage && r.inflowPcs > 0 && (
                  <span className="pwi-ledger-text-secondary" style={{ fontSize: 11.5, fontWeight: 700 }}>
                    (≈ {Math.round(r.inflowPcs).toLocaleString()} PCS)
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="pwi-ledger-accent-cyan" style={{ fontWeight: 800, fontSize: 13.5 }}>
                  {Math.round(r.inflowPcs).toLocaleString()} <span style={{ fontSize: 10, fontWeight: 600 }}>PCS</span>
                </span>
                <span className="pwi-ledger-text-secondary" style={{ fontSize: 11.5, fontWeight: 600 }}>
                  ({r.inflowKg.toFixed(2)} KG)
                </span>
              </>
            )}
          </div>
          <div className="pwi-ledger-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
            Source: <strong className="pwi-ledger-text-secondary">{r.sourceDepartment}</strong>
          </div>
        </div>
      ),
    },
    {
      title: (
        <span className="pwi-ledger-th-title">
          {isRmStoreStage ? 'Outflow (Wire Issued to Straightener in KG)' : 'Outflow (To Sequential Process)'}
        </span>
      ),
      key: 'outflow',
      width: 260,
      render: (_: unknown, r: DepartmentLedgerTransaction) => {
        const hasSplitRoutes =
          activeDeptCodeUpper === 'SPD-DEPT001' &&
          (r.directToSpokePcs || 0) > 0 &&
          (r.toSwagingPcs || 0) > 0;
        const isOnlyDirectToSpoke =
          activeDeptCodeUpper === 'SPD-DEPT001' &&
          (r.directToSpokePcs || 0) > 0 &&
          !(r.toSwagingPcs && r.toSwagingPcs > 0);
        const isOnlyToSwaging =
          activeDeptCodeUpper === 'SPD-DEPT001' &&
          (r.toSwagingPcs || 0) > 0 &&
          !(r.directToSpokePcs && r.directToSpokePcs > 0);

        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <ArrowUpOutlined style={{ color: '#10b981', fontSize: 12 }} />
              {isRmStoreStage ? (
                <span style={{ fontWeight: 800, color: '#10b981', fontSize: 13.5 }}>
                  {r.outflowKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                  <span style={{ fontSize: 10, fontWeight: 700 }}>KG</span>
                </span>
              ) : (
                <>
                  <span style={{ fontWeight: 800, color: '#10b981', fontSize: 13.5 }}>
                    {Math.round(r.outflowPcs).toLocaleString()} <span style={{ fontSize: 10, fontWeight: 600 }}>PCS</span>
                  </span>
                  <span style={{ fontWeight: 600, color: '#10b981', fontSize: 11.5 }}>
                    ({r.outflowKg.toFixed(2)} KG)
                  </span>
                </>
              )}
            </div>

            {hasSplitRoutes ? (
              <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
                <div style={{ color: '#0ea5e9', fontWeight: 700 }}>
                  ➔ 4. Spoke (Header) [Direct]: {(r.directToSpokePcs || 0).toLocaleString()} PCS ({(r.directToSpokeKg || 0).toFixed(2)} KG)
                </div>
                <div style={{ color: '#a855f7', fontWeight: 700 }}>
                  ➔ 3. Swaging [Butted]: {(r.toSwagingPcs || 0).toLocaleString()} PCS ({(r.toSwagingKg || 0).toFixed(2)} KG)
                </div>
              </div>
            ) : (
              <div className="pwi-ledger-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                Target:{' '}
                <strong className="pwi-ledger-text-secondary">
                  {isRmStoreStage
                    ? '2. Straightener'
                    : isOnlyDirectToSpoke
                      ? '4. Spoke (Header) [Direct — No Swaging]'
                      : isOnlyToSwaging
                        ? '3. Swaging (Butted Route)'
                        : r.targetDepartment}
                </strong>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: <span className="pwi-ledger-th-title">Scrap / Loss</span>,
      key: 'scrap',
      width: 175,
      render: (_: unknown, r: DepartmentLedgerTransaction) => {
        const rowThroughputPcs = r.outflowPcs + r.scrapPcs;
        const rowScrapPctPcs = rowThroughputPcs > 0 ? (r.scrapPcs / rowThroughputPcs) * 100 : 0;
        const rowThroughputKg = r.outflowKg + r.scrapKg;
        const rowScrapPctKg = rowThroughputKg > 0 ? (r.scrapKg / rowThroughputKg) * 100 : 0;
        const hasScrap = r.scrapKg > 0 || r.scrapPcs > 0;
        const activePct = rowScrapPctPcs > 0 ? rowScrapPctPcs : rowScrapPctKg;

        return (
          <Tooltip
            title={`Daily Rejection Rate: ${rowScrapPctPcs.toFixed(3)}% (PCS basis: ${Math.round(r.scrapPcs).toLocaleString()} scrap / ${Math.round(rowThroughputPcs).toLocaleString()} total) | ${rowScrapPctKg.toFixed(3)}% (KG basis: ${formatScrapKg(r.scrapKg)} KG / ${rowThroughputKg.toFixed(2)} KG total)`}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <div>
                {/* PCS on Top in primary bold font */}
                {isRmStoreStage ? (
                  <div
                    className={hasScrap ? undefined : 'pwi-ledger-text-muted'}
                    style={{ fontWeight: 800, color: hasScrap ? '#ef4444' : undefined, fontSize: 13 }}
                  >
                    {formatScrapKg(r.scrapKg)} <span style={{ fontSize: 10, fontWeight: 700 }}>KG</span>
                  </div>
                ) : (
                  <>
                    <div
                      className={hasScrap ? undefined : 'pwi-ledger-text-muted'}
                      style={{ fontWeight: 800, color: hasScrap ? '#ef4444' : undefined, fontSize: 13 }}
                    >
                      {hasScrap ? `${Math.round(r.scrapPcs).toLocaleString()} PCS` : '0 PCS'}
                    </div>
                    {/* KG Below in secondary line */}
                    {hasScrap && (
                      <div className="pwi-ledger-text-muted" style={{ fontSize: 11, fontWeight: 600 }}>
                        ({formatScrapKg(r.scrapKg)} KG)
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Rejection Percentage Indicator matching user's circular ring icon */}
              {hasScrap ? (
                <div style={{ flexShrink: 0 }} title={`${activePct.toFixed(2)}% Rejection`}>
                  <CircularProgressRing
                    percent={activePct}
                    size={32}
                    strokeWidth={3}
                    color="#ef4444"
                    trackColor="rgba(239, 68, 68, 0.2)"
                  />
                </div>
              ) : (
                <span className="pwi-ledger-text-muted" style={{ fontSize: 10, fontWeight: 600 }}>
                  0.0%
                </span>
              )}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: <span className="pwi-ledger-th-title">Floor Balance (Running Net)</span>,
      key: 'runningBalance',
      width: 200,
      render: (_: unknown, r: DepartmentLedgerTransaction) => {
        const isPositive = r.runningFloorBalanceKg >= 0 && r.runningFloorBalancePcs >= 0;
        return (
          <Tooltip title="Current Net Floor Balance (LIVE WIP) = (Opening Balance + Actual Inflow) - (Actual Outflow + Scrap KG)">
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                background: isPositive ? 'rgba(56, 189, 248, 0.10)' : 'rgba(239, 68, 68, 0.10)',
                border: `1px solid ${isPositive ? 'rgba(56, 189, 248, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
              }}
            >
              {isRmStoreStage ? (
                <div
                  className={isPositive ? 'pwi-ledger-accent-cyan' : undefined}
                  style={{ fontWeight: 900, color: isPositive ? undefined : '#ef4444', fontSize: 14 }}
                >
                  {r.runningFloorBalanceKg.toFixed(2)} <span style={{ fontSize: 10, fontWeight: 700 }}>KG</span>
                </div>
              ) : (
                <>
                  <div
                    className={isPositive ? 'pwi-ledger-accent-cyan' : undefined}
                    style={{ fontWeight: 900, color: isPositive ? undefined : '#ef4444', fontSize: 14 }}
                  >
                    {Math.round(r.runningFloorBalancePcs).toLocaleString()} <span style={{ fontSize: 10, fontWeight: 600 }}>PCS</span>
                  </div>
                  <div
                    className={isPositive ? 'pwi-ledger-text-secondary' : undefined}
                    style={{ fontSize: 11, color: isPositive ? undefined : '#ef4444', fontWeight: 600 }}
                  >
                    ({r.runningFloorBalanceKg.toFixed(2)} KG)
                  </div>
                </>
              )}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: <span className="pwi-ledger-th-title">Operations</span>,
      key: 'ops',
      width: 120,
      render: (_: unknown, r: DepartmentLedgerTransaction) => (
        <div>
          <Tag color="geekblue" style={{ fontWeight: 600 }}>
            {r.entryCount} {r.entryCount === 1 ? 'ticket' : 'tickets'}
          </Tag>
          {r.overtimeHours > 0 && (
            <Tag color="orange" style={{ fontWeight: 700, marginTop: 3 }}>
              {r.overtimeHours}h OT
            </Tag>
          )}
        </div>
      ),
    },
  ];

  const activeTabKey = useMemo(() => {
    if (selectedDeptCode && selectedDeptCode !== 'all') {
      const match = scopedStages.find(
        (s) => s.code === selectedDeptCode || s.departmentId === selectedDeptCode || s.key === selectedDeptCode
      );
      if (match) return match.departmentId || match.code || match.key;
      return selectedDeptCode;
    }
    const activeStage = scopedStages.find((s) => s.active) || scopedStages[0];
    return activeStage?.departmentId || activeStage?.code || selectedDeptCode;
  }, [selectedDeptCode, scopedStages]);

  return (
    <>
      <style>{`
        /* ============================================================================
           PWI DEPARTMENT PRODUCTION LEDGER — DUAL-THEME HIGH-CONTRAST SYSTEM
           Strictly adapts to both Light and Dark system themes with zero occlusion.
           ============================================================================ */
        .pwi-ledger-card {
          border-radius: 12px !important;
          background: var(--theme-surface, #ffffff) !important;
          border: 1px solid #cbd5e1 !important;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06) !important;
          margin-bottom: 24px !important;
          transition: background 0.22s ease, border-color 0.22s ease;
        }

        [data-theme="dark"] .pwi-ledger-card {
          background: #0f172a !important;
          border: 1px solid #475569 !important;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45) !important;
        }

        /* Typography Tokens */
        .pwi-ledger-title {
          color: #0f172a !important;
        }
        [data-theme="dark"] .pwi-ledger-title {
          color: #FFFFFF !important;
        }

        .pwi-ledger-text-primary {
          color: #0f172a !important;
        }
        [data-theme="dark"] .pwi-ledger-text-primary {
          color: #F8FAFC !important;
        }

        .pwi-ledger-text-secondary {
          color: #334155 !important;
        }
        [data-theme="dark"] .pwi-ledger-text-secondary {
          color: #E2E8F0 !important;
        }

        .pwi-ledger-text-muted {
          color: #64748b !important;
        }
        [data-theme="dark"] .pwi-ledger-text-muted {
          color: #94a3b8 !important;
        }

        .pwi-ledger-accent-cyan {
          color: #0284c7 !important;
        }
        [data-theme="dark"] .pwi-ledger-accent-cyan {
          color: #38bdf8 !important;
        }

        /* ── Input, DatePicker & Dropdown Selectors (High-Contrast Borders & Backgrounds) ── */
        .pwi-ledger-card .ant-select-selector,
        .pwi-ledger-card .ant-input-affix-wrapper,
        .pwi-ledger-card .ant-picker {
          border: 1px solid #475569 !important;
          background: #FFFFFF !important;
          color: #0f172a !important;
          border-radius: 8px !important;
          transition: all 0.2s ease !important;
        }

        .pwi-ledger-card .ant-input-affix-wrapper > input.ant-input {
          background: transparent !important;
          color: #0f172a !important;
          border: none !important;
        }

        .pwi-ledger-card .ant-select-selection-item,
        .pwi-ledger-card .ant-picker-input > input {
          color: #0f172a !important;
          font-weight: 600 !important;
        }

        .pwi-ledger-card .ant-select-selection-placeholder,
        .pwi-ledger-card .ant-picker-input > input::placeholder,
        .pwi-ledger-card .ant-input::placeholder {
          color: #64748b !important;
        }

        .pwi-ledger-card .ant-select-arrow,
        .pwi-ledger-card .ant-picker-suffix,
        .pwi-ledger-card .ant-picker-separator {
          color: #475569 !important;
        }

        .pwi-ledger-card .ant-btn:not(.ant-btn-primary) {
          background: #FFFFFF !important;
          border: 1px solid #475569 !important;
          color: #0f172a !important;
          font-weight: 600 !important;
        }

        .pwi-ledger-card .ant-btn:not(.ant-btn-primary):hover {
          border-color: #0284c7 !important;
          color: #0284c7 !important;
        }

        /* Dark Theme Input & Dropdown Overrides (#1E293B background + 1px solid #475569 border) */
        [data-theme="dark"] .pwi-ledger-card .ant-select-selector,
        [data-theme="dark"] .pwi-ledger-card .ant-input-affix-wrapper,
        [data-theme="dark"] .pwi-ledger-card .ant-picker {
          background: #1E293B !important;
          border: 1px solid #475569 !important;
          color: #FFFFFF !important;
        }

        [data-theme="dark"] .pwi-ledger-card .ant-select-selector:hover,
        [data-theme="dark"] .pwi-ledger-card .ant-input-affix-wrapper:hover,
        [data-theme="dark"] .pwi-ledger-card .ant-picker:hover {
          border-color: #38bdf8 !important;
        }

        [data-theme="dark"] .pwi-ledger-card .ant-input-affix-wrapper > input.ant-input {
          background: transparent !important;
          color: #FFFFFF !important;
        }

        [data-theme="dark"] .pwi-ledger-card .ant-select-selection-item,
        [data-theme="dark"] .pwi-ledger-card .ant-select-selection-search-input,
        [data-theme="dark"] .pwi-ledger-card .ant-picker-input > input {
          color: #FFFFFF !important;
          font-weight: 600 !important;
        }

        [data-theme="dark"] .pwi-ledger-card .ant-select-selection-placeholder,
        [data-theme="dark"] .pwi-ledger-card .ant-picker-input > input::placeholder,
        [data-theme="dark"] .pwi-ledger-card .ant-input::placeholder {
          color: #94a3b8 !important;
        }

        [data-theme="dark"] .pwi-ledger-card .ant-select-arrow,
        [data-theme="dark"] .pwi-ledger-card .ant-picker-suffix,
        [data-theme="dark"] .pwi-ledger-card .ant-picker-separator,
        [data-theme="dark"] .pwi-ledger-card .ant-input-clear-icon,
        [data-theme="dark"] .pwi-ledger-card .ant-picker-clear {
          color: #cbd5e1 !important;
        }

        [data-theme="dark"] .pwi-ledger-card .ant-btn:not(.ant-btn-primary) {
          background: #1E293B !important;
          border: 1px solid #475569 !important;
          color: #F8FAFC !important;
          font-weight: 600 !important;
        }

        [data-theme="dark"] .pwi-ledger-card .ant-btn:not(.ant-btn-primary):hover {
          border-color: #38bdf8 !important;
          color: #38bdf8 !important;
          background: #26354d !important;
        }

        [data-theme="dark"] .pwi-ledger-card .ant-btn:disabled {
          opacity: 0.5 !important;
          color: #64748b !important;
        }

        /* Dropdown Popup Menu Contrast in Dark Theme */
        [data-theme="dark"] .pwi-ledger-dept-popup.ant-select-dropdown {
          background: #1E293B !important;
          border: 1px solid #475569 !important;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55) !important;
        }
        [data-theme="dark"] .pwi-ledger-dept-popup .ant-select-item {
          color: #E2E8F0 !important;
        }
        [data-theme="dark"] .pwi-ledger-dept-popup .ant-select-item-option-active {
          background: rgba(56, 189, 248, 0.15) !important;
          color: #FFFFFF !important;
        }
        [data-theme="dark"] .pwi-ledger-dept-popup .ant-select-item-option-selected {
          background: #0284c7 !important;
          color: #FFFFFF !important;
          font-weight: 700 !important;
        }

        /* ── Department Stage Tab Pills (Zero Text Occlusion) ── */
        .pwi-ledger-tabs-strip {
          border-bottom: 1px solid #cbd5e1;
          margin-bottom: 16px;
          padding-bottom: 4px;
        }
        [data-theme="dark"] .pwi-ledger-tabs-strip {
          border-bottom: 1px solid #475569;
        }

        .pwi-ledger-card .ant-tabs-nav::before {
          display: none !important;
        }

        .pwi-ledger-card .ant-tabs-ink-bar {
          display: none !important;
        }

        /* Inactive Tab Pill */
        .pwi-ledger-card .ant-tabs-tab {
          padding: 7px 14px !important;
          margin: 0 8px 6px 0 !important;
          border-radius: 8px !important;
          background: #f1f5f9 !important;
          border: 1px solid #94a3b8 !important;
          color: #475569 !important;
          transition: all 0.18s ease !important;
        }

        .pwi-ledger-card .ant-tabs-tab .ant-tabs-tab-btn,
        .pwi-ledger-card .ant-tabs-tab .pwi-ledger-tab-label {
          color: #475569 !important;
          font-weight: 600 !important;
          font-size: 13px !important;
        }

        .pwi-ledger-card .ant-tabs-tab:hover {
          background: #e2e8f0 !important;
          border-color: #0284c7 !important;
        }

        .pwi-ledger-card .ant-tabs-tab:hover .ant-tabs-tab-btn,
        .pwi-ledger-card .ant-tabs-tab:hover .pwi-ledger-tab-label {
          color: #0f172a !important;
        }

        [data-theme="dark"] .pwi-ledger-card .ant-tabs-tab {
          background: #1E293B !important;
          border: 1px solid #475569 !important;
          color: #94a3b8 !important;
        }

        [data-theme="dark"] .pwi-ledger-card .ant-tabs-tab .ant-tabs-tab-btn,
        [data-theme="dark"] .pwi-ledger-card .ant-tabs-tab .pwi-ledger-tab-label {
          color: #94a3b8 !important;
        }

        [data-theme="dark"] .pwi-ledger-card .ant-tabs-tab:hover {
          background: #26354d !important;
          border-color: #38bdf8 !important;
        }

        [data-theme="dark"] .pwi-ledger-card .ant-tabs-tab:hover .ant-tabs-tab-btn,
        [data-theme="dark"] .pwi-ledger-card .ant-tabs-tab:hover .pwi-ledger-tab-label {
          color: #E2E8F0 !important;
        }

        /* Active Tab Pill — Forced Bright White (#FFFFFF) in Both Themes */
        .pwi-ledger-card .ant-tabs-tab.ant-tabs-tab-active,
        [data-theme="dark"] .pwi-ledger-card .ant-tabs-tab.ant-tabs-tab-active {
          background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%) !important;
          border: 1px solid #38bdf8 !important;
          color: #FFFFFF !important;
          box-shadow: 0 2px 10px rgba(14, 165, 233, 0.35) !important;
        }

        .pwi-ledger-card .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn,
        .pwi-ledger-card .ant-tabs-tab.ant-tabs-tab-active .pwi-ledger-tab-label,
        .pwi-ledger-card .ant-tabs-tab.ant-tabs-tab-active .anticon,
        [data-theme="dark"] .pwi-ledger-card .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn,
        [data-theme="dark"] .pwi-ledger-card .ant-tabs-tab.ant-tabs-tab-active .pwi-ledger-tab-label,
        [data-theme="dark"] .pwi-ledger-card .ant-tabs-tab.ant-tabs-tab-active .anticon {
          color: #FFFFFF !important;
          font-weight: 800 !important;
          text-shadow: none !important;
        }

        /* Filter Bar Surface */
        .pwi-ledger-filter-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
          background: #f8fafc;
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
        }

        [data-theme="dark"] .pwi-ledger-filter-bar {
          background: rgba(30, 41, 59, 0.65);
          border: 1px solid #475569;
        }

        /* Summary Opening Balance Box */
        .pwi-ledger-kpi-neutral {
          padding: 12px 14px;
          border-radius: 8px;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
        }

        [data-theme="dark"] .pwi-ledger-kpi-neutral {
          background: #1E293B;
          border: 1px solid #475569;
        }

        /* Current Net Floor Balance Box */
        .pwi-ledger-kpi-net {
          padding: 12px 16px;
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(37, 99, 235, 0.06) 100%);
          border: 1px solid #3b82f6;
        }

        [data-theme="dark"] .pwi-ledger-kpi-net {
          background: linear-gradient(135deg, rgba(30, 58, 138, 0.45) 0%, rgba(15, 23, 42, 0.85) 100%);
          border: 1px solid #3b82f6;
        }

        /* Expanded Ticket Drilldown Box */
        .pwi-ledger-expanded-box {
          margin: 8px 0;
          padding: 12px;
          background: #f8fafc;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
        }

        [data-theme="dark"] .pwi-ledger-expanded-box {
          background: rgba(15, 23, 42, 0.75);
          border: 1px solid #475569;
        }

        /* ── Ledger Table Adaptive Theme Overrides ── */
        .pwi-ledger-th-title {
          font-weight: 800;
          color: inherit;
        }

        html:not([data-theme="dark"]) .pwi-ledger-card .pwi-dark-ledger-table .ant-table {
          background: #ffffff !important;
          color: #0f172a !important;
        }

        html:not([data-theme="dark"]) .pwi-ledger-card .pwi-dark-ledger-table .ant-table-container {
          border: 1px solid #cbd5e1 !important;
          border-radius: 8px;
          overflow: hidden;
        }

        html[data-theme="dark"] .pwi-ledger-card .pwi-dark-ledger-table,
        html[data-theme="dark"] .pwi-ledger-card .pwi-dark-ledger-table .ant-table {
          background: #0f172a !important;
          color: #f8fafc !important;
        }

        html[data-theme="dark"] .pwi-ledger-card .pwi-dark-ledger-table .ant-table-container .ant-table-thead > tr > th {
          background: #1E293B !important;
          color: #FFFFFF !important;
          font-weight: 800 !important;
          font-size: 12.5px !important;
          border-bottom: 1px solid #475569 !important;
        }

        html[data-theme="dark"] .pwi-ledger-card .pwi-dark-ledger-table .ant-table-container .ant-table-thead > tr > th .pwi-ledger-th-title {
          color: #FFFFFF !important;
        }

        html[data-theme="dark"] .pwi-ledger-card .pwi-dark-ledger-table .ant-table-container .ant-table-tbody > tr > td {
          background: #0f172a !important;
          color: #f8fafc !important;
          border-bottom: 1px solid #334155 !important;
        }

        html[data-theme="dark"] .pwi-ledger-card .pwi-dark-ledger-table .ant-table-container .ant-table-tbody > tr:hover > td {
          background: #1E293B !important;
        }

        html[data-theme="dark"] .pwi-ledger-card .pwi-dark-ledger-table .ant-table-container {
          border: 1px solid #475569 !important;
          border-radius: 8px;
          overflow: hidden;
        }

        html[data-theme="dark"] .pwi-ledger-card .pwi-dark-ledger-table .ant-pagination,
        html[data-theme="dark"] .pwi-ledger-card .pwi-dark-ledger-table .ant-pagination-item a {
          color: #cbd5e1 !important;
        }

        html[data-theme="dark"] .pwi-ledger-card .pwi-dark-ledger-table .ant-pagination-item-active {
          border-color: #38bdf8 !important;
          background: rgba(56, 189, 248, 0.2) !important;
        }

        html[data-theme="dark"] .pwi-ledger-card .pwi-dark-ledger-table .ant-pagination-item-active a {
          color: #FFFFFF !important;
        }
      `}</style>
      <Card
        className="pwi-ledger-card"
        bordered={false}
        bodyStyle={{ padding: isLedgerOpen ? '20px 24px' : '14px 20px', transition: 'padding 0.2s ease' }}
      >
        {/* ── HEADER & CONTROLS ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: isLedgerOpen ? 16 : 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <ApartmentOutlined className="pwi-ledger-accent-cyan" style={{ fontSize: 22 }} />
              <Title level={4} className="pwi-ledger-title" style={{ margin: 0, fontWeight: 800, letterSpacing: -0.2 }}>
                Department-Wise Inflow/Outflow Production Ledger
              </Title>
              <Tag color="blue" style={{ fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase' }}>
                Sequential Shop Floor Accounting
              </Tag>
            </div>
            {isLedgerOpen && (
              <Text className="pwi-ledger-text-muted" style={{ fontSize: 12, marginTop: 2, display: 'block' }}>
                Operating identically to a Customer Ledger: Chronological receipts (Inflow), outgoing transfers (Outflow), scrap deductions, and running net floor inventory balance in Pieces &amp; KG.
              </Text>
            )}
          </div>

          {/* Action buttons & Department Dropdown Switcher + ON / OFF Toggle */}
          <Space wrap size="middle" style={{ alignItems: 'center' }}>
            {isLedgerOpen && (
              <>
                <div>
                  <span className="pwi-ledger-text-secondary" style={{ fontSize: 11, fontWeight: 700, marginRight: 8 }}>
                    All Manufacturing Depts:
                  </span>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    popupClassName="pwi-ledger-dept-popup"
                    style={{ width: 230, fontWeight: 600 }}
                    value={
                      scopedDepartments.find((d) => d.id === selectedDeptCode || d.code === selectedDeptCode)?.id ||
                      (data?.department?.id && scopedDepartments.some((d) => d.id === data.department.id)
                        ? data.department.id
                        : scopedDepartments[0]?.id)
                    }
                    placeholder="Select Department"
                    onChange={(val) => handleSelectDept(val)}
                    options={scopedDepartments.map((d) => ({
                      value: d.id,
                      label: `${d.name} (${d.code || 'DEPT'})`,
                    }))}
                  />
                </div>

                <Button
                  icon={<DownloadOutlined />}
                  onClick={exportToCsv}
                  disabled={!filteredTransactions.length}
                  style={{ fontWeight: 600 }}
                >
                  Export Ledger CSV
                </Button>

                <Button icon={<ReloadOutlined />} onClick={() => void fetchLedger()} loading={loading} />
              </>
            )}

            {/* ON / OFF Switch at top corner matching user's exact drawing */}
            <div
              onClick={() => handleToggleLedger(!isLedgerOpen)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 10px',
                borderRadius: 20,
                cursor: 'pointer',
                userSelect: 'none',
                background: isLedgerOpen ? 'rgba(16, 185, 129, 0.12)' : 'var(--theme-surface-alt, rgba(255, 255, 255, 0.06))',
                border: isLedgerOpen ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid var(--theme-border, rgba(148, 163, 184, 0.25))',
                transition: 'all 0.2s ease',
              }}
              title={isLedgerOpen ? 'Click to collapse ledger and save space' : 'Click to expand ledger'}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: isLedgerOpen ? '#10b981' : 'var(--theme-text-muted, #94a3b8)',
                  letterSpacing: '0.04em',
                }}
              >
                {isLedgerOpen ? 'ON' : 'OFF'}
              </span>
              <Switch
                checked={isLedgerOpen}
                onChange={handleToggleLedger}
                checkedChildren="ON"
                unCheckedChildren="OFF"
                style={{
                  backgroundColor: isLedgerOpen ? '#10b981' : undefined,
                }}
              />
            </div>
          </Space>
        </div>

        {/* ── COLLAPSIBLE LEDGER BODY ── */}
        {isLedgerOpen && (
          <div>

        {/* ── SEQUENTIAL STAGE TABS (S1 -> S4+ Waterfall) ── */}
        {scopedStages.length > 0 && (
          <div className="pwi-ledger-tabs-strip">
            <Tabs
              activeKey={activeTabKey}
              onChange={(activeKey) => handleSelectDept(activeKey)}
              type="line"
              tabBarStyle={{ marginBottom: 0 }}
              items={scopedStages.map((s, idx) => {
                const tabKey = s.departmentId || s.code || s.key;
                const isActive = tabKey === activeTabKey;
                const stageIcons = [
                  <InboxOutlined key="i1" style={{ marginRight: 6 }} />,
                  <SwapOutlined key="i2" style={{ marginRight: 6 }} />,
                  <ApartmentOutlined key="i3" style={{ marginRight: 6 }} />,
                  <CheckCircleOutlined key="i4" style={{ marginRight: 6 }} />,
                  <SendOutlined key="i5" style={{ marginRight: 6 }} />,
                ];
                return {
                  key: tabKey,
                  label: (
                    <span
                      className="pwi-ledger-tab-label"
                      style={{
                        fontSize: 13,
                        fontWeight: isActive ? 800 : 600,
                        color: isActive ? '#FFFFFF' : undefined,
                      }}
                    >
                      {stageIcons[idx % stageIcons.length]}
                      {`${idx + 1}. ${s.name}`}
                    </span>
                  ),
                };
              })}
            />
          </div>
        )}

        {/* ── FILTER & DATE CONTROLS ── */}
        <div className="pwi-ledger-filter-bar">
          <Space wrap size="small">
            <Input
              placeholder="Search by ticket #, item, operator, machine..."
              prefix={<SearchOutlined className="pwi-ledger-text-muted" />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 280 }}
              allowClear
            />

            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
              format="YYYY-MM-DD"
              style={{ width: 240 }}
            />
          </Space>

          <Space size="small">
            <Button size="small" type={dateRange === null ? 'primary' : 'default'} onClick={() => handlePresetChange('all')}>
              All Time
            </Button>
            <Button size="small" onClick={() => handlePresetChange('7d')}>
              Last 7 Days
            </Button>
            <Button size="small" onClick={() => handlePresetChange('30d')}>
              Last 30 Days
            </Button>
            <Button size="small" onClick={() => handlePresetChange('month')}>
              This Month
            </Button>
          </Space>
        </div>

        {/* ── SUMMARY KPI SCORECARD (OPERATING IDENTICALLY TO A CUSTOMER LEDGER) ── */}
        <Row gutter={[14, 14]} style={{ marginBottom: 20 }}>
          {/* 1. Opening Balance */}
          <Col xs={12} sm={6} lg={4}>
            <div className="pwi-ledger-kpi-neutral">
              <span className="pwi-ledger-text-muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                Opening Floor Balance
              </span>
              {isRmStoreStage ? (
                <>
                  <div className="pwi-ledger-text-primary" style={{ fontSize: 16, fontWeight: 900, marginTop: 4 }}>
                    {(data?.summary?.openingBalanceKg || 0).toFixed(2)} <span style={{ fontSize: 11 }}>KG</span>
                  </div>
                  <div className="pwi-ledger-text-muted" style={{ fontSize: 11, fontWeight: 600 }}>
                    RM Wire Coil Stock
                  </div>
                </>
              ) : (
                <>
                  <div className="pwi-ledger-text-primary" style={{ fontSize: 16, fontWeight: 900, marginTop: 4 }}>
                    {Math.round(data?.summary?.openingBalancePcs || 0).toLocaleString()} <span style={{ fontSize: 11 }}>PCS</span>
                  </div>
                  <div className="pwi-ledger-text-muted" style={{ fontSize: 11, fontWeight: 600 }}>
                    ({(data?.summary?.openingBalanceKg || 0).toFixed(2)} KG)
                  </div>
                </>
              )}
            </div>
          </Col>

          {/* 2. Total Inflow */}
          <Col xs={12} sm={6} lg={5}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="pwi-ledger-accent-cyan" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                  {isWireInflowStage ? 'Total Wire Inflow (KG)' : 'Total Inflow Received'}
                </span>
                <ArrowDownOutlined className="pwi-ledger-accent-cyan" />
              </div>
              {isWireInflowStage ? (
                <>
                  <div className="pwi-ledger-accent-cyan" style={{ fontSize: 17, fontWeight: 900, marginTop: 4 }}>
                    +{(data?.summary?.totalInflowKg || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    <span style={{ fontSize: 11 }}>KG</span>
                  </div>
                  <div className="pwi-ledger-accent-cyan" style={{ fontSize: 11, fontWeight: 600 }}>
                    {isRmStoreStage
                      ? 'Wire Coil Received from Mill'
                      : `(≈ ${Math.round(data?.summary?.totalInflowPcs || 0).toLocaleString()} PCS)`}
                  </div>
                </>
              ) : (
                <>
                  <div className="pwi-ledger-accent-cyan" style={{ fontSize: 17, fontWeight: 900, marginTop: 4 }}>
                    +{Math.round(data?.summary?.totalInflowPcs || 0).toLocaleString()} <span style={{ fontSize: 11 }}>PCS</span>
                  </div>
                  <div className="pwi-ledger-accent-cyan" style={{ fontSize: 11, fontWeight: 600 }}>
                    (+{(data?.summary?.totalInflowKg || 0).toFixed(2)} KG)
                  </div>
                </>
              )}
            </div>
          </Col>

          {/* 3. Total Outflow */}
          <Col xs={12} sm={6} lg={5}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>
                  {isRmStoreStage ? 'Issued to Straightener (KG)' : 'Total Outflow Transferred'}
                </span>
                <ArrowUpOutlined style={{ color: '#10b981' }} />
              </div>
              {isRmStoreStage ? (
                <>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#10b981', marginTop: 4 }}>
                    -{(data?.summary?.totalOutflowKg || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    <span style={{ fontSize: 11 }}>KG</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                    Target: 2. Straightener
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#10b981', marginTop: 4 }}>
                    -{Math.round(data?.summary?.totalOutflowPcs || 0).toLocaleString()} <span style={{ fontSize: 11 }}>PCS</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                    (-{(data?.summary?.totalOutflowKg || 0).toFixed(2)} KG)
                  </div>
                </>
              )}
            </div>
          </Col>

          {/* 4. Total Scrap Card with Circular Rejection Gauge and Swapped Units (PCS Top, KG Bottom) */}
          {(() => {
            const totalOutPcs = Number(data?.summary?.totalOutflowPcs || 0);
            const totalOutKg = Number(data?.summary?.totalOutflowKg || 0);
            const totalScrapPcs = Number(data?.summary?.totalScrapPcs || 0);
            const totalScrapKg = Number(data?.summary?.totalScrapKg || 0);
            const totalPcsThroughput = totalOutPcs + totalScrapPcs;
            const scrapPctPcs = totalPcsThroughput > 0 ? (totalScrapPcs / totalPcsThroughput) * 100 : 0;
            const totalKgThroughput = totalOutKg + totalScrapKg;
            const scrapPctKg = totalKgThroughput > 0 ? (totalScrapKg / totalKgThroughput) * 100 : 0;
            const activeGaugePct = scrapPctPcs > 0 ? scrapPctPcs : scrapPctKg;

            return (
              <Col xs={12} sm={6} lg={4}>
                <Tooltip
                  title={`Total Rejection / Scrap Rate: ${scrapPctPcs.toFixed(3)}% (PCS: ${Math.round(totalScrapPcs).toLocaleString()} scrap / ${Math.round(totalPcsThroughput).toLocaleString()} total) | ${scrapPctKg.toFixed(3)}% (KG: ${totalScrapKg.toFixed(2)} KG / ${totalKgThroughput.toFixed(2)} KG total)`}
                >
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>
                        Total Floor Scrap
                      </span>
                      <WarningOutlined style={{ color: '#ef4444' }} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 4 }}>
                      <div>
                        {isRmStoreStage ? (
                          <>
                            <div style={{ fontSize: 17, fontWeight: 900, color: '#ef4444', lineHeight: 1.2 }}>
                              -{totalScrapKg.toFixed(2)} <span style={{ fontSize: 11 }}>KG</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
                              0.00% Rejection
                            </div>
                          </>
                        ) : (
                          <>
                            {/* PCS on Top in primary large bold font */}
                            <div style={{ fontSize: 17, fontWeight: 900, color: '#ef4444', lineHeight: 1.2 }}>
                              -{Math.round(totalScrapPcs).toLocaleString()} <span style={{ fontSize: 11 }}>PCS</span>
                            </div>
                            {/* KG Below in secondary line */}
                            <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, marginTop: 1 }}>
                              (-{totalScrapKg.toFixed(2)} KG)
                            </div>
                          </>
                        )}
                      </div>

                      {/* Circular Gauge Ring matching user's screenshot */}
                      <div style={{ flexShrink: 0 }}>
                        <CircularProgressRing
                          percent={activeGaugePct}
                          size={44}
                          strokeWidth={4.5}
                          color="#ef4444"
                          trackColor="rgba(239, 68, 68, 0.2)"
                        />
                      </div>
                    </div>

                    {/* Subline showing both % PCS and % KG */}
                    {!isRmStoreStage && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#ef4444',
                          marginTop: 4,
                          paddingTop: 3,
                          borderTop: '1px dashed rgba(239, 68, 68, 0.25)',
                        }}
                      >
                        <span>{scrapPctPcs.toFixed(2)}% PCS</span>
                        <span>{scrapPctKg.toFixed(2)}% KG</span>
                      </div>
                    )}
                  </div>
                </Tooltip>
              </Col>
            );
          })()}

          {/* 5. Current Net Floor Balance */}
          <Col xs={24} sm={12} lg={6}>
            <Tooltip title="Current Net Floor Balance (LIVE WIP) = (Opening Balance + Actual Inflow) - (Actual Outflow + Scrap KG)">
              <div className="pwi-ledger-kpi-net">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="pwi-ledger-accent-cyan" style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase' }}>
                    Current Net Floor Balance
                  </span>
                  <Tag color="blue" style={{ margin: 0, fontWeight: 800 }}>
                    LIVE WIP
                  </Tag>
                </div>
                {isRmStoreStage ? (
                  <>
                    <div className="pwi-ledger-accent-cyan" style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>
                      {(data?.summary?.currentFloorBalanceKg || 0).toFixed(2)} <span style={{ fontSize: 12 }}>KG</span>
                    </div>
                    <div className="pwi-ledger-text-secondary" style={{ fontSize: 12, fontWeight: 700 }}>
                      on {data?.department?.name || 'Raw Material Stores'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pwi-ledger-accent-cyan" style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>
                      {Math.round(data?.summary?.currentFloorBalancePcs || 0).toLocaleString()} <span style={{ fontSize: 12 }}>PCS</span>
                    </div>
                    <div className="pwi-ledger-text-secondary" style={{ fontSize: 12, fontWeight: 700 }}>
                      ({(data?.summary?.currentFloorBalanceKg || 0).toFixed(2)} KG) on {data?.department?.name || 'Floor'}
                    </div>
                  </>
                )}
              </div>
            </Tooltip>
          </Col>
        </Row>

        {/* ── TRANSACTION LEDGER GRID ── */}
        <Spin spinning={loading}>
          <Table
            className="pwi-dark-ledger-table"
            dataSource={filteredTransactions}
            columns={columns}
            rowKey="date"
            expandable={{
              expandedRowRender,
              columnWidth: 44,
              rowExpandable: (record) => Boolean(record.tickets && record.tickets.length > 0),
              expandIcon: ({ expanded, onExpand, record }) => {
                const canExpand = Boolean(record.tickets && record.tickets.length > 0);
                if (!canExpand) {
                  return <span style={{ width: 22, display: 'inline-block' }} />;
                }
                return (
                  <span
                    onClick={(e) => onExpand(record, e)}
                    title={expanded ? 'Collapse shift tickets' : 'Expand shift tickets'}
                    style={{ display: 'inline-flex', verticalAlign: 'middle' }}
                  >
                    <DiagonalExpandIcon expanded={expanded} />
                  </span>
                );
              },
            }}
            pagination={{
              pageSize: 15,
              showSizeChanger: true,
              pageSizeOptions: ['10', '15', '30', '50'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} ledger entries`,
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <span className="pwi-ledger-text-secondary">
                      No production ledger records found for <strong>{data?.department?.name || 'selected department'}</strong>.
                    </span>
                  }
                />
              ),
            }}
          />
        </Spin>
          </div>
        )}
      </Card>
    </>
  );
};

export default DepartmentProductionLedger;
