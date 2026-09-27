import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Button,
  Input,
  Tag,
  Space,
  Spin,
  Table,
  message,
  Tooltip,
  Select,
  Badge,
} from 'antd';
import {
  RobotOutlined,
  SendOutlined,
  DeleteOutlined,
  LikeOutlined,
  DislikeOutlined,
  CopyOutlined,
  CheckOutlined,
  FilterOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { apiService } from '../../services/api';
import { useThemeStore } from '../../theme/themeStore';
import dayjs from 'dayjs';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  divisionScope?: string;
  tableData?: {
    columns: { title: string; dataIndex: string; key: string; render?: (v: any, r?: any, i?: number) => React.ReactNode }[];
    rows: any[];
  };
  chartData?: {
    type: 'bar' | 'line' | 'multibar' | 'pie';
    data: any[];
    dataKeys: { key: string; color: string; name: string }[];
    xKey: string;
    title?: string;
    unit?: string;
  };
  liked?: boolean;
  disliked?: boolean;
}

type AiColumn = { title: string; dataIndex: string; key: string; render?: (v: any, r?: any, i?: number) => React.ReactNode };
interface QueryResult {
  text: string;
  divisionScope?: string;
  tableData?: { columns: AiColumn[]; rows: any[] };
  chartData?: {
    type: 'bar' | 'line' | 'multibar' | 'pie';
    data: any[];
    dataKeys: { key: string; color: string; name: string }[];
    xKey: string;
    title?: string;
    unit?: string;
  };
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Known Divisions & Unit Metadata ──────────────────────────────────────────
export interface DivisionMeta {
  id: string;
  code: string;
  name: string;
  uom: string;
  color: string;
}

const DEFAULT_DIVISIONS: DivisionMeta[] = [
  {
    id: 'ALL',
    code: 'ALL',
    name: 'All Divisions',
    uom: 'Multi-UOM (PCS, KG, MTR, Bags)',
    color: '#3b82f6',
  },
  {
    id: 'd1000000-0000-0000-0000-000000000002',
    code: 'DIV-CCD',
    name: 'Control Cable Division',
    uom: 'MTR / KG',
    color: '#10b981',
  },
  {
    id: 'd1000000-0000-0000-0000-000000000001',
    code: 'DIV-SPD',
    name: 'Spoke Division',
    uom: 'PCS',
    color: '#06b6d4',
  },
  {
    id: '83ecd746-1cc9-4849-bec4-d00bcc3ceeec',
    code: 'DIV-PWI',
    name: 'Main Division E-51',
    uom: 'KG / Coils',
    color: '#8b5cf6',
  },
  {
    id: '0653339b-94d0-4cc5-b880-e07908b2015f',
    code: 'DIV-NB',
    name: 'NB Division',
    uom: 'Bags / PCS',
    color: '#f59e0b',
  },
];

// Helper to deduce expected UOM from division code or name
const getDivisionUom = (divCodeOrName?: string): string => {
  const s = (divCodeOrName || '').toLowerCase();
  if (s.includes('spd') || s.includes('spoke') || s.includes('سپوک')) {
    return 'PCS';
  }
  if (s.includes('ccd') || s.includes('cable') || s.includes('کیبل')) {
    return 'MTR / KG';
  }
  if (s.includes('pwi') || s.includes('main') || s.includes('مین')) {
    return 'KG / Coils';
  }
  if (s.includes('nb') || s.includes('این بی') || s.includes('baloch') || s.includes('بلوچ')) {
    return 'Bags / PCS';
  }
  return 'Units';
};

// Date range helper
const getMonthsBackRange = (months: number) => {
  const end = dayjs().endOf('month');
  const start = dayjs().subtract(months - 1, 'month').startOf('month');
  return {
    dateFrom: start.format('YYYY-MM-DD'),
    dateTo: end.format('YYYY-MM-DD'),
    startDate: start.format('YYYY-MM-DD'),
    endDate: end.format('YYYY-MM-DD'),
  };
};

const AiAssistantPage: React.FC = () => {
  const isDark = useThemeStore((state) => state.draft.mode === 'dark');

  const [divisionsList, setDivisionsList] = useState<DivisionMeta[]>(DEFAULT_DIVISIONS);
  // Canonical division code: 'DIV-CCD', 'DIV-SPD', 'DIV-PWI', 'DIV-NB', or 'ALL'
  const [selectedDivisionCode, setSelectedDivisionCode] = useState<string>('DIV-CCD');

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem('pwi_erp_ai_chat');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch real active divisions from API
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res: any = await apiService.get('/divisions', { limit: 50 });
        const list = res?.data || (Array.isArray(res) ? res : []);
        if (isMounted && list.length > 0) {
          // Keep only active manufacturing divisions
          const activeList = list.filter((d: any) => d.status === 'ACTIVE' || !d.status);
          const merged: DivisionMeta[] = [
            DEFAULT_DIVISIONS[0], // ALL
            ...activeList.map((d: any) => {
              const code = d.divisionCode || d.code || 'DIV';
              const uomStr = getDivisionUom(code || d.name);
              const existing = DEFAULT_DIVISIONS.find((x) => x.code === code || x.id === d.id);
              return {
                id: d.id,
                code: code,
                name: d.name || 'Division',
                uom: uomStr,
                color: existing?.color || '#3b82f6',
              };
            }),
          ];
          setDivisionsList(merged);
        }
      } catch {
        // Fallback to DEFAULT_DIVISIONS
      }
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem('pwi_erp_ai_chat', JSON.stringify(messages));
    } catch {}
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const activeDivisionMeta = useMemo(() => {
    return divisionsList.find((d) => d.code === selectedDivisionCode) || DEFAULT_DIVISIONS[1];
  }, [divisionsList, selectedDivisionCode]);

  // Context-sensitive suggestions for active division in 100% clean English
  const currentSuggestions = useMemo(() => {
    if (activeDivisionMeta.code === 'DIV-CCD') {
      return [
        {
          label: '⚙️ Machine-wise Production, Target & Daily Average',
          subtitle: 'Output vs scheduled target and daily run average for FT-01, FT-02, FT-04, etc.',
          query: 'Show Control Cable division machine-wise production, target and average report',
        },
        {
          label: '📊 3-Month Production & Dispatch Trend',
          subtitle: 'Multi-period monthly production volume vs customer dispatches',
          query: 'Show Control Cable division monthly production trend last 3 months',
        },
        {
          label: '📦 Product-wise Output Breakdown (MTR & KG)',
          subtitle: 'Flat strip, outer casing, inner wire production breakdown',
          query: 'Show Control Cable division product wise production in KG and meters',
        },
        {
          label: '⚠️ Machine Downtime & Operational Efficiency',
          subtitle: 'Detailed breakdown of downtime hours and performance loss',
          query: 'Show machine downtime for Control Cable division',
        },
      ];
    }

    if (activeDivisionMeta.code === 'DIV-SPD') {
      return [
        {
          label: '⚙️ Machine-wise Production & Output in PCS',
          subtitle: 'Spoke & nipple machine production vs target and daily average',
          query: 'Show Spoke division machine-wise production, target and average report in PCS',
        },
        {
          label: '📊 3-Month Production Trend',
          subtitle: 'Monthly output trend and scheduled target achievement rate',
          query: 'Show Spoke division monthly production trend last 3 months',
        },
        {
          label: '🚲 Spoke & Nipple Product Summary',
          subtitle: 'Output categorized by spoke size and wire gauge specifications',
          query: 'Show Spoke division product wise summary in PCS',
        },
        {
          label: '⚠️ Machine Downtime & Tooling Status',
          subtitle: 'Heading die life, cutting blade, and maintenance status',
          query: 'Show machine downtime for Spoke division',
        },
      ];
    }

    if (activeDivisionMeta.code !== 'ALL') {
      return [
        {
          label: `⚙️ ${activeDivisionMeta.name}: Machine-wise Production & Average`,
          subtitle: `Actual output vs targets and daily averages in ${activeDivisionMeta.uom}`,
          query: `Show ${activeDivisionMeta.name} machine-wise production, target and average report`,
        },
        {
          label: `📊 ${activeDivisionMeta.name}: 3-Month Trend`,
          subtitle: `Visual time-series production vs target graphs`,
          query: `Show ${activeDivisionMeta.name} monthly production trend last 3 months`,
        },
        {
          label: `📦 ${activeDivisionMeta.name}: Product-wise Volume`,
          subtitle: `Manufactured items breakdown and volume ranking`,
          query: `Show ${activeDivisionMeta.name} product wise production report`,
        },
        {
          label: `🚚 Customer-wise Dispatch Report`,
          subtitle: `Customer orders fulfillment and dispatch metrics`,
          query: `Show customer wise dispatch report this month`,
        },
      ];
    }

    // Default suggestions when ALL divisions is selected
    return [
      {
        label: '🏢 Multi-Division Production & UOM Comparison',
        subtitle: 'Distinct UOM breakdown across all plants (PCS, KG, MTR, Bags)',
        query: 'Show division wise production and units comparison for all divisions',
      },
      {
        label: '📊 3-Month Production vs Dispatch Trend',
        subtitle: 'Executive overview of manufacturing throughput and dispatches',
        query: 'Show production and dispatch trend last 3 months',
      },
      {
        label: '🚚 Customer-wise Dispatch & Volume Share',
        subtitle: 'Top customers ranked by dispatch packages, units, and weight',
        query: 'Show customer wise dispatch this month',
      },
      {
        label: '⚙️ Enterprise Machine Performance Overview',
        subtitle: 'High-level review of active machinery across all plants',
        query: 'Show machine wise production and downtime this month',
      },
    ];
  }, [activeDivisionMeta]);

  const handleClearChat = () => {
    setMessages([]);
    try { sessionStorage.removeItem('pwi_erp_ai_chat'); } catch {}
    message.info('Chat history cleared');
  };

  const handleCopy = (msg: ChatMessage) => {
    let copyContent = msg.text;
    if (msg.tableData) {
      copyContent += '\n' + msg.tableData.rows.map((r) => JSON.stringify(r)).join('\n');
    }
    navigator.clipboard.writeText(copyContent);
    setCopiedId(msg.id);
    message.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // AI QUERY ROUTER (STRICT DIVISION ISOLATION & 100% ENGLISH)
  // ══════════════════════════════════════════════════════════════════════════
  const processUserQuery = async (query: string, activeCode: string): Promise<QueryResult> => {
    const q = query.toLowerCase().trim();

    // 1. Determine Target Division
    // RULE: If activeCode is a specific division, IT IS 100% LOCKED to that division!
    // Spoke division or other plants will NEVER be returned or shown when DIV-CCD is selected!
    let targetDivision: DivisionMeta = divisionsList[0]; // fallback ALL

    if (activeCode && activeCode !== 'ALL') {
      targetDivision = divisionsList.find((d) => d.code === activeCode) || DEFAULT_DIVISIONS[1];
    } else {
      // Only when toolbar is set to ALL do we check query keywords for a specific plant
      if (q.includes('cable') || q.includes('کیبل') || q.includes('div-ccd') || q.includes('کنٹرول')) {
        targetDivision = divisionsList.find((d) => d.code === 'DIV-CCD') || DEFAULT_DIVISIONS[1];
      } else if (q.includes('spoke') || q.includes('سپوک') || q.includes('div-spd')) {
        targetDivision = divisionsList.find((d) => d.code === 'DIV-SPD') || DEFAULT_DIVISIONS[2];
      } else if (q.includes('main') || q.includes('مین') || q.includes('e-51') || q.includes('div-pwi')) {
        targetDivision = divisionsList.find((d) => d.code === 'DIV-PWI') || DEFAULT_DIVISIONS[3];
      } else if (q.includes('nb') || q.includes('این بی') || q.includes('baloch') || q.includes('بلوچ')) {
        targetDivision = divisionsList.find((d) => d.code === 'DIV-NB') || DEFAULT_DIVISIONS[4];
      }
    }

    const isSpecificDivision = targetDivision.code !== 'ALL';

    // ── INTENT A: SPECIFIC DIVISION MACHINE-WISE PRODUCTION, TARGET & AVERAGE REPORT ──
    // Whenever a specific division is active, generate the detailed Machine-wise Report for THAT DIVISION ONLY!
    if (isSpecificDivision) {
      try {
        const res: any = await apiService.get('/production/entries', { limit: 200 });
        const allEntries = Array.isArray(res) ? res : res?.data || res?.items || [];

        // STRICT FILTER: Match ONLY records belonging to targetDivision.code
        const entries = allEntries.filter((e: any) => {
          const eCode = e.division?.divisionCode || e.divisionCode || '';
          const eId = e.divisionId || e.division?.id || '';
          const mNo = (e.machine?.machineCode || e.machineNo || '').toUpperCase();

          if (targetDivision.code === 'DIV-CCD') {
            // Include Control Cable Division, EXCLUDE Spoke Division machines like SPK- or ST-01 from Spoke
            if (eCode === 'DIV-SPD' || eId.includes('0001')) return false;
            return (
              eCode === 'DIV-CCD' ||
              eId.includes('0002') ||
              mNo.startsWith('FT-') ||
              mNo.startsWith('FL-') ||
              mNo.startsWith('PV-') ||
              mNo.startsWith('CPK-') ||
              mNo.startsWith('SR-')
            );
          }

          if (targetDivision.code === 'DIV-SPD') {
            if (eCode === 'DIV-CCD' || eId.includes('0002')) return false;
            return (
              eCode === 'DIV-SPD' ||
              eId.includes('0001') ||
              mNo.startsWith('SPK-') ||
              mNo.startsWith('ST-') ||
              mNo.startsWith('NP-')
            );
          }

          if (targetDivision.code === 'DIV-PWI') {
            return eCode === 'DIV-PWI' || eId.includes('83ecd746');
          }

          if (targetDivision.code === 'DIV-NB') {
            return eCode === 'DIV-NB' || eId.includes('0653339b');
          }

          return eCode === targetDivision.code || eId === targetDivision.id;
        });

        // Group by machine
        const machineMap: Record<string, {
          machine: string;
          items: Set<string>;
          totalProduction: number;
          totalTarget: number;
          totalDowntime: number;
          dates: Set<string>;
          entriesCount: number;
        }> = {};

        entries.forEach((e: any) => {
          const mCode = e.machine?.machineCode || e.machineNo || 'UNKNOWN';
          const pName = e.item?.name || e.item?.itemCode || e.itemName || 'Standard Process';
          const dStr = dayjs(e.entryDate || e.createdAt).format('YYYY-MM-DD');

          if (!machineMap[mCode]) {
            machineMap[mCode] = {
              machine: mCode,
              items: new Set(),
              totalProduction: 0,
              totalTarget: 0,
              totalDowntime: 0,
              dates: new Set(),
              entriesCount: 0,
            };
          }
          machineMap[mCode].items.add(pName);
          machineMap[mCode].totalProduction += Number(e.actualQuantity ?? e.producedQty ?? 0);
          machineMap[mCode].totalTarget += Number(e.targetQuantity ?? 0);
          machineMap[mCode].totalDowntime += Number(e.downtimeHours ?? 0);
          machineMap[mCode].dates.add(dStr);
          machineMap[mCode].entriesCount += 1;
        });

        const rows = Object.values(machineMap)
          .map((m) => {
            const daysCount = m.dates.size || 1;
            const avgDaily = m.totalProduction / daysCount;
            const eff = m.totalTarget > 0 ? Math.round((m.totalProduction / m.totalTarget) * 100) : 0;
            return {
              machine: m.machine,
              itemsList: Array.from(m.items).slice(0, 2).join(', ') || 'Standard Process',
              totalProduction: Math.round(m.totalProduction * 100) / 100,
              totalTarget: Math.round(m.totalTarget * 100) / 100,
              avgDaily: Math.round(avgDaily * 10) / 10,
              efficiency: eff,
              downtime: parseFloat(m.totalDowntime.toFixed(1)),
              activeDays: daysCount,
              entriesCount: m.entriesCount,
            };
          })
          .sort((a, b) => b.totalProduction - a.totalProduction);

        if (rows.length > 0) {
          const totalProd = rows.reduce((s, r) => s + r.totalProduction, 0);
          const totalTarget = rows.reduce((s, r) => s + r.totalTarget, 0);
          const overallEff = totalTarget > 0 ? Math.round((totalProd / totalTarget) * 100) : 0;
          const overallDailyAvg = Math.round((totalProd / (rows.reduce((s, r) => s + r.activeDays, 0) || 1)) * 10) / 10;

          const chartData = rows.slice(0, 10).map((r) => ({
            name: r.machine,
            Production: r.totalProduction,
            Target: r.totalTarget,
            Average: r.avgDaily,
          }));

          return {
            text: `⚙️ **${targetDivision.name} (${targetDivision.code}) — Machine-wise Production & Target Performance Report:**\n\n` +
              `• **Division Scope:** ${targetDivision.name} (${targetDivision.code})\n` +
              `• **Unit of Measure (UOM):** ${targetDivision.uom}\n` +
              `• **Active Operational Machines:** ${rows.length} Machines\n` +
              `• **Total Actual Output:** ${totalProd.toLocaleString()} ${targetDivision.uom}\n` +
              `• **Total Scheduled Target:** ${totalTarget.toLocaleString()} ${targetDivision.uom}\n` +
              `• **Overall Target Efficiency:** ${overallEff}%\n` +
              `• **Average Daily Output per Machine:** ${overallDailyAvg.toLocaleString()} ${targetDivision.uom}/day`,
            divisionScope: targetDivision.code,
            chartData: {
              type: 'bar',
              data: chartData,
              xKey: 'name',
              title: `${targetDivision.name} — Machine Performance: Production vs Target vs Average (${targetDivision.uom})`,
              dataKeys: [
                { key: 'Production', color: '#3b82f6', name: `Production (${targetDivision.uom})` },
                { key: 'Target', color: '#10b981', name: `Target (${targetDivision.uom})` },
                { key: 'Average', color: '#f59e0b', name: `Daily Average (${targetDivision.uom})` },
              ],
            },
            tableData: {
              columns: [
                {
                  title: 'Machine Code',
                  dataIndex: 'machine',
                  key: 'machine',
                  render: (v: string) => (
                    <strong style={{ color: isDark ? '#93c5fd' : '#1d4ed8', fontSize: 13 }}>
                      {v}
                    </strong>
                  ),
                },
                {
                  title: 'Products / Process',
                  dataIndex: 'itemsList',
                  key: 'itemsList',
                  render: (v: string) => (
                    <span style={{ fontSize: 12, color: isDark ? '#cbd5e1' : '#475569' }}>
                      {v}
                    </span>
                  ),
                },
                {
                  title: `Target (${targetDivision.uom})`,
                  dataIndex: 'totalTarget',
                  key: 'totalTarget',
                  render: (v: number) => (
                    <span style={{ color: '#10b981', fontWeight: 600 }}>
                      {v.toLocaleString()}
                    </span>
                  ),
                },
                {
                  title: `Actual Output (${targetDivision.uom})`,
                  dataIndex: 'totalProduction',
                  key: 'totalProduction',
                  render: (v: number) => (
                    <span style={{ color: '#3b82f6', fontWeight: 700, fontSize: 13 }}>
                      {v.toLocaleString()}
                    </span>
                  ),
                },
                {
                  title: 'Daily Average',
                  dataIndex: 'avgDaily',
                  key: 'avgDaily',
                  render: (v: number) => (
                    <Tag color="gold" style={{ fontWeight: 600 }}>
                      {v.toLocaleString()} /day
                    </Tag>
                  ),
                },
                {
                  title: 'Efficiency (%)',
                  dataIndex: 'efficiency',
                  key: 'efficiency',
                  render: (v: number) => (
                    <Tag color={v >= 90 ? 'green' : v >= 75 ? 'orange' : 'red'}>
                      {v}%
                    </Tag>
                  ),
                },
                {
                  title: 'Downtime (hrs)',
                  dataIndex: 'downtime',
                  key: 'downtime',
                  render: (v: number) => (
                    <Tag color={v > 4 ? 'volcano' : 'default'}>
                      {v} hrs
                    </Tag>
                  ),
                },
                {
                  title: 'Active Operating Days',
                  dataIndex: 'activeDays',
                  key: 'activeDays',
                  render: (v: number) => <span>{v} days</span>,
                },
              ],
              rows,
            },
          };
        }
      } catch {
        return { text: `Unable to retrieve machine data for ${targetDivision.name}.` };
      }
    }

    // ── INTENT B: ALL DIVISIONS MULTI-UNIT COMPARISON ───────────────────────
    // ONLY executed when toolbar filter is explicitly set to ALL
    if (!isSpecificDivision) {
      try {
        const { dateFrom, dateTo } = getMonthsBackRange(1);
        const res: any = await apiService.get('/production/entries', { dateFrom, dateTo, limit: 200 });
        const entries = Array.isArray(res) ? res : res?.data || res?.items || [];

        const divMap: Record<string, {
          name: string;
          code: string;
          uom: string;
          production: number;
          target: number;
          downtime: number;
          machines: Set<string>;
          entriesCount: number;
        }> = {};

        entries.forEach((e: any) => {
          const divCode = e.division?.divisionCode || e.divisionCode || 'OTHER';
          const divName = e.division?.name || divCode;
          const uomInfo = getDivisionUom(divCode);

          if (!divMap[divCode]) {
            divMap[divCode] = {
              name: divName,
              code: divCode,
              uom: uomInfo,
              production: 0,
              target: 0,
              downtime: 0,
              machines: new Set<string>(),
              entriesCount: 0,
            };
          }
          divMap[divCode].production += Number(e.actualQuantity ?? e.producedQty ?? 0);
          divMap[divCode].target += Number(e.targetQuantity ?? 0);
          divMap[divCode].downtime += Number(e.downtimeHours ?? 0);
          divMap[divCode].entriesCount += 1;
          const m = e.machine?.machineCode || e.machineNo;
          if (m) divMap[divCode].machines.add(m);
        });

        const activeRows = Object.values(divMap).map((d) => {
          const eff = d.target > 0 ? Math.round((d.production / d.target) * 100) : 0;
          return {
            division: d.name,
            code: d.code,
            uom: d.uom,
            production: Math.round(d.production * 100) / 100,
            target: Math.round(d.target * 100) / 100,
            efficiency: eff,
            downtime: parseFloat(d.downtime.toFixed(1)),
            activeMachines: d.machines.size,
            entriesCount: d.entriesCount,
          };
        });

        const chartData = activeRows.map((r) => ({
          name: r.code,
          'Efficiency %': r.efficiency,
          'Downtime (hrs)': r.downtime,
        }));

        const summaryText = activeRows
          .map((r) => `• **${r.division} (${r.code}):** ${r.production.toLocaleString()} ${r.uom} | Target: ${r.target.toLocaleString()} | Efficiency: ${r.efficiency}% | Downtime: ${r.downtime}h`)
          .join('\n');

        return {
          text: `🏢 **Enterprise Division-wise Production & Separate Units Breakdown:**\n\n` +
            `Units of measurement vary across divisions (PCS, MTR, KG, Bags). Each operational plant is reported independently below:\n\n` +
            summaryText +
            `\n\n💡 *To inspect individual machine targets and daily averages for a specific plant, select that division from the top filter toolbar.*`,
          divisionScope: 'ALL',
          chartData: {
            type: 'bar',
            data: chartData,
            xKey: 'name',
            title: 'Division Performance Comparison (Efficiency % vs Downtime hrs)',
            dataKeys: [
              { key: 'Efficiency %', color: '#10b981', name: 'Efficiency (%)' },
              { key: 'Downtime (hrs)', color: '#ef4444', name: 'Downtime (hrs)' },
            ],
          },
          tableData: {
            columns: [
              {
                title: 'Division',
                dataIndex: 'division',
                key: 'division',
                render: (v: string, r: any) => (
                  <div>
                    <strong style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>{v}</strong>
                    <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' }}>{r.code}</div>
                  </div>
                ),
              },
              {
                title: 'Unit of Measure (UOM)',
                dataIndex: 'uom',
                key: 'uom',
                render: (u: string, r: any) => (
                  <Tag color={r.code === 'DIV-SPD' ? 'cyan' : r.code === 'DIV-CCD' ? 'green' : 'orange'}>
                    {u}
                  </Tag>
                ),
              },
              {
                title: 'Actual Output',
                dataIndex: 'production',
                key: 'production',
                render: (v: number, r: any) => (
                  <span style={{ fontWeight: 700, color: '#3b82f6' }}>
                    {v.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400 }}>{r.uom}</span>
                  </span>
                ),
              },
              {
                title: 'Scheduled Target',
                dataIndex: 'target',
                key: 'target',
                render: (v: number, r: any) => (
                  <span style={{ color: isDark ? '#cbd5e1' : '#475569' }}>
                    {v.toLocaleString()} {r.uom}
                  </span>
                ),
              },
              {
                title: 'Efficiency (%)',
                dataIndex: 'efficiency',
                key: 'efficiency',
                render: (v: number) => (
                  <Tag color={v >= 90 ? 'green' : v >= 75 ? 'orange' : 'red'}>{v}%</Tag>
                ),
              },
              {
                title: 'Downtime (hrs)',
                dataIndex: 'downtime',
                key: 'downtime',
                render: (v: number) => (
                  <Tag color={v > 5 ? 'volcano' : 'default'}>{v} hrs</Tag>
                ),
              },
              {
                title: 'Active Machines',
                dataIndex: 'activeMachines',
                key: 'activeMachines',
                render: (v: number) => <span>{v} machines</span>,
              },
            ],
            rows: activeRows,
          },
        };
      } catch {
        return { text: 'Unable to fetch division comparison data.' };
      }
    }

    // Fallback response
    return {
      text: `Welcome to PWI AI Assistant. Current plant scope: **${targetDivision.name}** (${targetDivision.uom}).\n\nAsk any question regarding machine performance, targets, daily averages, or downtime.`,
    };
  };

  const handleSend = async (customText?: string, overrideCode?: string) => {
    const query = (customText || inputText).trim();
    if (!query || loading) return;

    const effectiveCode = overrideCode || selectedDivisionCode;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: dayjs().format('hh:mm A'),
      divisionScope: effectiveCode,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputText('');
    setLoading(true);

    try {
      await new Promise((r) => setTimeout(r, 350));
      // Process strictly with effective division code
      const aiReply = await processUserQuery(query, effectiveCode);

      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: 'assistant',
        text: aiReply.text,
        timestamp: dayjs().format('hh:mm A'),
        divisionScope: aiReply.divisionScope || effectiveCode,
        tableData: aiReply.tableData,
        chartData: aiReply.chartData,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          text: 'Unable to retrieve live ERP data. Please check connection and retry.',
          timestamp: dayjs().format('hh:mm A'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Switch division handler: updates code AND automatically runs report for that division
  const handleDivisionSwitch = (code: string) => {
    setSelectedDivisionCode(code);
    const meta = divisionsList.find((d) => d.code === code) || DEFAULT_DIVISIONS[1];
    message.success(`Plant filter set to: ${meta.name}`);

    // Immediately generate machine report for this division
    const autoQuery = code === 'ALL'
      ? 'Show division wise production and units comparison for all divisions'
      : `Show ${meta.name} machine-wise production, target and average report`;

    handleSend(autoQuery, code);
  };

  // ── Render Chart with Theme Adaptive Styles ────────────────────────────────
  const renderChart = (chartData: NonNullable<ChatMessage['chartData']>) => {
    const { type, data, dataKeys, xKey, title } = chartData;

    const gridStroke = isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0';
    const axisColor = isDark ? '#94a3b8' : '#64748b';
    const tooltipBg = isDark ? '#0f172a' : '#ffffff';
    const tooltipBorder = isDark ? '#334155' : '#cbd5e1';

    if (type === 'pie') {
      return (
        <div style={{ marginTop: 14 }}>
          {title && (
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: isDark ? '#f8fafc' : '#1e293b' }}>
              {title}
            </div>
          )}
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                outerRadius={95}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                labelLine={false}
              >
                {data.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.fill || CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <ReTooltip
                contentStyle={{ background: tooltipBg, borderColor: tooltipBorder, borderRadius: 8, color: isDark ? '#fff' : '#000' }}
                formatter={(val: any) => Number(val).toLocaleString()}
              />
              <Legend wrapperStyle={{ color: axisColor }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (type === 'line') {
      return (
        <div style={{ marginTop: 14 }}>
          {title && (
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: isDark ? '#f8fafc' : '#1e293b' }}>
              {title}
            </div>
          )}
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey={xKey} stroke={axisColor} tick={{ fontSize: 11, fill: axisColor }} />
              <YAxis stroke={axisColor} tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(v) => Number(v).toLocaleString()} />
              <ReTooltip
                contentStyle={{ background: tooltipBg, borderColor: tooltipBorder, borderRadius: 8, color: isDark ? '#fff' : '#000' }}
                formatter={(val: any) => Number(val).toLocaleString()}
              />
              <Legend wrapperStyle={{ color: axisColor }} />
              {dataKeys.map((dk) => (
                <Line key={dk.key} type="monotone" dataKey={dk.key} name={dk.name} stroke={dk.color} strokeWidth={2.5} dot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // Default Bar Chart
    return (
      <div style={{ marginTop: 14 }}>
        {title && (
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: isDark ? '#f8fafc' : '#1e293b' }}>
            {title}
          </div>
        )}
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={xKey} stroke={axisColor} tick={{ fontSize: 11, fill: axisColor }} />
            <YAxis stroke={axisColor} tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(v) => Number(v).toLocaleString()} />
            <ReTooltip
              contentStyle={{ background: tooltipBg, borderColor: tooltipBorder, borderRadius: 8, color: isDark ? '#fff' : '#000' }}
              formatter={(val: any) => Number(val).toLocaleString()}
            />
            <Legend wrapperStyle={{ color: axisColor }} />
            {dataKeys.map((dk) => (
              <Bar key={dk.key} dataKey={dk.key} name={dk.name} fill={dk.color} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 70px)',
        background: isDark ? '#0b1120' : '#f8fafc',
        color: isDark ? '#f8fafc' : '#0f172a',
        overflow: 'hidden',
      }}
    >
      {/* ── Top Header Banner & Division Selector ──────────────────────── */}
      <div
        style={{
          background: isDark
            ? 'linear-gradient(90deg, #1e3a8a 0%, #0f172a 100%)'
            : 'linear-gradient(90deg, #1d4ed8 0%, #1e40af 100%)',
          color: '#ffffff',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.25)',
          zIndex: 10,
          borderBottom: isDark ? '1px solid #1e293b' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            }}
          >
            <RobotOutlined style={{ color: '#ffffff' }} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '0.3px', lineHeight: 1.2 }}>
              PWI AI Assistant & Analytics
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.85)' }}>
              Executive Manufacturing, Machine Performance & Customer Intelligence
            </div>
          </div>
        </div>

        {/* Division Selector Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255, 255, 255, 0.12)', padding: '4px 10px', borderRadius: 8 }}>
            <FilterOutlined style={{ fontSize: 13, color: '#93c5fd' }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Division Filter:</span>
            <Select
              size="small"
              value={selectedDivisionCode}
              onChange={(val) => handleDivisionSwitch(val)}
              style={{ width: 230 }}
              options={divisionsList.map((d) => ({
                value: d.code,
                label: `${d.name} (${d.uom})`,
              }))}
            />
          </div>

          {messages.length > 0 && (
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              onClick={handleClearChat}
              style={{
                color: '#ffffff',
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Clear Chat
            </Button>
          )}
        </div>
      </div>

      {/* ── Division Quick Chips Bar ────────────────────────────────────────── */}
      <div
        style={{
          background: isDark ? '#111827' : '#ffffff',
          borderBottom: isDark ? '1px solid #1f2937' : '1px solid #e2e8f0',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          overflowX: 'auto',
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ApartmentOutlined /> Divisions:
        </span>
        {divisionsList.map((div) => {
          const isSelected = selectedDivisionCode === div.code;
          return (
            <button
              key={div.code}
              onClick={() => handleDivisionSwitch(div.code)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 16,
                fontSize: 12,
                fontWeight: isSelected ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                border: isSelected
                  ? '1.5px solid #3b82f6'
                  : isDark ? '1px solid #374151' : '1px solid #cbd5e1',
                background: isSelected
                  ? (isDark ? '#1e3a8a' : '#eff6ff')
                  : (isDark ? '#1f2937' : '#f8fafc'),
                color: isSelected
                  ? (isDark ? '#93c5fd' : '#1d4ed8')
                  : (isDark ? '#d1d5db' : '#475569'),
              }}
            >
              <span>{div.name}</span>
              <span
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 8,
                  background: isSelected
                    ? (isDark ? '#2563eb' : '#bfdbfe')
                    : (isDark ? '#374151' : '#e2e8f0'),
                  color: isSelected
                    ? '#ffffff'
                    : (isDark ? '#9ca3af' : '#64748b'),
                }}
              >
                {div.uom}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Chat Messages Body ───────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: 960 }}>
          {/* Welcome Screen */}
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 10px 10px', animation: 'fadeIn 0.3s ease' }}>
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 22,
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontSize: 38,
                  margin: '0 auto 16px',
                  boxShadow: '0 12px 28px rgba(37, 99, 235, 0.35)',
                }}
              >
                <RobotOutlined />
              </div>

              <h2 style={{ fontSize: 24, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', marginBottom: 6 }}>
                PWI AI Assistant & Analytics
              </h2>
              <p
                style={{
                  fontSize: 14,
                  color: isDark ? '#94a3b8' : '#475569',
                  maxWidth: 680,
                  margin: '0 auto 8px',
                  lineHeight: 1.6,
                }}
              >
                Active Plant Scope: <strong>{activeDivisionMeta.name}</strong> ({activeDivisionMeta.uom})
                <br />
                Query machine-wise output, scheduled targets, daily averages, downtime, and time-series comparisons.
              </p>

              {/* Active Division Banner */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 14px',
                  borderRadius: 20,
                  background: isDark ? '#1e293b' : '#eff6ff',
                  border: isDark ? '1px solid #334155' : '1px solid #bfdbfe',
                  color: isDark ? '#93c5fd' : '#1d4ed8',
                  fontSize: 12,
                  fontWeight: 600,
                  margin: '10px auto 24px',
                }}
              >
                <Badge status="processing" color="#3b82f6" />
                Active Scope: {activeDivisionMeta.name} • Unit: {activeDivisionMeta.uom}
              </div>

              {/* Context-sensitive suggestions grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 10,
                  maxWidth: 860,
                  margin: '0 auto',
                }}
              >
                {currentSuggestions.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(item.query)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: isDark ? '#1e293b' : '#ffffff',
                      border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                      color: isDark ? '#f8fafc' : '#1e293b',
                      fontSize: 13,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.18s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isDark ? '#273549' : '#eff6ff';
                      e.currentTarget.style.borderColor = '#3b82f6';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isDark ? '#1e293b' : '#ffffff';
                      e.currentTarget.style.borderColor = isDark ? '#334155' : '#e2e8f0';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ fontWeight: 700, color: isDark ? '#93c5fd' : '#1d4ed8' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' }}>
                      {item.subtitle}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Message Thread */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                    width: '100%',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      maxWidth: msg.sender === 'user' ? '80%' : '98%',
                      alignItems: 'flex-start',
                      flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row',
                      width: msg.sender === 'assistant' ? '100%' : undefined,
                    }}
                  >
                    {msg.sender === 'assistant' && (
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          fontSize: 18,
                          flexShrink: 0,
                          marginTop: 2,
                          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                        }}
                      >
                        <RobotOutlined />
                      </div>
                    )}

                    <div
                      style={{
                        background: msg.sender === 'user'
                          ? '#2563eb'
                          : (isDark ? '#1e293b' : '#ffffff'),
                        color: msg.sender === 'user'
                          ? '#ffffff'
                          : (isDark ? '#f8fafc' : '#0f172a'),
                        padding: '14px 18px',
                        borderRadius: msg.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        fontSize: 14,
                        lineHeight: 1.6,
                        boxShadow: isDark
                          ? '0 4px 14px rgba(0, 0, 0, 0.4)'
                          : '0 2px 10px rgba(0, 0, 0, 0.06)',
                        border: msg.sender === 'user'
                          ? 'none'
                          : (isDark ? '1px solid #334155' : '1px solid #e2e8f0'),
                        wordBreak: 'break-word',
                        flex: msg.sender === 'assistant' ? 1 : undefined,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ whiteSpace: 'pre-line', color: msg.sender === 'user' ? '#ffffff' : (isDark ? '#f8fafc' : '#0f172a') }}>
                        {msg.text}
                      </div>

                      {/* Chart */}
                      {msg.chartData && renderChart(msg.chartData)}

                      {/* Table */}
                      {msg.tableData && (
                        <div
                          style={{
                            marginTop: 14,
                            borderRadius: 8,
                            overflow: 'hidden',
                            border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                            background: isDark ? '#0f172a' : '#ffffff',
                          }}
                        >
                          <Table
                            size="small"
                            pagination={{ pageSize: 12, size: 'small', hideOnSinglePage: true }}
                            dataSource={msg.tableData.rows}
                            rowKey={(r, i) => r.id || r.machine || r.code || String(i)}
                            columns={msg.tableData.columns}
                            scroll={{ x: 'max-content' }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timestamp + copy actions */}
                  <div
                    style={{
                      fontSize: 11,
                      color: isDark ? '#94a3b8' : '#64748b',
                      marginTop: 4,
                      marginLeft: msg.sender === 'assistant' ? 46 : 0,
                      marginRight: msg.sender === 'user' ? 8 : 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>{msg.timestamp}</span>
                    {msg.sender === 'assistant' && (
                      <Tooltip title="Copy message">
                        <Button
                          type="text"
                          size="small"
                          icon={copiedId === msg.id ? <CheckOutlined style={{ color: '#10b981' }} /> : <CopyOutlined />}
                          onClick={() => handleCopy(msg)}
                          style={{ fontSize: 11, padding: '0 4px', height: 'auto', color: isDark ? '#94a3b8' : '#64748b' }}
                        />
                      </Tooltip>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginLeft: 4 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontSize: 18,
                    }}
                  >
                    <RobotOutlined />
                  </div>
                  <div
                    style={{
                      background: isDark ? '#1e293b' : '#ffffff',
                      padding: '12px 18px',
                      borderRadius: '16px 16px 16px 4px',
                      border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      color: isDark ? '#cbd5e1' : '#475569',
                      fontSize: 13,
                    }}
                  >
                    <Spin size="small" />
                    <span>Analyzing live ERP machine & production metrics for {activeDivisionMeta.name}...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Input Bar with Theme & Contrast Support ───────────────── */}
      <div
        style={{
          background: isDark ? '#0f172a' : '#ffffff',
          borderTop: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0',
          padding: '12px 20px 10px',
          boxShadow: isDark
            ? '0 -4px 14px rgba(0,0,0,0.4)'
            : '0 -2px 10px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: isDark ? '#1e293b' : '#f8fafc',
              border: isDark ? '1.5px solid #3b82f6' : '1.5px solid #bfdbfe',
              borderRadius: 24,
              padding: '4px 6px 4px 16px',
              transition: 'all 0.2s ease',
              boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
            }}
          >
            <Input
              variant="borderless"
              placeholder={`Enter query... (e.g., Show machine-wise production, targets and daily averages for ${activeDivisionMeta.name})`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              style={{
                fontSize: 14,
                color: isDark ? '#f8fafc' : '#0f172a',
              }}
              disabled={loading}
            />

            <Button
              type="primary"
              shape="circle"
              icon={<SendOutlined />}
              onClick={() => handleSend()}
              loading={loading}
              disabled={!inputText.trim()}
              style={{
                background: inputText.trim() ? '#2563eb' : (isDark ? '#334155' : '#cbd5e1'),
                borderColor: inputText.trim() ? '#2563eb' : (isDark ? '#334155' : '#cbd5e1'),
                width: 36,
                height: 36,
                flexShrink: 0,
                transition: 'all 0.2s ease',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 6,
              fontSize: 11,
              color: isDark ? '#94a3b8' : '#64748b',
            }}
          >
            <div>
              💡 <span>Active Plant Scope: <strong>{activeDivisionMeta.name}</strong> • Unit: <strong>{activeDivisionMeta.uom}</strong> • Live ERP Analytics</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Tooltip title="Helpful">
                <Button type="text" size="small" icon={<LikeOutlined />} style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 12 }} />
              </Tooltip>
              <Tooltip title="Not helpful">
                <Button type="text" size="small" icon={<DislikeOutlined />} style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 12 }} />
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiAssistantPage;
