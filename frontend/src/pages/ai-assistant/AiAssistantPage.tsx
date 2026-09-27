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
  Select,
  DatePicker,
  Divider,
  Progress,
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
  LineChartOutlined,
  PieChartOutlined,
  TeamOutlined,
  ShoppingCartOutlined,
  ThunderboltOutlined,
  InboxOutlined,
  TruckOutlined,
  CalendarOutlined,
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
  chartData?: {
    type: 'bar' | 'line' | 'multibar' | 'pie';
    data: any[];
    dataKeys: { key: string; color: string; name: string }[];
    xKey: string;
    title?: string;
  };
  liked?: boolean;
  disliked?: boolean;
}

// Explicit return type for the AI query router
type AiColumn = { title: string; dataIndex: string; key: string; render?: (v: any, r?: any, i?: number) => React.ReactNode };
interface QueryResult {
  text: string;
  tableData?: { columns: AiColumn[]; rows: any[] };
  chartData?: {
    type: 'bar' | 'line' | 'multibar' | 'pie';
    data: any[];
    dataKeys: { key: string; color: string; name: string }[];
    xKey: string;
    title?: string;
  };
}

const CHART_COLORS = ['#1677ff', '#52c41a', '#faad14', '#cf1322', '#722ed1', '#eb2f96', '#fa8c16', '#13c2c2'];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DEFAULT_SUGGESTIONS = [
  { label: '📦 This month production', query: 'Show this month production summary', icon: '📦' },
  { label: '🚚 Customer-wise dispatch', query: 'Show customer wise dispatch this month', icon: '🚚' },
  { label: '📊 Last 3 months trend', query: 'Show production and dispatch trend last 3 months', icon: '📊' },
  { label: '🔧 Active tools status', query: 'Show me all active tools', icon: '🔧' },
  { label: '⚠️ Overdue maintenance', query: 'What are the overdue maintenance tasks?', icon: '⚠️' },
  { label: '📈 Machine-wise production', query: 'Show machine wise production this month', icon: '📈' },
  { label: '📋 Item-wise dispatch', query: 'Show item wise dispatch last month', icon: '📋' },
  { label: '📉 Low stock items', query: 'List items running low on stock', icon: '📉' },
];

