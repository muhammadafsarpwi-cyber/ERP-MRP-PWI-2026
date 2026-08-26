import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Alert, App, Badge, Button, Card, DatePicker, Descriptions, Drawer, Dropdown, Form, Input, InputNumber,
  Modal, Popconfirm, Select, Space, Table, Tooltip, Typography,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, ReloadOutlined, QrcodeOutlined,
  EyeOutlined, MoreOutlined, PrinterOutlined, ClearOutlined, FilterOutlined,
  ToolOutlined, DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { PageHeader, StatusBadge, EmptyState, LoadingState } from '../../components/shared';

const { Text } = Typography;

interface OrgItem { id: string; name: string; }
interface DivisionLk extends OrgItem { divisionCode: string; }
interface SectionLk extends OrgItem { sectionCode: string; divisionId: string | null; }
interface DepartmentLk extends OrgItem { departmentCode: string; divisionId: string | null; sectionId: string | null; }

interface Machine {
  id: string;
  machineId?: string | null;
  machineCode: string;
  machineNumber?: string | null;
  name: string;
  description?: string | null;
  divisionId?: string | null;
  sectionId?: string | null;
  departmentId?: string | null;
  division?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  machineType?: string | null;
  location?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  serialNumber?: string | null;
  capacity?: string | null;
  powerRating?: string | null;
  installationDate?: string | null;
  warrantyExpiryDate?: string | null;
  criticality: string;
  status: string;
  qrPayload?: string | null;
}

const CRITICALITY_COLORS: Record<string, string> = {
  LOW: 'default',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'red',
  MAINTENANCE: 'orange',
  RETIRED: 'default',
};

const detailDesc = (items: Array<{ label: string; children: React.ReactNode }>) => (
  <Descriptions size="small" column={2} labelStyle={{ width: 150 }}>
    {items.map((s) => (
      <Descriptions.Item key={s.label} label={s.label}>
        {s.children ?? <Text type="secondary">—</Text>}
      </Descriptions.Item>
    ))}
  </Descriptions>
);

