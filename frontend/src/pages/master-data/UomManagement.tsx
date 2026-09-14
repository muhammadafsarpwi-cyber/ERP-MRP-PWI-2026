import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  App, Table, Button, Space, Modal, Form, Input, Select, InputNumber, Popconfirm, Card, Checkbox, Dropdown,
} from 'antd';
import {
  PlusOutlined, EditOutlined, CalculatorOutlined, FilterOutlined,
  AppstoreOutlined, CheckCircleOutlined, MinusOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader, StatusBadge, EmptyState, FilterBar, DraggableResizableModal } from '../../components/shared';
import type { FilterOption } from '../../components/shared/FilterBar';

const UOM_TYPES = ['COUNT', 'WEIGHT', 'LENGTH', 'AREA', 'VOLUME', 'TIME', 'OTHER'];

interface Uom {
  id: string;
  code: string;
  name: string;
  symbol: string;
  uomType: string;
  decimalPrecision: number;
  status: string;
}

// ─── Column Visibility Constants ──────────────────────────────────
const DEFAULT_UOM_COLUMNS: Record<string, boolean> = {
  code: true,
  name: true,
  symbol: true,
  uomType: true,
  decimalPrecision: true,
  status: true,
  actions: true,
};

const UOM_COLUMN_LABELS: Record<string, string> = {
  code: 'Code',
  name: 'Name',
  symbol: 'Symbol',
  uomType: 'UOM Type',
  decimalPrecision: 'Decimal Precision',
  status: 'Status',
  actions: 'Actions',
};

const UOM_STATUS_CHEVRONS = [
  { key: 'ALL', label: 'ALL UOMS', color: '#334155', activeBg: '#1e293b', icon: <AppstoreOutlined /> },
  { key: 'ACTIVE', label: 'ACTIVE', color: '#16a34a', activeBg: '#15803d', icon: <CheckCircleOutlined /> },
  { key: 'INACTIVE', label: 'INACTIVE', color: '#64748b', activeBg: '#475569', icon: <MinusOutlined /> },
];

