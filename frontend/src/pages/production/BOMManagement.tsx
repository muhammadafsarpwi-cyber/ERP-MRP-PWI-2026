import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, App, Card,
  InputNumber, Row, Col, Popconfirm, Tooltip, Typography, Divider, Spin,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined,
  SearchOutlined, DollarCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal, toNum } from '../../utils/numberFormat';
import { TabKeepAlive, GlobalLoading } from '../../components/shared';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';

interface BomLine {
  id?: string;
  lineNumber?: number;
  itemId: string;
  item?: { id?: string; name: string; itemCode: string; costPrice?: number | null; itemType?: string };
  itemName?: string;
  itemCode?: string;
  quantity: number;
  uomId: string;
  uom?: { id?: string; code: string; name?: string };
  uomCode?: string;
  scrapFactor: number;
  yieldPercentage: number;
  unitCost?: number;
  remarks?: string;
}

interface Bom {
  id: string;
  bomCode: string;
  name: string;
  description?: string;
  status: string;
  baseQuantity: number;
  productId: string;
  product?: { id?: string; name: string; itemCode: string; costPrice?: number | null; itemType?: string };
  productName?: string;
  productCode?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  estimatedCost: number;
  lines: BomLine[];
  createdAt: string;
  updatedAt: string;
}

interface Item {
  id: string;
  itemCode: string;
  name: string;
  itemType?: string;
  baseUomId?: string;
  baseUom?: { id: string; code: string; name?: string };
  costPrice?: number | null;
}

interface Uom {
  id: string;
  code: string;
  name: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  ACTIVE: 'green',
  OBSOLETE: 'red',
};

const BOM_TAB_ID = '/production/bom';

interface BomTabCache {
  boms: Bom[];
  search: string;
  filterStatus?: string;
}