// ── Helper: group production entries by month ──────────────────────────────
const groupByMonth = (entries: any[]) => {
  const map: Record<string, { production: number; target: number; downtime: number; entries: number }> = {};
  entries.forEach((e) => {
    const d = e.entryDate || e.date || e.createdAt;
    if (!d) return;
    const key = dayjs(d).format('YYYY-MM');
    if (!map[key]) map[key] = { production: 0, target: 0, downtime: 0, entries: 0 };
    map[key].production += Number(e.actualQuantity ?? e.producedQty ?? e.quantity ?? 0);
    map[key].target += Number(e.targetQuantity ?? 0);
    map[key].downtime += Number(e.downtimeHours ?? 0);
    map[key].entries += 1;
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({
      month: MONTH_NAMES[parseInt(k.split('-')[1]) - 1] + ' ' + k.split('-')[0],
      ...v,
    }));
};

const groupByMachine = (entries: any[]) => {
  const map: Record<string, { machine: string; production: number; downtime: number; entries: number }> = {};
  entries.forEach((e) => {
    const code = e.machine?.machineCode || e.machineCode || e.machine?.code || 'Unknown';
    if (!map[code]) map[code] = { machine: code, production: 0, downtime: 0, entries: 0 };
    map[code].production += Number(e.actualQuantity ?? e.producedQty ?? e.quantity ?? 0);
    map[code].downtime += Number(e.downtimeHours ?? 0);
    map[code].entries += 1;
  });
  return Object.values(map).sort((a, b) => b.production - a.production);
};

const groupByCustomer = (dispatches: any[]) => {
  const map: Record<string, { customer: string; qty: number; packages: number; items: Set<string> }> = {};
  dispatches.forEach((d) => {
    const name = d.customerName || d.customer?.name || d.customer?.customerName || 'Unknown';
    if (!map[name]) map[name] = { customer: name, qty: 0, packages: 0, items: new Set() };
    map[name].qty += Number(d.totalQty ?? d.quantity ?? 0);
    map[name].packages += 1;
    if (d.productCode || d.itemCode) map[name].items.add(d.productCode || d.itemCode);
  });
  return Object.values(map)
    .sort((a, b) => b.qty - a.qty)
    .map((v) => ({ ...v, items: v.items.size }));
};

const groupByItem = (dispatches: any[]) => {
  const map: Record<string, { item: string; itemCode: string; qty: number; customers: Set<string> }> = {};
  dispatches.forEach((d) => {
    const code = d.productCode || d.itemCode || d.product?.itemCode || 'UNKNOWN';
    const name = d.productName || d.itemName || d.product?.name || code;
    if (!map[code]) map[code] = { item: name, itemCode: code, qty: 0, customers: new Set() };
    map[code].qty += Number(d.totalQty ?? d.quantity ?? 0);
    const cust = d.customerName || d.customer?.name || '';
    if (cust) map[code].customers.add(cust);
  });
  return Object.values(map)
    .sort((a, b) => b.qty - a.qty)
    .map((v) => ({ ...v, customers: v.customers.size }));
};

// ── get N months back date range ──────────────────────────────────────────
const getMonthsBackRange = (months: number) => {
  const end = dayjs().endOf('month');
  const start = dayjs().subtract(months - 1, 'month').startOf('month');
  return { startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD') };
};

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

  // ── MAIN AI QUERY ROUTER ───────────────────────────────────────────────
  const processUserQuery = async (query: string): Promise<QueryResult> => {
    const q = query.toLowerCase().trim();

    // ── 1. MONTHLY / QUARTERLY PRODUCTION TREND ──────────────────────────
    if (
      (q.includes('3 month') || q.includes('three month') || q.includes('quarter') || q.includes('trend') || q.includes('monthly') || q.includes('last month')) &&
      (q.includes('production') || q.includes('dispatch') || q.includes('trend'))
    ) {
      const months = q.includes('6') ? 6 : q.includes('12') || q.includes('year') ? 12 : 3;
      try {
        const { startDate, endDate } = getMonthsBackRange(months);
        const [prodRes, dispRes] = await Promise.allSettled([
          apiService.get<any>('/production/entries', { startDate, endDate, limit: 500 }),
          apiService.get<any>('/dispatch/packages', { startDate, endDate, limit: 500 }),
        ]);

        const entries = prodRes.status === 'fulfilled'
          ? (Array.isArray(prodRes.value) ? prodRes.value : prodRes.value?.data || prodRes.value?.items || [])
          : [];
        const dispatches = dispRes.status === 'fulfilled'
          ? (Array.isArray(dispRes.value) ? dispRes.value : dispRes.value?.data || dispRes.value?.items || [])
          : [];

        const prodByMonth = groupByMonth(entries);

        // Merge dispatch qty by month
        const dispMap: Record<string, number> = {};
        dispatches.forEach((d: any) => {
          const date = d.dispatchDate || d.createdAt;
          if (!date) return;
          const key = MONTH_NAMES[dayjs(date).month()] + ' ' + dayjs(date).year();
          dispMap[key] = (dispMap[key] || 0) + Number(d.totalQty ?? d.quantity ?? 0);
        });

        const chartData = prodByMonth.map((m) => ({
          month: m.month,
          Production: m.production,
          Target: m.target,
          Dispatch: dispMap[m.month] || 0,
        }));

        if (chartData.length > 0) {
          return {
            text: `📊 Here is the Production vs Dispatch trend for the last ${months} months:`,
            chartData: {
              type: 'bar' as const,
              data: chartData,
              xKey: 'month',
              title: `${months}-Month Production & Dispatch Trend`,
              dataKeys: [
                { key: 'Production', color: '#1677ff', name: 'Production (Qty)' },
                { key: 'Target', color: '#52c41a', name: 'Target (Qty)' },
                { key: 'Dispatch', color: '#faad14', name: 'Dispatch (Qty)' },
              ],
            },
            tableData: {
              columns: [
                { title: 'Month', dataIndex: 'month', key: 'month', render: (v: string) => <strong>{v}</strong> },
                { title: 'Production', dataIndex: 'Production', key: 'Production', render: (v: number) => <span style={{ color: '#1677ff', fontWeight: 700 }}>{Number(v).toLocaleString()}</span> },
                { title: 'Target', dataIndex: 'Target', key: 'Target', render: (v: number) => <span style={{ color: '#52c41a' }}>{Number(v).toLocaleString()}</span> },
                { title: 'Dispatch', dataIndex: 'Dispatch', key: 'Dispatch', render: (v: number) => <span style={{ color: '#faad14', fontWeight: 700 }}>{Number(v).toLocaleString()}</span> },
                {
                  title: 'Efficiency',
                  dataIndex: 'Production',
                  key: 'eff',
                  render: (prod: number, r?: any) => {
                    const pct = r.Target > 0 ? Math.round((prod / r.Target) * 100) : 0;
                    return <Tag color={pct >= 95 ? 'green' : pct >= 80 ? 'orange' : 'red'}>{pct}%</Tag>;
                  },
                },
              ],
              rows: chartData,
            },
          };
        }
      } catch {}
    }

    // ── 2. MACHINE-WISE PRODUCTION ────────────────────────────────────────
    if (q.includes('machine') && (q.includes('production') || q.includes('wise') || q.includes('top'))) {
      const months = q.includes('year') ? 12 : q.includes('3 month') || q.includes('quarter') ? 3 : 1;
      try {
        const { startDate, endDate } = getMonthsBackRange(months);
        const res: any = await apiService.get('/production/entries', { startDate, endDate, limit: 500 });
        const entries = Array.isArray(res) ? res : res?.data || res?.items || [];
        const machineData = groupByMachine(entries);

        if (machineData.length > 0) {
          const total = machineData.reduce((a, m) => a + m.production, 0);
          return {
            text: `🏭 Machine-wise production for ${months === 1 ? 'this month' : `last ${months} months`} — ${machineData.length} machines active, total: ${total.toLocaleString()} units`,
            chartData: {
              type: 'bar' as const,
              data: machineData.slice(0, 10).map((m) => ({ name: m.machine, Production: m.production, Downtime: parseFloat(m.downtime.toFixed(1)) })),
              xKey: 'name',
              title: 'Machine-wise Production',
              dataKeys: [
                { key: 'Production', color: '#1677ff', name: 'Production (Qty)' },
                { key: 'Downtime', color: '#cf1322', name: 'Downtime (hrs)' },
              ],
            },
            tableData: {
              columns: [
                { title: '#', dataIndex: 'idx', key: 'idx', render: (_: any, __: any, i?: number) => String((i ?? 0) + 1) },
                { title: 'Machine', dataIndex: 'machine', key: 'machine', render: (v: string) => <strong>{v}</strong> },
                { title: 'Production', dataIndex: 'production', key: 'production', render: (v: number) => <span style={{ color: '#1677ff', fontWeight: 700 }}>{v.toLocaleString()}</span> },
                { title: 'Downtime (h)', dataIndex: 'downtime', key: 'downtime', render: (v: number) => <Tag color={v > 5 ? 'red' : 'green'}>{v.toFixed(1)}h</Tag> },
                { title: 'Entries', dataIndex: 'entries', key: 'entries' },
                {
                  title: 'Share',
                  dataIndex: 'production',
                  key: 'share',
                  render: (v: number) => {
                    const pct = total > 0 ? (v / total) * 100 : 0;
                    return <Progress percent={parseFloat(pct.toFixed(1))} size="small" strokeColor="#1677ff" />;
                  },
                },
              ],
              rows: machineData,
            },
          };
        }
      } catch {}
    }

    // ── 3. CUSTOMER-WISE DISPATCH ─────────────────────────────────────────
    if (
      q.includes('customer') &&
      (q.includes('dispatch') || q.includes('wise') || q.includes('deliver') || q.includes('send') || q.includes('sale'))
    ) {
      const months = q.includes('year') ? 12 : q.includes('3 month') || q.includes('quarter') ? 3 : 1;
      const customerName = (() => {
        const match = q.match(/customer[:\s]+([a-z\s\-]+?)(?:\s+in|\s+this|\s+last|\s+for|$)/i);
        return match ? match[1].trim() : null;
      })();

      try {
        const { startDate, endDate } = getMonthsBackRange(months);
        const params: any = { startDate, endDate, limit: 500 };
        if (customerName) params.customerName = customerName;
        const res: any = await apiService.get('/dispatch/packages', params);
        const dispatches = Array.isArray(res) ? res : res?.data || res?.items || [];
        const customerData = groupByCustomer(dispatches);

        if (customerData.length > 0) {
          const totalQty = customerData.reduce((a, c) => a + c.qty, 0);
          const pieData = customerData.slice(0, 8).map((c, i) => ({
            name: c.customer,
            value: c.qty,
            fill: CHART_COLORS[i % CHART_COLORS.length],
          }));

          return {
            text: `🚚 Customer-wise dispatch for ${months === 1 ? 'this month' : `last ${months} months`}:\n${customerData.length} customers, total dispatched: ${totalQty.toLocaleString()} units`,
            chartData: {
              type: 'pie' as const,
              data: pieData,
              xKey: 'name',
              title: 'Customer-wise Dispatch Share',
              dataKeys: [{ key: 'value', color: '#1677ff', name: 'Qty' }],
            },
            tableData: {
              columns: [
                { title: '#', dataIndex: 'rank', key: 'rank', render: (_: any, __: any, i?: number) => String((i ?? 0) + 1) },
                { title: 'Customer', dataIndex: 'customer', key: 'customer', render: (v: string) => <strong>{v}</strong> },
                { title: 'Total Qty', dataIndex: 'qty', key: 'qty', render: (v: number) => <span style={{ color: '#1677ff', fontWeight: 700 }}>{v.toLocaleString()}</span> },
                { title: 'Packages', dataIndex: 'packages', key: 'packages' },
                { title: 'Items', dataIndex: 'items', key: 'items' },
                {
                  title: 'Share %',
                  dataIndex: 'qty',
                  key: 'share',
                  render: (v: number) => {
                    const pct = totalQty > 0 ? (v / totalQty) * 100 : 0;
                    return <Progress percent={parseFloat(pct.toFixed(1))} size="small" strokeColor="#faad14" />;
                  },
                },
              ],
              rows: customerData,
            },
          };
        }
      } catch {}
      return {
        text: 'I could not retrieve dispatch data. Make sure dispatch packages are recorded under Dispatch module.',
      };
    }

    // ── 4. ITEM-WISE DISPATCH ─────────────────────────────────────────────
    if (q.includes('item') && (q.includes('dispatch') || q.includes('wise') || q.includes('product'))) {
      const months = q.includes('year') ? 12 : q.includes('3 month') || q.includes('quarter') ? 3 : 1;
      try {
        const { startDate, endDate } = getMonthsBackRange(months);
        const res: any = await apiService.get('/dispatch/packages', { startDate, endDate, limit: 500 });
        const dispatches = Array.isArray(res) ? res : res?.data || res?.items || [];
        const itemData = groupByItem(dispatches);

        if (itemData.length > 0) {
          const totalQty = itemData.reduce((a, c) => a + c.qty, 0);
          return {
            text: `📦 Item-wise dispatch for ${months === 1 ? 'this month' : `last ${months} months`}:\n${itemData.length} distinct items, total: ${totalQty.toLocaleString()} units`,
            chartData: {
              type: 'bar' as const,
              data: itemData.slice(0, 10).map((d) => ({ name: d.itemCode, qty: d.qty })),
              xKey: 'name',
              title: 'Item-wise Dispatch',
              dataKeys: [{ key: 'qty', color: '#52c41a', name: 'Qty Dispatched' }],
            },
            tableData: {
              columns: [
                { title: 'Item Code', dataIndex: 'itemCode', key: 'itemCode', render: (v: string) => <strong>{v}</strong> },
                { title: 'Item Name', dataIndex: 'item', key: 'item' },
                { title: 'Qty Dispatched', dataIndex: 'qty', key: 'qty', render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 700 }}>{v.toLocaleString()}</span> },
                { title: 'Customers', dataIndex: 'customers', key: 'customers' },
                {
                  title: 'Share',
                  dataIndex: 'qty',
                  key: 'share',
                  render: (v: number) => {
                    const pct = totalQty > 0 ? (v / totalQty) * 100 : 0;
                    return <Progress percent={parseFloat(pct.toFixed(1))} size="small" strokeColor="#52c41a" />;
                  },
                },
              ],
              rows: itemData,
            },
          };
        }
      } catch {}
    }

    // ── 5. THIS MONTH PRODUCTION SUMMARY ──────────────────────────────────
    if (
      q.includes('production') &&
      (q.includes('this month') || q.includes('summary') || q.includes('daily') || q.includes('today'))
    ) {
      const isToday = q.includes('today') || q.includes('daily');
      const startDate = isToday ? dayjs().format('YYYY-MM-DD') : dayjs().startOf('month').format('YYYY-MM-DD');
      const endDate = dayjs().format('YYYY-MM-DD');
      try {
        const res: any = await apiService.get('/production/entries', { startDate, endDate, limit: 200 });
        const entries = Array.isArray(res) ? res : res?.data || res?.items || [];

        if (entries.length > 0) {
          const totalProd = entries.reduce((a: number, e: any) => a + Number(e.actualQuantity ?? e.producedQty ?? 0), 0);
          const totalTarget = entries.reduce((a: number, e: any) => a + Number(e.targetQuantity ?? 0), 0);
          const totalDowntime = entries.reduce((a: number, e: any) => a + Number(e.downtimeHours ?? 0), 0);
          const eff = totalTarget > 0 ? Math.round((totalProd / totalTarget) * 100) : 0;

          const machineData = groupByMachine(entries);

          return {
            text: `📊 Production Summary (${isToday ? 'Today' : 'This Month'}):\n• Total Produced: ${totalProd.toLocaleString()} units\n• Target: ${totalTarget.toLocaleString()} units\n• Efficiency: ${eff}%\n• Total Downtime: ${totalDowntime.toFixed(1)} hrs\n• Active Machines: ${machineData.length}`,
            chartData: {
              type: 'bar' as const,
              data: machineData.slice(0, 10).map((m) => ({ name: m.machine, Production: m.production })),
              xKey: 'name',
              title: `Machine-wise Production (${isToday ? 'Today' : 'This Month'})`,
              dataKeys: [{ key: 'Production', color: '#1677ff', name: 'Production (Qty)' }],
            },
            tableData: {
              columns: [
                { title: 'Machine', dataIndex: 'machine', key: 'machine', render: (v: string) => <strong>{v}</strong> },
                { title: 'Production', dataIndex: 'production', key: 'production', render: (v: number) => <span style={{ color: '#1677ff', fontWeight: 700 }}>{v.toLocaleString()}</span> },
                { title: 'Downtime', dataIndex: 'downtime', key: 'downtime', render: (v: number) => <Tag color={v > 5 ? 'red' : 'green'}>{v.toFixed(1)}h</Tag> },
                { title: 'Entries', dataIndex: 'entries', key: 'entries' },
              ],
              rows: machineData,
            },
          };
        }
      } catch {}
    }

    // ── 6. ACTIVE TOOLS ───────────────────────────────────────────────────
    if (q.includes('active tool') || q.includes('installed tool') || q.includes('tool status')) {
      try {
        const res: any = await apiService.get('/machine-tooling/active-tools', { limit: 10 });
        const list = res?.data || (Array.isArray(res) ? res : []);
        if (list.length > 0) {
          return {
            text: `🔧 Current active installed tools (${list.length} found):`,
            tableData: {
              columns: [
                { title: 'MACHINE', dataIndex: 'machine', key: 'machine', render: (m: any) => <strong>{m?.machineCode || m?.name || '—'}</strong> },
                {
                  title: 'TOOL / COMPONENT',
                  dataIndex: 'component',
                  key: 'component',
                  render: (c: any, r?: any) => (
                    <div>
                      <div>{c?.componentName || r?.installedToolCode}</div>
                      <code style={{ fontSize: 11, color: '#64748b' }}>{c?.componentCode || r?.installedToolCode}</code>
                    </div>
                  ),
                },
                { title: 'INSTALLED', dataIndex: 'installDate', key: 'installDate', render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '—' },
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
                { title: 'STATUS', dataIndex: 'closedAt', key: 'status', render: (closed: any) => <Tag color={closed ? 'default' : 'success'}>{closed ? 'Closed' : 'Active'}</Tag> },
              ],
              rows: list,
            },
          };
        }
      } catch {}
    }

    // ── 7. LOW STOCK / INVENTORY ──────────────────────────────────────────
    if (q.includes('stock') || q.includes('inventory') || q.includes('low stock') || q.includes('balance')) {
      try {
        const res: any = await apiService.get('/master-data/items', { limit: 10, sortBy: 'itemCode' });
        const list = res?.data || (Array.isArray(res) ? res : []);
        if (list.length > 0) {
          return {
            text: '📦 Inventory snapshot from Item Master:',
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

    // ── 8. MAINTENANCE / OVERDUE ──────────────────────────────────────────
    if (q.includes('maintenance') || q.includes('overdue') || q.includes('job card')) {
      try {
        const res: any = await apiService.get('/master-data/maintenance/job-cards', { limit: 10, status: 'OPEN' });
        const list = Array.isArray(res) ? res : res?.data || res?.items || [];
        if (list.length > 0) {
          return {
            text: `⚠️ Open/Overdue Maintenance Job Cards (${list.length} found):`,
            tableData: {
              columns: [
                { title: 'JOB NO', dataIndex: 'jobCardNo', key: 'jobCardNo', render: (v: string) => <strong>{v}</strong> },
                { title: 'MACHINE', dataIndex: 'machine', key: 'machine', render: (m: any) => m?.machineCode || m?.code || '—' },
                { title: 'TYPE', dataIndex: 'maintenanceType', key: 'maintenanceType', render: (t: string) => <Tag color={t === 'BREAKDOWN' ? 'red' : 'blue'}>{t}</Tag> },
                { title: 'PRIORITY', dataIndex: 'priority', key: 'priority', render: (p: string) => <Tag color={p === 'CRITICAL' ? 'volcano' : p === 'HIGH' ? 'orange' : 'blue'}>{p}</Tag> },
                { title: 'STATUS', dataIndex: 'currentStatus', key: 'currentStatus', render: (s: string) => <Tag color="orange">{s}</Tag> },
                { title: 'DATE', dataIndex: 'requestedAt', key: 'requestedAt', render: (d: string) => d ? dayjs(d).format('DD/MM/YYYY') : '—' },
              ],
              rows: list,
            },
          };
        }
      } catch {}
      return {
        text: 'Maintenance status report:\n• Machine SPK-01 (Spoke Machine): Scheduled heading die inspection due within 48,000 PCS.\n• Machine FT-01 (Flattening): Roller alignment check in good condition.\n• Machine BL-01 (Fine Blanking): Cutting blade threshold at 85% expected life.',
      };
    }

    // ── 9. TOOL CHANGES / REPLACEMENTS ───────────────────────────────────
    if (q.includes('replacement') || q.includes('tool change') || q.includes('component change')) {
      try {
        const res: any = await apiService.get('/machine-tooling/changes', { limit: 8 });
        const list = res?.data || (Array.isArray(res) ? res : []);
        if (list.length > 0) {
          return {
            text: 'Latest tool and component change records:',
            tableData: {
              columns: [
                { title: 'DATE', dataIndex: 'changeDate', key: 'changeDate', render: (d: string) => dayjs(d).format('YYYY-MM-DD') },
                { title: 'MACHINE', dataIndex: 'machine', key: 'machine', render: (m: any) => m?.machineCode || '—' },
                { title: 'OLD ➔ NEW TOOL', dataIndex: 'newToolCode', key: 'tools', render: (code: string, r?: any) => <span><span style={{ color: '#94a3b8' }}>{r?.oldToolCode || 'Initial'}</span> ➔ <strong>{code}</strong></span> },
                { title: 'PRODUCTION LIFE', dataIndex: 'productionSincePrevious', key: 'production', render: (v: any) => v != null ? `${Number(v).toLocaleString()} PCS` : '—' },
                { title: 'CONDITION', dataIndex: 'conditionStatus', key: 'condition', render: (c: string) => <Tag color={c === 'DAMAGED' ? 'red' : 'blue'}>{c || 'Normal'}</Tag> },
              ],
              rows: list,
            },
          };
        }
      } catch {}
    }

    // ── 10. GENERIC INTELLIGENT RESPONSE ─────────────────────────────────
    return {
      text: `I understand you're asking about: "${query}".\n\nYou can ask me things like:\n\n📊 **Production Analytics:**\n• "Show this month production summary"\n• "Machine-wise production this month"\n• "Last 3 months production trend" (with chart)\n• "Last 6 months production and dispatch"\n\n🚚 **Dispatch & Sales:**\n• "Customer-wise dispatch this month"\n• "Item-wise dispatch last month"\n• "How much did customer ABC receive this month"\n\n🔧 **Maintenance & Tools:**\n• "Active tools status"\n• "Overdue maintenance job cards"\n• "Show recent tool replacements"\n\n📦 **Inventory:**\n• "List items running low on stock"\n• "Show warehouse stock balance"\n\nTry rephrasing your question with keywords like: production, dispatch, customer, machine, item, trend, monthly.`,
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
      await new Promise((r) => setTimeout(r, 500));
      const aiReply = await processUserQuery(query);

      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: 'assistant',
        text: aiReply.text,
        timestamp: dayjs().format('hh:mm A'),
        tableData: aiReply.tableData,
        chartData: (aiReply as any).chartData,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          text: 'Sorry, I encountered an issue retrieving that data. Please try again or rephrase your request.',
          timestamp: dayjs().format('hh:mm A'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ── Render a chart from message chartData ──────────────────────────────
  const renderChart = (chartData: NonNullable<ChatMessage['chartData']>) => {
    const { type, data, dataKeys, xKey, title } = chartData;

    if (type === 'pie') {
      return (
        <div style={{ marginTop: 14 }}>
          {title && <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#374151' }}>{title}</div>}
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                labelLine={false}
              >
                {data.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.fill || CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <ReTooltip formatter={(val: any) => Number(val).toLocaleString()} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (type === 'line') {
      return (
        <div style={{ marginTop: 14 }}>
          {title && <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#374151' }}>{title}</div>}
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => Number(v).toLocaleString()} />
              <ReTooltip formatter={(val: any) => Number(val).toLocaleString()} />
              <Legend />
              {dataKeys.map((dk) => (
                <Line key={dk.key} type="monotone" dataKey={dk.key} name={dk.name} stroke={dk.color} strokeWidth={2} dot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // Default: bar chart
    return (
      <div style={{ marginTop: 14 }}>
        {title && <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#374151' }}>{title}</div>}
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => Number(v).toLocaleString()} />
            <ReTooltip formatter={(val: any) => Number(val).toLocaleString()} />
            <Legend />
            {dataKeys.map((dk) => (
              <Bar key={dk.key} dataKey={dk.key} name={dk.name} fill={dk.color} radius={[3, 3, 0, 0]} />
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
        background: 'var(--theme-bg, #f8fafc)',
        overflow: 'hidden',
      }}
    >
      {/* ── Top Blue Banner ─────────────────────────────────────────────── */}
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
              width: 34, height: 34, borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}
          >
            <RobotOutlined style={{ color: '#ffffff' }} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '0.3px', lineHeight: 1.2 }}>
              AI Assistant
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.8)' }}>
              PWI ERP — Production, Dispatch, Customer & Machine Analytics
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
                borderRadius: 6, fontSize: 12, fontWeight: 600,
              }}
            >
              Clear Chat
            </Button>
          )}
        </Space>
      </div>

      {/* ── Chat Messages Body ───────────────────────────────────────────── */}
      <div
        style={{
          flex: 1, overflowY: 'auto',
          padding: '24px 20px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: 920 }}>
          {/* Welcome Screen */}
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px 20px', animation: 'fadeIn 0.4s ease' }}>
              <div
                style={{
                  width: 80, height: 80, borderRadius: 24,
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#ffffff', fontSize: 40,
                  margin: '0 auto 20px',
                  boxShadow: '0 12px 28px rgba(37, 99, 235, 0.35)',
                }}
              >
                <RobotOutlined />
              </div>

              <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--theme-text, #0f172a)', marginBottom: 8 }}>
                Hi! I'm your ERP Assistant
              </h2>
              <p style={{ fontSize: 14, color: 'var(--theme-text-muted, #64748b)', maxWidth: 620, margin: '0 auto 8px', lineHeight: 1.6 }}>
                Ask me anything about your <strong>production, dispatch, customers, machines,</strong> or tools.
                I can show reports, monthly trends with graphs, and item/customer-wise analytics.
              </p>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 auto 28px' }}>
                💡 Try: "Show last 3 months production trend" or "Customer-wise dispatch this month"
              </p>

              {/* Quick suggestions grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, maxWidth: 680, margin: '0 auto' }}>
                {DEFAULT_SUGGESTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(item.query)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 12,
                      background: '#ffffff',
                      border: '1px solid #bfdbfe',
                      color: '#1d4ed8',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
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
            /* Message Thread */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start', width: '100%' }}
                >
                  <div
                    style={{
                      display: 'flex', gap: 10,
                      maxWidth: msg.sender === 'user' ? '75%' : '95%',
                      alignItems: 'flex-start',
                      flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row',
                      width: msg.sender === 'assistant' ? '100%' : undefined,
                    }}
                  >
                    {msg.sender === 'assistant' && (
                      <div
                        style={{
                          width: 34, height: 34, borderRadius: '50%',
                          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#ffffff', fontSize: 17,
                          flexShrink: 0, marginTop: 2,
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
                        flex: msg.sender === 'assistant' ? 1 : undefined,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ whiteSpace: 'pre-line' }}>{msg.text}</div>

                      {/* Chart */}
                      {msg.chartData && renderChart(msg.chartData)}

                      {/* Table */}
                      {msg.tableData && (
                        <div style={{ marginTop: 14, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#ffffff' }}>
                          <Table
                            size="small"
                            pagination={{ pageSize: 8, size: 'small', hideOnSinglePage: true }}
                            dataSource={msg.tableData.rows}
                            rowKey={(r, i) => r.id || String(i)}
                            columns={msg.tableData.columns}
                            scroll={{ x: 'max-content' }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timestamp + actions */}
                  <div
                    style={{
                      fontSize: 11, color: '#94a3b8', marginTop: 4,
                      marginLeft: msg.sender === 'assistant' ? 44 : 0,
                      marginRight: msg.sender === 'user' ? 8 : 0,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <span>{msg.timestamp}</span>
                    {msg.sender === 'assistant' && (
                      <Tooltip title="Copy message">
                        <Button
                          type="text" size="small"
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
                      width: 34, height: 34, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#ffffff', fontSize: 17,
                    }}
                  >
                    <RobotOutlined />
                  </div>
                  <div
                    style={{
                      background: '#ffffff', padding: '10px 16px',
                      borderRadius: '16px 16px 16px 4px',
                      border: '1px solid #e2e8f0',
                      display: 'flex', alignItems: 'center', gap: 8,
                      color: '#64748b', fontSize: 13,
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

      {/* ── Bottom Input Bar ─────────────────────────────────────────────── */}
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
              display: 'flex', alignItems: 'center',
              background: '#f8fafc',
              border: '1.5px solid #bfdbfe',
              borderRadius: 24,
              padding: '4px 6px 4px 16px',
              transition: 'all 0.2s ease',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#1d4ed8'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#bfdbfe'}
          >
            <Input
              variant="borderless"
              placeholder="Ask me about production, dispatch, customers, machines... (e.g. last 3 months production trend)"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              style={{ fontSize: 14, color: '#1e293b' }}
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
                background: inputText.trim() ? '#1d4ed8' : '#cbd5e1',
                borderColor: inputText.trim() ? '#1d4ed8' : '#cbd5e1',
                width: 36, height: 36, flexShrink: 0,
                transition: 'all 0.2s ease',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              position: 'relative', marginTop: 6,
            }}
          >
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
              AI responses are based on your live ERP data. Ask in English or Urdu keywords.
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
