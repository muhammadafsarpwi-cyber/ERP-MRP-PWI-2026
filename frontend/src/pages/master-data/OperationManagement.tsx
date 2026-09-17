import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  App, Table, Button, Space, Modal, Form, Input, InputNumber, Popconfirm, Card, Checkbox, Dropdown,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SettingOutlined, FilterOutlined,
  AppstoreOutlined, CheckCircleOutlined, MinusOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader, StatusBadge, EmptyState, FilterBar, DraggableResizableModal } from '../../components/shared';
import type { FilterOption } from '../../components/shared/FilterBar';

interface Operation {
  id: string;
  operationCode: string;
  operationName: string;
  description: string | null;
  setupTimeMinutes: number;
  runTimeMinutes: number;
  queueTimeMinutes: number;
  waitTimeMinutes: number;
  status: string;
}

// ─── Column Visibility Constants ──────────────────────────────────
const DEFAULT_OPERATION_COLUMNS: Record<string, boolean> = {
  operationCode: true,
  operationName: true,
  description: true,
  setupTimeMinutes: true,
  runTimeMinutes: true,
  queueTimeMinutes: true,
  waitTimeMinutes: true,
  status: true,
  actions: true,
};

const OPERATION_COLUMN_LABELS: Record<string, string> = {
  operationCode: 'Code',
  operationName: 'Name',
  description: 'Description',
  setupTimeMinutes: 'Setup (min)',
  runTimeMinutes: 'Run (min)',
  queueTimeMinutes: 'Queue (min)',
  waitTimeMinutes: 'Wait (min)',
  status: 'Status',
  actions: 'Actions',
};

const OPERATION_STATUS_CHEVRONS = [
  { key: 'ALL', label: 'ALL OPERATIONS', color: '#334155', activeBg: '#1e293b', icon: <AppstoreOutlined /> },
  { key: 'ACTIVE', label: 'ACTIVE', color: '#16a34a', activeBg: '#15803d', icon: <CheckCircleOutlined /> },
  { key: 'INACTIVE', label: 'INACTIVE', color: '#64748b', activeBg: '#475569', icon: <MinusOutlined /> },
];

