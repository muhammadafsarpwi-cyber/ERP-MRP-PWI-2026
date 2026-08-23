import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Row, Col, Form, Select, DatePicker, Input, InputNumber, Button, Space,
  message, Typography, Divider, Switch, Alert, Spin, AutoComplete,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, LockOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { toNum } from '../../../utils/numberFormat';
import { useLookups } from './lookups';

const { Title, Text } = Typography;

interface WarehouseLk { id: string; name: string; warehouseCode: string; }
interface OrderOperation { id: string; sequenceNo: number; departmentId: string | null; operationName?: string; name?: string; }
interface OrderDetail {
  id: string; orderNumber: string; productId: string; uomId: string;
  operations: OrderOperation[];
}
interface EntryDetailData {
  id: string;
  entryDate: string;
  divisionId: string; sectionId: string; departmentId: string;
  shiftId: string; machineId: string | null; machineNo: string;
  operatorName: string; supervisorName: string | null; coilSize: string | null;
  itemId: string; uomId: string;
  targetQuantity: number | string; actualQuantity: number | string;
  runningHours: number | string; downtimeHours: number | string;
  downtimeReasonId: string | null; scrapQuantity: number | string;
  remarks: string | null;
  productionOrderId: string | null; productionOrderOperationId: string | null;
  postToInventory: boolean; warehouseId: string | null; inventoryReferenceId: string | null;
}

