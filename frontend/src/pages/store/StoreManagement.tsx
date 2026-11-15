import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, Tag, App, Row, Col, Checkbox } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ShopOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';
import './storeResponsive.css';

interface Store {
  id: string;
  storeCode: string;
  storeName: string;
  storeType: string;
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  warehouseId?: string;
  address?: string;
  contactPerson?: string;
  contactNumber?: string;
  description?: string;
  isDefault: boolean;
  status: string;
  createdAt: string;
}

export const STORE_TYPE_OPTIONS = [
  { value: 'GENERAL', label: 'General' },
  { value: 'RAW_MATERIAL', label: 'Raw Material' },
  { value: 'SPARE_PARTS', label: 'Spare Parts' },
  { value: 'CONSUMABLES', label: 'Consumables' },
  { value: 'WORK_IN_PROGRESS', label: 'Work In Progress' },
  { value: 'QUARANTINE', label: 'Quarantine' },
];

const extractList = (res: any): any[] => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data?.items)) return res.data.items;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.items)) return res.items;
  return [];
};

const StoreManagement: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const canCreate = can('store.create');
  const canUpdate = can('store.update');
  const canDelete = can('store.delete');

  const [data, setData] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Store | null>(null);
  const [form] = Form.useForm();

  const [divisions, setDivisions] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const [filterDivisionId, setFilterDivisionId] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

  const watchedDivisionId = Form.useWatch('divisionId', form);
  const watchedSectionId = Form.useWatch('sectionId', form);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.get<any>('/store/stores');
      setData(extractList(response));
    } catch (error: any) {
      const apiMsg = error?.response?.data?.message || error?.message || 'Failed to load stores';
      message.error(Array.isArray(apiMsg) ? apiMsg.join(', ') : apiMsg);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchData();
    (async () => {
      try {
        const [divRes, secRes, deptRes, whRes] = await Promise.all([
          apiService.get<any>('/divisions', { status: 'ACTIVE', limit: 100 }),
          apiService.get<any>('/sections', { status: 'ACTIVE', limit: 200 }),
          apiService.get<any>('/departments', { status: 'ACTIVE', limit: 300 }),
          apiService.get<any>('/warehouses', { limit: 200 }).catch(() => apiService.get<any>('/organization/warehouses', { limit: 200 })),
        ]);
        setDivisions(extractList(divRes));
        setSections(extractList(secRes));
        setDepartments(extractList(deptRes));
        setWarehouses(extractList(whRes));
      } catch {
        // non-blocking metadata load
      }
    })();
  }, [fetchData]);

  const filteredSections = useMemo(() => {
    if (!watchedDivisionId) return sections;
    return sections.filter((s) => s.divisionId === watchedDivisionId);
  }, [sections, watchedDivisionId]);

  const filteredDepartments = useMemo(() => {
    return departments.filter((d) => {
      if (watchedDivisionId && d.divisionId && d.divisionId !== watchedDivisionId) return false;
      if (watchedSectionId && d.sectionId && d.sectionId !== watchedSectionId) return false;
      return true;
    });
  }, [departments, watchedDivisionId, watchedSectionId]);

  const filteredWarehouses = useMemo(() => {
    if (!watchedDivisionId) return warehouses;
    return warehouses.filter((w) => !w.divisionId || w.divisionId === watchedDivisionId);
  }, [warehouses, watchedDivisionId]);

  const displayedData = useMemo(() => {
    return data.filter((s) => {
      if (filterDivisionId && s.divisionId !== filterDivisionId) return false;
      if (filterStatus && s.status !== filterStatus) return false;
      return true;
    });
  }, [data, filterDivisionId, filterStatus]);

  const divisionNameMap = useMemo(() => new Map(divisions.map((d) => [d.id, d.name])), [divisions]);
  const warehouseNameMap = useMemo(
    () => new Map(warehouses.map((w) => [w.id, `${w.warehouseCode || ''} ${w.name}`.trim()])),
    [warehouses],
  );

  const handleCreate = () => {
    setEditingRecord(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Store) => {
    setEditingRecord(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: 'Confirm Delete',
      content: 'Are you sure you want to deactivate this store?',
      onOk: async () => {
        try {
          await apiService.delete(`/store/stores/${id}`);
          message.success('Store deactivated');
          fetchData();
        } catch (error: any) {
          const apiMsg = error?.response?.data?.message || error?.message || 'Failed to delete store';
          message.error(Array.isArray(apiMsg) ? apiMsg.join(', ') : apiMsg);
        }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingRecord) {
        await apiService.put(`/store/stores/${editingRecord.id}`, values);
        message.success('Store updated successfully');
      } else {
        await apiService.post('/store/stores', values);
        message.success('Store created successfully');
      }
      setModalVisible(false);
      fetchData();
    } catch (error: any) {
      if (error?.errorFields) return;
      const apiMsg = error?.response?.data?.message || error?.message || 'Operation failed';
      message.error(Array.isArray(apiMsg) ? apiMsg.join(', ') : apiMsg);
    }
  };

  const columns: ColumnsType<Store> = [
    {
      title: 'Store Code',
      dataIndex: 'storeCode',
      key: 'storeCode',
      width: 140,
      render: (v: string) => <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{v}</span>,
    },
    { title: 'Store Name', dataIndex: 'storeName', key: 'storeName', width: 220 },
    {
      title: 'Type',
      dataIndex: 'storeType',
      key: 'storeType',
      width: 140,
      render: (type: string) => <Tag color={type === 'RAW_MATERIAL' ? 'blue' : type === 'QUARANTINE' ? 'red' : 'default'}>{type || 'GENERAL'}</Tag>,
    },
    {
      title: 'Division',
      dataIndex: 'divisionId',
      key: 'divisionId',
      width: 170,
      render: (id: string) => (id ? divisionNameMap.get(id) || '—' : 'All / Central'),
    },
    {
      title: 'Linked Warehouse',
      dataIndex: 'warehouseId',
      key: 'warehouseId',
      width: 180,
      render: (id: string) => (id ? warehouseNameMap.get(id) || id : '—'),
    },
    { title: 'Contact Person', dataIndex: 'contactPerson', key: 'contactPerson', width: 150 },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{status}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 110,
      render: (_, record) => (
        <Space>
          {canUpdate && <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />}
          {canDelete && <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<ShopOutlined />}
        title="Store Master"
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
            {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>New Store</Button>}
          </Space>
        }
      />
      <div style={{ padding: '0 16px' }}>
        <Card>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }} className="store-filter-bar">
            <Col xs={24} sm={12} md={8}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Filter by Active Division..."
                style={{ width: '100%' }}
                value={filterDivisionId}
                onChange={setFilterDivisionId}
                options={divisions.map((d) => ({ value: d.id, label: `${d.divisionCode ? `[${d.divisionCode}] ` : ''}${d.name}` }))}
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Select
                allowClear
                placeholder="Filter by Status..."
                style={{ width: '100%' }}
                value={filterStatus}
                onChange={setFilterStatus}
                options={[
                  { value: 'ACTIVE', label: 'ACTIVE' },
                  { value: 'INACTIVE', label: 'INACTIVE' },
                ]}
              />
            </Col>
          </Row>

          <Table
            columns={columns}
            dataSource={displayedData}
            loading={loading}
            rowKey="id"
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 20 }}
          />
        </Card>
      </div>

      <Modal
        title={editingRecord ? 'Edit Store' : 'New Store'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={680}
      >
        <Form form={form} layout="vertical">
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}>
              <Form.Item name="storeCode" label="Store Code" rules={[{ required: true, message: 'Store code is required' }]}>
                <Input disabled={!!editingRecord} placeholder="e.g. SPI-RM-STORE" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="storeName" label="Store Name" rules={[{ required: true, message: 'Store name is required' }]}>
                <Input placeholder="e.g. SPI Raw Material Store" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}>
              <Form.Item name="divisionId" label="Division (Active)">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select division..."
                  onChange={() => {
                    form.setFieldsValue({ sectionId: undefined, departmentId: undefined });
                  }}
                  options={divisions.map((d) => ({ value: d.id, label: `${d.divisionCode ? `[${d.divisionCode}] ` : ''}${d.name}` }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="sectionId" label="Section">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select section..."
                  onChange={() => form.setFieldsValue({ departmentId: undefined })}
                  options={filteredSections.map((s) => ({ value: s.id, label: s.name }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}>
              <Form.Item name="departmentId" label="Department">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select department..."
                  options={filteredDepartments.map((d) => ({ value: d.id, label: d.name }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="warehouseId" label="Linked Warehouse">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select warehouse..."
                  options={filteredWarehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}>
              <Form.Item name="storeType" label="Store Type" initialValue="GENERAL">
                <Select options={STORE_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="isDefault" valuePropName="checked" style={{ marginTop: 30 }}>
                <Checkbox>Default Store</Checkbox>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="Address">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}>
              <Form.Item name="contactPerson" label="Contact Person">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="contactNumber" label="Contact Number">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default StoreManagement;