const OperationStatusChevronRibbon: React.FC<{
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
      {OPERATION_STATUS_CHEVRONS.map((ch, idx) => {
        const isSelected = activeKey === ch.key;
        const isFirst = idx === 0;
        const isLast = idx === OPERATION_STATUS_CHEVRONS.length - 1;
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
              zIndex: isSelected ? 12 : OPERATION_STATUS_CHEVRONS.length - idx,
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

const OperationManagement: React.FC = () => {
  const { message } = App.useApp();
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalVisible, setModalVisible] = useState(false);
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [editingOp, setEditingOp] = useState<Operation | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showFilters, setShowFilters] = useState(false);

  // Column visibility state persisted in localStorage
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('erp_operation_cols');
      return stored ? { ...DEFAULT_OPERATION_COLUMNS, ...JSON.parse(stored) } : DEFAULT_OPERATION_COLUMNS;
    } catch {
      return DEFAULT_OPERATION_COLUMNS;
    }
  });

  const fetchOperations = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      const response = await apiService.get<{ data: Operation[]; total: number }>('/master-data/operations', params);
      setOperations(response.data || []);
      setTotal(response.total || 0);
    } catch (error) {
      message.error('Failed to fetch operations');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, pageSize, message]);

  useEffect(() => {
    fetchOperations(page);
  }, [page, fetchOperations]);

  const counts = useMemo(() => {
    const active = operations.filter((d) => d.status === 'ACTIVE').length;
    const inactive = operations.filter((d) => d.status === 'INACTIVE').length;
    return {
      all: total || operations.length,
      active: statusFilter === 'ACTIVE' ? (total || active) : active,
      inactive: statusFilter === 'INACTIVE' ? (total || inactive) : inactive,
    };
  }, [operations, total, statusFilter]);

  const handleCreate = () => {
    setEditingOp(null);
    form.resetFields();
    setIsModalMinimized(false);
    setModalVisible(true);
  };

  const handleEdit = (record: Operation) => {
    setEditingOp(record);
    form.setFieldsValue(record);
    setIsModalMinimized(false);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingOp) {
        await apiService.patch(`/master-data/operations/${editingOp.id}`, values);
        message.success('Operation updated');
      } else {
        await apiService.post('/master-data/operations', values);
        message.success('Operation created');
      }
      setModalVisible(false);
      setIsModalMinimized(false);
      fetchOperations(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/operations/${id}/status`, { status: 'ACTIVE' });
      message.success('Operation activated');
      fetchOperations(page);
    } catch (error) {
      message.error('Failed to activate operation');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/operations/${id}/status`, { status: 'INACTIVE' });
      message.success('Operation deactivated');
      fetchOperations(page);
    } catch (error) {
      message.error('Failed to deactivate operation');
    }
  };

  const filters: FilterOption[] = [
    {
      key: 'status',
      placeholder: 'Status',
      value: statusFilter === 'ALL' ? undefined : statusFilter,
      options: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'INACTIVE', label: 'Inactive' },
      ],
      onChange: (v) => { setStatusFilter(v || 'ALL'); setPage(1); },
    },
  ];

  const activeFilterCount = (statusFilter !== 'ALL' ? 1 : 0) + (search ? 1 : 0);

  const allColumns: ColumnsType<Operation> = [
    { title: 'Code', dataIndex: 'operationCode', key: 'operationCode', width: 120 },
    { title: 'Name', dataIndex: 'operationName', key: 'operationName', width: 200 },
    { title: 'Description', dataIndex: 'description', key: 'description', width: 200, ellipsis: true },
    { title: 'Setup (min)', dataIndex: 'setupTimeMinutes', key: 'setupTimeMinutes', width: 100, align: 'right' },
    { title: 'Run (min)', dataIndex: 'runTimeMinutes', key: 'runTimeMinutes', width: 100, align: 'right' },
    { title: 'Queue (min)', dataIndex: 'queueTimeMinutes', key: 'queueTimeMinutes', width: 100, align: 'right' },
    { title: 'Wait (min)', dataIndex: 'waitTimeMinutes', key: 'waitTimeMinutes', width: 100, align: 'right' },
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
            <Popconfirm title="Activate this operation?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link">Activate</Button>
            </Popconfirm>
          ) : (
            <Popconfirm title="Deactivate this operation?" onConfirm={() => handleDeactivate(record.id)}>
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
        icon={<SettingOutlined />}
        title="Operations"
        subtitle={`Manufacturing operation definitions · ${total} records`}
        showBreadcrumbs
      />

      {/* Top 2027 Status Chevron Pipeline Ribbon */}
      <OperationStatusChevronRibbon
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
            placeholder="Search operations..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            onSearch={() => fetchOperations(1)}
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
            More Filters
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
                          const reset = { ...DEFAULT_OPERATION_COLUMNS };
                          setVisibleCols(reset);
                          localStorage.setItem('erp_operation_cols', JSON.stringify(reset));
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  ),
                },
                { type: 'divider' },
                ...Object.entries(OPERATION_COLUMN_LABELS).map(([colKey, label]) => ({
                  key: colKey,
                  label: (
                    <Checkbox
                      checked={visibleCols[colKey] !== false}
                      disabled={colKey === 'operationCode' || colKey === 'operationName'}
                      onChange={(e) => {
                        const updated = { ...visibleCols, [colKey]: e.target.checked };
                        setVisibleCols(updated);
                        localStorage.setItem('erp_operation_cols', JSON.stringify(updated));
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
            Add Operation
          </Button>
        </div>
      </div>

      <FilterBar filters={filters} visible={showFilters} />

      <Card styles={{ body: { padding: '8px 0 0' } }}>
        <Table
          columns={columns}
          dataSource={operations}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p, ps) => { setPage(ps !== pageSize ? 1 : p); setPageSize(ps); },
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (t, range) => `${range[0]}-${range[1]} of ${t} operations`,
          }}
          locale={{
            emptyText: (
              <EmptyState
                title={search || statusFilter !== 'ALL' ? 'No operations match your search' : 'No operations found'}
                description={search || statusFilter !== 'ALL' ? 'Try adjusting your search criteria.' : 'Get started by adding your first manufacturing operation.'}
                actionLabel="Add Operation"
                onAction={handleCreate}
              />
            ),
          }}
        />
      </Card>

      <DraggableResizableModal
        title={editingOp ? 'Edit Operation' : 'Create Operation'}
        open={modalVisible && !isModalMinimized}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false);
          setIsModalMinimized(false);
        }}
        onMinimize={() => setIsModalMinimized(true)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="operationCode" label="Operation Code" rules={[{ required: true }]}>
            <Input disabled={!!editingOp} maxLength={50} />
          </Form.Item>
          <Form.Item name="operationName" label="Operation Name" rules={[{ required: true }]}>
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space size="middle" style={{ width: '100%' }}>
            <Form.Item name="setupTimeMinutes" label="Setup Time (min)" initialValue={0}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="runTimeMinutes" label="Run Time (min)" initialValue={0}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Space size="middle" style={{ width: '100%' }}>
            <Form.Item name="queueTimeMinutes" label="Queue Time (min)" initialValue={0}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="waitTimeMinutes" label="Wait Time (min)" initialValue={0}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
        </Form>
      </DraggableResizableModal>

      {/* Floating minimized dock for Operation Modal */}
      {modalVisible && isModalMinimized && (
        <div className="erp-minimized-dock" data-testid="operation-minimized-dock">
          <div
            className="erp-minimized-tab"
            onClick={() => setIsModalMinimized(false)}
            title="Click to restore Operation modal"
            role="button"
            tabIndex={0}
          >
            <div className="erp-minimized-pulse" />
            <SettingOutlined style={{ fontSize: 13, color: '#3b82f6' }} />
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {editingOp ? `Edit: ${editingOp.operationCode}` : 'New Operation'}
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

export default OperationManagement;
