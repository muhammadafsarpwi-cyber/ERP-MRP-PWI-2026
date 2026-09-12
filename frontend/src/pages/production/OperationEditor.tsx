import React, { useEffect, useState } from 'react';
import {
  Modal, Form, Input, Select, App, Card, InputNumber, Row, Col, Checkbox, Space, Button, Alert, Spin, Table, Typography,
} from 'antd';
import { PlusOutlined, MinusCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService, { describeRequestError } from '../../services/api';
import SaveResultDialog, { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import { formatDecimal, toNum } from '../../utils/numberFormat';

export interface RoutingInput {
  id?: string;
  itemId?: string;
  quantity?: number;
  uomId?: string;
  sourceWarehouseId?: string;
  scrapBasis?: string;
  isPrimary?: boolean;
  lineNumber?: number;
  item?: { name: string; itemCode: string };
}

export interface RoutingOutput {
  id?: string;
  itemId?: string;
  quantity?: number;
  uomId?: string;
  outputType?: string;
  yieldPercentage?: number;
  isPrimary?: boolean;
  lineNumber?: number;
  item?: { name: string; itemCode: string };
}

export interface RoutingOperation {
  id: string;
  sequenceNo: number;
  operationCode: string;
  operationName: string;
  description?: string;
  divisionId?: string;
  division?: { name: string; divisionCode: string };
  sectionId?: string;
  section?: { name: string; sectionCode: string };
  departmentId?: string;
  department?: { name: string; departmentCode: string };
  setupTimeMinutes: number;
  runTimeMinutes: number;
  queueTimeMinutes: number;
  waitTimeMinutes: number;
  laborRequired: boolean;
  machineRequired: boolean;
  machineId?: string;
  machine?: { machineCode: string; name: string };
  inputItemId?: string;
  inputItem?: { name: string; itemCode: string };
  outputItemId?: string;
  outputItem?: { name: string; itemCode: string };
  inputQuantity: number;
  outputQuantity: number;
  uomId?: string;
  uom?: { code: string };
  scrapPercentage: number;
  setupScrapPercentage: number;
  status: string;
  remarks?: string;
  inputs?: RoutingInput[];
  outputs?: RoutingOutput[];
}

export interface Routing {
  id: string;
  routingCode: string;
  name: string;
  description?: string;
  productId: string;
  product?: { name: string; itemCode: string };
  bomId: string;
  bom?: { bomCode: string; name: string };
  routeTypeId?: string;
  routeType?: { id: string; routeCode: string; name: string };
  status: string;
  baseQuantity: number;
  estimatedTotalTime: number;
  isDefault: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  operations: RoutingOperation[];
  createdAt: string;
  updatedAt: string;
}

export interface LookupItem { id: string; name: string; }
export interface Item extends LookupItem { itemCode: string; itemType: string; departmentId?: string | null; departmentName?: string | null; }
export interface Division extends LookupItem { divisionCode: string; }
export interface Section extends LookupItem { sectionCode: string; divisionId: string; }
export interface Department extends LookupItem { departmentCode: string; divisionId?: string | null; sectionId?: string | null; }
export interface Uom extends LookupItem { code: string; }
export interface Machine extends LookupItem { machineCode: string; }
export interface Warehouse extends LookupItem { warehouseCode?: string; }

export interface OperationEditorLookups {
  items: Item[];
  divisions: Division[];
  sections: Section[];
  departments: Department[];
  uoms: Uom[];
  machines: Machine[];
  warehouses: Warehouse[];
}

interface OperationEditorProps {
  open: boolean;
  routing: Routing | null;
  operation: RoutingOperation | null;
  lookups: OperationEditorLookups;
  onClose: () => void;
  onSaved: () => void;
}

interface MachineTargetSummary {
  id: string;
  shift?: { shiftCode: string; name: string } | null;
  item?: { itemCode: string; name: string } | null;
  uom?: { code: string } | null;
  machine?: { machineCode: string; name: string } | null;
  standardHours: string | number;
  targetQuantity: string | number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  status?: string;
}

const fmtQty = (v: string | number | null | undefined): string => formatDecimal(toNum(v));

/** Fields the backend accepts on CreateRoutingOperationDto / UpdateRoutingOperationDto.
 *  Kept in sync with backend/src/modules/production-routing/dto/production-routing.dto.ts.
 *  companyId is intentionally absent — it is derived server-side from the org scope. */
const DTO_PAYLOAD_FIELDS = [
  'sequenceNo',
  'operationCode',
  'operationName',
  'description',
  'divisionId',
  'sectionId',
  'departmentId',
  'setupTimeMinutes',
  'runTimeMinutes',
  'queueTimeMinutes',
  'waitTimeMinutes',
  'laborRequired',
  'machineRequired',
  'scrapPercentage',
  'setupScrapPercentage',
  'status',
  'remarks',
] as const;

/** Fields the backend accepts on RoutingOperationInputDto (see production-routing.dto.ts).
 *  The per-row Item Department filter ('itemDepartmentId') is a UI-only selector and
 *  must NEVER reach the API — this whitelist strips it (and any other UI-only key). */
const INPUT_MATERIAL_FIELDS = [
  'itemId',
  'quantity',
  'uomId',
  'sourceWarehouseId',
  'scrapBasis',
  'isPrimary',
  'lineNumber',
] as const;

/** Fields the backend accepts on RoutingOperationOutputDto. */
const OUTPUT_PRODUCT_FIELDS = [
  'itemId',
  'quantity',
  'uomId',
  'outputType',
  'yieldPercentage',
  'isPrimary',
  'lineNumber',
] as const;

const pickFields = (row: Record<string, unknown> | undefined, fields: readonly string[]): Record<string, unknown> => {
  if (!row) return {};
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (row[f] !== undefined) out[f] = row[f];
  }
  return out;
};

const perHour = (t: MachineTargetSummary): string => {
  const hours = toNum(t.standardHours);
  if (hours <= 0) return '—';
  return `${fmtQty(toNum(t.targetQuantity) / hours)}${t.uom?.code ? ` ${t.uom.code}` : ''}/hour`;
};

const fmtDate = (iso?: string): string => {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('DD-MMM-YYYY') : iso;
};

const OperationEditor: React.FC<OperationEditorProps> = ({
  open,
  routing,
  operation,
  lookups,
  onClose,
  onSaved,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultPhase, setResultPhase] = useState<SaveResultPhase>('loading');
  const [result, setResult] = useState<SaveResultData | null>(null);
  const [resultError, setResultError] = useState<string>('');
  const [targets, setTargets] = useState<MachineTargetSummary[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [mtQuery, setMtQuery] = useState<{ required: boolean; machineId?: string }>({ required: false });

  const watchedDivisionId = Form.useWatch('divisionId', form);
  const watchedSectionId = Form.useWatch('sectionId', form);
  const watchedMachineRequired = Form.useWatch('machineRequired', form);
  const watchedInputs = Form.useWatch('inputs', form) ?? [];
  const watchedOutputs = Form.useWatch('outputs', form) ?? [];

  useEffect(() => {
    if (!open) return;
    if (operation) {
      form.setFieldsValue({
        sequenceNo: operation.sequenceNo,
        operationCode: operation.operationCode,
        operationName: operation.operationName,
        description: operation.description,
        divisionId: operation.divisionId,
        sectionId: operation.sectionId,
        departmentId: operation.departmentId,
        setupTimeMinutes: operation.setupTimeMinutes,
        runTimeMinutes: operation.runTimeMinutes,
        queueTimeMinutes: operation.queueTimeMinutes,
        waitTimeMinutes: operation.waitTimeMinutes,
        laborRequired: operation.laborRequired,
        machineRequired: operation.machineRequired,
        machineId: operation.machineId,
        inputs: (operation.inputs || []).map(i => ({
          itemId: i.itemId,
          itemDepartmentId: lookups.items.find(it => it.id === i.itemId)?.departmentId ?? undefined,
          quantity: i.quantity,
          uomId: i.uomId,
          sourceWarehouseId: i.sourceWarehouseId,
          scrapBasis: i.scrapBasis,
          isPrimary: i.isPrimary,
        })),
        outputs: (operation.outputs || []).map(o => ({
          itemId: o.itemId,
          itemDepartmentId: lookups.items.find(it => it.id === o.itemId)?.departmentId ?? undefined,
          quantity: o.quantity,
          uomId: o.uomId,
          outputType: o.outputType,
          yieldPercentage: o.yieldPercentage,
          isPrimary: o.isPrimary,
        })),
        scrapPercentage: operation.scrapPercentage,
        setupScrapPercentage: operation.setupScrapPercentage,
        status: operation.status,
        remarks: operation.remarks,
      });
      setMtQuery({ required: Boolean(operation.machineRequired), machineId: operation.machineId });
    } else {
      form.resetFields();
      form.setFieldsValue({
        sequenceNo: ((routing?.operations?.length || 0) + 1) * 10,
        laborRequired: true,
        machineRequired: false,
        machineId: undefined,
        status: 'ACTIVE',
        inputs: [],
        outputs: [],
      });
      setMtQuery({ required: false, machineId: undefined });
    }
  }, [open, operation, routing, form]);

  useEffect(() => {
    if (!open || !mtQuery.required || !mtQuery.machineId) {
      setTargets([]);
      return;
    }
    let cancelled = false;
    setTargetsLoading(true);
    apiService
      .get<{ data: MachineTargetSummary[] }>('/production/machine-targets', { machineId: mtQuery.machineId, limit: 50 })
      .then(res => { if (!cancelled) setTargets(res.data || []); })
      .catch(() => { if (!cancelled) setTargets([]); })
      .finally(() => { if (!cancelled) setTargetsLoading(false); });
    return () => { cancelled = true; };
  }, [open, mtQuery.required, mtQuery.machineId]);

  const filteredSections = lookups.sections.filter(s => !watchedDivisionId || s.divisionId === watchedDivisionId);

  // Division → Section → Department cascade. Centralized (company-level)
  // departments always remain available; a selected Section narrows to its own
  // departments; a selected Division narrows to departments attached directly
  // to it OR to a Section inside it.
  const filteredDepartments = lookups.departments.filter(d => {
    if (d.sectionId == null && d.divisionId == null) return true;
    if (watchedSectionId) return d.sectionId === watchedSectionId;
    if (!watchedDivisionId) return true;
    return (
      d.divisionId === watchedDivisionId ||
      (d.sectionId != null && filteredSections.some(s => s.id === d.sectionId))
    );
  });

  /** Per-row Item list: when an Item Department is chosen, only items whose real
   *  departmentId matches are offered. The currently selected item (if any) is
   *  always retained so a legacy/unassigned selection can never become orphaned. */
  const itemOptionsFor = (deptId?: string, currentId?: string): Item[] => {
    if (!deptId) return lookups.items;
    return lookups.items.filter(i => i.departmentId === deptId || (currentId != null && i.id === currentId));
  };

  const machineOptions = [...lookups.machines]
    .sort((a, b) => (a.machineCode || '').localeCompare(b.machineCode || ''))
    .map(m => ({ value: m.id, label: `${m.machineCode} - ${m.name}` }));

  const handleSave = async () => {
    if (saving) return;
    let values: any;
    try {
      values = await form.validateFields();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(describeRequestError(err));
      return;
    }
    const inputs = values.inputs || [];
    const outputs = values.outputs || [];
    const primaryIn = inputs[0];
    const primaryOut = outputs[0];
    // DTO-exact payload: only fields accepted by CreateRoutingOperationDto /
    // UpdateRoutingOperationDto are forwarded. companyId is derived server-side
    // from the authenticated org scope, so it (and any UI/internal key) must
    // never leak into the request body.
    const payload: Record<string, unknown> = {};
    for (const key of DTO_PAYLOAD_FIELDS) {
      if (values[key] !== undefined) payload[key] = values[key];
    }
    payload.machineId = values.machineRequired ? (values.machineId ?? null) : null;
    payload.inputItemId = primaryIn?.itemId ?? values.inputItemId ?? null;
    payload.inputQuantity = primaryIn?.quantity ?? values.inputQuantity ?? 1;
    payload.outputItemId = primaryOut?.itemId ?? values.outputItemId ?? null;
    payload.outputQuantity = primaryOut?.quantity ?? values.outputQuantity ?? 1;
    payload.uomId = primaryIn?.uomId ?? values.uomId ?? null;
    // DTO-exact junction payloads: each row is reduced to the fields accepted by
    // RoutingOperationInputDto / RoutingOperationOutputDto, so the UI-only
    // per-row 'itemDepartmentId' filter can never trigger a forbidden field 400.
    payload.inputs = (inputs as Record<string, unknown>[]).map(r => pickFields(r, INPUT_MATERIAL_FIELDS));
    payload.outputs = (outputs as Record<string, unknown>[]).map(r => pickFields(r, OUTPUT_PRODUCT_FIELDS));

    setSaving(true);
    setResultPhase('loading');
    setResultOpen(true);
    try {
      let savedOp: { operationCode?: string; operationName?: string } | undefined;
      if (operation) {
        const res = (await apiService.put(`/production/routings/operations/${operation.id}`, payload)) as {
          data?: { operationCode?: string; operationName?: string };
        };
        savedOp = res?.data;
      } else {
        const res = (await apiService.post(`/production/routings/${routing!.id}/operations`, payload)) as {
          data?: { operations?: Array<{ id?: string; operationCode?: string; operationName?: string }> };
        };
        const ops = res?.data?.operations || [];
        savedOp =
          ops.find(o => o.operationCode === values.operationCode) ||
          ops.find(o => o.operationName === (values.operationName ?? values.operationCode)) ||
          ops.slice(-1)[0];
      }
      const code = savedOp?.operationCode ?? operation?.operationCode ?? values.operationCode;
      const name = savedOp?.operationName ?? operation?.operationName ?? values.operationName;
      setResult({
        title: operation ? 'Operation Updated Successfully' : 'Operation Saved Successfully',
        recordType: 'Operation Code',
        recordCode: code != null ? String(code).trim() : undefined,
        recordName: name != null ? String(name) : undefined,
      });
      setResultPhase('success');
      onSaved();
    } catch (err: any) {
      // Persistent error phase: never auto-close and never flip to success on
      // an API failure. The dialog stays open until the user dismisses it or
      // retries, and the form (with its values) remains fully editable.
      setResultError(describeRequestError(err));
      setResultPhase('error');
    } finally {
      setSaving(false);
    }
  };

  const targetColumns = [
    { title: 'Shift', key: 'shift', width: 130, render: (_: unknown, t: MachineTargetSummary) => t.shift ? `${t.shift.shiftCode} · ${t.shift.name}` : '—' },
    { title: 'Item', key: 'item', width: 180, render: (_: unknown, t: MachineTargetSummary) => t.item ? `${t.item.itemCode} - ${t.item.name}` : '—' },
    { title: 'UOM', key: 'uom', width: 70, render: (_: unknown, t: MachineTargetSummary) => t.uom?.code || '—' },
    { title: 'Std Hrs', key: 'hours', width: 80, align: 'right' as const, render: (_: unknown, t: MachineTargetSummary) => fmtQty(t.standardHours) },
    { title: 'Target', key: 'target', width: 100, align: 'right' as const, render: (_: unknown, t: MachineTargetSummary) => fmtQty(t.targetQuantity) },
    { title: 'Rate', key: 'rate', width: 110, render: (_: unknown, t: MachineTargetSummary) => perHour(t) },
    { title: 'Effective', key: 'eff', width: 150, render: (_: unknown, t: MachineTargetSummary) => t.effectiveTo ? `${fmtDate(t.effectiveFrom)} → ${fmtDate(t.effectiveTo)}` : `From ${fmtDate(t.effectiveFrom)}` },
    { title: 'Status', key: 'status', width: 80, render: (_: unknown, t: MachineTargetSummary) => String(t.status || 'ACTIVE') },
  ];

  const hasMachineTargets = (targets || []).length > 0;

  return (
    <>
      <Modal
        title={operation ? 'Edit Operation' : 'Add Operation'}
        open={open}
        onCancel={onClose}
        width={900}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={onClose} disabled={saving}>Cancel</Button>,
          <Button key="save" type="primary" onClick={handleSave} loading={saving} disabled={saving}>Save</Button>,
        ]}
      >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={6}><Form.Item name="sequenceNo" label="Sequence" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={9}><Form.Item name="operationCode" label="Code" rules={[{ required: true }]}><Input maxLength={50} /></Form.Item></Col>
          <Col span={9}><Form.Item name="operationName" label="Name" rules={[{ required: true }]}><Input maxLength={255} /></Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}><Form.Item name="divisionId" label="Division"><Select allowClear placeholder="Select division" onChange={() => { form.setFieldsValue({ sectionId: undefined, departmentId: undefined }); }}>
            {lookups.divisions.map(d => <Select.Option key={d.id} value={d.id}>{d.divisionCode} - {d.name}</Select.Option>)}
          </Select></Form.Item></Col>
          <Col span={8}><Form.Item name="sectionId" label="Section"><Select allowClear placeholder="Select section" onChange={() => form.setFieldsValue({ departmentId: undefined })}>
            {filteredSections.map(s => <Select.Option key={s.id} value={s.id}>{s.sectionCode} - {s.name}</Select.Option>)}
          </Select></Form.Item></Col>
          <Col span={8}><Form.Item name="departmentId" label="Department"><Select allowClear placeholder="Select department">
            {filteredDepartments.map(d => <Select.Option key={d.id} value={d.id}>{d.departmentCode} - {d.name}</Select.Option>)}
          </Select></Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col span={6}><Form.Item name="setupTimeMinutes" label="Setup (min)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item name="runTimeMinutes" label="Run (min)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item name="queueTimeMinutes" label="Queue (min)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item name="waitTimeMinutes" label="Wait (min)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col span={24}>
            <Card size="small" title="Input Materials" style={{ marginBottom: 12 }}>
              <Form.List name="inputs">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...restField }) => {
                      const row = (watchedInputs as Array<{ itemDepartmentId?: string; itemId?: string } | undefined>)[name];
                      const rowDept = row?.itemDepartmentId;
                      const rowItem = row?.itemId;
                      return (
                      <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline" wrap>
                        <Form.Item {...restField} name={[name, 'itemDepartmentId']}>
                          <Select
                            allowClear
                            placeholder="Item department"
                            style={{ width: 170 }}
                            onChange={() => form.setFieldValue(['inputs', name, 'itemId'], undefined)}
                          >
                            {lookups.departments.map(d => <Select.Option key={d.id} value={d.id}>{d.departmentCode} - {d.name}</Select.Option>)}
                          </Select>
                        </Form.Item>
                        <Form.Item {...restField} name={[name, 'itemId']} rules={[{ required: true, message: 'Material item required' }]}>
                          <Select
                            showSearch
                            optionFilterProp="children"
                            placeholder={rowDept || rowItem ? 'Material item' : 'Select item department first'}
                            disabled={!rowDept && !rowItem}
                            style={{ width: 240 }}
                          >
                            {itemOptionsFor(rowDept, rowItem).map(i => <Select.Option key={i.id} value={i.id}>{i.itemCode} - {i.name}</Select.Option>)}
                          </Select>
                        </Form.Item>
                        <Form.Item {...restField} name={[name, 'quantity']}><InputNumber min={0} placeholder="Qty per unit" style={{ width: 100 }} /></Form.Item>
                        <Form.Item {...restField} name={[name, 'uomId']}>
                          <Select allowClear placeholder="UOM" style={{ width: 90 }}>
                            {lookups.uoms.map(u => <Select.Option key={u.id} value={u.id}>{u.code}</Select.Option>)}
                          </Select>
                        </Form.Item>
                        <Form.Item {...restField} name={[name, 'sourceWarehouseId']}>
                          <Select allowClear showSearch optionFilterProp="children" placeholder="Source wh" style={{ width: 130 }}>
                            {lookups.warehouses.map(w => <Select.Option key={w.id} value={w.id}>{w.warehouseCode || w.name}</Select.Option>)}
                          </Select>
                        </Form.Item>
                        <Form.Item {...restField} name={[name, 'scrapBasis']}>
                          <Select placeholder="Scrap basis" style={{ width: 120 }}>
                            <Select.Option value="WITH_SCRAP">WITH_SCRAP</Select.Option>
                            <Select.Option value="GOOD_ONLY">GOOD_ONLY</Select.Option>
                          </Select>
                        </Form.Item>
                        <Form.Item {...restField} name={[name, 'isPrimary']} valuePropName="checked">
                          <Checkbox>Primary</Checkbox>
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(name)} />
                      </Space>
                      );
                    })}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Add Input Material</Button>
                  </>
                )}
              </Form.List>
            </Card>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={24}>
            <Card size="small" title="Output Products" style={{ marginBottom: 12 }}>
              <Form.List name="outputs">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...restField }) => {
                      const row = (watchedOutputs as Array<{ itemDepartmentId?: string; itemId?: string } | undefined>)[name];
                      const rowDept = row?.itemDepartmentId;
                      const rowItem = row?.itemId;
                      return (
                      <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline" wrap>
                        <Form.Item {...restField} name={[name, 'itemDepartmentId']}>
                          <Select
                            allowClear
                            placeholder="Item department"
                            style={{ width: 170 }}
                            onChange={() => form.setFieldValue(['outputs', name, 'itemId'], undefined)}
                          >
                            {lookups.departments.map(d => <Select.Option key={d.id} value={d.id}>{d.departmentCode} - {d.name}</Select.Option>)}
                          </Select>
                        </Form.Item>
                        <Form.Item {...restField} name={[name, 'itemId']} rules={[{ required: true, message: 'Product item required' }]}>
                          <Select
                            showSearch
                            optionFilterProp="children"
                            placeholder={rowDept || rowItem ? 'Product item' : 'Select item department first'}
                            disabled={!rowDept && !rowItem}
                            style={{ width: 220 }}
                          >
                            {itemOptionsFor(rowDept, rowItem).map(i => <Select.Option key={i.id} value={i.id}>{i.itemCode} - {i.name}</Select.Option>)}
                          </Select>
                        </Form.Item>
                        <Form.Item {...restField} name={[name, 'quantity']}><InputNumber min={0} placeholder="Qty per unit" style={{ width: 100 }} /></Form.Item>
                        <Form.Item {...restField} name={[name, 'uomId']}>
                          <Select allowClear placeholder="UOM" style={{ width: 90 }}>
                            {lookups.uoms.map(u => <Select.Option key={u.id} value={u.id}>{u.code}</Select.Option>)}
                          </Select>
                        </Form.Item>
                        <Form.Item {...restField} name={[name, 'outputType']}>
                          <Select placeholder="Type" style={{ width: 120 }}>
                            <Select.Option value="MAIN">MAIN</Select.Option>
                            <Select.Option value="CO_PRODUCT">CO_PRODUCT</Select.Option>
                            <Select.Option value="BY_PRODUCT">BY_PRODUCT</Select.Option>
                          </Select>
                        </Form.Item>
                        <Form.Item {...restField} name={[name, 'isPrimary']} valuePropName="checked">
                          <Checkbox>Primary</Checkbox>
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(name)} />
                      </Space>
                      );
                    })}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Add Output Product</Button>
                  </>
                )}
              </Form.List>
            </Card>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}><Form.Item name="scrapPercentage" label="Scrap %"><InputNumber min={0} max={100} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={8}><Form.Item name="setupScrapPercentage" label="Setup Scrap %"><InputNumber min={0} max={100} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={4}><Form.Item name="laborRequired" label="Labor" valuePropName="checked"><Checkbox /></Form.Item></Col>
          <Col span={4}><Form.Item name="machineRequired" label="Machine" valuePropName="checked">
            <Checkbox onChange={e => {
              const checked = Boolean(e.target.checked);
              if (!checked) form.setFieldsValue({ machineId: undefined });
              setMtQuery({ required: checked, machineId: checked ? form.getFieldValue('machineId') : undefined });
            }} />
          </Form.Item></Col>
        </Row>
        <Row gutter={16}>
          {watchedMachineRequired && (
            <Col span={12}>
              <Form.Item name="machineId" label="Machine" rules={[{ required: true, message: 'Select a machine' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select machine"
                  options={machineOptions}
                  onChange={val => setMtQuery(q => ({ required: q.required, machineId: val }))}
                />
              </Form.Item>
            </Col>
          )}
          <Col span={watchedMachineRequired ? 12 : 24}><Form.Item name="remarks" label="Remarks"><Input.TextArea rows={2} /></Form.Item></Col>
        </Row>
        {watchedMachineRequired && (
          <Alert
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            message="Machine Target (read-only)"
            description={
              <Spin spinning={targetsLoading}>
                {hasMachineTargets ? (
                  <Table
                    rowKey="id"
                    size="small"
                    columns={targetColumns}
                    dataSource={targets}
                    pagination={false}
                    style={{ marginTop: 8 }}
                  />
                ) : (
                  <Typography.Text type="secondary">
                    No machine target is configured for the selected machine yet. Targets are maintained in Machine Targets.
                  </Typography.Text>
                )}
              </Spin>
            }
          />
        )}
      </Form>
      </Modal>

      <SaveResultDialog
        open={resultOpen}
        phase={resultPhase}
        result={result}
        errorMessage={resultError}
        onRetry={handleSave}
        onClose={() => setResultOpen(false)}
      />
    </>
  );
};

export default OperationEditor;