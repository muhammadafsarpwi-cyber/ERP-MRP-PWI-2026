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
  Popover,
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
  AudioOutlined,
  AudioMutedOutlined,
  SettingOutlined,
  PlusOutlined,
  HistoryOutlined,
  SearchOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ThunderboltOutlined,
  MessageOutlined,
  CloseOutlined,
  ClockCircleOutlined,
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
import {
  aiAssistantService,
  extractAiErrorMessage,
  isAiBackendUnavailable,
  AiAnswer,
  AiEmptyStateSuggestion,
} from '../../services/aiAssistantService';
import { useVoiceRecorder, blobToBase64 } from '../../hooks/useVoiceRecorder';
import AiAnswerCard from './AiAnswerCard';
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
  QueryIntent,
  ReportingUnit,
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
  rawIntent?: QueryIntent;
  kpiCards?: KpiCardData[];
  chartData?: ReportChartData;
  tableData?: {
    columns: AiColumn[];
    rows: any[];
  };
  /** Real backend Text-to-SQL answer — rendered dynamically by AiAnswerCard. */
  backendAnswer?: AiAnswer;
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

interface ChatSession {
  id: string;
  title: string;
  timestamp: string;
  messages: ChatMessage[];
  divisionCode: string;
  departmentCode: string;
}

