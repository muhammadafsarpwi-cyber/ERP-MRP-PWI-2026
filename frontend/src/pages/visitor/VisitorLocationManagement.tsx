import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, DeleteOutlined, EnvironmentOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { DivisionSelect, PageHeader } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';

/**
 * Location master for Visitor Management (`locations` — migration ERP-00069).
 *
 * Company → Division → Location: the picker only ever offers divisions the
 * caller may use, and the backend re-validates the division on every write.
 * This is a NEW master; the pre-existing "Warehouse Locations" page
 * (`/organization/locations`) is untouched.
 */
interface LocationRow {
  id: string;
  locationCode: string;
  name: string;
  description: string | null;
  divisionId: string;
  status: string;
  division?: { id: string; divisionCode: string; name: string } | null;
}

export function VisitorLocationManagement() {
  const { message } = App.useApp();
  const { can, allowedDivisionIds, divisionsUnrestricted } = usePermission();

  const [rows, setRows] = useState<LocationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');

  const [divisionRows, setDivisionRows] = useState<{ id: string; divisionCode: string; name: string; status?: string }[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: pageSize };
      if (search.trim()) params.search = search.trim();
      const res = await apiService.get<{ data?: LocationRow[]; total?: number }>('/locations', params);
      setRows(Array.isArray(res?.data) ? res.data : []);
      setTotal(Number(res?.total ?? 0));
    } catch (err: any) {
      setRows([]);
      setTotal(0);
      if (err?.response?.status === 403) {
        message.error('You do not have permission to view locations.');
      } else {
        message.error(formatApiError(err, 'Could not load locations'));
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, message]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    apiService
      .get<{ data?: any[] }>('/divisions', { limit: 500, status: 'ACTIVE' })
      .then((res) => {
        if (!cancelled) setDivisionRows(Array.isArray(res?.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setDivisionRows(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const divisionOptions = useMemo(() => {
    if (divisionRows === null) return null;
    if (divisionsUnrestricted) return divisionRows;
    const allowed = new Set(allowedDivisionIds);
    return divisionRows.filter((row) => allowed.has(row.id));
  }, [divisionRows, divisionsUnrestricted, allowedDivisionIds]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (row: LocationRow) => {
    setEditing(row);
    form.setFieldsValue({
      divisionId: row.divisionId,
      locationCode: row.locationCode,
      name: row.name,
      description: row.description ?? '',
      status: row.status,
    });
    setModalOpen(true);
  };

  const save = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await apiService.patch(`/locations/${editing.id}`, {
          locationCode: values.locationCode,
          name: values.name,
          description: values.description || undefined,
          status: values.status,
        });
        message.success('Location updated successfully');
      } else {
        await apiService.post('/locations', {
          divisionId: values.divisionId,
          locationCode: values.locationCode,
          name: values.name,
          description: values.description || undefined,
        });
        message.success('Location created successfully');
      }
      setModalOpen(false);
      form.resetFields();
      setEditing(null);
      void load();
    } catch (err) {
      message.error(formatApiError(err, 'Could not save the location'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: LocationRow) => {
    try {
      await apiService.delete(`/locations/${row.id}`);
      message.success('Location deleted');
      void load();
    } catch (err) {
      message.error(formatApiError(err, 'Could not delete the location'));
    }
  };

  const columns: ColumnsType<LocationRow> = [
    { title: 'Location Code', dataIndex: 'locationCode', key: 'locationCode', width: 150 },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Division',
      key: 'division',
      width: 220,
      render: (_, row) =>
        row.division ? `${row.division.divisionCode} · ${row.division.name}` : row.divisionId,
    },
    { title: 'Description', dataIndex: 'description', key: 'description', render: (v) => v || '—' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : 'default'}>{status}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 170,
      render: (_, row) => (
        <Space>
          {can('location.update') && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
              Edit
            </Button>
          )}
          {can('location.delete') && (
            <Popconfirm
              title="Delete this location?"
              description="Locations with visitor entries cannot be deleted."
              onConfirm={() => void remove(row)}
              okText="Delete"
              cancelText="Cancel"
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="location-page">
      <PageHeader
        icon={<EnvironmentOutlined />}
        title="Locations"
        subtitle="Visitor Management — locations inside a division (Company → Division → Location)"
      />

      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <Typography.Text type="secondary">
            A location always belongs to one division; delete is blocked while visitor entries reference it.
          </Typography.Text>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} data-testid="location-refresh">
              Refresh
            </Button>
            {can('location.create') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} data-testid="new-location-button">
                New Location
              </Button>
            )}
          </Space>
        </div>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search code or name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{ width: 260 }}
            data-testid="location-search"
          />
        </Space>

        <Table<LocationRow>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize !== pageSize ? 1 : nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
      </Card>

      <Form form={form} layout="vertical" data-testid="location-form" onFinish={() => void save()}>
        <Modal
          title={editing ? 'Edit Location' : 'New Location'}
          open={modalOpen}
          onOk={() => void save()}
          confirmLoading={saving}
          onCancel={() => {
            setModalOpen(false);
            form.resetFields();
            setEditing(null);
          }}
          okText="Save"
          cancelButtonProps={{ disabled: saving }}
          data-testid="location-modal"
        >
          {!editing && (
            <Form.Item
              label="Division"
              name="divisionId"
              rules={[{ required: true, message: 'Please select a division' }]}
            >
              <DivisionSelect divisions={divisionOptions} placeholder="Select division" />
            </Form.Item>
          )}
          <Form.Item
            label="Location Code"
            name="locationCode"
            rules={[
              { required: true, message: 'Please enter the location code' },
              { pattern: /^[A-Z0-9_-]+$/, message: 'Use uppercase letters, numbers, hyphens and underscores' },
            ]}
          >
            <Input placeholder="GATE-01" maxLength={50} />
          </Form.Item>
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Please enter the location name' }]}
          >
            <Input placeholder="Main Gate" maxLength={255} />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={2} maxLength={500} placeholder="Optional" />
          </Form.Item>
          {editing && (
            <Form.Item label="Status" name="status" initialValue="ACTIVE">
              <Select
                options={[
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'INACTIVE', label: 'Inactive' },
                ]}
              />
            </Form.Item>
          )}
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Locations belong to a division; they can be selected on a visitor entry only together with
            their own division.
          </Typography.Paragraph>
        </Modal>
      </Form>
    </div>
  );
}

export default VisitorLocationManagement;