const UomStatusChevronRibbon: React.FC<{
  counts: { all: number; active: number; inactive: number };
  activeKey: string;
  onSelect: (key: string) => void;
}> = ({ counts, activeKey, onSelect }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        overflowX: 'auto',
        padding: '2px 2px 8px 2px',
        marginBottom: 10,
        scrollbarWidth: 'thin',
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.08))',
      }}
    >
      {UOM_STATUS_CHEVRONS.map((ch, idx) => {
        const isSelected = activeKey === ch.key;
        const isFirst = idx === 0;
        const isLast = idx === UOM_STATUS_CHEVRONS.length - 1;
        const count = ch.key === 'ALL' ? counts.all : ch.key === 'ACTIVE' ? counts.active : counts.inactive;

        const clipPath = isFirst
          ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
          : isLast
          ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
          : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)';

        return (
          <button
            key={ch.key}
            type="button"
            onClick={() => onSelect(ch.key)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: isFirst
                ? '10px 22px 10px 16px'
                : isLast
                ? '10px 18px 10px 24px'
                : '10px 20px 10px 24px',
              marginLeft: isFirst ? 0 : -6,
              zIndex: isSelected ? 12 : UOM_STATUS_CHEVRONS.length - idx,
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: '0.4px',
              whiteSpace: 'nowrap',
              border: 'none',
              outline: 'none',
              cursor: 'pointer',
              clipPath,
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              background: isSelected
                ? `linear-gradient(135deg, ${ch.activeBg} 0%, ${ch.color} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              color: isSelected ? '#ffffff' : '#334155',
              boxShadow: isSelected
                ? `0 4px 14px ${ch.color}55, inset 0 0 0 1.5px rgba(255,255,255,0.3)`
                : 'inset 0 0 0 1px #e2e8f0',
              transform: isSelected ? 'scale(1.025)' : 'scale(1)',
            }}
          >
            <span style={{ fontSize: 14, display: 'flex', alignItems: 'center' }}>{ch.icon}</span>
            <span>{ch.label}</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 22,
                height: 20,
                padding: '0 6px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 800,
                background: isSelected ? 'rgba(255, 255, 255, 0.28)' : '#e2e8f0',
                color: isSelected ? '#ffffff' : '#475569',
                boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

const UomManagement: React.FC = () => {
  const { message } = App.useApp();
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalVisible, setModalVisible] = useState(false);
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [editingUom, setEditingUom] = useState<Uom | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<string | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);

  // Column visibility state persisted in localStorage
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('erp_uom_cols');
      return stored ? { ...DEFAULT_UOM_COLUMNS, ...JSON.parse(stored) } : DEFAULT_UOM_COLUMNS;
    } catch {
      return DEFAULT_UOM_COLUMNS;
    }
  });

  const fetchUoms = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterType) params.uomType = filterType;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      const response = await apiService.get<{ data: Uom[]; total: number }>('/master-data/uom', params);
      setUoms(response.data || []);
      setTotal(response.total || 0);
    } catch (error) {
      message.error('Failed to fetch UOMs');
    } finally {
      setLoading(false);
    }
  }, [search, filterType, statusFilter, pageSize, message]);

  useEffect(() => {
    fetchUoms(page);
  }, [page, fetchUoms]);

  const counts = useMemo(() => {
    const active = uoms.filter((d) => d.status === 'ACTIVE').length;
    const inactive = uoms.filter((d) => d.status === 'INACTIVE').length;
    return {
      all: total || uoms.length,
      active: statusFilter === 'ACTIVE' ? (total || active) : active,
      inactive: statusFilter === 'INACTIVE' ? (total || inactive) : inactive,
    };
  }, [uoms, total, statusFilter]);

  const handleCreate = () => {
    setEditingUom(null);
    form.resetFields();
    form.setFieldsValue({ decimalPrecision: 2 });
    setIsModalMinimized(false);
    setModalVisible(true);
  };

  const handleEdit = (record: Uom) => {
    setEditingUom(record);
    form.setFieldsValue(record);
    setIsModalMinimized(false);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingUom) {
        await apiService.patch(`/master-data/uom/${editingUom.id}`, values);
        message.success('UOM updated');
      } else {
        await apiService.post('/master-data/uom', values);
        message.success('UOM created');
      }
      setModalVisible(false);
      setIsModalMinimized(false);
      fetchUoms(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/uom/${id}/activate`);
      message.success('UOM activated');
      fetchUoms(page);
    } catch (error) {
      message.error('Failed to activate UOM');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/uom/${id}/deactivate`);
      message.success('UOM deactivated');
      fetchUoms(page);
    } catch (error) {
      message.error('Failed to deactivate UOM');
    }
  };

  const filters: FilterOption[] = [
    {
      key: 'uomType',
      placeholder: 'UOM Type',
      value: filterType,
      options: UOM_TYPES.map(t => ({ value: t, label: t })),
      onChange: (v) => { setFilterType(v); setPage(1); },
    },
  ];

  const activeFilterCount = (filterType ? 1 : 0) + (statusFilter !== 'ALL' ? 1 : 0);

  const allColumns: ColumnsType<Uom> = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 120 },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 180 },
    { title: 'Symbol', dataIndex: 'symbol', key: 'symbol', width: 100 },
    { title: 'UOM Type', dataIndex: 'uomType', key: 'uomType', width: 130 },
    { title: 'Decimal Precision', dataIndex: 'decimalPrecision', key: 'decimalPrecision', width: 150 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (s: string) => <StatusBadge status={s} />,
    },
    {
      title: 'Actions', key: 'actions', width: 140,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {record.status === 'INACTIVE' ? (
            <Popconfirm title="Activate this UOM?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link">Activate</Button>
            </Popconfirm>
          ) : (
            <Popconfirm title="Deactivate this UOM?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger>Deactivate</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const columns = useMemo(() => {
    return allColumns.filter((col) => {
      const k = String(col.key || (col as any).dataIndex || '');
      if (!k) return true;
      return visibleCols[k] !== false;
    });
  }, [allColumns, visibleCols]);

  return (
    <div>
      <PageHeader
        icon={<CalculatorOutlined />}
        title="Units of Measure"
        subtitle={`Manage measurement units and types · ${total} records`}
        showBreadcrumbs
      />

      {/* Top 2027 Status Chevron Pipeline Ribbon */}
      <UomStatusChevronRibbon
        counts={counts}
        activeKey={statusFilter}
        onSelect={(k) => { setStatusFilter(k); setPage(1); }}
      />

      {/* Modern 2027 Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
          <Input.Search
            placeholder="Search UOM code or name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            onSearch={() => fetchUoms(1)}
            allowClear
            style={{ width: 280 }}
          />

          <Button
            icon={<FilterOutlined />}
            onClick={() => setShowFilters(!showFilters)}
            type={showFilters ? 'primary' : 'default'}
            ghost={showFilters}
            style={{ borderRadius: 6, fontWeight: 600 }}
          >
            More Filters ⛭
          </Button>

          {/* Columns Visibility Dropdown */}
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{
              items: [
                {
                  key: 'col_header',
                  label: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minWidth: 160 }}>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>Visible Columns</span>
                      <Button
                        type="link"
                        size="small"
                        style={{ fontSize: 11, padding: 0, height: 'auto' }}
                        onClick={() => {
                          const reset = { ...DEFAULT_UOM_COLUMNS };
                          setVisibleCols(reset);
                          localStorage.setItem('erp_uom_cols', JSON.stringify(reset));
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  ),
                },
                { type: 'divider' },
                ...Object.entries(UOM_COLUMN_LABELS).map(([colKey, label]) => ({
                  key: colKey,
                  label: (
                    <Checkbox
                      checked={visibleCols[colKey] !== false}
                      disabled={colKey === 'code' || colKey === 'name'}
                      onChange={(e) => {
                        const updated = { ...visibleCols, [colKey]: e.target.checked };
                        setVisibleCols(updated);
                        localStorage.setItem('erp_uom_cols', JSON.stringify(updated));
                      }}
                    >
                      {label}
                    </Checkbox>
                  ),
                })),
              ],
            }}
          >
            <Button icon={<AppstoreOutlined />} style={{ borderRadius: 6, fontWeight: 600 }}>
              Columns ⊞
            </Button>
          </Dropdown>

          {/* Reset button */}
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setSearch('');
              setStatusFilter('ALL');
              setFilterType(undefined);
              setShowFilters(false);
              setPage(1);
            }}
            style={{ borderRadius: 6 }}
          >
            Reset ↺
          </Button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ borderRadius: 6, fontWeight: 600 }}>
            Add UOM
          </Button>
        </div>
      </div>

      <FilterBar filters={filters} visible={showFilters} />

      <Card styles={{ body: { padding: '8px 0 0' } }}>
        <Table
          columns={columns}
          dataSource={uoms}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p, ps) => { setPage(ps !== pageSize ? 1 : p); setPageSize(ps); },
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (t, range) => `${range[0]}-${range[1]} of ${t} UOMs`,
          }}
          locale={{
            emptyText: (
              <EmptyState
                title={search || filterType || statusFilter !== 'ALL' ? 'No UOMs match your search' : 'No UOMs found'}
                description={search || filterType || statusFilter !== 'ALL' ? 'Try adjusting your search criteria.' : 'Get started by adding your first unit of measure.'}
                actionLabel="Add UOM"
                onAction={handleCreate}
              />
            ),
          }}
        />
      </Card>

      <DraggableResizableModal
        title={editingUom ? 'Edit UOM' : 'Create UOM'}
        open={modalVisible && !isModalMinimized}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false);
          setIsModalMinimized(false);
        }}
        onMinimize={() => setIsModalMinimized(true)}
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input disabled={!!editingUom} />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="symbol" label="Symbol" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="uomType" label="UOM Type" rules={[{ required: true }]}>
            <Select>
              {UOM_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="decimalPrecision" label="Decimal Precision" rules={[{ required: true }]}>
            <InputNumber min={0} max={10} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </DraggableResizableModal>

      {/* Floating minimized dock for UOM Modal */}
      {modalVisible && isModalMinimized && (
        <div className="erp-minimized-dock" data-testid="uom-minimized-dock">
          <div
            className="erp-minimized-tab"
            onClick={() => setIsModalMinimized(false)}
            title="Click to restore UOM modal"
            role="button"
            tabIndex={0}
          >
            <div className="erp-minimized-pulse" />
            <CalculatorOutlined style={{ fontSize: 13, color: '#3b82f6' }} />
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {editingUom ? `Edit: ${editingUom.code}` : 'New UOM'}
            </span>
            <span
              className="erp-minimized-close"
              title="Close and discard"
              onClick={(e) => {
                e.stopPropagation();
                setIsModalMinimized(false);
                setModalVisible(false);
              }}
            >
              ×
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default UomManagement;
