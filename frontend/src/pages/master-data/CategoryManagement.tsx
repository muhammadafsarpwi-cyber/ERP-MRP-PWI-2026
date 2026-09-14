import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  App, Table, Button, Modal, Form, Input, Popconfirm, TreeSelect, Tag, Checkbox, Dropdown,
} from 'antd';
import { PlusOutlined, TagsOutlined, AppstoreOutlined, CheckCircleOutlined, MinusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import apiService from '../../services/api';
import { PageHeader, StatusBadge, PageToolbar, TableActions, DraggableResizableModal } from '../../components/shared';

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

// ─── Category Column Visibility Constants ──────────────────────────────────
const DEFAULT_CATEGORY_COLUMNS: Record<string, boolean> = {
  level: true,
  categoryCode: true,
  name: true,
  description: true,
  parentName: true,
  childCount: true,
  usageCount: true,
  status: true,
  actions: true,
};

const CATEGORY_COLUMN_LABELS: Record<string, string> = {
  level: 'Level',
  categoryCode: 'Code',
  name: 'Name',
  description: 'Description',
  parentName: 'Parent Category',
  childCount: 'Children',
  usageCount: 'Items',
  status: 'Status',
  actions: 'Actions',
};

const CATEGORY_STATUS_CHEVRONS = [
  { key: 'ALL', label: 'ALL CATEGORIES', color: '#334155', activeBg: '#1e293b', icon: <AppstoreOutlined /> },
  { key: 'ACTIVE', label: 'ACTIVE', color: '#16a34a', activeBg: '#15803d', icon: <CheckCircleOutlined /> },
  { key: 'INACTIVE', label: 'INACTIVE', color: '#64748b', activeBg: '#475569', icon: <MinusOutlined /> },
];

const CategoryStatusChevronRibbon: React.FC<{
  counts: { all: number; active: number; inactive: number };
  activeKey: string;
  onSelect: (key: string) => void;
}> = ({ counts, activeKey, onSelect }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        overflowX: 'auto',
        padding: '2px 2px 8px 2px',
        marginBottom: 10,
        scrollbarWidth: 'thin',
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.08))',
      }}
    >
      {CATEGORY_STATUS_CHEVRONS.map((ch, idx) => {
        const isSelected = activeKey === ch.key;
        const isFirst = idx === 0;
        const isLast = idx === CATEGORY_STATUS_CHEVRONS.length - 1;
        const count = ch.key === 'ALL' ? counts.all : ch.key === 'ACTIVE' ? counts.active : counts.inactive;

        const clipPath = isFirst
          ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
          : isLast
          ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
          : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)';

        return (
          <button
            key={ch.key}
            type="button"
            onClick={() => onSelect(ch.key)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: isFirst
                ? '10px 22px 10px 16px'
                : isLast
                ? '10px 18px 10px 24px'
                : '10px 20px 10px 24px',
              marginLeft: isFirst ? 0 : -6,
              zIndex: isSelected ? 12 : CATEGORY_STATUS_CHEVRONS.length - idx,
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: '0.4px',
              color: '#ffffff',
              background: isSelected ? ch.activeBg : ch.color,
              border: 'none',
              clipPath,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flex: '1 0 auto',
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isSelected ? '0 0 0 2px #ffffff, 0 4px 14px rgba(0,0,0,0.35)' : undefined,
              transform: isSelected ? 'scale(1.025) translateY(-1px)' : 'none',
              opacity: isSelected ? 1 : 0.93,
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.opacity = '0.93';
                e.currentTarget.style.transform = 'none';
              }
            }}
          >
            <span style={{ fontSize: 13, display: 'flex', alignItems: 'center' }}>{ch.icon}</span>
            <span>{ch.label}</span>
            <span
              style={{
                display: 'inline-block',
                background: 'rgba(255, 255, 255, 0.25)',
                borderRadius: 10,
                padding: '1px 7px',
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: 0,
                marginLeft: 2,
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

const CategoryManagement: React.FC = () => {
  const { message } = App.useApp();
  const [roots, setRoots] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [isModalMinimized, setIsModalMinimized] = useState(false);
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

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('pwi_category_table_columns_v1');
      if (saved) return { ...DEFAULT_CATEGORY_COLUMNS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_CATEGORY_COLUMNS;
  });

  const categoryCounts = useMemo(() => {
    let act = 0;
    let inact = 0;
    const walk = (list: Category[]) => {
      list.forEach((c) => {
        if (c.status === 'ACTIVE') act++;
        else inact++;
        if (c.children?.length) walk(c.children);
      });
    };
    walk(roots);
    return { all: act + inact, active: act, inactive: inact };
  }, [roots]);

  const total = useMemo(() => countAll(roots), [roots]);

  const dataSource = useMemo(() => {
    const list = filterTree(roots, search);
    if (statusFilter === 'ALL') return list;
    const walk = (nodes: Category[]): Category[] => {
      return nodes.reduce<Category[]>((acc, node) => {
        const matchingChildren = walk(node.children || []);
        if (node.status === statusFilter || matchingChildren.length > 0) {
          acc.push({ ...node, children: matchingChildren });
        }
        return acc;
      }, []);
    };
    return walk(list);
  }, [roots, search, statusFilter]);

  const parentTree = useMemo(() => {
    const excluded = editingCategory ? new Set(collectIds(editingCategory)) : new Set<string>();
    return buildParentTree(roots, excluded);
  }, [roots, editingCategory]);

  const handleCreate = () => {
    setIsModalMinimized(false);
    setEditingCategory(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Category) => {
    setIsModalMinimized(false);
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
      setIsModalMinimized(false);
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

  const filteredColumns = useMemo(() => {
    return columns.filter((col) => {
      const key = String(col.key || (col as any).dataIndex || '');
      if (key === 'actions' || key === 'name') return true;
      return visibleCols[key] !== false;
    });
  }, [columns, visibleCols]);

  return (
    <div className="erp-dashboard">
      <PageHeader
        icon={<TagsOutlined />}
        title="Item Categories"
        subtitle={`Category hierarchy · ${total} categories · level 0 = root, 1 = child, 2 = sub-child`}
        showBreadcrumbs
      />

      {/* 2027 Category Status Chevron Ribbon (Machine Master style) */}
      <CategoryStatusChevronRibbon
        counts={categoryCounts}
        activeKey={statusFilter}
        onSelect={(k) => setStatusFilter(k as any)}
      />

      <PageToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search categories..."
        extra={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              dropdownRender={() => (
                <div
                  style={{
                    background: '#ffffff',
                    padding: '12px 16px',
                    borderRadius: 8,
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
                    minWidth: 180,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 10,
                      paddingBottom: 8,
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                      Table Columns
                    </span>
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0, height: 'auto', fontSize: 11 }}
                      onClick={() => {
                        setVisibleCols(DEFAULT_CATEGORY_COLUMNS);
                        try { localStorage.removeItem('pwi_category_table_columns_v1'); } catch {}
                      }}
                    >
                      Reset All
                    </Button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(CATEGORY_COLUMN_LABELS).map(([key, label]) => (
                      <Checkbox
                        key={key}
                        checked={visibleCols[key] !== false}
                        disabled={key === 'name' || key === 'actions'}
                        onChange={(e) => {
                          const next = { ...visibleCols, [key]: e.target.checked };
                          setVisibleCols(next);
                          try { localStorage.setItem('pwi_category_table_columns_v1', JSON.stringify(next)); } catch {}
                        }}
                        style={{ fontSize: 13, color: '#334155' }}
                      >
                        {label}
                      </Checkbox>
                    ))}
                  </div>
                </div>
              )}
            >
              <Button icon={<AppstoreOutlined />} style={{ fontWeight: 600 }}>
                Columns
              </Button>
            </Dropdown>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Category</Button>
          </div>
        }
      />

      <Table<Category>
        className="erp-table"
        rowKey="id"
        loading={loading}
        dataSource={dataSource}
        columns={filteredColumns}
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

      <DraggableResizableModal
        title={editingCategory ? `Edit Category — ${editingCategory.categoryCode}` : 'Add Category'}
        open={modalVisible && !isModalMinimized}
        onOk={handleSubmit}
        confirmLoading={saving}
        onCancel={() => { setModalVisible(false); setIsModalMinimized(false); }}
        onMinimize={() => setIsModalMinimized(true)}
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
      </DraggableResizableModal>

      {/* Universal Floating Minimized Dock for Category Management */}
      {isModalMinimized && (
        <div className="erp-minimized-dock" data-testid="category-minimized-dock">
          <div
            className="erp-minimized-tab"
            onClick={() => setIsModalMinimized(false)}
            role="button"
            tabIndex={0}
            title="Click to restore Category Form"
          >
            <div className="erp-minimized-pulse" />
            <TagsOutlined style={{ color: '#10b981', fontSize: 15 }} />
            <span><strong>{editingCategory ? `Edit: ${editingCategory.categoryCode}` : 'New Category'}</strong></span>
            <span
              className="erp-minimized-close"
              onClick={(e) => {
                e.stopPropagation();
                setIsModalMinimized(false);
                setModalVisible(false);
              }}
              title="Close form"
            >
              ×
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryManagement;