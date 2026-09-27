import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Button,
  Input,
  Tag,
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
  SafetyCertificateOutlined,
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
import weekOfYear from 'dayjs/plugin/weekOfYear';
import {
  DivisionMeta,
  DepartmentMeta,
  KpiCardData,
  ReportChartData,
  AiColumn,
  ConversationContext,
  NormalizedReportResult,
} from './types';
import { parseNaturalLanguageQuery } from './nlQueryParser';
import { generateReportData, formatQty } from './reportGenerator';

// AI Assistant ERP reporting module
dayjs.extend(weekOfYear);

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  divisionScope?: string;
  departmentScope?: string;
  periodLabel?: string;
  reportTitle?: string;
  kpiCards?: KpiCardData[];
  chartData?: ReportChartData;
  tableData?: {
    columns: AiColumn[];
    rows: any[];
  };
  auditTrail?: {
    dataSource: string;
    filters: string[];
    period: string;
    timestamp: string;
    recordsExamined: number;
  };
  proposedAction?: {
    actionType: string;
    description: string;
    target: string;
    oldValue: any;
    newValue: any;
  };
  liked?: boolean;
  disliked?: boolean;
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export const DIVISION_DEPARTMENTS: Record<string, DepartmentMeta[]> = {
  'DIV-CCD': [
    { code: 'ALL', name: 'All Departments', shortName: 'All Depts' },
    { code: 'Flattening', name: 'Flattening Department', shortName: 'Flattening (FT)' },
    { code: 'Spiral', name: 'Spiral Department', shortName: 'Spiral (SP/SR)' },
    { code: 'PVC', name: 'PVC Coating Department', shortName: 'PVC (PV)' },
    { code: 'Packing', name: 'Packing Department', shortName: 'Packing (CPK)' },
  ],
  'DIV-SPD': [
    { code: 'ALL', name: 'All Departments', shortName: 'All Depts' },
    { code: 'Spoke', name: 'Spoke Heading & Threading', shortName: 'Spoke (SPK)' },
    { code: 'Straightener', name: 'Wire Straightening', shortName: 'Straightener (ST)' },
    { code: 'Swagging', name: 'Swagging Department', shortName: 'Swagging (SW)' },
    { code: 'Spoke Plating', name: 'Electroplating Department', shortName: 'Plating (BL/SPL)' },
    { code: 'Spoke Packing', name: 'Packing & Boxing', shortName: 'Packing (PKS)' },
  ],
  'DIV-PWI': [
    { code: 'ALL', name: 'All Departments', shortName: 'All Depts' },
    { code: 'Drawing', name: 'Wire Drawing Line', shortName: 'Drawing' },
    { code: 'Galvanizing', name: 'Hot Dip Galvanizing Line', shortName: 'Galvanizing' },
    { code: 'Annealing', name: 'Annealing Furnace', shortName: 'Annealing' },
    { code: 'Packing', name: 'Finished Coils Packaging', shortName: 'Packing' },
  ],
  'DIV-NB': [
    { code: 'ALL', name: 'All Departments', shortName: 'All Depts' },
    { code: 'Heading', name: 'Cold Heading Department', shortName: 'Heading' },
    { code: 'Threading', name: 'Roll Threading Department', shortName: 'Threading' },
    { code: 'Plating', name: 'Surface Finishing & Plating', shortName: 'Plating' },
    { code: 'Packing', name: 'Automated Bagging & Packing', shortName: 'Packing' },
  ],
};

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

