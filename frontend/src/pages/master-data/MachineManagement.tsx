import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker, message,
  Popconfirm, Card, Drawer, Descriptions, AutoComplete, Dropdown, InputNumber,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, ReloadOutlined, QrcodeOutlined,
  EyeOutlined, MoreOutlined, PrinterOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';

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

const MACHINE_TYPE_SUGGESTIONS = [
  'Cold Forge', 'Thread Rolling', 'Heat Treatment', 'Plating Line',
  'Packing Station', 'Inspection Station', 'Straightener', 'Coating Line',
];

const MachineManagement: React.FC<{ initialMachineId?: string }> = ({ initialMachineId }) => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(false);
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

  const [divisions, setDivisions] = useState<DivisionLk[]>([]);
  const [sections, setSections] = useState<SectionLk[]>([]);
  const [departments, setDepartments] = useState<DepartmentLk[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [detail, setDetail] = useState<Machine | null>(null);
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
          // /machines/qr/:key resolves UUID, machine code AND system Machine ID (MCH###)
          const m = await apiService.get<Machine>(`/machines/qr/${initialMachineId}`);
          setDetail(m);
        } catch {
          message.warning('Machine not found for the scanned QR link');
        }
      })();
    }
  }, [initialMachineId]);

  const fetchMachines = useCallback(async (pageNum: number = page) => {
    setLoading(true);
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
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to fetch machines');
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
  }, []);

  const sectionsForDivision = useMemo(
    () => (divisionId?: string) => (divisionId ? sections.filter((s) => s.divisionId === divisionId) : sections),
    [sections],
  );
  const departmentsForSection = useMemo(
    () => (sectionId?: string) => (sectionId ? departments.filter((d) => d.sectionId === sectionId) : departments),
    [departments],
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
      // Machine ID is system-generated (MCH###): never client-editable
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
      title: 'Machine ID',
      dataIndex: 'machineId',
      sorter: true,
      width: 110,
      render: (mid: string | null | undefined) => (
        <code style={{ fontWeight: 600 }}>{mid ?? '—'}</code>
      ),
    },
    {
      title: 'Code',
      dataIndex: 'machineCode',
      sorter: true,
      width: 120,
      render: (code: string) => <b>{code}</b>,
    },
    {
      title: 'Machine No.',
      dataIndex: 'machineNumber',
      width: 110,
      ellipsis: true,
      render: (n: string | null | undefined) => n ?? <span style={{ color: 'var(--theme-text-muted)' }}>—</span>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      sorter: true,
      width: 200,
      render: (_: any, m: Machine) => (
        <div>
          <div>{m.name}</div>
          {m.machineType && <span style={{ color: 'var(--theme-text-muted)', fontSize: 12 }}>{m.machineType}</span>}
        </div>
      ),
    },
    {
      title: 'Division',
      width: 130,
      ellipsis: true,
      render: (_: any, m: Machine) => m.division?.name ?? <span style={{ color: 'var(--theme-text-muted)' }}>—</span>,
    },
    {
      title: 'Section',
      width: 130,
      ellipsis: true,
      render: (_: any, m: Machine) => m.section?.name ?? <span style={{ color: 'var(--theme-text-muted)' }}>—</span>,
    },
    {
      title: 'Department',
      width: 150,
      ellipsis: true,
      render: (_: any, m: Machine) => m.department?.name ?? <span style={{ color: 'var(--theme-text-muted)' }}>—</span>,
    },
    { title: 'Location', dataIndex: 'location', width: 140 },
    {
      title: 'Make / Model',
      width: 160,
      render: (_: any, m: Machine) => (
        <div style={{ fontSize: 12 }}>
          <div>{m.manufacturer ?? '—'}</div>
          <span style={{ color: 'var(--theme-text-muted)' }}>{m.model ?? ''}</span>
        </div>
      ),
    },
    {
      title: 'Criticality',
      dataIndex: 'criticality',
      sorter: true,
      width: 110,
      render: (c: string) => <Tag color={CRITICALITY_COLORS[c]}>{c}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      sorter: true,
      width: 110,
      render: (s: string) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 190,
      render: (_: any, m: Machine) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(m)} />
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(m)} />
          <Button type="link" size="small" icon={<QrcodeOutlined />} onClick={() => showQr(m)} />
          <Dropdown
            menu={{
              items: [
                ...(m.status !== 'ACTIVE'
                  ? [{ key: 'ACTIVE', label: 'Set Active' }]
                  : []),
                ...(m.status !== 'MAINTENANCE'
                  ? [{ key: 'MAINTENANCE', label: 'Set Maintenance' }]
                  : []),
                ...(m.status !== 'INACTIVE'
                  ? [{ key: 'INACTIVE', label: 'Deactivate' }]
                  : []),
                ...(m.status !== 'RETIRED'
                  ? [{ key: 'RETIRED', label: 'Retire' }]
                  : []),
              ],
              onClick: ({ key }) => handleStatus(m, key),
            }}
          >
            <Button type="link" size="small" icon={<MoreOutlined />} />
          </Dropdown>
          <Popconfirm
            title={`Delete machine '${m.machineCode}'?`}
            description="The record is soft-deleted and hidden from lists."
            onConfirm={() => handleDelete(m)}
          >
            <Button type="link" size="small" danger>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap size={8}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search Machine ID, code, name, serial…"
            style={{ width: 260 }}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Machine ID (e.g. MCH001)"
            style={{ width: 190 }}
            value={fMachineId}
            onChange={(e) => { setFMachineId(e.target.value); setPage(1); }}
          />
          <Select
            allowClear placeholder="Division" style={{ width: 180 }} value={fDivision}
            options={divisions.map((d) => ({ value: d.id, label: d.name }))}
            onChange={(v) => { setFDivision(v); setFSection(undefined); setFDepartment(undefined); setPage(1); }}
          />
          <Select
            allowClear placeholder="Section" style={{ width: 180 }} value={fSection}
            options={sectionsForDivision(fDivision).map((s) => ({ value: s.id, label: s.name }))}
            onChange={(v) => { setFSection(v); setFDepartment(undefined); setPage(1); }}
            disabled={!!fDivision && sectionsForDivision(fDivision).length === 0}
          />
          <Select
            allowClear placeholder="Department" style={{ width: 200 }} value={fDepartment}
            options={(fSection ? departmentsForSection(fSection) : fDivision
              ? departments.filter((d) => d.divisionId === fDivision)
              : departments).map((d) => ({ value: d.id, label: d.name }))}
            onChange={(v) => { setFDepartment(v); setPage(1); }}
          />
          <Select
            allowClear placeholder="Status" style={{ width: 140 }} value={fStatus}
            options={['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED'].map((s) => ({ value: s, label: s }))}
            onChange={(v) => { setFStatus(v); setPage(1); }}
          />
          <Select
            allowClear placeholder="Criticality" style={{ width: 140 }} value={fCriticality}
            options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((c) => ({ value: c, label: c }))}
            onChange={(v) => { setFCriticality(v); setPage(1); }}
          />
          <Button icon={<ReloadOutlined />} onClick={resetFilters}>Reset</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New Machine
          </Button>
        </Space>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={machines}
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `${t} machines`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
        onChange={(_pg, _flt, sorter: any) => {
          if (sorter && sorter.field) {
            const map: Record<string, string> = {
              machineId: 'machineId', machineCode: 'machineCode', name: 'name', criticality: 'criticality', status: 'status',
            };
            const col = map[sorter.field] || 'machineCode';
            setSortBy(col);
            setSortDir(sorter.order === 'descend' ? 'DESC' : 'ASC');
          }
        }}
      />

      <Modal
        title={editing ? `Edit Machine — ${editing.machineCode}` : 'New Machine'}
        open={modalVisible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalVisible(false)}
        width={720}
        okText={editing ? 'Save Changes' : 'Create Machine'}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Machine ID" style={{ marginBottom: 8 }}>
            <Input
              value={editing?.machineId ?? ''}
              placeholder="Auto-generated on save (MCH###)"
              disabled
              style={{ maxWidth: 200, fontWeight: 600 }}
            />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item
              name="machineCode" label="Machine Code"
              rules={[{ required: true, max: 50, message: 'Unique code, max 50 chars' }]}
              style={{ flex: 1, minWidth: 200 }}
            >
              <Input placeholder="e.g. HD-04" disabled={false} />
            </Form.Item>
            <Form.Item name="machineNumber" label="Machine Number" style={{ flex: 1, minWidth: 200 }}>
              <Input placeholder="e.g. MM-1001" maxLength={60} />
            </Form.Item>
          </Space>
          <Form.Item
            name="name" label="Machine Name"
            rules={[{ required: true, max: 255, message: 'Name is required' }]}
          >
            <Input placeholder="e.g. Header Machine 04" maxLength={255} />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="divisionId" label="Division" style={{ flex: 1, minWidth: 200 }}>
              <Select
                allowClear placeholder="(optional)"
                options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                onChange={() => {
                  form.setFieldValue('sectionId', undefined);
                  form.setFieldValue('departmentId', undefined);
                }}
              />
            </Form.Item>
            <Form.Item name="sectionId" label="Section" style={{ flex: 1, minWidth: 200 }}>
              <Select
                allowClear placeholder="(optional)"
                options={sectionsForDivision(formDivisionId).map((s) => ({ value: s.id, label: s.name }))}
                onChange={() => form.setFieldValue('departmentId', undefined)}
              />
            </Form.Item>
            <Form.Item name="departmentId" label="Department" style={{ flex: 1, minWidth: 200 }}>
              <Select
                allowClear placeholder="(optional)"
                options={(formSectionId ? departmentsForSection(formSectionId) : formDivisionId
                  ? departments.filter((d) => d.divisionId === formDivisionId)
                  : departments).map((d) => ({ value: d.id, label: d.name }))}
              />
            </Form.Item>
          </Space>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="machineType" label="Machine Type" style={{ flex: 1, minWidth: 200 }}>
              <AutoComplete
                options={MACHINE_TYPE_SUGGESTIONS.map((t) => ({ value: t }))}
                placeholder="e.g. Cold Forge"
                filterOption
              />
            </Form.Item>
            <Form.Item name="location" label="Location" style={{ flex: 1, minWidth: 200 }}>
              <Input placeholder="e.g. Hall A / Bay 3" maxLength={255} />
            </Form.Item>
            <Form.Item name="criticality" label="Criticality" initialValue="MEDIUM" style={{ flex: 1, minWidth: 160 }}>
              <Select options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((c) => ({ value: c, label: c }))} />
            </Form.Item>
          </Space>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="manufacturer" label="Manufacturer" style={{ flex: 1, minWidth: 200 }}>
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="model" label="Model" style={{ flex: 1, minWidth: 160 }}>
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="serialNumber" label="Serial Number" style={{ flex: 1, minWidth: 200 }}>
              <Input maxLength={120} />
            </Form.Item>
          </Space>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item
              name="capacity" label="Capacity"
              tooltip="Numeric capacity (up to 4 decimals); unit goes in Power Rating / Description"
              style={{ flex: 1, minWidth: 180 }}
            >
              <InputNumber
                placeholder="e.g. 120"
                min={0}
                step={0.0001}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item name="powerRating" label="Power Rating" style={{ flex: 1, minWidth: 140 }}>
              <Input placeholder="e.g. 15 kW" maxLength={60} />
            </Form.Item>
            <Form.Item name="installationDate" label="Installation Date" style={{ flex: 1, minWidth: 170 }}>
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
              style={{ flex: 1, minWidth: 170 }}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={detail ? `${detail.machineCode} — ${detail.name}` : ''}
        placement="right"
        width={520}
        open={!!detail}
        onClose={() => setDetail(null)}
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
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Machine ID">
              <code style={{ fontWeight: 600 }}>{detail.machineId ?? '—'}</code>
            </Descriptions.Item>
            <Descriptions.Item label="Machine Code">{detail.machineCode}</Descriptions.Item>
            <Descriptions.Item label="Machine Number">{detail.machineNumber ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Name">{detail.name}</Descriptions.Item>
            <Descriptions.Item label="Type">{detail.machineType ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Division">{detail.division?.name ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Section">{detail.section?.name ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Department">{detail.department?.name ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Location">{detail.location ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Manufacturer">{detail.manufacturer ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Model">{detail.model ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Serial Number">{detail.serialNumber ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Capacity">{detail.capacity ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Power Rating">{detail.powerRating ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Installation Date">{detail.installationDate ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Warranty Expiry">{detail.warrantyExpiryDate ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Criticality">
              <Tag color={CRITICALITY_COLORS[detail.criticality]}>{detail.criticality}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={STATUS_COLORS[detail.status]}>{detail.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Description">{detail.description ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="QR Payload">
              <code style={{ fontSize: 11 }}>{detail.qrPayload ?? '—'}</code>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

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

export default MachineManagement;
