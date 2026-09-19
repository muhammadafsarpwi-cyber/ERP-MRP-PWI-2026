import React, { useState, useEffect, useCallback } from 'react';
import {
  Button, Tag, Form, Input, Select, App, Card,
  InputNumber, Row, Col, Rate, Descriptions, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import {
  ERPTable,
  FilterBar,
  DeleteConfirmModal,
  DraggableResizableModal,
} from '../../components/shared';

interface Supplier {
  id: string;
  supplierCode: string;
  name: string;
  shortName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  currencyCode: string;
  paymentTerms?: string;
  creditLimit: number;
  leadTimeDays: number;
  rating: number;
  status: string;
}

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED'];

const statusColorMap: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'default',
  SUSPENDED: 'orange',
  BLACKLISTED: 'red',
};

const SupplierManagement: React.FC = () => {
  const { message } = App.useApp();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Supplier | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // Unified Delete Confirmation State
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);

  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

  const fetchSuppliers = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params: any = { page: p, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const res = await apiService.get<any>('/procurement/suppliers', params);
      const data = res?.data || res;
      setSuppliers(data?.data || (Array.isArray(data) ? data : []));
      setTotal(data?.total || 0);
    } catch {
      message.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, filterStatus, message]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Supplier) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleView = (record: Supplier) => {
    setSelectedSupplier(record);
    setDetailVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await apiService.put(`/procurement/suppliers/${editingItem.id}`, values);
        message.success('Supplier updated successfully');
      } else {
        await apiService.post('/procurement/suppliers', values);
        message.success('Supplier created successfully');
      }
      setModalVisible(false);
      fetchSuppliers(page);
    } catch {
      message.error('Failed to save supplier');
    }
  };

  const openDeleteConfirm = (record: Supplier) => {
    setSupplierToDelete(record);
    setDeleteModalVisible(true);
  };

  const columns: ColumnsType<Supplier> = [
    { title: 'Code', dataIndex: 'supplierCode', key: 'supplierCode', width: 120, fixed: 'left' },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 200 },
    { title: 'Contact', dataIndex: 'contactPerson', key: 'contactPerson', width: 150 },
    { title: 'Email', dataIndex: 'email', key: 'email', width: 200 },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 120 },
    { title: 'City', dataIndex: 'city', key: 'city', width: 120 },
    { title: 'Rating', dataIndex: 'rating', key: 'rating', width: 150, render: (v: number) => <Rate disabled value={v} /> },
    { title: 'Currency', dataIndex: 'currencyCode', key: 'currencyCode', width: 80 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 130, fixed: 'right',
      render: (_, record) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Tooltip title="View Supplier">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleView(record)}
              className="erp-action-btn erp-action-btn--view"
            />
          </Tooltip>
          <Tooltip title="Edit Supplier">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
              className="erp-action-btn erp-action-btn--edit"
            />
          </Tooltip>
          <Tooltip title="Delete Supplier">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => openDeleteConfirm(record)}
              className="erp-action-btn erp-action-btn--delete"
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <Card
      title="Supplier Management"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Add Supplier
        </Button>
      }
      style={{ borderRadius: 10 }}
    >
      {/* 1-Line Unified Enterprise Collapsible FilterBar */}
      <FilterBar
        searchPlaceholder="Search suppliers (code, name, contact, email)..."
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        primaryFilters={
          <Select
            placeholder="All Statuses"
            allowClear
            style={{ width: 160 }}
            value={filterStatus}
            onChange={(val) => {
              setFilterStatus(val);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((s) => (
              <Select.Option key={s} value={s}>{s}</Select.Option>
            ))}
          </Select>
        }
        totalCount={total}
        itemLabel="suppliers"
        onReset={() => {
          setSearch('');
          setFilterStatus(undefined);
          setPage(1);
        }}
      />

      <ERPTable
        columns={columns}
        dataSource={suppliers}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
          showSizeChanger: false,
        }}
        scroll={{ x: 1200 }}
      />

      {/* Edit / Create Draggable Modal */}
      <DraggableResizableModal
        title={editingItem ? 'Edit Supplier' : 'Create Supplier'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={800}
        okText="Save Supplier"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="companyId" label="Company ID" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="supplierCode" label="Supplier Code" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="shortName" label="Short Name">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contactPerson" label="Contact Person">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Phone">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="currencyCode" label="Currency">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="paymentTerms" label="Payment Terms">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="creditLimit" label="Credit Limit">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="leadTimeDays" label="Lead Time (Days)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="rating" label="Rating">
                <Rate />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </DraggableResizableModal>

      {/* Supplier Details Modal */}
      <DraggableResizableModal
        title="Supplier Details"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setDetailVisible(false)}>
            Close
          </Button>,
        ]}
        width={700}
      >
        {selectedSupplier && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="Code">{selectedSupplier.supplierCode}</Descriptions.Item>
            <Descriptions.Item label="Name">{selectedSupplier.name}</Descriptions.Item>
            <Descriptions.Item label="Contact">{selectedSupplier.contactPerson}</Descriptions.Item>
            <Descriptions.Item label="Email">{selectedSupplier.email}</Descriptions.Item>
            <Descriptions.Item label="Phone">{selectedSupplier.phone}</Descriptions.Item>
            <Descriptions.Item label="City">{selectedSupplier.city}</Descriptions.Item>
            <Descriptions.Item label="Currency">{selectedSupplier.currencyCode}</Descriptions.Item>
            <Descriptions.Item label="Payment Terms">{selectedSupplier.paymentTerms}</Descriptions.Item>
            <Descriptions.Item label="Credit Limit">{selectedSupplier.creditLimit}</Descriptions.Item>
            <Descriptions.Item label="Lead Time">{selectedSupplier.leadTimeDays} days</Descriptions.Item>
            <Descriptions.Item label="Rating"><Rate disabled value={selectedSupplier.rating} /></Descriptions.Item>
            <Descriptions.Item label="Status"><Tag color={statusColorMap[selectedSupplier.status]}>{selectedSupplier.status}</Tag></Descriptions.Item>
          </Descriptions>
        )}
      </DraggableResizableModal>

      {/* Enterprise Delete Confirmation & Error Resolution Dialog */}
      <DeleteConfirmModal
        open={deleteModalVisible}
        itemType="Supplier"
        itemCode={supplierToDelete?.supplierCode}
        itemName={supplierToDelete?.name}
        description="Permanent deletion is blocked automatically if this supplier has purchase orders, invoices, RFQs, or material receipts."
        onConfirm={async () => {
          if (!supplierToDelete) return;
          await apiService.delete(`/procurement/suppliers/${supplierToDelete.id}`);
          message.success('Supplier deleted successfully');
          setDeleteModalVisible(false);
          setSupplierToDelete(null);
          fetchSuppliers(page);
        }}
        onCancel={() => {
          setDeleteModalVisible(false);
          setSupplierToDelete(null);
        }}
        onDeactivateInstead={
          supplierToDelete?.status === 'ACTIVE'
            ? async () => {
                await apiService.put(`/procurement/suppliers/${supplierToDelete.id}`, { status: 'INACTIVE' });
                message.success('Supplier deactivated successfully');
                setDeleteModalVisible(false);
                setSupplierToDelete(null);
                fetchSuppliers(page);
              }
            : undefined
        }
        deactivateLabel="Deactivate Supplier Instead"
      />
    </Card>
  );
};

export default SupplierManagement;
