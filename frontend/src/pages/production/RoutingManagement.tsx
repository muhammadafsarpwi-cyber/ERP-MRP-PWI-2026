import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  InputNumber, Row, Col, Popconfirm, Tooltip, Typography, Descriptions, Layout,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal, toNum } from '../../utils/numberFormat';

const { Content } = Layout;
const { Title } = Typography;

interface RoutingOperation {
  id: string;
  sequenceNo: number;
  operationCode: string;
  operationName: string;
  description?: string;
  divisionId?: string;
  division?: { name: string; divisionCode: string };
  sectionId?: string;
  section?: { name: string; sectionCode: string };
  departmentId?: string;
  department?: { name: string; departmentCode: string };
  setupTimeMinutes: number;
  runTimeMinutes: number;
  queueTimeMinutes: number;
  waitTimeMinutes: number;
  laborRequired: boolean;
  machineRequired: boolean;
  inputItemId?: string;
  inputItem?: { name: string; itemCode: string };
  outputItemId?: string;
  outputItem?: { name: string; itemCode: string };
  inputQuantity: number;
  outputQuantity: number;
  uomId?: string;
  uom?: { code: string };
  scrapPercentage: number;
  setupScrapPercentage: number;
  status: string;
  remarks?: string;
}

interface Routing {
  id: string;
  routingCode: string;
  name: string;
  description?: string;
  productId: string;
  product?: { name: string; itemCode: string };
  bomId: string;
  bom?: { bomCode: string; name: string };
  status: string;
  baseQuantity: number;
  estimatedTotalTime: number;
  isDefault: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  operations: RoutingOperation[];
  createdAt: string;
  updatedAt: string;
}

interface LookupItem { id: string; name: string; }
interface Item extends LookupItem { itemCode: string; itemType: string; }
interface Bom extends LookupItem { bomCode: string; }
interface Division extends LookupItem { divisionCode: string; }
interface Section extends LookupItem { sectionCode: string; divisionId: string; }
interface Department extends LookupItem { departmentCode: string; divisionId: string; sectionId?: string; }
interface Uom extends LookupItem { code: string; }

const STATUS_COLORS: Record<string, string> = { DRAFT: 'default', ACTIVE: 'green', OBSOLETE: 'red' };