const AiAssistantPage: React.FC = () => {
  const isDark = useThemeStore((state) => state.draft.mode === 'dark');

  const [divisionsList, setDivisionsList] = useState<DivisionMeta[]>(DEFAULT_DIVISIONS);
  const [selectedDivisionCode, setSelectedDivisionCode] = useState<string>('DIV-CCD');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [uomOverride, setUomOverride] = useState<string>('AUTO');

  // Sidebar & Multi-Session Chat History
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('pwi_ai_chat_sessions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    try {
      const active = localStorage.getItem('pwi_ai_active_session_id');
      if (active) return active;
    } catch {}
    return `session-${Date.now()}`;
  });
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

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
  /** Which pipeline is in flight — shapes the loading placeholder text. */
  const [loadingKind, setLoadingKind] = useState<'text' | 'voice'>('text');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // MediaRecorder voice capture → compressed base64 JSON → POST /ai/assistant/voice
  // (OpenAI Whisper server-side with parallel browser SpeechRecognition fallback).
  const {
    isRecording,
    elapsedSeconds,
    liveTranscript,
    error: recorderError,
    start: startRecording,
    stop: stopRecording,
  } = useVoiceRecorder();
  const isListening = isRecording;

  // Last question, so empty-state suggestions can re-ask with context.
  const lastQuestionRef = useRef<string>('');

  // Maintain conversation context for natural follow-up questions
  const conversationContextRef = useRef<ConversationContext>({
    lastDivisionCode: 'DIV-CCD',
    lastDepartmentCode: 'ALL',
    lastPeriod: { type: 'this_month', label: 'September 2026', startDate: '2026-09-01', endDate: '2026-09-30' },
    lastDimension: 'machine',
  });

  // Surface recorder failures (microphone permission denied, unsupported browser…)
  useEffect(() => {
    if (recorderError) message.warning(recorderError);
  }, [recorderError]);

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

    // Sync active session into sessions list
    if (messages.length > 0) {
      setSessions((prev) => {
        const firstUserMsg = messages.find((m) => m.sender === 'user');
        const sessionTitle = firstUserMsg
          ? (firstUserMsg.text.replace(/^[🎤\s]+/, '').slice(0, 32) + (firstUserMsg.text.length > 32 ? '…' : ''))
          : 'Analytics Query';

        const existingIdx = prev.findIndex((s) => s.id === currentSessionId);
        const updatedSession: ChatSession = {
          id: currentSessionId,
          title: existingIdx >= 0 ? prev[existingIdx].title : sessionTitle,
          timestamp: dayjs().format('MMM D, hh:mm A'),
          messages,
          divisionCode: selectedDivisionCode,
          departmentCode: selectedDepartment,
        };

        let updated: ChatSession[];
        if (existingIdx >= 0) {
          updated = [...prev];
          updated[existingIdx] = updatedSession;
        } else {
          updated = [updatedSession, ...prev].slice(0, 40);
        }
        try {
          localStorage.setItem('pwi_ai_chat_sessions', JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }
  }, [messages, loading, currentSessionId, selectedDivisionCode, selectedDepartment]);

  const baseDivisionMeta = useMemo(() => {
    return divisionsList.find((d) => d.code === selectedDivisionCode) || DEFAULT_DIVISIONS[1];
  }, [divisionsList, selectedDivisionCode]);

  const activeDivisionMeta = useMemo<DivisionMeta>(() => {
    if (uomOverride === 'AUTO') return baseDivisionMeta;
    return { ...baseDivisionMeta, uom: uomOverride };
  }, [baseDivisionMeta, uomOverride]);

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

  const handleNewChat = () => {
    const newId = `session-${Date.now()}`;
    setCurrentSessionId(newId);
    setMessages([]);
    setInputText('');
    try {
      localStorage.setItem('pwi_ai_active_session_id', newId);
      sessionStorage.removeItem('pwi_erp_ai_chat');
    } catch {}
    message.success('Started a new chat session');
  };

  const handleSelectSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages || []);
    if (session.divisionCode) setSelectedDivisionCode(session.divisionCode);
    if (session.departmentCode) setSelectedDepartment(session.departmentCode);
    try {
      localStorage.setItem('pwi_ai_active_session_id', session.id);
    } catch {}
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== sessionId);
      try {
        localStorage.setItem('pwi_ai_chat_sessions', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    if (currentSessionId === sessionId) {
      handleNewChat();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== currentSessionId);
      try {
        localStorage.setItem('pwi_ai_chat_sessions', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    try { sessionStorage.removeItem('pwi_erp_ai_chat'); } catch {}
    setSettingsOpen(false);
    message.info('Chat history cleared');
  };

  const filteredSessions = useMemo(() => {
    if (!historySearch.trim()) return sessions;
    const q = historySearch.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.messages.some((m) => m.text.toLowerCase().includes(q)),
    );
  }, [sessions, historySearch]);

  const quickActionChips = useMemo(() => [
    { label: 'Top 5 Customers', icon: '👑', query: 'Show top 5 customers by sales volume' },
    { label: 'Top 5 Items', icon: '📦', query: 'Show top 5 items produced' },
    { label: 'Top 5 Operators', icon: '👷', query: 'Show top 5 operators by efficiency' },
    { label: 'Machine-wise Output', icon: '⚙️', query: `Show ${activeDivisionMeta.name} machine-wise production, target and average report` },
    { label: 'Department-wise', icon: '🏢', query: 'Show department-wise target vs actual production' },
    { label: 'Machine Downtime', icon: '⚠️', query: 'Show machine-wise downtime' },
    { label: 'Customer Dispatch', icon: '🚚', query: 'Show customer-wise dispatch this month' },
    { label: 'MoM Comparison', icon: '⚖️', query: 'Compare August and September production' },
    { label: '6-Month Trend', icon: '📈', query: 'Show production trend for the last 6 months' },
    { label: 'Shift-wise Output', icon: '⏰', query: 'Show operator-wise production by shift' },
  ], [activeDivisionMeta]);

  const handleUnitChange = async (newUnit: ReportingUnit) => {
    setUomOverride(newUnit);
    const label =
      newUnit === 'AUTO'
        ? `Auto (${baseDivisionMeta.uom})`
        : newUnit === 'Gross'
        ? 'Gross (1 Gross = 144 PCS)'
        : newUnit;
    message.success(`Reporting unit set to: ${label}`);

    // Dynamically re-render all summary KPI cards, detailed tables, and graphical charts in the active chat
    const hasAssistantReports = messages.some(
      (m) => m.sender === 'assistant' && (m.rawIntent || m.tableData || m.kpiCards || m.chartData),
    );

    if (hasAssistantReports) {
      try {
        const updatedMessages = await Promise.all(
          messages.map(async (m) => {
            if (m.sender !== 'assistant') return m;
            const baseIntent =
              m.rawIntent ||
              conversationContextRef.current.lastIntent ||
              parseNaturalLanguageQuery(
                lastQuestionRef.current || `Show ${baseDivisionMeta.name} machine-wise production report`,
                m.divisionScope || selectedDivisionCode,
                m.departmentScope || selectedDepartment,
              );
            const updatedIntent: QueryIntent = {
              ...baseIntent,
              requestedUnit: newUnit === 'AUTO' ? undefined : newUnit,
            };
            const report = await generateReportData(
              updatedIntent,
              divisionsList,
              isDark,
              newUnit,
            );
            return {
              ...m,
              rawIntent: updatedIntent,
              text: report.summaryText,
              reportTitle: report.title,
              kpiCards: report.kpiCards,
              chartData: report.chartData,
              tableData: report.tableData,
              auditTrail: report.auditTrail,
            };
          }),
        );
        setMessages(updatedMessages);
      } catch {}
    } else if (messages.some((m) => m.sender === 'assistant' && m.backendAnswer)) {
      // If only backend SQL cards are present, also regenerate full KPI + Chart + Table report if Gross is selected
      const fallbackQ =
        lastQuestionRef.current ||
        [...messages].reverse().find((m) => m.sender === 'user')?.text ||
        `Show ${baseDivisionMeta.name} machine-wise production report`;
      try {
        const intent = parseNaturalLanguageQuery(
          fallbackQ,
          selectedDivisionCode,
          selectedDepartment,
          conversationContextRef.current,
        );
        intent.requestedUnit = newUnit === 'AUTO' ? undefined : newUnit;
        const report = await generateReportData(intent, divisionsList, isDark, newUnit);
        setMessages((prev) =>
          prev.map((m, idx) =>
            idx === prev.length - 1 && m.sender === 'assistant'
              ? {
                  ...m,
                  rawIntent: intent,
                  reportTitle: report.title,
                  kpiCards: report.kpiCards,
                  chartData: report.chartData,
                  tableData: report.tableData,
                  auditTrail: report.auditTrail,
                }
              : m,
          ),
        );
      } catch {}
    }
  };

  const renderSettingsPopoverContent = () => {
    const unitOptions: Array<{ value: ReportingUnit; label: string; sub?: string }> = [
      { value: 'AUTO', label: `Auto (${baseDivisionMeta.uom.split(' ')[0]})` },
      { value: 'PCS', label: 'PCS' },
      { value: 'Gross', label: 'Gross', sub: '144 PCS' },
      { value: 'KG', label: 'KG' },
      { value: 'MTR', label: 'MTR' },
      { value: 'Bags', label: 'Bags' },
    ];

    return (
      <div
        style={{
          width: 356,
          maxWidth: 'calc(100vw - 36px)',
          maxHeight: 'min(390px, calc(100vh - 155px))',
          overflowY: 'auto',
          padding: '2px 2px',
        }}
      >
        {/* Compact Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            paddingBottom: 6,
            borderBottom: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: 12.5,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: isDark ? '#f8fafc' : '#0f172a',
            }}
          >
            <SettingOutlined style={{ color: '#3b82f6' }} /> Filters, Units & Quick Controls
          </span>
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            danger
            onClick={handleClearChat}
            style={{ fontSize: 11, fontWeight: 600, height: 24, padding: '0 6px' }}
          >
            Clear Chat
          </Button>
        </div>

        {/* 1. Dynamic Unit Toggle Expansion (Responsive 3-Column Grid with Gross = 144 PCS) */}
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: isDark ? '#38bdf8' : '#0284c7',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
              }}
            >
              Reporting Unit Toggle (PCS / UOM)
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 8,
                background: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5',
                color: isDark ? '#6ee7b7' : '#047857',
                border: isDark ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid #a7f3d0',
              }}
            >
              1 Gross = 144 PCS
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 6,
            }}
          >
            {unitOptions.map((u) => {
              const isSelected = uomOverride === u.value;
              return (
                <button
                  key={u.value}
                  onClick={() => handleUnitChange(u.value)}
                  style={{
                    padding: '5px 8px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    border: isSelected
                      ? '1.5px solid #10b981'
                      : isDark
                      ? '1px solid #334155'
                      : '1px solid #cbd5e1',
                    background: isSelected
                      ? isDark
                        ? '#064e3b'
                        : '#d1fae5'
                      : isDark
                      ? '#1e293b'
                      : '#f8fafc',
                    color: isSelected
                      ? isDark
                        ? '#6ee7b7'
                        : '#047857'
                      : isDark
                      ? '#94a3b8'
                      : '#475569',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{u.label}</span>
                  {u.sub && (
                    <span
                      style={{
                        fontSize: 9.5,
                        opacity: 0.85,
                        fontWeight: 600,
                      }}
                    >
                      ({u.sub})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Section Tabs (Responsive Grid) */}
        {selectedDivisionCode !== 'ALL' && activeDepartments.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: isDark ? '#38bdf8' : '#0284c7',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: 6,
              }}
            >
              Section Tabs ({activeDivisionMeta.name})
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 5,
              }}
            >
              {activeDepartments.map((dept) => {
                const isSelected = selectedDepartment === dept.code;
                return (
                  <button
                    key={dept.code}
                    onClick={() => {
                      handleDepartmentSwitch(dept.code);
                      setSettingsOpen(false);
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      border: isSelected
                        ? '1.5px solid #0284c7'
                        : isDark
                        ? '1px solid #334155'
                        : '1px solid #cbd5e1',
                      background: isSelected
                        ? isDark
                          ? '#075985'
                          : '#e0f2fe'
                        : isDark
                        ? '#1e293b'
                        : '#f8fafc',
                      color: isSelected
                        ? isDark
                          ? '#bae6fd'
                          : '#0369a1'
                        : isDark
                        ? '#94a3b8'
                        : '#475569',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {dept.shortName || dept.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Quick Division Select (Responsive Grid) */}
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: isDark ? '#94a3b8' : '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              marginBottom: 6,
            }}
          >
            Quick Division Select
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 5,
            }}
          >
            {divisionsList.map((div) => {
              const isSelected = selectedDivisionCode === div.code;
              return (
                <button
                  key={div.code}
                  onClick={() => {
                    handleDivisionSwitch(div.code);
                    setSettingsOpen(false);
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    border: isSelected
                      ? '1.5px solid #3b82f6'
                      : isDark
                      ? '1px solid #334155'
                      : '1px solid #cbd5e1',
                    background: isSelected
                      ? isDark
                        ? '#1e3a8a'
                        : '#eff6ff'
                      : isDark
                      ? '#1e293b'
                      : '#f8fafc',
                    color: isSelected
                      ? isDark
                        ? '#93c5fd'
                        : '#1d4ed8'
                      : isDark
                      ? '#94a3b8'
                      : '#475569',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {div.name.replace(' Division', '')}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            fontSize: 10.5,
            color: isDark ? '#64748b' : '#94a3b8',
            paddingTop: 6,
            borderTop: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Engine: Supabase Live</span>
          <span>
            Active UOM:{' '}
            <strong style={{ color: isDark ? '#e2e8f0' : '#334155' }}>
              {activeDivisionMeta.uom === 'Gross' ? 'Gross (144 PCS)' : activeDivisionMeta.uom}
            </strong>
          </span>
        </div>
      </div>
    );
  };

  const handleCopy = (msg: ChatMessage) => {
    let copyContent = `${msg.reportTitle ? msg.reportTitle + '\n' : ''}${msg.text}`;
    if (msg.tableData) {
      copyContent += '\n\n' + msg.tableData.rows.map((r) => JSON.stringify(r)).join('\n');
    }
    if (msg.backendAnswer) {
      const a = msg.backendAnswer;
      copyContent += '\n\n' + [
        a.columns.join('\t'),
        ...a.rows.map((r) => a.columns.map((c) => String(r[c] ?? '')).join('\t')),
      ].join('\n');
    }
    navigator.clipboard.writeText(copyContent);
    setCopiedId(msg.id);
    message.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // QUERY PIPELINE — backend Text-to-SQL first, legacy engine as fallback
  // ══════════════════════════════════════════════════════════════════════════

  /** Map a backend AiAnswer into a chat bubble message. */
  const buildAssistantMessage = (answer: AiAnswer, divisionCode: string): ChatMessage => {
    const dimension = answer.chart && answer.chart.dimension !== 'none' ? answer.chart.dimension : null;
    const dimensionLabel = dimension
      ? `${dimension.charAt(0).toUpperCase()}${dimension.slice(1)}-wise`
      : '';
    return {
      id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender: 'assistant',
      text: [answer.explanation?.en, answer.explanation?.ur].filter(Boolean).join('\n'),
      timestamp: dayjs().format('hh:mm A'),
      divisionScope: divisionCode,
      reportTitle: answer.mode === 'voice'
        ? `🎙️ Voice Answer${dimensionLabel ? ` — ${dimensionLabel}` : ''}`
        : `${dimensionLabel || 'AI Query'} Report`,
      backendAnswer: answer,
    };
  };

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
    lastQuestionRef.current = query;
    setLoadingKind('text');
    setLoading(true);

    try {
      // 1. Local intent parse — write-guard + follow-up context (instant, offline)
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

      // Sync unit toggle if the user explicitly requested a unit via text/voice (e.g., "in Gross")
      const effectiveUnit: string =
        intent.requestedUnit && intent.requestedUnit !== 'AUTO'
          ? intent.requestedUnit
          : uomOverride;
      if (intent.requestedUnit && intent.requestedUnit !== uomOverride) {
        setUomOverride(intent.requestedUnit);
      }

      // Update conversation context for next follow-up turns (both pipelines)
      conversationContextRef.current = {
        lastIntent: intent,
        lastDivisionCode: intent.divisionCode || effectiveCode,
        lastDepartmentCode: intent.departmentCode || effectiveDept,
        lastPeriod: intent.period,
        lastDimension: intent.dimension,
      };

      // 2. SPECIFIC-DATE GRANULAR LEDGER & GROSS UNIT CONVERSION PRIORITY:
      //    When a user requests a specific date OR when the "Gross" unit (1 Gross = 144 PCS) is active,
      //    generate the full report (Summary KPI Cards + Detailed Table + Graphical Chart) with dynamic
      //    ÷ 144 piece conversion directly from the hydrated production entries endpoint.
      const isGrossActive = effectiveUnit.toLowerCase() === 'gross';
      if (intent.dimension !== 'daily_granular_ledger' && !isGrossActive) {
        try {
          const answer = await aiAssistantService.askQuestion(query);
          // Guard against collapsed 1-row "Grand Total" responses when a breakdown was requested
          const isCollapsedGrandTotalOnly =
            answer.rows.length <= 1 &&
            answer.columns.length <= 3 &&
            !/\b(count|how many|total only)\b/i.test(query);
          if (!isCollapsedGrandTotalOnly) {
            const msgWithIntent = {
              ...buildAssistantMessage(answer, effectiveCode),
              rawIntent: intent,
            };
            setMessages((prev) => [...prev, msgWithIntent]);
            return;
          }
        } catch (aiErr) {
          if (!isAiBackendUnavailable(aiErr)) {
            setMessages((prev) => [
              ...prev,
              {
                id: `err-${Date.now()}`,
                sender: 'assistant',
                text: `⚠️ ${extractAiErrorMessage(aiErr)}`,
                timestamp: dayjs().format('hh:mm A'),
              },
            ]);
            return;
          }
        }
      }

      // 3. GRANULAR LEDGER & DIMENSIONAL REPORT GENERATOR (Supports Gross = PCS / 144)
      const report: NormalizedReportResult = await generateReportData(
        intent,
        divisionsList,
        isDark,
        effectiveUnit,
      );

      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: 'assistant',
        text: report.summaryText,
        timestamp: dayjs().format('hh:mm A'),
        divisionScope: report.divisionScope,
        departmentScope: report.departmentScope,
        periodLabel: report.periodLabel,
        reportTitle: report.title,
        rawIntent: intent,
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

  // ══════════════════════════════════════════════════════════════════════════
  // VOICE PIPELINE — Client Audio Compression → Whisper → Text-to-SQL + Fallback
  // ══════════════════════════════════════════════════════════════════════════

  const submitVoiceBlob = async (blob: Blob, mimeType: string, fallbackTranscript?: string) => {
    if (loading) return;
    lastQuestionRef.current = '';
    setLoadingKind('voice');
    setLoading(true);
    try {
      // Compress and encode audio payload client-side to prevent 413 Request Entity Too Large
      const audioBase64 = await blobToBase64(blob);
      const answer = await aiAssistantService.voiceQuery(
        audioBase64,
        mimeType || 'audio/webm',
        'ur', // Whisper auto-detects English inside Urdu speech anyway
      );
      lastQuestionRef.current = answer.transcript || answer.question || '';
      setMessages((prev) => [
        ...prev,
        {
          id: `u-${Date.now()}-v`,
          sender: 'user',
          text: `🎤 ${answer.transcript || answer.question}`,
          timestamp: dayjs().format('hh:mm A'),
          divisionScope: selectedDivisionCode,
        },
        buildAssistantMessage(answer, selectedDivisionCode),
      ]);
    } catch (err) {
      // If backend STT is unconfigured/offline and browser SpeechRecognition captured the voice query,
      // route the transcript seamlessly through our ERP analytics pipeline.
      if (fallbackTranscript && fallbackTranscript.trim()) {
        setLoading(false);
        await handleSend(`🎤 ${fallbackTranscript.trim()}`);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}-v`,
          sender: 'assistant',
          text: `🎙️ Voice request failed: ${extractAiErrorMessage(err)}`,
          timestamp: dayjs().format('hh:mm A'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  /** Mic button: click to record, click again to stop, compress & send. */
  const handleMicToggle = async () => {
    if (loading) return;
    if (isRecording) {
      const captured = await stopRecording();
      if (!captured) {
        message.warning('No audio was captured. Please try again.');
        return;
      }
      await submitVoiceBlob(captured.blob, captured.mimeType, captured.liveTranscript);
    } else {
      const started = await startRecording();
      if (started) {
        message.info('Recording… speak your question, then click the mic to stop and send.');
      }
    }
  };

  // ── Empty-state suggestion click → re-ask with the recommended scope ──────
  const handleEmptySuggest = (suggestion: AiEmptyStateSuggestion) => {
    if (suggestion.type === 'tip' || !suggestion.label) {
      message.info(suggestion.labelUr || suggestion.label || 'Tip noted');
      return;
    }
    if ((suggestion.type === 'division' || suggestion.type === 'department') && suggestion.value) {
      const div = divisionsList.find((d) => d.id === suggestion.value || d.code === suggestion.value);
      if (div) {
        setSelectedDivisionCode(div.code);
        setSelectedDepartment('ALL');
        handleSend(`Show me production data for ${div.name}`, div.code, 'ALL');
        return;
      }
    }
    const base = lastQuestionRef.current;
    handleSend(base ? `${base} — try ${suggestion.label}` : suggestion.label);
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
      {/* ── Top Header (Slim & Modern) ─────────────────────────────────── */}
      <div
        style={{
          background: isDark
            ? 'linear-gradient(90deg, #1e3a8a 0%, #0f172a 100%)'
            : 'linear-gradient(90deg, #1d4ed8 0%, #1e40af 100%)',
          color: '#ffffff',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
          zIndex: 10,
          borderBottom: isDark ? '1px solid #1e293b' : 'none',
          minHeight: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Tooltip title={sidebarOpen ? 'Hide History & Prompts' : 'Show History & Prompts'}>
            <Button
              type="text"
              icon={sidebarOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              onClick={() => setSidebarOpen((prev) => !prev)}
              style={{
                color: '#ffffff',
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </Tooltip>

          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 17,
            }}
          >
            <RobotOutlined style={{ color: '#ffffff' }} />
          </div>

          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.2px', lineHeight: 1.2 }}>
              PWI AI Assistant & Analytics
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.85)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Live Manufacturing Intelligence</span>
              <span>•</span>
              <Badge status="processing" color="#10b981" text={<span style={{ color: '#a7f3d0', fontSize: 10 }}>Supabase Live</span>} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={handleNewChat}
            style={{
              background: '#ffffff',
              color: '#1d4ed8',
              borderColor: '#ffffff',
              fontWeight: 700,
              fontSize: 12,
              borderRadius: 6,
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            }}
          >
            New Chat
          </Button>
        </div>
      </div>

      {/* ── Main Body: Left Sidebar + Central Chat Area ───────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── Left Sidebar (Chat History & Quick Prompts) ─────────────── */}
        <div
          style={{
            width: sidebarOpen ? 260 : 0,
            minWidth: sidebarOpen ? 260 : 0,
            transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
            background: isDark ? '#0f172a' : '#ffffff',
            borderRight: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            visibility: sidebarOpen ? 'visible' : 'hidden',
            zIndex: 5,
          }}
        >
          {/* Sidebar Top: New Chat & Search */}
          <div style={{ padding: '12px 12px 8px', borderBottom: isDark ? '1px solid #1e293b' : '1px solid #f1f5f9' }}>
            <Button
              type="dashed"
              block
              icon={<PlusOutlined />}
              onClick={handleNewChat}
              style={{
                marginBottom: 10,
                borderColor: '#3b82f6',
                color: '#3b82f6',
                fontWeight: 600,
                fontSize: 12,
                borderRadius: 8,
              }}
            >
              Start New Chat
            </Button>
            <Input
              size="small"
              placeholder="Search chat history..."
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              allowClear
              style={{ borderRadius: 6, fontSize: 11 }}
            />
          </div>

          {/* Sidebar Middle: Chat Sessions List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: isDark ? '#64748b' : '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <HistoryOutlined /> Past Sessions ({filteredSessions.length})
            </div>

            {filteredSessions.length === 0 ? (
              <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: 11, color: isDark ? '#64748b' : '#94a3b8' }}>
                {historySearch ? 'No matching sessions found' : 'No previous chat sessions yet'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {filteredSessions.map((s) => {
                  const isActive = s.id === currentSessionId;
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleSelectSession(s)}
                      style={{
                        padding: '7px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: isActive
                          ? (isDark ? '#1e3a8a' : '#eff6ff')
                          : 'transparent',
                        border: isActive
                          ? '1px solid #3b82f6'
                          : '1px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = isDark ? '#1e293b' : '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                        <MessageOutlined style={{ color: isActive ? '#3b82f6' : (isDark ? '#64748b' : '#94a3b8'), fontSize: 12 }} />
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: isActive ? 700 : 500,
                              color: isActive
                                ? (isDark ? '#93c5fd' : '#1d4ed8')
                                : (isDark ? '#e2e8f0' : '#334155'),
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {s.title}
                          </div>
                          <div style={{ fontSize: 10, color: isDark ? '#64748b' : '#94a3b8' }}>
                            {s.timestamp}
                          </div>
                        </div>
                      </div>

                      <Tooltip title="Delete session">
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                          onClick={(e) => handleDeleteSession(s.id, e)}
                          style={{
                            color: isDark ? '#64748b' : '#94a3b8',
                            padding: 0,
                            width: 20,
                            height: 20,
                            minWidth: 20,
                          }}
                        />
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar Bottom: Quick Action Prompts */}
          <div
            style={{
              padding: '10px 10px',
              borderTop: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0',
              background: isDark ? '#0b1120' : '#f8fafc',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: isDark ? '#94a3b8' : '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <ThunderboltOutlined style={{ color: '#f59e0b' }} /> Quick Analytics
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
              {quickActionChips.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => handleSend(chip.query)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: isDark ? '#1e293b' : '#ffffff',
                    color: isDark ? '#cbd5e1' : '#334155',
                    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#3b82f6';
                    e.currentTarget.style.color = '#3b82f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isDark ? '#334155' : '#e2e8f0';
                    e.currentTarget.style.color = isDark ? '#cbd5e1' : '#334155';
                  }}
                >
                  <span style={{ fontSize: 12 }}>{chip.icon}</span>
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {chip.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Main Workspace: Messages & Bottom Dock ──────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

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

                      {/* Backend AI answer: dynamic chart / clean striped table /
                          bilingual empty state — driven by the validated
                          `chart` payload contract from the NestJS orchestrator. */}
                      {msg.backendAnswer && (
                        <AiAnswerCard
                          answer={msg.backendAnswer}
                          isDark={isDark}
                          uomOverride={uomOverride}
                          onSuggest={handleEmptySuggest}
                        />
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

                      {/* Primary Focus: Audited Granular Detailed Ledger Table */}
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
                              if (record?.isSectionHeader) {
                                return {
                                  style: {
                                    background: isDark ? 'rgba(99, 102, 241, 0.22)' : '#eef2ff',
                                    borderTop: isDark ? '2px solid #6366f1' : '2px solid #4f46e5',
                                    borderBottom: isDark ? '1px solid #4f46e5' : '1px solid #c7d2fe',
                                    fontWeight: 700,
                                  },
                                };
                              }
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

                      {/* Chart */}
                      {msg.chartData && renderChart(msg.chartData)}

                      {/* Bottom-Anchored Executive Summary KPI Cards (Quick Reference at End of Document) */}
                      {msg.kpiCards && msg.kpiCards.length > 0 && (
                        <div style={{ marginTop: 18 }}>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              color: isDark ? '#94a3b8' : '#64748b',
                              marginBottom: 8,
                            }}
                          >
                            Executive Summary KPI Reference
                          </div>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                              gap: 10,
                              marginBottom: 14,
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
                    <span>
                      {loadingKind === 'voice'
                        ? `🎙️ Transcribing your audio & querying live ERP data for ${activeDivisionMeta.name}…`
                        : `Analyzing live ERP production, operator and machine metrics for ${activeDivisionMeta.name}...`}
                    </span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Input Dock: Division & Dept Selectors + Ask Anything Input + Sticky Settings Gear + Voice Mic ── */}
      <div
        style={{
          background: isDark ? '#0f172a' : '#ffffff',
          borderTop: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0',
          padding: '10px 16px',
          boxShadow: isDark
            ? '0 -4px 18px rgba(0,0,0,0.5)'
            : '0 -2px 14px rgba(0,0,0,0.04)',
          zIndex: 10,
        }}
      >
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          {/* Unified Zero-Scroll Bottom Dock: Division Dropdown + Dept/Section Dropdown + Chat Input + Sticky Settings Gear + Mic + Send */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              background: isDark ? '#1e293b' : '#f8fafc',
              border: isListening
                ? '1.5px solid #ef4444'
                : isDark
                ? '1.5px solid #3b82f6'
                : '1.5px solid #bfdbfe',
              borderRadius: 28,
              padding: '6px 8px 6px 12px',
              transition: 'all 0.2s ease',
              boxShadow: isListening
                ? '0 0 14px rgba(239, 68, 68, 0.45)'
                : isDark
                ? '0 2px 10px rgba(0,0,0,0.35)'
                : '0 2px 8px rgba(37, 99, 235, 0.06)',
            }}
          >
            {/* Bottom-Anchored Division Selector (inline next to chat input) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <ApartmentOutlined style={{ color: '#3b82f6', fontSize: 13 }} />
              <Select
                size="small"
                value={selectedDivisionCode}
                onChange={handleDivisionSwitch}
                style={{ width: 155, fontSize: 12 }}
                popupMatchSelectWidth={200}
                options={divisionsList.map((div) => ({
                  value: div.code,
                  label: div.name,
                }))}
              />
            </div>

            {/* Bottom-Anchored Dept / Section Selector (inline next to chat input) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                flexShrink: 0,
                paddingRight: 6,
                borderRight: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
              }}
            >
              <FilterOutlined style={{ color: '#0284c7', fontSize: 12 }} />
              <Select
                size="small"
                value={selectedDepartment}
                onChange={handleDepartmentSwitch}
                style={{ width: 145, fontSize: 12 }}
                popupMatchSelectWidth={210}
                disabled={selectedDivisionCode === 'ALL'}
                options={[
                  { value: 'ALL', label: 'All Dept / Sections' },
                  ...activeDepartments.map((dept) => ({
                    value: dept.code,
                    label: dept.name,
                  })),
                ]}
              />
            </div>

            {/* Ask Anything Chat Input Field */}
            <Input
              variant="borderless"
              placeholder={
                isListening
                  ? `Recording ${elapsedSeconds}s${liveTranscript ? ` — "${liveTranscript}"` : '… click mic to stop & send'}`
                  : `Ask anything about ${activeDivisionMeta.name} (machines, target, average, customers, sales volume)...`
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              style={{
                flex: 1,
                minWidth: 200,
                fontSize: 13.5,
                color: isDark ? '#f8fafc' : '#0f172a',
              }}
              disabled={loading}
            />

            {/* Sticky Settings Gear Icon (Packs PCS/Gross/Unit toggles, Section pills, & Clear Chat inside the bottom dock) */}
            <Popover
              content={renderSettingsPopoverContent()}
              trigger="click"
              placement="topRight"
              arrow={false}
              overlayStyle={{ paddingBottom: 8 }}
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
            >
              <Tooltip title="Settings: Unit Toggles (PCS / Gross = 144 PCS), Sections & Clear Chat">
                <Button
                  type="text"
                  shape="circle"
                  icon={
                    <SettingOutlined
                      style={{
                        color: settingsOpen
                          ? '#3b82f6'
                          : uomOverride === 'Gross'
                          ? '#10b981'
                          : isDark
                          ? '#cbd5e1'
                          : '#475569',
                        fontSize: 16,
                      }}
                    />
                  }
                  style={{
                    background: settingsOpen
                      ? isDark
                        ? '#1e3a8a'
                        : '#dbeafe'
                      : uomOverride === 'Gross'
                      ? isDark
                        ? '#064e3b'
                        : '#d1fae5'
                      : isDark
                      ? '#334155'
                      : '#e2e8f0',
                    width: 36,
                    height: 36,
                    flexShrink: 0,
                    transition: 'all 0.2s ease',
                  }}
                />
              </Tooltip>
            </Popover>

            {/* Voice Input Microphone Button — Compressed MediaRecorder → OpenAI Whisper pipeline */}
            <Tooltip
              title={
                isListening
                  ? `Stop & send (${elapsedSeconds}s)`
                  : 'Record a voice question (Whisper STT)'
              }
            >
              <Button
                type="text"
                shape="circle"
                icon={
                  isListening ? (
                    <AudioMutedOutlined style={{ color: '#ffffff', fontSize: 16 }} />
                  ) : (
                    <AudioOutlined style={{ color: isDark ? '#93c5fd' : '#2563eb', fontSize: 16 }} />
                  )
                }
                onClick={handleMicToggle}
                disabled={loading}
                style={{
                  background: isListening ? '#ef4444' : isDark ? '#334155' : '#e2e8f0',
                  width: 36,
                  height: 36,
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                }}
              />
            </Tooltip>

            {/* Send Button */}
            <Button
              type="primary"
              shape="circle"
              icon={<SendOutlined />}
              onClick={() => handleSend()}
              loading={loading}
              disabled={!inputText.trim()}
              style={{
                background: inputText.trim() ? '#2563eb' : isDark ? '#334155' : '#cbd5e1',
                borderColor: inputText.trim() ? '#2563eb' : isDark ? '#334155' : '#cbd5e1',
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
              marginTop: 5,
              padding: '0 8px',
              fontSize: 11,
              color: isDark ? '#94a3b8' : '#64748b',
            }}
          >
            <div>
              💡 <span>Active Scope: <strong>{activeDivisionMeta.name}</strong> • Section: <strong>{selectedDepartment === 'ALL' ? 'All Sections' : selectedDepartment}</strong> • Unit: <strong>{activeDivisionMeta.uom}</strong> • Supabase PostgreSQL Live</span>
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
  </div>
</div>
  );
};

export default AiAssistantPage;
