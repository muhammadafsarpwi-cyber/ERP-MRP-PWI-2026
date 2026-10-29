import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table, Tag, Input, Select, Button, Spin, Empty, Tooltip,
  Progress, Row, Col, Statistic, Card, Tabs, Badge, Modal,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, AppstoreOutlined, UnorderedListOutlined,
  TrophyOutlined, ShoppingCartOutlined, RocketOutlined, BarChartOutlined,
  UserOutlined, TagOutlined, DollarOutlined, InboxOutlined,
  LeftOutlined, RightOutlined, RightCircleOutlined, ClockCircleOutlined, CheckCircleOutlined,
  FileTextOutlined, ArrowLeftOutlined, FolderOpenOutlined, ContainerOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import apiService from '../../services/api';
import DraggableResizableModal from '../../components/shared/DraggableResizableModal';
import './CustomerAnalytics.css';

const { Option } = Select;

export interface SafetyItemDetail {
  itemCode: string;
  itemName: string;
  cartons: number;
  gross: number;
  pcs: number;
}

export interface SocItemDetail {
  key: string;
  itemCode: string;
  itemName: string;
  orderedQty: number;
  packedQty: number;
  dispatchedQty: number;
  remainingPendingQty: number;
  fulfillmentPct: number;
  isOrderItem?: boolean;
}

export interface SocContractSummary {
  orderId: string;
  socNumber: string;
  orderDate?: string;
  status: string;
  totalOrderedQty: number;
  totalPackedQty: number;
  totalDispatchedQty: number;
  totalPendingQty: number;
  fulfillmentPct: number;
  items: SocItemDetail[];
  isOfficialOrder?: boolean;
}

interface CustomerStat {
  id: string;
  customerCode: string;
  name: string;
  customerType?: string;
  totalOrders: number;
  totalOrderedGross: number;
  totalPackedGross: number;
  totalPackedCartons: number;
  totalDispatchedGross: number;
  totalDispatchedCartons: number;
  totalOrderValue: number;
  pendingGross: number;
  fulfillmentPct: number;
  readyToDispatchGross: number;
  readyToDispatchCartons: number;
  topItem?: string;
  orderNumbers?: string[];
  lastOrderDate?: string;
  isSafetyStock?: boolean;
  safetyItems?: SafetyItemDetail[];
  socContracts?: SocContractSummary[];
}

export interface ItemCustomerRef {
  customerId: string;
  customerName: string;
  customerCode?: string;
}

interface ItemStat {
  itemCode: string;
  itemName: string;
  totalGross: number;
  totalCartons: number;
  totalOrderedKgs: number;
  readyFgrGross: number;
  readyFgrCartons: number;
  readyFgrKgs: number;
  balancePendingGross: number;
  balancePendingCartons: number;
  balancePendingKgs: number;
  totalDispatchedGross?: number;
  totalDispatchedCartons?: number;
  weightPerPiece: number;
  grossPerCarton: number;
  customerCount: number;
  customerNames: string[];
  customers: ItemCustomerRef[];
}

interface ActionKpiCardProps {
  value: string | number;
  label: string;
  icon: React.ReactNode;
  gradient: string;
  actionText: string;
  onAction?: () => void;
  suffix?: string;
}

const ActionKpiCard: React.FC<ActionKpiCardProps> = ({
  value,
  label,
  icon,
  gradient,
  actionText,
  onAction,
  suffix,
}) => {
  return (
    <div
      onClick={onAction}
      className="action-kpi-card"
      style={{ background: gradient, cursor: onAction ? 'pointer' : 'default' }}
    >
      <div className="action-kpi-body">
        <div className="action-kpi-val">
          {value}
          {suffix ? <span style={{ fontSize: 13, marginLeft: 4, opacity: 0.9 }}>{suffix}</span> : null}
        </div>
        <div className="action-kpi-label">{label}</div>
        <div className="action-kpi-watermark">{icon}</div>
      </div>
      <div className="action-kpi-footer">
        <span>{actionText}</span>
        <RightCircleOutlined style={{ fontSize: 13 }} />
      </div>
    </div>
  );
};

const COLORS = [
  '#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e',
  '#8b5cf6', '#0ea5e9', '#84cc16', '#fb923c', '#e879f9',
];

export const getFulfillmentColor = (pct: number) => {
  if (pct >= 100) return '#10b981'; // Green (100% Completed / Packed)
  if (pct >= 75) return '#0ea5e9'; // Cyan / Sky
  if (pct >= 50) return '#f59e0b'; // Amber / Gold
  if (pct > 0) return '#f97316'; // Orange
  return '#ef4444'; // Red (0% Unfulfilled / Pending)
};

interface PackedEntryInfo {
  id: string;
  customerName: string;
  socNo: string;
  cartons: number;
  gross: number;
  pcs: number;
  fgItemName?: string;
  fgItemCode?: string;
  date?: string;
  isSafetyStock: boolean;
}

