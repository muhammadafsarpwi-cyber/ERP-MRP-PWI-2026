import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Space, Tag, Form, Input, Select, App, Card,
  Row, Col, DatePicker, Segmented, Tooltip,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, CheckOutlined, ReloadOutlined,
  InboxOutlined, ApartmentOutlined, ShopOutlined, GlobalOutlined,
  FileDoneOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { ERPLineItems, ERPLine, DraggableResizableModal } from '../../components/shared';

interface GoodsReceipt {
  id: string;
  receiptCode: string;
  poId?: string;
  poCode?: string;
  supplierId?: string;
  supplierName?: string;
  divisionId?: string;
  divisionName?: string;
  warehouseId?: string;
  warehouseName?: string;
  purchaseType?: string;
  receiptDate?: string;
  grnNumber?: string;
  deliveryNoteNumber?: string;
  status: string;
  notes?: string;
}

interface DivisionOption {
  id: string;
  code?: string;
  name: string;
}

const DEFAULT_DIVISIONS: DivisionOption[] = [
  { id: 'div-wd', code: 'WD', name: 'Wire Drawing Division' },
  { id: 'div-galv', code: 'GALV', name: 'Galvanizing Division' },
  { id: 'div-spk', code: 'SPK', name: 'Spoke Plant Division' },
  { id: 'div-ccd', code: 'CCD', name: 'Control Cable Division' },
  { id: 'div-nail', code: 'NAIL', name: 'Nail & Fastener Division' },
  { id: 'div-corp', code: 'CORP', name: 'Corporate & Master Store' },
];

const STATUS_OPTIONS = ['DRAFT', 'RECEIVED', 'INSPECTION', 'ACCEPTED', 'REJECTED', 'POSTED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default',
  RECEIVED: 'blue',
  INSPECTION: 'orange',
  ACCEPTED: 'green',
  REJECTED: 'red',
  POSTED: 'purple',
};

const GoodsReceiptManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');
  
  // Master lists
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string; warehouseType?: string; divisionId?: string }>>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>(DEFAULT_DIVISIONS);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [purchaseRequisitions, setPurchaseRequisitions] = useState<any[]>([]);

  // Watched form values
  const watchedDivisionId = Form.useWatch('divisionId', form);
  const watchedWarehouseId = Form.useWatch('warehouseId', form);
  const selectedWarehouse = warehouses.find((w) => w.id === watchedWarehouseId);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try {
        const p = JSON.parse(erpUser);
        if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId);
      } catch { /* ignore */ }
    }

    (async () => {
      // 1. Suppliers
      try {
        const s = await apiService.get<{ data: Array<{ id: string; name: string }> }>('/procurement/suppliers', { limit: 200 });
        setSuppliers(s.data || []);
      } catch { /* ignore */ }

      // 2. Warehouses
      try {
        const w = await apiService.get<any>('/organization/warehouses', { limit: 100 });
        const items = Array.isArray(w) ? w : w?.data?.items || w?.items || w?.data || [];
        setWarehouses(items);
      } catch { /* ignore */ }

      // 3. Divisions
      try {
        const d = await apiService.get<any>('/divisions', { limit: 50 });
        const divItems = Array.isArray(d) ? d : d?.data?.items || d?.data || [];
        if (divItems.length > 0) {
          setDivisions(divItems.map((x: any) => ({ id: x.id, code: x.divisionCode, name: x.name })));
        }
      } catch { /* keep DEFAULT_DIVISIONS */ }

      // 4. Purchase Orders for linking
      try {
        const poRes = await apiService.get<any>('/procurement/orders', { limit: 100 });
        const poList = poRes?.data || (Array.isArray(poRes) ? poRes : []);
        setPurchaseOrders(poList);
      } catch { /* ignore */ }

      // 5. Purchase Requisitions for linking
      try {
        const prRes = await apiService.get<any>('/procurement/requisitions', { limit: 100 });
        const prList = prRes?.data || (Array.isArray(prRes) ? prRes : []);
        setPurchaseRequisitions(prList);
      } catch { /* ignore */ }
    })();
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: GoodsReceipt[]; total: number }>('/procurement/receipts', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch goods receipts');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  // Compute auto-generated CGR receipt code (e.g. CGR-2026-0001)
  const generateReceiptCode = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const nextSeq = (total || data.length || 0) + 1;
    return `CGR-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
  }, [total, data.length]);

  const handleCreate = () => {
    form.resetFields();
    const autoCode = generateReceiptCode();
    form.setFieldsValue({
      receiptCode: autoCode,
      receiptDate: dayjs(),
      purchaseType: 'LOCAL',
    });
    setLineItems([]);
    setModalVisible(true);
  };

  // Handle PO / PR Selection and auto-populate all header and line item data
  const handleReferenceSelect = async (refKey: string) => {
    if (!refKey) return;
    const [type, id] = refKey.split(':');

    if (type === 'PO') {
      try {
        const po = await apiService.get<any>(`/procurement/orders/${id}`);
        const poData = po?.data || po;
        if (!poData) return;

        // Auto-fill header fields
        form.setFieldsValue({
          poId: poData.id,
          supplierId: poData.supplierId,
          divisionId: poData.divisionId,
          warehouseId: poData.warehouseId,
          notes: `Goods received against PO #${poData.poCode}`,
        });

        // Auto-populate line items from PO
        const linesSource = poData.items || poData.lines || [];
        const mappedLines: ERPLine[] = linesSource.map((pl: any, idx: number) => {
          const ordQty = Number(pl.quantity || pl.quantityOrdered || 0);
          const pSize = pl.packagingSize ? Number(pl.packagingSize) : (pl.item?.packagingSize ? Number(pl.item.packagingSize) : undefined);
          const pUnit = pl.packagingUnit || pl.item?.packagingUnit || (pl.item?.packagingType ? pl.item.packagingType.toLowerCase() : undefined);
          const pkgQty = pSize && pSize > 0 ? Math.round((ordQty / pSize) * 100) / 100 : undefined;

          return {
            id: `line-${idx + 1}-${Date.now()}`,
            poLineId: pl.id,
            itemId: pl.itemId || pl.item?.id,
            itemCode: pl.itemCode || pl.item?.itemCode,
            itemName: pl.itemName || pl.name || pl.item?.name,
            uomId: pl.uomId || pl.item?.baseUomId,
            uomCode: pl.uomCode || pl.uom?.code || pl.item?.purchaseUom?.code || pl.item?.baseUom?.code || 'PCS',
            orderQuantity: ordQty,
            quantity: ordQty, // Default to ordered quantity; user adjusts received quantity
            rate: Number(pl.unitPrice || pl.rate || 0),
            discountPercent: 0,
            taxPercent: 18,
            lineTotal: Number(pl.lineTotal || (ordQty * (pl.unitPrice || 0))),
            packagingSize: pSize,
            packagingUnit: pUnit,
            packageQuantity: pkgQty,
            salesOrderNumber: poData.poCode,
          };
        });

        setLineItems(mappedLines);
        message.success(`PO #${poData.poCode} loaded with ${mappedLines.length} item(s)`);
      } catch {
        message.error('Failed to load PO details');
      }
    } else if (type === 'PR') {
      try {
        const pr = await apiService.get<any>(`/procurement/requisitions/${id}`);
        const prData = pr?.data || pr;
        if (!prData) return;

        form.setFieldsValue({
          divisionId: prData.divisionId,
          warehouseId: prData.warehouseId,
          notes: `Goods received against PR #${prData.requisitionCode}`,
        });

        const linesSource = prData.lines || [];
        const mappedLines: ERPLine[] = linesSource.map((prl: any, idx: number) => {
          const ordQty = Number(prl.quantity || 0);
          return {
            id: `line-${idx + 1}-${Date.now()}`,
            itemId: prl.itemId,
            itemName: prl.description || prl.itemName,
            uomId: prl.uomId,
            uomCode: prl.uom?.code || 'PCS',
            orderQuantity: ordQty,
            quantity: ordQty,
            rate: Number(prl.unitPrice || 0),
            discountPercent: 0,
            taxPercent: 18,
            lineTotal: Number(prl.estimatedAmount || 0),
            salesOrderNumber: prData.requisitionCode,
          };
        });

        setLineItems(mappedLines);
        message.success(`PR #${prData.requisitionCode} loaded with ${mappedLines.length} item(s)`);
      } catch {
        message.error('Failed to load PR details');
      }
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one receipt line item');
        return;
      }
      setSubmitting(true);

      const payload = {
        companyId: companyId || values.companyId,
        receiptCode: values.receiptCode,
        poId: values.poId || undefined,
        supplierId: values.supplierId,
        warehouseId: values.warehouseId,
        divisionId: values.divisionId,
        purchaseType: values.purchaseType,
        receiptDate: values.receiptDate ? dayjs(values.receiptDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        grnNumber: values.grnNumber || undefined,
        deliveryNoteNumber: values.deliveryNoteNumber || undefined,
        notes: values.notes || undefined,
        lines: lineItems.map((l) => ({
          poLineId: l.poLineId || undefined,
          itemId: l.itemId,
          uomId: l.uomId,
          quantityOrdered: Number(l.orderQuantity || l.quantity || 0),
          quantityReceived: Number(l.quantity || 0),
          quantityAccepted: Number(l.quantity || 0),
          quantityRejected: 0,
          unitPrice: Number(l.rate || 0),
          conditionNotes: l.salesOrderNumber ? `Ref: ${l.salesOrderNumber}` : (l.itemName || l.itemCode),
        })),
      };

      await apiService.post('/procurement/receipts', payload);
      message.success(`Goods Receipt ${values.receiptCode} created successfully`);
      setModalVisible(false);
      fetchData(page);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : 'Failed to create goods receipt'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/receipts/${id}/${action}`);
      message.success(`Goods receipt marked as ${action}ed successfully`);
      fetchData(page);
    } catch {
      message.error(`Failed to ${action} goods receipt`);
    }
  };

  // Grouped options for PO and PR selector
  const referenceOptions = useMemo(() => {
    const poGroup = {
      label: <span>🛒 Approved Purchase Orders (PO)</span>,
      options: purchaseOrders.map((po) => ({
        value: `PO:${po.id}`,
        label: `${po.poCode} — ${po.supplier?.name || po.supplierName || 'Vendor'} (${dayjs(po.orderDate || po.createdAt).format('DD/MM/YYYY')})`,
      })),
    };

    const prGroup = {
      label: <span>📋 Purchase Requisitions (PR)</span>,
      options: purchaseRequisitions.map((pr) => ({
        value: `PR:${pr.id}`,
        label: `${pr.requisitionCode} — ${pr.title || pr.department || 'PR'} (${dayjs(pr.requestedDeliveryDate || pr.createdAt).format('DD/MM/YYYY')})`,
      })),
    };

    return [poGroup, prGroup];
  }, [purchaseOrders, purchaseRequisitions]);

  const columns: ColumnsType<GoodsReceipt> = [
    {
      title: 'Receipt Code',
      dataIndex: 'receiptCode',
      key: 'receiptCode',
      width: 140,
      render: (code) => <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#38bdf8' }}>{code}</span>,
    },
    {
      title: 'PO / PR',
      dataIndex: 'poCode',
      key: 'poCode',
      width: 130,
      render: (po) => po ? <Tag color="geekblue" style={{ fontWeight: 600 }}>{po}</Tag> : <span style={{ color: '#94a3b8' }}>—</span>,
    },
    {
      title: 'Supplier',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 180,
      render: (s) => <span style={{ fontWeight: 600 }}>{s || '—'}</span>,
    },
    {
      title: 'Date',
      dataIndex: 'receiptDate',
      key: 'receiptDate',
      width: 110,
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
    },
    {
      title: 'GRN Number',
      dataIndex: 'grnNumber',
      key: 'grnNumber',
      width: 120,
      render: (grn) => grn ? <Tag color="cyan">{grn}</Tag> : '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: string) => (
        <Space>
          <Tag color={statusColorMap[status] || 'default'} style={{ fontWeight: 700 }}>
            {status}
          </Tag>
          {status === 'POSTED' && <Tag color="purple">📦 Stock Posted</Tag>}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 260,
      render: (_, record) => (
        <Space size="small">
          {record.status === 'RECEIVED' && (
            <Button size="small" type="primary" onClick={() => handleAction(record.id, 'inspect')}>
              Inspect
            </Button>
          )}
          {record.status === 'INSPECTION' && (
            <>
              <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'accept')}>
                Accept
              </Button>
              <Button size="small" danger onClick={() => handleAction(record.id, 'reject')}>
                Reject
              </Button>
            </>
          )}
          {record.status === 'ACCEPTED' && (
            <Button size="small" type="primary" style={{ background: '#7c3aed', borderColor: '#7c3aed' }} onClick={() => handleAction(record.id, 'post')}>
              Post to Inventory
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <InboxOutlined style={{ fontSize: 20, color: '#38bdf8' }} />
          <span>Goods Receipts (Inbound GRN)</span>
        </div>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(page)}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ fontWeight: 600 }}>
            Create Goods Receipt
          </Button>
        </Space>
      }
    >
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input
            placeholder="Search receipts, POs, GRN..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => fetchData(1)}
            allowClear
          />
        </Col>
        <Col span={6}>
          <Select
            placeholder="Filter by status"
            allowClear
            style={{ width: '100%' }}
            value={filterStatus}
            onChange={setFilterStatus}
          >
            {STATUS_OPTIONS.map((s) => (
              <Select.Option key={s} value={s}>{s}</Select.Option>
            ))}
          </Select>
        </Col>
        <Col span={4}>
          <Button type="primary" onClick={() => fetchData(1)}>Search</Button>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, total, pageSize, onChange: setPage, showSizeChanger: false }}
      />

      {/* Upgraded Desktop Draggable & Resizable Modal */}
      <DraggableResizableModal
        title="Create Goods Receipt (CGR)"
        subtitle="🏬 Inbound stock reception with PO/PR verification, store stock balance & live order calculation"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={1120}
        height={760}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={submitting}
            onClick={handleSubmit}
            style={{ fontWeight: 600 }}
          >
            Create & Save Goods Receipt
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>
          <Form.Item name="poId" hidden><Input /></Form.Item>

          {/* Top Form Controls: Reference PO/PR, Code, Supplier, Origin */}
          <Card size="small" style={{ marginBottom: 14, background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item
                  name="receiptCode"
                  label={
                    <span style={{ fontWeight: 600 }}>
                      Receipt Code <Tag color="blue" style={{ marginLeft: 4 }}>Auto CGR</Tag>
                    </span>
                  }
                  rules={[{ required: true, message: 'Receipt code is required' }]}
                >
                  <Input placeholder="e.g. CGR-2026-0001" style={{ fontWeight: 700, fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>

              <Col span={8}>
                <Form.Item
                  label={
                    <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                      📋 Link PO / PR Reference
                      <Tooltip title="Select an existing Purchase Order or Purchase Requisition to automatically load ordered items, supplier, division, and track remaining balance.">
                        <InfoCircleOutlined style={{ marginLeft: 6 }} />
                      </Tooltip>
                    </span>
                  }
                >
                  <Select
                    showSearch
                    allowClear
                    placeholder="Search approved PO or PR..."
                    options={referenceOptions}
                    filterOption={(input, option) =>
                      String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                    }
                    onChange={handleReferenceSelect}
                  />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item
                  name="supplierId"
                  label={<span style={{ fontWeight: 600 }}>Supplier</span>}
                  rules={[{ required: true, message: 'Supplier is required' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select supplier..."
                    options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                  />
                </Form.Item>
              </Col>

              <Col span={4}>
                <Form.Item
                  name="purchaseType"
                  label={<span style={{ fontWeight: 600 }}><GlobalOutlined style={{ marginRight: 4 }} />Origin</span>}
                  initialValue="LOCAL"
                >
                  <Segmented
                    block
                    options={[
                      { label: 'Local', value: 'LOCAL' },
                      { label: 'Import', value: 'IMPORT' },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* Row 2: Division, Target Warehouse, GRN Number, Receipt Date */}
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item
                  name="divisionId"
                  label={
                    <span style={{ fontWeight: 600 }}>
                      <ApartmentOutlined style={{ marginRight: 4, color: '#10b981' }} />
                      Division
                    </span>
                  }
                  rules={[{ required: true, message: 'Please select division' }]}
                >
                  <Select
                    placeholder="Select division..."
                    options={divisions.map((d) => ({
                      value: d.id,
                      label: `${d.code ? `[${d.code}] ` : ''}${d.name}`,
                    }))}
                  />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item
                  name="warehouseId"
                  label={
                    <span style={{ fontWeight: 600 }}>
                      <ShopOutlined style={{ marginRight: 4, color: '#f59e0b' }} />
                      Target Warehouse / Store
                    </span>
                  }
                  rules={[{ required: true, message: 'Please select warehouse' }]}
                >
                  <Select
                    placeholder="Select warehouse..."
                    options={warehouses.map((w) => ({
                      value: w.id,
                      label: `${w.warehouseCode} — ${w.name}`,
                    }))}
                  />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item name="grnNumber" label={<span style={{ fontWeight: 600 }}>GRN Number</span>}>
                  <Input placeholder="e.g. GRN-001" />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item name="receiptDate" label={<span style={{ fontWeight: 600 }}>Receipt Date</span>}>
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Receipt Line Items Table with Live Inbound Calculation */}
          <ERPLineItems
            companyId={companyId}
            value={lineItems}
            onChange={setLineItems}
            context="purchase"
            isPurchasable={true}
            showWarehouse={false}
            divisionId={watchedDivisionId}
            warehouseId={watchedWarehouseId}
            warehouseType={selectedWarehouse?.warehouseType}
            label="Receipt Items"
            showAvailability={true}
          />

          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={24}>
              <Form.Item name="notes" label={<span style={{ fontWeight: 600 }}>Inspection & Receiving Notes</span>}>
                <Input.TextArea rows={2} placeholder="Add inspection observations, vehicle plate number, gate pass ref, or remarks..." />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </DraggableResizableModal>
    </Card>
  );
};

export default GoodsReceiptManagement;
