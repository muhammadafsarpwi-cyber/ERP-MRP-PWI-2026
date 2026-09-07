import React, { useState, useEffect, useCallback } from 'react';
import {
  Button, Tag, Modal, Form, Input, Select, App,
  InputNumber, Row, Col, Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable, TableActions, TableToolbar } from '../../components/shared/ERPTable';

const STATUS_OPTIONS = ['ACTIVE', 'PARTIAL', 'FULFILLED', 'CANCELLED'];

interface Reservation {
  id: string;
  reservationNumber: string;
  itemId: string;
  itemName?: string;
  warehouseId: string;
  warehouseName?: string;
  quantity: number;
  fulfilledQuantity: number;
  uomCode?: string;
  referenceType: string;
  referenceNumber: string;
  status: string;
  notes: string;
}

interface DropdownOption {
  id: string;
  name: string;
  code?: string;
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'blue',
  PARTIAL: 'orange',
  FULFILLED: 'green',
  CANCELLED: 'red',
};

const ReservationManagement: React.FC = () => {
  const { message } = App.useApp();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Reservation | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

  const [items, setItems] = useState<DropdownOption[]>([]);
  const [warehouses, setWarehouses] = useState<DropdownOption[]>([]);
  const [pageSize] = useState(20);

  const fetchReservations = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: Reservation[]; total: number }>('/inventory/reservations', params);
      setReservations(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch reservations');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  const fetchDropdowns = useCallback(async () => {
    try {
      const [itemRes, warehouseRes] = await Promise.all([
        apiService.get<{ data: DropdownOption[] }>('/master-data/items', { limit: 200 }),
        apiService.get<{ data: DropdownOption[] }>('/warehouses', { limit: 100 }),
      ]);
      setItems(Array.isArray(itemRes?.data) ? itemRes.data : []);
      setWarehouses(Array.isArray(warehouseRes?.data) ? warehouseRes.data : []);
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load reservation dropdowns';
      message.error(`Unable to load reservation options: ${Array.isArray(msg) ? msg[0] : msg}`);
    }
  }, [message]);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  useEffect(() => {
    fetchReservations(page);
  }, [page, fetchReservations]);

  const handleCreate = () => {
    setEditingItem(null);
    setModalVisible(true);
  };

  const handleEdit = (record: Reservation) => {
    setEditingItem(record);
    setModalVisible(true);
  };

  const columns: ColumnsType<Reservation> = [
    { title: 'Reservation #', dataIndex: 'reservationNumber', key: 'reservationNumber', width: 160, render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: 'Item', dataIndex: 'itemName', key: 'itemName', ellipsis: true },
    { title: 'Warehouse', dataIndex: 'warehouseName', key: 'warehouseName', width: 150 },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' as const, render: (v: unknown) => <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{formatNumber(v, 4)}</span> },
    { title: 'Fulfilled', dataIndex: 'fulfilledQuantity', key: 'fulfilledQuantity', width: 90, align: 'right' as const, render: (v: unknown) => <span style={{ fontFamily: 'monospace', color: 'var(--theme-text-muted)' }}>{formatNumber(v, 4)}</span> },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 70, render: (v: string) => <span style={{ color: 'var(--theme-text-muted)' }}>{v || '—'}</span> },
    { title: 'Ref Type', dataIndex: 'referenceType', key: 'referenceType', width: 120, render: (v: string) => v || '—' },
    { title: 'Ref Number', dataIndex: 'referenceNumber', key: 'referenceNumber', width: 130, render: (v: string) => v || '—' },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (s: string) => <Tag color={statusColorMap[s] || 'default'} className="erp-table-tag">{s}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 70, fixed: 'right', align: 'center',
      render: (_, record) => (
        <TableActions>
          <Tooltip title="Edit Reservation">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
        </TableActions>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--theme-text)' }}>
          Stock Reservations
        </h2>
        <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
          Track inventory allocations and reserved stock for production and sales orders.
        </span>
      </div>

      <TableToolbar
        searchPlaceholder="Search reservations..."
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        filters={[
          {
            key: 'status',
            placeholder: 'Status',
            value: filterStatus,
            onChange: (v) => { setFilterStatus(v); setPage(1); },
            options: STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
          },
        ]}
        onRefresh={() => fetchReservations(page)}
        primaryAction={{
          label: 'New Reservation',
          icon: <PlusOutlined />,
          onClick: handleCreate,
        }}
      />

      <ERPTable
        columns={columns}
        dataSource={reservations}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1150 }}
        emptyTitle="No stock reservations found"
        emptyDescription="No reservation records match your current criteria."
        emptyActionLabel="Create Reservation"
        onEmptyAction={handleCreate}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
        }}
      />

      <ReservationModal
        open={modalVisible}
        editingItem={editingItem}
        items={items}
        warehouses={warehouses}
        onCancel={() => setModalVisible(false)}
        onSuccess={() => {
          setModalVisible(false);
          fetchReservations(page);
        }}
      />
    </div>
  );
};

interface ReservationModalProps {
  open: boolean;
  editingItem: Reservation | null;
  items: DropdownOption[];
  warehouses: DropdownOption[];
  onCancel: () => void;
  onSuccess: () => void;
}

const ReservationModal: React.FC<ReservationModalProps> = ({
  open,
  editingItem,
  items,
  warehouses,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (editingItem) {
        form.setFieldsValue({
          itemId: editingItem.itemId,
          warehouseId: editingItem.warehouseId,
          quantity: Number(editingItem.quantity),
          referenceType: editingItem.referenceType ?? '',
          referenceNumber: editingItem.referenceNumber ?? '',
          notes: editingItem.notes ?? '',
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ quantity: 0, fulfilledQuantity: 0 });
      }
    }
  }, [open, editingItem, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editingItem) {
        await apiService.patch(`/inventory/reservations/${editingItem.id}`, {
          itemId: values.itemId,
          warehouseId: values.warehouseId,
          quantity: Number(values.quantity),
          referenceType: values.referenceType,
          referenceNumber: values.referenceNumber,
          notes: values.notes,
        });
        message.success('Reservation updated');
      } else {
        await apiService.post('/inventory/reservations', {
          itemId: values.itemId,
          warehouseId: values.warehouseId,
          quantity: Number(values.quantity),
          referenceType: values.referenceType,
          referenceNumber: values.referenceNumber,
          notes: values.notes,
        });
        message.success('Reservation created');
      }
      onSuccess();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Operation failed';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={editingItem ? 'Edit Reservation' : 'New Reservation'}
      open={open}
      onOk={handleSubmit}
      confirmLoading={submitting}
      onCancel={onCancel}
      width={650}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="itemId" label="Item" rules={[{ required: true, message: 'Please select an item' }]}>
              <Select
                showSearch
                placeholder="Select item"
                optionFilterProp="label"
                options={items.map((i: any) => ({
                  value: i.id,
                  label: i.itemCode ? `${i.itemCode} — ${i.name}` : i.name || i.id,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true, message: 'Please select warehouse' }]}>
              <Select
                showSearch
                placeholder="Select warehouse"
                optionFilterProp="label"
                options={warehouses.map((w: any) => ({
                  value: w.id,
                  label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name || w.id,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="quantity" label="Quantity" rules={[{ required: true, message: 'Please enter quantity' }]}>
              <InputNumber min={0.0001} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="referenceType" label="Reference Type">
              <Input placeholder="e.g. SALES_ORDER, WORK_ORDER" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="referenceNumber" label="Reference Number">
              <Input placeholder="Reference identifier" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="notes" label="Notes">
              <Input.TextArea rows={2} placeholder="Optional notes" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default ReservationManagement;
