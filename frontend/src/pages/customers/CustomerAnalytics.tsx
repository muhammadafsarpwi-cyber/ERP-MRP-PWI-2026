import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table, Tag, Input, Select, Button, Spin, Empty, Tooltip,
  Progress, Row, Col, Statistic, Card, Tabs, Badge,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, AppstoreOutlined, UnorderedListOutlined,
  TrophyOutlined, ShoppingCartOutlined, RocketOutlined, BarChartOutlined,
  UserOutlined, TagOutlined, DollarOutlined, InboxOutlined,
  LeftOutlined, RightOutlined, RightCircleOutlined, ClockCircleOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import apiService from '../../services/api';
import './CustomerAnalytics.css';

const { Option } = Select;

export interface SafetyItemDetail {
  itemCode: string;
  itemName: string;
  cartons: number;
  gross: number;
  pcs: number;
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
}

interface ItemStat {
  itemCode: string;
  itemName: string;
  totalGross: number;
  totalCartons: number;
  totalDispatchedGross?: number;
  totalDispatchedCartons?: number;
  customerCount: number;
  customerNames: string[];
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
  const [activeTab, setActiveTab] = useState<'customers' | 'items'>('customers');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load sales orders, deliveries, registered customers, and hand packing production entries in parallel
      const [ordersRes, deliveriesRes, salesCustRes, masterCustRes, prodRes, openStockRes] = await Promise.allSettled([
        apiService.get('/sales/orders?limit=500&status=all'),
        apiService.get('/sales/deliveries?limit=500&status=all'),
        apiService.get('/sales/orders/meta/customers'),
        apiService.get('/customer/customers?limit=500'),
        apiService.get('/production/entries?machineNo=HAND-PACK&limit=500'),
        apiService.get('/production/open-stock/history?limit=200'),
      ]);

      const orders: any[] = ordersRes.status === 'fulfilled'
        ? ((ordersRes.value as any)?.data?.data || (ordersRes.value as any)?.data || [])
        : [];
      const deliveries: any[] = deliveriesRes.status === 'fulfilled'
        ? ((deliveriesRes.value as any)?.data?.data || (deliveriesRes.value as any)?.data || [])
        : [];
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