const RoutingManagement: React.FC = () => {
  const [routings, setRoutings] = useState<Routing[]>([]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [opModalVisible, setOpModalVisible] = useState(false);
  const [editingRouting, setEditingRouting] = useState<Routing | null>(null);
  const [selectedRouting, setSelectedRouting] = useState<Routing | null>(null);
  const [editingOp, setEditingOp] = useState<RoutingOperation | null>(null);
  const [form] = Form.useForm();
  const [opForm] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

  const opFilteredSections = Form.useWatch('divisionId', opForm);

  const fetchRoutings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get<{ data: Routing[]; total: number }>('/production/routings');
      setRoutings(res.data);
    } catch { message.error('Failed to fetch routings'); }
    finally { setLoading(false); }
  }, []);

  const fetchLookupData = useCallback(async () => {
    try {
      const [itemsRes, bomRes, divRes, secRes, deptRes, uomRes] = await Promise.all([
        apiService.get<{ data: Item[] }>('/items', { limit: 200 }),
        apiService.get<{ data: Bom[] }>('/bom'),
        apiService.get<{ data: Division[] }>('/admin/divisions', { limit: 200 }),
        apiService.get<{ data: Section[] }>('/admin/sections', { limit: 200 }),
        apiService.get<{ data: Department[] }>('/admin/departments', { limit: 200 }),
        apiService.get<{ data: Uom[] }>('/uoms', { limit: 200 }),
      ]);
      setItems(itemsRes.data || []);
      setBoms(bomRes.data || []);
      setDivisions(divRes.data || []);
      setSections(secRes.data || []);
      setDepartments(deptRes.data || []);
      setUoms(uomRes.data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchRoutings(); fetchLookupData(); }, [fetchRoutings, fetchLookupData]);

  const opFilteredSectionsList = sections.filter(s => !opFilteredSections || s.divisionId === opFilteredSections);
  const opFilteredDepartmentsList = departments.filter(d =>
    (!opFilteredSections || d.sectionId) && (!opFilteredSections || opFilteredSectionsList.some(s => s.id === d.sectionId))
  );

  const filteredRoutings = routings.filter(r => {
    const matchSearch = !search || r.routingCode.toLowerCase().includes(search.toLowerCase()) || r.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleCreate = () => {
    setEditingRouting(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (routing: Routing) => {
    setEditingRouting(routing);
    form.setFieldsValue({
      name: routing.name,
      description: routing.description,
      productId: routing.productId,
      bomId: routing.bomId,
      baseQuantity: routing.baseQuantity,
      isDefault: routing.isDefault,
      effectiveFrom: routing.effectiveFrom,
      effectiveTo: routing.effectiveTo,
    });
    setModalVisible(true);
  };

  const handleViewDetail = (routing: Routing) => {
    setSelectedRouting(routing);
    setDetailVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingRouting) {
        await apiService.put(`/production/routings/${editingRouting.id}`, values);
        message.success('Routing updated successfully');
      } else {
        await apiService.post('/production/routings', values);
        message.success('Routing created successfully');
      }
      setModalVisible(false);
      fetchRoutings();
    } catch (err: any) {
      if (err?.response?.data?.message) message.error(err.response.data.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/production/routings/${id}`);
      message.success('Routing deleted');
      fetchRoutings();
      if (selectedRouting?.id === id) setDetailVisible(false);
    } catch { message.error('Failed to delete routing'); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiService.put(`/production/routings/${id}/status`, { status });
      message.success(`Routing status changed to ${status}`);
      fetchRoutings();
      if (selectedRouting?.id === id) {
        const res = await apiService.get<{ data: Routing }>(`/production/routings/${id}`);
        setSelectedRouting(res.data);
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to change status');
    }
  };

  const handleAddOp = () => {
    setEditingOp(null);
    opForm.resetFields();
    opForm.setFieldsValue({ sequenceNo: (selectedRouting?.operations?.length || 0) * 10 + 10, laborRequired: true, machineRequired: false, status: 'ACTIVE' });
    setOpModalVisible(true);
  };

  const handleEditOp = (op: RoutingOperation) => {
    setEditingOp(op);
    opForm.setFieldsValue({
      sequenceNo: op.sequenceNo,
      operationCode: op.operationCode,
      operationName: op.operationName,
      description: op.description,
      divisionId: op.divisionId,
      sectionId: op.sectionId,
      departmentId: op.departmentId,
      setupTimeMinutes: op.setupTimeMinutes,
      runTimeMinutes: op.runTimeMinutes,
      queueTimeMinutes: op.queueTimeMinutes,
      waitTimeMinutes: op.waitTimeMinutes,
      laborRequired: op.laborRequired,
      machineRequired: op.machineRequired,
      inputItemId: op.inputItemId,
      outputItemId: op.outputItemId,
      inputQuantity: op.inputQuantity,
      outputQuantity: op.outputQuantity,
      uomId: op.uomId,
      scrapPercentage: op.scrapPercentage,
      setupScrapPercentage: op.setupScrapPercentage,
      status: op.status,
      remarks: op.remarks,
    });
    setOpModalVisible(true);
  };

  const handleSaveOp = async () => {
    try {
      const values = await opForm.validateFields();
      if (editingOp) {
        await apiService.put(`/production/routings/operations/${editingOp.id}`, values);
        message.success('Operation updated');
      } else {
        await apiService.post(`/production/routings/${selectedRouting!.id}/operations`, values);
        message.success('Operation added');
      }
      setOpModalVisible(false);
      const res = await apiService.get<{ data: Routing }>(`/production/routings/${selectedRouting!.id}`);
      setSelectedRouting(res.data);
      fetchRoutings();
    } catch (err: any) {
      if (err?.response?.data?.message) message.error(err.response.data.message);
    }
  };

  const handleDeleteOp = async (opId: string) => {
    try {
      await apiService.delete(`/production/routings/operations/${opId}`);
      message.success('Operation removed');
      const res = await apiService.get<{ data: Routing }>(`/production/routings/${selectedRouting!.id}`);
      setSelectedRouting(res.data);
      fetchRoutings();
    } catch { message.error('Failed to remove operation'); }
  };


  const columns: ColumnsType<Routing> = [
    { title: 'Code', dataIndex: 'routingCode', key: 'routingCode', width: 120 },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 220 },
    { title: 'Product', key: 'product', width: 180, render: (_, r) => r.product ? `${r.product.itemCode} - ${r.product.name}` : '-' },
    { title: 'BOM', key: 'bom', width: 160, render: (_, r) => r.bom ? `${r.bom.bomCode}` : '-' },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110, render: (s: string) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
    { title: 'Ops', key: 'ops', width: 60, align: 'center', render: (_, r) => r.operations?.length || 0 },
    { title: 'Time (min)', dataIndex: 'estimatedTotalTime', key: 'time', width: 100, render: (v: number) => formatDecimal(toNum(v)) },
    { title: 'Default', dataIndex: 'isDefault', key: 'isDefault', width: 80, align: 'center', render: (v: boolean) => v ? <Tag color="blue">Yes</Tag> : 'No' },
    {
      title: 'Actions', key: 'actions', width: 160, render: (_, r) => (
        <Space size="small">
          <Tooltip title="View"><Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(r)} /></Tooltip>
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} disabled={r.status !== 'DRAFT'} onClick={() => handleEdit(r)} /></Tooltip>
          {r.status === 'DRAFT' && <Popconfirm title="Delete this routing?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>}
        </Space>
      ),
    },
  ];

  const opColumns: ColumnsType<RoutingOperation> = [
    { title: '#', dataIndex: 'sequenceNo', key: 'sequenceNo', width: 50 },
    { title: 'Code', dataIndex: 'operationCode', key: 'operationCode', width: 100 },
    { title: 'Operation', dataIndex: 'operationName', key: 'operationName', width: 160 },
    { title: 'Division', key: 'division', width: 120, render: (_, r) => r.division?.name || '-' },
    { title: 'Section', key: 'section', width: 120, render: (_, r) => r.section?.name || '-' },
    { title: 'Department', key: 'department', width: 140, render: (_, r) => r.department?.name || '-' },
    { title: 'Setup', key: 'setup', width: 70, render: (_, r) => formatDecimal(toNum(r.setupTimeMinutes)) },
    { title: 'Run', key: 'run', width: 70, render: (_, r) => formatDecimal(toNum(r.runTimeMinutes)) },
    { title: 'Total', key: 'total', width: 70, render: (_, r) => formatDecimal(toNum(r.setupTimeMinutes) + toNum(r.runTimeMinutes) + toNum(r.queueTimeMinutes) + toNum(r.waitTimeMinutes)) },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 90, render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 100, render: (_, r) => (
        <Space size="small">
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} disabled={selectedRouting?.status !== 'DRAFT'} onClick={() => handleEditOp(r)} /></Tooltip>
          {selectedRouting?.status === 'DRAFT' && <Popconfirm title="Remove operation?" onConfirm={() => handleDeleteOp(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>}
        </Space>
      ),
    },
  ];

  if (detailVisible && selectedRouting) {
    return (
      <Content style={{ padding: '24px' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => { setDetailVisible(false); setSelectedRouting(null); }}>Back to List</Button>
            <Title level={4} style={{ margin: 0 }}>{selectedRouting.routingCode} - {selectedRouting.name}</Title>
            <Tag color={STATUS_COLORS[selectedRouting.status]}>{selectedRouting.status}</Tag>
          </Space>
          <Descriptions bordered size="small" column={4}>
            <Descriptions.Item label="Routing Code">{selectedRouting.routingCode}</Descriptions.Item>
            <Descriptions.Item label="Name">{selectedRouting.name}</Descriptions.Item>
            <Descriptions.Item label="Product">{selectedRouting.product ? `${selectedRouting.product.itemCode} - ${selectedRouting.product.name}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="BOM">{selectedRouting.bom?.bomCode || '-'}</Descriptions.Item>
            <Descriptions.Item label="Base Qty">{formatDecimal(toNum(selectedRouting.baseQuantity))}</Descriptions.Item>
            <Descriptions.Item label="Total Time">{formatDecimal(toNum(selectedRouting.estimatedTotalTime))} min</Descriptions.Item>
            <Descriptions.Item label="Default">{selectedRouting.isDefault ? 'Yes' : 'No'}</Descriptions.Item>
            <Descriptions.Item label="Description">{selectedRouting.description || '-'}</Descriptions.Item>
          </Descriptions>
          <Card title="Routing Operations" extra={
            selectedRouting.status === 'DRAFT' ? <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddOp}>Add Operation</Button> : null
          }>
            <Table dataSource={selectedRouting.operations || []} columns={opColumns} rowKey="id" size="small" pagination={false} />
          </Card>
          <Space>
            {selectedRouting.status === 'DRAFT' && (
              <Popconfirm title="Activate this routing?" onConfirm={() => handleStatusChange(selectedRouting.id, 'ACTIVE')}>
                <Button type="primary" disabled={(selectedRouting.operations?.length || 0) === 0}>Activate</Button>
              </Popconfirm>
            )}
            {selectedRouting.status === 'ACTIVE' && (
              <Popconfirm title="Mark as Obsolete?" onConfirm={() => handleStatusChange(selectedRouting.id, 'OBSOLETE')}>
                <Button danger>Mark Obsolete</Button>
              </Popconfirm>
            )}
          </Space>
        </Space>

        <Modal title={editingOp ? 'Edit Operation' : 'Add Operation'} open={opModalVisible} onOk={handleSaveOp} onCancel={() => setOpModalVisible(false)} width={800} destroyOnClose>
          <Form form={opForm} layout="vertical">
            <Row gutter={16}>
              <Col span={6}><Form.Item name="sequenceNo" label="Sequence" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={9}><Form.Item name="operationCode" label="Code" rules={[{ required: true }]}><Input maxLength={50} /></Form.Item></Col>
              <Col span={9}><Form.Item name="operationName" label="Name" rules={[{ required: true }]}><Input maxLength={255} /></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}><Form.Item name="divisionId" label="Division"><Select allowClear placeholder="Select division" onChange={() => { opForm.setFieldsValue({ sectionId: undefined, departmentId: undefined }); }}>
                {divisions.map(d => <Select.Option key={d.id} value={d.id}>{d.divisionCode} - {d.name}</Select.Option>)}
              </Select></Form.Item></Col>
              <Col span={8}><Form.Item name="sectionId" label="Section"><Select allowClear placeholder="Select section" onChange={() => opForm.setFieldsValue({ departmentId: undefined })}>
                {opFilteredSectionsList.map(s => <Select.Option key={s.id} value={s.id}>{s.sectionCode} - {s.name}</Select.Option>)}
              </Select></Form.Item></Col>
              <Col span={8}><Form.Item name="departmentId" label="Department"><Select allowClear placeholder="Select department">
                {opFilteredDepartmentsList.map(d => <Select.Option key={d.id} value={d.id}>{d.departmentCode} - {d.name}</Select.Option>)}
              </Select></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col span={6}><Form.Item name="setupTimeMinutes" label="Setup (min)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={6}><Form.Item name="runTimeMinutes" label="Run (min)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={6}><Form.Item name="queueTimeMinutes" label="Queue (min)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={6}><Form.Item name="waitTimeMinutes" label="Wait (min)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col span={6}><Form.Item name="inputItemId" label="Input Item"><Select allowClear showSearch optionFilterProp="children">
                {items.map(i => <Select.Option key={i.id} value={i.id}>{i.itemCode} - {i.name}</Select.Option>)}
              </Select></Form.Item></Col>
              <Col span={6}><Form.Item name="outputItemId" label="Output Item"><Select allowClear showSearch optionFilterProp="children">
                {items.map(i => <Select.Option key={i.id} value={i.id}>{i.itemCode} - {i.name}</Select.Option>)}
              </Select></Form.Item></Col>
              <Col span={6}><Form.Item name="inputQuantity" label="Input Qty"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={6}><Form.Item name="outputQuantity" label="Output Qty"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col span={6}><Form.Item name="uomId" label="UOM"><Select allowClear>
                {uoms.map(u => <Select.Option key={u.id} value={u.id}>{u.code} - {u.name}</Select.Option>)}
              </Select></Form.Item></Col>
              <Col span={6}><Form.Item name="scrapPercentage" label="Scrap %"><InputNumber min={0} max={100} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={6}><Form.Item name="laborRequired" label="Labor" valuePropName="checked"><Input type="checkbox" /></Form.Item></Col>
              <Col span={6}><Form.Item name="machineRequired" label="Machine" valuePropName="checked"><Input type="checkbox" /></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}><Form.Item name="remarks" label="Remarks"><Input.TextArea rows={2} /></Form.Item></Col>
            </Row>
          </Form>
        </Modal>
      </Content>
    );
  }

  return (
    <Content style={{ padding: '24px' }}>
      <Card title="Production Routings" extra={
        <Space>
          <Input.Search placeholder="Search routings..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 250 }} />
          <Select placeholder="Status" allowClear value={filterStatus} onChange={setFilterStatus} style={{ width: 130 }}>
            <Select.Option value="DRAFT">Draft</Select.Option>
            <Select.Option value="ACTIVE">Active</Select.Option>
            <Select.Option value="OBSOLETE">Obsolete</Select.Option>
          </Select>
          <Button icon={<ReloadOutlined />} onClick={fetchRoutings}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>New Routing</Button>
        </Space>
      }>
        <Table dataSource={filteredRoutings} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t} routings` }} />
      </Card>

      <Modal title={editingRouting ? 'Edit Routing' : 'New Routing'} open={modalVisible} onOk={handleSave} onCancel={() => setModalVisible(false)} width={700} destroyOnClose>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}><Form.Item name="name" label="Routing Name" rules={[{ required: true }]}><Input maxLength={255} /></Form.Item></Col>
            <Col span={12}><Form.Item name="productId" label="Product" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="children" placeholder="Select product">
                {items.map(i => <Select.Option key={i.id} value={i.id}>{i.itemCode} - {i.name}</Select.Option>)}
              </Select>
            </Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="bomId" label="BOM" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="children" placeholder="Select BOM">
                {boms.map(b => <Select.Option key={b.id} value={b.id}>{b.bomCode} - {b.name}</Select.Option>)}
              </Select>
            </Form.Item></Col>
            <Col span={6}><Form.Item name="baseQuantity" label="Base Quantity" initialValue={1}><InputNumber min={0.0001} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="isDefault" label="Default" valuePropName="checked"><Input type="checkbox" /></Form.Item></Col>
          </Row>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </Content>
  );
};

export default RoutingManagement;
