import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  App, Table, Button, Space, Modal, Form, Input, Popconfirm, Card, Checkbox, Dropdown,
} from 'antd';
import {
  PlusOutlined, EditOutlined, TagsOutlined,
  AppstoreOutlined, CheckCircleOutlined, MinusOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService, { describeRequestError } from '../../services/api';
import SaveResultDialog, { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import { PageHeader, StatusBadge, EmptyState, DraggableResizableModal } from '../../components/shared';
import { handleValidationErrors } from '../../utils/formValidationHelper';

interface RouteType {
  id: string;
  routeCode: string;
  name: string;
  description: string | null;
  status: string;
  companyId: string;
}

// ─── Column Visibility Constants ──────────────────────────────────
const DEFAULT_ROUTE_TYPE_COLUMNS: Record<string, boolean> = {
  routeCode: true,
  name: true,
  description: true,
  status: true,
  actions: true,
};

const ROUTE_TYPE_COLUMN_LABELS: Record<string, string> = {
  routeCode: 'Route Code',
  name: 'Name',
  description: 'Description',
  status: 'Status',
  actions: 'Actions',
};

const ROUTE_TYPE_STATUS_CHEVRONS = [
  { key: 'ALL', label: 'ALL ROUTE TYPES', color: '#334155', activeBg: '#1e293b', icon: <AppstoreOutlined /> },
  { key: 'ACTIVE', label: 'ACTIVE', color: '#16a34a', activeBg: '#15803d', icon: <CheckCircleOutlined /> },
  { key: 'INACTIVE', label: 'INACTIVE', color: '#64748b', activeBg: '#475569', icon: <MinusOutlined /> },
];

const RouteTypeStatusChevronRibbon: React.FC<{
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
      {ROUTE_TYPE_STATUS_CHEVRONS.map((ch, idx) => {
        const isSelected = activeKey === ch.key;
        const isFirst = idx === 0;
        const isLast = idx === ROUTE_TYPE_STATUS_CHEVRONS.length - 1;
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
              zIndex: isSelected ? 12 : ROUTE_TYPE_STATUS_CHEVRONS.length - idx,
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

const RouteTypeManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<RouteType[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalVisible, setModalVisible] = useState(false);
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [editing, setEditing] = useState<RouteType | null>(null);
  const [saving, setSaving] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultPhase, setResultPhase] = useState<SaveResultPhase>('loading');
  const [result, setResult] = useState<SaveResultData | null>(null);
  const [resultError, setResultError] = useState<string>('');
  const [resultErrorTitle, setResultErrorTitle] = useState<string | undefined>(undefined);
  const [resultErrorLead, setResultErrorLead] = useState<string | undefined>(undefined);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Column visibility state persisted in localStorage
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('erp_route_type_cols');
      return stored ? { ...DEFAULT_ROUTE_TYPE_COLUMNS, ...JSON.parse(stored) } : DEFAULT_ROUTE_TYPE_COLUMNS;
    } catch {
      return DEFAULT_ROUTE_TYPE_COLUMNS;
    }
  });

  const resolveCompanyId = useCallback(async (): Promise<string | null> => {
    try {
      const stored = localStorage.getItem('erp_user');
      const user = stored ? JSON.parse(stored) : null;
      if (user?.defaultCompanyId) return user.defaultCompanyId as string;
    } catch { /* ignore */ }
    try {
      const res = await apiService.get<{ data: Array<{ id: string }> }>('/companies', { limit: 1 });
      return res.data?.[0]?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    resolveCompanyId().then(setCompanyId);
  }, [resolveCompanyId]);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page: pageNum, limit: pageSize };
      if (companyId) params.companyId = companyId;
      if (search) params.search = search;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      const res = await apiService.get<{ data: RouteType[]; total: number }>('/master-data/route-types', params);
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load route types');
    } finally {
      setLoading(false);
    }
  }, [pageSize, search, statusFilter, companyId, message]);

  useEffect(() => { void fetchData(1); }, [fetchData]);

  const counts = useMemo(() => {
    const active = data.filter((d) => d.status === 'ACTIVE').length;
    const inactive = data.filter((d) => d.status === 'INACTIVE').length;
    return {
      all: total || data.length,
      active: statusFilter === 'ACTIVE' ? (total || active) : active,
      inactive: statusFilter === 'INACTIVE' ? (total || inactive) : inactive,
    };
  }, [data, total, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setIsModalMinimized(false);
    setModalVisible(true);
  };

  const openEdit = (record: RouteType) => {
    setEditing(record);
    form.setFieldsValue({
      routeCode: record.routeCode,
      name: record.name,
      description: record.description ?? undefined,
    });
    setIsModalMinimized(false);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (saving) return;
    let raw: any;
    try {
      raw = await form.validateFields();
    } catch (err: any) {
      const val = handleValidationErrors(err, form);
      if (val) {
        setResultErrorTitle('Required Information Missing');
        setResultErrorLead('Please complete all required fields before saving:');
        setResultError(val.bulletList);
        setResultPhase('error');
        setResultOpen(true);
        return;
      }
      message.error(describeRequestError(err));
      return;
    }
    const payload: Record<string, unknown> = { ...raw };
    if (!editing && companyId) payload.companyId = companyId;
    setResultErrorTitle(undefined);
    setResultErrorLead(undefined);
    setSaving(true);
    setResultPhase('loading');
    setResultOpen(true);
    try {
      let saved: { routeCode?: string; name?: string } | undefined;
      if (editing) {
        const res = (await apiService.patch(`/master-data/route-types/${editing.id}`, payload)) as {
          data?: { data?: { routeCode?: string; name?: string } };
        };
        saved = res?.data?.data ?? res?.data as { routeCode?: string; name?: string } | undefined;
      } else {
        const res = (await apiService.post('/master-data/route-types', payload)) as {
          data?: { data?: { routeCode?: string; name?: string } };
        };
        saved = res?.data?.data ?? res?.data as { routeCode?: string; name?: string } | undefined;
      }
      setResult({
        title: editing ? 'Route Type Updated Successfully' : 'Route Type Saved Successfully',
        recordType: 'Route Code',
        recordCode: saved?.routeCode != null ? String(saved.routeCode) : undefined,
        recordName: saved?.name != null ? String(saved.name) : undefined,
      });
      setResultPhase('success');
      setModalVisible(false);
      setIsModalMinimized(false);
      void fetchData(page);
    } catch (err: any) {
      setResultError(describeRequestError(err));
      setResultPhase('error');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (record: RouteType) => {
    try {
      const action = record.status === 'ACTIVE' ? 'deactivate' : 'activate';
      await apiService.patch(`/master-data/route-types/${record.id}/${action}`, {});
      message.success(`Route type ${record.routeCode} ${record.status === 'ACTIVE' ? 'deactivated' : 'activated'}`);
      void fetchData(page);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Status change failed');
    }
  };

  const allColumns: ColumnsType<RouteType> = [
    { title: 'Route Code', dataIndex: 'routeCode', key: 'routeCode', width: 160 },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true, render: (v: string) => v || <span style={{ color: '#999' }}>—</span> },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <StatusBadge status={v} colorMap={{ ACTIVE: 'green', INACTIVE: 'red' }} />,
    },
    {
      title: 'Actions', key: 'actions', width: 140,
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm
            title={r.status === 'ACTIVE' ? 'Deactivate this route type?' : 'Activate this route type?'}
            onConfirm={() => toggleStatus(r)}
            okText="Yes"
          >
            <Button type="link" size="small" danger={r.status === 'ACTIVE'}>
              {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
            </Button>
          </Popconfirm>
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
    <div className="erp-dashboard">
      <PageHeader
        title="Route Types"
        subtitle="Manufacturing route master — used in Item Classification"
        icon={<TagsOutlined />}
      />

      {/* Top 2027 Status Chevron Pipeline Ribbon */}
      <RouteTypeStatusChevronRibbon
        counts={counts}
        activeKey={statusFilter}
        onSelect={(k) => { setStatusFilter(k); setPage(1); }}
      />

      <Card className="erp-section-card">
        {/* Modern 2027 Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '6px 0 14px 0',
            borderBottom: '1px solid #f1f5f9',
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
            <Input.Search
              placeholder="Search route type..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              onSearch={() => fetchData(1)}
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
                            const reset = { ...DEFAULT_ROUTE_TYPE_COLUMNS };
                            setVisibleCols(reset);
                            localStorage.setItem('erp_route_type_cols', JSON.stringify(reset));
                          }}
                        >
                          Reset
                        </Button>
                      </div>
                    ),
                  },
                  { type: 'divider' },
                  ...Object.entries(ROUTE_TYPE_COLUMN_LABELS).map(([colKey, label]) => ({
                    key: colKey,
                    label: (
                      <Checkbox
                        checked={visibleCols[colKey] !== false}
                        disabled={colKey === 'routeCode' || colKey === 'name'}
                        onChange={(e) => {
                          const updated = { ...visibleCols, [colKey]: e.target.checked };
                          setVisibleCols(updated);
                          localStorage.setItem('erp_route_type_cols', JSON.stringify(updated));
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

            {/* Reset filters button */}
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
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ borderRadius: 6, fontWeight: 600 }}>
              Add Route Type
            </Button>
          </div>
        </div>

        {data.length === 0 && !loading ? (
          <EmptyState title="No route types found" description="Click Add Route Type to create one." />
        ) : (
          <Table
            columns={columns}
            dataSource={data}
            rowKey="id"
            loading={loading}
            pagination={{ current: page, total, pageSize, showSizeChanger: true, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
          />
        )}
      </Card>

      <DraggableResizableModal
        open={modalVisible && !isModalMinimized}
        onCancel={() => {
          setModalVisible(false);
          setIsModalMinimized(false);
        }}
        onMinimize={() => setIsModalMinimized(true)}
        title={editing ? `Edit Route Type — ${editing.routeCode}` : 'Add Route Type'}
        footer={[
          <Button key="cancel" onClick={() => { setModalVisible(false); setIsModalMinimized(false); }} disabled={saving}>Cancel</Button>,
          <Button key="save" type="primary" onClick={handleSubmit} loading={saving} disabled={saving}>Save</Button>,
        ]}
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            name="routeCode" label="Route Code" rules={[
              { required: true, message: 'Route Code is required' },
              { pattern: /^[A-Z0-9_]+$/, message: 'Uppercase letters, numbers and underscores only' },
            ]}
            extra="Uppercase letters, numbers and underscores"
          >
            <Input placeholder="e.g. ROUTE_001" maxLength={50} disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label="Route Name" rules={[{ required: true, message: 'Route Name is required' }]}>
            <Input placeholder="e.g. Primary manufacturing route" maxLength={255} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} maxLength={1000} placeholder="Short description of this route type" />
          </Form.Item>
        </Form>
      </DraggableResizableModal>

      {/* Floating minimized dock for Route Type Modal */}
      {modalVisible && isModalMinimized && (
        <div className="erp-minimized-dock" data-testid="routetype-minimized-dock">
          <div
            className="erp-minimized-tab"
            onClick={() => setIsModalMinimized(false)}
            title="Click to restore Route Type modal"
            role="button"
            tabIndex={0}
          >
            <div className="erp-minimized-pulse" />
            <TagsOutlined style={{ fontSize: 13, color: '#3b82f6' }} />
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {editing ? `Edit: ${editing.routeCode}` : 'New Route Type'}
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

      <SaveResultDialog
        open={resultOpen}
        phase={resultPhase}
        result={result}
        errorTitle={resultErrorTitle}
        errorLead={resultErrorLead}
        errorMessage={resultError}
        onRetry={handleSubmit}
        onClose={() => setResultOpen(false)}
      />
    </div>
  );
};

export default RouteTypeManagement;