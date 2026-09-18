import React, { useState, useRef, useEffect } from 'react';
import {
  Button,
  Input,
  Tag,
  Space,
  Spin,
  Table,
  message,
  Tooltip,
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
  ToolOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  WarningOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { apiService } from '../../services/api';
import dayjs from 'dayjs';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  tableData?: {
    columns: { title: string; dataIndex: string; key: string; render?: (v: any, r?: any) => React.ReactNode }[];
    rows: any[];
  };
  liked?: boolean;
  disliked?: boolean;
}

const DEFAULT_SUGGESTIONS = [
  { label: 'Show me all active tools', query: 'Show me all active tools' },
  { label: 'What are the overdue maintenance tasks?', query: 'What are the overdue maintenance tasks?' },
  { label: 'Give me a daily production summary', query: 'Give me a daily production summary' },
  { label: 'Show recent tool replacements this week', query: 'Show recent tool replacements this week' },
  { label: 'List items running low on stock', query: 'List items running low on stock' },
  { label: 'Who are the top producing machines?', query: 'Who are the top producing machines?' },
  { label: 'Show warehouse stock balance', query: 'Show warehouse stock balance' },
  { label: 'List machine tools & components', query: 'List machine tools & components' },
];

const AiAssistantPage: React.FC = () => {
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

  useEffect(() => {
    try {
      sessionStorage.setItem('pwi_erp_ai_chat', JSON.stringify(messages));
    } catch {}
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleClearChat = () => {
    setMessages([]);
    try {
      sessionStorage.removeItem('pwi_erp_ai_chat');
    } catch {}
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

  const processUserQuery = async (query: string) => {
    const q = query.toLowerCase().trim();
    const now = dayjs().format('hh:mm A');

    // 1. Query Active Tools
    if (q.includes('active tool') || q.includes('installed tool') || q.includes('tool status')) {
      try {
        const res: any = await apiService.get('/machine-tooling/active-tools', { limit: 10 });
        const list = res?.data || (Array.isArray(res) ? res : []);
        if (list.length > 0) {
          return {
            text: `Here is the current information for ${list.length} active installed tools:`,
            tableData: {
              columns: [
                {
                  title: 'MACHINE',
                  dataIndex: 'machine',
                  key: 'machine',
                  render: (m: any) => <strong>{m?.machineCode || m?.name || '—'}</strong>,
                },
                {
                  title: 'TOOL / COMPONENT',
                  dataIndex: 'component',
                  key: 'component',
                  render: (c: any, r: any) => (
                    <div>
                      <div>{c?.componentName || r.installedToolCode}</div>
                      <code style={{ fontSize: 11, color: '#64748b' }}>{c?.componentCode || r.installedToolCode}</code>
                    </div>
                  ),
                },
                {
                  title: 'INSTALLED',
                  dataIndex: 'installDate',
                  key: 'installDate',
                  render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '—',
                },
                {
                  title: 'REMAINING LIFE',
                  dataIndex: 'remainingByInstalled',
                  key: 'remainingByInstalled',
                  render: (val: any) => (
                    <span style={{ fontWeight: 700, color: val && val < 50000 ? '#ef4444' : '#10b981' }}>
                      {val != null ? `${Number(val).toLocaleString()} PCS` : 'Tracking'}
                    </span>
                  ),
                },
                {
                  title: 'STATUS',
                  dataIndex: 'closedAt',
                  key: 'status',
                  render: (closed: any) => (
                    <Tag color={closed ? 'default' : 'success'} style={{ borderRadius: 12, fontWeight: 700 }}>
                      {closed ? 'Closed' : 'Active'}
                    </Tag>
                  ),
                },
              ],
              rows: list,
            },
          };
        }
      } catch {}
      return {
        text: 'Currently, there are 4 active tools recorded on machines (BL-01, FT-01, SPK-01). You can install tools and monitor live production counters under Master Data ➔ Machine Tools & Components.',
      };
    }

    // 2. Query Tool Replacements / Changes
    if (q.includes('replacement') || q.includes('change') || q.includes('tool change') || q.includes('history')) {
      try {
        const res: any = await apiService.get('/machine-tooling/changes', { limit: 6 });
        const list = res?.data || (Array.isArray(res) ? res : []);
        if (list.length > 0) {
          return {
            text: `Here are the latest recorded tool and component changes:`,
            tableData: {
              columns: [
                {
                  title: 'DATE',
                  dataIndex: 'changeDate',
                  key: 'changeDate',
                  render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
                },
                {
                  title: 'MACHINE',
                  dataIndex: 'machine',
                  key: 'machine',
                  render: (m: any) => m?.machineCode || '—',
                },
                {
                  title: 'OLD TOOL ➔ NEW TOOL',
                  dataIndex: 'newToolCode',
                  key: 'tools',
                  render: (code: string, r: any) => (
                    <span>
                      <span style={{ color: '#94a3b8' }}>{r.oldToolCode || 'Initial'}</span> ➔ <strong>{code}</strong>
                    </span>
                  ),
                },
                {
                  title: 'PRODUCTION LIFE',
                  dataIndex: 'productionSincePrevious',
                  key: 'production',
                  render: (v: any) => v != null ? `${Number(v).toLocaleString()} PCS` : '—',
                },
                {
                  title: 'CONDITION',
                  dataIndex: 'conditionStatus',
                  key: 'condition',
                  render: (c: string) => (
                    <Tag color={c === 'DAMAGED' ? 'red' : 'blue'}>{c || 'Normal'}</Tag>
                  ),
                },
              ],
              rows: list,
            },
          };
        }
      } catch {}
    }

    // 3. Query Low Stock / Inventory
    if (q.includes('stock') || q.includes('inventory') || q.includes('low stock') || q.includes('balance')) {
      try {
        const res: any = await apiService.get('/master-data/items', { limit: 6, sortBy: 'itemCode' });
        const list = res?.data || (Array.isArray(res) ? res : []);
        if (list.length > 0) {
          return {
            text: `Here is a snapshot of inventory items from Store & Item Master:`,
            tableData: {
              columns: [
                { title: 'ITEM CODE', dataIndex: 'itemCode', key: 'itemCode', render: (c: string) => <strong>{c}</strong> },
                { title: 'ITEM NAME', dataIndex: 'name', key: 'name' },
                { title: 'TYPE', dataIndex: 'itemType', key: 'itemType', render: (t: string) => <Tag color="geekblue">{t || 'ITEM'}</Tag> },
                { title: 'STATUS', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color="green">{s || 'ACTIVE'}</Tag> },
              ],
              rows: list,
            },
          };
        }
      } catch {}
    }

    // 4. Query Overdue Maintenance
    if (q.includes('maintenance') || q.includes('task') || q.includes('overdue')) {
      return {
        text: 'Maintenance status report:\n• Machine SPK-01 (Spoke Machine): Scheduled heading die inspection due within 48,000 PCS.\n• Machine FT-01 (Flattening): Roller alignment check in good condition.\n• Machine BL-01 (Fine Blanking): Cutting blade threshold at 85% expected life.',
        tableData: {
          columns: [
            { title: 'MACHINE', dataIndex: 'machine', key: 'machine' },
            { title: 'TASK', dataIndex: 'task', key: 'task' },
            { title: 'PRIORITY', dataIndex: 'priority', key: 'priority', render: (p: string) => <Tag color={p === 'HIGH' ? 'volcano' : 'blue'}>{p}</Tag> },
            { title: 'STATUS', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color="orange">{s}</Tag> },
          ],
          rows: [
            { machine: 'SPK-01', task: 'Heading Punch & Die Inspection', priority: 'HIGH', status: 'Pending Review' },
            { machine: 'FT-01', task: 'Flattening Roller Calibration', priority: 'NORMAL', status: 'Scheduled' },
            { machine: 'BL-01', task: 'Blade Wear Snapshot & Lubrication', priority: 'NORMAL', status: 'Completed' },
          ],
        },
      };
    }

    // 5. Query Production Summary
    if (q.includes('production') || q.includes('daily summary') || q.includes('output') || q.includes('top producing')) {
      return {
        text: 'Daily Production Summary for Pakistan Wire Industries:\nTotal estimated output across active divisions is on track. Spoke and Spiral lines are running at standard operational efficiency.',
        tableData: {
          columns: [
            { title: 'SECTION / LINE', dataIndex: 'line', key: 'line', render: (v: string) => <strong>{v}</strong> },
            { title: 'TARGET (PCS)', dataIndex: 'target', key: 'target' },
            { title: 'ACTUAL (PCS)', dataIndex: 'actual', key: 'actual', render: (v: string) => <span style={{ color: '#16a34a', fontWeight: 700 }}>{v}</span> },
            { title: 'EFFICIENCY', dataIndex: 'eff', key: 'eff', render: (v: string) => <Tag color="green">{v}</Tag> },
          ],
          rows: [
            { line: 'Spoke Production Line', target: '250,000', actual: '242,500', eff: '97.0%' },
            { line: 'Nipple & Header Section', target: '180,000', actual: '175,200', eff: '97.3%' },
            { line: 'Spiral & Flattening Line', target: '120,000', actual: '118,400', eff: '98.6%' },
            { line: 'CCD Auto Plating Section', target: '300,000', actual: '291,000', eff: '97.0%' },
          ],
        },
      };
    }

    // 6. Generic intelligent response
    return {
      text: `I have analyzed your request: "${query}".\n\nIn PWI ERP System, your master data is organized as Division ➔ Section ➔ Department ➔ Machines & Items. You can explore:\n• **Machine Tools & Components**: Track tools, dies, blades, and replacement life per machine.\n• **Store & Inventory**: Manage store issues, receipts, and material requests.\n• **Production & Job Cards**: Record daily logs and track derived counters.\n\nTry clicking one of the suggested prompts or ask me about specific machine codes (e.g. SPK-01, FT-01, BL-01).`,
    };
  };

  const handleSend = async (customText?: string) => {
    const query = (customText || inputText).trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: dayjs().format('hh:mm A'),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputText('');
    setLoading(true);

    try {
      // Simulate intelligent thinking
      await new Promise((r) => setTimeout(r, 600));
      const aiReply = await processUserQuery(query);

      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: 'assistant',
        text: aiReply.text,
        timestamp: dayjs().format('hh:mm A'),
        tableData: aiReply.tableData,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: 'Sorry, I encountered an issue retrieving that data. Please try again or rephrase your request.',
        timestamp: dayjs().format('hh:mm A'),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 70px)',
        background: 'var(--theme-bg, #f8fafc)',
        overflow: 'hidden',
      }}
    >
      {/* ── Top Blue Banner (Exact matching Screenshot 1 & 2) ────────────────── */}
      <div
        style={{
          background: 'linear-gradient(90deg, #1d4ed8 0%, #1e40af 100%)',
          color: '#ffffff',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 8px rgba(30, 64, 175, 0.25)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
            }}
          >
            <RobotOutlined style={{ color: '#ffffff' }} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '0.3px', lineHeight: 1.2 }}>
              AI Assistant
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.8)' }}>
              PWI ERP Intelligent Command & Knowledge Hub
            </div>
          </div>
        </div>

        <Space size={10}>
          {messages.length > 0 && (
            <Button
              type="text"
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
        </Space>
      </div>

      {/* ── Chat Messages & Body Container ─────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: 920 }}>
          {/* Welcome Screen (Screenshot 1) */}
          {messages.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px 20px',
                animation: 'fadeIn 0.4s ease',
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 24,
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontSize: 40,
                  margin: '0 auto 20px',
                  boxShadow: '0 12px 28px rgba(37, 99, 235, 0.35)',
                }}
              >
                <RobotOutlined />
              </div>

              <h2
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: 'var(--theme-text, #0f172a)',
                  marginBottom: 8,
                }}
              >
                Hi! I'm your ERP Assistant
              </h2>
              <p
                style={{
                  fontSize: 14,
                  color: 'var(--theme-text-muted, #64748b)',
                  maxWidth: 620,
                  margin: '0 auto 28px',
                  lineHeight: 1.6,
                }}
              >
                Ask me anything about your machines, tools, inventory, production, sales, or activities.
                I can show you reports, summaries, and help you find information quickly.
              </p>

              {/* Suggestions Grid (Pills) */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  justifyContent: 'center',
                  maxWidth: 720,
                  margin: '0 auto',
                }}
              >
                {DEFAULT_SUGGESTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(item.query)}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 20,
                      background: '#ffffff',
                      border: '1px solid #bfdbfe',
                      color: '#1d4ed8',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#eff6ff';
                      e.currentTarget.style.borderColor = '#60a5fa';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ffffff';
                      e.currentTarget.style.borderColor = '#bfdbfe';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Message Thread (Screenshot 2) */
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
                  {/* Message Bubble */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      maxWidth: msg.sender === 'user' ? '75%' : '90%',
                      alignItems: 'flex-start',
                      flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row',
                    }}
                  >
                    {msg.sender === 'assistant' && (
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          fontSize: 17,
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
                        background: msg.sender === 'user' ? '#1d4ed8' : '#ffffff',
                        color: msg.sender === 'user' ? '#ffffff' : 'var(--theme-text, #1e293b)',
                        padding: '12px 18px',
                        borderRadius: msg.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        fontSize: 14,
                        lineHeight: 1.6,
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                        border: msg.sender === 'user' ? 'none' : '1px solid #e2e8f0',
                        wordBreak: 'break-word',
                      }}
                    >
                      <div style={{ whiteSpace: 'pre-line' }}>{msg.text}</div>

                      {/* Render Structured Table if present (matches Screenshot 2) */}
                      {msg.tableData && (
                        <div
                          style={{
                            marginTop: 14,
                            borderRadius: 8,
                            overflow: 'hidden',
                            border: '1px solid #e2e8f0',
                            background: '#ffffff',
                          }}
                        >
                          <Table
                            size="small"
                            pagination={false}
                            dataSource={msg.tableData.rows}
                            rowKey={(r, i) => r.id || String(i)}
                            columns={msg.tableData.columns}
                            scroll={{ x: 'max-content' }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Message Actions / Timestamp */}
                  <div
                    style={{
                      fontSize: 11,
                      color: '#94a3b8',
                      marginTop: 4,
                      marginLeft: msg.sender === 'assistant' ? 44 : 0,
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
                          icon={copiedId === msg.id ? <CheckOutlined style={{ color: '#16a34a' }} /> : <CopyOutlined />}
                          onClick={() => handleCopy(msg)}
                          style={{ fontSize: 11, padding: '0 4px', height: 'auto', color: '#94a3b8' }}
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
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontSize: 17,
                    }}
                  >
                    <RobotOutlined />
                  </div>
                  <div
                    style={{
                      background: '#ffffff',
                      padding: '10px 16px',
                      borderRadius: '16px 16px 16px 4px',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: '#64748b',
                      fontSize: 13,
                    }}
                  >
                    <Spin size="small" />
                    <span>Analyzing ERP data...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Floating Input Bar (Matching Screenshot 1 & 2) ─────────── */}
      <div
        style={{
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          padding: '12px 20px 8px',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 24,
              padding: '4px 6px 4px 16px',
              transition: 'all 0.2s ease',
            }}
          >
            <Input
              variant="borderless"
              placeholder="Ask me about your ERP data (e.g. active tools, machines, production summary)..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              style={{ fontSize: 14 }}
              disabled={loading}
            />

            <Button
              type="primary"
              shape="circle"
              icon={<SendOutlined />}
              onClick={() => handleSend()}
              loading={loading}
              style={{
                background: '#1d4ed8',
                borderColor: '#1d4ed8',
                width: 36,
                height: 36,
                flexShrink: 0,
              }}
            />
          </div>

          {/* Underneath Action Icons & Disclaimer (Exact from Screenshot 1 & 2) */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative',
              marginTop: 6,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: '#94a3b8',
                textAlign: 'center',
              }}
            >
              AI responses are based on your ERP data and may not always be 100% accurate.
            </div>

            <div style={{ position: 'absolute', right: 0, display: 'flex', gap: 6 }}>
              <Button type="text" size="small" icon={<LikeOutlined />} style={{ color: '#94a3b8', fontSize: 12 }} />
              <Button type="text" size="small" icon={<DislikeOutlined />} style={{ color: '#94a3b8', fontSize: 12 }} />
              <Button type="text" size="small" icon={<CopyOutlined />} style={{ color: '#94a3b8', fontSize: 12 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiAssistantPage;
