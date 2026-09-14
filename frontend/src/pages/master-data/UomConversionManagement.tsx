import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  App, Table, Button, Space, Modal, Form, Select, InputNumber, Popconfirm, Card, Input, Checkbox, Dropdown,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SwapOutlined, SearchOutlined,
  AppstoreOutlined, CheckCircleOutlined, MinusOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader, StatusBadge, EmptyState, DraggableResizableModal } from '../../components/shared';

interface UomConversion {
  id: string;
  fromUomId: string;
  fromUomCode: string;
  toUomId: string;
  toUomCode: string;
  conversionFactor: number;
  status: string;
}

interface UomOption {
  id: string;
  code: string;
  name: string;
}

// ─── Column Visibility Constants ──────────────────────────────────
const DEFAULT_CONVERSION_COLUMNS: Record<string, boolean> = {
  fromUomId: true,
  toUomId: true,
  conversionFactor: true,
  status: true,
  actions: true,
};

const CONVERSION_COLUMN_LABELS: Record<string, string> = {
  fromUomId: 'From UOM',
  toUomId: 'To UOM',
  conversionFactor: 'Conversion Factor',
  status: 'Status',
  actions: 'Actions',
};

const CONVERSION_STATUS_CHEVRONS = [
  { key: 'ALL', label: 'ALL CONVERSIONS', color: '#334155', activeBg: '#1e293b', icon: <AppstoreOutlined /> },
  { key: 'ACTIVE', label: 'ACTIVE', color: '#16a34a', activeBg: '#15803d', icon: <CheckCircleOutlined /> },
  { key: 'INACTIVE', label: 'INACTIVE', color: '#64748b', activeBg: '#475569', icon: <MinusOutlined /> },
];

