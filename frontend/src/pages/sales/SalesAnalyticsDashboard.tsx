import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Row, Col, Table, Tabs, Select, DatePicker, Button,
  Tag, Progress, Space, Typography, App, Drawer, Descriptions,
  Segmented,
} from 'antd';
import {
  DashboardOutlined, ShoppingCartOutlined, InboxOutlined,
  CheckCircleOutlined, ClockCircleOutlined, DollarOutlined,
  BarChartOutlined, ReloadOutlined, FileExcelOutlined, PrinterOutlined,
  UserOutlined, AppstoreOutlined, BuildOutlined, ArrowUpOutlined,
  AlertOutlined, SafetyCertificateOutlined,
  FileTextOutlined, SwapOutlined, TrophyOutlined, RightCircleOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import './SalesInvoiceManagement.css';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface ActionKpiCardProps {
  value: string | number;
  label: string;
  icon: React.ReactNode;
  gradient: string;
  actionText: string;
  onAction?: () => void;
  prefix?: string;
  suffix?: string;
}

const ActionKpiCard: React.FC<ActionKpiCardProps> = ({
  value,
  label,
  icon,
  gradient,
  actionText,
  onAction,
  prefix,
  suffix,
}) => {
  return (
    <div
      onClick={onAction}
      className="action-kpi-card"
      style={{ background: gradient, cursor: onAction ? 'pointer' : 'default' }}
    >
      <div className="action-kpi-body">
        <div className="action-kpi-val">
          {prefix ? <span style={{ fontSize: 16, marginRight: 4, opacity: 0.9 }}>{prefix}</span> : null}
          {typeof value === 'number' ? formatDecimal(value, 0) : value}
          {suffix ? <span style={{ fontSize: 13, marginLeft: 4, opacity: 0.9 }}>{suffix}</span> : null}
        </div>
        <div className="action-kpi-label">{label}</div>
        <div className="action-kpi-watermark">{icon}</div>
      </div>
      <div className="action-kpi-footer">
        <span>{actionText}</span>
        <RightCircleOutlined style={{ fontSize: 13 }} />
      </div>
    </div>
  );
};

// Types
interface DashboardKPIs {
  totalSalesOrders: number;
  openOrders: number;
  ordersInProduction: number;
  finishedGoodsReady: number;
  pendingDelivery: number;
  deliveredOrders: number;
  invoicedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  grossSales?: number;
  returnCount?: number;
  returnAmount?: number;
  creditNotesCount?: number;
  creditNoteAmount?: number;
  netSales?: number;
  reconciledOutstanding?: number;
}

interface PipelineStage {
  stage: string;
  title: string;
  count: number;
  value: number;
  unit: string;
  color: string;
}

interface CustomerAnalytics {
  customerId: string;
  masterCustomerId?: string;
  customerCode: string;
  customerName: string;
  customerStatus: string;
  paymentTerms: string;
  totalQuotations: number;
  totalSalesOrders: number;
  orderedQuantity: number;
  producedQuantity: number;
  deliveredQuantity: number;
  returnedQuantity?: number;
  netSoldQuantity?: number;
  invoicedAmount: number;
  paidAmount: number;
  returnAmount?: number;
  creditNoteAmount?: number;
  netSales?: number;
  outstandingAmount: number;
  lastOrderDate: string | null;
  lastDeliveryDate: string | null;
  lastInvoiceDate: string | null;
  lastSaleDate?: string | null;
  lastReturnDate?: string | null;
}

interface ItemSalesAnalysis {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  uom: string;
  customerCount: number;
  orderedQuantity: number;
  producedQuantity: number;
  finishedGoodsAvailable: number;
  deliveredQuantity: number;
  invoicedQuantity: number;
  returnedQuantity: number;
  netSoldQuantity: number;
  salesAmount: number;
  invoicedValue?: number;
  returnValue?: number;
  netSalesValue?: number;
  averageSellingPrice: number;
  lastSaleDate: string | null;
}

interface MatrixCell {
  customerId: string;
  customerCode: string;
  customerName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  ordered: number;
  produced: number;
  delivered: number;
  returned?: number;
  netSold?: number;
  invoiced: number;
  paid?: number;
  outstanding?: number;
}

interface OrderFulfillment {
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  orderDate: string;
  status: string;
  orderedQuantity: number;
  producedQuantity: number;
  finishedGoodsAvailable: number;
  deliveredQuantity: number;
  remainingDeliveryQuantity: number;
  fulfillmentPercentage: number;
  items: Array<{
    itemId: string;
    itemCode: string;
    itemName: string;
    orderedQuantity: number;
    producedQuantity: number;
    finishedGoodsAvailable: number;
    deliveredQuantity: number;
    remainingDeliveryQuantity: number;
    fulfillmentPercentage: number;
  }>;
}

interface FinishedGoodsAvailability {
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  onHand: number;
  reserved: number;
  available: number;
  openSalesOrderQuantity: number;
  safetyStock: number;
  requiredStock: number;
  projectedBalance: number;
  status: string;
}

interface CustomerOutstanding {
  customerId: string;
  customerCode: string;
  customerName: string;
  invoiceCount: number;
  invoiceAmount: number;
  paidAmount: number;
  outstanding: number;
  oldestOutstandingDate: string | null;
  latestInvoiceDate: string | null;
  paymentTerms: string;
  customerStatus: string;
}

export const SalesAnalyticsDashboard: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();

  // Active Tab
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Filters
  const [period, setPeriod] = useState<string>('this_month');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [rankingMetric, setRankingMetric] = useState<string>('salesAmount');
  const [outstandingOnly, setOutstandingOnly] = useState<boolean>(false);
  const [matrixCustomerFilter, setMatrixCustomerFilter] = useState<string>('ALL');
  const [customerViewMode, setCustomerViewMode] = useState<string>('table');

  // Loading States
  const [loading, setLoading] = useState<boolean>(false);

  // Data States
  const [kpis, setKpis] = useState<DashboardKPIs>({
    totalSalesOrders: 0,
    openOrders: 0,
    ordersInProduction: 0,
    finishedGoodsReady: 0,
    pendingDelivery: 0,
    deliveredOrders: 0,
    invoicedAmount: 0,
    paidAmount: 0,
    outstandingAmount: 0,
  });
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [topItems, setTopItems] = useState<any[]>([]);
  const [customerAnalytics, setCustomerAnalytics] = useState<CustomerAnalytics[]>([]);
  const [customerRankings, setCustomerRankings] = useState<any[]>([]);
  const [itemAnalytics, setItemAnalytics] = useState<ItemSalesAnalysis[]>([]);
  const [matrixData, setMatrixData] = useState<MatrixCell[]>([]);
  const [fulfillmentData, setFulfillmentData] = useState<OrderFulfillment[]>([]);
  const [fgAvailability, setFgAvailability] = useState<FinishedGoodsAvailability[]>([]);
  const [outstandingReport, setOutstandingReport] = useState<CustomerOutstanding[]>([]);

  // Drawer / Statement States
  const [statementDrawerVisible, setStatementDrawerVisible] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [statementEntries, setStatementEntries] = useState<any[]>([]);
  const [statementLoading, setStatementLoading] = useState<boolean>(false);

  // Load Main Dashboard
  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { period };
      if (period === 'custom' && dateRange && dateRange[0] && dateRange[1]) {
        params.dateFrom = dateRange[0].format('YYYY-MM-DD');
        params.dateTo = dateRange[1].format('YYYY-MM-DD');
      }

      const res = await apiService.get<any>('/sales/analytics/dashboard', params);
      if (res?.success && res?.data) {
        const d = res.data;
        if (d.kpis) setKpis(d.kpis);
        if (d.salesPipeline) setPipeline(d.salesPipeline);
        if (d.customerSection?.topCustomersBySalesAmount) setTopCustomers(d.customerSection.topCustomersBySalesAmount);
        if (d.itemSection?.topSellingFinishedGoods) setTopItems(d.itemSection.topSellingFinishedGoods);
      }
    } catch (err: any) {
      console.error('Failed to load dashboard:', err);
      message.error('Failed to load Sales Intelligence Dashboard');
    } finally {
      setLoading(false);
    }
  }, [period, dateRange, message]);

  // Load Tab-specific data
  const loadTabData = useCallback(async (tab: string) => {
    setLoading(true);
    try {
      const params: any = { period };
      if (period === 'custom' && dateRange && dateRange[0] && dateRange[1]) {
        params.dateFrom = dateRange[0].format('YYYY-MM-DD');
        params.dateTo = dateRange[1].format('YYYY-MM-DD');
      }

      if (tab === 'customer_analytics') {
        const [resCust, resRank] = await Promise.all([
          apiService.get<any>('/sales/analytics/customer-analytics', params),
          apiService.get<any>('/sales/analytics/customer-rankings', { ...params, metric: rankingMetric }),
        ]);
        if (resCust?.success) setCustomerAnalytics(resCust.data || []);
        if (resRank?.success) setCustomerRankings(resRank.data || []);
      } else if (tab === 'item_analytics') {
        const res = await apiService.get<any>('/sales/analytics/item-analytics', params);
        if (res?.success) setItemAnalytics(res.data || []);
      } else if (tab === 'matrix') {
        const res = await apiService.get<any>('/sales/analytics/customer-item-matrix', params);
        if (res?.success) setMatrixData(res.data || []);
      } else if (tab === 'fulfillment') {
        const [resFul, resFg] = await Promise.all([
          apiService.get<any>('/sales/analytics/order-fulfillment', params),
          apiService.get<any>('/sales/analytics/finished-goods-availability', params),
        ]);
        if (resFul?.success) setFulfillmentData(resFul.data || []);
        if (resFg?.success) setFgAvailability(resFg.data || []);
      } else if (tab === 'outstanding') {
        const res = await apiService.get<any>('/sales/analytics/customer-outstanding', {
          ...params,
          outstandingOnly: outstandingOnly ? 'true' : 'false',
        });
        if (res?.success) setOutstandingReport(res.data || []);
      }
    } catch (err: any) {
      console.error(`Failed to load tab ${tab}:`, err);
      const msg = err?.response?.data?.message;
      message.error(
        Array.isArray(msg)
          ? String(msg[0])
          : `Failed to load ${tab.replace(/_/g, ' ')}`,
      );
    } finally {
      setLoading(false);
    }
  }, [period, dateRange, rankingMetric, outstandingOnly, message]);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadDashboardData();
    } else {
      loadTabData(activeTab);
    }
  }, [activeTab, loadDashboardData, loadTabData]);

  // Open Statement Drawer
  const handleOpenStatement = async (cust: any) => {
    setSelectedCustomer(cust);
    setStatementDrawerVisible(true);
    setStatementLoading(true);
    try {
      const res = await apiService.get<any>(`/customer/customers/${cust.customerId || cust.id}/statement`);
      if (res?.success) {
        setStatementEntries(res.data.entries || []);
      }
    } catch (err: any) {
      // Fallback: show an empty statement but never fail silently
      console.error('Failed to load customer statement:', err);
      setStatementEntries([]);
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? String(msg[0]) : 'Failed to load customer statement');
    } finally {
      setStatementLoading(false);
    }
  };

  // CSV Export Helper
  const handleExportCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) {
      message.warning('No data available to export');
      return;
    }
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(obj =>
      Object.values(obj)
        .map(val => `"${String(val ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}_${dayjs().format('YYYYMMDD_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ===================== COLUMNS =====================

  // Customer Analytics Columns
  const customerColumns: ColumnsType<CustomerAnalytics> = [
    {
      title: 'Customer Code',
      dataIndex: 'customerCode',
      key: 'customerCode',
      width: 120,
      render: (code) => <Tag color="blue" style={{ fontWeight: 600 }}>{code}</Tag>,
    },
    {
      title: 'Customer Name',
      dataIndex: 'customerName',
      key: 'customerName',
      width: 160,
      render: (name) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: 'Orders',
      dataIndex: 'totalSalesOrders',
      key: 'totalSalesOrders',
      align: 'right',
      width: 80,
    },
    {
      title: 'Ordered Qty',
      dataIndex: 'orderedQuantity',
      key: 'orderedQuantity',
      align: 'right',
      width: 100,
      render: (qty) => formatDecimal(qty, 0),
    },
    {
      title: 'Produced Qty',
      dataIndex: 'producedQuantity',
      key: 'producedQuantity',
      align: 'right',
      width: 105,
      render: (qty) => <span style={{ color: '#fa8c16' }}>{formatDecimal(qty, 0)}</span>,
    },
    {
      title: 'Delivered Qty',
      dataIndex: 'deliveredQuantity',
      key: 'deliveredQuantity',
      align: 'right',
      width: 105,
      render: (qty) => <span style={{ color: '#1890ff' }}>{formatDecimal(qty, 0)}</span>,
    },
    {
      title: 'Returned Qty',
      dataIndex: 'returnedQuantity',
      key: 'returnedQuantity',
      align: 'right',
      width: 105,
      render: (qty) => (
        <span style={{ color: (qty || 0) > 0 ? '#ff4d4f' : 'inherit', fontWeight: (qty || 0) > 0 ? 600 : 400 }}>
          {formatDecimal(qty || 0, 0)}
        </span>
      ),
    },
    {
      title: 'Net Sold Qty',
      dataIndex: 'netSoldQuantity',
      key: 'netSoldQuantity',
      align: 'right',
      width: 105,
      render: (qty, r) => {
        const net = qty !== undefined ? qty : Math.max(0, (r.deliveredQuantity || 0) - (r.returnedQuantity || 0));
        return <span style={{ color: '#52c41a', fontWeight: 600 }}>{formatDecimal(net, 0)}</span>;
      },
    },
    {
      title: 'Invoiced Amount',
      dataIndex: 'invoicedAmount',
      key: 'invoicedAmount',
      align: 'right',
      width: 130,
      render: (val) => `PKR ${formatDecimal(val, 2)}`,
    },
    {
      title: 'Return / Credit',
      key: 'creditNoteAmount',
      align: 'right',
      width: 130,
      render: (_, r) => {
        const ret = r.creditNoteAmount !== undefined ? r.creditNoteAmount : (r.returnAmount || 0);
        return <span style={{ color: ret > 0 ? '#fa8c16' : 'inherit' }}>PKR {formatDecimal(ret, 2)}</span>;
      },
    },
    {
      title: 'Net Sales',
      dataIndex: 'netSales',
      key: 'netSales',
      align: 'right',
      width: 130,
      render: (val, r) => {
        const net = val !== undefined ? val : Math.max(0, (r.invoicedAmount || 0) - (r.creditNoteAmount || r.returnAmount || 0));
        return <strong style={{ color: '#1890ff' }}>PKR {formatDecimal(net, 2)}</strong>;
      },
    },
    {
      title: 'Paid Amount',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      align: 'right',
      width: 130,
      render: (val) => <span style={{ color: '#52c41a' }}>PKR {formatDecimal(val, 2)}</span>,
    },
    {
      title: 'Outstanding',
      dataIndex: 'outstandingAmount',
      key: 'outstandingAmount',
      align: 'right',
      width: 130,
      render: (val) => (
        <span style={{ fontWeight: 700, color: val > 0 ? '#ff4d4f' : '#52c41a' }}>
          PKR {formatDecimal(val, 2)}
        </span>
      ),
    },
    {
      title: 'Last Order',
      dataIndex: 'lastOrderDate',
      key: 'lastOrderDate',
      width: 100,
      render: (d) => d || '—',
    },
    {
      title: 'Last Sale',
      dataIndex: 'lastSaleDate',
      key: 'lastSaleDate',
      width: 100,
      render: (d, r) => d || r.lastInvoiceDate || '—',
    },
    {
      title: 'Last Return',
      dataIndex: 'lastReturnDate',
      key: 'lastReturnDate',
      width: 100,
      render: (d) => (d ? <Tag color="volcano">{d}</Tag> : '—'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<FileTextOutlined />}
          onClick={() => handleOpenStatement(record)}
        >
          Statement
        </Button>
      ),
    },
  ];

  // Customer Dynamic Ranking Columns
  const rankingColumns: ColumnsType<any> = [
    {
      title: 'Rank',
      dataIndex: 'rank',
      key: 'rank',
      width: 80,
      align: 'center',
      render: (r) => (
        <Tag color={r === 1 ? 'gold' : r === 2 ? 'cyan' : r === 3 ? 'orange' : 'default'} style={{ fontWeight: 700 }}>
          #{r}
        </Tag>
      ),
    },
    {
      title: 'Customer Code',
      dataIndex: 'customerCode',
      key: 'customerCode',
      width: 130,
      render: (code) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: 'Customer Name',
      dataIndex: 'customerName',
      key: 'customerName',
      render: (name) => <span style={{ fontWeight: 600 }}>{name}</span>,
    },
    {
      title: 'Ranked Metric Value',
      dataIndex: 'metricValue',
      key: 'metricValue',
      align: 'right',
      render: (val) => (
        <span style={{ fontWeight: 700, color: '#722ed1' }}>
          {rankingMetric.includes('Amount') ? `PKR ${formatDecimal(val, 2)}` : formatDecimal(val, 0)}
        </span>
      ),
    },
    {
      title: 'Orders',
      dataIndex: 'orders',
      key: 'orders',
      align: 'right',
      width: 90,
    },
    {
      title: 'Delivered Qty',
      dataIndex: 'delivered',
      key: 'delivered',
      align: 'right',
      width: 120,
      render: (val) => formatDecimal(val, 0),
    },
    {
      title: 'Invoiced Amount',
      dataIndex: 'invoiced',
      key: 'invoiced',
      align: 'right',
      width: 140,
      render: (val) => `PKR ${formatDecimal(val, 2)}`,
    },
    {
      title: 'Paid Amount',
      dataIndex: 'paid',
      key: 'paid',
      align: 'right',
      width: 140,
      render: (val) => <span style={{ color: '#52c41a' }}>PKR ${formatDecimal(val, 2)}</span>,
    },
    {
      title: 'Outstanding',
      dataIndex: 'outstanding',
      key: 'outstanding',
      align: 'right',
      width: 140,
      render: (val) => (
        <span style={{ fontWeight: 700, color: val > 0 ? '#ff4d4f' : '#52c41a' }}>
          PKR ${formatDecimal(val, 2)}
        </span>
      ),
    },
  ];

  // Item Analytics Columns
  const itemColumns: ColumnsType<ItemSalesAnalysis> = [
    {
      title: 'Item Code',
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 120,
      render: (code) => <Tag color="geekblue" style={{ fontWeight: 600 }}>{code}</Tag>,
    },
    {
      title: 'Item Name',
      dataIndex: 'itemName',
      key: 'itemName',
      width: 160,
      render: (name) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: 'UOM',
      dataIndex: 'uom',
      key: 'uom',
      width: 70,
    },
    {
      title: 'Customers',
      dataIndex: 'customerCount',
      key: 'customerCount',
      align: 'right',
      width: 90,
    },
    {
      title: 'Ordered',
      dataIndex: 'orderedQuantity',
      key: 'orderedQuantity',
      align: 'right',
      width: 100,
      render: (qty) => formatDecimal(qty, 0),
    },
    {
      title: 'Produced',
      dataIndex: 'producedQuantity',
      key: 'producedQuantity',
      align: 'right',
      width: 100,
      render: (qty) => <span style={{ color: '#fa8c16' }}>{formatDecimal(qty, 0)}</span>,
    },
    {
      title: 'FG Available',
      dataIndex: 'finishedGoodsAvailable',
      key: 'finishedGoodsAvailable',
      align: 'right',
      width: 110,
      render: (qty) => <span style={{ color: '#13c2c2', fontWeight: 600 }}>{formatDecimal(qty, 0)}</span>,
    },
    {
      title: 'Delivered',
      dataIndex: 'deliveredQuantity',
      key: 'deliveredQuantity',
      align: 'right',
      width: 100,
      render: (qty) => <span style={{ color: '#1890ff' }}>{formatDecimal(qty, 0)}</span>,
    },
    {
      title: 'Returned',
      dataIndex: 'returnedQuantity',
      key: 'returnedQuantity',
      align: 'right',
      width: 100,
      render: (qty) => (
        <span style={{ color: (qty || 0) > 0 ? '#ff4d4f' : 'inherit', fontWeight: (qty || 0) > 0 ? 600 : 400 }}>
          {formatDecimal(qty || 0, 0)}
        </span>
      ),
    },
    {
      title: 'Net Sold',
      dataIndex: 'netSoldQuantity',
      key: 'netSoldQuantity',
      align: 'right',
      width: 100,
      render: (qty, r) => {
        const net = qty !== undefined ? qty : Math.max(0, (r.deliveredQuantity || 0) - (r.returnedQuantity || 0));
        return <span style={{ color: '#52c41a', fontWeight: 600 }}>{formatDecimal(net, 0)}</span>;
      },
    },
    {
      title: 'Invoiced Value',
      dataIndex: 'salesAmount',
      key: 'salesAmount',
      align: 'right',
      width: 130,
      render: (val, r) => `PKR ${formatDecimal(r.invoicedValue ?? val, 2)}`,
    },
    {
      title: 'Return Value',
      dataIndex: 'returnValue',
      key: 'returnValue',
      align: 'right',
      width: 120,
      render: (val) => {
        const ret = val || 0;
        return <span style={{ color: ret > 0 ? '#fa8c16' : 'inherit' }}>PKR {formatDecimal(ret, 2)}</span>;
      },
    },
    {
      title: 'Net Sales Value',
      dataIndex: 'netSalesValue',
      key: 'netSalesValue',
      align: 'right',
      width: 130,
      render: (val, r) => {
        const net = val !== undefined ? val : Math.max(0, (r.salesAmount || 0) - (r.returnValue || 0));
        return <strong style={{ color: '#1890ff' }}>PKR ${formatDecimal(net, 2)}</strong>;
      },
    },
    {
      title: 'Avg Price',
      dataIndex: 'averageSellingPrice',
      key: 'averageSellingPrice',
      align: 'right',
      width: 110,
      render: (val) => `PKR ${formatDecimal(val, 2)}`,
    },
    {
      title: 'Last Sale',
      dataIndex: 'lastSaleDate',
      key: 'lastSaleDate',
      width: 105,
      render: (d) => d || '—',
    },
  ];

  // Customer × Item Matrix Columns
  const matrixColumns: ColumnsType<MatrixCell> = [
    {
      title: 'Customer',
      dataIndex: 'customerName',
      key: 'customerName',
      width: 180,
      render: (_, r) => <span><strong>{r.customerCode}</strong> — {r.customerName}</span>,
    },
    {
      title: 'Finished Good Item',
      dataIndex: 'itemName',
      key: 'itemName',
      width: 180,
      render: (_, r) => <span><Tag color="cyan">{r.itemCode}</Tag> {r.itemName}</span>,
    },
    {
      title: 'UOM',
      dataIndex: 'uom',
      key: 'uom',
      width: 70,
    },
    {
      title: 'Ordered',
      dataIndex: 'ordered',
      key: 'ordered',
      align: 'right',
      width: 95,
      render: (val) => formatDecimal(val, 0),
    },
    {
      title: 'Produced',
      dataIndex: 'produced',
      key: 'produced',
      align: 'right',
      width: 95,
      render: (val) => <span style={{ color: '#fa8c16' }}>{formatDecimal(val, 0)}</span>,
    },
    {
      title: 'Delivered',
      dataIndex: 'delivered',
      key: 'delivered',
      align: 'right',
      width: 95,
      render: (val) => <span style={{ color: '#1890ff' }}>{formatDecimal(val, 0)}</span>,
    },
    {
      title: 'Returned',
      dataIndex: 'returned',
      key: 'returned',
      align: 'right',
      width: 95,
      render: (val) => (
        <span style={{ color: (val || 0) > 0 ? '#ff4d4f' : 'inherit' }}>
          {formatDecimal(val || 0, 0)}
        </span>
      ),
    },
    {
      title: 'Net Sold',
      dataIndex: 'netSold',
      key: 'netSold',
      align: 'right',
      width: 95,
      render: (val, r) => {
        const net = val !== undefined ? val : Math.max(0, (r.delivered || 0) - (r.returned || 0));
        return <span style={{ color: '#52c41a', fontWeight: 600 }}>{formatDecimal(net, 0)}</span>;
      },
    },
    {
      title: 'Invoiced Amount',
      dataIndex: 'invoiced',
      key: 'invoiced',
      align: 'right',
      width: 130,
      render: (val) => `PKR ${formatDecimal(val, 2)}`,
    },
    {
      title: 'Paid Amount',
      dataIndex: 'paid',
      key: 'paid',
      align: 'right',
      width: 130,
      render: (val) => <span style={{ color: '#52c41a' }}>PKR ${formatDecimal(val || 0, 2)}</span>,
    },
    {
      title: 'Outstanding',
      dataIndex: 'outstanding',
      key: 'outstanding',
      align: 'right',
      width: 130,
      render: (val, r) => {
        const bal = val !== undefined ? val : Math.max(0, (r.invoiced || 0) - (r.paid || 0));
        return (
          <span style={{ fontWeight: 700, color: bal > 0 ? '#ff4d4f' : '#52c41a' }}>
            PKR {formatDecimal(bal, 2)}
          </span>
        );
      },
    },
  ];

  // Order Fulfillment Columns
  const fulfillmentColumns: ColumnsType<OrderFulfillment> = [
    {
      title: 'Order No',
      dataIndex: 'orderNumber',
      key: 'orderNumber',
      width: 140,
      render: (no) => <Tag color="purple" style={{ fontWeight: 600 }}>{no}</Tag>,
    },
    {
      title: 'Customer',
      dataIndex: 'customerName',
      key: 'customerName',
      width: 200,
    },
    {
      title: 'Order Date',
      dataIndex: 'orderDate',
      key: 'orderDate',
      width: 110,
      render: (d) => d ? dayjs(d).format('YYYY-MM-DD') : '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (st) => <Tag color={st === 'Delivered' ? 'green' : st === 'Confirmed' ? 'blue' : 'orange'}>{st}</Tag>,
    },
    {
      title: 'Ordered',
      dataIndex: 'orderedQuantity',
      key: 'orderedQuantity',
      align: 'right',
      width: 100,
      render: (qty) => formatDecimal(qty, 0),
    },
    {
      title: 'Produced',
      dataIndex: 'producedQuantity',
      key: 'producedQuantity',
      align: 'right',
      width: 100,
      render: (qty) => <span style={{ color: '#fa8c16' }}>{formatDecimal(qty, 0)}</span>,
    },
    {
      title: 'FG Available',
      dataIndex: 'finishedGoodsAvailable',
      key: 'finishedGoodsAvailable',
      align: 'right',
      width: 110,
      render: (qty) => <span style={{ color: '#13c2c2', fontWeight: 600 }}>{formatDecimal(qty, 0)}</span>,
    },
    {
      title: 'Delivered',
      dataIndex: 'deliveredQuantity',
      key: 'deliveredQuantity',
      align: 'right',
      width: 100,
      render: (qty) => <span style={{ color: '#52c41a' }}>{formatDecimal(qty, 0)}</span>,
    },
    {
      title: 'Remaining',
      dataIndex: 'remainingDeliveryQuantity',
      key: 'remainingDeliveryQuantity',
      align: 'right',
      width: 100,
      render: (qty) => <span style={{ color: qty > 0 ? '#ff4d4f' : '#52c41a' }}>{formatDecimal(qty, 0)}</span>,
    },
    {
      title: 'Fulfillment %',
      dataIndex: 'fulfillmentPercentage',
      key: 'fulfillmentPercentage',
      width: 160,
      render: (pct) => (
        <Progress
          percent={pct}
          size="small"
          status={pct >= 100 ? 'success' : pct > 0 ? 'active' : 'normal'}
        />
      ),
    },
  ];

  // Finished Goods Planning Columns
  const fgPlanningColumns: ColumnsType<FinishedGoodsAvailability> = [
    {
      title: 'Item Code',
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 130,
      render: (code) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: 'Item Name',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (name) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: 'UOM',
      dataIndex: 'uom',
      key: 'uom',
      width: 70,
    },
    {
      title: 'Current Stock',
      dataIndex: 'onHand',
      key: 'onHand',
      align: 'right',
      width: 110,
      render: (qty) => <span style={{ fontWeight: 600 }}>{formatDecimal(qty, 0)}</span>,
    },
    {
      title: 'Reserved Stock',
      dataIndex: 'reserved',
      key: 'reserved',
      align: 'right',
      width: 110,
      render: (qty) => <span style={{ color: '#8c8c8c' }}>{formatDecimal(qty || 0, 0)}</span>,
    },
    {
      title: 'Available Stock',
      dataIndex: 'available',
      key: 'available',
      align: 'right',
      width: 115,
      render: (qty, r) => {
        const avail = qty !== undefined ? qty : Math.max(0, (r.onHand || 0) - (r.reserved || 0));
        return <span style={{ color: '#13c2c2', fontWeight: 600 }}>{formatDecimal(avail, 0)}</span>;
      },
    },
    {
      title: 'Open Orders',
      dataIndex: 'openSalesOrderQuantity',
      key: 'openSalesOrderQuantity',
      align: 'right',
      width: 110,
      render: (qty) => <span style={{ color: '#fa8c16' }}>{formatDecimal(qty, 0)}</span>,
    },
    {
      title: 'Safety Stock',
      dataIndex: 'safetyStock',
      key: 'safetyStock',
      align: 'right',
      width: 105,
      render: (qty) => formatDecimal(qty, 0),
    },
    {
      title: 'Required Stock',
      dataIndex: 'requiredStock',
      key: 'requiredStock',
      align: 'right',
      width: 120,
      render: (qty) => formatDecimal(qty, 0),
    },
    {
      title: 'Projected Balance',
      dataIndex: 'projectedBalance',
      key: 'projectedBalance',
      align: 'right',
      width: 140,
      render: (bal) => (
        <span style={{ fontWeight: 700, color: bal < 0 ? '#ff4d4f' : '#52c41a' }}>
          {formatDecimal(bal, 0)}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (st) => {
        let color = 'green';
        let text = 'Above Requirement';
        if (st === 'SHORTAGE') {
          color = 'error';
          text = 'Stock Shortage';
        } else if (st === 'BELOW_REQUIREMENT') {
          color = 'warning';
          text = 'Below Safety Stock';
        } else if (st === 'AT_REQUIREMENT') {
          color = 'blue';
          text = 'At Requirement';
        }
        return <Tag color={color}>{text}</Tag>;
      },
    },
  ];

  // Customer Outstanding Columns
  const outstandingColumns: ColumnsType<CustomerOutstanding> = [
    {
      title: 'Customer Code',
      dataIndex: 'customerCode',
      key: 'customerCode',
      width: 130,
      render: (c) => <Tag color="blue">{c}</Tag>,
    },
    {
      title: 'Customer Name',
      dataIndex: 'customerName',
      key: 'customerName',
    },
    {
      title: 'Invoice Count',
      dataIndex: 'invoiceCount',
      key: 'invoiceCount',
      align: 'right',
      width: 110,
    },
    {
      title: 'Invoiced Amount',
      dataIndex: 'invoiceAmount',
      key: 'invoiceAmount',
      align: 'right',
      width: 140,
      render: (val) => `PKR ${formatDecimal(val, 2)}`,
    },
    {
      title: 'Paid Amount',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      align: 'right',
      width: 140,
      render: (val) => <span style={{ color: '#52c41a' }}>PKR ${formatDecimal(val, 2)}</span>,
    },
    {
      title: 'Outstanding Balance',
      dataIndex: 'outstanding',
      key: 'outstanding',
      align: 'right',
      width: 150,
      render: (val) => (
        <span style={{ fontWeight: 700, color: val > 0 ? '#ff4d4f' : '#52c41a' }}>
          PKR {formatDecimal(val, 2)}
        </span>
      ),
    },
    {
      title: 'Oldest Invoice',
      dataIndex: 'oldestOutstandingDate',
      key: 'oldestOutstandingDate',
      width: 120,
      render: (d) => d || '—',
    },
    {
      title: 'Latest Invoice',
      dataIndex: 'latestInvoiceDate',
      key: 'latestInvoiceDate',
      width: 120,
      render: (d) => d || '—',
    },
    {
      title: 'Action',
      key: 'action',
      width: 100,
      render: (_, r) => (
        <Button size="small" type="link" onClick={() => handleOpenStatement(r)}>
          Ledger
        </Button>
      ),
    },
  ];

  // Customer Filter options for Matrix
  const customerFilterOptions = useMemo(() => {
    const set = new Set<string>();
    matrixData.forEach(m => set.add(m.customerName));
    return Array.from(set);
  }, [matrixData]);

  const filteredMatrix = useMemo(() => {
    if (matrixCustomerFilter === 'ALL') return matrixData;
    return matrixData.filter(m => m.customerName === matrixCustomerFilter);
  }, [matrixData, matrixCustomerFilter]);

  return (
    <div className="sales-invoice-container" style={{ padding: 24 }}>
      {/* Page Header */}
      <div className="sales-header" style={{ marginBottom: 20 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              <DashboardOutlined style={{ marginRight: 10, color: '#722ed1' }} />
              Sales Intelligence & Analytics
            </Title>
            <Text type="secondary">
              Authoritative real-time intelligence across Quotations, Orders, Production, Finished Goods, Dispatch, Invoicing & Receivables
            </Text>
          </Col>
          <Col>
            <Space>
              <Select
                value={period}
                onChange={(val) => setPeriod(val)}
                style={{ width: 140 }}
                options={[
                  { value: 'today', label: 'Today' },
                  { value: 'this_week', label: 'This Week' },
                  { value: 'this_month', label: 'This Month' },
                  { value: 'this_quarter', label: 'This Quarter' },
                  { value: 'this_year', label: 'This Year' },
                  { value: 'custom', label: 'Custom Range' },
                ]}
              />
              {period === 'custom' && (
                <RangePicker
                  value={dateRange}
                  onChange={(dates) => setDateRange(dates as any)}
                  style={{ width: 240 }}
                />
              )}
              <Button
                icon={<ReloadOutlined />}
                onClick={() => (activeTab === 'dashboard' ? loadDashboardData() : loadTabData(activeTab))}
                loading={loading}
              >
                Refresh
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => window.print()}
              >
                Print
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Main Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        items={[
          {
            key: 'dashboard',
            label: (
              <span>
                <DashboardOutlined /> Executive Dashboard & Pipeline
              </span>
            ),
            children: (
              <div>
                {/* Row 1: Operational Pipeline & Fulfillment */}
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--inv-text-secondary, #64748b)' }}>
                    Operational Pipeline & Fulfillment
                  </Text>
                </div>
                <Row gutter={[14, 14]} style={{ marginBottom: 20 }}>
                  <Col xs={24} sm={12} md={8} lg={4}>
                    <ActionKpiCard
                      value={kpis.totalSalesOrders}
                      label="Sales Orders"
                      icon={<ShoppingCartOutlined />}
                      gradient="linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)"
                      actionText="View orders"
                      onAction={() => navigate('/sales/orders')}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={4}>
                    <ActionKpiCard
                      value={kpis.openOrders}
                      label="Open Orders Demand"
                      icon={<ClockCircleOutlined />}
                      gradient="linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
                      actionText="Track demand"
                      onAction={() => setActiveTab('fulfillment')}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={4}>
                    <ActionKpiCard
                      value={kpis.ordersInProduction}
                      label="In Production"
                      icon={<BuildOutlined />}
                      gradient="linear-gradient(135deg, #0d9488 0%, #0f766e 100%)"
                      actionText="Production orders"
                      onAction={() => navigate('/sales/orders')}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={4}>
                    <ActionKpiCard
                      value={kpis.finishedGoodsReady}
                      label="FG Ready Inventory"
                      icon={<AppstoreOutlined />}
                      gradient="linear-gradient(135deg, #0284c7 0%, #0369a1 100%)"
                      actionText="View FG inventory"
                      onAction={() => setActiveTab('fulfillment')}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={4}>
                    <ActionKpiCard
                      value={kpis.pendingDelivery}
                      label="Pending Delivery"
                      icon={<InboxOutlined />}
                      gradient="linear-gradient(135deg, #ea580c 0%, #c2410c 100%)"
                      actionText="View dispatches"
                      onAction={() => navigate('/sales/deliveries')}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={4}>
                    <ActionKpiCard
                      value={kpis.deliveredOrders}
                      label="Delivered Orders"
                      icon={<CheckCircleOutlined />}
                      gradient="linear-gradient(135deg, #16a34a 0%, #15803d 100%)"
                      actionText="Delivery history"
                      onAction={() => navigate('/sales/deliveries')}
                    />
                  </Col>
                </Row>

                {/* Row 2: Financial Reconciliation (Audited Ledger Totals) */}
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--inv-text-secondary, #64748b)' }}>
                    Financial Reconciliation & Ledger Auditing
                  </Text>
                </div>
                <Row gutter={[14, 14]} style={{ marginBottom: 24 }}>
                  <Col xs={24} sm={12} md={12} lg={4} xl={4}>
                    <ActionKpiCard
                      value={formatDecimal(kpis.grossSales !== undefined ? kpis.grossSales : kpis.invoicedAmount, 2)}
                      prefix="PKR"
                      label="Gross Sales (Invoiced)"
                      icon={<DollarOutlined />}
                      gradient="linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)"
                      actionText="All sales invoices"
                      onAction={() => navigate('/sales/invoices')}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={12} lg={5} xl={5}>
                    <ActionKpiCard
                      value={formatDecimal(kpis.creditNoteAmount !== undefined ? kpis.creditNoteAmount : (kpis.returnAmount || 0), 2)}
                      prefix="PKR"
                      label={`Returns & Credit (${kpis.creditNotesCount || kpis.returnCount || 0} CNs)`}
                      icon={<RollbackOutlined />}
                      gradient="linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)"
                      actionText="View returns"
                      onAction={() => navigate('/sales/returns')}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={12} lg={5} xl={5}>
                    <ActionKpiCard
                      value={formatDecimal(kpis.netSales !== undefined ? kpis.netSales : ((kpis.grossSales ?? kpis.invoicedAmount) - (kpis.creditNoteAmount ?? 0)), 2)}
                      prefix="PKR"
                      label="Net Sales (Audited)"
                      icon={<FileTextOutlined />}
                      gradient="linear-gradient(135deg, #1e293b 0%, #0f172a 100%)"
                      actionText="View invoices"
                      onAction={() => navigate('/sales/invoices')}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={12} lg={5} xl={5}>
                    <ActionKpiCard
                      value={formatDecimal(kpis.paidAmount, 2)}
                      prefix="PKR"
                      label="Customer Payments Received"
                      icon={<ArrowUpOutlined />}
                      gradient="linear-gradient(135deg, #10b981 0%, #059669 100%)"
                      actionText="Customer statements"
                      onAction={() => setActiveTab('outstanding')}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={12} lg={5} xl={5}>
                    <ActionKpiCard
                      value={formatDecimal(kpis.reconciledOutstanding !== undefined ? kpis.reconciledOutstanding : kpis.outstandingAmount, 2)}
                      prefix="PKR"
                      label="Outstanding Receivables"
                      icon={<DollarOutlined />}
                      gradient="linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
                      actionText="Chase unpaid invoices"
                      onAction={() => setActiveTab('outstanding')}
                    />
                  </Col>
                </Row>

                {/* Visual Sales Pipeline (5 in Top Row, 4 in Bottom Row) */}
                <Card
                  title={
                    <Space>
                      <BarChartOutlined style={{ color: '#722ed1' }} />
                      <span>Authoritative Sales & Return Pipeline</span>
                    </Space>
                  }
                  style={{ marginBottom: 24 }}
                >
                  {/* Row 1: Stages 1 to 5 (5 Cards) */}
                  <div className="pipeline-grid-5">
                    {pipeline.slice(0, 5).map((p, idx) => (
                      <div
                        key={p.stage}
                        className="pipeline-stage-box"
                        style={{ borderTop: `4px solid ${p.color}` }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Tag color={p.color} style={{ fontSize: 11, fontWeight: 700, borderRadius: 12, margin: 0 }}>
                            STAGE {idx + 1}
                          </Tag>
                          <span style={{ fontSize: 11, color: 'var(--inv-text-muted, #94a3b8)', fontWeight: 500 }}>
                            {p.unit}
                          </span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--inv-text-primary, #0f172a)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.title}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: p.color, marginTop: 8, lineHeight: 1.1 }}>
                          {p.count}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--inv-text-secondary, #64748b)', marginTop: 6, fontWeight: 500 }}>
                          {p.unit === 'PKR' ? `PKR ${formatDecimal(p.value, 0)}` : `${formatDecimal(p.value, 0)} ${p.unit}`}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Row 2: Stages 6 to 9 (4 Cards) */}
                  <div className="pipeline-grid-4">
                    {pipeline.slice(5, 9).map((p, idx) => (
                      <div
                        key={p.stage}
                        className="pipeline-stage-box"
                        style={{ borderTop: `4px solid ${p.color}` }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Tag color={p.color} style={{ fontSize: 11, fontWeight: 700, borderRadius: 12, margin: 0 }}>
                            STAGE {idx + 6}
                          </Tag>
                          <span style={{ fontSize: 11, color: 'var(--inv-text-muted, #94a3b8)', fontWeight: 500 }}>
                            {p.unit}
                          </span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--inv-text-primary, #0f172a)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.title}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: p.color, marginTop: 8, lineHeight: 1.1 }}>
                          {p.count}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--inv-text-secondary, #64748b)', marginTop: 6, fontWeight: 500 }}>
                          {p.unit === 'PKR' ? `PKR ${formatDecimal(p.value, 0)}` : `${formatDecimal(p.value, 0)} ${p.unit}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Highlights: Top Customers & Top Finished Goods */}
                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={12}>
                    <Card
                      title={
                        <Space>
                          <UserOutlined style={{ color: '#1890ff' }} />
                          <span>Top Customers by Sales Value</span>
                        </Space>
                      }
                      extra={
                        <Button type="link" size="small" onClick={() => setActiveTab('customer_analytics')}>
                          View All
                        </Button>
                      }
                    >
                      <Table
                        size="small"
                        dataSource={topCustomers}
                        rowKey="customerId"
                        pagination={false}
                        columns={[
                          { title: 'Customer', dataIndex: 'customerName', key: 'customerName' },
                          { title: 'Orders', dataIndex: 'totalSalesOrders', key: 'totalSalesOrders', align: 'right' },
                          {
                            title: 'Invoiced',
                            dataIndex: 'invoicedAmount',
                            key: 'invoicedAmount',
                            align: 'right',
                            render: (val) => `PKR ${formatDecimal(val, 2)}`,
                          },
                          {
                            title: 'Outstanding',
                            dataIndex: 'outstandingAmount',
                            key: 'outstandingAmount',
                            align: 'right',
                            render: (val) => (
                              <span style={{ color: val > 0 ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
                                PKR ${formatDecimal(val, 2)}
                              </span>
                            ),
                          },
                        ]}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} lg={12}>
                    <Card
                      title={
                        <Space>
                          <AppstoreOutlined style={{ color: '#52c41a' }} />
                          <span>Top Selling Finished Goods</span>
                        </Space>
                      }
                      extra={
                        <Button type="link" size="small" onClick={() => setActiveTab('item_analytics')}>
                          View All
                        </Button>
                      }
                    >
                      <Table
                        size="small"
                        dataSource={topItems}
                        rowKey="itemId"
                        pagination={false}
                        columns={[
                          { title: 'Finished Good', dataIndex: 'itemName', key: 'itemName' },
                          { title: 'Delivered', dataIndex: 'deliveredQuantity', key: 'deliveredQuantity', align: 'right' },
                          {
                            title: 'Sales Value',
                            dataIndex: 'salesAmount',
                            key: 'salesAmount',
                            align: 'right',
                            render: (val) => `PKR ${formatDecimal(val, 2)}`,
                          },
                          {
                            title: 'Available Stock',
                            dataIndex: 'finishedGoodsAvailable',
                            key: 'finishedGoodsAvailable',
                            align: 'right',
                            render: (val) => <Tag color="cyan">{formatDecimal(val, 0)}</Tag>,
                          },
                        ]}
                      />
                    </Card>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'customer_analytics',
            label: (
              <span>
                <UserOutlined /> Customer Sales Analytics & Rankings
              </span>
            ),
            children: (
              <div>
                {/* Ranking selector bar */}
                {/* Mode & Ranking Selector Bar */}
                <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                  <Col>
                    <Space size="middle">
                      <Segmented
                        value={customerViewMode}
                        onChange={(val) => setCustomerViewMode(val as string)}
                        options={[
                          { label: 'All Customer Analytics', value: 'table' },
                          { label: 'Ranked Leaderboard', value: 'rankings' },
                        ]}
                      />
                      {customerViewMode === 'rankings' && (
                        <Space>
                          <TrophyOutlined style={{ color: '#faad14' }} />
                          <Text strong>Rank By:</Text>
                          <Select
                            value={rankingMetric}
                            onChange={(val) => {
                              setRankingMetric(val);
                              loadTabData('customer_analytics');
                            }}
                            style={{ width: 190 }}
                            options={[
                              { value: 'salesAmount', label: 'Sales / Invoiced Value' },
                              { value: 'deliveredQuantity', label: 'Delivered Quantity' },
                              { value: 'paidAmount', label: 'Paid Amount' },
                              { value: 'outstandingAmount', label: 'Outstanding Balance' },
                              { value: 'orderCount', label: 'Total Order Count' },
                            ]}
                          />
                        </Space>
                      )}
                    </Space>
                  </Col>
                  <Col>
                    <Button
                      icon={<FileExcelOutlined />}
                      onClick={() => handleExportCSV(customerViewMode === 'rankings' ? customerRankings : customerAnalytics, 'Customer_Sales_Analytics')}
                    >
                      Export CSV
                    </Button>
                  </Col>
                </Row>

                <Table
                  dataSource={customerViewMode === 'rankings' ? customerRankings : customerAnalytics}
                  columns={customerViewMode === 'rankings' ? rankingColumns : customerColumns}
                  rowKey="customerId"
                  loading={loading}
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 15 }}
                />
              </div>
            ),
          },
          {
            key: 'item_analytics',
            label: (
              <span>
                <AppstoreOutlined /> Item & Finished Goods Analytics
              </span>
            ),
            children: (
              <div>
                <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                  <Col>
                    <Title level={4} style={{ margin: 0 }}>
                      Finished Goods Sales Performance & Stock Visibility
                    </Title>
                    <Text type="secondary">
                      Analysis limited exclusively to sellable Finished Goods items
                    </Text>
                  </Col>
                  <Col>
                    <Button
                      icon={<FileExcelOutlined />}
                      onClick={() => handleExportCSV(itemAnalytics, 'Item_Sales_Analytics')}
                    >
                      Export CSV
                    </Button>
                  </Col>
                </Row>

                <Table
                  dataSource={itemAnalytics}
                  columns={itemColumns}
                  rowKey="itemId"
                  loading={loading}
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 15 }}
                />
              </div>
            ),
          },
          {
            key: 'matrix',
            label: (
              <span>
                <SwapOutlined /> Customer × Item Matrix
              </span>
            ),
            children: (
              <div>
                <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                  <Col>
                    <Space>
                      <Text strong>Filter by Customer:</Text>
                      <Select
                        value={matrixCustomerFilter}
                        onChange={setMatrixCustomerFilter}
                        style={{ width: 240 }}
                      >
                        <Select.Option value="ALL">All Customers</Select.Option>
                        {customerFilterOptions.map(c => (
                          <Select.Option key={c} value={c}>{c}</Select.Option>
                        ))}
                      </Select>
                    </Space>
                  </Col>
                  <Col>
                    <Button
                      icon={<FileExcelOutlined />}
                      onClick={() => handleExportCSV(filteredMatrix, 'Customer_Item_Matrix')}
                    >
                      Export CSV
                    </Button>
                  </Col>
                </Row>

                <Table
                  dataSource={filteredMatrix}
                  columns={matrixColumns}
                  rowKey={(r) => `${r.customerId}_${r.itemId}`}
                  loading={loading}
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 15 }}
                />
              </div>
            ),
          },
          {
            key: 'fulfillment',
            label: (
              <span>
                <SafetyCertificateOutlined /> Order Fulfillment & FG Planning
              </span>
            ),
            children: (
              <div>
                <Row gutter={[16, 16]}>
                  {/* Fulfillment Table */}
                  <Col span={24}>
                    <Card
                      title={
                        <Space>
                          <ShoppingCartOutlined style={{ color: '#722ed1' }} />
                          <span>Sales Order Fulfillment Progress</span>
                        </Space>
                      }
                      extra={
                        <Button
                          icon={<FileExcelOutlined />}
                          size="small"
                          onClick={() => handleExportCSV(fulfillmentData, 'Order_Fulfillment')}
                        >
                          Export CSV
                        </Button>
                      }
                      style={{ marginBottom: 24 }}
                    >
                      <Table
                        dataSource={fulfillmentData}
                        columns={fulfillmentColumns}
                        rowKey="orderId"
                        loading={loading}
                        scroll={{ x: 'max-content' }}
                        pagination={{ pageSize: 10 }}
                      />
                    </Card>
                  </Col>

                  {/* Safety Stock & Open Orders FG Planning */}
                  <Col span={24}>
                    <Card
                      title={
                        <Space>
                          <AlertOutlined style={{ color: '#fa8c16' }} />
                          <span>Finished Goods Planning: Safety Stock & Open Demand</span>
                        </Space>
                      }
                      extra={
                        <Button
                          icon={<FileExcelOutlined />}
                          size="small"
                          onClick={() => handleExportCSV(fgAvailability, 'FG_Planning')}
                        >
                          Export CSV
                        </Button>
                      }
                    >
                      <Table
                        dataSource={fgAvailability}
                        columns={fgPlanningColumns}
                        rowKey="itemId"
                        loading={loading}
                        scroll={{ x: 'max-content' }}
                        pagination={{ pageSize: 10 }}
                      />
                    </Card>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'outstanding',
            label: (
              <span>
                <DollarOutlined /> Customer Outstanding & Statements
              </span>
            ),
            children: (
              <div>
                <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                  <Col>
                    <Space>
                      <Segmented
                        value={outstandingOnly ? 'outstanding' : 'all'}
                        onChange={(val) => {
                          setOutstandingOnly(val === 'outstanding');
                          loadTabData('outstanding');
                        }}
                        options={[
                          { label: 'All Customers', value: 'all' },
                          { label: 'Outstanding Receivables Only', value: 'outstanding' },
                        ]}
                      />
                    </Space>
                  </Col>
                  <Col>
                    <Button
                      icon={<FileExcelOutlined />}
                      onClick={() => handleExportCSV(outstandingReport, 'Customer_Outstanding')}
                    >
                      Export CSV
                    </Button>
                  </Col>
                </Row>

                <Table
                  dataSource={outstandingReport}
                  columns={outstandingColumns}
                  rowKey="customerId"
                  loading={loading}
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 15 }}
                />
              </div>
            ),
          },
        ]}
      />

      {/* Customer Statement Drawer */}
      <Drawer
        title={
          <Space>
            <FileTextOutlined style={{ color: '#1890ff' }} />
            <span>Customer Statement: {selectedCustomer?.customerName}</span>
          </Space>
        }
        width="min(750px, 100vw)"
        open={statementDrawerVisible}
        onClose={() => setStatementDrawerVisible(false)}
        extra={
          <Button
            icon={<PrinterOutlined />}
            onClick={() => window.print()}
          >
            Print Statement
          </Button>
        }
      >
        {selectedCustomer && (
          <div>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 20 }}>
              <Descriptions.Item label="Customer Code">
                <Tag color="blue">{selectedCustomer.customerCode}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color="green">{selectedCustomer.customerStatus || 'ACTIVE'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Payment Terms">
                {selectedCustomer.paymentTerms || 'Net 30 Days'}
              </Descriptions.Item>
              <Descriptions.Item label="Outstanding Balance">
                <span style={{ fontWeight: 700, color: '#ff4d4f' }}>
                  PKR {formatDecimal(selectedCustomer.outstanding || selectedCustomer.outstandingAmount || 0, 2)}
                </span>
              </Descriptions.Item>
            </Descriptions>

            <Title level={5}>Chronological Ledger Entries</Title>
            <Table
              size="small"
              loading={statementLoading}
              dataSource={statementEntries}
              rowKey={(r, idx) => r.id || String(idx)}
              pagination={false}
              columns={[
                {
                  title: 'Date',
                  dataIndex: 'transactionDate',
                  key: 'transactionDate',
                  render: (d) => dayjs(d).format('YYYY-MM-DD'),
                },
                {
                  title: 'Doc Number',
                  dataIndex: 'documentNumber',
                  key: 'documentNumber',
                  render: (num) => <strong>{num}</strong>,
                },
                {
                  title: 'Type',
                  dataIndex: 'documentType',
                  key: 'documentType',
                  render: (t) => {
                    let color = 'blue';
                    if (t === 'CREDIT_NOTE') color = 'purple';
                    else if (t === 'CUSTOMER_PAYMENT') color = 'green';
                    else if (t === 'OPENING_BALANCE') color = 'gold';
                    else if (t === 'SALES_RETURN') color = 'volcano';
                    return <Tag color={color}>{t}</Tag>;
                  },
                },
                {
                  title: 'Description',
                  key: 'description',
                  render: (_, r) => <span>{r.reference || r.description || '—'}</span>,
                },
                {
                  title: 'Debit',
                  dataIndex: 'debit',
                  key: 'debit',
                  align: 'right',
                  render: (val) => Number(val) > 0 ? formatDecimal(val, 2) : '—',
                },
                {
                  title: 'Credit',
                  dataIndex: 'credit',
                  key: 'credit',
                  align: 'right',
                  render: (val) => Number(val) > 0 ? <span style={{ color: '#52c41a' }}>{formatDecimal(val, 2)}</span> : '—',
                },
                {
                  title: 'Balance',
                  dataIndex: 'runningBalance',
                  key: 'runningBalance',
                  align: 'right',
                  render: (val) => <strong>{formatDecimal(val, 2)}</strong>,
                },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  render: (st) => <Tag color={st === 'POSTED' ? 'green' : 'default'}>{st || 'POSTED'}</Tag>,
                },
              ]}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default SalesAnalyticsDashboard;
