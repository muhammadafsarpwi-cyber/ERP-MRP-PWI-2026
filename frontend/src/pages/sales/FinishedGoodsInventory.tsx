import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Card, Row, Col, Select, Input, Button, Tag, Space,
  App, Modal, Form, InputNumber, DatePicker, Tooltip, Switch, Badge,
} from 'antd';
import {
  DatabaseOutlined, ReloadOutlined, FileExcelOutlined, PrinterOutlined,
  SearchOutlined, AlertOutlined, CheckCircleOutlined,
  BuildOutlined, WarningOutlined,
  InboxOutlined, FilterOutlined, CloseOutlined, ClearOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { usePermission } from '../../hooks/usePermission';
import GlobalLoading from '../../components/shared/GlobalLoading';
import { SaveResultDialog } from '../../components/shared';
import type { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import './SalesInvoiceManagement.css';

interface FinishedGoodsItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  divisionId: string | null;
  divisionCode: string | null;
  divisionName: string | null;
  sectionId: string | null;
  sectionCode: string | null;
  sectionName: string | null;
  uomId: string;
  uomCode: string;
  uomName: string;
  physicalStock: number;
  committedStock: number;
  availableStock: number;
  safetyStock: number;
  aboveSafetyStock: number;
  openSalesOrderQty: number;
  newOrderQty: number;
  netAvailableAfterOrders?: number;
  projectedBalance: number;
  shortageQty: number;
  orderShortageQty?: number;
  productionRequirementQty?: number;
  excessQty?: number;
  onProductionQty: number;
  status: 'AVAILABLE' | 'LOW_STOCK' | 'BELOW_SAFETY_STOCK' | 'SHORT' | 'EXCESS' | 'ON_PRODUCTION';
  statusLabel: string;
  canFulfillImmediate: boolean;
  productionRequired: boolean;
}

interface UomBreakdown {
  uomCode: string;
  uomName: string;
  totalPhysicalStock: number;
  totalCommittedStock: number;
  totalAvailableStock: number;
  totalSafetyStock: number;
  totalShortageQty: number;
  totalOrderShortageQty?: number;
  totalProductionRequirementQty?: number;
  totalOnProductionQty: number;
  itemCount: number;
}

interface SummaryData {
  totalItems: number;
  itemsWithSufficientStock: number;
  itemsBelowSafetyStock: number;
  itemsShort: number;
  itemsWithExcessStock: number;
  itemsOnProduction: number;
  totalOpenSalesOrdersCount: number;
  totalProductionRequirementItems?: number;
  uomBreakdowns: Record<string, UomBreakdown>;
}

const FinishedGoodsInventory: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const canPlanProduction = can('production.orders.create') || can('sales.orders.update');

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FinishedGoodsItem[]>([]);
  const [summary, setSummary] = useState<SummaryData>({
    totalItems: 0,
    itemsWithSufficientStock: 0,
    itemsBelowSafetyStock: 0,
    itemsShort: 0,
    itemsWithExcessStock: 0,
    itemsOnProduction: 0,
    totalOpenSalesOrdersCount: 0,
    totalProductionRequirementItems: 0,
    uomBreakdowns: {},
  });

  // Filters
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [selectedDivision, setSelectedDivision] = useState<string | undefined>(undefined);
  const [selectedSection, setSelectedSection] = useState<string | undefined>(undefined);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [onlyShortages, setOnlyShortages] = useState<boolean>(false);
  const [activeUomFilter, setActiveUomFilter] = useState<string>('ALL');

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedDivision) count++;
    if (selectedSection) count++;
    if (selectedStatus && selectedStatus !== 'ALL') count++;
    if (onlyShortages) count++;
    return count;
  }, [selectedDivision, selectedSection, selectedStatus, onlyShortages]);

  const handleClearFilters = useCallback(() => {
    setSelectedDivision(undefined);
    setSelectedSection(undefined);
    setSelectedStatus('ALL');
    setOnlyShortages(false);
  }, []);

  // Master Data
  const [divisions, setDivisions] = useState<Array<{ id: string; name: string; divisionCode: string }>>([]);
  const [sections, setSections] = useState<Array<{ id: string; name: string; divisionId?: string }>>([]);

  // Production Planning Modal
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [selectedItemForPlan, setSelectedItemForPlan] = useState<FinishedGoodsItem | null>(null);
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [planForm] = Form.useForm();

  // SaveResultDialog states
  const [saveResultOpen, setSaveResultOpen] = useState(false);
  const [saveResultPhase, setSaveResultPhase] = useState<SaveResultPhase>('loading');
  const [saveResultData, setSaveResultData] = useState<SaveResultData | null>(null);
  const [saveResultError, setSaveResultError] = useState<string | undefined>(undefined);
  const [saveResultSuccessTitle, setSaveResultSuccessTitle] = useState<string>('Successful');
  const [saveResultRetry, setSaveResultRetry] = useState<(() => void) | undefined>(undefined);

  // Load Divisions & Sections
  useEffect(() => {
    (async () => {
      try {
        const divRes = await apiService.get<any>('/divisions', { limit: 50 });
        const divList = divRes.data || divRes;
        if (Array.isArray(divList)) {
          setDivisions(divList.filter((d: any) => d.status === 'ACTIVE' || d.isActive !== false));
        }
      } catch { /* ignore */ }

      try {
        const secRes = await apiService.get<any>('/sections', { limit: 100 });
        const secList = secRes.data || secRes;
        if (Array.isArray(secList)) {
          setSections(secList.filter((s: any) => s.status === 'ACTIVE' || s.isActive !== false));
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const availableSections = useMemo(() => {
    if (!selectedDivision) return sections;
    return sections.filter((s) => s.divisionId === selectedDivision);
  }, [sections, selectedDivision]);

  // Fetch Inventory Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        limit: 200,
      };
      if (selectedDivision) params.divisionId = selectedDivision;
      if (selectedSection) params.sectionId = selectedSection;
      if (selectedStatus && selectedStatus !== 'ALL') params.status = selectedStatus;
      if (search) params.search = search;
      if (onlyShortages) params.onlyShortages = true;

      const res = await apiService.get<any>('/sales/finished-goods/inventory', params);
      setData(res.data || []);
      if (res.summary) {
        setSummary(res.summary);
      }
    } catch {
      message.error('Failed to load finished goods inventory');
    } finally {
      setLoading(false);
    }
  }, [selectedDivision, selectedSection, selectedStatus, search, onlyShortages, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Register Header Actions
  const handleExportCsv = useCallback(() => {
    if (data.length === 0) {
      message.warning('No inventory records to export');
      return;
    }
    const headers = [
      'Division',
      'Section',
      'Item Code',
      'Item Name',
      'UOM',
      'Physical Stock',
      'Committed Stock',
      'Available Stock',
      'Safety Stock',
      'Above Safety Stock',
      'Projected Balance',
      'Shortage Qty',
      'Production Requirement',
      'On Production',
      'Status',
    ];

    const rows = data.map((d) => [
      `"${d.divisionCode || d.divisionName || 'General'}"`,
      `"${d.sectionName || '-'}"`,
      `"${d.itemCode}"`,
      `"${d.itemName}"`,
      `"${d.uomCode}"`,
      d.physicalStock,
      d.committedStock,
      d.availableStock,
      d.safetyStock,
      d.aboveSafetyStock,
      d.projectedBalance,
      d.shortageQty,
      d.productionRequirementQty || 0,
      d.onProductionQty,
      `"${d.status}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `finished_goods_inventory_${dayjs().format('YYYYMMDD_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Finished Goods Inventory exported to CSV');
  }, [data, message]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  useEffect(() => {
    const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
    setHeaderActions([
      {
        key: 'refresh',
        node: (
          <Button
            className="btn-inv-white"
            icon={<ReloadOutlined />}
            onClick={() => fetchData()}
          >
            Refresh
          </Button>
        ),
      },
      {
        key: 'csv',
        node: (
          <Button
            className="btn-inv-white"
            icon={<FileExcelOutlined />}
            onClick={handleExportCsv}
          >
            CSV Export
          </Button>
        ),
      },
      {
        key: 'print',
        node: (
          <Button
            className="btn-inv-white"
            icon={<PrinterOutlined />}
            onClick={handlePrint}
          >
            Print Report
          </Button>
        ),
      },
    ]);

    return () => {
      clearHeaderActions();
    };
  }, [fetchData, handleExportCsv, handlePrint]);

  // Open Plan Production Modal
  const handleOpenPlanModal = (item: FinishedGoodsItem) => {
    setSelectedItemForPlan(item);
    const recommendedQty = (item.productionRequirementQty && item.productionRequirementQty > 0)
      ? item.productionRequirementQty
      : (item.shortageQty > 0
        ? item.shortageQty + (item.safetyStock || 0)
        : Math.max(10, (item.safetyStock || 0) - item.availableStock));

    planForm.setFieldsValue({
      plannedQuantity: recommendedQty > 0 ? recommendedQty : 100,
      dueDate: dayjs().add(7, 'day'),
      priority: item.shortageQty > 0 ? 'URGENT' : 'NORMAL',
      remarks: `Production requirement to fulfill shortage (${item.shortageQty || 0} ${item.uomCode}) and restore safety buffer (${item.safetyStock || 0} ${item.uomCode})`,
    });
    setPlanModalVisible(true);
  };

  const handleSubmitPlanProduction = async () => {
    if (!selectedItemForPlan) return;
    try {
      const values = await planForm.validateFields();
      setPlanModalVisible(false);
      setSaveResultOpen(true);
      setSaveResultPhase('loading');
      setSaveResultError(undefined);

      const payload = {
        productId: selectedItemForPlan.itemId,
        divisionId: selectedItemForPlan.divisionId,
        plannedQuantity: Number(values.plannedQuantity),
        uomId: selectedItemForPlan.uomId,
        dueDate: values.dueDate ? dayjs(values.dueDate).toISOString() : undefined,
        priority: values.priority || 'NORMAL',
        demandSource: selectedItemForPlan.shortageQty > 0 ? 'CUSTOMER_ORDER' : 'SAFETY_STOCK',
        remarks: values.remarks,
      };

      const res = await apiService.post<any>('/production/orders', payload);
      const created = res?.data || res || {};
      setSaveResultPhase('success');
      setSaveResultSuccessTitle('Production Order Created Successfully');
      setSaveResultData({
        title: 'Production Order Scheduled Successfully',
        message: `Manufacturing order for ${selectedItemForPlan.itemName} has been queued into production scheduler.`,
        recordType: 'Production Order',
        recordCode: created.orderNumber || 'PRD-SCHEDULED',
        recordName: selectedItemForPlan.itemName,
        tags: [
          { label: `${values.plannedQuantity} ${selectedItemForPlan.uomCode}`, color: 'blue' },
          { label: values.priority || 'NORMAL', color: 'purple' },
        ],
      });
      fetchData();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to schedule production';
      setSaveResultPhase('error');
      setSaveResultError(Array.isArray(msg) ? msg.join(', ') : msg);
      setSaveResultRetry(() => () => handleSubmitPlanProduction());
    }
  };

  // Filtered by active UOM tab if selected
  const displayedItems = useMemo(() => {
    if (activeUomFilter === 'ALL') return data;
    return data.filter((d) => d.uomCode === activeUomFilter);
  }, [data, activeUomFilter]);

  // Table Columns
  const columns: ColumnsType<FinishedGoodsItem> = [
    {
      title: 'DIVISION',
      key: 'division',
      width: 140,
      render: (_, r) => {
        const code = r.divisionCode || 'PWI';
        let color = '#2563eb';
        if (code === 'DIV-SPD') color = '#7c3aed';
        if (code === 'DIV-CCD') color = '#0284c7';
        if (code === 'DIV-NB') color = '#059669';

        return (
          <Space direction="vertical" size={2}>
            <Tag style={{ fontWeight: 700, borderColor: color, color }}>
              {code}
            </Tag>
            <span style={{ fontSize: 11, color: 'var(--inv-text-muted, #94a3b8)' }}>
              {r.sectionName || '-'}
            </span>
          </Space>
        );
      },
    },
    {
      title: 'FINISHED GOOD ITEM',
      key: 'item',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--inv-text-primary, #0f172a)' }}>
            {r.itemName}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--inv-text-muted, #64748b)' }}>
            {r.itemCode}
          </div>
        </div>
      ),
    },
    {
      title: 'UOM',
      dataIndex: 'uomCode',
      key: 'uomCode',
      width: 80,
      align: 'center',
      render: (uom) => (
        <Tag color="cyan" style={{ fontWeight: 800, minWidth: 42, textAlign: 'center' }}>
          {uom}
        </Tag>
      ),
    },
    {
      title: 'PHYSICAL STOCK',
      dataIndex: 'physicalStock',
      key: 'physicalStock',
      width: 130,
      align: 'right',
      render: (val, r) => (
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          {formatDecimal(val)} <span style={{ fontSize: 11, color: '#64748b' }}>{r.uomCode}</span>
        </span>
      ),
    },
    {
      title: 'COMMITTED (OPEN SO)',
      dataIndex: 'committedStock',
      key: 'committedStock',
      width: 140,
      align: 'right',
      render: (val, r) => (
        <span style={{ color: val > 0 ? '#d97706' : 'var(--inv-text-muted, #94a3b8)', fontWeight: val > 0 ? 700 : 400 }}>
          {formatDecimal(val)} <span style={{ fontSize: 11 }}>{r.uomCode}</span>
        </span>
      ),
    },
    {
      title: 'AVAILABLE STOCK',
      dataIndex: 'availableStock',
      key: 'availableStock',
      width: 130,
      align: 'right',
      render: (val, r) => (
        <span style={{ fontWeight: 800, color: val > 0 ? '#16a34a' : '#dc2626' }}>
          {formatDecimal(val)} <span style={{ fontSize: 11 }}>{r.uomCode}</span>
        </span>
      ),
    },
    {
      title: 'SAFETY STOCK',
      dataIndex: 'safetyStock',
      key: 'safetyStock',
      width: 120,
      align: 'right',
      render: (val, r) => (
        <span style={{ color: 'var(--inv-text-muted, #64748b)' }}>
          {val > 0 ? formatDecimal(val) : '-'} <span style={{ fontSize: 11 }}>{val > 0 ? r.uomCode : ''}</span>
        </span>
      ),
    },
    {
      title: 'SHORTAGE',
      dataIndex: 'shortageQty',
      key: 'shortageQty',
      width: 120,
      align: 'right',
      render: (val, r) => {
        if (val > 0) {
          return (
            <Tag color="red" style={{ fontWeight: 800 }}>
              {formatDecimal(val)} {r.uomCode}
            </Tag>
          );
        }
        return <span style={{ color: '#94a3b8' }}>-</span>;
      },
    },
    {
      title: 'PROJECTED BALANCE',
      dataIndex: 'projectedBalance',
      key: 'projectedBalance',
      width: 140,
      align: 'right',
      render: (val, r) => (
        <span style={{ fontWeight: 700, color: val >= 0 ? '#16a34a' : '#dc2626' }}>
          {formatDecimal(val)} <span style={{ fontSize: 11 }}>{r.uomCode}</span>
        </span>
      ),
    },
    {
      title: 'PROD REQUIRED',
      dataIndex: 'productionRequirementQty',
      key: 'productionRequirementQty',
      width: 135,
      align: 'right',
      render: (val, r) => {
        if (val && val > 0) {
          return (
            <Tag color="volcano" style={{ fontWeight: 800 }}>
              {formatDecimal(val)} {r.uomCode}
            </Tag>
          );
        }
        return <span style={{ color: '#94a3b8' }}>-</span>;
      },
    },
    {
      title: 'ON PRODUCTION',
      dataIndex: 'onProductionQty',
      key: 'onProductionQty',
      width: 130,
      align: 'right',
      render: (val, r) => {
        if (val > 0) {
          return (
            <Tag color="purple" style={{ fontWeight: 700 }}>
              {formatDecimal(val)} {r.uomCode}
            </Tag>
          );
        }
        return <span style={{ color: '#94a3b8' }}>-</span>;
      },
    },
    {
      title: 'STATUS',
      key: 'status',
      width: 160,
      align: 'center',
      render: (_, r) => {
        switch (r.status) {
          case 'SHORT':
            return <Tag color="error" icon={<AlertOutlined />}>SHORTAGE</Tag>;
          case 'BELOW_SAFETY_STOCK':
            return <Tag color="warning" icon={<WarningOutlined />}>BELOW SAFETY</Tag>;
          case 'ON_PRODUCTION':
            return <Tag color="processing" icon={<BuildOutlined />}>IN PRODUCTION</Tag>;
          case 'LOW_STOCK':
            return <Tag color="gold">LOW STOCK</Tag>;
          case 'EXCESS':
            return <Tag color="cyan">EXCESS</Tag>;
          case 'AVAILABLE':
          default:
            return <Tag color="success" icon={<CheckCircleOutlined />}>AVAILABLE</Tag>;
        }
      },
    },
    {
      title: 'ACTIONS',
      key: 'actions',
      width: 140,
      align: 'center',
      render: (_, r) => (
        <Space size={6}>
          {canPlanProduction && (r.status === 'SHORT' || r.status === 'BELOW_SAFETY_STOCK') && (
            <Tooltip title="Send requirement to Production Planning">
              <Button
                size="small"
                icon={<BuildOutlined />}
                style={{ backgroundColor: '#7c3aed', color: '#fff', borderColor: '#7c3aed' }}
                onClick={() => handleOpenPlanModal(r)}
              >
                Plan Prod
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="inv-page-container">
      {/* Page Header */}
      <div className="inv-page-header">
        <div>
          <div className="inv-page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatabaseOutlined style={{ color: '#7c3aed' }} />
            <span>Finished Goods Inventory Intelligence</span>
          </div>
          <div className="inv-page-subtitle">
            Real-time stock availability, committed sales orders, protected safety stocks, and division-level quantity intelligence
          </div>
        </div>
      </div>

      {/* Top Executive KPI Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8} lg={4} xl={4} style={{ flex: '1 1 200px' }}>
          <div className="inv-kpi-card">
            <div className="inv-kpi-icon-box" style={{ background: 'rgba(124, 58, 237, 0.15)', color: '#7c3aed' }}>
              <DatabaseOutlined />
            </div>
            <div className="inv-kpi-content">
              <span className="inv-kpi-label">TOTAL FINISHED GOODS</span>
              <span className="inv-kpi-val">{summary.totalItems} Items</span>
              <span className="inv-kpi-sub">Across All PWI Divisions</span>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} md={8} lg={4} xl={4} style={{ flex: '1 1 200px' }}>
          <div className="inv-kpi-card">
            <div className="inv-kpi-icon-box" style={{ background: 'rgba(22, 163, 74, 0.15)', color: '#16a34a' }}>
              <CheckCircleOutlined />
            </div>
            <div className="inv-kpi-content">
              <span className="inv-kpi-label">HEALTHY STOCK</span>
              <span className="inv-kpi-val" style={{ color: '#16a34a' }}>{summary.itemsWithSufficientStock} Items</span>
              <span className="inv-kpi-sub">Sufficient to Fulfill Orders</span>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} md={8} lg={4} xl={4} style={{ flex: '1 1 200px' }}>
          <div className="inv-kpi-card">
            <div className="inv-kpi-icon-box" style={{ background: 'rgba(217, 119, 6, 0.15)', color: '#d97706' }}>
              <WarningOutlined />
            </div>
            <div className="inv-kpi-content">
              <span className="inv-kpi-label">BELOW SAFETY STOCK</span>
              <span className="inv-kpi-val" style={{ color: '#d97706' }}>{summary.itemsBelowSafetyStock} Items</span>
              <span className="inv-kpi-sub">Requires Replenishment</span>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} md={8} lg={4} xl={4} style={{ flex: '1 1 200px' }}>
          <div className="inv-kpi-card">
            <div className="inv-kpi-icon-box" style={{ background: 'rgba(220, 38, 38, 0.15)', color: '#dc2626' }}>
              <AlertOutlined />
            </div>
            <div className="inv-kpi-content">
              <span className="inv-kpi-label">SHORT AGAINST ORDERS</span>
              <span className="inv-kpi-val" style={{ color: '#dc2626' }}>{summary.itemsShort} Items</span>
              <span className="inv-kpi-sub">Commitments Exceed Stock</span>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} md={8} lg={4} xl={4} style={{ flex: '1 1 200px' }}>
          <div className="inv-kpi-card">
            <div className="inv-kpi-icon-box" style={{ background: 'rgba(2, 132, 199, 0.15)', color: '#0284c7' }}>
              <BuildOutlined />
            </div>
            <div className="inv-kpi-content">
              <span className="inv-kpi-label">ON PRODUCTION</span>
              <span className="inv-kpi-val" style={{ color: '#0284c7' }}>{summary.itemsOnProduction} Items</span>
              <span className="inv-kpi-sub">In Active Shop Floor Queue</span>
            </div>
          </div>
        </Col>
      </Row>

      {/* Segregated UOM Quantity Breakdowns Banner (No Mixed-Unit Sums!) */}
      {Object.keys(summary.uomBreakdowns).length > 0 && (
        <Card
          size="small"
          className="inv-filter-card"
          style={{ marginBottom: 16, borderLeft: '4px solid #7c3aed' }}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
              <InboxOutlined style={{ color: '#7c3aed' }} />
              <span>Division-Wise Quantity Intelligence by Unit of Measure (UOM)</span>
            </div>
          }
          extra={
            <Space size={4}>
              <Button
                size="small"
                type={activeUomFilter === 'ALL' ? 'primary' : 'default'}
                onClick={() => setActiveUomFilter('ALL')}
              >
                All Units
              </Button>
              {Object.keys(summary.uomBreakdowns).map((uKey) => (
                <Button
                  key={uKey}
                  size="small"
                  type={activeUomFilter === uKey ? 'primary' : 'default'}
                  onClick={() => setActiveUomFilter(uKey)}
                >
                  {uKey} ({summary.uomBreakdowns[uKey].itemCount})
                </Button>
              ))}
            </Space>
          }
        >
          <Row gutter={[16, 12]}>
            {Object.values(summary.uomBreakdowns).map((b) => (
              <Col xs={24} sm={12} md={8} lg={6} key={b.uomCode}>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 6,
                  background: 'var(--inv-table-row-even, #f8fafc)',
                  border: '1px solid var(--inv-table-border, #e2e8f0)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: '#2563eb' }}>{b.uomCode}</span>
                    <Tag color="cyan">{b.itemCount} Items</Tag>
                  </div>
                  <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                    <span style={{ color: 'var(--inv-text-muted, #64748b)' }}>Physical Stock:</span>
                    <strong>{formatDecimal(b.totalPhysicalStock)} {b.uomCode}</strong>
                  </div>
                  <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                    <span style={{ color: 'var(--inv-text-muted, #64748b)' }}>Committed:</span>
                    <span style={{ color: '#d97706', fontWeight: 600 }}>{formatDecimal(b.totalCommittedStock)} {b.uomCode}</span>
                  </div>
                  <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                    <span style={{ color: 'var(--inv-text-muted, #64748b)' }}>Net Available:</span>
                    <span style={{ color: '#16a34a', fontWeight: 700 }}>{formatDecimal(b.totalAvailableStock)} {b.uomCode}</span>
                  </div>
                  {b.totalShortageQty > 0 && (
                    <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', marginTop: 2, color: '#dc2626', fontWeight: 700 }}>
                      <span>Shortage:</span>
                      <span>{formatDecimal(b.totalShortageQty)} {b.uomCode}</span>
                    </div>
                  )}
                  {b.totalProductionRequirementQty !== undefined && b.totalProductionRequirementQty > 0 && (
                    <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', marginTop: 2, color: '#b91c1c', fontWeight: 700 }}>
                      <span>Prod Required:</span>
                      <span>{formatDecimal(b.totalProductionRequirementQty)} {b.uomCode}</span>
                    </div>
                  )}
                  {b.totalOnProductionQty > 0 && (
                    <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', marginTop: 2, color: '#7c3aed' }}>
                      <span>In Production:</span>
                      <span>{formatDecimal(b.totalOnProductionQty)} {b.uomCode}</span>
                    </div>
                  )}
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* Search and Filters Toggle Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 340, maxWidth: '100%' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Search code, cable, spoke, wire..."
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Button
          icon={<FilterOutlined />}
          onClick={() => setShowFilters((prev) => !prev)}
          type={showFilters ? 'primary' : 'default'}
          style={{ fontWeight: 600 }}
        >
          Filters
          {activeFilterCount > 0 && (
            <Badge
              count={activeFilterCount}
              style={{
                marginLeft: 6,
                backgroundColor: showFilters ? '#ffffff' : 'var(--theme-primary, #3b82f6)',
                color: showFilters ? 'var(--theme-primary, #3b82f6)' : '#ffffff',
              }}
            />
          )}
        </Button>
      </div>

      {/* Collapsible Panel with ALL Filters */}
      {showFilters && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '12px 14px',
            background: 'var(--theme-surface-subtle, rgba(0, 0, 0, 0.02))',
            border: '1px solid var(--theme-border, #e2e8f0)',
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {/* Header: Title + Active Count + Close */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed var(--theme-border, #e2e8f0)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FilterOutlined style={{ color: 'var(--theme-primary, #3b82f6)', fontSize: 14 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #1e293b)' }}>
                Filter Finished Goods
              </span>
              {activeFilterCount > 0 && (
                <Tag color="blue" style={{ margin: 0, borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                  {activeFilterCount} Active
                </Tag>
              )}
            </div>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => setShowFilters(false)}
              style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 12 }}
              title="Close Filters"
            >
              Close
            </Button>
          </div>

          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} sm={12} md={6}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--inv-text-secondary, #475569)' }}>
                DIVISION
              </div>
              <Select
                style={{ width: '100%' }}
                placeholder="All Divisions"
                allowClear
                value={selectedDivision}
                onChange={(val) => {
                  setSelectedDivision(val);
                  setSelectedSection(undefined);
                }}
              >
                {divisions.map((d) => (
                  <Select.Option key={d.id} value={d.id}>
                    {d.divisionCode ? `[${d.divisionCode}] ` : ''}{d.name}
                  </Select.Option>
                ))}
              </Select>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--inv-text-secondary, #475569)' }}>
                SECTION
              </div>
              <Select
                style={{ width: '100%' }}
                placeholder="All Sections"
                allowClear
                value={selectedSection}
                onChange={setSelectedSection}
                disabled={availableSections.length === 0}
              >
                {availableSections.map((s) => (
                  <Select.Option key={s.id} value={s.id}>
                    {s.name}
                  </Select.Option>
                ))}
              </Select>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--inv-text-secondary, #475569)' }}>
                STOCK AVAILABILITY STATUS
              </div>
              <Select
                style={{ width: '100%' }}
                value={selectedStatus}
                onChange={setSelectedStatus}
              >
                <Select.Option value="ALL">All Statuses</Select.Option>
                <Select.Option value="AVAILABLE">Available (Healthy)</Select.Option>
                <Select.Option value="LOW_STOCK">Low Stock</Select.Option>
                <Select.Option value="BELOW_SAFETY_STOCK">Below Safety Stock</Select.Option>
                <Select.Option value="SHORT">Short Against Orders</Select.Option>
                <Select.Option value="ON_PRODUCTION">In Production</Select.Option>
                <Select.Option value="EXCESS">Excess Stock</Select.Option>
              </Select>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--inv-text-secondary, #475569)' }}>
                SHORTAGES ONLY
              </div>
              <Space align="center" style={{ marginTop: 4 }}>
                <Switch
                  checked={onlyShortages}
                  onChange={setOnlyShortages}
                />
                <span style={{ fontSize: 12, fontWeight: onlyShortages ? 700 : 400, color: onlyShortages ? '#dc2626' : undefined }}>
                  Show Shortages
                </span>
              </Space>
            </Col>
          </Row>

          {/* Footer with Clear Filters and Apply Filters inside */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              paddingTop: 8,
              borderTop: '1px solid var(--theme-border, #e2e8f0)',
            }}
          >
            <Button
              icon={<ClearOutlined />}
              onClick={handleClearFilters}
              danger={activeFilterCount > 0}
            >
              Clear Filters
            </Button>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => setShowFilters(false)}>
                Close
              </Button>
              <Button
                type="primary"
                icon={<FilterOutlined />}
                onClick={() => {
                  fetchData();
                  setShowFilters(false);
                }}
                loading={loading}
                style={{ fontWeight: 600 }}
              >
                Apply Filters
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Table */}
      {loading && data.length === 0 ? (
        <GlobalLoading
          title="Loading Finished Goods Inventory..."
          subtitle="Calculating physical on-hand, open order commitments, and safety stock levels..."
          badgeText="FINISHED GOODS"
          minHeight={350}
        />
      ) : (
        <Table
          className="inv-pixel-table"
          columns={columns}
          dataSource={displayedItems}
          rowKey="itemId"
          loading={loading}
          pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'] }}
          scroll={{ x: 1200 }}
        />
      )}

      {/* Plan Production Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BuildOutlined style={{ color: '#7c3aed' }} />
            <span>Forward Requirement to Production: {selectedItemForPlan?.itemName}</span>
          </div>
        }
        open={planModalVisible}
        onCancel={() => setPlanModalVisible(false)}
        onOk={handleSubmitPlanProduction}
        confirmLoading={planSubmitting}
        okText="Send to Production Planning"
      >
        {selectedItemForPlan && (
          <Form form={planForm} layout="vertical">
            <div style={{
              background: 'var(--inv-filter-card-bg, #f8fafc)',
              padding: '10px 14px',
              borderRadius: 6,
              marginBottom: 16,
              border: '1px solid var(--inv-filter-card-border, #e2e8f0)',
            }}>
              <div><strong>Item:</strong> {selectedItemForPlan.itemName} ({selectedItemForPlan.itemCode})</div>
              <div><strong>Division:</strong> {selectedItemForPlan.divisionName || 'PWI General'}</div>
              <div><strong>Physical Stock:</strong> {formatDecimal(selectedItemForPlan.physicalStock)} {selectedItemForPlan.uomCode}</div>
              <div><strong>Committed Orders:</strong> {formatDecimal(selectedItemForPlan.committedStock)} {selectedItemForPlan.uomCode}</div>
              <div><strong>Available Stock:</strong> {formatDecimal(selectedItemForPlan.availableStock)} {selectedItemForPlan.uomCode}</div>
              <div><strong>Safety Stock:</strong> {formatDecimal(selectedItemForPlan.safetyStock)} {selectedItemForPlan.uomCode}</div>
              {selectedItemForPlan.shortageQty > 0 && (
                <div style={{ color: '#dc2626', fontWeight: 700 }}>
                  <strong>Order Shortage:</strong> {formatDecimal(selectedItemForPlan.shortageQty)} {selectedItemForPlan.uomCode}
                </div>
              )}
              {selectedItemForPlan.productionRequirementQty !== undefined && selectedItemForPlan.productionRequirementQty > 0 && (
                <div style={{ color: '#7c3aed', fontWeight: 800 }}>
                  <strong>Authoritative Production Requirement:</strong> {formatDecimal(selectedItemForPlan.productionRequirementQty)} {selectedItemForPlan.uomCode}
                </div>
              )}
            </div>

            <Form.Item
              name="plannedQuantity"
              label={`Planned Production Quantity (${selectedItemForPlan.uomCode})`}
              rules={[{ required: true, message: 'Please enter production quantity' }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} precision={2} />
            </Form.Item>

            <Form.Item
              name="dueDate"
              label="Target Completion Date"
              rules={[{ required: true, message: 'Please select target date' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="priority" label="Priority">
              <Select>
                <Select.Option value="NORMAL">Normal</Select.Option>
                <Select.Option value="HIGH">High</Select.Option>
                <Select.Option value="URGENT">Urgent (Customer Order Shortage)</Select.Option>
                <Select.Option value="CRITICAL">Critical</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item name="remarks" label="Production Order Remarks / Reference">
              <Input.TextArea rows={2} placeholder="Add production notes or reference to sales demand..." />
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* Large Orbital Animated SaveResultDialog */}
      <SaveResultDialog
        open={saveResultOpen}
        phase={saveResultPhase}
        result={saveResultData}
        errorMessage={saveResultError}
        successTitle={saveResultSuccessTitle}
        onRetry={saveResultRetry}
        onClose={() => setSaveResultOpen(false)}
      />
    </div>
  );
};

export default FinishedGoodsInventory;
