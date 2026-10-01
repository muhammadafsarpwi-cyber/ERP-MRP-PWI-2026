import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, App, Badge, Button, Card, Col, Collapse, Descriptions, Divider,
  Empty, Row, Select, Space, Spin, Statistic, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  ApartmentOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ExclamationCircleOutlined, EyeOutlined, FileTextOutlined,
  LockOutlined, ReloadOutlined, SafetyOutlined, ShoppingCartOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageHeader } from '../../components/shared';

const { Text, Paragraph } = Typography;

/**
 * Sales Order Division Review — READ-ONLY business approval screen.
 *
 * Purpose: give the business an evidence-based review of the 10 existing
 * Sales Orders whose `division_id` is NULL, so explicit human decisions can
 * be made BEFORE any backfill.
 *
 * Safety properties (deliberate):
 * - READ-ONLY: this page issues GET requests only. There is no save/approve
 *   endpoint wired up; the "decision" controls write to local draft state
 *   only and are never persisted.
 * - Reuses the existing server-side authorization model: all reads go through
 *   the standard `/sales/orders` + `/divisions` APIs, so DivisionScopeGuard,
 *   OrgScopeGuard, PermissionGuard and company/tenant isolation apply
 *   unchanged. A division-restricted caller only ever sees their own scope.
 * - No division is invented: classification is derived from live item
 *   `division_id` values, and every "proposed division" control starts empty.
 */

// ── Types ────────────────────────────────────────────────────────────────────

interface ReviewLineItem {
  id: string;
  lineNumber?: number | null;
  itemId?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  itemDivisionId?: string | null;
  itemDivisionCode?: string | null;
  quantity?: number | null;
}

interface ReviewOrder {
  id: string;
  orderNumber: string;
  status: string;
  orderDate?: string | null;
  divisionId: string | null;
  divisionCode?: string | null;
  divisionName?: string | null;
  customerName?: string | null;
  items: ReviewLineItem[];
  relatedQuotationNumber?: string | null;
  deliveryCount?: number;
  invoiceCount?: number;
}

type OrderClassification = 'VERIFIED' | 'CONFLICT' | 'UNRESOLVED';

interface ClassifiedOrder extends ReviewOrder {
  classification: OrderClassification;
  itemDivisions: string[];
  reason: string;
}

type DraftDecision =
  | ''
  | 'SPLIT_BY_DIVISION'
  | 'ASSIGN_DIV_CCD'
  | 'ASSIGN_OTHER_DIVISION'
  | 'ASSIGN_EXPLICIT_DIVISION'
  | 'KEEP_NULL'
  | 'GLOBAL_COMPANY_SCOPED';