const MachineManagement: React.FC<{ initialMachineId?: string }> = ({ initialMachineId }) => {
  const { message } = App.useApp();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string>('machineCode');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');

  const [search, setSearch] = useState('');
  const [fMachineId, setFMachineId] = useState<string>('');
  const [fDivision, setFDivision] = useState<string | undefined>();
  const [fSection, setFSection] = useState<string | undefined>();
  const [fDepartment, setFDepartment] = useState<string | undefined>();
  const [fStatus, setFStatus] = useState<string | undefined>();
  const [fCriticality, setFCriticality] = useState<string | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  const [divisions, setDivisions] = useState<DivisionLk[]>([]);
  const [sections, setSections] = useState<SectionLk[]>([]);
  const [departments, setDepartments] = useState<DepartmentLk[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [detail, setDetail] = useState<Machine | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [qrModal, setQrModal] = useState<{ visible: boolean; machine: Machine | null; dataUrl: string; payload: string; url: string }>({
    visible: false, machine: null, dataUrl: '', payload: '', url: '',
  });
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const formDivisionId = Form.useWatch('divisionId', form);
  const formSectionId = Form.useWatch('sectionId', form);

  useEffect(() => {
    if (initialMachineId) {
      (async () => {
        try {
          const m = await apiService.get<Machine>(`/machines/qr/${initialMachineId}`);
          setDetail(m);
        } catch {
          message.warning('Machine not found for the scanned QR link');
        }
      })();
    }
  }, [initialMachineId, message]);

  const fetchMachines = useCallback(async (pageNum: number = page) => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page: pageNum, limit: pageSize, sortBy, sortDir };
      if (search) params.search = search;
      if (fMachineId) params.machineId = fMachineId;
      if (fDivision) params.divisionId = fDivision;
      if (fSection) params.sectionId = fSection;
      if (fDepartment) params.departmentId = fDepartment;
      if (fStatus) params.status = fStatus;
      if (fCriticality) params.criticality = fCriticality;
      const response = await apiService.get<{ data: Machine[]; total: number }>('/machines', params);
      setMachines(response.data);
      setTotal(response.total);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load machines. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortDir, search, fMachineId, fDivision, fSection, fDepartment, fStatus, fCriticality]);

  useEffect(() => { fetchMachines(page); }, [page, pageSize, fetchMachines]);

  useEffect(() => {
    (async () => {
      try {
        const [div, sec, dep] = await Promise.all([
          apiService.get<{ data: DivisionLk[] }>('/divisions', { limit: 200 }),
          apiService.get<{ data: SectionLk[] }>('/sections', { limit: 500 }),
          apiService.get<{ data: DepartmentLk[] }>('/departments', { limit: 500 }),
        ]);
        setDivisions(div.data || []);
        setSections(sec.data || []);
        setDepartments(dep.data || []);
      } catch {
        message.warning('Could not load division / section / department lookups');
      }
    })();
  }, [message]);

  const sectionsForDivision = useMemo(
    () => (divisionId?: string) => (divisionId ? sections.filter((s) => s.divisionId === divisionId) : sections),
    [sections],
  );
  const departmentsForSection = useMemo(
    () => (sectionId?: string) => (sectionId ? departments.filter((d) => d.sectionId === sectionId) : departments),
    [departments],
  );

  const activeFilterCount = useMemo(
    () => [fMachineId, fDivision, fSection, fDepartment, fStatus, fCriticality].filter(Boolean).length,
    [fMachineId, fDivision, fSection, fDepartment, fStatus, fCriticality],
  );

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalVisible(true);
  };

  const openEdit = (m: Machine) => {
    setEditing(m);
    form.setFieldsValue({
      ...m,
      installationDate: m.installationDate ? dayjs(m.installationDate) : undefined,
      warrantyExpiryDate: m.warrantyExpiryDate ? dayjs(m.warrantyExpiryDate) : undefined,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload: any = {
        ...values,
        installationDate: values.installationDate ? values.installationDate.format('YYYY-MM-DD') : null,
        warrantyExpiryDate: values.warrantyExpiryDate ? values.warrantyExpiryDate.format('YYYY-MM-DD') : null,
      };
      delete payload.machineId;
      setSaving(true);
      if (editing) {
        await apiService.patch(`/machines/${editing.id}`, payload);
        message.success('Machine updated');
      } else {
        await apiService.post('/machines', payload);
        message.success('Machine created');
      }
      setModalVisible(false);
      fetchMachines(editing ? page : 1);
      if (!editing) setPage(1);
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.message || 'Failed to save machine');
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (m: Machine, status: string) => {
    try {
      await apiService.patch(`/machines/${m.id}/status`, { status });
      message.success(`Machine ${m.machineCode} set to ${status}`);
      fetchMachines();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to change status');
    }
  };

  const handleDelete = async (m: Machine) => {
    try {
      await apiService.delete(`/machines/${m.id}`);
      message.success(`Machine ${m.machineCode} deleted`);
      fetchMachines();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to delete machine');
    }
  };

  const openDetail = async (m: Machine) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await apiService.get<Machine>(`/machines/${m.id}`);
      setDetail(res);
    } catch {
      message.error('Failed to load machine details');
    } finally {
      setDetailLoading(false);
    }
  };

  const showQr = async (m: Machine) => {
    try {
      const res = await apiService.get<{ payload: string; url: string; dataUrl: string }>(`/machines/${m.id}/qr`);
      setQrModal({ visible: true, machine: m, dataUrl: res.dataUrl, payload: res.payload, url: res.url });
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to generate QR');
    }
  };

  const printQr = () => {
    const { machine, dataUrl } = qrModal;
    if (!machine) return;
    const w = window.open('', '_blank', 'width=420,height=560');
    if (!w) { message.error('Popup blocked. Allow popups to print QR labels.'); return; }
    w.document.write(`
      <html><head><title>QR - ${machine.machineCode}</title>
      <style>body{font-family:Arial,sans-serif;text-align:center;padding:16px}
      img{width:280px;height:280px} h2{margin:8px 0 2px} p{margin:2px 0;color:#444}</style></head>
      <body>
        <h2>${machine.name}</h2>
        <p><b>${machine.machineId ?? ''}</b> · <b>${machine.machineCode}</b>${machine.machineNumber ? ' · #' + machine.machineNumber : ''}</p>
        ${machine.location ? `<p>${machine.location}</p>` : ''}
        <img src="${dataUrl}" alt="QR" />
        <p style="font-size:11px;color:#888">${qrModal.url || qrModal.payload}</p>
        <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    w.document.close();
  };

  const resetFilters = () => {
    setSearch('');
    setFMachineId('');
    setFDivision(undefined);
    setFSection(undefined);
    setFDepartment(undefined);
    setFStatus(undefined);
    setFCriticality(undefined);
    setPage(1);
    setSortBy('machineCode');
    setSortDir('ASC');
  };

  const columns: ColumnsType<Machine> = [
    {
      title: 'Machine ID', dataIndex: 'machineId', key: 'machineId', width: 110, fixed: 'left',
      sorter: true,
      render: (mid: string | null | undefined) => <code style={{ fontWeight: 600, fontSize: 13 }}>{mid ?? '—'}</code>,
    },
    {
      title: 'Code', dataIndex: 'machineCode', key: 'machineCode', width: 110,
      sorter: true,
      render: (code: string) => <Text strong style={{ fontSize: 13 }}>{code}</Text>,
    },
    {
      title: 'Machine No.', dataIndex: 'machineNumber', key: 'machineNumber', width: 100, ellipsis: true,
      render: (n: string | null | undefined) => n ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Name', dataIndex: 'name', key: 'name', width: 200, ellipsis: true,
      sorter: true,
      render: (_: any, m: Machine) => (
        <div>
          <div style={{ fontSize: 13 }}>{m.name}</div>
          {m.machineType && <Text type="secondary" style={{ fontSize: 12 }}>{m.machineType}</Text>}
        </div>
      ),
    },
    {
      title: 'Division', key: 'division', width: 120, ellipsis: true,
      render: (_: any, m: Machine) => m.division?.name ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Section', key: 'section', width: 120, ellipsis: true,
      render: (_: any, m: Machine) => m.section?.name ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Department', key: 'department', width: 140, ellipsis: true,
      render: (_: any, m: Machine) => m.department?.name ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Location', dataIndex: 'location', key: 'location', width: 130, ellipsis: true,
    },
    {
      title: 'Make / Model', key: 'makeModel', width: 150,
      render: (_: any, m: Machine) => (
        <div style={{ fontSize: 12 }}>
          <div>{m.manufacturer ?? <Text type="secondary">—</Text>}</div>
          {m.model && <Text type="secondary" style={{ fontSize: 12 }}>{m.model}</Text>}
        </div>
      ),
    },
    {
      title: 'Criticality', dataIndex: 'criticality', key: 'criticality', width: 100,
      sorter: true,
      render: (c: string) => <StatusBadge status={c} colorMap={CRITICALITY_COLORS} />,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      sorter: true,
      render: (s: string) => <StatusBadge status={s} colorMap={STATUS_COLORS} />,
    },
    {
      title: 'Actions', key: 'actions', width: 170, fixed: 'right',
      render: (_: any, m: Machine) => (
        <Space size={0}>
          <Tooltip title="View">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetail(m)} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(m)} />
          </Tooltip>
          <Tooltip title="QR Code">
            <Button type="text" size="small" icon={<QrcodeOutlined />} onClick={() => showQr(m)} />
          </Tooltip>
          <Tooltip title="Status">
            <Dropdown
              menu={{
                items: [
                  ...(m.status !== 'ACTIVE' ? [{ key: 'ACTIVE', label: 'Set Active' }] : []),
                  ...(m.status !== 'MAINTENANCE' ? [{ key: 'MAINTENANCE', label: 'Set Maintenance' }] : []),
                  ...(m.status !== 'INACTIVE' ? [{ key: 'INACTIVE', label: 'Deactivate' }] : []),
                  ...(m.status !== 'RETIRED' ? [{ key: 'RETIRED', label: 'Retire' }] : []),
                ],
                onClick: ({ key }) => handleStatus(m, key),
              }}
            >
              <Button type="text" size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Tooltip>
          <Popconfirm
            title={`Delete '${m.machineCode}'?`}
            description="Blocked if referenced by production data."
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(m)}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const sortInfo = `Sorted by ${sortBy} (${sortDir.toLowerCase()})`;

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        icon={<ToolOutlined />}
        title="Machine Master"
        subtitle={`Production machines, tools and equipment · ${total} records`}
        showBreadcrumbs
        extra={
          <>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Machine</Button>
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={() => fetchMachines()} />
            </Tooltip>
          </>
        }
      />

      <Card styles={{ body: { paddingBottom: 0 } }} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4 }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Search by code, name, serial…"
            style={{ width: 280, maxWidth: '100%' }}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Badge count={activeFilterCount}>
            <Button icon={<FilterOutlined />} onClick={() => setShowFilters((v) => !v)}>
              Filters
            </Button>
          </Badge>
          {activeFilterCount > 0 && (
            <Button type="text" icon={<ClearOutlined />} onClick={resetFilters}>
              Clear Filters
            </Button>
          )}
          <div style={{ flex: 1 }} />
          <Text type="secondary" style={{ fontSize: 12 }}>{sortInfo}</Text>
        </div>
        {showFilters && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12, padding: '14px 0 16px', marginTop: 12, borderTop: '1px solid #f0f0f0',
          }}>
            <Input
              allowClear prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Machine ID (e.g. MCH001)"
              value={fMachineId}
              onChange={(e) => { setFMachineId(e.target.value); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Division"
              style={{ width: '100%' }}
              value={fDivision}
              options={divisions.map((d) => ({ value: d.id, label: d.name }))}
              onChange={(v) => { setFDivision(v); setFSection(undefined); setFDepartment(undefined); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Section"
              style={{ width: '100%' }}
              value={fSection}
              options={sectionsForDivision(fDivision).map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => { setFSection(v); setFDepartment(undefined); setPage(1); }}
              disabled={!!fDivision && sectionsForDivision(fDivision).length === 0}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Department"
              style={{ width: '100%' }}
              value={fDepartment}
              options={(fSection ? departmentsForSection(fSection) : fDivision
                ? departments.filter((d) => d.divisionId === fDivision)
                : departments).map((d) => ({ value: d.id, label: d.name }))}
              onChange={(v) => { setFDepartment(v); setPage(1); }}
            />
            <Select
              allowClear placeholder="Status"
              style={{ width: '100%' }}
              value={fStatus}
              options={['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED'].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))}
              onChange={(v) => { setFStatus(v); setPage(1); }}
            />
            <Select
              allowClear placeholder="Criticality"
              style={{ width: '100%' }}
              value={fCriticality}
              options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((c) => ({ value: c, label: c.charAt(0) + c.slice(1).toLowerCase() }))}
              onChange={(v) => { setFCriticality(v); setPage(1); }}
            />
          </div>
        )}
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Could not load machines"
          description={error}
          action={<Button size="small" danger onClick={() => fetchMachines()}>Retry</Button>}
          style={{ marginBottom: 16 }}
          closable
        />
      )}

      <Card title={<span style={{ fontSize: 14, fontWeight: 600 }}>Machines</span>} styles={{ body: { padding: '8px 0 0' } }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={machines}
          loading={loading}
          scroll={{ x: 1500 }}
          sticky
          size="middle"
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (t, range) => `${range[0]}-${range[1]} of ${t} machines`,
            onChange: (p, ps) => { setPage(ps !== pageSize ? 1 : p); setPageSize(ps); },
          }}
          onChange={(_pg, _flt, sorter: any) => {
            if (sorter && sorter.field && !Array.isArray(sorter.field)) {
              const map: Record<string, string> = {
                machineId: 'machineId', machineCode: 'machineCode', name: 'name', criticality: 'criticality', status: 'status',
              };
              const col = map[sorter.field] || 'machineCode';
              setSortBy(col);
              setSortDir(sorter.order === 'descend' ? 'DESC' : 'ASC');
            }
          }}
          locale={{
            emptyText: (
              <EmptyState
                title={search || activeFilterCount > 0 ? 'No machines match your filters' : 'No machines found'}
                description={search || activeFilterCount > 0 ? 'Try adjusting your search or filter criteria.' : 'Get started by adding your first machine.'}
                actionLabel="Add Machine"
                onAction={openCreate}
              />
            ),
          }}
        />
      </Card>

      <Drawer
        open={!!detail || detailLoading}
        onClose={() => { setDetail(null); setDetailLoading(false); }}
        width={Math.min(720, typeof window !== 'undefined' ? window.innerWidth - 40 : 680)}
        title={
          detail ? (
            <Space wrap>
              <span style={{ fontWeight: 600 }}>{detail.machineCode}</span>
              <StatusBadge status={detail.status} colorMap={STATUS_COLORS} />
              <StatusBadge status={detail.criticality} colorMap={CRITICALITY_COLORS} />
            </Space>
          ) : (
            'Machine Details'
          )
        }
        extra={
          detail && (
            <Space>
              <Button icon={<QrcodeOutlined />} onClick={() => showQr(detail)}>QR</Button>
              <Button type="primary" icon={<EditOutlined />} onClick={() => { const d = detail; setDetail(null); openEdit(d); }}>
                Edit
              </Button>
            </Space>
          )
        }
      >
        {detailLoading ? (
          <LoadingState tip="Loading machine details…" />
        ) : detail ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small" title="Machine Identity">
              {detailDesc([
                { label: 'Machine ID', children: <code style={{ fontWeight: 600, fontSize: 13 }}>{detail.machineId ?? '—'}</code> },
                { label: 'Machine Code', children: <Text strong>{detail.machineCode}</Text> },
                { label: 'Machine Number', children: detail.machineNumber ?? undefined },
                { label: 'Machine Name', children: detail.name },
                { label: 'Machine Type', children: detail.machineType ?? undefined },
                {
                  label: 'Status',
                  children: <StatusBadge status={detail.status} colorMap={STATUS_COLORS} />,
                },
                {
                  label: 'Criticality',
                  children: <StatusBadge status={detail.criticality} colorMap={CRITICALITY_COLORS} />,
                },
              ])}
            </Card>

            <Card size="small" title="Organization">
              {detailDesc([
                { label: 'Division', children: detail.division?.name },
                { label: 'Section', children: detail.section?.name },
                { label: 'Department', children: detail.department?.name },
              ])}
            </Card>

            <Card size="small" title="Location">
              {detailDesc([
                { label: 'Location', children: detail.location },
              ])}
            </Card>

            <Card size="small" title="Technical Information">
              {detailDesc([
                { label: 'Manufacturer', children: detail.manufacturer },
                { label: 'Model', children: detail.model },
                { label: 'Serial Number', children: detail.serialNumber },
                { label: 'Capacity', children: detail.capacity },
                { label: 'Power Rating', children: detail.powerRating },
              ])}
            </Card>

            <Card size="small" title="Dates">
              {detailDesc([
                { label: 'Installation Date', children: detail.installationDate },
                { label: 'Warranty Expiry', children: detail.warrantyExpiryDate },
              ])}
            </Card>

            {detail.description && (
              <Card size="small" title="Description">
                <Text style={{ fontSize: 13 }}>{detail.description}</Text>
              </Card>
            )}

            {detail.qrPayload && (
              <Card size="small" title="QR Information">
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>QR Payload:</Text>
                  <div><code style={{ fontSize: 11 }}>{detail.qrPayload}</code></div>
                </div>
              </Card>
            )}
          </Space>
        ) : null}
      </Drawer>

      <FormModal
        open={modalVisible}
        editing={editing}
        saving={saving}
        form={form}
        formDivisionId={formDivisionId}
        formSectionId={formSectionId}
        divisions={divisions}
        sections={sections}
        departments={departments}
        sectionsForDivision={sectionsForDivision}
        departmentsForSection={departmentsForSection}
        onCancel={() => setModalVisible(false)}
        onOk={handleSave}
      />

      <Modal
        title={`QR Code — ${qrModal.machine?.machineCode ?? ''}`}
        open={qrModal.visible}
        onCancel={() => setQrModal({ visible: false, machine: null, dataUrl: '', payload: '', url: '' })}
        footer={[
          <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={printQr}>
            Print Label
          </Button>,
        ]}
        centered
      >
        <div style={{ textAlign: 'center' }}>
          {qrModal.machine && (
            <>
              <h3 style={{ marginBottom: 4 }}>{qrModal.machine.name}</h3>
              <p style={{ color: 'var(--theme-text-muted)', marginTop: 0 }}>
                <b>{qrModal.machine.machineId}</b> · {qrModal.machine.machineCode}
                {qrModal.machine.location ? ` · ${qrModal.machine.location}` : ''}
              </p>
            </>
          )}
          {qrModal.dataUrl && <img src={qrModal.dataUrl} alt="Machine QR" style={{ width: 260, height: 260 }} />}
          <p style={{ marginTop: 8 }}>
            <code style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{qrModal.url || qrModal.payload}</code>
          </p>
        </div>
      </Modal>
    </div>
  );
};

interface FormModalProps {
  open: boolean;
  editing: Machine | null;
  saving: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  formDivisionId: string | undefined;
  formSectionId: string | undefined;
  divisions: DivisionLk[];
  sections: SectionLk[];
  departments: DepartmentLk[];
  sectionsForDivision: (divisionId?: string) => SectionLk[];
  departmentsForSection: (sectionId?: string) => DepartmentLk[];
  onCancel: () => void;
  onOk: () => void;
}

const FormModal: React.FC<FormModalProps> = ({
  open, editing, saving, form, formDivisionId, formSectionId,
  divisions, sections, departments, sectionsForDivision, departmentsForSection,
  onCancel, onOk,
}) => (
  <Modal
    title={editing ? `Edit Machine — ${editing.machineCode}` : 'New Machine'}
    open={open}
    onOk={onOk}
    confirmLoading={saving}
    onCancel={onCancel}
    width={800}
    okText={editing ? 'Save Changes' : 'Create Machine'}
  >
    <Form form={form} layout="vertical" requiredMark="optional">
      <Card size="small" title="Machine Identity" style={{ marginBottom: 16 }}>
        <Form.Item label="Machine ID" style={{ marginBottom: 8 }}>
          <Input
            value={editing?.machineId ?? ''}
            placeholder="Auto-generated on save (MCH###)"
            disabled
            style={{ maxWidth: 200, fontWeight: 600 }}
          />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 16px' }}>
          <Form.Item
            name="machineCode" label="Machine Code"
            rules={[{ required: true, max: 50, message: 'Unique code, max 50 chars' }]}
          >
            <Input placeholder="e.g. HD-04" />
          </Form.Item>
          <Form.Item name="machineNumber" label="Machine Number">
            <Input placeholder="e.g. MM-1001" maxLength={60} />
          </Form.Item>
          <Form.Item
            name="name" label="Machine Name"
            rules={[{ required: true, max: 255, message: 'Name is required' }]}
          >
            <Input placeholder="e.g. Header Machine 04" maxLength={255} />
          </Form.Item>
          <Form.Item name="machineType" label="Machine Type">
            <Input
              placeholder="e.g. Cold Forge"
              maxLength={100}
            />
          </Form.Item>
        </div>
      </Card>

      <Card size="small" title="Organization" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 16px' }}>
          <Form.Item name="divisionId" label="Division">
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Select division"
              options={divisions.map((d) => ({ value: d.id, label: d.name }))}
              onChange={() => {
                form.setFieldValue('sectionId', undefined);
                form.setFieldValue('departmentId', undefined);
              }}
            />
          </Form.Item>
          <Form.Item name="sectionId" label="Section">
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Select section"
              options={sectionsForDivision(formDivisionId).map((s) => ({ value: s.id, label: s.name }))}
              onChange={() => form.setFieldValue('departmentId', undefined)}
            />
          </Form.Item>
          <Form.Item name="departmentId" label="Department">
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Select department"
              options={(formSectionId ? departmentsForSection(formSectionId) : formDivisionId
                ? departments.filter((d) => d.divisionId === formDivisionId)
                : departments).map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
        </div>
      </Card>

      <Card size="small" title="Location & Classification" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 16px' }}>
          <Form.Item name="location" label="Location">
            <Input placeholder="e.g. Hall A / Bay 3" maxLength={255} />
          </Form.Item>
          <Form.Item name="criticality" label="Criticality" initialValue="MEDIUM">
            <Select options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((c) => ({ value: c, label: c.charAt(0) + c.slice(1).toLowerCase() }))} />
          </Form.Item>
        </div>
      </Card>

      <Card size="small" title="Technical Information" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 16px' }}>
          <Form.Item name="manufacturer" label="Manufacturer">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="model" label="Model">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="serialNumber" label="Serial Number">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item
            name="capacity" label="Capacity"
            tooltip="Numeric capacity (up to 4 decimals); unit goes in Power Rating / Description"
          >
            <InputNumber placeholder="e.g. 120" min={0} step={0.0001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="powerRating" label="Power Rating">
            <Input placeholder="e.g. 15 kW" maxLength={60} />
          </Form.Item>
        </div>
      </Card>

      <Card size="small" title="Dates" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 16px' }}>
          <Form.Item name="installationDate" label="Installation Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="warrantyExpiryDate" label="Warranty Expiry"
            dependencies={['installationDate']}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const inst = getFieldValue('installationDate');
                  if (!value || !inst || !value.isBefore(inst)) return Promise.resolve();
                  return Promise.reject(new Error('Warranty expiry must be after installation date'));
                },
              }),
            ]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </div>
      </Card>

      <Card size="small" title="Additional">
        <Form.Item name="description" label="Description" style={{ marginBottom: 0 }}>
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>
      </Card>
    </Form>
  </Modal>
);

export default MachineManagement;
