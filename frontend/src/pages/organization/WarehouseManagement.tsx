import React, { useState, useEffect, useCallback } from 'react';
import { App, Button, Modal, Form, Input, Select } from 'antd';
import { PlusOutlined, CheckCircleOutlined, CloseCircleOutlined, ShopOutlined, PrinterOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { PageHeader, ERPTable, TableToolbar, TableActions, StatusBadge } from '../../components/shared';
import BarcodePrint from '../../components/shared/BarcodePrint';
import { getAuditColumns } from './orgUtils';

interface Company {
  id: string;
  companyCode: string;
  legalName: string;
}

interface Warehouse {
  id: string;
  warehouseCode: string;
  name: string;
  companyId: string;
  company?: Company;
  warehouseType: string;
  city: string;
  country: string;
  status: string;
  createdAt: string;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
}

interface PrintModalState {
  visible: boolean;
  warehouse: Warehouse | null;
}

const WarehouseManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [printModal, setPrintModal] = useState<PrintModalState>({
    visible: false,
    warehouse: null,
  });

  const warehouseTypes = [
    { value: 'RAW_MATERIAL', label: 'Raw Material' },
    { value: 'WORK_IN_PROGRESS', label: 'Work In Progress' },
    { value: 'FINISHED_GOODS', label: 'Finished Goods' },
    { value: 'GENERAL', label: 'General' },
    { value: 'QUARANTINE', label: 'Quarantine' },
    { value: 'SCRAP', label: 'Scrap' },
  ];

  const fetchWarehouses = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Warehouse[]; total: number }>('/warehouses', {
        page: pageNum,
        limit: 20,
      });
      setWarehouses(response.data);
      setTotal(response.total);
    } catch (error: any) {
      modal.error({
        title: 'Load Failed',
        content: formatApiError(error, 'Failed to fetch warehouses'),
      });
    } finally {
      setLoading(false);
    }
  }, [modal]);

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Company[] }>('/companies', { limit: 100 });
      setCompanies(response.data);
    } catch (error: any) {
      modal.error({
        title: 'Load Failed',
        content: formatApiError(error, 'Failed to fetch companies'),
      });
    }
  }, [modal]);

  useEffect(() => {
    fetchWarehouses(page);
    fetchCompanies();
  }, [page, fetchWarehouses, fetchCompanies]);

  const handleCreate = () => {
    setEditingWarehouse(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Warehouse) => {
    setEditingWarehouse(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = (record: Warehouse) => {
    modal.confirm({
      title: 'Delete Warehouse',
      content: `Are you sure you want to delete warehouse "${record.warehouseCode}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.delete(`/warehouses/${record.id}`);
          message.success('Warehouse deleted successfully');
          fetchWarehouses(page);
        } catch (error: any) {
          modal.error({
            title: 'Delete Failed',
            content: formatApiError(error, 'Failed to delete warehouse'),
          });
        }
      },
    });
  };

  const handleActivate = (record: Warehouse) => {
    modal.confirm({
      title: 'Activate Warehouse',
      content: `Are you sure you want to activate warehouse "${record.warehouseCode}"?`,
      okText: 'Activate',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/warehouses/${record.id}/activate`);
          message.success('Warehouse activated successfully');
          fetchWarehouses(page);
        } catch (error: any) {
          modal.error({
            title: 'Activation Failed',
            content: formatApiError(error, 'Failed to activate warehouse'),
          });
        }
      },
    });
  };

  const handleDeactivate = (record: Warehouse) => {
    modal.confirm({
      title: 'Deactivate Warehouse',
      content: `Are you sure you want to deactivate warehouse "${record.warehouseCode}"?`,
      okText: 'Deactivate',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/warehouses/${record.id}/deactivate`);
          message.success('Warehouse deactivated successfully');
          fetchWarehouses(page);
        } catch (error: any) {
          modal.error({
            title: 'Deactivation Failed',
            content: formatApiError(error, 'Failed to deactivate warehouse'),
          });
        }
      },
    });
  };

  const handleSubmit = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch (error: any) {
      const errorList = error?.errorFields?.flatMap((f: any) => f.errors) || ['Please check required fields'];
      modal.error({
        title: 'Validation Failed',
        content: (
          <div>
            <p style={{ marginBottom: 8, fontWeight: 500 }}>Please correct the following errors:</p>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              {errorList.map((msg: string, idx: number) => (
                <li key={idx} style={{ color: '#ff4d4f' }}>{msg}</li>
              ))}
            </ul>
          </div>
        ),
      });
      return;
    }

    modal.confirm({
      title: 'Save Confirmation',
      content: 'Are you sure you want to save these changes?',
      okText: 'Save',
      cancelText: 'Cancel',
      onOk: async () => {
        setSubmitting(true);
        try {
          if (editingWarehouse) {
            const { companyId: _co, ...editable } = values;
            await apiService.patch(`/warehouses/${editingWarehouse.id}`, editable);
            message.success('Warehouse updated successfully');
          } else {
            await apiService.post('/warehouses', values);
            message.success('Warehouse created successfully');
          }
          setModalVisible(false);
          fetchWarehouses(page);
        } catch (error: any) {
          modal.error({
            title: 'Save Failed',
            content: formatApiError(error, 'Operation failed'),
          });
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const baseColumns: ColumnsType<Warehouse> = [
    {
      title: 'Code',
      dataIndex: 'warehouseCode',
      key: 'warehouseCode',
      width: 140,
      render: (code: string) => <span style={{ fontWeight: 600, color: 'var(--theme-text)' }}>{code}</span>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: 'Company',
      key: 'company',
      width: 180,
      render: (_, record) => record.company?.legalName || '—',
    },
    {
      title: 'Type',
      dataIndex: 'warehouseType',
      key: 'warehouseType',
      width: 160,
      render: (type: string) => {
        const typeObj = warehouseTypes.find((t) => t.value === type);
        return typeObj?.label || type;
      },
    },
    {
      title: 'City',
      dataIndex: 'city',
      key: 'city',
      width: 130,
      render: (c: string) => c || '—',
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      width: 130,
      render: (c: string) => c || '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => <StatusBadge status={status} />,
    },
  ];

  const columns: ColumnsType<Warehouse> = [
    ...baseColumns,
    ...getAuditColumns<Warehouse>(),
    {
      title: 'Actions',
      key: 'actions',
      width: 170,
      align: 'center',
      render: (_, record) => (
        <TableActions
          onView={() => handleEdit(record)}
          onEdit={() => handleEdit(record)}
          onDelete={() => handleDelete(record)}
          extraActions={[
            <Button key="print" type="text" size="small" icon={<PrinterOutlined />} onClick={() => setPrintModal({ visible: true, warehouse: record })} title="Print Barcode" />,
            record.status === 'ACTIVE' ? (
              <Button key="deact" type="text" size="small" danger icon={<CloseCircleOutlined />} onClick={() => handleDeactivate(record)} title="Deactivate" />
            ) : (
              <Button key="act" type="text" size="small" style={{ color: 'var(--theme-success, #22c55e)' }} icon={<CheckCircleOutlined />} onClick={() => handleActivate(record)} title="Activate" />
            )
          ]}
        />
      ),
    },
  ];

  const filteredWarehouses = warehouses.filter((w) => {
    if (searchText && !`${w.warehouseCode || ''} ${w.name || ''}`.toLowerCase().includes(searchText.toLowerCase())) {
      return false;
    }
    if (typeFilter && w.warehouseType !== typeFilter) {
      return false;
    }
    if (statusFilter && w.status !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <div>
      <PageHeader
        icon={<ShopOutlined />}
        title="Warehouse Management"
        subtitle={`Manage storage facilities, raw materials, and finished goods locations · ${total} records`}
        showBreadcrumbs
      />

      <TableToolbar
        searchPlaceholder="Search warehouses..."
        searchValue={searchText}
        onSearchChange={setSearchText}
        filters={[
          {
            key: 'type',
            label: 'WAREHOUSE TYPE',
            placeholder: 'All Types',
            value: typeFilter,
            onChange: setTypeFilter,
            options: warehouseTypes,
          },
          {
            key: 'status',
            label: 'STATUS',
            placeholder: 'All Status',
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
            ],
          },
        ]}
        onClearFilters={() => {
          setTypeFilter(undefined);
          setStatusFilter(undefined);
          setSearchText('');
        }}
        primaryAction={{
          label: '+ Add Warehouse',
          icon: <PlusOutlined />,
          onClick: handleCreate,
        }}
        onRefresh={() => fetchWarehouses(page)}
      />

      <ERPTable
        columns={columns}
        dataSource={filteredWarehouses}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total: filteredWarehouses.length,
          pageSize: 20,
          onChange: setPage,
        }}
        emptyText="No warehouses found"
      />

      <Modal
        title={editingWarehouse ? 'Edit Warehouse' : 'Create Warehouse'}
        open={modalVisible}
        onOk={handleSubmit}
        confirmLoading={submitting}
        onCancel={() => {
          if (!submitting) setModalVisible(false);
        }}
        width={800}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="companyId"
            label="Company"
            rules={[{ required: true, message: 'Please select company' }]}
          >
            <Select placeholder="Select company">
              {companies.map((company) => (
                <Select.Option key={company.id} value={company.id}>
                  {company.legalName}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="warehouseCode"
            label="Warehouse Code"
            rules={[{ required: true, message: 'Please enter warehouse code' }]}
          >
            <Input disabled={!!editingWarehouse} />
          </Form.Item>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="warehouseType"
            label="Warehouse Type"
            rules={[{ required: true, message: 'Please select warehouse type' }]}
          >
            <Select placeholder="Select warehouse type">
              {warehouseTypes.map((type) => (
                <Select.Option key={type.value} value={type.value}>
                  {type.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input />
          </Form.Item>
          <Form.Item name="city" label="City">
            <Input />
          </Form.Item>
          <Form.Item name="country" label="Country">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      <BarcodePrint
        open={printModal.visible}
        onClose={() => setPrintModal({ visible: false, warehouse: null })}
        itemCode={printModal.warehouse?.warehouseCode || ''}
        itemName={printModal.warehouse?.name || ''}
        barcode={printModal.warehouse?.warehouseCode || null}
        companyName="PWI ERP"
      />
    </div>
  );
};

export default WarehouseManagement;