      // Build customer map from orders
      const custMap = new Map<string, CustomerStat>();

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
        const orderNo = order.orderNumber || order.order_number || order.id;
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
          });
        }

        const stat = custMap.get(custId)!;
        stat.totalOrders += 1;
        if (orderNo) stat.orderNumbers?.push(orderNo);
        if (orderDate && (!stat.lastOrderDate || orderDate > stat.lastOrderDate)) {
          stat.lastOrderDate = orderDate;
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
          });
        }

        const stat = custMap.get(custId)!;
        const lines = delivery.lines || delivery.items || [];
        for (const line of lines) {
          const lineItemObj = line.item || {};
          const qty = Number(line.quantity || line.qty || 0);
          const pkgSize = Number(lineItemObj.packagingSize || line.packageQuantity || line.packagingSize || 10);
          stat.totalDispatchedGross += qty;
          stat.totalDispatchedCartons += qty > 0 && pkgSize > 0 ? Math.round(qty / pkgSize) : 0;
          if (!stat.topItem) {
            stat.topItem = lineItemObj.name || line.description || line.itemName || '';
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
        }
      }

      // Calculate fulfillment %, totalPacked and readyToDispatch for regular customers: Ready to Dispatch = Total Packed - Dispatched (P - D)
      const result: CustomerStat[] = Array.from(custMap.values()).map((c) => {
        const packed = custPackedMap.get(c.id) || { gross: 0, cartons: 0, topItem: '' };
        const pendingGross = Math.max(0, Math.round((c.totalOrderedGross - c.totalDispatchedGross) * 100) / 100);

        // Core business formula requested by user: Packed - Dispatched = Ready to Dispatch (P - D)
        const readyToDispatchGross = Math.max(0, Math.round((packed.gross - c.totalDispatchedGross) * 100) / 100);
        const readyToDispatchCartons =
          packed.gross > 0 && packed.cartons > 0
            ? Math.round((readyToDispatchGross / packed.gross) * packed.cartons)
            : Math.round(readyToDispatchGross / 10);

        const fulfillmentPct =
          c.totalOrderedGross > 0
            ? Math.min(100, Math.round((c.totalDispatchedGross / c.totalOrderedGross) * 100))
            : (c.totalDispatchedGross > 0 ? 100 : 0);

        return {
          ...c,
          totalPackedGross: packed.gross,
          totalPackedCartons: packed.cartons,
          pendingGross,
          fulfillmentPct,
          readyToDispatchGross,
          readyToDispatchCartons,
          topItem: c.topItem || packed.topItem || '',
          isSafetyStock: false,
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

      // Build item stats from orders
      const itemMap = new Map<string, ItemStat>();
      for (const order of orders) {
        const custId = order.customerId || order.customer_id;
        const custInfo = customerDirectory.get(custId);
        const custName = custInfo?.name || getCustomerDisplayName(order.customer) || 'Customer';
        const items = order.items || order.orderItems || order.lines || [];
        for (const item of items) {
          const itemObj = item.item || {};
          const code = itemObj.itemCode || item.itemCode || item.item_code || '';
          const name = itemObj.name || item.description || item.itemName || item.item_name || code || 'Item';
          const qty = Number(item.quantity || item.qty || 0);
          const pkgSize = Number(itemObj.packagingSize || item.packageQuantity || item.packagingSize || 10);

          if (!code && !name) continue;
          const key = code || name;
          if (!itemMap.has(key)) {
            itemMap.set(key, {
              itemCode: code || key,
              itemName: name,
              totalGross: 0,
              totalCartons: 0,
              totalDispatchedGross: 0,
              totalDispatchedCartons: 0,
              customerCount: 0,
              customerNames: []
            });
          }
          const s = itemMap.get(key)!;
          s.totalGross += qty;
          s.totalCartons += qty > 0 && pkgSize > 0 ? Math.round(qty / pkgSize) : 0;
          if (custName && !s.customerNames.includes(custName)) {
            s.customerNames.push(custName);
            s.customerCount += 1;
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
          const pkgSize = Number(lineItemObj.packagingSize || line.packageQuantity || line.packagingSize || 10);

          if (!code && !name) continue;
          const key = code || name;
          if (!itemMap.has(key)) {
            itemMap.set(key, {
              itemCode: code || key,
              itemName: name,
              totalGross: 0,
              totalCartons: 0,
              totalDispatchedGross: 0,
              totalDispatchedCartons: 0,
              customerCount: 0,
              customerNames: []
            });
          }
          const s = itemMap.get(key)!;
          s.totalDispatchedGross = (s.totalDispatchedGross || 0) + qty;
          s.totalDispatchedCartons = (s.totalDispatchedCartons || 0) + (qty > 0 && pkgSize > 0 ? Math.round(qty / pkgSize) : 0);
        }
      }
      const itemResult = Array.from(itemMap.values()).sort((a, b) => b.totalGross - a.totalGross);
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

  const CARDS_PER_ROW = 5;
  const onlyCustomers = useMemo(() => filteredCustomers.filter(c => !c.isSafetyStock), [filteredCustomers]);
  const safetyStockStat = useMemo(() => customers.find(c => c.isSafetyStock), [customers]);
  const totalCustomerPages = Math.max(1, Math.ceil(onlyCustomers.length / CARDS_PER_ROW));

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
      title: 'ITEM',
      key: 'item',
      render: (_: any, it: ItemStat) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--theme-accent, #6366f1)', fontSize: 12 }}>{it.itemCode}</div>
          <div style={{ fontSize: 11, color: 'var(--theme-text, #1e293b)', fontWeight: 600 }}>{it.itemName}</div>
        </div>
      ),
    },
    {
      title: 'TOTAL GRS ORDERED',
      key: 'gross',
      align: 'right' as const,
      render: (_: any, it: ItemStat) => (
        <span style={{ fontWeight: 700, color: 'var(--theme-heading, #1e293b)' }}>{fmtNum(it.totalGross, 0)} GRS</span>
      ),
    },
    {
      title: 'DISPATCHED GRS',
      key: 'dispatched',
      align: 'right' as const,
      render: (_: any, it: ItemStat) => (
        <span style={{ fontWeight: 700, color: '#10b981' }}>{fmtNum(it.totalDispatchedGross || 0, 0)} GRS</span>
      ),
    },
    {
      title: 'CARTONS',
      key: 'cartons',
      align: 'right' as const,
      render: (_: any, it: ItemStat) => (
        <span style={{ fontWeight: 700, color: 'var(--theme-accent, #6366f1)' }}>{fmtNum(it.totalCartons, 0)} CTN</span>
      ),
    },
    {
      title: 'CUSTOMERS',
      key: 'customers',
      render: (_: any, it: ItemStat) => (
        <div>
          <Tag color="purple">{it.customerCount} Customers</Tag>
          <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', marginTop: 2 }}>
            {it.customerNames.slice(0, 2).join(', ')}{it.customerCount > 2 ? ` +${it.customerCount - 2}` : ''}
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

      {/* ── Tabs: Customers | Items ── */}
      <div className="ca-section">
        <div className="ca-section-toolbar">
          <div className="ca-tabs">
            <button
              className={`ca-tab ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => setActiveTab('customers')}
            >
              <UserOutlined /> Customers ({filteredCustomers.length})
            </button>
            <button
              className={`ca-tab ${activeTab === 'items' ? 'active' : ''}`}
              onClick={() => setActiveTab('items')}
            >
              <TagOutlined /> Items ({itemStats.length})
            </button>
          </div>

          <div className="ca-toolbar-right">
            {activeTab === 'customers' && (
              <>
                <Input
                  prefix={<SearchOutlined />}
                  placeholder="Search customer, item or buffer..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  allowClear
                  className="ca-search"
                />
                <Select value={sortBy} onChange={setSortBy} className="ca-sort-select">
                  <Option value="dispatched">Sort: Dispatched ↓</Option>
                  <Option value="packed">Sort: Total Packed ↓</Option>
                  <Option value="ready">Sort: Ready to Dispatch ↓</Option>
                  <Option value="pending">Sort: Pending ↓</Option>
                  <Option value="orders">Sort: Orders ↓</Option>
                  <Option value="value">Sort: Value ↓</Option>
                </Select>
              </>
            )}
            <div className="ca-view-toggle">
              <button
                className={`ca-toggle-btn ${viewMode === 'card' ? 'active' : ''}`}
                onClick={() => setViewMode('card')}
                title="Card View"
              >
                <AppstoreOutlined />
              </button>
              <button
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
          {activeTab === 'customers' ? (
            viewMode === 'card' ? (
              <div className="ca-cards-carousel-container">
                {/* ── Single-Row Customer Cards Carousel with Side Edge Arrows ── */}
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
                      return (
                        <div
                          key={c.id}
                          className="ca-customer-card"
                          style={{ '--accent': accentColor } as any}
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
                              {c.totalOrders} {c.totalOrders === 1 ? 'Order' : 'Orders'}
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

                          {c.lastOrderDate && (
                            <div className="ca-card-date">
                              Last order: {c.lastOrderDate?.slice(0, 10) || ''}
                            </div>
                          )}
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

                {/* ── Permanent Dedicated Safety Stock Buffer Dock Below ── */}
                {safetyStockStat && (
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
                dataSource={filteredCustomers}
                rowKey="id"
                columns={tableColumns}
                pagination={{ pageSize: 20, showSizeChanger: true }}
                className="ca-table"
              />
            )
          ) : (
            viewMode === 'card' ? (
              <div className="ca-card-grid">
                {itemStats.map((it, i) => (
                  <div key={it.itemCode} className="ca-customer-card" style={{ '--accent': COLORS[i % COLORS.length] } as any}>
                    <div className="ca-card-rank" style={{ color: COLORS[i % COLORS.length] }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </div>
                    <div className="ca-card-header">
                      <div className="ca-card-avatar" style={{ background: `${COLORS[i % COLORS.length]}22`, color: COLORS[i % COLORS.length] }}>
                        <InboxOutlined />
                      </div>
                      <div className="ca-card-info">
                        <div className="ca-card-name" style={{ fontSize: 12 }}>{it.itemCode}</div>
                        <div className="ca-card-code">{it.itemName}</div>
                      </div>
                    </div>
                    <div className="ca-card-stats">
                      <div className="ca-stat">
                        <div className="ca-stat-label">Total GRS</div>
                        <div className="ca-stat-val" style={{ color: COLORS[i % COLORS.length] }}>{fmtNum(it.totalGross, 0)}</div>
                      </div>
                      <div className="ca-stat">
                        <div className="ca-stat-label">Cartons</div>
                        <div className="ca-stat-val">{fmtNum(it.totalCartons, 0)}</div>
                      </div>
                      <div className="ca-stat">
                        <div className="ca-stat-label">Customers</div>
                        <div className="ca-stat-val" style={{ color: '#6366f1' }}>{it.customerCount}</div>
                      </div>
                    </div>
                    <div className="ca-card-item" style={{ marginTop: 8 }}>
                      <UserOutlined style={{ marginRight: 4, color: COLORS[i % COLORS.length] }} />
                      <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>
                        {it.customerNames.slice(0, 2).join(', ')}{it.customerCount > 2 ? ` +${it.customerCount - 2} more` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Table
                size="small"
                dataSource={itemStats}
                rowKey="itemCode"
                columns={itemColumns}
                pagination={{ pageSize: 20 }}
                className="ca-table"
              />
            )
          )}
        </Spin>
      </div>
    </div>
  );
};

export default CustomerAnalytics;