const AiAssistantPage: React.FC = () => {
  const isDark = useThemeStore((state) => state.draft.mode === 'dark');

  const [divisionsList, setDivisionsList] = useState<DivisionMeta[]>(DEFAULT_DIVISIONS);
  const [selectedDivisionCode, setSelectedDivisionCode] = useState<string>('DIV-CCD');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');

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

  // Maintain conversation context for natural follow-up questions
  const conversationContextRef = useRef<ConversationContext>({
    lastDivisionCode: 'DIV-CCD',
    lastDepartmentCode: 'ALL',
    lastPeriod: { type: 'this_month', label: 'September 2026', startDate: '2026-09-01', endDate: '2026-09-30' },
    lastDimension: 'machine',
  });

  // Fetch real active divisions from API
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res: any = await apiService.get('/divisions', { limit: 50 });
        const list = res?.data || (Array.isArray(res) ? res : []);
        if (isMounted && list.length > 0) {
          const activeList = list.filter((d: any) => d.status === 'ACTIVE' || !d.status);
          const merged: DivisionMeta[] = [
            DEFAULT_DIVISIONS[0],
            ...activeList.map((d: any) => {
              const code = d.divisionCode || d.code || 'DIV';
              const existing = DEFAULT_DIVISIONS.find((x) => x.code === code || x.id === d.id);
              return {
                id: d.id,
                code: code,
                name: d.name || 'Division',
                uom: existing?.uom || 'Units',
                color: existing?.color || '#3b82f6',
              };
            }),
          ];
          setDivisionsList(merged);
        }
      } catch {}
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

  const activeDepartments = useMemo(() => {
    return DIVISION_DEPARTMENTS[selectedDivisionCode] || [];
  }, [selectedDivisionCode]);

  // Contextual smart suggestions
  const currentSuggestions = useMemo(() => {
    if (activeDivisionMeta.code === 'DIV-CCD') {
      if (selectedDepartment === 'Flattening') {
        return [
          {
            label: '👤 Flattening: Operator-wise Output & Targets',
            subtitle: 'Real operator performance across FT-01 to FT-05 lines',
            query: 'Show operator-wise production for Flattening department this month',
          },
          {
            label: '⚙️ Flattening: Sequential FT-01 to FT-05 Machine Report',
            subtitle: 'Target vs actual output, daily averages and efficiency',
            query: 'Show Flattening department machine-wise production, target and average report',
          },
          {
            label: '⚖️ Flattening: August vs September Comparison',
            subtitle: 'Month-over-month volume and machine variances',
            query: 'Compare August and September production for Flattening',
          },
          {
            label: '⚠️ Flattening: Machine Downtime & Tooling Changes',
            subtitle: 'Downtime logs and roller/component replacements',
            query: 'Show Flattening department machine downtime and maintenance',
          },
        ];
      }

      return [
        {
          label: '👤 Operator-wise Production for September',
          subtitle: 'Workforce output, scheduled targets, and efficiency rates',
          query: 'Show operator-wise production for September',
        },
        {
          label: '⚙️ Machine-wise Production & Natural Ordering',
          subtitle: 'FT-01 to FT-05, FL-01, SP-01 to SP-08 with Department Subtotals',
          query: 'Show Control Cable division machine-wise production, target and average report',
        },
        {
          label: '📊 Department-wise Target vs Actual Output',
          subtitle: 'Sectional comparison between Flattening, Spiral, PVC, Packing',
          query: 'Show department-wise target vs actual production',
        },
        {
          label: '⚖️ August vs September Production Comparison',
          subtitle: 'Detailed month-over-month machine variance analysis',
          query: 'Compare production between August and September',
        },
      ];
    }

    if (activeDivisionMeta.code === 'DIV-SPD') {
      return [
        {
          label: '👤 Spoke Division: Operator-wise Output in PCS',
          subtitle: 'Heading, Threading, and Straightener operator achievements',
          query: 'Show Spoke division operator-wise production this month',
        },
        {
          label: '⚙️ Spoke Division: Machine Performance in PCS',
          subtitle: 'ST-01, SPK-01 to SPK-08 machine output and targets',
          query: 'Show Spoke division machine-wise production, target and average report in PCS',
        },
        {
          label: '🚲 Spoke Product-wise Output Breakdown',
          subtitle: 'Production categorized by wire gauges and lengths',
          query: 'Show Spoke division product wise summary in PCS',
        },
        {
          label: '⚠️ Spoke Machine Downtime & Breakdown Tickets',
          subtitle: 'Header dies, cutting blades, and maintenance job cards',
          query: 'Show machine downtime for Spoke division',
        },
      ];
    }

    return [
      {
        label: '🏢 Multi-Division Performance & Separate Units',
        subtitle: 'Independent UOM breakdown (PCS, MTR, KG, Bags) across all plants',
        query: 'Show division wise production and units comparison for all divisions',
      },
      {
        label: '👤 Enterprise Operator-wise Output Ranking',
        subtitle: 'Production volume, running hours, and achievement rates',
        query: 'Show operator-wise production for this month',
      },
      {
        label: '🚚 Customer-wise Dispatch & Package Fulfillment',
        subtitle: 'Customer dispatches, verified units, and weights',
        query: 'Show customer-wise dispatch this month',
      },
      {
        label: '📊 6-Month Manufacturing Output Trend',
        subtitle: 'Chronological time-series performance graph',
        query: 'Show production trend for the last 6 months',
      },
    ];
  }, [activeDivisionMeta, selectedDepartment]);

  const handleClearChat = () => {
    setMessages([]);
    try { sessionStorage.removeItem('pwi_erp_ai_chat'); } catch {}
    message.info('Chat history cleared');
  };

  const handleCopy = (msg: ChatMessage) => {
    let copyContent = `${msg.reportTitle ? msg.reportTitle + '\n' : ''}${msg.text}`;
    if (msg.tableData) {
      copyContent += '\n\n' + msg.tableData.rows.map((r) => JSON.stringify(r)).join('\n');
    }
    navigator.clipboard.writeText(copyContent);
    setCopiedId(msg.id);
    message.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // NATURAL LANGUAGE QUERY ENGINE EXECUTION
  // ══════════════════════════════════════════════════════════════════════════
  const handleSend = async (customText?: string, overrideCode?: string, overrideDept?: string) => {
    const query = (customText || inputText).trim();
    if (!query || loading) return;

    const effectiveCode = overrideCode || selectedDivisionCode;
    const effectiveDept = overrideDept !== undefined ? overrideDept : selectedDepartment;

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
      // 1. Parse natural language intent with context preservation
      const intent = parseNaturalLanguageQuery(
        query,
        effectiveCode,
        effectiveDept,
        conversationContextRef.current,
      );

      // Handle safe write confirmation if user requested a data modification
      if (intent.isWriteRequest && intent.proposedChange) {
        const botMsg: ChatMessage = {
          id: `b-${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ **Action Request Detected:** "${intent.proposedChange.action}"\n\n` +
            `The AI Assistant is protected by **Executive Audit Guard**. Direct natural-language mutation requires explicit confirmation to prevent unauthorized database updates.`,
          timestamp: dayjs().format('hh:mm A'),
          divisionScope: effectiveCode,
          proposedAction: {
            actionType: intent.proposedChange.action,
            description: `Request to modify ${intent.proposedChange.entity}`,
            target: intent.proposedChange.target,
            oldValue: intent.proposedChange.oldValue ?? 'Current Value',
            newValue: intent.proposedChange.newValue ?? 'New Value',
          },
        };
        setMessages((prev) => [...prev, botMsg]);
        return;
      }

      // 2. Fetch live data and aggregate report
      const report: NormalizedReportResult = await generateReportData(
        intent,
        divisionsList,
        isDark,
      );

      // 3. Update conversation context for next follow-up turns
      conversationContextRef.current = {
        lastIntent: intent,
        lastDivisionCode: intent.divisionCode || effectiveCode,
        lastDepartmentCode: intent.departmentCode || effectiveDept,
        lastPeriod: intent.period,
        lastDimension: intent.dimension,
      };

      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: 'assistant',
        text: report.summaryText,
        timestamp: dayjs().format('hh:mm A'),
        divisionScope: report.divisionScope,
        departmentScope: report.departmentScope,
        periodLabel: report.periodLabel,
        reportTitle: report.title,
        kpiCards: report.kpiCards,
        chartData: report.chartData,
        tableData: report.tableData,
        auditTrail: report.auditTrail,
        proposedAction: report.proposedAction,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          text: 'Unable to retrieve live ERP production data at the moment. Please verify server connection and retry.',
          timestamp: dayjs().format('hh:mm A'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleDivisionSwitch = (code: string) => {
    setSelectedDivisionCode(code);
    setSelectedDepartment('ALL');
    const meta = divisionsList.find((d) => d.code === code) || DEFAULT_DIVISIONS[1];
    message.success(`Plant filter set to: ${meta.name}`);

    conversationContextRef.current.lastDivisionCode = code;
    conversationContextRef.current.lastDepartmentCode = 'ALL';

    const autoQuery = code === 'ALL'
      ? 'Show division wise production and units comparison for all divisions'
      : `Show ${meta.name} machine-wise production, target and average report`;

    handleSend(autoQuery, code, 'ALL');
  };

  const handleDepartmentSwitch = (deptCode: string) => {
    setSelectedDepartment(deptCode);
    const divMeta = divisionsList.find((d) => d.code === selectedDivisionCode) || DEFAULT_DIVISIONS[1];
    const deptMeta = activeDepartments.find((d) => d.code === deptCode);
    const deptLabel = deptMeta?.name || deptCode;
    message.success(`Department filter set to: ${deptLabel}`);

    conversationContextRef.current.lastDepartmentCode = deptCode;

    const autoQuery = deptCode === 'ALL'
      ? `Show ${divMeta.name} machine-wise production, target and average report`
      : `Show ${divMeta.name} ${deptLabel} machine-wise production, target and average report`;

    handleSend(autoQuery, selectedDivisionCode, deptCode);
  };

  // ── Render Chart with Theme Adaptive Styles ────────────────────────────────
  const renderChart = (chartData: ReportChartData) => {
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
                formatter={(val: any) => formatQty(val)}
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
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey={xKey} stroke={axisColor} tick={{ fontSize: 11, fill: axisColor }} />
              <YAxis stroke={axisColor} tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(v) => formatQty(v)} />
              <ReTooltip
                contentStyle={{ background: tooltipBg, borderColor: tooltipBorder, borderRadius: 8, color: isDark ? '#fff' : '#000' }}
                formatter={(val: any) => formatQty(val)}
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
            <YAxis stroke={axisColor} tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(v) => formatQty(v)} />
            <ReTooltip
              contentStyle={{ background: tooltipBg, borderColor: tooltipBorder, borderRadius: 8, color: isDark ? '#fff' : '#000' }}
              formatter={(val: any) => formatQty(val)}
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

        {/* Division & Department Selector Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255, 255, 255, 0.12)', padding: '4px 10px', borderRadius: 8 }}>
            <FilterOutlined style={{ fontSize: 13, color: '#93c5fd' }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Division:</span>
            <Select
              size="small"
              value={selectedDivisionCode}
              onChange={(val) => handleDivisionSwitch(val)}
              style={{ width: 220 }}
              options={divisionsList.map((d) => ({
                value: d.code,
                label: `${d.name} (${d.uom})`,
              }))}
            />
          </div>

          {selectedDivisionCode !== 'ALL' && activeDepartments.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255, 255, 255, 0.12)', padding: '4px 10px', borderRadius: 8 }}>
              <ApartmentOutlined style={{ fontSize: 13, color: '#93c5fd' }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Department:</span>
              <Select
                size="small"
                value={selectedDepartment}
                onChange={(val) => handleDepartmentSwitch(val)}
                style={{ width: 190 }}
                options={activeDepartments.map((d) => ({
                  value: d.code,
                  label: d.name,
                }))}
              />
            </div>
          )}

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

      {/* ── Department Quick Chips Bar ────────────────────────────────────────── */}
      {selectedDivisionCode !== 'ALL' && activeDepartments.length > 0 && (
        <div
          style={{
            background: isDark ? '#0f172a' : '#f8fafc',
            borderBottom: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0',
            padding: '6px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            overflowX: 'auto',
            fontSize: 12,
          }}
        >
          <span style={{ fontWeight: 700, color: isDark ? '#38bdf8' : '#0284c7', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
            <FilterOutlined /> Section / Dept:
          </span>
          {activeDepartments.map((dept) => {
            const isSelected = selectedDepartment === dept.code;
            return (
              <button
                key={dept.code}
                onClick={() => handleDepartmentSwitch(dept.code)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 12px',
                  borderRadius: 14,
                  fontSize: 11.5,
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  border: isSelected
                    ? '1.5px solid #0284c7'
                    : isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                  background: isSelected
                    ? (isDark ? '#075985' : '#e0f2fe')
                    : (isDark ? '#1e293b' : '#ffffff'),
                  color: isSelected
                    ? (isDark ? '#bae6fd' : '#0369a1')
                    : (isDark ? '#94a3b8' : '#475569'),
                }}
              >
                <span>{dept.name}</span>
              </button>
            );
          })}
        </div>
      )}

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
        <div style={{ width: '100%', maxWidth: 980 }}>
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
                Natural Language ERP Reporting: Query operators, machines, departments, items, customer dispatches, downtime, and time-series trends.
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
                  maxWidth: 880,
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
                      maxWidth: msg.sender === 'user' ? '80%' : '100%',
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
                      {/* Report Title Banner */}
                      {msg.reportTitle && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 8,
                            paddingBottom: 10,
                            marginBottom: 12,
                            borderBottom: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: 15, color: isDark ? '#93c5fd' : '#1d4ed8' }}>
                            📊 {msg.reportTitle}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {msg.divisionScope && (
                              <Tag color="blue">{msg.divisionScope}</Tag>
                            )}
                            {msg.departmentScope && msg.departmentScope !== 'ALL' && (
                              <Tag color="cyan">{msg.departmentScope}</Tag>
                            )}
                            {msg.periodLabel && (
                              <Tag color="purple">📅 {msg.periodLabel}</Tag>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Text Summary */}
                      <div style={{ whiteSpace: 'pre-line', color: msg.sender === 'user' ? '#ffffff' : (isDark ? '#f8fafc' : '#0f172a') }}>
                        {msg.text}
                      </div>

                      {/* Executive KPI Cards */}
                      {msg.kpiCards && msg.kpiCards.length > 0 && (
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                            gap: 10,
                            margin: '14px 0 16px',
                          }}
                        >
                          {msg.kpiCards.map((kpi, idx) => (
                            <div
                              key={idx}
                              style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc',
                                border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                                borderRadius: 10,
                                padding: '10px 12px',
                                borderLeft: `3px solid ${kpi.color || '#3b82f6'}`,
                              }}
                            >
                              <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                                {kpi.title}
                              </div>
                              <div style={{ fontSize: 17, fontWeight: 800, color: kpi.color || (isDark ? '#f8fafc' : '#0f172a'), marginTop: 2 }}>
                                {kpi.value} <span style={{ fontSize: 11, fontWeight: 500, color: isDark ? '#94a3b8' : '#64748b' }}>{kpi.unit || ''}</span>
                              </div>
                              {kpi.subtitle && (
                                <div style={{ fontSize: 10.5, color: isDark ? '#64748b' : '#94a3b8', marginTop: 2 }}>
                                  {kpi.subtitle}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Safe Action Card (Write Operations) */}
                      {msg.proposedAction && (
                        <div
                          style={{
                            margin: '14px 0',
                            padding: 14,
                            borderRadius: 10,
                            background: isDark ? '#1c1917' : '#fffbeb',
                            border: isDark ? '1.5px solid #d97706' : '1.5px solid #f59e0b',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: isDark ? '#fbbf24' : '#b45309', fontSize: 14 }}>
                            <SafetyCertificateOutlined />
                            <span>Executive Authorization Guard — Safe Confirmation Required</span>
                          </div>
                          <div style={{ fontSize: 12.5, color: isDark ? '#e7e5e4' : '#78350f', margin: '8px 0' }}>
                            {msg.proposedAction.description}. The AI Assistant requires explicit confirmation before executing modifications to protect ERP audit integrity:
                          </div>
                          <div style={{ fontSize: 12, padding: '8px 10px', background: isDark ? '#292524' : '#fef3c7', borderRadius: 6, fontFamily: 'monospace' }}>
                            <div><strong>Operation:</strong> {msg.proposedAction.actionType}</div>
                            <div><strong>Target Entity:</strong> {msg.proposedAction.target}</div>
                            {msg.proposedAction.oldValue !== undefined && <div><strong>Current Recorded Value:</strong> {msg.proposedAction.oldValue}</div>}
                            <div><strong>Requested New Value:</strong> {msg.proposedAction.newValue}</div>
                          </div>
                          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                            <Button
                              size="small"
                              type="primary"
                              style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
                              onClick={() => message.success('Action logged and submitted for managerial approval.')}
                            >
                              Authorize & Queue
                            </Button>
                            <Button size="small" onClick={() => message.info('Action cancelled.')}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Chart */}
                      {msg.chartData && renderChart(msg.chartData)}

                      {/* Audited Detailed Table */}
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
                            pagination={false}
                            dataSource={msg.tableData.rows}
                            rowKey={(r, i) => r.id || r.machine || r.operator || r.code || String(i)}
                            columns={msg.tableData.columns}
                            scroll={{ x: 'max-content' }}
                            onRow={(record: any) => {
                              if (record?.isGrandTotal) {
                                return {
                                  style: {
                                    background: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ecfdf5',
                                    borderTop: '2px solid #10b981',
                                    borderBottom: '2px solid #10b981',
                                    fontWeight: 700,
                                  },
                                };
                              }
                              if (record?.isSubtotal) {
                                return {
                                  style: {
                                    background: isDark ? 'rgba(59, 130, 246, 0.14)' : '#eff6ff',
                                    borderTop: '1.5px solid #3b82f6',
                                    borderBottom: '1px solid #bfdbfe',
                                    fontWeight: 600,
                                  },
                                };
                              }
                              return {};
                            }}
                          />
                        </div>
                      )}

                      {/* Audit Trail & Data Source Transparency Box */}
                      {msg.auditTrail && (
                        <div
                          style={{
                            marginTop: 10,
                            padding: '8px 12px',
                            borderRadius: 6,
                            background: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.02)',
                            border: isDark ? '1px dashed #334155' : '1px dashed #cbd5e1',
                            fontSize: 11,
                            color: isDark ? '#94a3b8' : '#64748b',
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 600 }}>Data Source:</span> {msg.auditTrail.dataSource} • <span style={{ fontWeight: 600 }}>Filters:</span> {msg.auditTrail.filters.join(', ')}
                          </div>
                          <div>
                            <span style={{ fontWeight: 600 }}>Records Audited:</span> {msg.auditTrail.recordsExamined} • <span>{msg.auditTrail.timestamp}</span>
                          </div>
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
                      <Tooltip title="Copy report">
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
                    <span>Analyzing live ERP production, operator and machine metrics for {activeDivisionMeta.name}...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Input & Smart Contextual Chips ────────────────────────── */}
      <div
        style={{
          background: isDark ? '#0f172a' : '#ffffff',
          borderTop: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0',
          padding: '10px 20px 10px',
          boxShadow: isDark
            ? '0 -4px 14px rgba(0,0,0,0.4)'
            : '0 -2px 10px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          {/* Smart Filter Chips Bar */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 8,
              scrollbarWidth: 'none',
            }}
          >
            {[
              { label: '👤 Operator-wise', query: 'Show operator-wise production for September' },
              { label: '⚙️ Machine-wise', query: `Show ${activeDivisionMeta.name} machine-wise production, target and average report` },
              { label: '🏢 Department-wise', query: 'Show department-wise target vs actual production' },
              { label: '👥 Operator + Machine', query: 'Show operator + machine-wise production' },
              { label: '⏰ Shift-wise', query: 'Show operator-wise production by shift' },
              { label: '📦 Product-wise', query: 'Show item-wise production for the current month' },
              { label: '🚚 Customer Dispatch', query: 'Show customer-wise dispatch this month' },
              { label: '⚖️ MoM Comparison', query: 'Compare August and September production' },
              { label: '📈 6-Month Trend', query: 'Show production trend for the last 6 months' },
              { label: '⚠️ Downtime', query: 'Show machine-wise downtime' },
            ].map((chip) => (
              <button
                key={chip.label}
                onClick={() => handleSend(chip.query)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 10px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                  background: isDark ? '#1e293b' : '#f8fafc',
                  color: isDark ? '#94a3b8' : '#475569',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#3b82f6';
                  e.currentTarget.style.color = '#3b82f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = isDark ? '#334155' : '#cbd5e1';
                  e.currentTarget.style.color = isDark ? '#94a3b8' : '#475569';
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Main Query Input */}
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
              placeholder={`Ask me about production, dispatch, operators, machines, customers... (e.g. Show operator-wise production for September)`}
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
              💡 <span>Active Scope: <strong>{activeDivisionMeta.name}</strong> • Unit: <strong>{activeDivisionMeta.uom}</strong> • Natural Language Engine</span>
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