const EntryForm: React.FC<{ mode: 'create' | 'edit' }> = ({ mode }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const lookups = useLookups();

  const [warehouses, setWarehouses] = useState<WarehouseLk[]>([]);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);

  // Machine pre-selected on the availability screen (Step 1): context is locked
  // so the operator cannot drift into a duplicate date/shift/machine combination.
  const qMachineId = mode === 'create' ? searchParams.get('machineId') : null;
  const lockedContext = !!qMachineId;

  // watched values
  const divisionId = Form.useWatch('divisionId', form);
  const sectionId = Form.useWatch('sectionId', form);
  const departmentId = Form.useWatch('departmentId', form);
  const itemId = Form.useWatch('itemId', form);
  const uomId = Form.useWatch('uomId', form);
  const targetQty = Form.useWatch('targetQuantity', form);
  const actualQty = Form.useWatch('actualQuantity', form);
  const runningHours = Form.useWatch('runningHours', form);
  const downtimeHours = Form.useWatch('downtimeHours', form);
  const productionOrderId = Form.useWatch('productionOrderId', form);
  const postToInventory = Form.useWatch('postToInventory', form);
  const shiftId = Form.useWatch('shiftId', form);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiService.get<{ data: WarehouseLk[] }>('/warehouses', { limit: 100 });
        setWarehouses(res.data || []);
      } catch { /* non-critical */ }
      if (mode === 'create') {
        void lookups.loadMachines(searchParams.get('departmentId') || undefined);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill the locked context coming from the machine-selection step
  useEffect(() => {
    if (mode !== 'create') return;
    const patch: Record<string, unknown> = {};
    const qDate = searchParams.get('entryDate');
    const qShift = searchParams.get('shiftId');
    const qDivision = searchParams.get('divisionId');
    const qSection = searchParams.get('sectionId');
    const qDepartment = searchParams.get('departmentId');
    if (qDate) patch.entryDate = dayjs(qDate);
    if (qShift) patch.shiftId = qShift;
    if (qDivision) patch.divisionId = qDivision;
    if (qSection) patch.sectionId = qSection;
    if (qDepartment) patch.departmentId = qDepartment;
    if (Object.keys(patch).length > 0) form.setFieldsValue(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve the pre-selected machine's code once its department list is loaded
  useEffect(() => {
    if (!lockedContext || lookups.machines.length === 0) return;
    const m = lookups.machines.find((x) => x.id === qMachineId);
    if (m && form.getFieldValue('machineNo') !== m.machineCode) {
      form.setFieldValue('machineNo', m.machineCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookups.machines]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setLoadingEntry(true);
      try {
        const res = await apiService.get<{ success: boolean } & { data: EntryDetailData & { productionOrder?: { id: string; orderNumber: string } } }>(`/production/entries/${id}`);
        const e = res.data;
        void lookups.loadMachines(e.departmentId);
        if (e.productionOrderId) {
          try {
            const od = await apiService.get<OrderDetail>(`/production/orders/${e.productionOrderId}`);
            setOrderDetail(od);
          } catch { /* order may be inaccessible */ }
        }
        form.setFieldsValue({
          ...e,
          entryDate: dayjs(e.entryDate),
          targetQuantity: toNum(e.targetQuantity),
          actualQuantity: toNum(e.actualQuantity),
          runningHours: toNum(e.runningHours),
          downtimeHours: toNum(e.downtimeHours),
          scrapQuantity: toNum(e.scrapQuantity),
          postToInventory: !!e.inventoryReferenceId,
          warehouseId: e.warehouseId ?? undefined,
          productionOrderId: e.productionOrderId ?? undefined,
          productionOrderOperationId: e.productionOrderOperationId ?? undefined,
          shiftId: e.shiftId ?? undefined,
          downtimeReasonId: e.downtimeReasonId ?? undefined,
          supervisorName: e.supervisorName ?? undefined,
          coilSize: e.coilSize ?? undefined,
          remarks: e.remarks ?? undefined,
        });
      } catch {
        message.error('Failed to load production entry');
      } finally {
        setLoadingEntry(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (mode === 'create' && departmentId) {
      void lookups.loadMachines(departmentId as string);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  // default UOM from item
  useEffect(() => {
    if (!itemId || !mode || mode !== 'create') return;
    const item = lookups.items.find((i) => i.id === itemId);
    if (item?.baseUomId) form.setFieldValue('uomId', item.baseUomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const loadOrderOperations = async (orderId: string) => {
    setOrderDetail(null);
    if (!orderId) return;
    try {
      const od = await apiService.get<OrderDetail>(`/production/orders/${orderId}`);
      setOrderDetail(od);
      form.setFieldValue('uomId', od.uomId || undefined);
    } catch {
      message.warning('Could not load order details');
    }
  };

  const achievement = useMemo(() => {
    const t = toNum(targetQty); const a = toNum(actualQty);
    return t > 0 ? Math.round((a / t) * 10000) / 100 : null;
  }, [targetQty, actualQty]);

  const efficiency = useMemo(() => {
    const run = toNum(runningHours); const down = toNum(downtimeHours);
    const shift = lookups.shifts.find((s) => s.id === shiftId);
    const planned = toNum(shift?.plannedHours, 0);
    if (planned > 0) return Math.round((run / planned) * 10000) / 100;
    const denom = run + down;
    return denom > 0 ? Math.round((run / denom) * 10000) / 100 : null;
  }, [runningHours, downtimeHours, shiftId, lookups.shifts]);

  const validUoms = useMemo(() => lookups.validUomsForItem(itemId as string | undefined), [lookups.items, lookups.uoms, lookups.uomConversions, itemId]); // eslint-disable-line

  const onFinish = useCallback(async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...values };
      payload.entryDate = values.entryDate ? (values.entryDate as dayjs.Dayjs).format('YYYY-MM-DD') : undefined;
      delete payload.__computed;
      // allowClear on the reason Select yields undefined; send null so clearing persists
      payload.downtimeReasonId = (values.downtimeReasonId as string | undefined) ?? null;
      if (payload.productionOrderId === undefined) delete payload.productionOrderId;
      if (payload.productionOrderOperationId === undefined) delete payload.productionOrderOperationId;

      if (mode === 'create') {
        const res = await apiService.post<{ success: boolean; data: { id: string; machineNo?: string } }>('/production/entries', payload);
        message.success(`Production entry ${res.data?.machineNo ? `for ${res.data.machineNo}` : ''} saved`);
        if (lockedContext) {
          // Return to the availability screen so the operator sees this machine
          // flip from "Entry Required" to "Already Entered" immediately.
          const qs = new URLSearchParams();
          qs.set('entryDate', String(payload.entryDate ?? ''));
          qs.set('shiftId', String(payload.shiftId ?? ''));
          qs.set('divisionId', String(payload.divisionId ?? ''));
          qs.set('sectionId', String(payload.sectionId ?? ''));
          qs.set('departmentId', String(payload.departmentId ?? ''));
          navigate(`/production/entries/select?${qs.toString()}`);
        } else {
          navigate(`/production/entries/${res.data.id}`);
        }
      } else if (id) {
        await apiService.put(`/production/entries/${id}`, payload);
        message.success('Production entry updated');
        navigate(`/production/entries/${id}`);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string | string[] } } };
      const msg = Array.isArray(axiosErr.response?.data?.message)
        ? axiosErr.response!.data!.message!.join(', ')
        : axiosErr.response?.data?.message ?? 'Failed to save entry';
      message.error(String(msg));
    } finally {
      setSaving(false);
    }
  }, [mode, id, navigate, lockedContext]);

  const changeSelection = () => {
    const qs = new URLSearchParams();
    const d = form.getFieldValue('entryDate') as dayjs.Dayjs | undefined;
    if (d) qs.set('entryDate', d.format('YYYY-MM-DD'));
    if (shiftId) qs.set('shiftId', shiftId);
    if (divisionId) qs.set('divisionId', divisionId);
    if (sectionId) qs.set('sectionId', sectionId);
    if (departmentId) qs.set('departmentId', departmentId);
    const s = qs.toString();
    navigate(`/production/entries/select${s ? `?${s}` : ''}`);
  };

  const sectionsFiltered = lookups.sectionsForDivision(divisionId);
  const departmentsFiltered = lookups.departmentsForSection(sectionId);
  const machinesForDept = departmentId ? lookups.machines.filter((m) => m.departmentId === departmentId) : [];
  const operationsForOrder = (orderDetail?.operations || []).filter(
    (op) => !departmentId || !op.departmentId || op.departmentId === departmentId,
  );
  const linkedOrder = lookups.productionOrders.find((o) => o.id === productionOrderId);
  const orderMismatch = linkedOrder && itemId && linkedOrder.productId !== itemId;

  if (loadingEntry) {
    return <Card><Spin tip="Loading entry..." style={{ width: '100%', marginTop: 80 }} /></Card>;
  }

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/production/entries')}>Back</Button>
        <Title level={4} style={{ margin: 0 }}>
          {mode === 'create' ? 'New Production Entry' : 'Edit Production Entry'}
        </Title>
      </Space>

      <Form form={form} layout="vertical" onFinish={onFinish} autoComplete="off">
        <Row gutter={16}>
          <Col span={8}>
            <Card title="Department Context" size="small">
              {lockedContext && (
                <Alert
                  type="success" showIcon icon={<LockOutlined />} style={{ marginBottom: 12 }}
                  message="Machine verified available for this date & shift"
                  description={
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Context was locked by the machine-selection step, so a duplicate entry for this
                        date / shift / machine cannot be created here.
                      </Text>
                      <Button size="small" onClick={changeSelection}>Change Selection</Button>
                    </Space>
                  }
                />
              )}
              <Form.Item name="divisionId" label="Division" rules={[{ required: true, message: 'Division is required' }]}>
                <Select
                  showSearch optionFilterProp="label" placeholder="Select Division"
                  disabled={lockedContext}
                  options={lookups.divisions.map((d) => ({ value: d.id, label: `${d.divisionCode} — ${d.name}` }))}
                  onChange={() => { form.setFieldsValue({ sectionId: undefined, departmentId: undefined }); }}
                />
              </Form.Item>
              <Form.Item name="sectionId" label="Section" rules={[{ required: true, message: 'Section is required' }]}>
                <Select
                  showSearch optionFilterProp="label" placeholder="Select Section"
                  disabled={!divisionId || lockedContext}
                  options={sectionsFiltered.map((s) => ({ value: s.id, label: s.name }))}
                  onChange={() => { form.setFieldsValue({ departmentId: undefined }); }}
                />
              </Form.Item>
              <Form.Item name="departmentId" label="Department" rules={[{ required: true, message: 'Department is required' }]}>
                <Select
                  showSearch optionFilterProp="label" placeholder="Select Department"
                  disabled={!sectionId || lockedContext}
                  options={departmentsFiltered.map((d) => ({ value: d.id, label: d.name }))}
                />
              </Form.Item>
              <Form.Item name="entryDate" label="Date" initialValue={dayjs()} rules={[{ required: true, message: 'Date is required' }]}>
                <DatePicker style={{ width: '100%' }} disabled={lockedContext} />
              </Form.Item>
            </Card>

            <Card title="Production Order Linkage (optional)" size="small" style={{ marginTop: 16 }}>
              <Alert
                type="info" showIcon style={{ marginBottom: 12 }}
                message="Link an order to track output against it. Do NOT also enable direct inventory posting — order completion posts stock once."
              />
              <Form.Item name="productionOrderId" label="Production Order No.">
                <Select
                  allowClear showSearch optionFilterProp="label" placeholder="None"
                  options={lookups.productionOrders.map((o) => ({ value: o.id, label: `${o.orderNumber}` }))}
                  onChange={(v) => { setOrderDetail(null); form.setFieldValue('productionOrderOperationId', undefined); void loadOrderOperations(v); }}
                />
              </Form.Item>
              <Form.Item
                name="productionOrderOperationId"
                label="Operation"
                dependencies={['productionOrderId']}
                rules={[({ getFieldValue }) => ({
                  validator: (_r, v) =>
                    !getFieldValue('productionOrderId') || v
                      ? Promise.resolve()
                      : Promise.reject(new Error('Operation is required when an order is linked')),
                })]}
              >
                <Select
                  allowClear placeholder={productionOrderId ? 'Select Operation' : '—'}
                  disabled={!productionOrderId}
                  options={(operationsForOrder as OrderOperation[]).map((op) => ({
                    value: op.id,
                    label: `#${op.sequenceNo} — ${op.operationName || op.name || 'Operation'}`,
                  }))}
                />
              </Form.Item>
              {orderMismatch && (
                <Alert type="error" showIcon message="Selected item differs from this order's product. Save will be rejected." />
              )}
              <Form.Item name="postToInventory" label="Post Directly to Inventory (make-to-stock)" valuePropName="checked">
                <Switch disabled={!!productionOrderId} />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(p, c) => p.postToInventory !== c.postToInventory}
              >
                {({ getFieldValue }) =>
                  getFieldValue('postToInventory') ? (
                    <Form.Item
                      name="warehouseId"
                      label="Receipt Warehouse"
                      rules={[{ required: true, message: 'Warehouse is required for direct posting' }]}
                      style={{ marginTop: -12 }}
                    >
                      <Select
                        allowClear showSearch optionFilterProp="label" placeholder="Select Warehouse"
                        options={warehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))}
                      />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </Card>
          </Col>

          <Col span={8}>
            <Card title="Machine & Manpower" size="small">
              <Form.Item name="shiftId" label="Shift" rules={[{ required: true, message: 'Shift is required' }]}>
                <Select
                  showSearch optionFilterProp="label" placeholder="Select Shift"
                  disabled={lockedContext}
                  options={lookups.shifts.map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.startTime ?? ''}–${s.endTime ?? ''}) · planned ${s.plannedHours}h`,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="machineNo"
                label="Machine No."
                rules={[{ required: true, message: 'Machine No. is required' }]}
              >
                <AutoComplete
                  options={machinesForDept.map((m) => ({ value: m.machineCode, label: `${m.machineCode}${m.machineCode !== m.name ? ` — ${m.name}` : ''}` }))}
                  placeholder="Select or type machine no."
                  disabled={lockedContext}
                  filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                />
              </Form.Item>
              <Text type="secondary" style={{ display: 'block', marginTop: -14, marginBottom: 10 }}>
                {lockedContext ? (
                  <Text style={{ fontSize: 12, color: 'var(--theme-success)' }}>
                    Pre-selected from the availability list for this date & shift
                  </Text>
                ) : machinesForDept.length > 0 ? (
                  `${machinesForDept.length} registered machine(s) in this department`
                ) : (
                  'No registered machines for this department — you may type any machine identifier'
                )}
              </Text>
              <Form.Item name="operatorName" label="Operator Name" rules={[{ required: true, message: 'Operator name is required' }]}>
                <Input maxLength={120} placeholder="Operator on duty" />
              </Form.Item>
              <Form.Item name="supervisorName" label="Supervisor Name">
                <Input maxLength={120} placeholder="Optional" />
              </Form.Item>
              <Form.Item name="coilSize" label="Coil Size">
                <Input maxLength={50} placeholder='e.g. 2.5mm' />
              </Form.Item>
            </Card>

            <Card title="Downtime" size="small" style={{ marginTop: 16 }}>
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item
                    name="downtimeHours"
                    label="Downtime Hours"
                    initialValue={0}
                    rules={[
                      { required: true, message: 'Required' },
                      { type: 'number', min: 0, max: 24, message: '0–24 allowed' },
                    ]}
                  >
                    <InputNumber style={{ width: '100%' }} min={0} max={24} step={0.25} precision={2} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="downtimeReasonId" label="Downtime Reason">
                    <Select
                      allowClear showSearch optionFilterProp="label"
                      loading={lookups.downtimeReasonsLoading}
                      placeholder={lookups.downtimeReasonsLoading ? 'Loading reasons…' : 'Reason'}
                      notFoundContent={
                        lookups.downtimeReasonsFailed ? (
                          <Space direction="vertical" size={0}>
                            <Text type="secondary">Failed to load downtime reasons.</Text>
                            <Button type="link" size="small" onClick={() => void lookups.loadDowntimeReasons()}>Retry</Button>
                          </Space>
                        ) : (
                          'No active downtime reasons configured'
                        )
                      }
                      options={lookups.downtimeReasons.map((r) => ({ value: r.id, label: r.name }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="remarks" label="Remarks">
                <Input.TextArea rows={3} maxLength={500} showCount placeholder="Notes about this shift's production" />
              </Form.Item>
            </Card>
          </Col>

          <Col span={8}>
            <Card title="Production Figures" size="small">
              <Form.Item
                name="itemId"
                label="Item / Product"
                rules={[{ required: true, message: 'Item is required' }]}
              >
                <Select
                  showSearch optionFilterProp="label" placeholder="Select Item"
                  options={lookups.items.map((i) => ({
                    value: i.id,
                    label: `${i.itemCode} — ${i.name}`,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="uomId"
                label="UOM Type"
                rules={[{ required: true, message: 'UOM is required' }]}
              >
                <Select
                  placeholder="UOM"
                  options={validUoms.map((u) => ({ value: u.id, label: `${u.code} (${u.symbol})` }))}
                />
              </Form.Item>
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item
                    name="targetQuantity"
                    label="Target Production"
                    initialValue={undefined}
                    rules={[{ required: true, message: 'Target is required' }]}
                  >
                    <InputNumber style={{ width: '100%' }} min={0.000001} precision={3} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="actualQuantity"
                    label="Actual Good Production"
                    initialValue={0}
                    rules={[{ required: true, message: 'Actual is required' }]}
                  >
                    <InputNumber style={{ width: '100%' }} min={0} precision={3} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item
                    name="runningHours"
                    label="Running Hours"
                    initialValue={0}
                    rules={[
                      { required: true, message: 'Required' },
                      { type: 'number', min: 0, max: 24, message: '0–24 allowed' },
                    ]}
                  >
                    <InputNumber style={{ width: '100%' }} min={0} max={24} step={0.25} precision={2} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="scrapQuantity"
                    label="Rejection / Scrap"
                    initialValue={0}
                    rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0, message: 'Must be ≥ 0' }]}
                  >
                    <InputNumber style={{ width: '100%' }} min={0} precision={3} />
                  </Form.Item>
                </Col>
              </Row>
              <Divider style={{ margin: '4px 0 12px' }} orientationMargin={0}>
                <Text type="secondary">Computed KPIs (server-verified)</Text>
              </Divider>
              <Row gutter={16}>
                <Col span={12}>
                  <StatisticMini label="Efficiency %" value={efficiency} hint="running vs planned hours of shift" />
                </Col>
                <Col span={12}>
                  <StatisticMini label="Achievement %" value={achievement} hint="actual vs target" />
                </Col>
              </Row>
            </Card>
            <Button
              type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}
              block size="large" style={{ marginTop: 16 }}
            >
              {mode === 'create' ? 'Save Production Entry' : 'Update Production Entry'}
            </Button>
          </Col>
        </Row>
      </Form>
    </div>
  );
};

const StatisticMini: React.FC<{ label: string; value: number | null; hint: string }> = ({ label, value, hint }) => (
  <div style={{ background: 'var(--theme-surface-alt)', borderRadius: 6, padding: '8px 12px' }}>
    <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
    <div style={{ fontSize: 22, fontWeight: 600 }}>
      {value === null ? '—' : `${value.toFixed(2)}%`}
    </div>
    <Text type="secondary" style={{ fontSize: 11 }}>{hint}</Text>
  </div>
);

export default EntryForm;
