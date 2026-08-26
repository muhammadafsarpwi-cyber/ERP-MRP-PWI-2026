import React, { useState, useEffect, useCallback } from 'react';
import {
  App, Table, Button, Space, Modal, Form, Input, Popconfirm, Card, TreeSelect,
} from 'antd';
import { PlusOutlined, EditOutlined, TagsOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader, StatusBadge, EmptyState, PageToolbar } from '../../components/shared';

interface Category {
  id: string;
  categoryCode: string;
  name: string;
  description: string;
  parentCategoryId: string | null;
  parentCategory?: { id: string; name: string } | null;
  status: string;
  companyId: string;
  children?: Category[];
  childCount?: number;
}

interface CategoryTree {
  id: string;
  value: string;
  title: string;
  key: string;
  children?: CategoryTree[];
}

const buildTreeData = (data: Category[]): CategoryTree[] =>
  data.map(item => ({
    id: item.id,
    value: item.id,
    title: item.name,
    key: item.id,
    children: item.children ? buildTreeData(item.children) : [],
  }));

const excludeFromTree = (nodes: CategoryTree[], excludeId: string): CategoryTree[] =>
  nodes
    .filter(n => n.id !== excludeId)
    .map(n => ({
      ...n,
      children: n.children ? excludeFromTree(n.children, excludeId) : [],
    }));

const CategoryManagement: React.FC = () => {
  const { message } = App.useApp();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryTree[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');

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

  const fetchCategories = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      const response = await apiService.get<{ data: Category[]; total: number }>('/master-data/categories', params);
      setCategories(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  }, [search, pageSize, message]);

  const fetchHierarchy = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Category[] }>('/master-data/categories/hierarchy');
      setCategoryTree(buildTreeData(response.data));
    } catch (error) {
      message.error('Failed to fetch category hierarchy');
    }
  }, [message]);

  useEffect(() => {
    fetchHierarchy();
  }, [fetchHierarchy]);

  useEffect(() => {
    fetchCategories(page);
  }, [page, fetchCategories]);

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
    try {
      const values = await form.validateFields();
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
      fetchCategories(page);
      fetchHierarchy();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Operation failed';
      message.error(Array.isArray(msg) ? msg.join('; ') : String(msg));
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/categories/${id}/activate`);
      message.success('Category activated');
      fetchCategories(page);
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Failed to activate category';
      message.error(Array.isArray(msg) ? msg.join('; ') : String(msg));
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/categories/${id}/deactivate`);
      message.success('Category deactivated');
      fetchCategories(page);
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Failed to deactivate category';
      message.error(Array.isArray(msg) ? msg.join('; ') : String(msg));
    }
  };

  const columns: ColumnsType<Category> = [
    { title: 'Code', dataIndex: 'categoryCode', key: 'categoryCode', width: 140 },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 200 },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: 'Parent Category', key: 'parentName', width: 160,
      render: (_, r) => r.parentCategory?.name ?? '—',
    },
    {
      title: 'Children', key: 'childCount', width: 100,
      render: (_, r) => r.childCount ?? r.children?.length ?? 0,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (s: string) => <StatusBadge status={s} />,
    },
    {
      title: 'Actions', key: 'actions', width: 140,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {record.status === 'INACTIVE' ? (
            <Popconfirm title="Activate this category?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link">Activate</Button>
            </Popconfirm>
          ) : (
            <Popconfirm title="Deactivate this category?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger>Deactivate</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<TagsOutlined />}
        title="Item Categories"
        subtitle={`Manage product categories and hierarchy · ${total} records`}
        showBreadcrumbs
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Category</Button>
        }
      />

      <PageToolbar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search categories..."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Category</Button>
        }
      />

      <Card styles={{ body: { padding: '8px 0 0' } }}>
        <Table
          columns={columns}
          dataSource={categories}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p, ps) => { setPage(ps !== pageSize ? 1 : p); setPageSize(ps); },
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (t, range) => `${range[0]}-${range[1]} of ${t} categories`,
          }}
          expandable={{
            expandedRowRender: (record) => (
              <Table
                columns={columns.filter(c => c.key !== 'actions')}
                dataSource={record.children || []}
                rowKey="id"
                pagination={false}
                size="small"
              />
            ),
            rowExpandable: (record) => (record.children?.length ?? 0) > 0,
          }}
          locale={{
            emptyText: (
              <EmptyState
                title={search ? 'No categories match your search' : 'No categories found'}
                description={search ? 'Try adjusting your search criteria.' : 'Get started by adding your first category.'}
                actionLabel="Add Category"
                onAction={handleCreate}
              />
            ),
          }}
        />
      </Card>

      <Modal
        title={editingCategory ? 'Edit Category' : 'Create Category'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={550}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="categoryCode" label="Category Code" rules={[{ required: true }]}>
            <Input disabled={!!editingCategory} />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="parentCategoryId" label="Parent Category">
            <TreeSelect
              treeData={editingCategory ? excludeFromTree(categoryTree, editingCategory.id) : categoryTree}
              placeholder="Select parent category"
              allowClear
              treeDefaultExpandAll
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CategoryManagement;
