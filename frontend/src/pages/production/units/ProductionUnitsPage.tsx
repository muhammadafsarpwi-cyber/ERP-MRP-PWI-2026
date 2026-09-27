import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  InputNumber,
  Select,
  Row,
  Col,
  Statistic,
  Typography,
  Tooltip,
  Badge,
  message,
  QRCode,
  Popover,
} from 'antd';
import {
  PlusOutlined,
  PrinterOutlined,
  ScanOutlined,
  HistoryOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  EditOutlined,
  CheckCircleOutlined,
  BarcodeOutlined,
  QrcodeOutlined,
  EyeOutlined,
  SaveOutlined,
  ClearOutlined,
  CheckSquareOutlined,
  FilterOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  ProductionUnitItem,
  productionUnitService,
  ProductionUnitStatus,
  BulkUpdateUnitRow,
} from '../../../services/productionUnitService';
import ProductionUnitGeneratorModal from './ProductionUnitGeneratorModal';
import ProductionUnitBulkPrintModal from './ProductionUnitBulkPrintModal';
import ProductionUnitBulkWeightModal from './ProductionUnitBulkWeightModal';
import ProductionUnitScanModal from './ProductionUnitScanModal';
import ProductionUnitPrintHistoryDrawer from './ProductionUnitPrintHistoryDrawer';
import ProductionUnitVoidModal from './ProductionUnitVoidModal';

const { Text, Title } = Typography;

interface ProductionUnitsPageProps {
  productionEntryId?: string | null;
  initialItem?: { id: string; itemCode: string; name: string } | null;
  initialValues?: {
    batchNo?: string;
    pvcBatchNo?: string;
    shiftName?: string;
    operatorName?: string;
    machineNo?: string;
    lengthMeters?: number;
    productionDate?: string;
  };
  embedded?: boolean;
}

