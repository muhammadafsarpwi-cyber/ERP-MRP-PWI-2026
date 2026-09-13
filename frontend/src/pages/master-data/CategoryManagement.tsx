import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  App, Table, Button, Modal, Form, Input, Popconfirm, TreeSelect, Tag,
} from 'antd';
import { PlusOutlined, TagsOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import apiService from '../../services/api';
import { PageHeader, StatusBadge, PageToolbar, TableActions } from '../../components/shared';

interface Category {
  id: string;
  companyId: string;
  categoryCode: string;
  name: string;
  description: string | null;
  parentCategoryId: string | null;
  parentCategory?: { id: string; name: string } | null;
  status: string;
  level: number;
  childCount: number;
  usageCount: number;
  children?: Category[];
}

const countAll = (roots: Category[]): number =>
  roots.reduce((acc, n) => acc + 1 + countAll(n.children || []), 0);

const filterTree = (roots: Category[], q: string): Category[] => {
  const needle = q.trim().toLowerCase();
  if (!needle) return roots;
  const matches = (c: Category) =>
    [c.name, c.categoryCode, c.description || ''].join(' ').toLowerCase().includes(needle);
  const walk = (list: Category[]): Category[] =>
    list.reduce<Category[]>((acc, node) => {
      const children = walk(node.children || []);
      if (matches(node) || children.length > 0) {
        acc.push({ ...node, children: matches(node) ? node.children || [] : children });
      }
      return acc;
    }, []);
  return walk(roots);
};

const collectIds = (node: Category): string[] => [node.id, ...(node.children || []).flatMap(collectIds)];

const buildParentTree = (nodes: Category[], excluded: Set<string>): DataNode[] =>
  nodes
    .filter((n) => !excluded.has(n.id))
    .map((n) => ({
      key: n.id,
      value: n.id,
      title: n.name,
      disabled: n.status !== 'ACTIVE',
      selectable: n.status === 'ACTIVE',
      children: buildParentTree(n.children || [], excluded),
    }));

const CategoryManagement: React.FC = () => {
  const { message } = App.useApp();
  const [roots, setRoots] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  useEffect(() => {
    const flat: React.Key[] = [];
    const collect = (list: Category[]) => {
      list.forEach((n) => {
        flat.push(n.id);
        collect(n.children || []);
      });
    };
    collect(roots);
    setExpandedKeys(flat);
  }, [roots]);

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

  const fetchHierarchy = useCallback(async (cid: string | null) => {
    setLoading(true);
    try {
      const params = cid ? { companyId: cid } : {};
      const response = await apiService.get<{ data: Category[] }>('/master-data/categories/hierarchy', params);
      setRoots(response.data || []);
    } catch (error) {
      message.error('Failed to fetch category hierarchy');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void fetchHierarchy(companyId);
  }, [companyId, fetchHierarchy]);

  const total = useMemo(() => countAll(roots), [roots]);
  const dataSource = useMemo(() => filterTree(roots, search), [roots, search]);

  const parentTree = useMemo(() => {
    const excluded = editingCategory ? new Set(collectIds(editingCategory)) : new Set<string>();
    return buildParentTree(roots, excluded);
  }, [roots, editingCategory]);

  const handleCreate = () => {
    setEditingCategory(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Category) => {
    setEditingCategory(record);
    form.setFieldsValue({
      categoryCode: record.categoryCode,
      name: record.name,
      description: record.description,
      parentCategoryId: record.parentCategoryId,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (saving) return;
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      if (editingCategory) {
        await apiService.patch(`/master-data/categories/${editingCategory.id}`, values);
        message.success('Category updated');
      } else {
        if (!companyId) {
          message.error('Company not resolved. Please refresh and try again.');
          return;
        }
        await apiService.post('/master-data/categories', { ...values, companyId });
        message.success('Category created');
      }
      setModalVisible(false);
      void fetchHierarchy(companyId);
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Operation failed';
      message.error(Array.isArray(msg) ? msg.join('; ') : String(msg));
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/categories/${id}/activate`);
      message.success('Category activated');
      void fetchHierarchy(companyId);
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Failed to activate category';
      message.error(Array.isArray(msg) ? msg.join('; ') : String(msg));
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/categories/${id}/deactivate`);
      message.success('Category deactivated');
      void fetchHierarchy(companyId);
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Failed to deactivate category';
      message.error(Array.isArray(msg) ? msg.join('; ') : String(msg));
    }
  };

  const columns: ColumnsType<Category> = [
    {
      title: 'Level', key: 'level', width: 64, align: 'center',
      render: (_, r) => (
        <Tag color={r.level === 0 ? 'blue' : r.level === 1 ? 'cyan' : 'default'} style={{ marginInlineEnd: 0 }}>
          L{r.level}
        </Tag>
      ),
    },
    { title: 'Code', dataIndex: 'categoryCode', key: 'categoryCode', width: 140, ellipsis: true },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 200, ellipsis: true },
    {
      title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (v: string) => v || <span style={{ color: '#999' }}>—</span>,
    },
    {
      title: 'Parent Category', key: 'parentName', width: 160, ellipsis: true,
      render: (_, r) => <span style={{ color: '#666' }}>{r.parentCategory?.name ?? <span style={{ color: '#999' }}>—</span>}</span>,
    },
    {
      title: 'Children', key: 'childCount', width: 90, align: 'center',
      render: (_, r) => (r.childCount > 0 ? r.childCount : <span style={{ color: '#999' }}>0</span>),
    },
    {
      title: 'Items', key: 'usageCount', width: 80, align: 'center',
      render: (_, r) => (r.usageCount > 0 ? r.usageCount : <span style={{ color: '#999' }}>0</span>),
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 104,
      render: (s: string) => <StatusBadge status={s} />,
    },
    {
      title: 'Actions', key: 'actions', width: 132, align: 'center',
      render: (_, record) => (
        <TableActions
          onEdit={() => handleEdit(record)}
          extraActions={[
            record.status === 'INACTIVE' ? (
              <Popconfirm key="act" title="Activate this category?" onConfirm={() => handleActivate(record.id)}>
                <Button type="text" size="small" style={{ color: 'var(--theme-success, #22c55e)' }}>Activate</Button>
              </Popconfirm>
            ) : (
              <Popconfirm key="deact" title="Deactivate this category?" onConfirm={() => handleDeactivate(record.id)}>
                <Button type="text" size="small" danger>Deactivate</Button>
              </Popconfirm>
            ),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="erp-dashboard">
      <PageHeader
        icon={<TagsOutlined />}
        title="Item Categories"
        subtitle={`Category hierarchy · ${total} categories · level 0 = root, 1 = child, 2 = sub-child`}
        showBreadcrumbs
      />

      <PageToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search categories..."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Category</Button>
        }
      />

      <Table<Category>
        className="erp-table"
        rowKey="id"
        loading={loading}
        dataSource={dataSource}
        columns={columns}
        childrenColumnName="children"
        tableLayout="fixed"
        pagination={false}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys(keys as React.Key[]),
          expandRowByClick: false,
          indentSize: 20,
        }}
        locale={{
          emptyText: search ? 'No categories match your search' : 'No categories found',
        }}
      />

      <Modal
        title={editingCategory ? 'Edit Category' : 'Add Category'}
        open={modalVisible}
        onOk={handleSubmit}
        confirmLoading={saving}
        onCancel={() => setModalVisible(false)}
        width={560}
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            name="categoryCode"
            label="Category Code"
            extra="Uppercase letters, numbers and underscores. Cannot be changed after creation."
            rules={[
              { required: true, message: 'Category Code is required' },
              { pattern: /^[A-Z0-9_-]+$/, message: 'Uppercase letters, numbers, hyphens and underscores only' },
            ]}
          >
            <Input placeholder="e.g. CAT-FG" maxLength={50} disabled={!!editingCategory} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="name" label="Category Name" rules={[{ required: true, message: 'Category Name is required' }]}>
            <Input placeholder="e.g. Cables & Wires" maxLength={255} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} maxLength={1000} placeholder="Short description of this category" />
          </Form.Item>
          <Form.Item
            name="parentCategoryId"
            label="Parent Category"
            extra="Leave empty to create a root category. Only active categories can be selected as parents."
          >
            <TreeSelect
              treeData={parentTree}
              placeholder="Select parent category"
              allowClear
              treeDefaultExpandAll
              showSearch
              treeNodeFilterProp="title"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CategoryManagement;