const UomConversionStatusChevronRibbon: React.FC<{
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
      {CONVERSION_STATUS_CHEVRONS.map((ch, idx) => {
        const isSelected = activeKey === ch.key;
        const isFirst = idx === 0;
        const isLast = idx === CONVERSION_STATUS_CHEVRONS.length - 1;
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
              zIndex: isSelected ? 12 : CONVERSION_STATUS_CHEVRONS.length - idx,
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

const UomConversionManagement: React.FC = () => {
  const { message } = App.useApp();
  const [conversions, setConversions] = useState<UomConversion[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalVisible, setModalVisible] = useState(false);
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [editingConversion, setEditingConversion] = useState<UomConversion | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Column visibility state persisted in localStorage
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('erp_conversion_cols');
      return stored ? { ...DEFAULT_CONVERSION_COLUMNS, ...JSON.parse(stored) } : DEFAULT_CONVERSION_COLUMNS;
    } catch {
      return DEFAULT_CONVERSION_COLUMNS;
    }
  });

  const fetchConversions = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      const response = await apiService.get<{ data: UomConversion[]; total: number }>('/master-data/uom-conversions', params);
      setConversions(response.data || []);
      setTotal(response.total || 0);
    } catch (error) {
      message.error('Failed to fetch UOM conversions');
    } finally {
      setLoading(false);
    }
  }, [pageSize, search, statusFilter, message]);

  const fetchUoms = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: UomOption[] }>('/master-data/uom', { limit: 200 });
      setUoms(response.data || []);
    } catch (error) {
      message.error('Failed to fetch UOMs');
    }
  }, [message]);

  useEffect(() => {
    fetchUoms();
  }, [fetchUoms]);

  useEffect(() => {
    fetchConversions(page);
  }, [page, fetchConversions]);

  const counts = useMemo(() => {
    const active = conversions.filter((d) => d.status === 'ACTIVE').length;
    const inactive = conversions.filter((d) => d.status === 'INACTIVE').length;
    return {
      all: total || conversions.length,
      active: statusFilter === 'ACTIVE' ? (total || active) : active,
      inactive: statusFilter === 'INACTIVE' ? (total || inactive) : inactive,
    };
  }, [conversions, total, statusFilter]);

  const handleCreate = () => {
    setEditingConversion(null);
    form.resetFields();
    form.setFieldsValue({ conversionFactor: 1 });
    setIsModalMinimized(false);
    setModalVisible(true);
  };

  const handleEdit = (record: UomConversion) => {
    setEditingConversion(record);
    form.setFieldsValue({
      fromUomId: record.fromUomId,
      toUomId: record.toUomId,
      conversionFactor: record.conversionFactor,
    });
    setIsModalMinimized(false);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (values.fromUomId === values.toUomId) {
        message.error('From UOM and To UOM must be different');
        return;
      }
      if (editingConversion) {
        await apiService.patch(`/master-data/uom-conversions/${editingConversion.id}`, values);
        message.success('UOM conversion updated');
      } else {
        await apiService.post('/master-data/uom-conversions', values);
        message.success('UOM conversion created');
      }
      setModalVisible(false);
      setIsModalMinimized(false);
      fetchConversions(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/uom-conversions/${id}/activate`);
      message.success('UOM conversion activated');
      fetchConversions(page);
    } catch (error) {
      message.error('Failed to activate UOM conversion');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/uom-conversions/${id}/deactivate`);
      message.success('UOM conversion deactivated');
      fetchConversions(page);
    } catch (error) {
      message.error('Failed to deactivate UOM conversion');
    }
  };

  const getUomLabel = (uomId: string) => {
    const uom = uoms.find(u => u.id === uomId);
    return uom ? `${uom.name} (${uom.code})` : uomId;
  };

  const allColumns: ColumnsType<UomConversion> = [
    {
      title: 'From UOM', dataIndex: 'fromUomId', key: 'fromUomId', width: 180,
      render: (v: string) => getUomLabel(v),
    },
    {
      title: 'To UOM', dataIndex: 'toUomId', key: 'toUomId', width: 180,
      render: (v: string) => getUomLabel(v),
    },
    { title: 'Conversion Factor', dataIndex: 'conversionFactor', key: 'conversionFactor', width: 160 },
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
            <Popconfirm title="Activate this conversion?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link">Activate</Button>
            </Popconfirm>
          ) : (
            <Popconfirm title="Deactivate this conversion?" onConfirm={() => handleDeactivate(record.id)}>
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
        icon={<SwapOutlined />}
        title="UOM Conversions"
        subtitle={`Manage unit of measure conversion factors · ${total} records`}
        showBreadcrumbs
      />

      {/* Top 2027 Status Chevron Pipeline Ribbon */}
      <UomConversionStatusChevronRibbon
        counts={counts}
        activeKey={statusFilter}
        onSelect={(k) => { setStatusFilter(k); setPage(1); }}
      />

      {/* Modern 2027 Toolbar */}
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
            placeholder="Search conversions..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            onSearch={() => fetchConversions(1)}
            allowClear
            style={{ width: 280 }}
          />

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
                          const reset = { ...DEFAULT_CONVERSION_COLUMNS };
                          setVisibleCols(reset);
                          localStorage.setItem('erp_conversion_cols', JSON.stringify(reset));
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  ),
                },
                { type: 'divider' },
                ...Object.entries(CONVERSION_COLUMN_LABELS).map(([colKey, label]) => ({
                  key: colKey,
                  label: (
                    <Checkbox
                      checked={visibleCols[colKey] !== false}
                      disabled={colKey === 'fromUomId' || colKey === 'toUomId'}
                      onChange={(e) => {
                        const updated = { ...visibleCols, [colKey]: e.target.checked };
                        setVisibleCols(updated);
                        localStorage.setItem('erp_conversion_cols', JSON.stringify(updated));
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
              setPage(1);
            }}
            style={{ borderRadius: 6 }}
          >
            Reset ↺
          </Button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ borderRadius: 6, fontWeight: 600 }}>
            Add Conversion
          </Button>
        </div>
      </div>

      <Card styles={{ body: { padding: '8px 0 0' } }}>
        <Table
          columns={columns}
          dataSource={conversions}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p, ps) => { setPage(ps !== pageSize ? 1 : p); setPageSize(ps); },
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (t, range) => `${range[0]}-${range[1]} of ${t} conversions`,
          }}
          locale={{
            emptyText: (
              <EmptyState
                title={search || statusFilter !== 'ALL' ? 'No conversions match your search' : 'No UOM conversions found'}
                description={search || statusFilter !== 'ALL' ? 'Try adjusting your search criteria.' : 'Get started by adding your first conversion factor.'}
                actionLabel="Add Conversion"
                onAction={handleCreate}
              />
            ),
          }}
        />
      </Card>

      <DraggableResizableModal
        title={editingConversion ? 'Edit UOM Conversion' : 'Create UOM Conversion'}
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
          <Form.Item
            name="fromUomId"
            label="From UOM"
            rules={[{ required: true, message: 'Please select a From UOM' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={uoms.map(u => ({ value: u.id, label: `${u.name} (${u.code})` }))}
            />
          </Form.Item>
          <Form.Item
            name="toUomId"
            label="To UOM"
            rules={[{ required: true, message: 'Please select a To UOM' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={uoms.map(u => ({ value: u.id, label: `${u.name} (${u.code})` }))}
            />
          </Form.Item>
          <Form.Item
            name="conversionFactor"
            label="Conversion Factor"
            rules={[{ required: true, message: 'Please enter a conversion factor' }]}
          >
            <InputNumber min={0.000001} step={0.001} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </DraggableResizableModal>

      {/* Floating minimized dock for UOM Conversion Modal */}
      {modalVisible && isModalMinimized && (
        <div className="erp-minimized-dock" data-testid="uomconversion-minimized-dock">
          <div
            className="erp-minimized-tab"
            onClick={() => setIsModalMinimized(false)}
            title="Click to restore UOM Conversion modal"
            role="button"
            tabIndex={0}
          >
            <div className="erp-minimized-pulse" />
            <SwapOutlined style={{ fontSize: 13, color: '#3b82f6' }} />
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {editingConversion ? `Edit Conversion` : 'New Conversion'}
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

export default UomConversionManagement;