export const ProductionUnitsPage: React.FC<ProductionUnitsPageProps> = ({
  productionEntryId,
  initialItem,
  initialValues,
  embedded = false,
}) => {
  const [units, setUnits] = useState<ProductionUnitItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});

  // Inline edits tracking map: id -> { weightKg, jointCount, stValue }
  const [inlineEdits, setInlineEdits] = useState<Record<string, { weightKg?: number; jointCount?: number; stValue?: string }>>({});
  const [savingInline, setSavingInline] = useState<boolean>(false);

  // Modals state
  const [generatorOpen, setGeneratorOpen] = useState<boolean>(false);
  const [printModalOpen, setPrintModalOpen] = useState<boolean>(false);
  const [printUnitsList, setPrintUnitsList] = useState<ProductionUnitItem[]>([]);
  const [weightModalOpen, setWeightModalOpen] = useState<boolean>(false);
  const [weightUnitsList, setWeightUnitsList] = useState<ProductionUnitItem[]>([]);
  const [scanModalOpen, setScanModalOpen] = useState<boolean>(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState<boolean>(false);
  const [activeHistoryUnit, setActiveHistoryUnit] = useState<ProductionUnitItem | null>(null);
  const [voidModalOpen, setVoidModalOpen] = useState<boolean>(false);
  const [activeVoidUnit, setActiveVoidUnit] = useState<ProductionUnitItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        productionUnitService.list({
          productionEntryId: productionEntryId || undefined,
          status: statusFilter || undefined,
          search: search.trim() || undefined,
          page,
          limit: pageSize,
        }),
        productionUnitService.getStats().catch(() => ({ success: false, data: {} })),
      ]);

      setUnits(listRes.data || []);
      setTotal(listRes.total || 0);
      if (statsRes?.data) setStats(statsRes.data);
      setInlineEdits({});
    } catch (err: any) {
      const rawMsg = err?.response?.data?.message || err?.message || 'Failed to load production units';
      const msg = Array.isArray(rawMsg) ? rawMsg.join(', ') : rawMsg;
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [productionEntryId, statusFilter, search, page, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Selected units helper
  const selectedUnits = units.filter((u) => selectedRowKeys.includes(u.id));

  // Selection actions (Section 10 requirement)
  const handleSelectAll = () => {
    const allActiveIds = units
      .filter((u) => ![ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(u.status))
      .map((u) => u.id);
    setSelectedRowKeys(allActiveIds);
  };

  const handleClearSelection = () => {
    setSelectedRowKeys([]);
  };

  const handleOpenPrintSelected = () => {
    if (!selectedUnits.length) {
      message.warning('Please select at least one unit to print');
      return;
    }
    const printable = selectedUnits.filter(
      (u) => ![ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(u.status),
    );
    if (!printable.length) {
      message.warning('All selected units are VOID / CANCELLED and cannot be printed');
      return;
    }
    setPrintUnitsList(printable);
    setPrintModalOpen(true);
  };

  const handlePrintAll = () => {
    const printable = units.filter(
      (u) => ![ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(u.status),
    );
    if (!printable.length) {
      message.warning('No active units available to print');
      return;
    }
    setPrintUnitsList(printable);
    setPrintModalOpen(true);
  };

  const handleReprintSelected = () => {
    if (!selectedUnits.length) {
      message.warning('Please select at least one unit to reprint');
      return;
    }
    const reprinted = selectedUnits.filter(
      (u) => u.printCount > 0 && ![ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(u.status),
    );
    if (!reprinted.length) {
      message.info('None of the selected units were previously printed. Printing them as first print.');
      setPrintUnitsList(selectedUnits.filter(u => ![ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(u.status)));
      setPrintModalOpen(true);
      return;
    }
    setPrintUnitsList(reprinted);
    setPrintModalOpen(true);
  };

  const handlePrintSingle = (unit: ProductionUnitItem) => {
    setPrintUnitsList([unit]);
    setPrintModalOpen(true);
  };

  const handleOpenBulkWeight = () => {
    const target = selectedUnits.length > 0 ? selectedUnits : units;
    const editable = target.filter(
      (u) => ![ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(u.status),
    );
    if (!editable.length) {
      message.warning('No active units available for weight entry');
      return;
    }
    setWeightUnitsList(editable);
    setWeightModalOpen(true);
  };

  const handleUnitsGenerated = (newUnits: ProductionUnitItem[]) => {
    loadData();
    // Auto-select generated units and prompt weight modal
    setSelectedRowKeys(newUnits.map((u) => u.id));
    setWeightUnitsList(newUnits);
    setWeightModalOpen(true);
  };

  const handleWeightsSaved = () => {
    loadData();
  };

  const handlePrinted = () => {
    loadData();
    setSelectedRowKeys([]);
  };

  const handleVoided = () => {
    loadData();
  };

  // Inline editing handlers
  const handleInlineChange = (id: string, field: 'weightKg' | 'jointCount' | 'stValue', value: any) => {
    setInlineEdits((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const handleSaveInlineRow = async (record: ProductionUnitItem) => {
    const edits = inlineEdits[record.id];
    if (!edits) return;
    try {
      await productionUnitService.updateOne(record.id, edits);
      message.success(`Updated ${record.coilNo} (${record.unitSerialNo})`);
      setInlineEdits((prev) => {
        const next = { ...prev };
        delete next[record.id];
        return next;
      });
      loadData();
    } catch (err: any) {
      message.error(err?.message || 'Failed to update unit');
    }
  };

  const handleSaveAllInline = async () => {
    const entries = Object.entries(inlineEdits);
    if (!entries.length) {
      message.info('No changes to save');
      return;
    }
    setSavingInline(true);
    try {
      const rows: BulkUpdateUnitRow[] = entries.map(([id, values]) => ({
        id,
        ...values,
      }));
      await productionUnitService.bulkUpdate(rows);
      message.success(`Successfully saved weights and attributes for ${rows.length} units`);
      setInlineEdits({});
      loadData();
    } catch (err: any) {
      message.error(err?.message || 'Failed to save changes');
    } finally {
      setSavingInline(false);
    }
  };

  const statusColor = (st: ProductionUnitStatus) => {
    switch (st) {
      case ProductionUnitStatus.PRINTED:
        return 'green';
      case ProductionUnitStatus.GENERATED:
        return 'blue';
      case ProductionUnitStatus.VOID:
      case ProductionUnitStatus.CANCELLED:
        return 'red';
      case ProductionUnitStatus.USED:
        return 'purple';
      default:
        return 'default';
    }
  };

  const modifiedCount = Object.keys(inlineEdits).length;

  return (
    <div className="production-units-container" style={{ padding: embedded ? 0 : 16 }}>
      {/* Top Header & KPI Summary */}
      {!embedded && (
        <div style={{ marginBottom: 16 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={6}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title={<span style={{ fontSize: 12, fontWeight: 600 }}>TOTAL SERIALIZED UNITS</span>}
                  value={stats.total || total}
                  prefix={<BarcodeOutlined style={{ color: '#0284c7' }} />}
                  valueStyle={{ color: '#0284c7', fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title={<span style={{ fontSize: 12, fontWeight: 600 }}>LABELS PRINTED</span>}
                  value={stats.PRINTED || 0}
                  prefix={<CheckCircleOutlined style={{ color: '#16a34a' }} />}
                  valueStyle={{ color: '#16a34a', fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title={<span style={{ fontSize: 12, fontWeight: 600 }}>AWAITING PRINT</span>}
                  value={stats.GENERATED || 0}
                  prefix={<PrinterOutlined style={{ color: '#d97706' }} />}
                  valueStyle={{ color: '#d97706', fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={6}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title={<span style={{ fontSize: 12, fontWeight: 600 }}>VOID / REJECTED</span>}
                  value={(stats.VOID || 0) + (stats.CANCELLED || 0)}
                  prefix={<ExclamationCircleOutlined style={{ color: '#dc2626' }} />}
                  valueStyle={{ color: '#dc2626', fontWeight: 700 }}
                />
              </Card>
            </Col>
          </Row>
        </div>
      )}

      {/* Main Control Card */}
      <Card
        size="small"
        style={{ borderRadius: 8, border: '1px solid var(--theme-border, #e2e8f0)' }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <Space>
              <BarcodeOutlined style={{ color: 'var(--theme-primary)', fontSize: 18 }} />
              <span style={{ fontWeight: 700, fontSize: 15 }}>
                {embedded ? 'Coil Serialization & Unique Label Printing' : 'Production Unit Serialization & Labels'}
              </span>
              <Tag color="cyan">{total} Records</Tag>
              {selectedRowKeys.length > 0 && (
                <Tag color="blue">{selectedRowKeys.length} Selected</Tag>
              )}
            </Space>

            <Space wrap>
              <Button icon={<ScanOutlined />} onClick={() => setScanModalOpen(true)}>
                Scan QR / Barcode
              </Button>
              <Button
                icon={<EditOutlined />}
                onClick={handleOpenBulkWeight}
                disabled={units.length === 0}
              >
                Enter Weights ({selectedRowKeys.length > 0 ? selectedRowKeys.length : 'All'})
              </Button>
              {modifiedCount > 0 && (
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={savingInline}
                  onClick={handleSaveAllInline}
                  style={{ background: '#d97706', borderColor: '#d97706' }}
                >
                  Save Table Changes ({modifiedCount})
                </Button>
              )}
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setGeneratorOpen(true)}
              >
                Generate Units
              </Button>
            </Space>
          </div>
        }
      >
        {/* Bulk Action Ribbon (Section 10 Requirements) */}
        <div
          style={{
            background: 'var(--theme-surface-alt, #f8fafc)',
            padding: '8px 12px',
            borderRadius: 6,
            marginBottom: 12,
            border: '1px solid var(--theme-border, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <Space wrap>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Selection & Bulk Actions:</span>
            <Button size="small" icon={<CheckSquareOutlined />} onClick={handleSelectAll}>
              Select All
            </Button>
            <Button
              size="small"
              icon={<ClearOutlined />}
              onClick={handleClearSelection}
              disabled={selectedRowKeys.length === 0}
            >
              Clear Selection
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<PrinterOutlined />}
              style={{ background: '#16a34a', borderColor: '#16a34a' }}
              onClick={handleOpenPrintSelected}
              disabled={selectedRowKeys.length === 0}
            >
              Print Selected ({selectedRowKeys.length})
            </Button>
            <Button
              size="small"
              icon={<PrinterOutlined />}
              onClick={handlePrintAll}
              disabled={units.length === 0}
            >
              Print All ({units.length})
            </Button>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleReprintSelected}
              disabled={selectedRowKeys.length === 0}
            >
              Reprint Selected
            </Button>
          </Space>

          <Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              💡 Weights can be edited directly in the table or via Bulk Weight Entry.
            </Text>
          </Space>
        </div>

        {/* Search & Filter Toolbar */}
        {/* Enterprise Unified Filter Toolbar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Input
              placeholder="Search by serial #, coil # (CN-001), batch #, or operator..."
              prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted, #94a3b8)' }} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={() => loadData()}
              allowClear
              style={{ flex: '1 1 240px', maxWidth: 420 }}
            />

            {/* Single Unified "Filters" Button */}
            <Button
              icon={<FilterOutlined />}
              onClick={() => setShowFilters((prev) => !prev)}
              type={showFilters ? 'primary' : 'default'}
              style={{ fontWeight: 600 }}
            >
              Filters
              {statusFilter ? (
                <Badge
                  count={1}
                  style={{
                    marginLeft: 6,
                    backgroundColor: showFilters ? '#ffffff' : 'var(--theme-primary, #3b82f6)',
                    color: showFilters ? 'var(--theme-primary, #3b82f6)' : '#ffffff',
                  }}
                />
              ) : null}
            </Button>

            <Button icon={<ReloadOutlined />} onClick={() => loadData()}>
              Refresh
            </Button>
          </div>

          {/* Collapsible Panel with Filters */}
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
                marginTop: 4,
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed var(--theme-border, #e2e8f0)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FilterOutlined style={{ color: 'var(--theme-primary, #3b82f6)', fontSize: 14 }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #1e293b)' }}>
                    Filter Production Units
                  </span>
                  {statusFilter && (
                    <Tag color="blue" style={{ margin: 0, borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                      1 Active
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

              {/* Grid */}
              <div style={{ maxWidth: 320 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Unit Status
                </label>
                <Select
                  style={{ width: '100%' }}
                  placeholder="All Statuses"
                  allowClear
                  value={statusFilter || undefined}
                  onChange={(v) => setStatusFilter(v || '')}
                  options={[
                    { value: '', label: 'All Statuses' },
                    { value: 'GENERATED', label: 'Generated (Unprinted)' },
                    { value: 'PRINTED', label: 'Printed' },
                    { value: 'VOID', label: 'Void / Cancelled' },
                  ]}
                />
              </div>

              {/* Footer */}
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
                  onClick={() => setStatusFilter('')}
                  disabled={!statusFilter}
                  danger={!!statusFilter}
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
                      loadData();
                      setShowFilters(false);
                    }}
                    style={{ fontWeight: 600 }}
                  >
                    Apply Filters
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Data Table with exact 10 columns: #, Coil No, Serial No, Weight, Joint, S.T., QR, Barcode, Status, Actions */}
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={units}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          scroll={{ x: 1250 }}
          columns={[
            {
              title: '#',
              key: 'index',
              width: 50,
              align: 'center',
              render: (_, __, index) => (page - 1) * pageSize + index + 1,
            },
            {
              title: 'Coil No',
              dataIndex: 'coilNo',
              width: 105,
              render: (v: string, record) => (
                <div>
                  <strong style={{ color: '#1d4ed8', fontSize: 13 }}>{v}</strong>
                  {record.printCount > 0 && (
                    <span style={{ fontSize: 10, color: '#16a34a', display: 'block' }}>
                      Printed {record.printCount}x
                    </span>
                  )}
                </div>
              ),
            },
            {
              title: 'Serial No',
              dataIndex: 'unitSerialNo',
              width: 175,
              render: (v: string) => (
                <Text code copyable={{ text: v }} style={{ fontWeight: 600 }}>
                  {v}
                </Text>
              ),
            },
            {
              title: 'Weight (KG)',
              dataIndex: 'weightKg',
              width: 150,
              render: (v: number | null, record) => {
                const isVoid = [ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(record.status);
                const currentEdit = inlineEdits[record.id]?.weightKg;
                const displayVal = currentEdit !== undefined ? currentEdit : (v != null ? Number(v) : undefined);
                const isDirty = currentEdit !== undefined && currentEdit !== v;

                return (
                  <Space size={4}>
                    <InputNumber
                      min={0.01}
                      step={0.1}
                      precision={2}
                      disabled={isVoid}
                      placeholder="e.g. 26.1"
                      value={displayVal}
                      onChange={(val) => handleInlineChange(record.id, 'weightKg', val ?? undefined)}
                      onPressEnter={() => handleSaveInlineRow(record)}
                      style={{
                        width: 95,
                        borderColor: isDirty ? '#f59e0b' : (v != null ? '#22c55e' : undefined),
                        background: isDirty ? '#fef3c7' : undefined,
                      }}
                    />
                    {isDirty && (
                      <Tooltip title="Save Weight">
                        <Button
                          size="small"
                          type="text"
                          icon={<SaveOutlined style={{ color: '#f59e0b' }} />}
                          onClick={() => handleSaveInlineRow(record)}
                        />
                      </Tooltip>
                    )}
                    <span style={{ fontSize: 10, color: '#64748b' }}>KG</span>
                    {v != null && !isDirty && (
                      <span style={{ display: 'none' }}>{`${Number(v).toFixed(2)} KG`}</span>
                    )}
                  </Space>
                );
              },
            },
            {
              title: 'Joint',
              dataIndex: 'jointCount',
              width: 80,
              align: 'center',
              render: (v: number | null, record) => {
                const isVoid = [ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(record.status);
                const currentEdit = inlineEdits[record.id]?.jointCount;
                const displayVal = currentEdit !== undefined ? currentEdit : (v != null ? v : 0);
                return (
                  <InputNumber
                    min={0}
                    max={20}
                    size="small"
                    disabled={isVoid}
                    value={displayVal}
                    onChange={(val) => handleInlineChange(record.id, 'jointCount', val ?? 0)}
                    style={{ width: 55 }}
                  />
                );
              },
            },
            {
              title: 'S.T.',
              dataIndex: 'stValue',
              width: 80,
              align: 'center',
              render: (v: string | null, record) => {
                const isVoid = [ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(record.status);
                const currentEdit = inlineEdits[record.id]?.stValue;
                const displayVal = currentEdit !== undefined ? currentEdit : (v || '04');
                return (
                  <Input
                    size="small"
                    maxLength={10}
                    disabled={isVoid}
                    value={displayVal}
                    onChange={(e) => handleInlineChange(record.id, 'stValue', e.target.value)}
                    style={{ width: 55, textAlign: 'center' }}
                  />
                );
              },
            },
            {
              title: 'QR',
              key: 'qr',
              width: 65,
              align: 'center',
              render: (_, record) => (
                <Popover
                  content={
                    <div style={{ textAlign: 'center', padding: 4 }}>
                      <QRCode value={record.qrPayload} size={130} bordered={false} />
                      <div style={{ fontSize: 11, fontFamily: 'monospace', marginTop: 4 }}>{record.qrPayload}</div>
                    </div>
                  }
                  title={`QR: ${record.coilNo}`}
                  trigger="hover"
                >
                  <Button type="text" size="small" icon={<QrcodeOutlined style={{ color: '#0284c7', fontSize: 16 }} />} />
                </Popover>
              ),
            },
            {
              title: 'Barcode',
              key: 'barcode',
              width: 100,
              render: (_, record) => (
                <Tooltip title={`Barcode Symbology: Code 128 (${record.barcodePayload})`}>
                  <Space size={2} style={{ cursor: 'pointer' }}>
                    <BarcodeOutlined style={{ color: '#475569', fontSize: 15 }} />
                    <span style={{ fontSize: 10, fontFamily: 'monospace' }}>
                      {record.barcodePayload.slice(-6)}
                    </span>
                  </Space>
                </Tooltip>
              ),
            },
            {
              title: 'Item / Batch',
              key: 'itemBatch',
              width: 170,
              render: (_, record) => (
                <div style={{ fontSize: 11 }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{record.item?.name || '—'}</div>
                  <div style={{ color: '#64748b' }}>
                    Batch: {record.batchNo || '—'} {record.pvcBatchNo ? `· PVC: ${record.pvcBatchNo}` : ''}
                  </div>
                </div>
              ),
            },
            {
              title: 'Status',
              dataIndex: 'status',
              width: 110,
              render: (st: ProductionUnitStatus, record) => (
                <Space direction="vertical" size={2}>
                  <Tag color={statusColor(st)}>{st}</Tag>
                  {record.voidReason && (
                    <Tooltip title={record.voidReason}>
                      <span style={{ fontSize: 10, color: '#ef4444', cursor: 'pointer' }}>Reason ℹ</span>
                    </Tooltip>
                  )}
                </Space>
              ),
            },
            {
              title: 'Actions',
              key: 'actions',
              width: 150,
              fixed: 'right',
              render: (_, record) => {
                const isVoid = [ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(record.status);
                return (
                  <Space size="small">
                    <Tooltip title="View / Scan Details">
                      <Button
                        type="text"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => {
                          // Quick trigger scan lookup popup for this unit
                          productionUnitService.getOne(record.id).then(() => {
                            setScanModalOpen(true);
                          });
                        }}
                      />
                    </Tooltip>
                    <Tooltip title={isVoid ? 'Cannot print void unit' : (record.printCount > 0 ? 'Reprint Label' : 'Print Label')}>
                      <Button
                        type="text"
                        size="small"
                        icon={<PrinterOutlined />}
                        disabled={isVoid}
                        onClick={() => handlePrintSingle(record)}
                        style={{ color: isVoid ? undefined : (record.printCount > 0 ? '#d97706' : '#16a34a') }}
                      />
                    </Tooltip>
                    <Tooltip title="Print History Audit">
                      <Button
                        type="text"
                        size="small"
                        icon={<HistoryOutlined />}
                        onClick={() => {
                          setActiveHistoryUnit(record);
                          setHistoryDrawerOpen(true);
                        }}
                      />
                    </Tooltip>
                    {!isVoid && (
                      <Tooltip title="Void / Cancel Unit">
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<ExclamationCircleOutlined />}
                          onClick={() => {
                            setActiveVoidUnit(record);
                            setVoidModalOpen(true);
                          }}
                        />
                      </Tooltip>
                    )}
                  </Space>
                );
              },
            },
          ]}
        />
      </Card>

      {/* Generator Modal */}
      <ProductionUnitGeneratorModal
        open={generatorOpen}
        onClose={() => setGeneratorOpen(false)}
        productionEntryId={productionEntryId}
        initialItem={initialItem}
        initialValues={initialValues}
        onGenerated={handleUnitsGenerated}
      />

      {/* Bulk Print Modal */}
      <ProductionUnitBulkPrintModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        units={printUnitsList}
        onPrinted={handlePrinted}
      />

      {/* Bulk Weight Entry Modal */}
      <ProductionUnitBulkWeightModal
        open={weightModalOpen}
        onClose={() => setWeightModalOpen(false)}
        units={weightUnitsList}
        onSaved={handleWeightsSaved}
      />

      {/* Scan Lookup Modal */}
      <ProductionUnitScanModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onPrintSingle={handlePrintSingle}
      />

      {/* Print Audit Drawer */}
      <ProductionUnitPrintHistoryDrawer
        open={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
        unit={activeHistoryUnit}
      />

      {/* Void Modal */}
      <ProductionUnitVoidModal
        open={voidModalOpen}
        onClose={() => setVoidModalOpen(false)}
        unit={activeVoidUnit}
        onVoided={handleVoided}
      />
    </div>
  );
};

export default ProductionUnitsPage;