interface DivisionOption {
  id: string;
  divisionCode: string;
  name: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function classifyOrder(order: ReviewOrder): ClassifiedOrder {
  if (order.divisionId) {
    return {
      ...order,
      classification: 'VERIFIED',
      itemDivisions: [],
      reason: 'Order already carries an explicit division_id.',
    };
  }
  const distinct = Array.from(
    new Set(
      (order.items || [])
        .map((l) => l.itemDivisionId)
        .filter((d): d is string => Boolean(d)),
    ),
  );
  const hasNullItem = (order.items || []).some((l) => !l.itemDivisionId);
  if (distinct.length > 1 || (distinct.length === 1 && hasNullItem && order.items.length > 1)) {
    return {
      ...order,
      classification: 'CONFLICT',
      itemDivisions: distinct,
      reason:
        'Mixed item-division evidence: at least one line carries a division ' +
        'while other lines carry none (or lines disagree). Automatic ' +
        'assignment is unsafe — manual review required.',
    };
  }
  if (distinct.length === 1) {
    return {
      ...order,
      classification: 'UNRESOLVED',
      itemDivisions: distinct,
      reason:
        'Single division signal from line items, but backfill still requires ' +
        'explicit business approval — never auto-assign.',
    };
  }
  if ((order.items || []).length === 0) {
    return {
      ...order,
      classification: 'UNRESOLVED',
      itemDivisions: [],
      reason:
        'Order has no line items, so there is no authoritative division ' +
        'evidence (customer / warehouse / quotation carry no division). ' +
        'Manual business decision required.',
    };
  }
  return {
    ...order,
    classification: 'UNRESOLVED',
    itemDivisions: [],
    reason:
      'All line items have NULL division_id and no other authoritative ' +
      'division source exists. Manual business decision required.',
  };
}

function classificationTag(c: OrderClassification) {
  if (c === 'VERIFIED') return <Tag color="green" icon={<CheckCircleOutlined />}>VERIFIED</Tag>;
  if (c === 'CONFLICT') return <Tag color="red" icon={<ExclamationCircleOutlined />}>CONFLICT</Tag>;
  return <Tag color="orange" icon={<ExclamationCircleOutlined />}>UNRESOLVED</Tag>;
}

// ── Page ─────────────────────────────────────────────────────────────────────

const SalesOrderDivisionReview: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const canView = can('sales.orders.view');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<ReviewOrder[]>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);
  // Draft decisions live in component state ONLY — never persisted.
  const [drafts, setDrafts] = useState<Record<string, DraftDecision>>({});
  const [draftDivisions, setDraftDivisions] = useState<Record<string, string>>({});
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, any>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersRes, divisionsRes] = await Promise.all([
        apiService.get<any>('/sales/orders', { page: 1, limit: 100 }),
        apiService.get<any>('/divisions', { limit: 100 }),
      ]);
      const rawOrders: any[] = Array.isArray(ordersRes?.data)
        ? ordersRes.data
        : Array.isArray(ordersRes)
          ? ordersRes
          : [];
      const mapped: ReviewOrder[] = rawOrders.map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        orderDate: o.orderDate ?? null,
        divisionId: o.divisionId ?? null,
        divisionCode: o.division?.divisionCode ?? null,
        divisionName: o.division?.name ?? null,
        customerName:
          o.customer?.companyName || o.customer?.name || o.customerName || null,
        items: (o.items || []).map((l: any) => ({
          id: l.id,
          lineNumber: l.lineNumber ?? null,
          itemId: l.itemId ?? null,
          itemCode: l.item?.itemCode ?? l.itemCode ?? null,
          itemName: l.item?.name ?? l.description ?? null,
          itemDivisionId: l.item?.divisionId ?? null,
          itemDivisionCode: l.item?.division?.divisionCode ?? null,
          quantity: l.quantity ?? null,
        })),
        relatedQuotationNumber: o.relatedQuotation?.quotationNumber ?? null,
        deliveryCount: Array.isArray(o.linkedDeliveries) ? o.linkedDeliveries.length : undefined,
        invoiceCount: Array.isArray(o.linkedInvoices) ? o.linkedInvoices.length : undefined,
      }));
      setOrders(mapped);
      const rawDivs: any[] = Array.isArray(divisionsRes?.data)
        ? divisionsRes.data
        : Array.isArray(divisionsRes)
          ? divisionsRes
          : [];
      setDivisions(
        rawDivs
          .filter((d: any) => d && d.id)
          .map((d: any) => ({
            id: d.id,
            divisionCode: d.divisionCode || d.code || d.id,
            name: d.name || d.divisionCode || d.id,
          })),
      );
    } catch (e: any) {
      setError(e?.message || 'Failed to load division review data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) void fetchData();
  }, [canView, fetchData]);

  const classified = useMemo(() => orders.map(classifyOrder), [orders]);

  const summary = useMemo(() => {
    const total = classified.length;
    const assigned = classified.filter((o) => o.divisionId).length;
    const conflict = classified.filter((o) => o.classification === 'CONFLICT').length;
    const unresolved = classified.filter((o) => o.classification === 'UNRESOLVED').length;
    return { total, assigned, safeAuto: 0, conflict, unresolved };
  }, [classified]);

  const divisionNameById = useMemo(() => {
    const m = new Map<string, string>();
    divisions.forEach((d) => m.set(d.id, `${d.divisionCode} — ${d.name}`));
    m.set('d1000000-0000-0000-0000-000000000002', 'DIV-CCD — Control Cable Division');
    m.set('d1000000-0000-0000-0000-000000000001', 'DIV-SPD — Spoke Division');
    return m;
  }, [divisions]);

  // Item review: distinct items across the loaded orders.
  const itemReview = useMemo(() => {
    const byCode = new Map<string, {
      itemCode: string; itemName: string | null; divisionId: string | null;
      divisionCode: string | null; orders: string[]; quotations: string[];
    }>();
    classified.forEach((o) => {
      (o.items || []).forEach((l) => {
        if (!l.itemCode) return;
        const cur = byCode.get(l.itemCode) ?? {
          itemCode: l.itemCode, itemName: l.itemName ?? null,
          divisionId: l.itemDivisionId ?? null, divisionCode: l.itemDivisionCode ?? null,
          orders: [] as string[], quotations: [] as string[],
        };
        if (!cur.orders.includes(o.orderNumber)) cur.orders.push(o.orderNumber);
        if (o.relatedQuotationNumber && !cur.quotations.includes(o.relatedQuotationNumber)) {
          cur.quotations.push(o.relatedQuotationNumber);
        }
        byCode.set(l.itemCode, cur);
      });
    });
    return Array.from(byCode.values()).sort((a, b) => a.itemCode.localeCompare(b.itemCode));
  }, [classified]);

  const loadDetail = useCallback(async (orderId: string) => {
    if (detailCache[orderId]) return;
    setDetailLoading(true);
    try {
      const res = await apiService.get<any>(`/sales/orders/${orderId}`);
      setDetailCache((c) => ({ ...c, [orderId]: res?.data ?? res ?? null }));
    } catch {
      // Non-fatal: the list already carries the authoritative evidence.
    } finally {
      setDetailLoading(false);
    }
  }, [detailCache]);

  const setDraft = useCallback((key: string, value: DraftDecision) => {
    setDrafts((d) => ({ ...d, [key]: value }));
  }, []);

  const requestApprovalNote = useCallback(() => {
    message.info(
      'Review recorded locally only. NO DATABASE CHANGE WILL BE MADE UNTIL FINAL BUSINESS APPROVAL.',
      6,
    );
  }, [message]);

  const orderColumns: ColumnsType<ClassifiedOrder> = [
    {
      title: 'Sales Order', dataIndex: 'orderNumber', key: 'orderNumber',
      render: (v: string, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.status}</Text>
        </Space>
      ),
    },
    {
      title: 'Current Division', key: 'currentDivision',
      render: (_, r) => r.divisionId
        ? <Tag color="green">{r.divisionCode || r.divisionId}</Tag>
        : <Tag>NULL</Tag>,
    },
    {
      title: 'Detected Division(s)', key: 'detected',
      render: (_, r) => r.itemDivisions.length === 0
        ? <Text type="secondary">— none —</Text>
        : (
          <Space wrap>
            {r.itemDivisions.map((d) => (
              <Tag key={d} color="blue">{divisionNameById.get(d) || d}</Tag>
            ))}
          </Space>
        ),
    },
    {
      title: 'Confidence', key: 'confidence',
      render: (_, r) => r.classification === 'VERIFIED'
        ? <Tag color="green">HIGH</Tag>
        : <Tag color="orange">0% — no safe assignment</Tag>,
    },
    {
      title: 'Review Status', key: 'classification',
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          {classificationTag(r.classification)}
          <Tag icon={<LockOutlined />}>BUSINESS DECISION REQUIRED</Tag>
        </Space>
      ),
    },
    {
      title: 'Action', key: 'action',
      render: (_, r) => (
        <Space direction="vertical" size={4} style={{ minWidth: 220 }}>
          <Select
            placeholder="Select business decision (draft only)"
            value={drafts[r.id] || undefined}
            onChange={(v) => { setDraft(r.id, v as DraftDecision); }}
            style={{ width: '100%' }}
            options={
              r.classification === 'CONFLICT'
                ? [
                  { value: 'SPLIT_BY_DIVISION', label: 'Split order by division' },
                  { value: 'ASSIGN_DIV_CCD', label: 'Assign entire order to DIV-CCD' },
                  { value: 'ASSIGN_OTHER_DIVISION', label: 'Assign entire order to another division' },
                  { value: 'KEEP_NULL', label: 'Keep division_id NULL' },
                ]
                : [
                  { value: 'ASSIGN_EXPLICIT_DIVISION', label: 'Assign explicit division' },
                  { value: 'KEEP_NULL', label: 'Keep division_id NULL' },
                ]
            }
          />
          {(drafts[r.id] === 'ASSIGN_OTHER_DIVISION' || drafts[r.id] === 'ASSIGN_EXPLICIT_DIVISION') && (
            <Select
              placeholder="Select division (draft only)"
              value={draftDivisions[r.id] || undefined}
              onChange={(v) => setDraftDivisions((d) => ({ ...d, [r.id]: v }))}
              style={{ width: '100%' }}
              options={divisions.map((d) => ({ value: d.id, label: `${d.divisionCode} — ${d.name}` }))}
            />
          )}
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setExpandedOrderId((cur) => (cur === r.id ? null : r.id));
              void loadDetail(r.id);
            }}
          >
            {expandedOrderId === r.id ? 'Hide evidence' : 'View evidence'}
          </Button>
        </Space>
      ),
    },
  ];

  if (!canView) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="warning"
          showIcon
          message="No access"
          description="You do not have permission to view sales orders (sales.orders.view)."
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }} data-testid="so-division-review-page">
      <PageHeader
        icon={<ApartmentOutlined />}
        title="Sales Order Division Review"
        subtitle="READ-ONLY evidence review — no database change is made from this page"
      />

      <Alert
        type="info"
        showIcon
        icon={<SafetyOutlined />}
        style={{ marginBottom: 16 }}
        message="Review only — no database mutation"
        description={
          <span>
            This page issues <Text code>GET</Text> requests only through the standard
            sales-orders API, so <Text code>DivisionScopeGuard</Text>,{' '}
            <Text code>OrgScopeGuard</Text>, <Text code>PermissionGuard</Text> and
            company/tenant isolation apply unchanged. Draft decisions below are kept
            in local page state and are <Text strong>never persisted</Text>.{' '}
            <Text strong>NO DATABASE CHANGE WILL BE MADE UNTIL FINAL BUSINESS APPROVAL.</Text>
          </span>
        }
      />

      {/* Summary */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={4}><Card><Statistic title="Total Orders" value={summary.total} prefix={<ShoppingCartOutlined />} /></Card></Col>
        <Col xs={12} sm={8} md={4}><Card><Statistic title="Assigned Division" value={summary.assigned} /></Card></Col>
        <Col xs={12} sm={8} md={4}><Card><Statistic title="Safe Auto-Backfill" value={summary.safeAuto} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col xs={12} sm={8} md={4}><Card><Statistic title="Conflict" value={summary.conflict} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col xs={12} sm={8} md={4}><Card><Statistic title="Unresolved" value={summary.unresolved} valueStyle={{ color: '#d48806' }} /></Card></Col>
        <Col xs={12} sm={8} md={4}><Card><Statistic title="DB Mutations" value={0} valueStyle={{ color: '#389e0d' }} /></Card></Col>
      </Row>

      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }} message="Failed to load review data" description={error} />
      )}

      <Spin spinning={loading}>
        {/* Orders */}
        <Card
          title={<Space><FileTextOutlined /><span>Sales Order Review ({classified.length})</span></Space>}
          style={{ marginBottom: 16 }}
          extra={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void fetchData()} loading={loading}>
              Refresh
            </Button>
          }
        >
          {classified.length === 0 && !loading ? (
            <Empty description="No sales orders visible in your division scope." />
          ) : (
            <Table<ClassifiedOrder>
              rowKey="id"
              dataSource={classified}
              columns={orderColumns}
              pagination={{ pageSize: 20 }}
              expandable={{
                expandedRowKeys: expandedOrderId ? [expandedOrderId] : [],
                onExpand: (expanded, record) => {
                  setExpandedOrderId(expanded ? record.id : null);
                  if (expanded) void loadDetail(record.id);
                },
                expandedRowRender: (record) => {
                  const detail = detailCache[record.id];
                  return (
                    <div style={{ padding: '8px 0' }}>
                      <Descriptions size="small" bordered column={2} style={{ marginBottom: 12 }}>
                        <Descriptions.Item label="Order">{record.orderNumber} ({record.status})</Descriptions.Item>
                        <Descriptions.Item label="Customer">{record.customerName || '—'}</Descriptions.Item>
                        <Descriptions.Item label="Quotation">{record.relatedQuotationNumber || '— (none linked)'}</Descriptions.Item>
                        <Descriptions.Item label="Deliveries / Invoices">
                          {record.deliveryCount ?? detail?.linkedDeliveries?.length ?? '—'}
                          {' / '}
                          {record.invoiceCount ?? detail?.linkedInvoices?.length ?? '—'}
                          <Text type="secondary"> (warehouse / customer carry no division — contextual only)</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Why unsafe" span={2}>
                          <Paragraph style={{ margin: 0 }} type="secondary">{record.reason}</Paragraph>
                        </Descriptions.Item>
                      </Descriptions>
                      <Text strong>Line items &amp; item-division evidence</Text>
                      <Table<ReviewLineItem>
                        rowKey="id"
                        size="small"
                        pagination={false}
                        style={{ marginTop: 8 }}
                        dataSource={record.items}
                        locale={{ emptyText: 'No line items — no authoritative division evidence exists for this order.' }}
                        columns={[
                          { title: '#', dataIndex: 'lineNumber', key: 'lineNumber', width: 50 },
                          { title: 'Item Code', dataIndex: 'itemCode', key: 'itemCode' },
                          { title: 'Item Name', dataIndex: 'itemName', key: 'itemName' },
                          {
                            title: 'Item Division', key: 'itemDivision',
                            render: (_, l) => l.itemDivisionId
                              ? <Tag color="blue">{l.itemDivisionCode || divisionNameById.get(l.itemDivisionId) || l.itemDivisionId}</Tag>
                              : <Tag>NULL — no division on item master</Tag>,
                          },
                          { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 90 },
                        ]}
                      />
                      {detailLoading && <Spin size="small" style={{ marginTop: 8 }} />}
                    </div>
                  );
                },
              }}
            />
          )}
        </Card>

        {/* Item master review */}
        <Card
          title={<Space><ApartmentOutlined /><span>Item Master Review</span></Space>}
          style={{ marginBottom: 16 }}
        >
          <Paragraph type="secondary">
            Items referenced by the orders above. Only verified item-master{' '}
            <Text code>division_id</Text> values are authoritative — code prefixes,
            names, customers, warehouses and quotations are <Text strong>not</Text> division evidence.
          </Paragraph>
          <Table
            rowKey="itemCode"
            size="small"
            pagination={false}
            dataSource={itemReview}
            columns={[
              { title: 'Item Code', dataIndex: 'itemCode', key: 'itemCode' },
              { title: 'Item Name', dataIndex: 'itemName', key: 'itemName' },
              {
                title: 'Current Division', key: 'division',
                render: (_, r: any) => r.divisionId
                  ? <Tag color="green">{r.divisionCode || r.divisionId}</Tag>
                  : <Tag>NULL</Tag>,
              },
              {
                title: 'Used In Orders', dataIndex: 'orders', key: 'orders',
                render: (v: string[]) => v.join(', ') || '—',
              },
              {
                title: 'Conclusion', key: 'conclusion',
                render: (_, r: any) => r.divisionId
                  ? <Tag color="green" icon={<CheckCircleOutlined />}>VERIFIED</Tag>
                  : <Tag color="orange" icon={<CloseCircleOutlined />}>UNRESOLVED — no authoritative source</Tag>,
              },
              {
                title: 'Business Decision (draft)', key: 'decision',
                render: (_, r: any) => (
                  <Select
                    placeholder="Draft only"
                    value={drafts[`ITEM:${r.itemCode}`] || undefined}
                    onChange={(v) => setDraft(`ITEM:${r.itemCode}`, v as DraftDecision)}
                    style={{ minWidth: 220 }}
                    options={[
                      { value: 'GLOBAL_COMPANY_SCOPED', label: 'GLOBAL / COMPANY-SCOPED — keep NULL' },
                      { value: 'ASSIGN_EXPLICIT_DIVISION', label: 'Assign to specific division' },
                    ]}
                  />
                ),
              },
            ]}
          />
          <Divider />
          <Space wrap>
            <Badge status="warning" text="SLD-0001 / SLD-0002 / SLD-0003: no division anywhere in ERP (item master, BOM, routes, MR, PO, store, ledger all NULL or absent)" />
          </Space>
        </Card>

        {/* Approval gate */}
        <Card title="Business Approval Gate">
          <Paragraph>
            Draft decisions above are <Text strong>local only</Text> and change nothing.
            When the business has decided every order and item, use the existing
            approved mutation workflow — do not invent a shortcut here.
          </Paragraph>
          <Space>
            <Button type="primary" icon={<SafetyOutlined />} onClick={requestApprovalNote}>
              Record draft for approval (no database change)
            </Button>
            <Tooltip title="Mutations are disabled on this review page until final business approval.">
              <Button disabled>Approve &amp; backfill (disabled)</Button>
            </Tooltip>
          </Space>
          <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            Database mutations executed from this page: <Text strong>0</Text>.
          </Paragraph>
        </Card>
      </Spin>
    </div>
  );
};

export default SalesOrderDivisionReview;
