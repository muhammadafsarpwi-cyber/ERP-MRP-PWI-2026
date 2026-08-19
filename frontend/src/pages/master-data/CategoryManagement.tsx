import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, message, Popconfirm, Card, TreeSelect,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';

interface Category {
  id: string;
  code: string;
  name: string;
  description: string;
  parentId: string | null;
  parentName?: string;
  status: string;
  children?: Category[];
  childCount?: number;
}

interface CategoryTree {
  id: string;
  title: string;
  key: string;
  children?: CategoryTree[];
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'red',
};

const buildTreeData = (data: Category[]): CategoryTree[] =>
  data.map(item => ({
    id: item.id,
    title: item.name,
    key: item.id,
    children: item.children ? buildTreeData(item.children) : [],
  }));

const CategoryManagement: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryTree[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [pageSize] = useState(20);

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
  }, [search, pageSize]);

  const fetchHierarchy = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Category[] }>('/master-data/categories/hierarchy');
      setCategoryTree(buildTreeData(response.data));
    } catch (error) {
      message.error('Failed to fetch category hierarchy');
    }
  }, []);

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
      code: record.code,
      name: record.name,
      description: record.description,
      parentId: record.parentId,
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
        await apiService.post('/master-data/categories', values);
        message.success('Category created');
      }
      setModalVisible(false);
      fetchCategories(page);
      fetchHierarchy();
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/categories/${id}/activate`);
      message.success('Category activated');
      fetchCategories(page);
    } catch (error) {
      message.error('Failed to activate category');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/categories/${id}/deactivate`);
      message.success('Category deactivated');
      fetchCategories(page);
    } catch (error) {
      message.error('Failed to deactivate category');
    }
  };

  const columns: ColumnsType<Category> = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 140 },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 200 },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Parent Category', dataIndex: 'parentName', key: 'parentName', width: 160 },
    {
      title: 'Children', key: 'childCount', width: 100,
      render: (_, r) => r.childCount ?? r.children?.length ?? 0,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (s: string) => <Tag color={statusColorMap[s] || 'default'}>{s}</Tag>,
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
    <Card title="Category Management">
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Search categories..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ width: 250 }}
          allowClear
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Category</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={categories}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
          showSizeChanger: false,
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
      />

      <Modal
        title={editingCategory ? 'Edit Category' : 'Create Category'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={550}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Category Code" rules={[{ required: true }]}>
            <Input disabled={!!editingCategory} />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="parentId" label="Parent Category">
            <TreeSelect
              treeData={categoryTree}
              placeholder="Select parent category"
              allowClear
              treeDefaultExpandAll
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default CategoryManagement;