const BomManagement: React.FC = () => {
  const { message } = App.useApp();
  const cachedTab = useMemo(() => tabSessionCache.get<BomTabCache>(BOM_TAB_ID), []);

  const [boms, setBoms] = useState<Bom[]>(() => cachedTab?.boms ?? []);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editingBom, setEditingBom] = useState<Bom | null>(null);
  const [selectedBom, setSelectedBom] = useState<Bom | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [form] = Form.useForm();
  const [search, setSearch] = useState<string>(() => cachedTab?.search ?? '');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(() => cachedTab?.filterStatus ?? undefined);

  // Live Watched values for BOM Cost calculation
  const watchedLines = Form.useWatch('lines', form) || [];
  const watchedBaseQty = Form.useWatch('baseQuantity', form) || 1;

  const costBreakdown = useMemo(() => {
    let totalMaterialCost = 0;
    const lineDetails = (watchedLines as any[]).map((l, idx) => {
      const it = items.find((i) => i.id === l?.itemId);
      const qty = toNum(l?.quantity || 0);
      const yieldPct = toNum(l?.yieldPercentage ?? 100);
      const unitCost = l?.unitCost !== undefined && l?.unitCost !== null && l?.unitCost !== ''
        ? toNum(l.unitCost)
        : toNum(it?.costPrice || 0);
      const effectiveYield = yieldPct > 0 ? yieldPct / 100 : 1;
      const effectiveQty = qty / effectiveYield;
      const lineCost = effectiveQty * unitCost;
      totalMaterialCost += lineCost;
      return {
        index: idx,
        item: it,
        qty,
        unitCost,
        effectiveQty,
        lineCost,
      };
    });

    const baseQty = toNum(watchedBaseQty) || 1;
    const costPerBaseUnit = baseQty > 0 ? totalMaterialCost / baseQty : 0;

    return {
      totalMaterialCost,
      costPerBaseUnit,
      lineDetails,
    };
  }, [watchedLines, watchedBaseQty, items]);

  const fetchBoms = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Bom[]; total: number }>('/bom');
      setBoms(response.data || []);

      // Seed all products and component items from all BOMs into items map so labels always resolve
      const itemsFromBoms: Item[] = [];
      (response.data || []).forEach((b) => {
        if (b.product && b.productId) {
          itemsFromBoms.push({
            id: b.productId,
            itemCode: b.product.itemCode || b.productCode || '',
            name: b.product.name || b.productName || 'Product',
            itemType: 'FINISHED_GOOD',
          });
        }
        b.lines?.forEach((l) => {
          if (l.itemId) {
            itemsFromBoms.push({
              id: l.itemId,
              itemCode: l.item?.itemCode || l.itemCode || '',
              name: l.item?.name || l.itemName || 'Component',
              baseUomId: l.uomId,
              costPrice: (l.item as any)?.costPrice,
            });
          }
        });
      });

      if (itemsFromBoms.length > 0) {
        setItems((prev) => {
          const map = new Map(prev.map((i) => [i.id, i]));
          itemsFromBoms.forEach((i) => {
            if (!map.has(i.id)) {
              map.set(i.id, i);
            }
          });
          return Array.from(map.values());
        });
      }

      tabSessionCache.set<BomTabCache>(BOM_TAB_ID, {
        boms: response.data,
        search,
        filterStatus,
      });
    } catch (error) {
      message.error('Failed to fetch BOMs');
    } finally {
      setLoading(false);
    }
  }, [message, search, filterStatus]);

  const fetchItems = useCallback(async () => {
    try {
      const lookupRes = await apiService.get<any>('/master-data/items/lookup');
      const lookupData: any[] = lookupRes?.data || (Array.isArray(lookupRes) ? lookupRes : []);
      if (lookupData.length > 0) {
        setItems((prev) => {
          const map = new Map(prev.map((it) => [it.id, it]));
          lookupData.forEach((i) => {
            map.set(i.id, {
              id: i.id,
              itemCode: i.itemCode || i.item_code || '',
              name: i.name || '',
              itemType: i.itemType || i.item_type || '',
              baseUomId: i.baseUomId || i.base_uom_id,
              baseUom: i.baseUom || (i.baseUomCode ? { id: i.baseUomId, code: i.baseUomCode, name: i.baseUomCode } : undefined),
              costPrice: i.costPrice !== undefined && i.costPrice !== null ? toNum(i.costPrice) : null,
            });
          });
          return Array.from(map.values());
        });
        return;
      }
    } catch {}

    try {
      const response = await apiService.get<{ data: any[]; total: number }>('/master-data/items', { limit: 1000 });
      if (response?.data) {
        setItems((prev) => {
          const map = new Map(prev.map((it) => [it.id, it]));
          response.data.forEach((i) => {
            map.set(i.id, {
              id: i.id,
              itemCode: i.itemCode || i.item_code || '',
              name: i.name || '',
              itemType: i.itemType || i.item_type || '',
              baseUomId: i.baseUomId || i.base_uom_id || i.baseUom?.id,
              baseUom: i.baseUom,
              costPrice: i.costPrice !== undefined && i.costPrice !== null ? toNum(i.costPrice) : null,
            });
          });
          return Array.from(map.values());
        });
      }
    } catch {}
  }, []);

  const handleSearchItems = useCallback((text: string) => {
    if (!text || text.trim().length === 0) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await apiService.get<{ data: any[]; total: number }>('/master-data/items', {
          search: text.trim(),
          limit: 100,
        });
        if (res?.data) {
          const newItems: Item[] = res.data.map((i) => ({
            id: i.id,
            itemCode: i.itemCode || i.item_code || '',
            name: i.name || '',
            itemType: i.itemType || i.item_type || '',
            baseUomId: i.baseUomId || i.base_uom_id || i.baseUom?.id,
            baseUom: i.baseUom,
            costPrice: i.costPrice !== undefined && i.costPrice !== null ? toNum(i.costPrice) : null,
          }));
          setItems((prev) => {
            const map = new Map(prev.map((it) => [it.id, it]));
            newItems.forEach((it) => map.set(it.id, it));
            return Array.from(map.values());
          });
        }
      } catch {}
      finally {
        setSearchLoading(false);
      }
    }, 300);
  }, []);

  const fetchUoms = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Uom[]; total: number }>('/master-data/uom', { limit: 200 });
      setUoms(response.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    // If the tab was already loaded in this session, DO NOT re-fetch when
    // returning to it — the cached rows are already seeded into state.
    if (tabSessionCache.has(BOM_TAB_ID)) return;
    void fetchBoms();
    void fetchItems();
    void fetchUoms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global header/tab refresh event listener
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(BOM_TAB_ID)) {
        tabSessionCache.remove(BOM_TAB_ID);
        void fetchBoms();
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchBoms]);

  const handleCreate = () => {
    setEditingBom(null);
    form.resetFields();
    form.setFieldsValue({
      baseQuantity: 1,
      lines: [{ quantity: 1, yieldPercentage: 100, scrapFactor: 0, unitCost: 0 }],
    });
    setModalVisible(true);
  };

  const handleEdit = (record: Bom) => {
    if (record.status !== 'DRAFT') {
      message.warning('Only DRAFT BOMs can be edited');
      return;
    }
    setEditingBom(record);

    // Merge existing BOM's product and line items into items state immediately so labels always show:
    const toAdd: Item[] = [];
    if (record.productId) {
      toAdd.push({
        id: record.productId,
        itemCode: record.product?.itemCode || record.productCode || '',
        name: record.product?.name || record.productName || 'Product Item',
        itemType: 'FINISHED_GOOD',
      });
    }
    record.lines?.forEach((l) => {
      if (l.itemId) {
        toAdd.push({
          id: l.itemId,
          itemCode: l.item?.itemCode || l.itemCode || '',
          name: l.item?.name || l.itemName || 'Component Item',
          baseUomId: l.uomId,
          costPrice: (l.item as any)?.costPrice,
        });
      }
    });

    if (toAdd.length > 0) {
      setItems((prev) => {
        const map = new Map(prev.map((i) => [i.id, i]));
        toAdd.forEach((i) => {
          const existing = map.get(i.id);
          if (!existing) {
            map.set(i.id, i);
          } else {
            map.set(i.id, {
              ...existing,
              itemCode: existing.itemCode || i.itemCode,
              name: existing.name || i.name,
              costPrice: existing.costPrice ?? i.costPrice,
            });
          }
        });
        return Array.from(map.values());
      });
    }

    form.setFieldsValue({
      name: record.name,
      description: record.description,
      baseQuantity: record.baseQuantity || 1,
      productId: record.productId,
      effectiveFrom: record.effectiveFrom,
      effectiveTo: record.effectiveTo,
      lines: record.lines?.map((l) => ({
        itemId: l.itemId,
        quantity: toNum(l.quantity),
        uomId: l.uomId,
        scrapFactor: toNum(l.scrapFactor || 0),
        yieldPercentage: toNum(l.yieldPercentage ?? 100),
        unitCost: toNum((l.item as any)?.costPrice || 0),
        remarks: l.remarks,
      })) || [],
    });
    setModalVisible(true);
  };

  const handleItemSelect = (itemId: string, lineIndex: number) => {
    const selectedItem = items.find((i) => i.id === itemId);
    if (!selectedItem) return;

    const currentLines = form.getFieldValue('lines') || [];
    const currentLine = currentLines[lineIndex] || {};

    const uomId = selectedItem.baseUomId || selectedItem.baseUom?.id || currentLine.uomId;
    const unitCost = selectedItem.costPrice !== undefined && selectedItem.costPrice !== null
      ? toNum(selectedItem.costPrice)
      : (currentLine.unitCost ?? 0);

    const updatedLine = {
      ...currentLine,
      itemId,
      uomId: uomId || currentLine.uomId,
      unitCost: unitCost || 0,
      yieldPercentage: currentLine.yieldPercentage ?? 100,
      scrapFactor: currentLine.scrapFactor ?? 0,
      quantity: currentLine.quantity ?? 1,
    };

    currentLines[lineIndex] = updatedLine;
    form.setFieldsValue({ lines: [...currentLines] });
  };

  const handleView = (record: Bom) => {
    setSelectedBom(record);
    setDetailVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/bom/${id}`);
      message.success('BOM deleted');
      fetchBoms();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to delete BOM');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiService.put(`/bom/${id}/status`, { status });
      message.success(`BOM status changed to ${status}`);
      fetchBoms();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to change status');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: any = {
        name: values.name,
        description: values.description,
        baseQuantity: values.baseQuantity || 1,
        productId: values.productId,
        effectiveFrom: values.effectiveFrom || undefined,
        effectiveTo: values.effectiveTo || undefined,
        lines: (values.lines || []).map((l: any) => ({
          itemId: l.itemId,
          quantity: toNum(l.quantity),
          uomId: l.uomId,
          scrapFactor: toNum(l.scrapFactor || 0),
          yieldPercentage: toNum(l.yieldPercentage ?? 100),
          remarks: l.remarks || undefined,
        })),
      };

      if (editingBom) {
        await apiService.put(`/bom/${editingBom.id}`, payload);
        message.success('BOM updated successfully');
      } else {
        await apiService.post('/bom', payload);
        message.success('BOM created successfully');
      }

      // If unit costs were entered/modified, sync them back to master data items
      (values.lines || []).forEach(async (l: any) => {
        if (l.itemId && l.unitCost !== undefined && l.unitCost !== null && Number(l.unitCost) > 0) {
          try {
            await apiService.patch(`/master-data/items/${l.itemId}`, { costPrice: toNum(l.unitCost) });
          } catch {}
        }
      });

      setModalVisible(false);
      form.resetFields();
      fetchBoms();
    } catch (error: any) {
      if (error?.response?.data?.message) {
        message.error(error.response.data.message);
      }
    }
  };

  const filteredBoms = boms.filter((b) => {
    const matchSearch = !search || b.bomCode.toLowerCase().includes(search.toLowerCase()) || b.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || b.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const columns: ColumnsType<Bom> = [
    {
      title: 'BOM Code',
      dataIndex: 'bomCode',
      key: 'bomCode',
      width: 120,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: 'Product',
      key: 'product',
      render: (_, r) => r.product ? `${r.product.itemCode} - ${r.product.name}` : (r.productCode ? `${r.productCode} - ${r.productName || ''}` : '-'),
    },
    {
      title: 'Lines',
      key: 'lines',
      width: 70,
      align: 'center',
      render: (_, r) => r.lines?.length || 0,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => <Tag color={STATUS_COLORS[status]}>{status}</Tag>,
    },
    {
      title: 'Est. Cost',
      dataIndex: 'estimatedCost',
      key: 'estimatedCost',
      width: 120,
      align: 'right',
      render: (val: any) => formatDecimal(val, 2),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="View"><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)} /></Tooltip>
          {record.status === 'DRAFT' && (
            <>
              <Tooltip title="Edit"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} /></Tooltip>
              <Popconfirm title="Delete this BOM?" onConfirm={() => handleDelete(record.id)}>
                <Button type="link" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          )}
          {record.status === 'DRAFT' && (
            <Button type="link" size="small" onClick={() => handleStatusChange(record.id, 'ACTIVE')}>Activate</Button>
          )}
          {record.status === 'ACTIVE' && (
            <Button type="link" size="small" danger onClick={() => handleStatusChange(record.id, 'OBSOLETE')}>Obsolete</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <TabKeepAlive
      tabId={BOM_TAB_ID}
      load={async () => { await fetchBoms(); await fetchItems(); await fetchUoms(); }}
      serialize={() => ({ boms, search, filterStatus })}
    >
      <div>
        <Card title="Bill of Materials" extra={
          <Space>
            <Input.Search placeholder="Search BOMs..." allowClear onSearch={setSearch} style={{ width: 200 }} />
            <Select placeholder="Status" allowClear style={{ width: 120 }} value={filterStatus} onChange={setFilterStatus}>
              <Select.Option value="DRAFT">Draft</Select.Option>
              <Select.Option value="ACTIVE">Active</Select.Option>
              <Select.Option value="OBSOLETE">Obsolete</Select.Option>
            </Select>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ fontWeight: 600 }}>New BOM</Button>
            <Button icon={<ReloadOutlined />} onClick={fetchBoms}>Refresh</Button>
          </Space>
        }>
          <div style={{ position: 'relative', minHeight: 340 }}>
            {loading && filteredBoms.length === 0 ? (
              <GlobalLoading
                title="Loading Bill of Materials..."
                subtitle="Retrieving all configured BOMs directly from database..."
                badgeText="LIVE DATABASE QUERY"
                minHeight={360}
              />
            ) : (
              <>
                {loading && (
                  <GlobalLoading
                    overlay
                    title="Refreshing Bill of Materials..."
                    subtitle="Updating component lines and cost estimates..."
                    badgeText="Instant Sync"
                  />
                )}
                <Table
                  columns={columns}
                  dataSource={filteredBoms}
                  rowKey="id"
                  loading={false}
                  pagination={{ pageSize: 20 }}
                />
              </>
            )}
          </div>
        </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>
              {editingBom ? `Edit Bill of Materials (${editingBom.bomCode})` : 'Create New Bill of Materials'}
            </span>
            {editingBom && <Tag color={STATUS_COLORS[editingBom.status]}>{editingBom.status}</Tag>}
          </div>
        }
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => { setModalVisible(false); form.resetFields(); }}
        width={1220}
        style={{ top: 20 }}
        destroyOnHidden
        okText={editingBom ? 'Save BOM Changes' : 'Create BOM'}
        cancelText="Cancel"
      >
        <Form form={form} layout="vertical">
          <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px 20px 4px 20px', marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="name" label={<span style={{ fontWeight: 600 }}>BOM Name</span>} rules={[{ required: true, message: 'BOM name is required' }]}>
                  <Input placeholder="e.g. 5mm 2P PVC or Bearing 6205 Assembly" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="productId" label={<span style={{ fontWeight: 600 }}>Product (Finished Good / Sub-Assembly)</span>} rules={[{ required: true, message: 'Finished good is required' }]}>
                  <Select
                    showSearch
                    placeholder="Search product by code, name, or type..."
                    filterOption={(input, opt) => (opt?.searchStr || opt?.label || '').toLowerCase().includes(input.toLowerCase())}
                    onSearch={handleSearchItems}
                    loading={searchLoading}
                    notFoundContent={searchLoading ? <Spin size="small" /> : 'No matching product'}
                    options={items.map((i) => ({
                      value: i.id,
                      label: `${i.itemCode ? `[${i.itemCode}] ` : ''}${i.name}`,
                      searchStr: `${i.itemCode} ${i.name} ${i.itemType || ''}`,
                      item: i,
                    }))}
                    optionRender={(option) => {
                      const it = (option.data as any)?.item;
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                          <div>
                            <span style={{ fontWeight: 600, color: '#1677ff', marginRight: 8 }}>{it?.itemCode || option.value}</span>
                            <span>{it?.name || ''}</span>
                          </div>
                          {it?.itemType && (
                            <Tag color={it.itemType === 'RAW_MATERIAL' ? 'gold' : it.itemType === 'FINISHED_GOOD' ? 'green' : 'blue'} style={{ fontSize: 10, margin: 0 }}>
                              {it.itemType}
                            </Tag>
                          )}
                        </div>
                      );
                    }}
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name="baseQuantity" label={<span style={{ fontWeight: 600 }}>Batch / Base Qty</span>} initialValue={1}>
                  <InputNumber min={0.0001} style={{ width: '100%' }} placeholder="1" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={24}>
                <Form.Item name="description" label={<span style={{ fontWeight: 600 }}>Description & Specifications</span>} style={{ marginBottom: 12 }}>
                  <Input.TextArea rows={2} placeholder="Optional production notes, technical specifications, or instructions..." />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* Live BOM Cost Summary Bar */}
          <div style={{
            background: 'linear-gradient(135deg, #f6ffed 0%, #e6f7ff 100%)',
            border: '1px solid #b7eb8f',
            borderRadius: 8,
            padding: '12px 20px',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Lines</Typography.Text>
                <Typography.Text strong style={{ fontSize: 16, color: '#262626' }}>{watchedLines?.length || 0} Components</Typography.Text>
              </div>
              <Divider type="vertical" style={{ height: 32 }} />
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>Batch Size</Typography.Text>
                <Typography.Text strong style={{ fontSize: 16, color: '#262626' }}>{toNum(watchedBaseQty || 1)} Units</Typography.Text>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ textAlign: 'right' }}>
                <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>Est. Total Material Cost</Typography.Text>
                <Typography.Text strong style={{ fontSize: 18, color: '#389e0d' }}>
                  ₨ {costBreakdown.totalMaterialCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography.Text>
              </div>
              <Divider type="vertical" style={{ height: 32 }} />
              <div style={{ textAlign: 'right' }}>
                <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>Est. Cost per Finished Unit</Typography.Text>
                <Typography.Text strong style={{ fontSize: 18, color: '#0958d9' }}>
                  ₨ {costBreakdown.costPerBaseUnit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography.Text>
              </div>
            </div>
          </div>

          <Divider orientation="left" style={{ margin: '8px 0 16px 0', fontSize: 15, fontWeight: 600 }}>
            Raw Material & Component Lines
          </Divider>

          {/* Component Table Header */}
          <div style={{
            background: '#fafafa',
            border: '1px solid #d9d9d9',
            borderRadius: '6px 6px 0 0',
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: '#595959',
          }}>
            <Row gutter={8} align="middle">
              <Col span={7}>Component Item (Raw Material / Consumable)</Col>
              <Col span={2} style={{ textAlign: 'right' }}>Qty Req.</Col>
              <Col span={3}>UOM</Col>
              <Col span={2} style={{ textAlign: 'right' }}>Yield %</Col>
              <Col span={2} style={{ textAlign: 'right' }}>Scrap %</Col>
              <Col span={3} style={{ textAlign: 'right' }}>Unit Cost (PKR)</Col>
              <Col span={2} style={{ textAlign: 'right' }}>Line Total</Col>
              <Col span={2}>Remarks</Col>
              <Col span={1} style={{ textAlign: 'center' }}></Col>
            </Row>
          </div>

          <div style={{
            border: '1px solid #d9d9d9',
            borderTop: 'none',
            borderRadius: '0 0 6px 6px',
            padding: '12px',
            marginBottom: 16,
            maxHeight: 340,
            overflowY: 'auto',
            background: '#fff',
          }}>
            <Form.List name="lines">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...rest }) => {
                    const currentLineCost = costBreakdown.lineDetails[name]?.lineCost || 0;
                    return (
                      <Row key={key} gutter={8} style={{ marginBottom: 10 }} align="middle">
                        <Col span={7}>
                          <Form.Item {...rest} name={[name, 'itemId']} rules={[{ required: true, message: 'Item required' }]} style={{ marginBottom: 0 }}>
                            <Select
                              showSearch
                              placeholder="Search RM, wire, code, name..."
                              filterOption={(input, opt) => (opt?.searchStr || opt?.label || '').toLowerCase().includes(input.toLowerCase())}
                              onSearch={handleSearchItems}
                              onChange={(val) => handleItemSelect(val, name)}
                              loading={searchLoading}
                              notFoundContent={searchLoading ? <Spin size="small" /> : 'Type to search items'}
                              options={items.map((i) => ({
                                value: i.id,
                                label: `${i.itemCode ? `[${i.itemCode}] ` : ''}${i.name}`,
                                searchStr: `${i.itemCode} ${i.name} ${i.itemType || ''} ${/^RAW_MATERIAL$/i.test(i.itemType || '') ? 'RM RAW' : ''}`,
                                item: i,
                              }))}
                              optionRender={(option) => {
                                const it = (option.data as any)?.item;
                                const isRm = it?.itemType === 'RAW_MATERIAL' || /^RM-/i.test(it?.itemCode || '');
                                return (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      <span style={{ fontWeight: 600, color: '#1677ff', marginRight: 6 }}>{it?.itemCode || option.value}</span>
                                      <span style={{ color: '#262626' }}>{it?.name || ''}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                                      {it?.costPrice ? (
                                        <span style={{ fontSize: 11, color: '#52c41a', background: '#f6ffed', padding: '1px 6px', borderRadius: 4, border: '1px solid #b7eb8f' }}>
                                          ₨ {Number(it.costPrice).toFixed(2)}
                                        </span>
                                      ) : null}
                                      <Tag color={isRm ? 'gold' : it?.itemType === 'SEMI_FINISHED' ? 'cyan' : it?.itemType === 'FINISHED_GOOD' ? 'green' : 'default'} style={{ margin: 0, fontSize: 10 }}>
                                        {isRm ? 'RAW' : (it?.itemType || 'ITEM')}
                                      </Tag>
                                    </div>
                                  </div>
                                );
                              }}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={2}>
                          <Form.Item {...rest} name={[name, 'quantity']} rules={[{ required: true }]} initialValue={1} style={{ marginBottom: 0 }}>
                            <InputNumber min={0.0001} style={{ width: '100%' }} placeholder="Qty" />
                          </Form.Item>
                        </Col>
                        <Col span={3}>
                          <Form.Item {...rest} name={[name, 'uomId']} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                            <Select
                              placeholder="UOM"
                              options={uoms.map((u) => ({ value: u.id, label: `${u.code} (${u.name})` }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={2}>
                          <Form.Item {...rest} name={[name, 'yieldPercentage']} initialValue={100} style={{ marginBottom: 0 }}>
                            <InputNumber min={1} max={100} style={{ width: '100%' }} placeholder="Yield %" />
                          </Form.Item>
                        </Col>
                        <Col span={2}>
                          <Form.Item {...rest} name={[name, 'scrapFactor']} initialValue={0} style={{ marginBottom: 0 }}>
                            <InputNumber min={0} max={1} step={0.01} style={{ width: '100%' }} placeholder="Scrap %" />
                          </Form.Item>
                        </Col>
                        <Col span={3}>
                          <Form.Item {...rest} name={[name, 'unitCost']} initialValue={0} style={{ marginBottom: 0 }}>
                            <InputNumber min={0} step={0.01} style={{ width: '100%' }} prefix="₨" placeholder="0.00" />
                          </Form.Item>
                        </Col>
                        <Col span={2}>
                          <div style={{
                            background: '#f6ffed',
                            border: '1px solid #d9f7be',
                            borderRadius: 4,
                            padding: '4px 6px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#389e0d',
                            fontSize: 12,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: '22px',
                          }}>
                            ₨ {currentLineCost.toFixed(2)}
                          </div>
                        </Col>
                        <Col span={2}>
                          <Form.Item {...rest} name={[name, 'remarks']} style={{ marginBottom: 0 }}>
                            <Input placeholder="Remarks" />
                          </Form.Item>
                        </Col>
                        <Col span={1} style={{ textAlign: 'center' }}>
                          {fields.length > 1 && (
                            <Tooltip title="Remove component line">
                              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                            </Tooltip>
                          )}
                        </Col>
                      </Row>
                    );
                  })}
                  <Button
                    type="dashed"
                    onClick={() => add({ quantity: 1, yieldPercentage: 100, scrapFactor: 0, unitCost: 0 })}
                    icon={<PlusOutlined />}
                    block
                    style={{ marginTop: 8, height: 38, borderColor: '#4096ff', color: '#1677ff', fontWeight: 600 }}
                  >
                    + Add Raw Material / Component Line
                  </Button>
                </>
              )}
            </Form.List>
          </div>
        </Form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        title={
          selectedBom ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>
                {`BOM ${selectedBom.bomCode} - ${selectedBom.name}`}
              </span>
              <Tag color={STATUS_COLORS[selectedBom.status]}>{selectedBom.status}</Tag>
            </div>
          ) : 'BOM Details'
        }
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            Close
          </Button>,
          selectedBom?.status === 'DRAFT' && (
            <Button
              key="edit"
              type="primary"
              icon={<EditOutlined />}
              onClick={() => {
                setDetailVisible(false);
                handleEdit(selectedBom);
              }}
            >
              Edit BOM
            </Button>
          ),
        ]}
        width={960}
      >
        {selectedBom && (() => {
          const prodItem = selectedBom.product || items.find((i) => i.id === selectedBom.productId);
          const prodDisplayName = prodItem
            ? `${prodItem.itemCode ? `[${prodItem.itemCode}] ` : ''}${prodItem.name}`
            : (selectedBom.productCode ? `[${selectedBom.productCode}] ${selectedBom.productName || ''}` : selectedBom.productId);

          return (
            <div>
              <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px', marginBottom: 16 }}>
                <Row gutter={16}>
                  <Col span={6}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>BOM Code</Typography.Text><br />
                    <Typography.Text strong style={{ fontSize: 15, color: '#1677ff' }}>{selectedBom.bomCode}</Typography.Text>
                  </Col>
                  <Col span={10}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Product (Finished Good)</Typography.Text><br />
                    <Typography.Text strong style={{ fontSize: 14 }}>{prodDisplayName}</Typography.Text>
                  </Col>
                  <Col span={4}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Base Quantity</Typography.Text><br />
                    <Typography.Text strong>{formatDecimal(selectedBom.baseQuantity, 0)} Units</Typography.Text>
                  </Col>
                  <Col span={4}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Est. Unit Cost</Typography.Text><br />
                    <Typography.Text strong style={{ fontSize: 16, color: '#389e0d' }}>
                      ₨ {formatDecimal(selectedBom.estimatedCost, 2)}
                    </Typography.Text>
                  </Col>
                </Row>
                {selectedBom.description && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Description & Notes</Typography.Text><br />
                    <Typography.Text>{selectedBom.description}</Typography.Text>
                  </div>
                )}
              </div>

              <Divider orientation="left" style={{ margin: '12px 0 16px 0', fontSize: 14, fontWeight: 600 }}>
                Component Lines ({selectedBom.lines?.length || 0})
              </Divider>

              <Table
                dataSource={selectedBom.lines || []}
                rowKey="id"
                pagination={false}
                size="middle"
                columns={[
                  { title: '#', dataIndex: 'lineNumber', width: 45, align: 'center' },
                  {
                    title: 'Item Code & Name',
                    key: 'item',
                    render: (_, r) => {
                      const it = r.item || items.find((i) => i.id === r.itemId);
                      const code = it?.itemCode || r.itemCode;
                      const name = it?.name || r.itemName || '';
                      const isRm = it?.itemType === 'RAW_MATERIAL' || /^RM-/i.test(code || '');
                      return (
                        <div>
                          {code && <Tag color={isRm ? 'gold' : 'blue'} style={{ marginRight: 6 }}>{code}</Tag>}
                          <Typography.Text strong={!!code}>{name || r.itemId}</Typography.Text>
                        </div>
                      );
                    },
                  },
                  { title: 'Qty', dataIndex: 'quantity', width: 80, align: 'right', render: (v: any) => formatDecimal(v, 2) },
                  { title: 'UOM', key: 'uom', width: 80, render: (_, r) => r.uom?.code || r.uomCode || '-' },
                  { title: 'Scrap %', dataIndex: 'scrapFactor', width: 85, align: 'right', render: (v: any) => `${toNum(v) * 100}%` },
                  { title: 'Yield %', dataIndex: 'yieldPercentage', width: 85, align: 'right', render: (v: any) => `${toNum(v)}%` },
                  {
                    title: 'Est. Unit Cost',
                    key: 'unitCost',
                    width: 110,
                    align: 'right',
                    render: (_, r) => {
                      const cost = (r.item as any)?.costPrice ?? r.unitCost;
                      return cost ? `₨ ${toNum(cost).toFixed(2)}` : '-';
                    },
                  },
                  {
                    title: 'Line Cost',
                    key: 'lineCost',
                    width: 110,
                    align: 'right',
                    render: (_, r) => {
                      const cost = toNum((r.item as any)?.costPrice ?? r.unitCost ?? 0);
                      const qty = toNum(r.quantity);
                      const yieldPct = toNum(r.yieldPercentage ?? 100);
                      const effQty = yieldPct > 0 ? qty / (yieldPct / 100) : qty;
                      const total = effQty * cost;
                      return total > 0 ? (
                        <span style={{ fontWeight: 600, color: '#389e0d' }}>₨ {total.toFixed(2)}</span>
                      ) : '-';
                    },
                  },
                  { title: 'Remarks', dataIndex: 'remarks', ellipsis: true },
                ]}
              />
            </div>
          );
        })()}
      </Modal>
    </div>
  </TabKeepAlive>
  );
};

export default BomManagement;