function parsePackingEntry(e: any): PackedEntryInfo | null {
  if (!e) return null;
  const rem = String(e.remarks || '');
  const machineNo = String(e.machineNo || e.machine_no || '');
  if (!rem.includes('[HAND PACKING]') && !machineNo.toUpperCase().startsWith('HAND-PACK')) return null;

  const custMatch = rem.match(/Customer:\s*([^|—\n]+)/i);
  const socMatch = rem.match(/SOC:\s*([^|—\n]+)/i);
  const qtyMatch = rem.match(/Cartons:\s*([\d.]+)\s*\(([\d.]+)\s*Gross(?:\s*\/\s*([\d.]+)\s*PCS)?/i) ||
                   rem.match(/Total:\s*([\d.]+)\s*Cartons\s*\(([\d.]+)\s*Gross/i);
  const ctnOnlyMatch = rem.match(/Cartons:\s*([\d.]+)/i) || rem.match(/\[([\d.]+)\s*CTN/i);
  const grossOnlyMatch = rem.match(/\(([\d.]+)\s*Gross/i) || rem.match(/Gross:\s*([\d.]+)/i) || rem.match(/([\d.]+)\s*GRS/i);

  const rawPcs = Number(e.actualQuantity || e.actual_quantity || 0);
  const cartons = qtyMatch ? parseFloat(qtyMatch[1]) : (ctnOnlyMatch ? parseFloat(ctnOnlyMatch[1]) : (rawPcs > 0 ? Math.round(rawPcs / 1440) : 0));
  const gross = qtyMatch ? parseFloat(qtyMatch[2]) : (grossOnlyMatch ? parseFloat(grossOnlyMatch[1]) : (cartons * 10 || Math.round(rawPcs / 144)));
  const pcs = qtyMatch && qtyMatch[3] ? parseFloat(qtyMatch[3]) : (rawPcs > 0 ? rawPcs : cartons * 1440);

  let custName = custMatch ? custMatch[1].trim() : '';
  let socNo = socMatch ? socMatch[1].trim() : '';

  const isSafetyStock =
    custName.toUpperCase().replace(/[\s_-]+/g, '') === 'SAFETYSTOCK' ||
    socNo.toUpperCase().replace(/[\s_-]+/g, '') === 'SAFETYSTOCK' ||
    rem.toUpperCase().includes('CUSTOMER: SAFETY') ||
    rem.toUpperCase().includes('SOC: SAFETY_STOCK') ||
    rem.toUpperCase().includes('SAFETY STOCK');

  if (isSafetyStock) {
    custName = 'SAFETY STOCK';
    socNo = 'SAFETY_STOCK';
  }

  return {
    id: String(e.id),
    customerName: custName,
    socNo,
    cartons,
    gross,
    pcs,
    fgItemName: e.item?.name || '',
    fgItemCode: e.item?.itemCode || '',
    date: e.entryDate || e.entry_date || e.createdAt,
    isSafetyStock,
  };
}

function parseOpenStockEntry(os: any): PackedEntryInfo | null {
  if (!os) return null;
  const notes = String(os.notes || '');
  const custMatch = notes.match(/Customer:\s*([^|\]]+)/i);
  const socMatch = notes.match(/SOC:\s*([^|\]]+)/i);
  const ctnMatch = notes.match(/Cartons:\s*([\d.]+)/i) || notes.match(/\[([\d.]+)\s*CTN/i);
  const grossMatch = notes.match(/Gross:\s*([\d.]+)/i) || notes.match(/([\d.]+)\s*GRS/i);

  const pcs = Number(os.quantity || 0);
  if (pcs <= 0) return null;
  const cartons = ctnMatch ? Number(ctnMatch[1]) : Math.round(pcs / 1440);
  const gross = grossMatch ? Number(grossMatch[1]) : Math.round(pcs / 144);
  let custName = custMatch ? custMatch[1].trim() : (os.customerName || 'General Stock');
  let socNo = socMatch ? socMatch[1].trim() : (os.socNo || '—');

  const isSafetyStock =
    custName.toUpperCase().replace(/[\s_-]+/g, '') === 'SAFETYSTOCK' ||
    socNo.toUpperCase().replace(/[\s_-]+/g, '') === 'SAFETYSTOCK' ||
    notes.toUpperCase().includes('CUSTOMER: SAFETY') ||
    notes.toUpperCase().includes('SOC: SAFETY');

  if (isSafetyStock) {
    custName = 'SAFETY STOCK';
    socNo = 'SAFETY_STOCK';
  }

  return {
    id: String(os.id),
    customerName: custName,
    socNo,
    cartons,
    gross,
    pcs,
    fgItemName: os.itemName || os.item?.name || '',
    fgItemCode: os.itemCode || os.item?.itemCode || '',
    date: os.transactionDate || os.createdAt,
    isSafetyStock,
  };
}

const fmtNum = (n: number, dec = 0) =>
  n === undefined || n === null || isNaN(n)
    ? '—'
    : n.toLocaleString('en-PK', { maximumFractionDigits: dec, minimumFractionDigits: dec });

function getCustomerDisplayName(c: any): string {
  if (!c) return '';
  const raw = c.companyName || c.company_name || c.name || c.customerName || c.customer_name || c.contactPerson || c.contact_person;
  if (typeof raw === 'string' && raw.trim() && raw.trim().toLowerCase() !== 'unknown') {
    return raw.trim();
  }
  return '';
}

function getCustomerDisplayCode(c: any): string {
  if (!c) return '';
  const raw = c.customerCode || c.customer_code || c.code;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return '';
}

const CustomerAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'orders' | 'dispatched' | 'packed' | 'value' | 'pending' | 'ready'>('dispatched');
  const [chartView, setChartView] = useState<'customers' | 'items'>('customers');
  const [customerPage, setCustomerPage] = useState(1);
  const [customers, setCustomers] = useState<CustomerStat[]>([]);
  const [itemStats, setItemStats] = useState<ItemStat[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'done' | 'all' | 'items'>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedSocNumber, setSelectedSocNumber] = useState<string | null>(null);

  const openCustomerSocModal = useCallback((c: CustomerStat) => {
    setSelectedCustomerId(c.id);
    setSelectedSocNumber(null);
  }, []);

  const closeCustomerSocModal = useCallback(() => {
    setSelectedCustomerId(null);
    setSelectedSocNumber(null);
  }, []);

  const openCustomerByNameOrRef = useCallback(
    (refOrName: ItemCustomerRef | string) => {
      const targetId = typeof refOrName === 'object' ? refOrName.customerId : '';
      const targetName = (typeof refOrName === 'object' ? refOrName.customerName : refOrName)
        .trim()
        .toLowerCase();

      const found =
        (targetId ? customers.find((c) => c.id === targetId && !c.isSafetyStock) : undefined) ||
        customers.find(
          (c) =>
            !c.isSafetyStock &&
            (c.name.trim().toLowerCase() === targetName ||
              c.name.trim().toLowerCase().includes(targetName) ||
              targetName.includes(c.name.trim().toLowerCase()))
        );

      if (found) {
        openCustomerSocModal(found);
      }
    },
    [customers, openCustomerSocModal]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load sales orders, deliveries, registered customers, hand packing entries, and FGR stock matrix in parallel
      const [
        ordersRes,
        deliveriesRes,
        salesCustRes,
        masterCustRes,
        prodRes,
        openStockRes,
        matrixRes,
        prodItemsRes,
      ] = await Promise.allSettled([
        apiService.get('/sales/orders?limit=500&status=all'),
        apiService.get('/sales/deliveries?limit=500&status=all'),
        apiService.get('/sales/orders/meta/customers'),
        apiService.get('/customer/customers?limit=500'),
        apiService.get('/production/entries?machineNo=HAND-PACK&limit=500'),
        apiService.get('/production/open-stock/history?limit=200'),
        apiService.get('/production/open-stock/matrix'),
        apiService.get('/production/open-stock/items'),
      ]);

      const rawOrders: any[] = ordersRes.status === 'fulfilled'
        ? ((ordersRes.value as any)?.data?.data || (ordersRes.value as any)?.data || [])
        : [];
      const rawDeliveries: any[] = deliveriesRes.status === 'fulfilled'
        ? ((deliveriesRes.value as any)?.data?.data || (deliveriesRes.value as any)?.data || [])
        : [];

      // Exclude uncommitted orders (DRAFT, CANCELLED, VOID) — active demand must strictly derive from committed SOCs
      const isCommittedOrder = (o: any) => {
        if (!o) return false;
        const s = String(o.status || '').toUpperCase().trim();
        return s !== 'DRAFT' && s !== 'CANCELLED' && s !== 'VOID';
      };
      const orders: any[] = rawOrders.filter(isCommittedOrder);

      // Exclude cancelled / draft deliveries
      const deliveries: any[] = rawDeliveries.filter((d: any) => {
        if (!d) return false;
        const s = String(d.status || '').toUpperCase().trim();
        return s !== 'CANCELLED' && s !== 'DRAFT' && s !== 'VOID';
      });
      const salesCustList: any[] = salesCustRes.status === 'fulfilled'
        ? ((salesCustRes.value as any)?.data?.data || (salesCustRes.value as any)?.data || [])
        : [];
      const masterCustList: any[] = masterCustRes.status === 'fulfilled'
        ? ((masterCustRes.value as any)?.data?.data || (masterCustRes.value as any)?.data || [])
        : [];
      const prodEntries: any[] = prodRes.status === 'fulfilled'
        ? ((prodRes.value as any)?.data?.data || (prodRes.value as any)?.data || [])
        : [];
      const openStockEntries: any[] = openStockRes.status === 'fulfilled'
        ? ((openStockRes.value as any)?.data?.data || (openStockRes.value as any)?.data || [])
        : [];
      const matrixRows: any[] = matrixRes.status === 'fulfilled'
        ? ((matrixRes.value as any)?.data?.data || (matrixRes.value as any)?.data || [])
        : [];
      const prodItemsList: any[] = prodItemsRes.status === 'fulfilled'
        ? ((prodItemsRes.value as any)?.data?.data || (prodItemsRes.value as any)?.data || [])
        : [];

      // Build customer directory mapping ID and code to real genuine names
      const customerDirectory = new Map<string, { id: string; name: string; code: string; type: string }>();

      const registerToDirectory = (c: any) => {
        if (!c) return;
        const id = c.id || c.customerId || c.customer_id;
        const name = getCustomerDisplayName(c);
        const code = getCustomerDisplayCode(c);
        const type = c.customerType || c.customer_type || 'B2B';
        if (id) {
          const prev = customerDirectory.get(id);
          customerDirectory.set(id, {
            id,
            name: name || prev?.name || (code ? `Customer (${code})` : 'Customer'),
            code: code || prev?.code || '',
            type: type || prev?.type || 'B2B',
          });
        }
        if (code && !customerDirectory.has(code)) {
          customerDirectory.set(code, {
            id: id || code,
            name: name || `Customer (${code})`,
            code,
            type,
          });
        }
      };

      salesCustList.forEach(registerToDirectory);
      masterCustList.forEach(registerToDirectory);
      orders.forEach((o) => { if (o.customer) registerToDirectory(o.customer); });
      deliveries.forEach((d) => { if (d.customer) registerToDirectory(d.customer); });

      // Build customer map from orders and track per-customer SOC contracts
      const custMap = new Map<string, CustomerStat>();
      const custSocMap = new Map<string, SocContractSummary[]>();

      const normKey = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const findOrCreateSocItem = (soc: SocContractSummary, code: string, name: string): SocItemDetail => {
        const nCode = normKey(code);
        const nName = normKey(name);
        let found = soc.items.find((it) => {
          const itCode = normKey(it.itemCode);
          const itName = normKey(it.itemName);
          if (nCode && itCode && nCode === itCode) return true;
          if (nName && itName && (nName === itName || itName.includes(nName) || nName.includes(itName))) return true;
          return false;
        });
        if (!found) {
          found = {
            key: `${soc.socNumber}-${code || name || soc.items.length + 1}`,
            itemCode: code || 'FG-ITEM',
            itemName: name || code || 'Finished Goods Item',
            orderedQty: 0,
            packedQty: 0,
            dispatchedQty: 0,
            remainingPendingQty: 0,
            fulfillmentPct: 0,
          };
          soc.items.push(found);
        }
        return found;
      };

      for (const order of orders) {
        const custId = order.customerId || order.customer_id || order.customer?.id;
        if (!custId) continue;

        const info = customerDirectory.get(custId) ||
          (order.customer ? {
            id: custId,
            name: getCustomerDisplayName(order.customer),
            code: getCustomerDisplayCode(order.customer),
            type: order.customer?.customerType || 'B2B',
          } : null);

        const custCode = info?.code || getCustomerDisplayCode(order.customer) || '';
        const custName = info?.name || getCustomerDisplayName(order.customer) || (custCode ? `Customer (${custCode})` : 'Customer');
        const custType = info?.type || order.customer?.customerType || 'B2B';
        const orderNo = String(order.orderNumber || order.order_number || order.socNumber || order.id || '');
        const orderDate = order.orderDate || order.order_date || order.createdAt;

        if (!custMap.has(custId)) {
          custMap.set(custId, {
            id: custId,
            customerCode: custCode,
            name: custName,
            customerType: custType,
            totalOrders: 0,
            totalOrderedGross: 0,
            totalDispatchedGross: 0,
            totalDispatchedCartons: 0,
            totalOrderValue: 0,
            pendingGross: 0,
            fulfillmentPct: 0,
            readyToDispatchGross: 0,
            readyToDispatchCartons: 0,
            totalPackedGross: 0,
            totalPackedCartons: 0,
            topItem: '',
            orderNumbers: [],
            lastOrderDate: orderDate,
            socContracts: [],
          });
        }

        const stat = custMap.get(custId)!;
        stat.totalOrders += 1;
        if (orderNo && !stat.orderNumbers?.includes(orderNo)) stat.orderNumbers?.push(orderNo);
        if (orderDate && (!stat.lastOrderDate || orderDate > stat.lastOrderDate)) {
          stat.lastOrderDate = orderDate;
        }

        if (!custSocMap.has(custId)) {
          custSocMap.set(custId, []);
        }
        const custSocs = custSocMap.get(custId)!;
        const socNumberLabel = orderNo || `SOC-${custSocs.length + 1}`;
        let socEntry = custSocs.find(
          (s) => (order.id && s.orderId === String(order.id)) || normKey(s.socNumber) === normKey(socNumberLabel)
        );
        if (!socEntry) {
          socEntry = {
            orderId: String(order.id || socNumberLabel),
            socNumber: socNumberLabel,
            orderDate,
            status: String(order.status || 'ACTIVE').toUpperCase(),
            totalOrderedQty: 0,
            totalPackedQty: 0,
            totalDispatchedQty: 0,
            totalPendingQty: 0,
            fulfillmentPct: 0,
            items: [],
            isOfficialOrder: true,
          };
          custSocs.push(socEntry);
        }

        // Sum order items
        const items = order.items || order.orderItems || order.lines || [];
        for (const item of items) {
          const itemObj = item.item || {};
          const code = itemObj.itemCode || item.itemCode || item.item_code || '';
          const name = itemObj.name || item.description || item.itemName || item.item_name || code || 'Item';
          const qty = Number(item.quantity || item.qty || 0);
          const lineTotal = Number(item.lineTotal || item.line_total || (qty * Number(item.unitPrice || item.unit_price || 0)));

          stat.totalOrderedGross += qty;
          stat.totalOrderValue += lineTotal;

          if (!stat.topItem && name) {
            stat.topItem = name;
          }

          const socItem = findOrCreateSocItem(socEntry, code, name);
          socItem.orderedQty += qty;
          socItem.isOrderItem = true;
        }
      }

      // Add delivered/dispatched quantities
      for (const delivery of deliveries) {
        if (String(delivery.status || '').toUpperCase() === 'CANCELLED') continue;

        const custId = delivery.customerId || delivery.customer_id || delivery.customer?.id;
        if (!custId) continue;

        if (!custMap.has(custId)) {
          const info = customerDirectory.get(custId);
          const custCode = info?.code || getCustomerDisplayCode(delivery.customer) || '';
          const custName = info?.name || getCustomerDisplayName(delivery.customer) || (custCode ? `Customer (${custCode})` : 'Customer');
          const custType = info?.type || delivery.customer?.customerType || 'B2B';
          custMap.set(custId, {
            id: custId,
            customerCode: custCode,
            name: custName,
            customerType: custType,
            totalOrders: 0,
            totalOrderedGross: 0,
            totalDispatchedGross: 0,
            totalDispatchedCartons: 0,
            totalOrderValue: 0,
            pendingGross: 0,
            fulfillmentPct: 0,
            readyToDispatchGross: 0,
            readyToDispatchCartons: 0,
            totalPackedGross: 0,
            totalPackedCartons: 0,
            topItem: '',
            orderNumbers: [],
            lastOrderDate: delivery.deliveryDate || delivery.created_at,
            socContracts: [],
          });
        }

        const stat = custMap.get(custId)!;
        if (!custSocMap.has(custId)) {
          custSocMap.set(custId, []);
        }
        const custSocs = custSocMap.get(custId)!;

        const delivOrderId = String(delivery.salesOrderId || delivery.sales_order_id || delivery.salesOrder?.id || '');
        const delivSocNo = String(
          delivery.salesOrderNumber ||
          delivery.sales_order_number ||
          delivery.salesOrder?.orderNumber ||
          delivery.salesOrder?.order_number ||
          delivery.socNumber ||
          delivery.soc_no ||
          ''
        );
        const lines = delivery.lines || delivery.items || [];
        for (const line of lines) {
          const lineItemObj = line.item || {};
          const code = lineItemObj.itemCode || line.itemCode || line.item_code || '';
          const name = lineItemObj.name || line.description || line.itemName || line.item_name || code || 'Item';
          const qty = Number(line.quantity || line.qty || 0);
          const pkgSize = Number(lineItemObj.packagingSize || line.packageQuantity || line.packagingSize || 10);
          stat.totalDispatchedGross += qty;
          stat.totalDispatchedCartons += qty > 0 && pkgSize > 0 ? Math.round(qty / pkgSize) : 0;
          if (!stat.topItem) {
            stat.topItem = name;
          }

          if (qty <= 0) continue;

          // Check line-level SOC first: e.g. [SOC: SOC-2026-05814] or line.socNumber / line.salesOrderNumber
          const lineSocMatch = (line.description || '').match(/\[SOC:\s*([^\]]+)\]/i) || (line.description || '').match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
          const lineSocNo = line.socNumber || line.salesOrderNumber || (lineSocMatch ? lineSocMatch[1].trim() : '');
          const lineOrderId = line.salesOrderId || line.orderId || '';

          const nLineSoc = normKey(lineSocNo);
          let targetSoc: SocContractSummary | undefined;

          // Priority 1: Match specifically by line-level SOC number or line-level order ID
          if (lineOrderId || nLineSoc) {
            targetSoc = custSocs.find(
              (s) =>
                (lineOrderId && s.orderId === lineOrderId) ||
                (nLineSoc && (normKey(s.socNumber) === nLineSoc || normKey(s.socNumber).endsWith(nLineSoc) || nLineSoc.endsWith(normKey(s.socNumber))))
            );
          }

          // Priority 2: Fallback to delivery header SOC number or delivery header order ID
          if (!targetSoc) {
            const nDelivSoc = normKey(delivSocNo);
            targetSoc = custSocs.find(
              (s) =>
                (delivOrderId && s.orderId === delivOrderId) ||
                (nDelivSoc && (normKey(s.socNumber) === nDelivSoc || normKey(s.socNumber).endsWith(nDelivSoc) || nDelivSoc.endsWith(normKey(s.socNumber))))
            );
          }

          if (targetSoc) {
            // Strictly match against items ordered in this SOC
            const nCode = normKey(code);
            const nName = normKey(name);
            let socItem = targetSoc.items.find((it) => {
              const itCode = normKey(it.itemCode);
              const itName = normKey(it.itemName);
              if (nCode && itCode && nCode === itCode) return true;
              if (nName && itName && (nName === itName || itName.includes(nName) || nName.includes(itName))) return true;
              return false;
            });

            // Single-item fallback ONLY if item code matches or is absent
            if (!socItem && targetSoc.items.length === 1) {
              const singleIt = targetSoc.items[0];
              const singleCode = normKey(singleIt.itemCode);
              if (!nCode || !singleCode || nCode === singleCode) {
                socItem = singleIt;
              }
            }

            if (socItem) {
              socItem.dispatchedQty += qty;
            } else {
              const created = findOrCreateSocItem(targetSoc, code, name);
              created.dispatchedQty += qty;
            }
          } else if (custSocs.length > 0) {
            // Allocate FIFO strictly across customer's SOCs that ALREADY have this ordered item
            let remainingToAllocate = qty;
            const nCode = normKey(code);
            const nName = normKey(name);
            const matchingItems: SocItemDetail[] = [];

            for (const s of custSocs) {
              for (const it of s.items) {
                const itCode = normKey(it.itemCode);
                const itName = normKey(it.itemName);
                if ((nCode && itCode && nCode === itCode) || (nName && itName && (nName === itName || itName.includes(nName) || nName.includes(itName)))) {
                  matchingItems.push(it);
                }
              }
            }

            if (matchingItems.length > 0) {
              for (const it of matchingItems) {
                const room = Math.max(0, it.orderedQty - it.dispatchedQty);
                if (room > 0 && remainingToAllocate > 0) {
                  const alloc = Math.min(room, remainingToAllocate);
                  it.dispatchedQty += alloc;
                  remainingToAllocate -= alloc;
                }
              }
              if (remainingToAllocate > 0) {
                matchingItems[matchingItems.length - 1].dispatchedQty += remainingToAllocate;
              }
            }
            // If no matching item exists across existing orders, do NOT inject ghost items
          } else {
            // Customer has delivery without an order record in orders list
            const synthSocNo = delivSocNo || `SOC-${stat.customerCode || 'DIRECT'}`;
            const newSoc: SocContractSummary = {
              orderId: delivOrderId || synthSocNo,
              socNumber: synthSocNo,
              orderDate: delivery.deliveryDate || delivery.created_at,
              status: 'DISPATCHED',
              totalOrderedQty: 0,
              totalPackedQty: 0,
              totalDispatchedQty: 0,
              totalPendingQty: 0,
              fulfillmentPct: 100,
              items: [],
            };
            custSocs.push(newSoc);
            targetSoc = newSoc;
            const socItem = findOrCreateSocItem(newSoc, code, name);
            socItem.dispatchedQty += qty;
          }
        }
      }

      // Parse all hand-packing and opening-stock entries
      const allPackedEntries: PackedEntryInfo[] = [];
      prodEntries.forEach((e) => {
        const p = parsePackingEntry(e);
        if (p) allPackedEntries.push(p);
      });
      openStockEntries.forEach((os) => {
        const p = parseOpenStockEntry(os);
        if (p) allPackedEntries.push(p);
      });

      // Group packed quantities: safety stock buffer vs customer packed stock
      const safetyBatches: PackedEntryInfo[] = [];
      const custPackedMap = new Map<string, { gross: number; cartons: number; topItem?: string }>();

      const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const findMatchingCustomerId = (rawName: string) => {
        if (!rawName) return null;
        const nTarget = norm(rawName);
        for (const [id, dir] of customerDirectory.entries()) {
          const nDirName = norm(dir.name);
          const nDirCode = norm(dir.code);
          if (nDirName && (nTarget === nDirName || nDirName.includes(nTarget) || nTarget.includes(nDirName))) {
            return dir.id;
          }
          if (nDirCode && nTarget === nDirCode) {
            return dir.id;
          }
        }
        for (const [id, stat] of custMap.entries()) {
          const nStatName = norm(stat.name);
          const nStatCode = norm(stat.customerCode);
          if (nStatName && (nTarget === nStatName || nStatName.includes(nTarget) || nTarget.includes(nStatName))) {
            return id;
          }
          if (nStatCode && nTarget === nStatCode) {
            return id;
          }
        }
        return null;
      };

      for (const entry of allPackedEntries) {
        if (entry.isSafetyStock) {
          safetyBatches.push(entry);
          continue;
        }

        const matchedCustId = findMatchingCustomerId(entry.customerName);
        if (matchedCustId) {
          const prev = custPackedMap.get(matchedCustId) || { gross: 0, cartons: 0, topItem: '' };
          custPackedMap.set(matchedCustId, {
            gross: prev.gross + entry.gross,
            cartons: prev.cartons + entry.cartons,
            topItem: prev.topItem || entry.fgItemName || '',
          });

          if (!custSocMap.has(matchedCustId)) {
            custSocMap.set(matchedCustId, []);
          }
          const custSocs = custSocMap.get(matchedCustId)!;
          const rawSoc = String(entry.socNo || '').trim();
          const nEntrySoc = normKey(rawSoc);

          let matchedSoc = nEntrySoc && rawSoc !== '—'
            ? custSocs.find((s) => {
                const nSoc = normKey(s.socNumber);
                return nSoc === nEntrySoc || nSoc.endsWith(nEntrySoc) || nEntrySoc.endsWith(nSoc);
              })
            : undefined;

          const pCode = entry.fgItemCode || '';
          const pName = entry.fgItemName || '';

          if (matchedSoc) {
            const nCode = normKey(pCode);
            const nName = normKey(pName);
            const socItem = matchedSoc.items.find((it) => {
              const itCode = normKey(it.itemCode);
              const itName = normKey(it.itemName);
              if (nCode && itCode && nCode === itCode) return true;
              if (nName && itName && (nName === itName || itName.includes(nName) || nName.includes(itName))) return true;
              return false;
            }) || (matchedSoc.items.length === 1 ? matchedSoc.items[0] : null);

            if (socItem) {
              socItem.packedQty += entry.gross;
            } else if (!matchedSoc.isOfficialOrder) {
              const created = findOrCreateSocItem(matchedSoc, pCode, pName);
              created.packedQty += entry.gross;
            }
          } else if (custSocs.length > 0) {
            // Match by item across customer's SOCs in FIFO order
            let remPacked = entry.gross;
            const nCode = normKey(pCode);
            const nName = normKey(pName);
            const candidateItems: SocItemDetail[] = [];

            for (const s of custSocs) {
              for (const it of s.items) {
                const itCode = normKey(it.itemCode);
                const itName = normKey(it.itemName);
                if ((nCode && itCode && nCode === itCode) || (nName && itName && (nName === itName || itName.includes(nName) || nName.includes(itName)))) {
                  candidateItems.push(it);
                }
              }
            }

            if (candidateItems.length > 0) {
              for (const it of candidateItems) {
                const room = Math.max(0, it.orderedQty - it.packedQty);
                if (room > 0 && remPacked > 0) {
                  const alloc = Math.min(room, remPacked);
                  it.packedQty += alloc;
                  remPacked -= alloc;
                }
              }
              if (remPacked > 0) {
                candidateItems[candidateItems.length - 1].packedQty += remPacked;
              }
            }
            // If no matching item exists across existing orders, do NOT inject ghost items
          } else {
            const synthSocNo = (rawSoc && rawSoc !== '—') ? rawSoc : 'SOC-PACKED';
            const newSoc: SocContractSummary = {
              orderId: synthSocNo,
              socNumber: synthSocNo,
              orderDate: entry.date,
              status: 'PACKED',
              totalOrderedQty: 0,
              totalPackedQty: 0,
              totalDispatchedQty: 0,
              totalPendingQty: 0,
              fulfillmentPct: 0,
              items: [],
            };
            custSocs.push(newSoc);
            const socItem = findOrCreateSocItem(newSoc, pCode, pName);
            socItem.packedQty += entry.gross;
          }
        }
      }

      // Calculate fulfillment %, totalPacked, readyToDispatch, and finalized SOC contracts for regular customers
      const result: CustomerStat[] = Array.from(custMap.values()).map((c) => {
        const packed = custPackedMap.get(c.id) || { gross: 0, cartons: 0, topItem: '' };

        // Core business formula requested by user: Packed - Dispatched = Ready to Dispatch (P - D)
        const readyToDispatchGross = Math.max(0, Math.round((packed.gross - c.totalDispatchedGross) * 100) / 100);
        const readyToDispatchCartons =
          packed.gross > 0 && packed.cartons > 0
            ? Math.round((readyToDispatchGross / packed.gross) * packed.cartons)
            : Math.round(readyToDispatchGross / 10);

        const rawSocs = custSocMap.get(c.id) || [];
        const finalizedSocs: SocContractSummary[] = rawSocs.map((soc) => {
          const isDelivered = String(soc.status).toUpperCase() === 'DELIVERED' || String(soc.status).toUpperCase() === 'CLOSED';

          // Strictly filter out ghost items: For official contracts, only include items that were actually ordered
          const itemsToProcess = soc.isOfficialOrder
            ? soc.items.filter((it) => it.isOrderItem || it.orderedQty > 0)
            : soc.items.filter((it) => it.orderedQty > 0 || it.dispatchedQty > 0 || it.packedQty > 0);

          const finalizedItems: SocItemDetail[] = itemsToProcess.map((it) => {
            const orderedQty = Math.round(it.orderedQty * 100) / 100;
            const packedQty = Math.round(it.packedQty * 100) / 100;
            let dispatchedQty = Math.round(it.dispatchedQty * 100) / 100;
            let remainingPendingQty = Math.max(0, Math.round((orderedQty - dispatchedQty) * 100) / 100);

            // THE ULTIMATE RULE:
            // If Order Status = Delivered, then DELIVERED quantity must equal ORDERED quantity,
            // and REMAINING must automatically reduce to 0.
            if (isDelivered) {
              dispatchedQty = orderedQty;
              remainingPendingQty = 0;
            }

            const itemPct =
              orderedQty > 0
                ? Math.min(100, Math.round((dispatchedQty / orderedQty) * 100))
                : (dispatchedQty > 0 ? 100 : 0);
            return {
              ...it,
              orderedQty,
              packedQty,
              dispatchedQty,
              remainingPendingQty,
              fulfillmentPct: isDelivered ? 100 : itemPct,
            };
          });

          const totalOrderedQty = Math.round(finalizedItems.reduce((s, i) => s + i.orderedQty, 0) * 100) / 100;
          const totalPackedQty = Math.round(finalizedItems.reduce((s, i) => s + i.packedQty, 0) * 100) / 100;
          let totalDispatchedQty = Math.round(finalizedItems.reduce((s, i) => s + i.dispatchedQty, 0) * 100) / 100;
          let totalPendingQty = Math.max(0, Math.round((totalOrderedQty - totalDispatchedQty) * 100) / 100);

          if (isDelivered) {
            totalDispatchedQty = totalOrderedQty;
            totalPendingQty = 0;
          }

          const socPct =
            isDelivered
              ? 100
              : (totalOrderedQty > 0
                ? Math.min(100, Math.round((totalDispatchedQty / totalOrderedQty) * 100))
                : (totalDispatchedQty > 0 ? 100 : 0));

          return {
            ...soc,
            totalOrderedQty,
            totalPackedQty,
            totalDispatchedQty,
            totalPendingQty,
            fulfillmentPct: socPct,
            items: finalizedItems,
          };
        });

        // Sort SOCs so contracts with pending quantities appear first
        finalizedSocs.sort((a, b) => b.totalPendingQty - a.totalPendingQty);

        // System-wide strict sync: Customer Card figures MUST match the exact sum of verified SOC contracts
        const totalOrderedGross = finalizedSocs.length > 0
          ? Math.round(finalizedSocs.reduce((s, x) => s + x.totalOrderedQty, 0) * 100) / 100
          : Math.round(c.totalOrderedGross * 100) / 100;
        const totalDispatchedGross = finalizedSocs.length > 0
          ? Math.round(finalizedSocs.reduce((s, x) => s + x.totalDispatchedQty, 0) * 100) / 100
          : Math.round(c.totalDispatchedGross * 100) / 100;
        const pendingGross = Math.max(0, Math.round((totalOrderedGross - totalDispatchedGross) * 100) / 100);
        const totalOrders = finalizedSocs.length > 0 ? finalizedSocs.length : c.totalOrders;

        const custFulfillmentPct =
          totalOrderedGross > 0
            ? Math.min(100, Math.round((totalDispatchedGross / totalOrderedGross) * 100))
            : (totalDispatchedGross > 0 ? 100 : 0);

        return {
          ...c,
          totalOrders,
          totalOrderedGross,
          totalDispatchedGross,
          totalPackedGross: packed.gross,
          totalPackedCartons: packed.cartons,
          pendingGross,
          fulfillmentPct: custFulfillmentPct,
          readyToDispatchGross,
          readyToDispatchCartons,
          topItem: c.topItem || packed.topItem || '',
          isSafetyStock: false,
          socContracts: finalizedSocs,
        };
      });

      // Aggregate Safety Stock items by item code and item name
      const safetyItemsMap = new Map<string, SafetyItemDetail>();
      for (const b of safetyBatches) {
        const itemCode = b.fgItemCode || 'SPI-FG-SPK-006';
        const itemName = b.fgItemName || '300X17 S9 Spoke & Nipple (Safety Stock Buffer)';
        const key = itemCode;
        const prev = safetyItemsMap.get(key) || { itemCode, itemName, cartons: 0, gross: 0, pcs: 0 };
        safetyItemsMap.set(key, {
          itemCode,
          itemName: prev.itemName && prev.itemName !== 'Item' ? prev.itemName : itemName,
          cartons: Math.round((prev.cartons + b.cartons) * 100) / 100,
          gross: Math.round((prev.gross + b.gross) * 100) / 100,
          pcs: Math.round(prev.pcs + b.pcs),
        });
      }
      const safetyItems = Array.from(safetyItemsMap.values()).sort((a, b) => b.cartons - a.cartons);

      // Add dedicated SAFETY STOCK customer card
      const totalSafetyGross = Math.round(safetyBatches.reduce((s, b) => s + b.gross, 0));
      const totalSafetyCartons = Math.round(safetyBatches.reduce((s, b) => s + b.cartons, 0));
      const topSafetyItem = safetyItems[0]?.itemName || 'Finished Goods Safety Buffer Stock';
      const lastSafetyDate = safetyBatches[0]?.date || new Date().toISOString().slice(0, 10);

      const safetyStockStat: CustomerStat = {
        id: 'cust-safety-stock-buffer-01',
        customerCode: 'BUFF-SAFE-01',
        name: 'SAFETY STOCK',
        customerType: 'BUFFER_STOCK',
        totalOrders: safetyBatches.length,
        totalOrderedGross: totalSafetyGross,
        totalPackedGross: totalSafetyGross,
        totalPackedCartons: totalSafetyCartons,
        totalDispatchedGross: 0,
        totalDispatchedCartons: 0,
        totalOrderValue: 0,
        pendingGross: 0,
        fulfillmentPct: 100, // 100% available ready buffer
        readyToDispatchGross: totalSafetyGross,
        readyToDispatchCartons: totalSafetyCartons,
        topItem: topSafetyItem,
        orderNumbers: [],
        lastOrderDate: lastSafetyDate,
        isSafetyStock: true,
        safetyItems,
      };

      result.push(safetyStockStat);

      // Sort by dispatched volume by default, keeping active dispatches on top
      result.sort((a, b) => {
        if (a.isSafetyStock && b.totalDispatchedGross > 0) return 1;
        if (b.isSafetyStock && a.totalDispatchedGross > 0) return -1;
        return b.totalDispatchedGross - a.totalDispatchedGross;
      });

      setCustomers(result);

      // Build item metadata lookup (weightPerPiece, packagingSize, FGR warehouse ready stock)
      const itemMetaMap = new Map<
        string,
        {
          weightPerPiece: number;
          packagingSize: number;
          matrixFgrGross: number;
          matrixFgrCartons: number;
          matrixFgrKgs: number;
        }
      >();

      const registerItemMeta = (
        rawCode: string,
        rawName: string,
        wpp: number,
        pkg: number,
        fgrGross = 0,
        fgrCartons = 0,
        fgrKgs = 0
      ) => {
        const keys = [normKey(rawCode), normKey(rawName)].filter(Boolean);
        for (const k of keys) {
          const prev = itemMetaMap.get(k) || {
            weightPerPiece: 0,
            packagingSize: 0,
            matrixFgrGross: 0,
            matrixFgrCartons: 0,
            matrixFgrKgs: 0,
          };
          itemMetaMap.set(k, {
            weightPerPiece: wpp > 0 ? wpp : prev.weightPerPiece,
            packagingSize: pkg > 0 ? pkg : prev.packagingSize,
            matrixFgrGross: prev.matrixFgrGross + fgrGross,
            matrixFgrCartons: prev.matrixFgrCartons + fgrCartons,
            matrixFgrKgs: prev.matrixFgrKgs + fgrKgs,
          });
        }
      };

      for (const pIt of prodItemsList) {
        const wpp =
          Number(pIt.weightPerPiece) > 0
            ? Number(pIt.weightPerPiece)
            : Number(pIt.piecesPerKg) > 0
            ? 1 / Number(pIt.piecesPerKg)
            : 0;
        const pkg = Number(pIt.packagingSize) || 0;
        registerItemMeta(pIt.itemCode || '', pIt.name || pIt.itemName || '', wpp, pkg);
      }

      for (const whRow of matrixRows) {
        const isFgrWh = Boolean(
          whRow.isFgWarehouse ||
          String(whRow.warehouseCode || '').toUpperCase().includes('FGDW') ||
          String(whRow.warehouseName || '').toUpperCase().includes('DISPATCH') ||
          String(whRow.warehouseName || '').toUpperCase().includes('FG')
        );
        const mItems: any[] = whRow.items || [];
        for (const mIt of mItems) {
          const wpp = Number(mIt.weightPerPiece) || 0;
          const pkg = Number(mIt.packagingSize || mIt.grossPerCarton) || 0;
          const isFgItem = isFgrWh || mIt.itemType === 'FINISHED_GOOD';
          const fgrGrs = isFgItem
            ? Number(mIt.convertedGross || (Number(mIt.convertedPieces) > 0 ? Number(mIt.convertedPieces) / 144 : 0))
            : 0;
          const fgrCtn = isFgItem ? Number(mIt.convertedCartons || 0) : 0;
          const fgrKg = isFgItem ? Number(mIt.convertedWeightKg || 0) : 0;
          registerItemMeta(mIt.itemCode || '', mIt.itemName || '', wpp, pkg, fgrGrs, fgrCtn, fgrKg);
        }
      }

      const inferDefaultWeightPerPiece = (code: string, name: string): number => {
        const combined = `${code} ${name}`.toUpperCase();
        if (combined.includes('8G') || combined.includes('4.0MM')) return 0.0185;
        if (combined.includes('9G') || combined.includes('3.6MM') || combined.includes('S9')) return 0.0165;
        if (combined.includes('10G') || combined.includes('3.2MM') || combined.includes('S10')) return 0.015;
        if (combined.includes('12G') || combined.includes('2.6MM')) return 0.0125;
        return 0.0155; // Standard Finished Goods Spoke & Nipple set (~2.23 KG/Gross, ~22.3 KG/Carton)
      };

      const computeGrossPerCarton = (code: string, name: string, pkgSize: number): number => {
        if (pkgSize > 0) return pkgSize;
        const isCS =
          code.toUpperCase().includes('011') ||
          code.toUpperCase().includes('012') ||
          name.toUpperCase().includes('(CS)') ||
          name.toUpperCase().includes('CS');
        return isCS ? 10.555556 : 10;
      };

      // Build item stats from orders
      const itemMap = new Map<string, ItemStat>();
      for (const order of orders) {
        const custId = String(order.customerId || order.customer_id || order.customer?.id || '');
        const custInfo = customerDirectory.get(custId);
        const custName = custInfo?.name || getCustomerDisplayName(order.customer) || 'Customer';
        const custCode = custInfo?.code || getCustomerDisplayCode(order.customer) || '';
        const items = order.items || order.orderItems || order.lines || [];
        for (const item of items) {
          const itemObj = item.item || {};
          const code = itemObj.itemCode || item.itemCode || item.item_code || '';
          const name = itemObj.name || item.description || item.itemName || item.item_name || code || 'Item';
          const qty = Number(item.quantity || item.qty || 0);
          const meta = itemMetaMap.get(normKey(code)) || itemMetaMap.get(normKey(name));
          const rawPkgSize = Number(itemObj.packagingSize || item.packageQuantity || item.packagingSize || meta?.packagingSize || 0);
          const grossPerCarton = computeGrossPerCarton(code, name, rawPkgSize);
          const rawWpp =
            Number(itemObj.weightPerPiece) > 0
              ? Number(itemObj.weightPerPiece)
              : Number(itemObj.piecesPerKg) > 0
              ? 1 / Number(itemObj.piecesPerKg)
              : meta?.weightPerPiece || 0;
          const weightPerPiece = rawWpp > 0 ? rawWpp : inferDefaultWeightPerPiece(code, name);

          if (!code && !name) continue;
          const key = code || name;
          if (!itemMap.has(key)) {
            itemMap.set(key, {
              itemCode: code || key,
              itemName: name,
              totalGross: 0,
              totalCartons: 0,
              totalOrderedKgs: 0,
              readyFgrGross: 0,
              readyFgrCartons: 0,
              readyFgrKgs: 0,
              balancePendingGross: 0,
              balancePendingCartons: 0,
              balancePendingKgs: 0,
              totalDispatchedGross: 0,
              totalDispatchedCartons: 0,
              weightPerPiece,
              grossPerCarton,
              customerCount: 0,
              customerNames: [],
              customers: [],
            });
          }
          const s = itemMap.get(key)!;
          if (rawWpp > 0) s.weightPerPiece = rawWpp;
          if (rawPkgSize > 0) s.grossPerCarton = grossPerCarton;
          s.totalGross += qty;
          s.totalCartons += qty > 0 && s.grossPerCarton > 0 ? qty / s.grossPerCarton : 0;
          if (custName && !s.customerNames.includes(custName)) {
            s.customerNames.push(custName);
            s.customerCount += 1;
            s.customers.push({
              customerId: custId || custName,
              customerName: custName,
              customerCode: custCode,
            });
          }
        }
      }

      // Add dispatched quantities to items from deliveries
      for (const delivery of deliveries) {
        if (String(delivery.status || '').toUpperCase() === 'CANCELLED') continue;
        const lines = delivery.lines || delivery.items || [];
        for (const line of lines) {
          const lineItemObj = line.item || {};
          const code = lineItemObj.itemCode || line.itemCode || line.item_code || '';
          const name = lineItemObj.name || line.description || line.itemName || line.item_name || code || 'Item';
          const qty = Number(line.quantity || line.qty || 0);
          const meta = itemMetaMap.get(normKey(code)) || itemMetaMap.get(normKey(name));
          const rawPkgSize = Number(lineItemObj.packagingSize || line.packageQuantity || line.packagingSize || meta?.packagingSize || 0);
          const grossPerCarton = computeGrossPerCarton(code, name, rawPkgSize);
          const rawWpp =
            Number(lineItemObj.weightPerPiece) > 0
              ? Number(lineItemObj.weightPerPiece)
              : meta?.weightPerPiece || 0;
          const weightPerPiece = rawWpp > 0 ? rawWpp : inferDefaultWeightPerPiece(code, name);

          if (!code && !name) continue;
          const key = code || name;
          if (!itemMap.has(key)) {
            itemMap.set(key, {
              itemCode: code || key,
              itemName: name,
              totalGross: 0,
              totalCartons: 0,
              totalOrderedKgs: 0,
              readyFgrGross: 0,
              readyFgrCartons: 0,
              readyFgrKgs: 0,
              balancePendingGross: 0,
              balancePendingCartons: 0,
              balancePendingKgs: 0,
              totalDispatchedGross: 0,
              totalDispatchedCartons: 0,
              weightPerPiece,
              grossPerCarton,
              customerCount: 0,
              customerNames: [],
              customers: [],
            });
          }
          const s = itemMap.get(key)!;
          s.totalDispatchedGross = (s.totalDispatchedGross || 0) + qty;
          s.totalDispatchedCartons =
            (s.totalDispatchedCartons || 0) + (qty > 0 && s.grossPerCarton > 0 ? qty / s.grossPerCarton : 0);
        }
      }

      // Compute per-item Ready in FGR (from customer SOC packed-minus-dispatched + safety stock buffer + FGR warehouse matrix)
      const itemPackedReadyMap = new Map<string, number>();
      for (const cust of result) {
        if (cust.isSafetyStock) {
          for (const sItem of cust.safetyItems || []) {
            const kCode = normKey(sItem.itemCode);
            const kName = normKey(sItem.itemName);
            if (kCode) itemPackedReadyMap.set(kCode, (itemPackedReadyMap.get(kCode) || 0) + sItem.gross);
            if (kName && kName !== kCode) itemPackedReadyMap.set(kName, (itemPackedReadyMap.get(kName) || 0) + sItem.gross);
          }
          continue;
        }
        for (const soc of cust.socContracts || []) {
          for (const socIt of soc.items) {
            const netReadyGross = Math.max(0, socIt.packedQty - socIt.dispatchedQty);
            if (netReadyGross > 0) {
              const kCode = normKey(socIt.itemCode);
              const kName = normKey(socIt.itemName);
              if (kCode) itemPackedReadyMap.set(kCode, (itemPackedReadyMap.get(kCode) || 0) + netReadyGross);
              if (kName && kName !== kCode) itemPackedReadyMap.set(kName, (itemPackedReadyMap.get(kName) || 0) + netReadyGross);
            }
          }
        }
      }

      const itemResult: ItemStat[] = Array.from(itemMap.values())
        .map((it) => {
          const nCode = normKey(it.itemCode);
          const nName = normKey(it.itemName);
          const meta = itemMetaMap.get(nCode) || itemMetaMap.get(nName);
          const packedReadyGross = itemPackedReadyMap.get(nCode) ?? itemPackedReadyMap.get(nName) ?? 0;
          const matrixFgrGross = meta?.matrixFgrGross || 0;

          const totalGross = Math.round(it.totalGross * 100) / 100;
          const totalDispatchedGross = Math.round((it.totalDispatchedGross || 0) * 100) / 100;
          const readyFgrGross = Math.round(Math.max(packedReadyGross, matrixFgrGross) * 100) / 100;
          const grossPerCarton = it.grossPerCarton > 0 ? it.grossPerCarton : 10;
          const weightPerPiece = it.weightPerPiece > 0 ? it.weightPerPiece : inferDefaultWeightPerPiece(it.itemCode, it.itemName);

          const totalCartons = Math.round((totalGross / grossPerCarton) * 10) / 10;
          const totalOrderedKgs = Math.round(totalGross * 144 * weightPerPiece * 10) / 10;

          const readyFgrCartons =
            meta?.matrixFgrCartons && matrixFgrGross > packedReadyGross
              ? Math.round(meta.matrixFgrCartons * 10) / 10
              : Math.round((readyFgrGross / grossPerCarton) * 10) / 10;

          const readyFgrKgs =
            meta?.matrixFgrKgs && matrixFgrGross > packedReadyGross
              ? Math.round(meta.matrixFgrKgs * 10) / 10
              : Math.round(readyFgrGross * 144 * weightPerPiece * 10) / 10;

          const balancePendingGross = Math.max(0, Math.round((totalGross - readyFgrGross) * 100) / 100);
          const balancePendingCartons = Math.max(0, Math.round((totalCartons - readyFgrCartons) * 10) / 10);
          const balancePendingKgs = Math.max(0, Math.round((totalOrderedKgs - readyFgrKgs) * 10) / 10);

          return {
            ...it,
            totalGross,
            totalDispatchedGross,
            totalCartons,
            totalOrderedKgs,
            readyFgrGross,
            readyFgrCartons,
            readyFgrKgs,
            balancePendingGross,
            balancePendingCartons,
            balancePendingKgs,
            totalDispatchedCartons: Math.round((totalDispatchedGross / grossPerCarton) * 10) / 10,
            weightPerPiece,
            grossPerCarton,
          };
        })
        .sort((a, b) => b.totalGross - a.totalGross);

      setItemStats(itemResult);
    } catch (err) {
      console.error('CustomerAnalytics load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredCustomers = useMemo(() => {
    let list = [...customers];
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.customerCode.toLowerCase().includes(q) ||
          (c.topItem || '').toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      if (sortBy === 'ready') return (b.readyToDispatchGross || 0) - (a.readyToDispatchGross || 0);
      if (sortBy === 'packed') return (b.totalPackedGross || 0) - (a.totalPackedGross || 0);
      if (sortBy === 'orders') return b.totalOrders - a.totalOrders;
      if (sortBy === 'dispatched') return b.totalDispatchedGross - a.totalDispatchedGross;
      if (sortBy === 'value') return b.totalOrderValue - a.totalOrderValue;
      if (sortBy === 'pending') return b.pendingGross - a.pendingGross;
      return 0;
    });
    return list;
  }, [customers, searchText, sortBy]);

  const filteredItemStats = useMemo(() => {
    let list = [...itemStats];
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (it) =>
          it.itemCode.toLowerCase().includes(q) ||
          it.itemName.toLowerCase().includes(q) ||
          it.customerNames.some((cn) => cn.toLowerCase().includes(q))
      );
    }
    return list;
  }, [itemStats, searchText]);

  const CARDS_PER_ROW = 5;
  const nonSafetyCustomers = useMemo(
    () => filteredCustomers.filter((c) => !c.isSafetyStock),
    [filteredCustomers]
  );

  // Dynamic routing based on fulfillment percentage & remaining pending qty:
  // - Pending: active, unfulfilled, or partially fulfilled (< 100% fulfillment or pendingGross > 0)
  // - Done: 100% fulfilled (fulfillmentPct >= 100 and pendingGross <= 0)
  const pendingCustomers = useMemo(
    () => nonSafetyCustomers.filter((c) => c.fulfillmentPct < 100 || c.pendingGross > 0),
    [nonSafetyCustomers]
  );
  const doneCustomers = useMemo(
    () => nonSafetyCustomers.filter((c) => c.fulfillmentPct >= 100 && c.pendingGross <= 0),
    [nonSafetyCustomers]
  );

  const onlyCustomers = useMemo(() => {
    if (activeTab === 'pending') return pendingCustomers;
    if (activeTab === 'done') return doneCustomers;
    return nonSafetyCustomers;
  }, [activeTab, pendingCustomers, doneCustomers, nonSafetyCustomers]);

  const tableCustomers = useMemo(() => {
    if (activeTab === 'pending') return pendingCustomers;
    if (activeTab === 'done') return doneCustomers;
    return filteredCustomers;
  }, [activeTab, pendingCustomers, doneCustomers, filteredCustomers]);

  const safetyStockStat = useMemo(() => customers.find((c) => c.isSafetyStock), [customers]);
  const totalCustomerPages = Math.max(1, Math.ceil(onlyCustomers.length / CARDS_PER_ROW));

  const selectedCustomerModal = useMemo(
    () => (selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) || null : null),
    [customers, selectedCustomerId]
  );

  const selectedSocContract = useMemo(() => {
    if (!selectedCustomerModal || !selectedSocNumber) return null;
    return (
      selectedCustomerModal.socContracts?.find((s) => s.socNumber === selectedSocNumber) || null
    );
  }, [selectedCustomerModal, selectedSocNumber]);

  useEffect(() => {
    setCustomerPage(1);
  }, [activeTab]);

  useEffect(() => {
    if (customerPage > totalCustomerPages) {
      setCustomerPage(1);
    }
  }, [customerPage, totalCustomerPages]);

  const pagedCustomers = useMemo(() => {
    const start = (customerPage - 1) * CARDS_PER_ROW;
    return onlyCustomers.slice(start, start + CARDS_PER_ROW);
  }, [onlyCustomers, customerPage]);

  const totalDispatchedGross = useMemo(() => customers.reduce((s, c) => s + c.totalDispatchedGross, 0), [customers]);
  const totalOrderedGross = useMemo(() => customers.reduce((s, c) => s + c.totalOrderedGross, 0), [customers]);
  const totalOrders = useMemo(() => customers.reduce((s, c) => s + c.totalOrders, 0), [customers]);
  const totalPackedGrossAll = useMemo(() => customers.reduce((s, c) => s + (c.totalPackedGross || 0), 0), [customers]);
  const totalReadyToDispatchGross = useMemo(() => customers.reduce((s, c) => s + (c.readyToDispatchGross || 0), 0), [customers]);
  const overallFulfillment = totalOrderedGross > 0 ? Math.round((totalDispatchedGross / totalOrderedGross) * 100) : 0;
  const maxDispatch = customers.length > 0 ? Math.max(...customers.map((c) => c.totalDispatchedGross)) : 1;

  const tableColumns = [
    {
      title: '#',
      key: 'rank',
      width: 50,
      render: (_: any, c: CustomerStat, i: number) => (
        <span style={{ fontWeight: 700, color: c.isSafetyStock ? '#10b981' : i < 3 ? COLORS[0] : 'var(--theme-text-muted, #64748b)', fontSize: 13 }}>
          {c.isSafetyStock ? '🛡️' : i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
        </span>
      ),
    },
    {
      title: 'CUSTOMER',
      key: 'name',
      render: (_: any, c: CustomerStat) => (
        <div>
          <div style={{ fontWeight: 700, color: c.isSafetyStock ? '#059669' : 'var(--theme-accent, #6366f1)', fontSize: 13 }}>
            {c.name}
            {c.isSafetyStock && <Tag color="cyan" style={{ marginLeft: 6, fontSize: 10 }}>Buffer</Tag>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>{c.customerCode}</div>
        </div>
      ),
    },
    {
      title: 'ORDERS',
      key: 'orders',
      width: 80,
      align: 'center' as const,
      render: (_: any, c: CustomerStat) => (
        <Tag color={c.isSafetyStock ? 'purple' : 'blue'} style={{ fontWeight: 700 }}>
          {c.totalOrders} {c.isSafetyStock ? 'Batches' : ''}
        </Tag>
      ),
    },
    {
      title: 'ORDERED (GRS)',
      key: 'ordered',
      width: 130,
      align: 'right' as const,
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontWeight: 700, color: 'var(--theme-text, #1e293b)' }}>
          {c.isSafetyStock ? '—' : fmtNum(c.totalOrderedGross, 0)}
        </span>
      ),
    },
    {
      title: 'TOTAL PACKED (GRS)',
      key: 'packed',
      width: 150,
      align: 'right' as const,
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontWeight: 700, color: '#0d9488' }}>
          {fmtNum(c.totalPackedGross, 0)}
          {c.totalPackedCartons > 0 && (
            <span style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', display: 'block' }}>
              ({fmtNum(c.totalPackedCartons, 0)} CTN)
            </span>
          )}
        </span>
      ),
    },
    {
      title: 'DISPATCHED (GRS)',
      key: 'dispatched',
      width: 140,
      align: 'right' as const,
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontWeight: 700, color: '#10b981' }}>{fmtNum(c.totalDispatchedGross, 0)}</span>
      ),
    },
    {
      title: 'READY TO DISPATCH',
      key: 'readyToDispatch',
      width: 160,
      align: 'right' as const,
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontWeight: 700, color: c.readyToDispatchGross > 0 ? '#0284c7' : 'var(--theme-text-muted, #94a3b8)' }}>
          {c.readyToDispatchGross > 0
            ? `${fmtNum(c.readyToDispatchGross, 0)} GRS${c.readyToDispatchCartons ? ` (${fmtNum(c.readyToDispatchCartons, 0)} CTN)` : ''}`
            : '0 GRS'}
        </span>
      ),
    },
    {
      title: 'PENDING (GRS)',
      key: 'pending',
      width: 130,
      align: 'right' as const,
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontWeight: 700, color: c.pendingGross > 0 ? '#f59e0b' : '#10b981' }}>
          {c.pendingGross > 0 ? fmtNum(c.pendingGross, 0) : '✅ 0'}
        </span>
      ),
    },
    {
      title: 'FULFILLMENT',
      key: 'fulfillment',
      width: 160,
      render: (_: any, c: CustomerStat) => {
        const clr = getFulfillmentColor(c.fulfillmentPct);
        return (
          <div>
            <Progress
              percent={c.fulfillmentPct}
              size="small"
              strokeColor={clr}
              format={(p) => <span style={{ fontSize: 10, fontWeight: 700, color: clr }}>{p}%</span>}
            />
          </div>
        );
      },
    },
    {
      title: 'TOP ITEM',
      key: 'topItem',
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>{c.topItem || '—'}</span>
      ),
    },
  ];

  const itemColumns = [
    {
      title: '#',
      key: 'rank',
      width: 50,
      render: (_: any, __: any, i: number) => (
        <span style={{ fontWeight: 700, color: i < 3 ? COLORS[0] : 'var(--theme-text-muted)', fontSize: 13 }}>
          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
        </span>
      ),
    },
    {
      title: 'ITEM CODE & NAME',
      key: 'item',
      render: (_: any, it: ItemStat) => (
        <div>
          <div style={{ fontWeight: 800, color: 'var(--theme-accent, #6366f1)', fontSize: 13, fontFamily: 'monospace' }}>
            {it.itemCode}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--theme-text, #1e293b)', fontWeight: 600 }}>{it.itemName}</div>
        </div>
      ),
    },
    {
      title: 'TOTAL ORDERED (KGS / CTN)',
      key: 'ordered',
      align: 'right' as const,
      render: (_: any, it: ItemStat) => (
        <div>
          <div style={{ fontWeight: 800, color: 'var(--theme-heading, #1e293b)', fontSize: 13 }}>
            {fmtNum(it.totalOrderedKgs, 1)} KGS
          </div>
          <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>
            {fmtNum(it.totalCartons, 1)} Cartons ({fmtNum(it.totalGross, 0)} GRS)
          </div>
        </div>
      ),
    },
    {
      title: 'READY IN FGR (KGS / CTN)',
      key: 'readyFgr',
      align: 'right' as const,
      render: (_: any, it: ItemStat) => (
        <div>
          <div style={{ fontWeight: 800, color: '#10b981', fontSize: 13 }}>
            {fmtNum(it.readyFgrKgs, 1)} KGS
          </div>
          <div style={{ fontSize: 11, color: '#0d9488', fontWeight: 700 }}>
            {fmtNum(it.readyFgrCartons, 1)} Cartons
          </div>
        </div>
      ),
    },
    {
      title: 'BALANCE PENDING (KGS / CTN)',
      key: 'balancePending',
      align: 'right' as const,
      render: (_: any, it: ItemStat) => (
        <div>
          <div
            style={{
              fontWeight: 800,
              color: it.balancePendingKgs > 0 ? '#f59e0b' : '#10b981',
              fontSize: 13,
            }}
          >
            {fmtNum(it.balancePendingKgs, 1)} KGS
          </div>
          <div
            style={{
              fontSize: 11,
              color: it.balancePendingCartons > 0 ? '#d97706' : '#10b981',
              fontWeight: 700,
            }}
          >
            {fmtNum(it.balancePendingCartons, 1)} Cartons
          </div>
        </div>
      ),
    },
    {
      title: 'ASSOCIATED CUSTOMERS',
      key: 'customers',
      render: (_: any, it: ItemStat) => (
        <div>
          <Tag
            color="purple"
            style={{ cursor: 'pointer', fontWeight: 700, marginBottom: 4 }}
            onClick={() => {
              const firstCust = it.customers?.[0] || it.customerNames[0];
              if (firstCust) openCustomerByNameOrRef(firstCust);
            }}
          >
            <UserOutlined /> {it.customerCount} {it.customerCount === 1 ? 'Customer' : 'Customers'}
          </Tag>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(it.customers && it.customers.length > 0
              ? it.customers
              : it.customerNames.map((n) => ({ customerId: n, customerName: n }))
            ).map((cust) => (
              <button
                key={cust.customerId + cust.customerName}
                type="button"
                className="ca-item-cust-link"
                onClick={() => openCustomerByNameOrRef(cust)}
              >
                {cust.customerName}
              </button>
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="ca-root">
      {/* ── Header ── */}
      <div className="ca-header">
        <div className="ca-header-left">
          <div className="ca-title-icon">📊</div>
          <div>
            <h1 className="ca-title">Customer Analytics</h1>
            <p className="ca-subtitle">Dispatch history, order fulfillment & product analysis</p>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined spin={loading} />}
          onClick={loadData}
          loading={loading}
          className="ca-refresh-btn"
        >
          Refresh
        </Button>
      </div>

      {/* ── KPI Strip (Executive Action KPI Cards) ── */}
      <div className="ca-kpi-grid">
        <ActionKpiCard
          value={customers.filter((c) => !c.isSafetyStock).length}
          label="Active Customers"
          icon={<UserOutlined />}
          gradient="linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)"
          actionText="Customer list"
          onAction={() => navigate('/customers')}
        />
        <ActionKpiCard
          value={totalOrders}
          label="Total Orders"
          icon={<ShoppingCartOutlined />}
          gradient="linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
          actionText="View orders"
          onAction={() => navigate('/sales/orders')}
        />
        <ActionKpiCard
          value={fmtNum(totalOrderedGross, 0)}
          suffix="GRS"
          label="Ordered Demand"
          icon={<ClockCircleOutlined />}
          gradient="linear-gradient(135deg, #ea580c 0%, #c2410c 100%)"
          actionText="Track demand"
          onAction={() => navigate('/sales/orders')}
        />
        <ActionKpiCard
          value={fmtNum(totalPackedGrossAll, 0)}
          suffix="GRS"
          label="Total Packed"
          icon={<AppstoreOutlined />}
          gradient="linear-gradient(135deg, #0d9488 0%, #0f766e 100%)"
          actionText="Production entries"
          onAction={() => navigate('/production/entries')}
        />
        <ActionKpiCard
          value={fmtNum(totalDispatchedGross, 0)}
          suffix="GRS"
          label="Dispatched Goods"
          icon={<RocketOutlined />}
          gradient="linear-gradient(135deg, #16a34a 0%, #15803d 100%)"
          actionText="View deliveries"
          onAction={() => navigate('/sales/deliveries')}
        />
        <ActionKpiCard
          value={fmtNum(totalReadyToDispatchGross, 0)}
          suffix="GRS"
          label="Ready to Dispatch"
          icon={<InboxOutlined />}
          gradient="linear-gradient(135deg, #0284c7 0%, #0369a1 100%)"
          actionText="Finished goods"
          onAction={() => navigate('/inventory')}
        />
        <ActionKpiCard
          value={`${overallFulfillment}%`}
          label="Overall Fulfillment"
          icon={<CheckCircleOutlined />}
          gradient="linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)"
          actionText="Analyze chart"
          onAction={() => {
            const el = document.querySelector('.ca-chart-card');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      </div>

      {/* ── Dual Comparison Bar Chart: Top Customers / Top Items ── */}
      <div className="ca-chart-card">
        <div className="ca-chart-header">
          <div className="ca-chart-title">
            <TrophyOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
            <span>
              {chartView === 'customers' ? 'Top Customers by Volume' : 'Top Items by Volume'}
            </span>
          </div>

          <div className="ca-chart-toggles">
            <div className="ca-chart-legend">
              <span className="ca-legend-item">
                <span className="ca-legend-dot ca-legend-ordered" />
                <span>Ordered (Light)</span>
              </span>
              <span className="ca-legend-item">
                <span className="ca-legend-dot ca-legend-dispatched" />
                <span>Dispatched (Solid)</span>
              </span>
            </div>

            <div className="ca-chart-segmented">
              <button
                className={`ca-chart-seg-btn ${chartView === 'customers' ? 'active' : ''}`}
                onClick={() => setChartView('customers')}
                type="button"
              >
                <UserOutlined /> Customers ({customers.filter(c => !c.isSafetyStock).length})
              </button>
              <button
                className={`ca-chart-seg-btn ${chartView === 'items' ? 'active' : ''}`}
                onClick={() => setChartView('items')}
                type="button"
              >
                <TagOutlined /> Items ({itemStats.length})
              </button>
            </div>
          </div>
        </div>

        {chartView === 'customers' ? (
          <div className="ca-dual-chart">
            {customers
              .filter((c) => !c.isSafetyStock)
              .slice(0, 10)
              .map((c, i) => {
                const maxVol = Math.max(
                  ...customers
                    .filter((x) => !x.isSafetyStock)
                    .map((x) => Math.max(x.totalOrderedGross, x.totalDispatchedGross)),
                  1
                );
                const orderedWidth = Math.min(100, Math.max(3, (c.totalOrderedGross / maxVol) * 100));
                const dispatchedWidth = Math.min(100, Math.max(0, (c.totalDispatchedGross / maxVol) * 100));
                const clr = COLORS[i % COLORS.length];

                return (
                  <div key={c.id} className="ca-dual-row">
                    <div className="ca-dual-label">
                      <span className="ca-dual-rank" style={{ color: clr }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </span>
                      <div className="ca-dual-names">
                        <Tooltip title={`${c.name} (${c.customerCode})`}>
                          <span className="ca-dual-name">{c.name}</span>
                        </Tooltip>
                        <span className="ca-dual-sub">{c.customerCode || 'B2B'}</span>
                      </div>
                    </div>

                    <div className="ca-dual-bars">
                      {/* Ordered Bar (Upper line - light color) */}
                      <div className="ca-bar-line">
                        <span className="ca-bar-line-tag ca-tag-ordered">ORDERED</span>
                        <div className="ca-bar-track-outer">
                          <div
                            className="ca-bar-fill-ordered"
                            style={{
                              width: `${orderedWidth}%`,
                              background: `linear-gradient(90deg, ${clr}44, ${clr}22)`,
                              border: `1px dashed ${clr}99`,
                            }}
                          />
                        </div>
                        <span className="ca-bar-line-val ca-val-ordered">
                          {fmtNum(c.totalOrderedGross, 0)} GRS
                        </span>
                      </div>

                      {/* Dispatched Bar (Lower line - vibrant solid color) */}
                      <div className="ca-bar-line">
                        <span className="ca-bar-line-tag ca-tag-dispatched">DISPATCHED</span>
                        <div className="ca-bar-track-outer">
                          <div
                            className="ca-bar-fill-dispatched"
                            style={{
                              width: `${dispatchedWidth}%`,
                              background: `linear-gradient(90deg, ${clr}, ${clr}dd)`,
                              boxShadow: `0 1px 6px ${clr}55`,
                            }}
                          />
                        </div>
                        <span className="ca-bar-line-val ca-val-dispatched">
                          {fmtNum(c.totalDispatchedGross, 0)} GRS
                        </span>
                      </div>
                    </div>

                    <div className="ca-dual-right">
                      <Tag
                        color={c.fulfillmentPct >= 100 ? 'success' : c.fulfillmentPct >= 50 ? 'warning' : 'default'}
                        style={{ fontWeight: 700, margin: 0 }}
                      >
                        {c.fulfillmentPct}% Fulfilled
                      </Tag>
                      <span className="ca-dual-fraction">
                        {fmtNum(c.totalDispatchedGross, 0)} / {fmtNum(c.totalOrderedGross, 0)}
                      </span>
                    </div>
                  </div>
                );
              })}
            {customers.filter((c) => !c.isSafetyStock).length === 0 && !loading && (
              <Empty description="No customer data" style={{ padding: 40 }} />
            )}
          </div>
        ) : (
          <div className="ca-dual-chart">
            {itemStats.slice(0, 10).map((it, i) => {
              const maxVol = Math.max(
                ...itemStats.slice(0, 10).map((x) => Math.max(x.totalGross, x.totalDispatchedGross || 0)),
                1
              );
              const orderedWidth = Math.min(100, Math.max(3, (it.totalGross / maxVol) * 100));
              const dispatchedWidth = Math.min(100, Math.max(0, ((it.totalDispatchedGross || 0) / maxVol) * 100));
              const fulfillmentPct =
                it.totalGross > 0 ? Math.round(((it.totalDispatchedGross || 0) / it.totalGross) * 100) : 0;
              const clr = COLORS[i % COLORS.length];

              return (
                <div key={it.itemCode} className="ca-dual-row">
                  <div className="ca-dual-label">
                    <span className="ca-dual-rank" style={{ color: clr }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                    <div className="ca-dual-names">
                      <Tooltip title={`${it.itemName} (${it.itemCode})`}>
                        <span className="ca-dual-name">{it.itemName}</span>
                      </Tooltip>
                      <span className="ca-dual-sub">{it.itemCode} • {it.customerCount} Customers</span>
                    </div>
                  </div>

                  <div className="ca-dual-bars">
                    {/* Ordered Bar (Upper line - light color) */}
                    <div className="ca-bar-line">
                      <span className="ca-bar-line-tag ca-tag-ordered">ORDERED</span>
                      <div className="ca-bar-track-outer">
                        <div
                          className="ca-bar-fill-ordered"
                          style={{
                            width: `${orderedWidth}%`,
                            background: `linear-gradient(90deg, ${clr}44, ${clr}22)`,
                            border: `1px dashed ${clr}99`,
                          }}
                        />
                      </div>
                      <span className="ca-bar-line-val ca-val-ordered">
                        {fmtNum(it.totalGross, 0)} GRS
                      </span>
                    </div>

                    {/* Dispatched Bar (Lower line - vibrant solid color) */}
                    <div className="ca-bar-line">
                      <span className="ca-bar-line-tag ca-tag-dispatched">DISPATCHED</span>
                      <div className="ca-bar-track-outer">
                        <div
                          className="ca-bar-fill-dispatched"
                          style={{
                            width: `${dispatchedWidth}%`,
                            background: `linear-gradient(90deg, ${clr}, ${clr}dd)`,
                            boxShadow: `0 1px 6px ${clr}55`,
                          }}
                        />
                      </div>
                      <span className="ca-bar-line-val ca-val-dispatched">
                        {fmtNum(it.totalDispatchedGross || 0, 0)} GRS
                      </span>
                    </div>
                  </div>

                  <div className="ca-dual-right">
                    <Tag
                      color={fulfillmentPct >= 100 ? 'success' : fulfillmentPct >= 50 ? 'warning' : 'default'}
                      style={{ fontWeight: 700, margin: 0 }}
                    >
                      {fulfillmentPct}% Fulfilled
                    </Tag>
                    <span className="ca-dual-fraction">
                      {fmtNum(it.totalDispatchedGross || 0, 0)} / {fmtNum(it.totalGross, 0)}
                    </span>
                  </div>
                </div>
              );
            })}
            {itemStats.length === 0 && !loading && (
              <Empty description="No item data" style={{ padding: 40 }} />
            )}
          </div>
        )}
      </div>

      {/* ── Tabs: Pending | Done | All | Items ── */}
      <div className="ca-section">
        <div className="ca-section-toolbar">
          <div className="ca-tabs">
            <button
              type="button"
              className={`ca-tab ca-tab-pending ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              <ClockCircleOutlined /> Pending ({pendingCustomers.length})
            </button>
            <button
              type="button"
              className={`ca-tab ca-tab-done ${activeTab === 'done' ? 'active' : ''}`}
              onClick={() => setActiveTab('done')}
            >
              <CheckCircleOutlined /> Done ({doneCustomers.length})
            </button>
            <button
              type="button"
              className={`ca-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              <UserOutlined /> All ({nonSafetyCustomers.length})
            </button>
            <button
              type="button"
              className={`ca-tab ${activeTab === 'items' ? 'active' : ''}`}
              onClick={() => setActiveTab('items')}
            >
              <TagOutlined /> Items ({filteredItemStats.length})
            </button>
          </div>

          <div className="ca-toolbar-right">
            <Input
              prefix={<SearchOutlined />}
              placeholder={
                activeTab === 'items'
                  ? 'Search item code, product name or customer...'
                  : 'Search customer, item or buffer...'
              }
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              className="ca-search"
            />
            {activeTab !== 'items' && (
              <Select value={sortBy} onChange={setSortBy} className="ca-sort-select">
                <Option value="dispatched">Sort: Dispatched ↓</Option>
                <Option value="packed">Sort: Total Packed ↓</Option>
                <Option value="ready">Sort: Ready to Dispatch ↓</Option>
                <Option value="pending">Sort: Pending ↓</Option>
                <Option value="orders">Sort: Orders ↓</Option>
                <Option value="value">Sort: Value ↓</Option>
              </Select>
            )}
            <div className="ca-view-toggle">
              <button
                type="button"
                className={`ca-toggle-btn ${viewMode === 'card' ? 'active' : ''}`}
                onClick={() => setViewMode('card')}
                title="Card View"
              >
                <AppstoreOutlined />
              </button>
              <button
                type="button"
                className={`ca-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                title="Table View"
              >
                <UnorderedListOutlined />
              </button>
            </div>
          </div>
        </div>

        <Spin spinning={loading}>
          {activeTab !== 'items' ? (
            viewMode === 'card' ? (
              <div className="ca-cards-carousel-container">
                {/* ── Single-Row Customer Cards Carousel with Side Edge Arrows ── */}
                {pagedCustomers.length > 0 ? (
                  <div className="ca-cards-carousel-viewport">
                    {totalCustomerPages > 1 && (
                      <button
                        className={`ca-carousel-edge-btn ca-edge-prev ${customerPage <= 1 ? 'disabled' : ''}`}
                        onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
                        disabled={customerPage <= 1}
                        title="Previous Customers"
                        type="button"
                      >
                        <LeftOutlined />
                      </button>
                    )}

                    <div className="ca-card-grid ca-card-grid-row">
                      {pagedCustomers.map((c, i) => {
                        const globalIdx = (customerPage - 1) * CARDS_PER_ROW + i;
                        const accentColor = getFulfillmentColor(c.fulfillmentPct);
                        const socCount = c.socContracts?.length || c.totalOrders || 0;
                        return (
                          <div
                            key={c.id}
                            className="ca-customer-card ca-customer-card-clickable"
                            style={{ '--accent': accentColor } as any}
                            onClick={() => openCustomerSocModal(c)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openCustomerSocModal(c);
                              }
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <div
                                className="ca-card-rank"
                                style={{
                                  color: COLORS[globalIdx % COLORS.length],
                                  margin: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                {globalIdx === 0 ? '🥇' : globalIdx === 1 ? '🥈' : globalIdx === 2 ? '🥉' : `#${globalIdx + 1}`}
                              </div>
                              <Tag
                                color="blue"
                                style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 6, margin: 0 }}
                              >
                                {socCount} {socCount === 1 ? 'SOC' : 'SOCs'}
                              </Tag>
                            </div>

                            <div className="ca-card-header">
                              <div
                                className="ca-card-avatar"
                                style={{
                                  background: `${accentColor}18`,
                                  color: accentColor,
                                }}
                              >
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="ca-card-info">
                                <div className="ca-card-name" title={c.name}>{c.name}</div>
                                <div className="ca-card-code">{c.customerCode || 'B2B'}</div>
                              </div>
                            </div>

                            <div className="ca-card-progress-row">
                              <span className="ca-card-pct-label">Fulfillment</span>
                              <span
                                className="ca-card-pct"
                                style={{ color: accentColor, fontWeight: 800 }}
                              >
                                {c.fulfillmentPct}%
                              </span>
                            </div>
                            <Progress
                              percent={c.fulfillmentPct}
                              showInfo={false}
                              size="small"
                              strokeColor={accentColor}
                              style={{ marginBottom: 10 }}
                            />

                            <div className="ca-card-stats">
                              <div className="ca-stat">
                                <div className="ca-stat-label">Ordered</div>
                                <div className="ca-stat-val">
                                  {fmtNum(c.totalOrderedGross, 0)} GRS
                                </div>
                              </div>
                              <div className="ca-stat">
                                <div className="ca-stat-label" style={{ color: '#0d9488' }}>Total Packed</div>
                                <div className="ca-stat-val" style={{ color: '#0d9488' }}>
                                  {fmtNum(c.totalPackedGross, 0)} GRS
                                </div>
                                {c.totalPackedCartons > 0 && (
                                  <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600, marginTop: 1 }}>
                                    ({fmtNum(c.totalPackedCartons, 0)} CTN)
                                  </div>
                                )}
                              </div>
                              <div className="ca-stat">
                                <div className="ca-stat-label">Dispatched</div>
                                <div className="ca-stat-val" style={{ color: '#10b981' }}>
                                  {fmtNum(c.totalDispatchedGross, 0)} GRS
                                </div>
                                {c.totalDispatchedCartons > 0 && (
                                  <div style={{ fontSize: 10, color: '#10b981', fontWeight: 600, marginTop: 1 }}>
                                    ({fmtNum(c.totalDispatchedCartons, 0)} CTN)
                                  </div>
                                )}
                              </div>
                              <div className="ca-stat ca-stat-ready">
                                <div className="ca-stat-label ca-stat-label-ready">
                                  READY TO DISPATCH
                                </div>
                                <div className="ca-stat-val ca-stat-val-ready">
                                  {c.readyToDispatchGross > 0
                                    ? `${fmtNum(c.readyToDispatchGross, 0)} GRS`
                                    : '0 GRS'}
                                </div>
                                {c.readyToDispatchCartons > 0 && (
                                  <div className="ca-stat-sub-ready">
                                    ({fmtNum(c.readyToDispatchCartons, 0)} CTN)
                                  </div>
                                )}
                              </div>
                              <div className="ca-stat">
                                <div className="ca-stat-label">Pending</div>
                                <div
                                  className="ca-stat-val"
                                  style={{
                                    color: c.pendingGross > 0 ? '#f59e0b' : '#10b981',
                                    fontWeight: 700,
                                  }}
                                >
                                  {c.pendingGross > 0 ? `${fmtNum(c.pendingGross, 0)} GRS` : '✅ Done'}
                                </div>
                              </div>
                              <div className="ca-stat">
                                <div className="ca-stat-label">Orders</div>
                                <div className="ca-stat-val" style={{ color: COLORS[globalIdx % COLORS.length] }}>
                                  {c.totalOrders}
                                </div>
                              </div>
                            </div>

                            {c.topItem && (
                              <div className="ca-card-item" title={c.topItem}>
                                <TagOutlined style={{ marginRight: 5, flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.topItem}</span>
                              </div>
                            )}

                            <div className="ca-card-footer-row">
                              {c.lastOrderDate ? (
                                <span className="ca-card-date">
                                  Last order: {c.lastOrderDate?.slice(0, 10) || ''}
                                </span>
                              ) : <span />}
                              <span className="ca-card-soc-hint">
                                <FolderOpenOutlined /> View SOCs →
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {totalCustomerPages > 1 && (
                      <button
                        className={`ca-carousel-edge-btn ca-edge-next ${customerPage >= totalCustomerPages ? 'disabled' : ''}`}
                        onClick={() => setCustomerPage((p) => Math.min(totalCustomerPages, p + 1))}
                        disabled={customerPage >= totalCustomerPages}
                        title="Next Customers"
                        type="button"
                      >
                        <RightOutlined />
                      </button>
                    )}
                  </div>
                ) : (
                  <Empty
                    description={
                      activeTab === 'pending'
                        ? 'No customers with pending orders — all orders are 100% fulfilled!'
                        : activeTab === 'done'
                        ? 'No customers have reached 100% order fulfillment yet.'
                        : 'No matching customers found.'
                    }
                    style={{ padding: 48 }}
                  />
                )}

                {/* ── Bottom Pagination Bar: P 1 2 N ── */}
                {totalCustomerPages > 1 && (
                  <div className="ca-carousel-pagination">
                    <button
                      className="ca-carousel-nav-btn"
                      disabled={customerPage <= 1}
                      onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
                      type="button"
                    >
                      <LeftOutlined /> Previous
                    </button>
                    <div className="ca-carousel-pages">
                      {Array.from({ length: totalCustomerPages }, (_, idx) => idx + 1).map((p) => (
                        <button
                          key={p}
                          className={`ca-carousel-page-btn ${p === customerPage ? 'active' : ''}`}
                          onClick={() => setCustomerPage(p)}
                          type="button"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <button
                      className="ca-carousel-nav-btn"
                      disabled={customerPage >= totalCustomerPages}
                      onClick={() => setCustomerPage((p) => Math.min(totalCustomerPages, p + 1))}
                      type="button"
                    >
                      Next <RightOutlined />
                    </button>
                  </div>
                )}

                {/* ── Permanent Dedicated Safety Stock Buffer Dock Below (shown in All view) ── */}
                {activeTab === 'all' && safetyStockStat && (
                  <div className="ca-safety-dock">
                    <div className="ca-safety-dock-header">
                      <div className="ca-safety-dock-title-box">
                        <span className="ca-safety-dock-icon">🛡️</span>
                        <div>
                          <div className="ca-safety-dock-title">
                            Safety Stock Buffer Warehouse
                            <Tag color="cyan" style={{ marginLeft: 8, fontWeight: 700, borderRadius: 4 }}>
                              Permanent Buffer
                            </Tag>
                          </div>
                          <div className="ca-safety-dock-desc">
                            Finished goods held in safety buffer inventory — ready to allocate or dispatch
                          </div>
                        </div>
                      </div>
                      <div className="ca-safety-dock-kpis">
                        <div className="ca-dock-kpi">
                          <span className="ca-dock-kpi-label">Buffer Volume</span>
                          <span className="ca-dock-kpi-val">{fmtNum(safetyStockStat.readyToDispatchGross, 0)} GRS</span>
                        </div>
                        <div className="ca-dock-kpi">
                          <span className="ca-dock-kpi-label">Cartons</span>
                          <span className="ca-dock-kpi-val">{fmtNum(safetyStockStat.readyToDispatchCartons, 0)} CTN</span>
                        </div>
                        <div className="ca-dock-kpi">
                          <span className="ca-dock-kpi-label">Batches</span>
                          <span className="ca-dock-kpi-val">{safetyStockStat.totalOrders} Batches</span>
                        </div>
                      </div>
                    </div>

                    {safetyStockStat.safetyItems && safetyStockStat.safetyItems.length > 0 && (
                      <div className="ca-safety-dock-items">
                        {safetyStockStat.safetyItems.map((it) => (
                          <div key={it.itemCode} className="ca-dock-item-card">
                            <div className="ca-dock-item-top">
                              <span className="ca-dock-item-code">{it.itemCode}</span>
                              <Tag color="green" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>Available</Tag>
                            </div>
                            <div className="ca-dock-item-name" title={it.itemName}>{it.itemName}</div>
                            <div className="ca-dock-item-bottom">
                              <div className="ca-dock-item-ctn">{fmtNum(it.cartons, 0)} CTN</div>
                              <div className="ca-dock-item-grs">{fmtNum(it.gross, 0)} GRS</div>
                              <div className="ca-dock-item-pcs">{fmtNum(it.pcs, 0)} PCS</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Table
                size="small"
                dataSource={tableCustomers}
                rowKey="id"
                columns={tableColumns}
                pagination={{ pageSize: 20, showSizeChanger: true }}
                className="ca-table"
                onRow={(record) => ({
                  onClick: () => {
                    if (!record.isSafetyStock) {
                      openCustomerSocModal(record);
                    }
                  },
                  style: { cursor: record.isSafetyStock ? 'default' : 'pointer' },
                })}
              />
            )
          ) : (
            viewMode === 'card' ? (
              filteredItemStats.length > 0 ? (
                <div className="ca-item-pro-grid">
                  {filteredItemStats.map((it, i) => {
                    const accentClr = COLORS[i % COLORS.length];
                    const fgrCoveragePct =
                      it.totalOrderedKgs > 0
                        ? Math.min(100, Math.round((it.readyFgrKgs / it.totalOrderedKgs) * 100))
                        : it.readyFgrKgs > 0
                        ? 100
                        : 0;
                    const fgrStatusColor = getFulfillmentColor(fgrCoveragePct);
                    const associatedCusts =
                      it.customers && it.customers.length > 0
                        ? it.customers
                        : it.customerNames.map((n) => ({ customerId: n, customerName: n }));

                    return (
                      <div
                        key={it.itemCode}
                        className="ca-item-pro-card"
                        style={{ '--item-accent': accentClr } as React.CSSProperties}
                      >
                        {/* ── Top Identity & Customer Badge Bar ── */}
                        <div className="ca-item-pro-top">
                          <div className="ca-item-pro-rank-wrap">
                            <span
                              className="ca-item-pro-rank"
                              style={{ color: accentClr, borderColor: `${accentClr}44`, background: `${accentClr}14` }}
                            >
                              {i === 0 ? '🥇 #1' : i === 1 ? '🥈 #2' : i === 2 ? '🥉 #3' : `#${i + 1}`}
                            </span>
                            <span className="ca-item-pro-grs-pill">
                              {fmtNum(it.totalGross, 0)} GRS Demand
                            </span>
                          </div>

                          <button
                            type="button"
                            className="ca-item-cust-badge"
                            title="Click to inspect customer Sales Order Contracts (SOC)"
                            onClick={() => {
                              const firstCust = associatedCusts[0];
                              if (firstCust) openCustomerByNameOrRef(firstCust);
                            }}
                          >
                            <UserOutlined />
                            <span>
                              {it.customerCount} {it.customerCount === 1 ? 'Customer' : 'Customers'}
                            </span>
                          </button>
                        </div>

                        {/* ── Primary Identifier: Bold Prominent Item Code & Product Name ── */}
                        <div className="ca-item-pro-identity">
                          <div
                            className="ca-item-pro-avatar"
                            style={{ background: `${accentClr}1f`, color: accentClr }}
                          >
                            <InboxOutlined />
                          </div>
                          <div className="ca-item-pro-titles">
                            <div className="ca-item-pro-code" title={it.itemCode}>
                              {it.itemCode}
                            </div>
                            <div className="ca-item-pro-name" title={it.itemName}>
                              {it.itemName}
                            </div>
                          </div>
                        </div>

                        {/* ── FGR Readiness Progress Strip ── */}
                        <div className="ca-item-pro-progress">
                          <div className="ca-item-pro-progress-hdr">
                            <span className="ca-item-pro-progress-lbl">FGR Stock Coverage</span>
                            <span
                              className="ca-item-pro-progress-val"
                              style={{ color: fgrStatusColor }}
                            >
                              {fgrCoveragePct}% Ready in FGR
                            </span>
                          </div>
                          <Progress
                            percent={fgrCoveragePct}
                            showInfo={false}
                            size="small"
                            strokeColor={fgrStatusColor}
                            style={{ margin: 0 }}
                          />
                        </div>

                        {/* ── 3-Segment Structured Inventory Matrix (KGS & CARTONS) ── */}
                        <div className="ca-item-matrix">
                          {/* Segment A: Total Order Requirements */}
                          <div className="ca-matrix-segment ca-matrix-seg-ordered">
                            <div className="ca-matrix-seg-header">
                              <span className="ca-matrix-seg-dot" style={{ background: '#6366f1' }} />
                              <span className="ca-matrix-seg-title">A. Total Order Requirements</span>
                            </div>
                            <div className="ca-matrix-cells">
                              <div className="ca-matrix-cell">
                                <span className="ca-matrix-cell-label">Total Ordered (KGS)</span>
                                <span className="ca-matrix-cell-val ca-val-primary">
                                  {fmtNum(it.totalOrderedKgs, 1)} <small>KGS</small>
                                </span>
                              </div>
                              <div className="ca-matrix-cell">
                                <span className="ca-matrix-cell-label">Total Ordered (Cartons)</span>
                                <span className="ca-matrix-cell-val ca-val-indigo">
                                  {fmtNum(it.totalCartons, 1)} <small>CTN</small>
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Segment B: Current Inventory & Ready Stock (FGR) */}
                          <div className="ca-matrix-segment ca-matrix-seg-fgr">
                            <div className="ca-matrix-seg-header">
                              <span className="ca-matrix-seg-dot" style={{ background: '#10b981' }} />
                              <span className="ca-matrix-seg-title">B. Current Inventory &amp; Ready Stock (FGR)</span>
                            </div>
                            <div className="ca-matrix-cells">
                              <div className="ca-matrix-cell">
                                <span className="ca-matrix-cell-label">Ready in FGR (KGS)</span>
                                <span className="ca-matrix-cell-val ca-val-emerald">
                                  {fmtNum(it.readyFgrKgs, 1)} <small>KGS</small>
                                </span>
                              </div>
                              <div className="ca-matrix-cell">
                                <span className="ca-matrix-cell-label">Ready in FGR (Cartons)</span>
                                <span className="ca-matrix-cell-val ca-val-teal">
                                  {fmtNum(it.readyFgrCartons, 1)} <small>CTN</small>
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Segment C: Remaining Balance Tracking */}
                          <div className="ca-matrix-segment ca-matrix-seg-balance">
                            <div className="ca-matrix-seg-header">
                              <span
                                className="ca-matrix-seg-dot"
                                style={{ background: it.balancePendingKgs > 0 ? '#f59e0b' : '#10b981' }}
                              />
                              <span className="ca-matrix-seg-title">C. Remaining Balance Tracking</span>
                            </div>
                            <div className="ca-matrix-cells">
                              <div className="ca-matrix-cell">
                                <span className="ca-matrix-cell-label">Balance Pending (KGS)</span>
                                <span
                                  className={`ca-matrix-cell-val ${
                                    it.balancePendingKgs > 0 ? 'ca-val-amber' : 'ca-val-emerald'
                                  }`}
                                >
                                  {fmtNum(it.balancePendingKgs, 1)} <small>KGS</small>
                                </span>
                              </div>
                              <div className="ca-matrix-cell">
                                <span className="ca-matrix-cell-label">Balance Pending (Cartons)</span>
                                <span
                                  className={`ca-matrix-cell-val ${
                                    it.balancePendingCartons > 0 ? 'ca-val-amber' : 'ca-val-emerald'
                                  }`}
                                >
                                  {fmtNum(it.balancePendingCartons, 1)} <small>CTN</small>
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ── Associated Customers Quick View (Interactive Hyperlinks/Tags) ── */}
                        <div className="ca-item-pro-customers">
                          <div className="ca-item-pro-cust-hdr">
                            <UserOutlined style={{ color: accentClr }} />
                            <span>Associated Customers (Click to drill down into SOCs):</span>
                          </div>
                          <div className="ca-item-pro-cust-tags">
                            {associatedCusts.map((cust) => (
                              <button
                                key={cust.customerId + cust.customerName}
                                type="button"
                                className="ca-item-cust-chip"
                                onClick={() => openCustomerByNameOrRef(cust)}
                                title={`Open SOC Contracts for ${cust.customerName}`}
                              >
                                <span>{cust.customerName}</span>
                                <RightOutlined className="ca-item-cust-chip-arrow" />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty description="No matching items found." style={{ padding: 48 }} />
              )
            ) : (
              <Table
                size="small"
                dataSource={filteredItemStats}
                rowKey="itemCode"
                columns={itemColumns}
                pagination={{ pageSize: 20 }}
                className="ca-table"
              />
            )
          )}
        </Spin>
      </div>

      {/* ── Layer 2 & Layer 3 Drill-Down Modal: SOC Summary -> Item-Wise Order Details ── */}
      <DraggableResizableModal
        open={Boolean(selectedCustomerModal)}
        onCancel={closeCustomerSocModal}
        footer={null}
        width={1040}
        height={680}
        centered
        destroyOnClose
        className="ca-soc-modal"
        title={
          selectedCustomerModal ? (
            <div className="ca-soc-modal-header">
              <div
                className="ca-soc-modal-avatar"
                style={{
                  background: `${getFulfillmentColor(selectedCustomerModal.fulfillmentPct)}22`,
                  color: getFulfillmentColor(selectedCustomerModal.fulfillmentPct),
                }}
              >
                {selectedCustomerModal.name.charAt(0).toUpperCase()}
              </div>
              <div className="ca-soc-modal-title-wrap">
                <div className="ca-soc-modal-title-row">
                  <span className="ca-soc-modal-cust-name">{selectedCustomerModal.name}</span>
                  <Tag color="geekblue" style={{ margin: 0, fontWeight: 700 }}>
                    {selectedCustomerModal.customerCode || 'B2B'}
                  </Tag>
                  <Tag
                    color={
                      selectedCustomerModal.fulfillmentPct >= 100 && selectedCustomerModal.pendingGross <= 0
                        ? 'success'
                        : 'warning'
                    }
                    style={{ margin: 0, fontWeight: 700 }}
                  >
                    {selectedCustomerModal.fulfillmentPct >= 100 && selectedCustomerModal.pendingGross <= 0
                      ? '100% Fulfilled (Done)'
                      : `${selectedCustomerModal.fulfillmentPct}% Fulfilled • Pending`}
                  </Tag>
                </div>
                <div className="ca-soc-modal-subtitle">
                  {selectedSocContract
                    ? `Layer 3 Drill-Down • Item-Wise Order Details for ${selectedSocContract.socNumber}`
                    : 'Layer 2 Drill-Down • Click any Sales Order Contract (SOC) Number below to inspect item-wise order details'}
                </div>
              </div>
            </div>
          ) : null
        }
      >
        {selectedCustomerModal && (
          <div className="ca-soc-modal-body">
            {/* Customer Summary Strip */}
            <div className="ca-soc-kpi-strip">
              <div className="ca-soc-kpi-box">
                <span className="ca-soc-kpi-label">Total SOC Contracts</span>
                <span className="ca-soc-kpi-val" style={{ color: '#6366f1' }}>
                  {selectedCustomerModal.socContracts?.length || selectedCustomerModal.totalOrders || 0}
                </span>
              </div>
              <div className="ca-soc-kpi-box">
                <span className="ca-soc-kpi-label">Ordered Qty</span>
                <span className="ca-soc-kpi-val">
                  {fmtNum(selectedCustomerModal.totalOrderedGross, 0)} GRS
                </span>
              </div>
              <div className="ca-soc-kpi-box">
                <span className="ca-soc-kpi-label">Packed Qty</span>
                <span className="ca-soc-kpi-val" style={{ color: '#0d9488' }}>
                  {fmtNum(selectedCustomerModal.totalPackedGross, 0)} GRS
                </span>
              </div>
              <div className="ca-soc-kpi-box">
                <span className="ca-soc-kpi-label">Dispatched Qty</span>
                <span className="ca-soc-kpi-val" style={{ color: '#10b981' }}>
                  {fmtNum(selectedCustomerModal.totalDispatchedGross, 0)} GRS
                </span>
              </div>
              <div className="ca-soc-kpi-box">
                <span className="ca-soc-kpi-label">Remaining Pending</span>
                <span
                  className="ca-soc-kpi-val"
                  style={{
                    color: selectedCustomerModal.pendingGross > 0 ? '#f59e0b' : '#10b981',
                  }}
                >
                  {fmtNum(selectedCustomerModal.pendingGross, 0)} GRS
                </span>
              </div>
            </div>

            {!selectedSocContract ? (
              /* ── LAYER 2: SOC Summary List ── */
              <div className="ca-soc-list-section">
                <div className="ca-soc-section-heading">
                  <span>
                    <FileTextOutlined style={{ marginRight: 6, color: '#6366f1' }} />
                    Sales Order Contracts (SOC) — Select an SOC Number to view item-wise breakdown
                  </span>
                  <span className="ca-soc-count-badge">
                    {selectedCustomerModal.socContracts?.length || 0} Contracts
                  </span>
                </div>

                {selectedCustomerModal.socContracts && selectedCustomerModal.socContracts.length > 0 ? (
                  <div className="ca-soc-grid">
                    {selectedCustomerModal.socContracts.map((soc) => {
                      const socColor = getFulfillmentColor(soc.fulfillmentPct);
                      const isDone = soc.fulfillmentPct >= 100 && soc.totalPendingQty <= 0;
                      return (
                        <div
                          key={soc.orderId + soc.socNumber}
                          className="ca-soc-card"
                          onClick={() => setSelectedSocNumber(soc.socNumber)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedSocNumber(soc.socNumber);
                            }
                          }}
                        >
                          <div className="ca-soc-card-top">
                            <button
                              type="button"
                              className="ca-soc-number-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSocNumber(soc.socNumber);
                              }}
                            >
                              <FileTextOutlined />
                              <span>{soc.socNumber}</span>
                            </button>
                            <div className="ca-soc-card-badges">
                              {soc.orderDate && (
                                <span className="ca-soc-date">
                                  {String(soc.orderDate).slice(0, 10)}
                                </span>
                              )}
                              <Tag
                                color={isDone ? 'success' : soc.totalDispatchedQty > 0 ? 'processing' : 'warning'}
                                style={{ margin: 0, fontWeight: 700, fontSize: 11 }}
                              >
                                {isDone ? 'Done (100%)' : soc.totalDispatchedQty > 0 ? 'Partial' : 'Pending'}
                              </Tag>
                            </div>
                          </div>

                          <div className="ca-soc-card-metrics">
                            <div className="ca-soc-metric">
                              <span className="ca-soc-metric-lbl">Items</span>
                              <span className="ca-soc-metric-val">{soc.items.length}</span>
                            </div>
                            <div className="ca-soc-metric">
                              <span className="ca-soc-metric-lbl">Ordered Qty</span>
                              <span className="ca-soc-metric-val">{fmtNum(soc.totalOrderedQty, 0)} GRS</span>
                            </div>
                            <div className="ca-soc-metric">
                              <span className="ca-soc-metric-lbl" style={{ color: '#0d9488' }}>Packed Qty</span>
                              <span className="ca-soc-metric-val" style={{ color: '#0d9488' }}>
                                {fmtNum(soc.totalPackedQty, 0)} GRS
                              </span>
                            </div>
                            <div className="ca-soc-metric">
                              <span className="ca-soc-metric-lbl" style={{ color: '#10b981' }}>Dispatched Qty</span>
                              <span className="ca-soc-metric-val" style={{ color: '#10b981' }}>
                                {fmtNum(soc.totalDispatchedQty, 0)} GRS
                              </span>
                            </div>
                            <div className="ca-soc-metric">
                              <span className="ca-soc-metric-lbl">Pending Qty</span>
                              <span
                                className="ca-soc-metric-val"
                                style={{ color: soc.totalPendingQty > 0 ? '#f59e0b' : '#10b981' }}
                              >
                                {soc.totalPendingQty > 0 ? `${fmtNum(soc.totalPendingQty, 0)} GRS` : '0 GRS'}
                              </span>
                            </div>
                          </div>

                          <div className="ca-soc-card-bottom">
                            <div className="ca-soc-progress-wrap">
                              <Progress
                                percent={soc.fulfillmentPct}
                                size="small"
                                strokeColor={socColor}
                                format={(p) => (
                                  <span style={{ color: socColor, fontWeight: 800, fontSize: 11 }}>{p}%</span>
                                )}
                              />
                            </div>
                            <span className="ca-soc-drill-link">
                              View Item Details <RightOutlined style={{ fontSize: 10 }} />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <Empty description="No SOC contracts found for this customer." style={{ padding: 32 }} />
                )}
              </div>
            ) : (
              /* ── LAYER 3: Item-Wise Order Details for Selected SOC ── */
              <div className="ca-soc-detail-section">
                <div className="ca-soc-detail-nav">
                  <button
                    type="button"
                    className="ca-soc-back-btn"
                    onClick={() => setSelectedSocNumber(null)}
                  >
                    <ArrowLeftOutlined /> Back to All SOC Contracts
                  </button>

                  {selectedCustomerModal.socContracts && selectedCustomerModal.socContracts.length > 1 && (
                    <div className="ca-soc-Quick-pills">
                      {selectedCustomerModal.socContracts.map((s) => (
                        <button
                          key={s.socNumber}
                          type="button"
                          className={`ca-soc-pill ${s.socNumber === selectedSocContract.socNumber ? 'active' : ''}`}
                          onClick={() => setSelectedSocNumber(s.socNumber)}
                        >
                          {s.socNumber}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="ca-soc-active-banner">
                  <div className="ca-soc-active-left">
                    <span className="ca-soc-active-tag">
                      <FileTextOutlined /> {selectedSocContract.socNumber}
                    </span>
                    {selectedSocContract.orderDate && (
                      <span className="ca-soc-active-date">
                        Contract Date: {String(selectedSocContract.orderDate).slice(0, 10)}
                      </span>
                    )}
                  </div>
                  <div className="ca-soc-active-right">
                    <span>
                      Ordered: <strong>{fmtNum(selectedSocContract.totalOrderedQty, 0)} GRS</strong>
                    </span>
                    <span>•</span>
                    <span style={{ color: '#0d9488' }}>
                      Packed: <strong>{fmtNum(selectedSocContract.totalPackedQty, 0)} GRS</strong>
                    </span>
                    <span>•</span>
                    <span style={{ color: '#10b981' }}>
                      Dispatched: <strong>{fmtNum(selectedSocContract.totalDispatchedQty, 0)} GRS</strong>
                    </span>
                    <span>•</span>
                    <span style={{ color: selectedSocContract.totalPendingQty > 0 ? '#f59e0b' : '#10b981' }}>
                      Remaining Pending: <strong>{fmtNum(selectedSocContract.totalPendingQty, 0)} GRS</strong>
                    </span>
                  </div>
                </div>

                <Table
                  size="small"
                  rowKey="key"
                  pagination={false}
                  dataSource={selectedSocContract.items}
                  className="ca-table ca-soc-item-table"
                  columns={[
                    {
                      title: '#',
                      key: 'idx',
                      width: 46,
                      render: (_: any, __: SocItemDetail, idx: number) => (
                        <span style={{ fontWeight: 700, color: 'var(--theme-text-muted, #64748b)' }}>
                          {idx + 1}
                        </span>
                      ),
                    },
                    {
                      title: 'ITEM NAME',
                      key: 'itemName',
                      render: (_: any, item: SocItemDetail) => (
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--theme-heading, #f8fafc)', fontSize: 13 }}>
                            {item.itemName}
                          </div>
                          {item.itemCode && (
                            <div style={{ fontSize: 11, color: 'var(--theme-accent, #6366f1)', fontWeight: 600 }}>
                              {item.itemCode}
                            </div>
                          )}
                        </div>
                      ),
                    },
                    {
                      title: 'ORDERED QTY',
                      key: 'orderedQty',
                      align: 'right' as const,
                      width: 135,
                      render: (_: any, item: SocItemDetail) => (
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--theme-text, #e2e8f0)', fontSize: 13 }}>
                            {fmtNum(item.orderedQty, 0)} GRS
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)' }}>
                            {fmtNum(Math.round(item.orderedQty * 144), 0)} PCS
                          </div>
                        </div>
                      ),
                    },
                    {
                      title: 'PACKED QTY',
                      key: 'packedQty',
                      align: 'right' as const,
                      width: 135,
                      render: (_: any, item: SocItemDetail) => (
                        <div>
                          <div style={{ fontWeight: 700, color: '#0d9488', fontSize: 13 }}>
                            {fmtNum(item.packedQty, 0)} GRS
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)' }}>
                            {fmtNum(Math.round(item.packedQty * 144), 0)} PCS
                          </div>
                        </div>
                      ),
                    },
                    {
                      title: 'DISPATCHED QTY',
                      key: 'dispatchedQty',
                      align: 'right' as const,
                      width: 145,
                      render: (_: any, item: SocItemDetail) => (
                        <div>
                          <div style={{ fontWeight: 700, color: '#10b981', fontSize: 13 }}>
                            {fmtNum(item.dispatchedQty, 0)} GRS
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)' }}>
                            {fmtNum(Math.round(item.dispatchedQty * 144), 0)} PCS
                          </div>
                        </div>
                      ),
                    },
                    {
                      title: 'REMAINING PENDING QTY',
                      key: 'remainingPendingQty',
                      align: 'right' as const,
                      width: 175,
                      render: (_: any, item: SocItemDetail) => (
                        <div>
                          <div
                            style={{
                              fontWeight: 800,
                              color: item.remainingPendingQty > 0 ? '#f59e0b' : '#10b981',
                              fontSize: 13,
                            }}
                          >
                            {item.remainingPendingQty > 0
                              ? `${fmtNum(item.remainingPendingQty, 0)} GRS`
                              : '0 GRS (Done)'}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)' }}>
                            {fmtNum(Math.round(item.remainingPendingQty * 144), 0)} PCS • {item.fulfillmentPct}%
                          </div>
                        </div>
                      ),
                    },
                  ]}
                  summary={() => (
                    <Table.Summary fixed>
                      <Table.Summary.Row className="ca-soc-summary-row">
                        <Table.Summary.Cell index={0} colSpan={2}>
                          <strong>Contract Total ({selectedSocContract.items.length} Items)</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right">
                          <strong>{fmtNum(selectedSocContract.totalOrderedQty, 0)} GRS</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">
                          <strong style={{ color: '#0d9488' }}>
                            {fmtNum(selectedSocContract.totalPackedQty, 0)} GRS
                          </strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right">
                          <strong style={{ color: '#10b981' }}>
                            {fmtNum(selectedSocContract.totalDispatchedQty, 0)} GRS
                          </strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right">
                          <strong
                            style={{
                              color: selectedSocContract.totalPendingQty > 0 ? '#f59e0b' : '#10b981',
                            }}
                          >
                            {fmtNum(selectedSocContract.totalPendingQty, 0)} GRS
                          </strong>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  )}
                />
              </div>
            )}
          </div>
        )}
      </DraggableResizableModal>
    </div>
  );
};

export default CustomerAnalytics;
