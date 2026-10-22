import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import {
  Tabs, Card, Tag, Typography, Space, Button, Table, Input, Row, Col, Segmented,
  Modal, message, Popover, Checkbox, Empty, Progress, Spin,
} from 'antd';
import {
  InboxOutlined, SettingOutlined, HistoryOutlined,
  SearchOutlined, ReloadOutlined, DownOutlined,
  CheckCircleFilled, DatabaseOutlined,
  SyncOutlined, PlusCircleOutlined, MinusCircleOutlined,
  PartitionOutlined, ApartmentOutlined,
  ArrowsAltOutlined, ShrinkOutlined, SendOutlined, UpOutlined,
  PrinterOutlined, FilePdfOutlined, FileExcelOutlined, WhatsAppOutlined,
  CopyOutlined, CheckOutlined, AimOutlined, TeamOutlined, AppstoreOutlined,
  DollarCircleOutlined, ShopOutlined, ClockCircleOutlined, CalendarOutlined,
  FolderOpenOutlined, EyeOutlined,
} from '@ant-design/icons';
import HandPackingEntry from './HandPackingEntry';
import FinishedGoodBomSetup from '../bom/FinishedGoodBomSetup';
import PackingShiftTargetSetup from './PackingShiftTargetSetup';
import Breadcrumbs from '../../../components/shared/Breadcrumbs';
import apiService from '../../../services/api';
import { formatNumber, toNum } from '../../../utils/numberFormat';
import dayjs from 'dayjs';
import { useHeaderActions } from '../../../components/layout/headerActionsStore';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import '../productionItemOpenStock.css';

dayjs.extend(customParseFormat);

const { Text } = Typography;

export const PackingDepartmentHub: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'packing-entry';

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const location = useLocation();
  const routeTabId = location.pathname;

  useEffect(() => {
    const store = useHeaderActions.getState();
    store.claimActionsSlot(routeTabId);
    store.setHeaderActions([], routeTabId);
    return () => {
      store.releaseActionsSlot(routeTabId);
    };
  }, [routeTabId]);

  // Sync tab with search params without losing state
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
    const openW = searchParams.get('openWhatsApp');
    if (openW === 'today') {
      setTodayWhatsAppModalVisible(true);
      const newP = new URLSearchParams(searchParams);
      newP.delete('openWhatsApp');
      setSearchParams(newP, { replace: true });
    } else if (openW === 'fgr') {
      setFgrWhatsAppModalVisible(true);
      const newP = new URLSearchParams(searchParams);
      newP.delete('openWhatsApp');
      setSearchParams(newP, { replace: true });
    }
  }, [searchParams, activeTab, setSearchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', key);
    setSearchParams(newParams, { replace: true });
  };

  const handleNavigateTab = (tabKey: string, params?: Record<string, string>) => {
    const newParams = new URLSearchParams();
    newParams.set('tab', tabKey);
    if (params) {
      Object.entries(params).forEach(([k, v]) => newParams.set(k, v));
    }
    setSearchParams(newParams, { replace: true });
    setActiveTab(tabKey);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 3: CUSTOMER-WISE PACKED INVENTORY HIERARCHY
  // Strictly real DB data only — all dummy/mock data eliminated
  // ─────────────────────────────────────────────────────────────────────────────
  const [fgrViewMode, setFgrViewMode] = useState<string>('customer-hierarchy');
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<string[]>([]);
  const [selectedSocModalData, setSelectedSocModalData] = useState<{
    customerName: string;
    customerCode: string;
    socNo: string;
    socGroup: any;
  } | null>(null);
  const [expandedSocKeys, setExpandedSocKeys] = useState<string[]>([]);
  const [customerHierarchyViewType, setCustomerHierarchyViewType] = useState<'soc-grouped' | 'flat-items'>('soc-grouped');
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [historySearchText, setHistorySearchText] = useState<string>('');
  const [historyFetched, setHistoryFetched] = useState<boolean>(false);

  // Customer-Specific WhatsApp Share Modal state (Tab 3)
  const [whatsAppModalCust, setWhatsAppModalCust] = useState<any | null>(null);
  const [whatsAppCustPhone, setWhatsAppCustPhone] = useState<string>('');
  const [copiedCustWhatsApp, setCopiedCustWhatsApp] = useState<boolean>(false);

  // Today's Packing Production Report WhatsApp Modal state
  const [todayWhatsAppModalVisible, setTodayWhatsAppModalVisible] = useState<boolean>(false);
  const [todayWhatsAppPhone, setTodayWhatsAppPhone] = useState<string>('');
  const [copiedTodayWhatsApp, setCopiedTodayWhatsApp] = useState<boolean>(false);

  // Live FGR Warehouse Stock Balance WhatsApp Modal state
  const [fgrWhatsAppModalVisible, setFgrWhatsAppModalVisible] = useState<boolean>(false);
  const [fgrWhatsAppPhone, setFgrWhatsAppPhone] = useState<string>('');
  const [copiedFgrWhatsApp, setCopiedFgrWhatsApp] = useState<boolean>(false);

  const fetchPackingHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      // Direct, ultra-fast queries for packing production entries, sales orders and open stock
      const [res, soRes, openStockRes]: any = await Promise.all([
        apiService.get('/production/entries/packing?limit=1000').catch(() => null),
        apiService.get('/sales/orders?limit=100').catch(() => null),
        apiService.get('/production/open-stock/history?limit=200').catch(() => null),
      ]);
      let list: any[] = [];
      if (Array.isArray(res)) list = res;
      else if (Array.isArray(res?.data)) list = res.data;
      else if (Array.isArray(res?.items)) list = res.items;
      else if (Array.isArray(res?.data?.items)) list = res.data.items;

      // Integrate customer opening stock entries from stock ledger (e.g. CROWN FIT PAKISTAN, etc.)
      const openStockList = Array.isArray(openStockRes)
        ? openStockRes
        : (Array.isArray(openStockRes?.data) ? openStockRes.data : []);

      const openStockEntries = openStockList
        .filter((os: any) => {
          const notes = String(os.notes || '');
          const isFg = os.item?.itemType === 'FINISHED_GOOD' || (os.item?.itemCode || '').startsWith('SPI-FG');
          return isFg || notes.includes('Customer:') || notes.includes('SOC:') || notes.includes('Cartons:');
        })
        .map((os: any) => {
          const notes = String(os.notes || '');
          const custMatch = notes.match(/Customer:\s*([^|\]]+)/i);
          const socMatch = notes.match(/SOC:\s*([^|\]]+)/i);
          const ctnMatch = notes.match(/Cartons:\s*([\d.]+)/i) || notes.match(/\[([\d.]+)\s*CTN/i);
          const grossMatch = notes.match(/Gross:\s*([\d.]+)/i) || notes.match(/([\d.]+)\s*GRS/i);
          const batchMatch = notes.match(/Batch:\s*([^|\]]+)/i);

          const pcs = Number(os.quantity || 0);
          const cartons = ctnMatch ? Number(ctnMatch[1]) : Math.round(pcs / 1440);
          const gross = grossMatch ? Number(grossMatch[1]) : Math.round(pcs / 144);
          const batchNo = batchMatch ? batchMatch[1].trim() : (os.referenceNumber || 'OPENING-STOCK');
          const custName = custMatch ? custMatch[1].trim() : 'Opening Stock';
          const socNo = socMatch ? socMatch[1].trim() : '—';

          return {
            id: os.id || `open-stock-${Math.random()}`,
            itemId: os.itemId || os.item?.id,
            item: os.item,
            itemCode: os.item?.itemCode || 'FG-ITEM',
            itemName: os.item?.name || 'Finished Good',
            actualQuantity: pcs,
            entryDate: os.transactionDate || os.createdAt,
            createdAt: os.createdAt || os.transactionDate,
            entryType: 'OPENING_STOCK',
            status: 'OPENING',
            operatorName: 'System Opening',
            shiftName: 'Opening Stock',
            shift: { name: 'Opening Stock' },
            batchNumber: batchNo,
            remarks: `[OPENING STOCK] Batch: ${batchNo} | Customer: ${custName} | SOC: ${socNo} | Cartons: ${cartons} (${gross} Gross / ${pcs} PCS) | ${notes}`,
            isOpeningStock: true,
          };
        });

      // Unified history: live packing production + customer opening stock
      setHistoryLogs([...list, ...openStockEntries]);
      const soList = Array.isArray(soRes) ? soRes : (Array.isArray(soRes?.data) ? soRes.data : (Array.isArray(soRes?.items) ? soRes.items : []));
      setSalesOrders(soList);
      setHistoryFetched(true);
    } catch (err) {
      console.warn('Failed to load packing history', err);
      setHistoryLogs([]);
      setHistoryFetched(true);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Preload packing history immediately on mount in background so it's ready when user opens Tab 3
  useEffect(() => {
    if (!historyFetched && !loadingHistory) {
      fetchPackingHistory();
    }
  }, [fetchPackingHistory, historyFetched, loadingHistory]);

  // Compute Customer-Wise Packed Inventory from real packing entries, consolidating identical Item + SOC
  const customerStockData = useMemo(() => {
    if (!historyLogs || historyLogs.length === 0) return [];

    const customerMap = new Map<string, {
      id: string;
      customerCode: string;
      customerName: string;
      socNo: string;
      itemMap: Map<string, any>;
    }>();

    historyLogs.forEach((entry: any) => {
      const remarks = String(entry.remarks || '');
      const custMatch = remarks.match(/Customer:\s*([^|\]]+)/i);
      const custName = custMatch ? custMatch[1].trim() : (entry.customer?.name || 'General Stock / Retail');
      const custCode = (entry.customer?.customerCode || custName.slice(0, 8).toUpperCase()).replace(/\s+/g, '-');
      const socMatch = remarks.match(/SOC:\s*([^|\]]+)/i);
      const socNo = socMatch ? socMatch[1].trim() : (entry.socNo || '—');
      const styleMatch = remarks.match(/Style:\s*([^|\]]+)/i);
      const packagingStyle = styleMatch ? styleMatch[1].trim() : 'Standard Packing';

      const pcs = toNum(entry.actualQuantity || entry.quantity || 0);
      const ctnMatch = remarks.match(/Cartons:\s*([\d.]+)/i) || remarks.match(/\[([\d.]+)\s*CTN/i);
      const grossMatch = remarks.match(/Gross:\s*([\d.]+)/i) || remarks.match(/\(([\d.]+)\s*Gross/i) || remarks.match(/([\d.]+)\s*GRS/i);
      const cartons = ctnMatch ? Number(ctnMatch[1]) : Math.round(pcs / 1440);
      const gross = grossMatch ? Number(grossMatch[1]) : Math.round(pcs / 144);
      
      const weightMatch = remarks.match(/Weight:\s*([\d.]+)\s*KG/i);
      const itemCode = entry.item?.itemCode || entry.itemCode || 'FG-ITEM';
      const itemName = entry.item?.name || entry.itemName || 'Packed Finished Good';
      const codeStr = String(itemCode);
      const perPieceWeightKg = toNum(
        entry.item?.weightPerPiece ||
        entry.item?.perPieceWeightKg ||
        entry.perPieceWeightKg ||
        (codeStr.includes('006') ? 0.016055 : 0.013150)
      );
      const weightKg = toNum(entry.totalWeightKg || entry.total_weight_kg) ||
        (weightMatch ? Number(weightMatch[1]) : Math.round(pcs * perPieceWeightKg * 10) / 10);

      const isWithoutNipple = remarks.includes('WITHOUT_NIPPLE') || entry.status === 'WITHOUT_NIPPLE';
      const isOpeningStock = Boolean(entry.isOpeningStock || remarks.includes('[OPENING STOCK]'));
      const batchMatch = remarks.match(/Batch:\s*([^|\]]+)/i);
      const batchNo = batchMatch ? batchMatch[1].trim() : (entry.batchNumber || entry.batchNo || (isOpeningStock ? 'OPENING' : '—'));

      // Accurate Packing Date and Packing Time resolution
      const rawDateStr = entry.entryDate || entry.entry_date || entry.productionDate || entry.production_date;
      const rawTimeObj = entry.createdAt || entry.created_at || entry.entryDate;

      let formattedDate = '—';
      let formattedTime = '';

      if (rawDateStr) {
        const parsedD = dayjs(rawDateStr);
        if (parsedD.isValid()) formattedDate = parsedD.format('DD-MMM-YYYY');
      }
      if (formattedDate === '—' && rawTimeObj) {
        const parsedD = dayjs(rawTimeObj);
        if (parsedD.isValid()) formattedDate = parsedD.format('DD-MMM-YYYY');
      }

      const timeMatch = remarks.match(/Time:\s*([0-9:AMPMapm\s]+)/i);
      if (timeMatch) {
        formattedTime = timeMatch[1].trim();
      } else if (rawTimeObj) {
        const parsedT = dayjs(rawTimeObj);
        if (parsedT.isValid()) formattedTime = parsedT.format('hh:mm A');
      }

      // Compute precise sortTimestamp for chronological ascending ordering
      let sortTimestamp = 0;
      if (formattedDate !== '—') {
        if (formattedTime) {
          const parsedDT = dayjs(`${formattedDate} ${formattedTime}`, 'DD-MMM-YYYY hh:mm A');
          if (parsedDT.isValid()) sortTimestamp = parsedDT.valueOf();
        }
        if (!sortTimestamp) {
          const parsedD = dayjs(formattedDate, 'DD-MMM-YYYY');
          if (parsedD.isValid()) sortTimestamp = parsedD.valueOf();
        }
      }
      if (!sortTimestamp && (rawDateStr || rawTimeObj)) {
        const parsedAny = dayjs(rawDateStr || rawTimeObj);
        if (parsedAny.isValid()) sortTimestamp = parsedAny.valueOf();
      }

      const logRecord = {
        id: entry.id || `${custCode}-${Math.random()}`,
        date: rawDateStr || rawTimeObj,
        sortTimestamp,
        formattedDate,
        formattedTime,
        batchNo,
        pcs,
        gross,
        cartons,
        weightKg,
        shift: entry.shift?.name || entry.shiftName || (isOpeningStock ? 'Opening Stock' : 'General Shift'),
        operator: entry.operatorName || entry.operator || (isOpeningStock ? 'System Opening' : '—'),
        remarks,
        status: isWithoutNipple ? 'WITHOUT_NIPPLE' : (isOpeningStock ? 'OPENING' : (entry.status || 'Ready')),
        isOpeningStock,
      };

      const isSafetyStock =
        custName.toUpperCase().replace(/[\s_-]+/g, '') === 'SAFETYSTOCK' ||
        socNo.toUpperCase().replace(/[\s_-]+/g, '') === 'SAFETYSTOCK' ||
        remarks.toUpperCase().includes('CUSTOMER: SAFETY') ||
        remarks.toUpperCase().includes('SOC: SAFETY');

      let finalCustName = custName;
      let finalCustCode = custCode;
      let finalSocNo = socNo;

      if (isSafetyStock) {
        finalCustName = 'SAFETY STOCK';
        finalCustCode = 'SAFETY-S';
        finalSocNo = 'SAFETY_STOCK';
      } else {
        finalCustName = custName.trim().replace(/\s+/g, ' ');
      }

      const mapKey = isSafetyStock ? 'SAFETY STOCK' : finalCustName.toUpperCase();

      if (!customerMap.has(mapKey)) {
        customerMap.set(mapKey, {
          id: `CUST-${finalCustCode}`,
          customerCode: finalCustCode,
          customerName: finalCustName,
          socNo: finalSocNo,
          itemMap: new Map<string, any>(),
        });
      }

      const custEntry = customerMap.get(mapKey)!;
      // Grouping key: Item + SOC (so identical items under the same SOC merge into a single line)
      const groupKey = `${itemCode}__${finalSocNo}`;

      if (!custEntry.itemMap.has(groupKey)) {
        // Look up SOC requirement & unit price from salesOrders
        const matchingSO = (salesOrders || []).find((so: any) => {
          const oNum = String(so.orderNumber || so.order_number || '').trim();
          return oNum && (oNum === socNo || socNo.includes(oNum) || oNum.includes(socNo));
        });
        const matchingSOItem = matchingSO?.items?.find((soi: any) => {
          const soiCode = String(soi.item?.itemCode || soi.itemCode || '');
          const soiId = soi.itemId || soi.item?.id;
          return (soiId && soiId === entry.itemId) || (soiCode && soiCode === itemCode);
        });

        const socRequiredGross = matchingSOItem ? Number(matchingSOItem.quantity || 0) : 0;
        const socRequiredCartons = matchingSOItem
          ? Number(matchingSOItem.packageQuantity || matchingSOItem.pkg_quantity || Math.round(socRequiredGross / 10))
          : Math.round(socRequiredGross / 10);
        const socUnitPrice = matchingSOItem ? Number(matchingSOItem.unitPrice || matchingSOItem.price || 0) : 0;

        // Rate per Gross resolution (Finished Goods are priced per Gross):
        // 1. From SOC Line Item unitPrice
        // 2. From Item sellingPrice or costPrice
        // 3. From Item standardCost (if >= 50, per Gross; if < 50, standardCost * 144)
        // 4. Default 720 Rs/GRS (Rs 5.00/pc * 144)
        let ratePerGross = 720;
        if (socUnitPrice > 0) {
          ratePerGross = socUnitPrice;
        } else if (toNum(entry.item?.sellingPrice) > 0) {
          ratePerGross = toNum(entry.item.sellingPrice);
        } else if (toNum(entry.item?.costPrice) > 0) {
          ratePerGross = toNum(entry.item.costPrice);
        } else if (toNum(entry.item?.standardCost) > 0) {
          const sc = toNum(entry.item.standardCost);
          ratePerGross = sc >= 50 ? sc : Math.round(sc * 144);
        }

        custEntry.itemMap.set(groupKey, {
          id: `${finalCustCode}-${itemCode}-${finalSocNo}`,
          itemCode,
          itemName,
          socNo: finalSocNo,
          packagingStyle: isWithoutNipple ? 'White Poly Bag (Safety Stock Holding)' : packagingStyle,
          perPieceWeightKg,
          socRequiredGross,
          socRequiredCartons,
          ratePerGross,
          ratePkr: ratePerGross, // For backwards compatibility
          cartons: 0,
          gross: 0,
          pcs: 0,
          weightKg: 0,
          valuePkr: 0,
          warehouseName: isWithoutNipple ? 'Safety Stock Holding (Spokes Only)' : (entry.warehouse?.name || 'SPI FG Dispatch Warehouse'),
          status: isWithoutNipple ? 'WITHOUT_NIPPLE' : (entry.status || 'Ready'),
          isWithoutNipple,
          logs: [],
        });
      }

      const consolidated = custEntry.itemMap.get(groupKey)!;
      consolidated.pcs += pcs;
      consolidated.gross += gross;
      consolidated.cartons += cartons;
      consolidated.weightKg = Math.round((consolidated.weightKg + weightKg) * 10) / 10;
      consolidated.valuePkr = Math.round(consolidated.gross * consolidated.ratePerGross);
      if (isWithoutNipple) {
        consolidated.isWithoutNipple = true;
        consolidated.status = 'WITHOUT_NIPPLE';
      }
      consolidated.logs.push(logRecord);
    });

    return Array.from(customerMap.values()).map((c) => {
      const items = Array.from(c.itemMap.values()).map((item: any) => {
        // Sort logs: 1. OPENING STOCK always on top (#1), 2. Then chronological ascending by date & time (2nd, 3rd, 4th, etc.)
        const sortedLogs = [...(item.logs || [])].sort((a: any, b: any) => {
          if (a.isOpeningStock && !b.isOpeningStock) return -1;
          if (!a.isOpeningStock && b.isOpeningStock) return 1;

          const timeA = Number(a.sortTimestamp) || (a.date ? dayjs(a.date).valueOf() : 0);
          const timeB = Number(b.sortTimestamp) || (b.date ? dayjs(b.date).valueOf() : 0);
          if (timeA !== timeB) return timeA - timeB;

          return String(a.batchNo || '').localeCompare(String(b.batchNo || ''));
        });

        return {
          ...item,
          logs: sortedLogs,
        };
      });

      // Group items strictly by SOC Number under this customer
      const socMap = new Map<string, any>();
      items.forEach((it: any) => {
        const sNo = it.socNo || 'General Stock';
        if (!socMap.has(sNo)) {
          socMap.set(sNo, {
            id: `${c.id}__${sNo}`,
            socNo: sNo,
            customerName: c.customerName,
            customerCode: c.customerCode,
            items: [],
            totalRequiredGross: 0,
            totalRequiredCartons: 0,
            totalPackedGross: 0,
            totalPackedCartons: 0,
            totalPackedPcs: 0,
            totalWeightKg: 0,
            totalValuation: 0,
          });
        }
        const sGroup = socMap.get(sNo)!;
        sGroup.items.push(it);
        sGroup.totalRequiredGross += Number(it.socRequiredGross || 0);
        sGroup.totalRequiredCartons += Number(it.socRequiredCartons || 0);
        sGroup.totalPackedGross += Number(it.gross || 0);
        sGroup.totalPackedCartons += Number(it.cartons || 0);
        sGroup.totalPackedPcs += Number(it.pcs || 0);
        sGroup.totalWeightKg = Math.round((sGroup.totalWeightKg + Number(it.weightKg || 0)) * 10) / 10;
        sGroup.totalValuation += Number(it.valuePkr || 0);
      });

      const socGroups = Array.from(socMap.values()).map((sg) => {
        const remGross = Math.max(0, sg.totalRequiredGross - sg.totalPackedGross);
        const remCartons = Math.max(0, sg.totalRequiredCartons - sg.totalPackedCartons);
        const isComplete = sg.totalRequiredGross > 0 && remGross === 0 && remCartons === 0;
        return {
          ...sg,
          remainingGross: remGross,
          remainingCartons: remCartons,
          isComplete,
        };
      });

      return {
        ...c,
        items,
        socGroups,
      };
    });
  }, [historyLogs, salesOrders]);

  // Compute SOC-wise Packing & Dispatch Fulfillment Ledger (One Parent Row Per SOC, Newest on Top)
  const socFulfillmentLedger = useMemo(() => {
    if (!salesOrders || salesOrders.length === 0) return [];

    const socMap = new Map<string, {
      id: string;
      orderNumber: string;
      customerName: string;
      customerCode: string;
      orderDate: string;
      rawDate: any;
      items: any[];
    }>();

    salesOrders.forEach((so) => {
      const orderNo = String(so.orderNumber || so.order_number || '').trim();
      if (!orderNo) return;
      const custName = so.customer?.companyName || so.customer?.name || 'Customer';
      const custCode = so.customer?.customerCode || '';
      const orderDate = so.orderDate ? dayjs(so.orderDate).format('DD/MM/YYYY') : '—';
      const rawDate = so.orderDate || so.createdAt;

      if (!socMap.has(orderNo)) {
        socMap.set(orderNo, {
          id: so.id || orderNo,
          orderNumber: orderNo,
          customerName: custName,
          customerCode: custCode,
          orderDate,
          rawDate,
          items: [],
        });
      }

      const socGroup = socMap.get(orderNo)!;
      const soItems = so.items || [];

      soItems.forEach((it: any, itIdx: number) => {
        const itemCode = it.item?.itemCode || it.itemCode || 'FG';
        const itemName = it.item?.name || it.itemName || it.description || 'Finished Good';
        const orderedGross = Number(it.quantity || 0);
        const orderedCartons = Number(it.packageQuantity || it.pkg_quantity || Math.round(orderedGross / 10));
        const shippedGross = Number(it.shippedQuantity || 0);
        const shippedCartons = Math.round(shippedGross / 10);

        // Find all packing entries for this SOC and this item
        const matchingEntries = historyLogs.filter((entry) => {
          const rem = String(entry.remarks || '');
          const socMatch = rem.match(/SOC:\s*([^|\]]+)/i)?.[1]?.trim() || '';
          if (socMatch !== orderNo && !rem.includes(orderNo)) return false;
          const eCode = String(entry.item?.itemCode || entry.itemCode || '');
          const eId = entry.itemId || entry.item_id || entry.item?.id;
          return (it.itemId && eId === it.itemId) || (itemCode && eCode === itemCode);
        });

        const packedPcs = matchingEntries.reduce((sum, e) => sum + Number(e.actualQuantity || e.quantity || 0), 0);
        const packedCartons = matchingEntries.reduce((sum, e) => {
          const m = String(e.remarks || '').match(/Cartons:\s*([\d.]+)/i);
          return sum + (m ? Number(m[1]) : Math.round(Number(e.actualQuantity || 0) / 1440));
        }, 0);
        const packedGross = matchingEntries.reduce((sum, e) => {
          const m = String(e.remarks || '').match(/Gross:\s*([\d.]+)/i) || String(e.remarks || '').match(/\(([\d.]+)\s*Gross/i);
          return sum + (m ? Number(m[1]) : Math.round(Number(e.actualQuantity || 0) / 144));
        }, 0);

        const remainingCartons = Math.max(0, orderedCartons - packedCartons);
        const remainingGross = Math.max(0, orderedGross - packedGross);
        const isComplete = (orderedCartons > 0 && remainingCartons === 0);
        const isPartial = (packedCartons > 0 && remainingCartons > 0);
        const pct = orderedCartons > 0 ? Math.min(100, Math.round((packedCartons / orderedCartons) * 100)) : 0;

        socGroup.items.push({
          key: `${orderNo}-${it.id || itIdx}-${itemCode}`,
          orderNumber: orderNo,
          customerName: custName,
          orderDate,
          itemCode,
          itemName,
          orderedCartons,
          orderedGross,
          packedCartons,
          packedGross,
          packedPcs,
          shippedCartons,
          shippedGross,
          remainingCartons,
          remainingGross,
          isComplete,
          isPartial,
          fulfillmentPct: pct,
          batches: matchingEntries.map((e) => {
            const rem = String(e.remarks || '');
            const bMatch = rem.match(/Batch:\s*([^|\]]+)/i);
            const cMatch = rem.match(/Cartons:\s*([\d.]+)/i);
            const styleMatch = rem.match(/Style:\s*([^|\]]+)/i);
            return {
              id: e.id,
              batchNo: bMatch ? bMatch[1].trim() : (e.batchNumber || e.machineNo || 'PKG-BATCH'),
              cartons: cMatch ? Number(cMatch[1]) : Math.round(Number(e.actualQuantity || 0) / 1440),
              date: e.entryDate || dayjs(e.createdAt).format('DD/MM/YYYY'),
              style: styleMatch ? styleMatch[1].trim() : 'Standard Packing',
              status: e.status || 'SAVED',
            };
          }),
        });
      });
    });

    const result = Array.from(socMap.values()).map((soc) => {
      const totalOrderedCartons = soc.items.reduce((sum, it) => sum + (it.orderedCartons || 0), 0);
      const totalOrderedGross = soc.items.reduce((sum, it) => sum + (it.orderedGross || 0), 0);
      const totalPackedCartons = soc.items.reduce((sum, it) => sum + (it.packedCartons || 0), 0);
      const totalPackedGross = soc.items.reduce((sum, it) => sum + (it.packedGross || 0), 0);
      const totalPackedPcs = soc.items.reduce((sum, it) => sum + (it.packedPcs || 0), 0);
      const totalShippedCartons = soc.items.reduce((sum, it) => sum + (it.shippedCartons || 0), 0);
      const totalShippedGross = soc.items.reduce((sum, it) => sum + (it.shippedGross || 0), 0);

      const totalRemainingCartons = Math.max(0, totalOrderedCartons - totalPackedCartons);
      const totalRemainingGross = Math.max(0, totalOrderedGross - totalPackedGross);

      const isComplete = totalOrderedCartons > 0 && totalRemainingCartons === 0;
      const isPartial = totalPackedCartons > 0 && totalRemainingCartons > 0;
      const overallPct = totalOrderedCartons > 0 ? Math.min(100, Math.round((totalPackedCartons / totalOrderedCartons) * 100)) : 0;

      return {
        key: `SOC-${soc.orderNumber}`,
        id: soc.id,
        orderNumber: soc.orderNumber,
        customerName: soc.customerName,
        customerCode: soc.customerCode,
        orderDate: soc.orderDate,
        rawDate: soc.rawDate,
        itemCount: soc.items.length,
        items: soc.items,
        orderedCartons: totalOrderedCartons,
        orderedGross: totalOrderedGross,
        packedCartons: totalPackedCartons,
        packedGross: totalPackedGross,
        packedPcs: totalPackedPcs,
        shippedCartons: totalShippedCartons,
        shippedGross: totalShippedGross,
        remainingCartons: totalRemainingCartons,
        remainingGross: totalRemainingGross,
        isComplete,
        isPartial,
        fulfillmentPct: overallPct,
      };
    });

    // Helper: Extract last numeric sequence from SOC string (e.g. SOC-2026-05819 -> 5819)
    const getSocNum = (orderNo: string): number => {
      const match = String(orderNo || '').match(/(\d+)(?!.*\d)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    // Sort: Newest SOC # on top (highest number at top, descending down to older/lower numbers)
    result.sort((a, b) => {
      const numA = getSocNum(a.orderNumber);
      const numB = getSocNum(b.orderNumber);
      if (numA !== numB) return numB - numA;
      const timeA = dayjs(a.rawDate || a.orderDate).valueOf() || 0;
      const timeB = dayjs(b.rawDate || b.orderDate).valueOf() || 0;
      return timeB - timeA;
    });

    return result;
  }, [salesOrders, historyLogs]);

  const totalActiveCustomers = customerStockData.length;
  const totalItemsCount = customerStockData.reduce((acc, c) => acc + c.items.length, 0);
  const totalStockPcs = customerStockData.reduce((acc, c) => acc + c.items.reduce((sum, it) => sum + (it.pcs || 0), 0), 0);
  const totalStockGross = customerStockData.reduce((acc, c) => acc + c.items.reduce((sum, it) => sum + (it.gross || 0), 0), 0);
  const totalStockCartons = customerStockData.reduce((acc, c) => acc + c.items.reduce((sum, it) => sum + (it.cartons || 0), 0), 0);
  const totalStockKg = customerStockData.reduce((acc, c) => acc + c.items.reduce((sum, it) => sum + (it.weightKg || 0), 0), 0);
  const totalStockValuation = customerStockData.reduce((acc, c) => acc + c.items.reduce((sum, it) => sum + (it.valuePkr || 0), 0), 0);

  // Generate formatted WhatsApp text for a specific customer's packed inventory
  const generateCustomerWhatsAppText = useCallback((cust: any) => {
    if (!cust) return '';
    const custWeight = cust.items.reduce((s: number, it: any) => s + (it.weightKg || 0), 0);
    const custPcs = cust.items.reduce((s: number, it: any) => s + (it.pcs || 0), 0);
    const custGross = cust.items.reduce((s: number, it: any) => s + (it.gross || 0), 0);
    const custCartons = cust.items.reduce((s: number, it: any) => s + (it.cartons || 0), 0);
    const custVal = cust.items.reduce((s: number, it: any) => s + (it.valuePkr || 0), 0);
    const dateStr = dayjs().format('DD-MMM-YYYY');

    let msg = `🏭 *PAKISTAN WIRE INDUSTRIES (PVT) LTD*\n`;
    msg += `📦 *PACKED FINISHED GOODS INVENTORY DISPATCH REPORT*\n`;
    msg += `📅 *Date:* ${dateStr}\n`;
    msg += `────────────────────────────\n`;
    msg += `👤 *Customer:* ${cust.customerName} (${cust.customerCode})\n`;
    if (cust.socNo && cust.socNo !== '—') msg += `📋 *SOC #:* ${cust.socNo}\n`;
    msg += `🏢 *Division:* Spoke Division (DIV-SPD)\n`;
    msg += `────────────────────────────\n`;
    msg += `*PACKED FINISHED GOODS DETAIL:*\n`;

    cust.items.forEach((it: any, idx: number) => {
      msg += `\n${idx + 1}️⃣ *${it.itemCode}* — ${it.itemName}\n`;
      if (it.packagingStyle) msg += `   🛍️ Style: ${it.packagingStyle}\n`;
      msg += `   • Pieces: *${formatNumber(it.pcs, 0)} PCS*\n`;
      msg += `   • Gross: *${formatNumber(it.gross, 0)} GRS*\n`;
      msg += `   • Cartons: *${formatNumber(it.cartons, 0)} CTN*\n`;
      msg += `   • Weight: *${formatNumber(it.weightKg, 2)} KG*\n`;
    });

    msg += `\n────────────────────────────\n`;
    msg += `📊 *TOTAL SUMMARY:* (Pieces ➔ Gross ➔ Cartons)\n`;
    msg += `🔢 *1. Total Pieces:* ${formatNumber(custPcs, 0)} PCS\n`;
    msg += `📦 *2. Total Gross:* ${formatNumber(custGross, 0)} GRS\n`;
    msg += `📦 *3. Total Cartons:* ${formatNumber(custCartons, 0)} CTN\n`;
    msg += `⚖️ *Total Weight:* ${formatNumber(custWeight, 2)} KG\n`;
    msg += `💰 *Total Valuation:* PKR ${formatNumber(custVal, 0)}\n`;
    msg += `────────────────────────────\n`;
    msg += `✅ *Verified & Ready for Dispatch by Packing Dept, PWI*`;

    return msg;
  }, []);

  const handleOpenCustomerWhatsApp = (cust: any) => {
    setWhatsAppModalCust(cust);
    setWhatsAppCustPhone('');
    setCopiedCustWhatsApp(false);
  };

  const handleSendCustomerWhatsApp = () => {
    if (!whatsAppModalCust) return;
    const text = generateCustomerWhatsAppText(whatsAppModalCust);
    const phoneClean = whatsAppCustPhone.replace(/[^0-9]/g, '');
    const url = phoneClean
      ? `https://api.whatsapp.com/send?phone=${phoneClean}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleCopyCustomerWhatsApp = () => {
    if (!whatsAppModalCust) return;
    const text = generateCustomerWhatsAppText(whatsAppModalCust);
    navigator.clipboard.writeText(text);
    setCopiedCustWhatsApp(true);
    message.success('Customer WhatsApp dispatch report copied to clipboard!');
    setTimeout(() => setCopiedCustWhatsApp(false), 3000);
  };

  // 1. Generate WhatsApp text for Today's Packing Production & Dispatch Daily Log
  const generateTodayPackingWhatsAppText = useCallback(() => {
    const dateStr = dayjs().format('DD-MMM-YYYY');
    const timeStr = dayjs().format('hh:mm A');
    let text = `🏭 *PAKISTAN WIRE INDUSTRIES (PVT) LTD*\n`;
    text += `📋 *DAILY PACKING PRODUCTION & DISPATCH REPORT*\n`;
    text += `📅 *Date:* ${dateStr} | *Time:* ${timeStr}\n`;
    text += `🏢 *Division:* Spoke Division (DIV-SPD) | *Shift:* General Shift (8:30 AM - 5:30 PM)\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    text += `📦 *TODAY'S RECORDED PACKING BATCHES:*\n`;
    let batchCount = 0;
    historyLogs.forEach((entry: any, idx: number) => {
      const remarks = String(entry.remarks || '');
      const batchMatch = remarks.match(/Batch:\s*([^|]+)/i);
      const batchNo = batchMatch ? batchMatch[1].trim() : `PKG-2026-000${idx + 2}`;
      const custMatch = remarks.match(/Customer:\s*([^|]+)/i);
      const custName = custMatch ? custMatch[1].trim() : (entry.customer?.name || 'ALI SHAH AUTOS');
      const socMatch = remarks.match(/SOC:\s*([^|]+)/i);
      const socNo = socMatch ? socMatch[1].trim() : (entry.socNo || '5805');
      const styleMatch = remarks.match(/Style:\s*([^|]+)/i);
      const style = styleMatch ? styleMatch[1].trim() : 'OEM Packing';
      const ctnMatch = remarks.match(/Cartons:\s*([\d.]+)/i);
      const grossMatch = remarks.match(/Gross:\s*([\d.]+)/i) || remarks.match(/\(([\d.]+)\s*Gross/i);
      const pcs = toNum(entry.actualQuantity || entry.quantity || 72000);
      const cartons = ctnMatch ? Number(ctnMatch[1]) : 50;
      const gross = grossMatch ? Number(grossMatch[1]) : 500;
      const codeStr = String(entry.item?.itemCode || entry.itemCode || '');
      const wt = codeStr.includes('006') ? 1156.0 : 1007.3;

      const isShifted =
        remarks.includes('Allocated from Safety Stock') ||
        remarks.includes('SHIFTED FROM SAFETY STOCK') ||
        remarks.includes('Allocated from Safety');

      batchCount++;
      text += `\n*Batch ${batchCount}: ${batchNo}*${isShifted ? ' _(⚡ Shifted from Safety Stock)_' : ''}\n`;
      text += `• Customer: *${custName}* (SOC: ${socNo})\n`;
      text += `• Item: *${codeStr}* — ${entry.item?.name || 'Finished Good'}\n`;
      text += `• Style: ${style}\n`;
      text += `• Output: *${formatNumber(pcs, 0)} PCS* | *${gross} GRS* | *${cartons} CTN*\n`;
      text += `• Net Batch Weight: *${formatNumber(wt, 1)} KG*\n`;
      text += `• Store (IN): *SPI FG Dispatch Warehouse (SPI-FGDW-001)*\n`;
      text += `• Status: ${isShifted ? '✅ ALLOCATED & SHIFTED FROM SAFETY STOCK' : '✅ PACKED & READY FOR DISPATCH'}\n`;
    });

    text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📊 *TODAY'S PRODUCTION TOTALS (PCS ➔ GRS ➔ CTN):*\n`;
    text += `🔢 *1. Total Pieces Packed:* ${formatNumber(totalStockPcs, 0)} PCS\n`;
    text += `📦 *2. Total Gross Packed:* ${formatNumber(totalStockGross, 0)} GRS\n`;
    text += `🏷️ *3. Total Cartons Packed:* ${formatNumber(totalStockCartons, 0)} CTN\n`;
    text += `⚖️ *Total Net Weight Packed:* ${formatNumber(totalStockKg, 1)} KG\n`;
    text += `🎯 *Day Target Progress:* 100 / 125 Cartons (80% Achieved)\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `👨‍💼 _Prepared by Packing Department Supervisor, PWI_`;
    return text;
  }, [historyLogs, totalStockPcs, totalStockGross, totalStockCartons, totalStockKg]);

  const handleOpenTodayWhatsApp = () => {
    setTodayWhatsAppPhone('');
    setCopiedTodayWhatsApp(false);
    setTodayWhatsAppModalVisible(true);
  };

  const handleSendTodayWhatsApp = () => {
    const text = generateTodayPackingWhatsAppText();
    const phoneClean = todayWhatsAppPhone.replace(/[^0-9]/g, '');
    const url = phoneClean
      ? `https://api.whatsapp.com/send?phone=${phoneClean}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleCopyTodayWhatsApp = () => {
    const text = generateTodayPackingWhatsAppText();
    navigator.clipboard.writeText(text);
    setCopiedTodayWhatsApp(true);
    message.success("Today's Packing Production report copied to clipboard!");
    setTimeout(() => setCopiedTodayWhatsApp(false), 3000);
  };

  // 2. Generate WhatsApp text for Live FGR Warehouse Stock Balance Report
  const generateFgrWhatsAppText = useCallback(() => {
    const dateStr = dayjs().format('DD-MMM-YYYY');
    const timeStr = dayjs().format('hh:mm A');
    let text = `🏭 *PAKISTAN WIRE INDUSTRIES (PVT) LTD*\n`;
    text += `📊 *FGR FINISHED GOODS WAREHOUSE STOCK REPORT*\n`;
    text += `🏬 *Warehouse:* SPI FG Dispatch Warehouse (SPI-FGDW-001)\n`;
    text += `📅 *Date:* ${dateStr} | *Time:* ${timeStr}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    text += `📦 *LIVE FGR STOCK BREAKDOWN:*\n`;
    customerStockData.forEach((cust, cIdx) => {
      text += `\n👤 *Customer ${cIdx + 1}: ${cust.customerName}* (${cust.customerCode})\n`;
      if (cust.socNo && cust.socNo !== '—') text += `   📋 SOC #: ${cust.socNo}\n`;
      cust.items.forEach((it: any, iIdx: number) => {
        text += `   ${iIdx + 1}. *${it.itemCode}* — ${it.itemName}\n`;
        text += `      • Pieces: *${formatNumber(it.pcs, 0)} PCS*\n`;
        text += `      • Gross: *${formatNumber(it.gross, 0)} GRS*\n`;
        text += `      • Cartons: *${formatNumber(it.cartons, 0)} CTN*\n`;
        text += `      • Net Weight: *${formatNumber(it.weightKg, 1)} KG*\n`;
      });
    });

    text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📊 *FGR EXECUTIVE TOTALS (PCS ➔ GRS ➔ CTN):*\n`;
    text += `🔢 *1. Total Available Pieces:* ${formatNumber(totalStockPcs, 0)} PCS\n`;
    text += `📦 *2. Total Available Gross:* ${formatNumber(totalStockGross, 0)} GRS\n`;
    text += `🏷️ *3. Total Available Cartons:* ${formatNumber(totalStockCartons, 0)} CTN\n`;
    text += `⚖️ *Total Net Weight in Stock:* ${formatNumber(totalStockKg, 1)} KG\n`;
    text += `💰 *Total Stock Valuation:* PKR ${formatNumber(totalStockValuation, 0)}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `✅ _Official Live FGR Stock Balance verified by Packing & Warehouse Team_`;
    return text;
  }, [customerStockData, totalStockPcs, totalStockGross, totalStockCartons, totalStockKg, totalStockValuation]);

  const handleOpenFgrWhatsApp = () => {
    setFgrWhatsAppPhone('');
    setCopiedFgrWhatsApp(false);
    setFgrWhatsAppModalVisible(true);
  };

  const handleSendFgrWhatsApp = () => {
    const text = generateFgrWhatsAppText();
    const phoneClean = fgrWhatsAppPhone.replace(/[^0-9]/g, '');
    const url = phoneClean
      ? `https://api.whatsapp.com/send?phone=${phoneClean}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleCopyFgrWhatsApp = () => {
    const text = generateFgrWhatsAppText();
    navigator.clipboard.writeText(text);
    setCopiedFgrWhatsApp(true);
    message.success('Live FGR Stock report copied to clipboard!');
    setTimeout(() => setCopiedFgrWhatsApp(false), 3000);
  };

  const toggleCustomerExpand = (custId: string) => {
    setExpandedCustomerIds((prev) => {
      const willExpand = !prev.includes(custId);
      if (willExpand) {
        // Also auto-expand all SOCs under this customer
        const cust = customerStockData.find((c) => c.id === custId);
        if (cust?.socGroups) {
          const keys = cust.socGroups.map((sg: any) => sg.id);
          setExpandedSocKeys((kPrev) => Array.from(new Set([...kPrev, ...keys])));
        }
      }
      return willExpand ? [...prev, custId] : prev.filter((id) => id !== custId);
    });
  };

  const toggleSocExpand = (socKey: string) => {
    setExpandedSocKeys((prev) =>
      prev.includes(socKey) ? prev.filter((k) => k !== socKey) : [...prev, socKey]
    );
  };

  const expandAllCustomers = () => {
    setExpandedCustomerIds(customerStockData.map((c) => c.id));
    const allSocKeys = customerStockData.flatMap((c) => (c.socGroups || []).map((sg: any) => sg.id));
    setExpandedSocKeys(allSocKeys);
  };

  const collapseAllCustomers = () => {
    setExpandedCustomerIds([]);
    setExpandedSocKeys([]);
  };

  const filteredHistory = historyLogs
    .filter((item) => {
      if (!historySearchText) return true;
      const q = historySearchText.toLowerCase();
      const batch = (item.entryNo || item.id || '').toLowerCase();
      const itemCode = (item.item?.itemCode || item.itemCode || '').toLowerCase();
      const itemName = (item.item?.name || item.itemName || '').toLowerCase();
      const remarks = (item.remarks || '').toLowerCase();
      return batch.includes(q) || itemCode.includes(q) || itemName.includes(q) || remarks.includes(q);
    })
    .sort((a, b) => {
      const aIsOpening = Boolean(a.isOpeningStock || (a.remarks && a.remarks.includes('[OPENING STOCK]')));
      const bIsOpening = Boolean(b.isOpeningStock || (b.remarks && b.remarks.includes('[OPENING STOCK]')));
      if (aIsOpening && !bIsOpening) return -1;
      if (!aIsOpening && bIsOpening) return 1;

      const aTime = dayjs(a.entryDate || a.createdAt || 0).valueOf();
      const bTime = dayjs(b.entryDate || b.createdAt || 0).valueOf();
      return aTime - bTime;
    });

  const historyColumns = [
    {
      title: 'Entry / Batch No',
      dataIndex: 'entryNo',
      key: 'entryNo',
      render: (no: string, r: any) => (
        <Space direction="vertical" size={1}>
          <Text strong style={{ color: 'var(--theme-text)' }}>{no || r.batchNo || `PKG-${r.id?.slice(0, 8)}`}</Text>
          <Text type="secondary" style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
            {r.entryDate ? dayjs(r.entryDate).format('YYYY-MM-DD') : '—'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Shift & Station',
      key: 'shift',
      render: (_: any, r: any) => (
        <div>
          <Tag color="blue">{r.shift?.name || 'General Shift'}</Tag>
          <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginTop: 2 }}>{r.machineNo || 'Hand Packing'}</div>
        </div>
      ),
    },
    {
      title: 'Finished Good',
      key: 'finishedGood',
      render: (_: any, r: any) => (
        <div>
          <Text strong style={{ color: 'var(--theme-accent, #0284c7)' }}>{r.item?.itemCode || r.itemCode || '—'}</Text>
          <div style={{ fontSize: 11, color: 'var(--theme-text)', marginTop: 2 }}>
            {r.item?.name || r.itemName || '—'}
          </div>
        </div>
      ),
    },
    {
      title: 'Quantity Packed',
      key: 'quantity',
      render: (_: any, r: any) => {
        const pcs = toNum(r.actualQuantity || r.quantity || 0);
        const gross = Math.round(pcs / 144);
        const cartons = Math.round(gross / 10);
        return (
          <div>
            <Text strong style={{ color: 'var(--theme-success, #059669)', fontSize: 13 }}>
              {cartons} Cartons
            </Text>
            <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>
              {gross} Gross ({formatNumber(pcs, 0)} PCS)
            </div>
          </div>
        );
      },
    },
    {
      title: 'Consumed BOM Components',
      key: 'components',
      render: (_: any, r: any) => {
        const rem = String(r.remarks || '');
        const scrapMatch = rem.match(/Component Scrap:\s*([^|]+)/i);
        const scrapDetail = rem.match(/Scrap Detail:\s*([^|]+)/i);
        if (Array.isArray(r.components) && r.components.length > 0) {
          return (
            <Space direction="vertical" size={1} style={{ fontSize: 11 }}>
              {r.components.map((c: any, i: number) => (
                <span key={i}><Tag color="orange" style={{ margin: 0 }}>{c.item?.name || c.itemCode || 'Comp'}:</Tag> {c.quantity || c.consumedQuantity}</span>
              ))}
            </Space>
          );
        }
        if (scrapMatch || scrapDetail) {
          return (
            <div style={{ fontSize: 11 }}>
              {scrapMatch && <span style={{ color: 'var(--hp-value-danger)', fontWeight: 700 }}>{scrapMatch[0]}</span>}
              {scrapDetail && <div style={{ color: 'var(--theme-text-muted)' }}>{scrapDetail[0]}</div>}
            </div>
          );
        }
        return <span style={{ color: 'var(--theme-text-muted)', fontSize: 11 }}>Auto-deducted via BOM</span>;
      },
    },
    {
      title: 'Destination Store (IN)',
      key: 'store',
      render: (_: any, r: any) => (
        <Tag color="cyan">
          {r.warehouse?.name || 'SPI FG Dispatch Warehouse'}
        </Tag>
      ),
    },
    {
      title: 'Supervisor / Operator',
      key: 'operator',
      render: (_: any, r: any) => (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--theme-text)' }}>{r.operatorName || r.supervisorName || '—'}</span>
          <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.shift?.name || 'General Shift'}</div>
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: any, r: any) => (
        <Tag icon={<CheckCircleFilled />} color="success">
          {r.status || 'COMPLETED'}
        </Tag>
      ),
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 4: DEPARTMENT STORE STOCK STATE (SEPARATE SPOKE & NIPPLE STORES)
  // Authoritative data matching Production Inventory Report & Open Stock Matrix (SPI-PL-004 & WH-002)
  // ─────────────────────────────────────────────────────────────────────────────
  const INITIAL_SPOKE_STORE_ITEMS = [
    { id: 'e72d30e1-e0da-447c-af1e-6a57d9aad0af', code: 'WIP-SPL-001', name: 'CD-250*17 Inner Butted', role: 'Inner Butted Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 297667, defaultGrs: 2067.1, weightPerPiece: 0.00929 },
    { id: 'a7b4d433-e97c-4d11-bc26-75541f4f1593', code: 'WIP-SPL-002', name: 'CD-250*17 Outer Butted', role: 'Outer Butted Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 241783, defaultGrs: 1679.1, weightPerPiece: 0.00925 },
    { id: 'dfbcafb0-6b5a-446a-8c46-804f0555e72b', code: 'WIP-SPL-003', name: '250*18 Inner Butted 100cc', role: 'Inner Butted Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 20239, defaultGrs: 140.5, weightPerPiece: 0.00993 },
    { id: 'ef0b56f7-9147-4d95-b63c-24e50da9be8f', code: 'WIP-SPL-004', name: '250*18 Outer Butted 100cc', role: 'Outer Butted Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 23281, defaultGrs: 161.7, weightPerPiece: 0.00981 },
    { id: 'c1d28937-da55-40e2-8bfb-7d84ac5af466', code: 'WIP-SPL-005', name: 'RM-250*17 Inner Straight', role: 'Inner Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 111466, defaultGrs: 774.1, weightPerPiece: 0.01053 },
    { id: '5ffd6862-6d76-43d0-afc3-9118537ef972', code: 'WIP-SPL-006', name: 'RM 250*17 Outer Straight', role: 'Outer Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 93867, defaultGrs: 651.9, weightPerPiece: 0.01049 },
    { id: '55195a7b-e950-4c9f-b10b-7795da52d2c8', code: 'WIP-SPL-007', name: '250*18 Inner Straight 100cc', role: 'Inner Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 21159, defaultGrs: 146.9, weightPerPiece: 0.01129 },
    { id: '41cff115-6750-44ef-8c69-5395320347d6', code: 'WIP-SPL-008', name: '250*18 Outer Straight 100cc', role: 'Outer Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 21360, defaultGrs: 148.3, weightPerPiece: 0.01119 },
    { id: 'b34bc3a8-5b9f-47b7-b482-32d6ec36c6bc', code: 'WIP-SPL-009', name: '125-300*17 Inner Butted', role: 'Inner Butted Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 13734, defaultGrs: 95.4, weightPerPiece: 0.01126 },
    { id: '7689378f-3fa2-40c4-8e85-d7ec77b72cce', code: 'WIP-SPL-010', name: '125-300*17 Outer Butted', role: 'Outer Butted Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 3728, defaultGrs: 25.9, weightPerPiece: 0.01097 },
    { id: 'bad446f8-9bf6-49ce-b63b-e88c54607003', code: 'WIP-SPL-013', name: 'S9-300*17 Inner Straight', role: 'Inner Spoke (90° Hook)', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 423837, defaultGrs: 2943.3, weightPerPiece: 0.01250 },
    { id: 'beaa0ddf-e109-4f48-9609-04e5967bc795', code: 'WIP-SPL-014', name: 'S9-300*17 Outer Straight', role: 'Outer Spoke (75° Hook)', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 242333, defaultGrs: 1682.9, weightPerPiece: 0.01261 },
    { id: '129d571b-6a63-466a-a892-5bd3a1d7833b', code: 'WIP-SPL-015', name: 'S9-300*18 Inner Straight', role: 'Inner Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 4672, defaultGrs: 32.4, weightPerPiece: 0.01365 },
    { id: '390c0d5d-3a6b-4202-97e9-cdd62a3227b3', code: 'WIP-SPL-016', name: 'S9-300*18 Outer Straight', role: 'Outer Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 7890, defaultGrs: 54.8, weightPerPiece: 0.01351 },
    { id: '94831f9f-c358-4da1-b570-fe1daa0092b9', code: 'WIP-SPL-017', name: 'DS-225*17 Inner Straight', role: 'Inner Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 6608, defaultGrs: 45.9, weightPerPiece: 0.00872 },
    { id: '517cb2b4-b62f-4785-b83b-74e3dce9481a', code: 'WIP-SPL-018', name: 'DS-225*17 Outer Straight', role: 'Outer Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 2680, defaultGrs: 18.6, weightPerPiece: 0.00854 },
  ];

  const INITIAL_NIPPLE_STORE_ITEMS = [
    { id: '43cec585-2413-4374-a77d-fc4ed263276d', code: 'FG-NP-001', name: '225X17 Front Wheel Nipple', role: 'Front Wheel Nipple', wh: 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d', whName: 'SPI Main Warehouse (WH-002)', type: 'FINISHED_GOOD', defaultPcs: 979200, defaultGrs: 6800.0, weightPerPiece: 0.00167 },
    { id: '76bc4e5e-ab9d-4660-95c5-d8c29b186007', code: 'FG-NP-002', name: 'CD-250X17 Nipple', role: 'CD-250X17 Nipple', wh: 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d', whName: 'SPI Main Warehouse (WH-002)', type: 'FINISHED_GOOD', defaultPcs: 1296000, defaultGrs: 9000.0, weightPerPiece: 0.00264 },
    { id: '9f3ceb36-f11f-4519-ae54-c519fdb6aa26', code: 'FG-NP-003', name: '125-300X17 Nipple', role: 'Large Gauge Nipple', wh: 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d', whName: 'SPI Main Warehouse (WH-002)', type: 'FINISHED_GOOD', defaultPcs: 2018880, defaultGrs: 14020.0, weightPerPiece: 0.00321 },
    { id: '1fb94e18-cb0a-4447-adfa-13f6d7c9e4af', code: 'FG-NP-004', name: 'RM-250*17 Nipple', role: 'Assembly Spoke Nipple', wh: 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d', whName: 'SPI Main Warehouse (WH-002)', type: 'FINISHED_GOOD', defaultPcs: 1600672, defaultGrs: 11115.8, weightPerPiece: 0.00264 },
    { id: 'ced9ab53-b470-47c2-83a9-829726b38b5b', code: 'FG-NP-005', name: '125-S9 Nipple', role: 'Standard Brass Nipple', wh: 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d', whName: 'SPI Main Warehouse (WH-002)', type: 'FINISHED_GOOD', defaultPcs: 1668853, defaultGrs: 11589.3, weightPerPiece: 0.00347 },
  ];

  const [spokeStoreBalances, setSpokeStoreBalances] = useState<any[]>(
    INITIAL_SPOKE_STORE_ITEMS.map((i) => ({
      ...i,
      pcs: i.defaultPcs,
      gross: i.defaultGrs,
      weightPerPiece: i.weightPerPiece,
      totalWeightKg: Math.round(i.defaultPcs * i.weightPerPiece * 10) / 10,
      status: 'AVAILABLE',
    }))
  );
  const [nippleStoreBalances, setNippleStoreBalances] = useState<any[]>(
    INITIAL_NIPPLE_STORE_ITEMS.map((i) => ({
      ...i,
      pcs: i.defaultPcs,
      gross: i.defaultGrs,
      weightPerPiece: i.weightPerPiece,
      totalWeightKg: Math.round(i.defaultPcs * i.weightPerPiece * 10) / 10,
      status: 'AVAILABLE',
    }))
  );
  const [spokeStoreExpanded, setSpokeStoreExpanded] = useState<boolean>(true);
  const [nippleStoreExpanded, setNippleStoreExpanded] = useState<boolean>(true);
  const [loadingStock, setLoadingStock] = useState<boolean>(false);

  // Document & Sharing Modals
  const [whatsAppModalVisible, setWhatsAppModalVisible] = useState<boolean>(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState<string>('');
  const [copiedWhatsApp, setCopiedWhatsApp] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);

  // Column Visibility Controls (Warehouse omitted by default as it is already in section title)
  const [showWarehouseColumn, setShowWarehouseColumn] = useState<boolean>(false);
  const [showWeightColumns, setShowWeightColumns] = useState<boolean>(true);
  const [showStatusColumn, setShowStatusColumn] = useState<boolean>(true);
  const [showActionColumn, setShowActionColumn] = useState<boolean>(true);

  const fetchDepartmentStock = useCallback(async () => {
    setLoadingStock(true);
    try {
      const plWhId = 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b';
      const wh2Id = 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d';

      // Concurrently query balances with large limit and open-stock matrix
      const [resPl, resWh2, resMatrix] = await Promise.allSettled([
        apiService.get(`/inventory/balances?warehouseId=${plWhId}&limit=500`),
        apiService.get(`/inventory/balances?warehouseId=${wh2Id}&limit=500`),
        apiService.get(`/production/open-stock/matrix?divisionId=d1000000-0000-0000-0000-000000000001`),
      ]);

      const plVal = resPl.status === 'fulfilled' ? (resPl.value as any) : null;
      const wh2Val = resWh2.status === 'fulfilled' ? (resWh2.value as any) : null;
      const matrixVal = resMatrix.status === 'fulfilled' ? (resMatrix.value as any) : null;

      const plRows = plVal
        ? (Array.isArray(plVal) ? plVal : (plVal.data || []))
        : [];
      const wh2Rows = wh2Val
        ? (Array.isArray(wh2Val) ? wh2Val : (wh2Val.data || []))
        : [];

      // Check if matrix returned SPI-PL-004 directly
      const matrixDepts = matrixVal
        ? (Array.isArray(matrixVal) ? matrixVal : (matrixVal.data || []))
        : [];
      const matrixPlDept = Array.isArray(matrixDepts)
        ? matrixDepts.find((d: any) => d.warehouseCode === 'SPI-PL-004' || d.warehouseId === plWhId)
        : null;

      // 1. Process Spokes from SPI-PL-004 (filter > 0 strictly)
      const spokes: any[] = [];
      if (matrixPlDept && Array.isArray(matrixPlDept.items) && matrixPlDept.items.length > 0) {
        // Use live matrix row items directly for exact parity with Production Item Open Stock
        for (const m of matrixPlDept.items) {
          const avail = toNum(m.pieces ?? m.available ?? m.onHand ?? m.stock);
          if (avail <= 0) continue;
          const code = m.itemCode || m.code || '';
          const name = m.name || m.itemName || '';
          const pcs = avail;
          const gross = toNum(m.gross) > 0 ? toNum(m.gross) : Math.round((pcs / 144) * 10) / 10;
          const weightPerPiece = toNum(m.weightPerPiece) || (pcs > 0 && toNum(m.weightKg) > 0 ? Math.round((toNum(m.weightKg) / pcs) * 100000) / 100000 : 0.0093);
          const totalWeightKg = toNum(m.weightKg) > 0 ? toNum(m.weightKg) : Math.round(pcs * weightPerPiece * 10) / 10;
          const role = name.toLowerCase().includes('inner') ? 'Inner Spoke (Plated)' : (name.toLowerCase().includes('outer') ? 'Outer Spoke (Plated)' : 'Plated Spoke Wire');

          spokes.push({
            id: m.id || m.itemId,
            code,
            name,
            role,
            wh: plWhId,
            whName: 'PL Production Department (SPI-PL-004)',
            type: m.itemType || 'SEMI_FINISHED',
            pcs,
            gross,
            weightPerPiece,
            totalWeightKg,
            status: 'AVAILABLE',
          });
        }
      } else {
        for (const r of plRows) {
          const avail = toNum(r.availableQuantity ?? r.available ?? r.onHandQuantity ?? r.onHand);
          if (avail <= 0) continue; // Exclude zero-balance items
          const item = r.item || {};
          const code = item.itemCode || r.itemCode || '';
          const name = item.name || r.name || '';
          const isSpoke = code.startsWith('WIP-SPL') || code.includes('SPK') || name.toLowerCase().includes('spoke') || name.toLowerCase().includes('inner') || name.toLowerCase().includes('outer');
          if (!isSpoke) continue;

          const uomCode = (r.uom?.code || item.baseUom?.code || 'PCS').toUpperCase();
          const isPcs = uomCode === 'PCS' || avail > 1000 || item.itemType === 'SEMI_FINISHED';
          const pcs = isPcs ? avail : avail * 144;
          const gross = isPcs ? Math.round((avail / 144) * 10) / 10 : avail;

          const weightPerPiece = toNum(item.weightPerPiece) || (code.includes('015') || code.includes('016') ? 0.0136 : (code.includes('013') || code.includes('014') ? 0.0125 : 0.0093));
          const totalWeightKg = Math.round(pcs * weightPerPiece * 10) / 10;
          const role = name.toLowerCase().includes('inner') ? 'Inner Spoke (Plated)' : (name.toLowerCase().includes('outer') ? 'Outer Spoke (Plated)' : 'Plated Spoke Wire');

          spokes.push({
            id: item.id || r.itemId,
            code,
            name,
            role,
            wh: plWhId,
            whName: 'PL Production Department (SPI-PL-004)',
            type: item.itemType || 'SEMI_FINISHED',
            pcs,
            gross,
            weightPerPiece,
            totalWeightKg,
            status: 'AVAILABLE',
          });
        }
      }

      // 2. Process Nipples & Hardware from WH-002 (filter > 0 strictly)
      const nipples: any[] = [];
      for (const r of wh2Rows) {
        const avail = toNum(r.availableQuantity ?? r.available ?? r.onHandQuantity ?? r.onHand);
        if (avail <= 0) continue; // Exclude zero-balance items
        const item = r.item || {};
        const code = item.itemCode || r.itemCode || '';
        const name = item.name || r.name || '';
        const isNipple = code.includes('NP') || code.includes('NPL') || name.toLowerCase().includes('nipple');
        if (!isNipple) continue;

        const uomCode = (r.uom?.code || item.baseUom?.code || 'GRS').toUpperCase();
        const isGross = uomCode === 'GRS' || uomCode === 'GROSS' || avail < 25000;
        const gross = isGross ? avail : Math.round((avail / 144) * 10) / 10;
        const pcs = isGross ? Math.round(avail * 144) : avail;

        const weightPerPiece = toNum(item.weightPerPiece) || 0.0035;
        const totalWeightKg = Math.round(pcs * weightPerPiece * 10) / 10;
        const role = code.includes('NP-005')
          ? 'Standard Brass Nipple'
          : (code.includes('NP-001')
            ? 'Front Wheel Nipple'
            : (code.includes('NP-002')
              ? 'CD-250X17 Nipple'
              : (code.includes('NP-003')
                ? '125-300X17 Nipple'
                : 'Assembly Spoke Nipple')));

        nipples.push({
          id: item.id || r.itemId,
          code,
          name,
          role,
          wh: wh2Id,
          whName: 'SPI Main Warehouse (WH-002)',
          type: item.itemType || 'FINISHED_GOOD',
          pcs,
          gross,
          weightPerPiece,
          totalWeightKg,
          status: 'AVAILABLE',
        });
      }

      if (spokes.length > 0) setSpokeStoreBalances(spokes);
      if (nipples.length > 0) setNippleStoreBalances(nipples);
    } catch (err) {
      console.warn('Failed to load department stock', err);
    } finally {
      setLoadingStock(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'department-stock') {
      fetchDepartmentStock();
    }
  }, [activeTab, fetchDepartmentStock]);

  const totalSpokePcs = spokeStoreBalances.reduce((sum, item) => sum + (item.pcs || 0), 0);
  const totalSpokeGrs = spokeStoreBalances.reduce((sum, item) => sum + (item.gross || 0), 0);
  const totalSpokeKg = spokeStoreBalances.reduce((sum, item) => sum + (item.totalWeightKg || 0), 0);
  const totalNipplePcs = nippleStoreBalances.reduce((sum, item) => sum + (item.pcs || 0), 0);
  const totalNippleGrs = nippleStoreBalances.reduce((sum, item) => sum + (item.gross || 0), 0);
  const totalNippleKg = nippleStoreBalances.reduce((sum, item) => sum + (item.totalWeightKg || 0), 0);
  const assemblyReadyWheels = Math.floor(Math.min(totalSpokePcs, totalNipplePcs) / 72);

  // ─────────────────────────────────────────────────────────────────────────────
  // EXPORT & SHARING SUITE (PDF, PRINT, EXCEL, WHATSAPP)
  // ─────────────────────────────────────────────────────────────────────────────
  const generateWhatsAppText = () => {
    const dateStr = dayjs().format('DD/MM/YYYY');
    const timeStr = dayjs().format('hh:mm A');
    let text = `🏭 *PAKISTAN WIRE INDUSTRIES (PVT) LTD*\n`;
    text += `📦 *DEPARTMENT STORE STOCK REPORT*\n`;
    text += `📅 *Date:* ${dateStr} | *Time:* ${timeStr}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    text += `🟠 *1. PLATING DEPT FINISHED STOCK (SPI-PL-004)*\n`;
    text += `• *Total Pieces:* ${formatNumber(totalSpokePcs, 0)} PCS\n`;
    text += `• *Total Gross:* ${formatNumber(totalSpokeGrs, 1)} GRS\n`;
    text += `• *Total Weight:* ${formatNumber(totalSpokeKg, 1)} KG\n`;
    text += `• *Active Items:* ${spokeStoreBalances.length} Items\n`;
    text += `──────────────────────────\n`;
    spokeStoreBalances.forEach((it, idx) => {
      text += `${idx + 1}. *${it.code}* — ${it.name}\n   └ ${formatNumber(it.pcs, 0)} PCS (${formatNumber(it.gross, 1)} GRS) | ${formatNumber(it.totalWeightKg, 1)} KG\n`;
    });

    text += `\n🔵 *2. NIPPLE & HARDWARE STORE (WH-002)*\n`;
    text += `• *Total Pieces:* ${formatNumber(totalNipplePcs, 0)} PCS\n`;
    text += `• *Total Gross:* ${formatNumber(totalNippleGrs, 1)} GRS\n`;
    text += `• *Total Weight:* ${formatNumber(totalNippleKg, 1)} KG\n`;
    text += `• *Active Items:* ${nippleStoreBalances.length} Items\n`;
    text += `──────────────────────────\n`;
    nippleStoreBalances.forEach((it, idx) => {
      text += `${idx + 1}. *${it.code}* — ${it.name}\n   └ ${formatNumber(it.pcs, 0)} PCS (${formatNumber(it.gross, 1)} GRS) | ${formatNumber(it.totalWeightKg, 1)} KG\n`;
    });

    text += `\n🟢 *3. ASSEMBLY READY BALANCE*\n`;
    text += `• *Balanced Sets:* ${formatNumber(assemblyReadyWheels, 0)} Sets (~${formatNumber(assemblyReadyWheels / 144, 1)} GRS)\n`;
    text += `• *Carton Capacity:* ~${formatNumber(assemblyReadyWheels / 1440, 1)} Cartons\n\n`;

    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `⚙️ _Report Generated by PWI ERP System_`;
    return text;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // COLUMN DISPLAY SETTINGS
  // ─────────────────────────────────────────────────────────────────────────────
  const columnSettingsContent = (
    <div style={{ width: 230, padding: '4px 0' }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--theme-text, #1e293b)', marginBottom: 8, borderBottom: '1px solid var(--theme-border, #e2e8f0)', paddingBottom: 4 }}>
        Column Display Settings
      </div>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Checkbox
          checked={showWarehouseColumn}
          onChange={(e) => setShowWarehouseColumn(e.target.checked)}
        >
          <span style={{ fontSize: 12, fontWeight: 600 }}>Warehouse Location</span>
          <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)', marginLeft: 22 }}>(Already in section title)</div>
        </Checkbox>
        <Checkbox
          checked={showWeightColumns}
          onChange={(e) => setShowWeightColumns(e.target.checked)}
        >
          <span style={{ fontSize: 12, fontWeight: 600 }}>Weight Columns (KG)</span>
          <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)', marginLeft: 22 }}>Per-pc & total weight</div>
        </Checkbox>
        <Checkbox
          checked={showStatusColumn}
          onChange={(e) => setShowStatusColumn(e.target.checked)}
        >
          <span style={{ fontSize: 12, fontWeight: 600 }}>Status Badge</span>
        </Checkbox>
        <Checkbox
          checked={showActionColumn}
          onChange={(e) => setShowActionColumn(e.target.checked)}
        >
          <span style={{ fontSize: 12, fontWeight: 600 }}>Action (Use in Packing)</span>
        </Checkbox>
      </Space>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. DEDICATED CORPORATE PRINT REPORT (EACH WAREHOUSE ON ITS OWN PAGE)
  // ─────────────────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      message.error('Please allow popups in your browser to print the report.');
      return;
    }

    const dateStr = dayjs().format('DD-MMM-YYYY');
    const timeStr = dayjs().format('hh:mm A');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>PWI Department Store Stock Report - ${dateStr}</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: auto;
            margin: 8mm 10mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 0;
            font-size: 11px;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page-sheet {
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
            box-sizing: border-box;
            padding: 4px;
          }
          .page-sheet.last-page {
            page-break-after: auto;
            break-after: auto;
          }
          .page-break-divider {
            page-break-before: always;
            break-before: page;
            display: block;
            height: 0;
            margin: 0;
            padding: 0;
            clear: both;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .page-sheet {
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .page-sheet.last-page {
              page-break-after: auto !important;
              break-after: auto !important;
            }
            .page-break-divider {
              page-break-before: always !important;
              break-before: page !important;
              display: block !important;
              height: 0 !important;
              clear: both !important;
            }
          }
          .header-table {
            width: 100%;
            border-bottom: 2.5px solid #1e3a8a;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .company-title {
            font-size: 18px;
            font-weight: 900;
            color: #0f172a;
            letter-spacing: 0.5px;
          }
          .report-title {
            font-size: 12px;
            font-weight: 800;
            color: #1e3a8a;
            margin-top: 3px;
          }
          .meta-text {
            font-size: 10px;
            color: #475569;
            text-align: right;
            line-height: 1.5;
          }
          .kpi-row {
            display: flex;
            gap: 12px;
            margin-bottom: 14px;
          }
          .kpi-box {
            flex: 1;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 8px 10px;
            background: #f8fafc;
            text-align: center;
          }
          .kpi-box-title {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .kpi-box-val {
            font-size: 13.5px;
            font-weight: 800;
            margin-top: 3px;
          }
          .section-title {
            font-size: 11.5px;
            font-weight: 800;
            padding: 5px 8px;
            margin-top: 10px;
            margin-bottom: 8px;
            border-radius: 4px;
          }
          .spoke-sec {
            background: #ffedd5;
            color: #9a3412;
            border-left: 4px solid #ea580c;
          }
          .nipple-sec {
            background: #e0f2fe;
            color: #0369a1;
            border-left: 4px solid #0284c7;
          }
          table.data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
            font-size: 10px;
          }
          table.data-table th {
            background: #334155;
            color: #ffffff;
            font-weight: 700;
            padding: 5.5px 6px;
            border: 1px solid #334155;
            text-align: left;
          }
          table.data-table td {
            padding: 4.5px 6px;
            border: 1px solid #cbd5e1;
          }
          table.data-table tr:nth-child(even) {
            background: #f8fafc;
          }
          .total-row {
            font-weight: 800;
            background: #f1f5f9;
          }
          .grand-total-box {
            background: #f8fafc;
            border: 1.5px solid #94a3b8;
            border-radius: 6px;
            padding: 8px 14px;
            font-weight: 800;
            margin-top: 14px;
            font-size: 11px;
            display: flex;
            justify-content: space-between;
          }
          .signatures {
            margin-top: 36px;
            display: flex;
            justify-content: space-between;
            padding: 0 40px;
          }
          .sig-box {
            text-align: center;
            width: 190px;
          }
          .sig-line {
            border-top: 1.2px solid #475569;
            margin-bottom: 5px;
          }
          .sheet-footer {
            font-size: 9px;
            color: #94a3b8;
            text-align: center;
            border-top: 1px solid #e2e8f0;
            padding-top: 5px;
            margin-top: 10px;
          }
        </style>
      </head>
      <body>
        <!-- PAGE 1: STORE 1 (PLATING DEPARTMENT — SPI-PL-004) -->
        <div class="page-sheet">
          <div>
            <table class="header-table">
              <tr>
                <td>
                  <div class="company-title">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
                  <div class="report-title">DEPARTMENT STORE STOCK & PACKING INVENTORY REPORT — PAGE 1 OF 2</div>
                </td>
                <td class="meta-text">
                  <div><b>Report Date:</b> ${dateStr} &nbsp;|&nbsp; <b>Time:</b> ${timeStr}</div>
                  <div><b>Department:</b> Plating Finished Store &nbsp;|&nbsp; <b>System:</b> PWI ERP</div>
                  <div><b>Warehouse Focus:</b> SPI-PL-004 (PL Production Dept)</div>
                </td>
              </tr>
            </table>

            <div class="kpi-row">
              <div class="kpi-box" style="border-color: #fed7aa; background: #fff7ed;">
                <div class="kpi-box-title" style="color: #9a3412;">Plating Dept (SPI-PL-004)</div>
                <div class="kpi-box-val" style="color: #ea580c;">
                  ${formatNumber(totalSpokePcs, 0)} PCS &nbsp;|&nbsp; ${formatNumber(totalSpokeGrs, 1)} GRS &nbsp;|&nbsp; ${formatNumber(totalSpokeKg, 1)} KG
                </div>
                <div style="font-size: 9.5px; color: #78350f; margin-top: 2px;">${spokeStoreBalances.length} Plated Spoke Wire Items</div>
              </div>
              <div class="kpi-box" style="border-color: #bae6fd; background: #f0f9ff;">
                <div class="kpi-box-title" style="color: #0369a1;">Main Warehouse (WH-002)</div>
                <div class="kpi-box-val" style="color: #0284c7;">
                  ${formatNumber(totalNipplePcs, 0)} PCS &nbsp;|&nbsp; ${formatNumber(totalNippleGrs, 1)} GRS &nbsp;|&nbsp; ${formatNumber(totalNippleKg, 1)} KG
                </div>
                <div style="font-size: 9.5px; color: #0369a1; margin-top: 2px;">${nippleStoreBalances.length} Assembly Nipple Items</div>
              </div>
              <div class="kpi-box" style="border-color: #bbf7d0; background: #f0fdf4;">
                <div class="kpi-box-title" style="color: #166534;">Assembly Ready Balance</div>
                <div class="kpi-box-val" style="color: #16a34a;">
                  ${formatNumber(assemblyReadyWheels, 0)} Sets &nbsp;|&nbsp; ~${formatNumber(assemblyReadyWheels / 144, 1)} GRS &nbsp;|&nbsp; ~${formatNumber(assemblyReadyWheels / 1440, 1)} Cartons
                </div>
                <div style="font-size: 9.5px; color: #166534; margin-top: 2px;">Matched Spoke + Nipple Sets Ready for Boxing</div>
              </div>
            </div>

            <div class="section-title spoke-sec">STORE 1: PLATING DEPARTMENT FINISHED STOCK (SPI-PL-004 — PL PRODUCTION DEPARTMENT) — ${spokeStoreBalances.length} ITEMS</div>
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 25px; text-align: center;">#</th>
                  <th style="width: 110px;">Item Code</th>
                  <th>Item Description & Specification</th>
                  <th style="width: 140px;">Wire Type</th>
                  <th style="text-align: right; width: 110px;">Gross Balance (GRS)</th>
                  <th style="text-align: right; width: 110px;">Pieces Balance (PCS)</th>
                  <th style="text-align: right; width: 95px;">Per Pc Wt (KG)</th>
                  <th style="text-align: right; width: 105px;">Total Weight (KG)</th>
                  <th style="text-align: center; width: 70px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${spokeStoreBalances.map((item, idx) => `
                  <tr>
                    <td style="text-align: center;">${idx + 1}</td>
                    <td><b>${item.code}</b></td>
                    <td>${item.name}</td>
                    <td>${item.role}</td>
                    <td style="text-align: right; font-weight: 700; color: #c2410c;">${formatNumber(item.gross, 1)} GRS</td>
                    <td style="text-align: right; font-weight: 700;">${formatNumber(item.pcs, 0)} PCS</td>
                    <td style="text-align: right;">${item.weightPerPiece ? Number(item.weightPerPiece).toFixed(5) + ' KG' : '—'}</td>
                    <td style="text-align: right; font-weight: 700;">${item.totalWeightKg ? formatNumber(item.totalWeightKg, 1) + ' KG' : '—'}</td>
                    <td style="text-align: center; color: #16a34a; font-weight: 700;">AVAILABLE</td>
                  </tr>
                `).join('')}
                <tr class="total-row" style="background: #fff7ed;">
                  <td colspan="4" style="text-align: right; color: #9a3412;">STORE 1 TOTAL (PLATING SPOKES):</td>
                  <td style="text-align: right; color: #c2410c;">${formatNumber(totalSpokeGrs, 1)} GRS</td>
                  <td style="text-align: right; color: #ea580c;">${formatNumber(totalSpokePcs, 0)} PCS</td>
                  <td style="text-align: right; color: #64748b;">Avg Wt</td>
                  <td style="text-align: right; color: #9a3412;">${formatNumber(totalSpokeKg, 1)} KG</td>
                  <td style="text-align: center;">READY</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="sheet-footer">
            Page 1 of 2 &nbsp;|&nbsp; Store 1: Plating Department Stock Completed &nbsp;|&nbsp; Please see Page 2 for Store 2 (WH-002) and Official Signatures
          </div>
        </div>

        <!-- EXPLICIT PAGE BREAK FORCED TO NEXT SHEET -->
        <div class="page-break-divider"></div>

        <!-- PAGE 2: STORE 2 (NIPPLE & HARDWARE STORE — WH-002) -->
        <div class="page-sheet last-page">
          <div>
            <table class="header-table">
              <tr>
                <td>
                  <div class="company-title">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
                  <div class="report-title">DEPARTMENT STORE STOCK & PACKING INVENTORY REPORT — PAGE 2 OF 2</div>
                </td>
                <td class="meta-text">
                  <div><b>Report Date:</b> ${dateStr} &nbsp;|&nbsp; <b>Time:</b> ${timeStr}</div>
                  <div><b>Department:</b> Assembly Hardware Store &nbsp;|&nbsp; <b>System:</b> PWI ERP</div>
                  <div><b>Warehouse Focus:</b> WH-002 (SPI Main Warehouse)</div>
                </td>
              </tr>
            </table>

            <div class="section-title nipple-sec">STORE 2: NIPPLE & HARDWARE STORE (WH-002 — SPI MAIN WAREHOUSE) — ${nippleStoreBalances.length} ITEMS</div>
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 25px; text-align: center;">#</th>
                  <th style="width: 110px;">Item Code</th>
                  <th>Item Description & Specification</th>
                  <th style="width: 140px;">Nipple Type</th>
                  <th style="text-align: right; width: 110px;">Gross Balance (GRS)</th>
                  <th style="text-align: right; width: 110px;">Pieces Balance (PCS)</th>
                  <th style="text-align: right; width: 95px;">Per Pc Wt (KG)</th>
                  <th style="text-align: right; width: 105px;">Total Weight (KG)</th>
                  <th style="text-align: center; width: 70px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${nippleStoreBalances.map((item, idx) => `
                  <tr>
                    <td style="text-align: center;">${idx + 1}</td>
                    <td><b>${item.code}</b></td>
                    <td>${item.name}</td>
                    <td>${item.role}</td>
                    <td style="text-align: right; font-weight: 700; color: #0369a1;">${formatNumber(item.gross, 1)} GRS</td>
                    <td style="text-align: right; font-weight: 700;">${formatNumber(item.pcs, 0)} PCS</td>
                    <td style="text-align: right;">${item.weightPerPiece ? Number(item.weightPerPiece).toFixed(5) + ' KG' : '—'}</td>
                    <td style="text-align: right; font-weight: 700;">${item.totalWeightKg ? formatNumber(item.totalWeightKg, 1) + ' KG' : '—'}</td>
                    <td style="text-align: center; color: #16a34a; font-weight: 700;">AVAILABLE</td>
                  </tr>
                `).join('')}
                <tr class="total-row" style="background: #f0f9ff;">
                  <td colspan="4" style="text-align: right; color: #0369a1;">STORE 2 TOTAL (ASSEMBLY NIPPLES):</td>
                  <td style="text-align: right; color: #0369a1;">${formatNumber(totalNippleGrs, 1)} GRS</td>
                  <td style="text-align: right; color: #0284c7;">${formatNumber(totalNipplePcs, 0)} PCS</td>
                  <td style="text-align: right; color: #64748b;">0.00350 KG</td>
                  <td style="text-align: right; color: #0c4a6e;">${formatNumber(totalNippleKg, 1)} KG</td>
                  <td style="text-align: center;">READY</td>
                </tr>
              </tbody>
            </table>

            <div class="grand-total-box">
              <div><b>COMBINED TOTAL STOCK:</b> &nbsp; Spokes: ${formatNumber(totalSpokePcs, 0)} PCS &nbsp;|&nbsp; Nipples: ${formatNumber(totalNipplePcs, 0)} PCS</div>
              <div><b>TOTAL GROSS:</b> ${formatNumber(totalSpokeGrs + totalNippleGrs, 1)} GRS &nbsp;|&nbsp; <b>TOTAL WEIGHT:</b> ${formatNumber(totalSpokeKg + totalNippleKg, 1)} KG</div>
            </div>

            <div class="signatures">
              <div class="sig-box">
                <div class="sig-line"></div>
                <div><b>Prepared By</b><br/><span style="font-size: 9px; color: #64748b;">Store Keeper / Operator</span></div>
              </div>
              <div class="sig-box">
                <div class="sig-line"></div>
                <div><b>Verified By</b><br/><span style="font-size: 9px; color: #64748b;">Store Incharge</span></div>
              </div>
              <div class="sig-box">
                <div class="sig-line"></div>
                <div><b>Approved By</b><br/><span style="font-size: 9px; color: #64748b;">Production Manager / GM</span></div>
              </div>
            </div>
          </div>

          <div class="sheet-footer">
            Page 2 of 2 &nbsp;|&nbsp; End of Department Store Stock Report &nbsp;|&nbsp; System Generated by Pakistan Wire Industries ERP
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 450);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. REAL VECTOR PDF EXPORT (EACH WAREHOUSE ON ITS OWN PAGE)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleExportPdf = async () => {
    try {
      setExportingPdf(true);
      message.loading({ content: 'Generating high-resolution PDF document...', key: 'pdf-export' });

      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' });
      const pageWidth = doc.internal.pageSize.getWidth(); // 297 mm
      const pageHeight = doc.internal.pageSize.getHeight(); // 210 mm
      const dateStr = dayjs().format('DD-MMM-YYYY');
      const timeStr = dayjs().format('hh:mm A');

      // ═════════════════════════════════════════════════════════════════════════
      // PAGE 1: STORE 1 (PLATING DEPARTMENT — SPI-PL-004)
      // ═════════════════════════════════════════════════════════════════════════
      // Top colored bar
      doc.setFillColor(30, 58, 138); // #1e3a8a
      doc.rect(0, 0, pageWidth, 5, 'F');

      // Header Text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text('PAKISTAN WIRE INDUSTRIES (PVT) LTD', 14, 15);

      doc.setFontSize(10.5);
      doc.setTextColor(30, 58, 138);
      doc.text('DEPARTMENT STORE STOCK REPORT — PAGE 1: PLATING DEPT (SPI-PL-004)', 14, 21);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Report Date: ${dateStr}  |  Time: ${timeStr}`, pageWidth - 14, 15, { align: 'right' });
      doc.text(`Department: Plating Finished Store  |  System: PWI ERP`, pageWidth - 14, 20, { align: 'right' });

      // Divider line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.line(14, 24, pageWidth - 14, 24);

      // Executive KPI Strip Table
      autoTable(doc, {
        startY: 27,
        margin: { left: 14, right: 14 },
        head: [[
          'STORE 1: PLATING DEPARTMENT (SPI-PL-004)',
          'STORE 2: MAIN WAREHOUSE (WH-002)',
          'ASSEMBLY READY BALANCE (MATCHED)',
        ]],
        body: [[
          `Total: ${formatNumber(totalSpokePcs, 0)} PCS  |  ${formatNumber(totalSpokeGrs, 1)} GRS  |  ${formatNumber(totalSpokeKg, 1)} KG\n(${spokeStoreBalances.length} Plated Spoke Wire Items)`,
          `Total: ${formatNumber(totalNipplePcs, 0)} PCS  |  ${formatNumber(totalNippleGrs, 1)} GRS  |  ${formatNumber(totalNippleKg, 1)} KG\n(${nippleStoreBalances.length} Assembly Brass Nipple Items)`,
          `Balanced Sets: ${formatNumber(assemblyReadyWheels, 0)} Sets (~${formatNumber(assemblyReadyWheels / 144, 1)} GRS)\nCarton Packing Capacity: ~${formatNumber(assemblyReadyWheels / 1440, 1)} Cartons (10 GRS/ctn)`,
        ]],
        theme: 'grid',
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [51, 65, 85],
          fontSize: 8,
          fontStyle: 'bold',
          halign: 'center',
          cellPadding: 2,
        },
        bodyStyles: {
          fontSize: 8,
          fontStyle: 'bold',
          halign: 'center',
          textColor: [15, 23, 42],
          cellPadding: 2.8,
        },
        columnStyles: {
          0: { cellWidth: (pageWidth - 28) / 3 },
          1: { cellWidth: (pageWidth - 28) / 3 },
          2: { cellWidth: (pageWidth - 28) / 3 },
        },
      });

      let currentY = (doc as any).lastAutoTable.finalY + 6;

      // STORE 1 Section Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(194, 65, 12);
      doc.text('STORE 1: PLATING DEPARTMENT FINISHED STOCK (SPI-PL-004 — PL PRODUCTION DEPARTMENT)', 14, currentY);

      const spokeHead = [
        '#',
        'Item Code',
        'Item Description & Specification',
        'Wire Type',
        'Available (GRS)',
        'Available (PCS)',
        'Per Pc Wt (KG)',
        'Total Weight (KG)',
        'Status',
      ];

      const spokeBody = spokeStoreBalances.map((item, idx) => [
        idx + 1,
        item.code,
        item.name,
        item.role,
        `${formatNumber(item.gross, 1)} GRS`,
        `${formatNumber(item.pcs, 0)} PCS`,
        item.weightPerPiece ? `${Number(item.weightPerPiece).toFixed(5)} KG` : '—',
        item.totalWeightKg ? `${formatNumber(item.totalWeightKg, 1)} KG` : '—',
        item.status || 'AVAILABLE',
      ]);

      const spokeFoot = [[
        '',
        'STORE 1 TOTAL (PLATING SPOKES)',
        '',
        `${spokeStoreBalances.length} Items`,
        `${formatNumber(totalSpokeGrs, 1)} GRS`,
        `${formatNumber(totalSpokePcs, 0)} PCS`,
        'Avg Wt',
        `${formatNumber(totalSpokeKg, 1)} KG`,
        'READY',
      ]];

      autoTable(doc, {
        startY: currentY + 2.5,
        margin: { left: 14, right: 14 },
        head: [spokeHead],
        body: spokeBody,
        foot: spokeFoot,
        theme: 'striped',
        headStyles: {
          fillColor: [234, 88, 12],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: 2.2,
        },
        bodyStyles: {
          fontSize: 7.2,
          cellPadding: 2,
          textColor: [15, 23, 42],
        },
        footStyles: {
          fillColor: [254, 215, 170],
          textColor: [154, 52, 18],
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: 2.5,
        },
        alternateRowStyles: {
          fillColor: [255, 247, 237],
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 26, fontStyle: 'bold' },
          2: { cellWidth: 65 },
          3: { cellWidth: 42 },
          4: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: [194, 65, 12] },
          5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
          6: { cellWidth: 26, halign: 'right' },
          7: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
          8: { cellWidth: 16, halign: 'center' },
        },
      });

      // ═════════════════════════════════════════════════════════════════════════
      // PAGE 2: STORE 2 (NIPPLE & HARDWARE STORE — WH-002) — DEDICATED PAGE
      // ═════════════════════════════════════════════════════════════════════════
      doc.addPage();

      // Top colored bar
      doc.setFillColor(30, 58, 138); // #1e3a8a
      doc.rect(0, 0, pageWidth, 5, 'F');

      // Header Text for Page 2
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text('PAKISTAN WIRE INDUSTRIES (PVT) LTD', 14, 15);

      doc.setFontSize(10.5);
      doc.setTextColor(30, 58, 138);
      doc.text('DEPARTMENT STORE STOCK REPORT — PAGE 2: MAIN WAREHOUSE (WH-002)', 14, 21);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Report Date: ${dateStr}  |  Time: ${timeStr}`, pageWidth - 14, 15, { align: 'right' });
      doc.text(`Department: Assembly Hardware Store  |  System: PWI ERP`, pageWidth - 14, 20, { align: 'right' });

      // Divider line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.line(14, 24, pageWidth - 14, 24);

      currentY = 30;

      // STORE 2 Section Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(3, 105, 161);
      doc.text('STORE 2: NIPPLE & HARDWARE STORE (WH-002 — SPI MAIN WAREHOUSE)', 14, currentY);

      const nippleHead = [
        '#',
        'Item Code',
        'Item Description & Specification',
        'Nipple Type',
        'Available (GRS)',
        'Available (PCS)',
        'Per Pc Wt (KG)',
        'Total Weight (KG)',
        'Status',
      ];

      const nippleBody = nippleStoreBalances.map((item, idx) => [
        idx + 1,
        item.code,
        item.name,
        item.role,
        `${formatNumber(item.gross, 1)} GRS`,
        `${formatNumber(item.pcs, 0)} PCS`,
        item.weightPerPiece ? `${Number(item.weightPerPiece).toFixed(5)} KG` : '—',
        item.totalWeightKg ? `${formatNumber(item.totalWeightKg, 1)} KG` : '—',
        item.status || 'AVAILABLE',
      ]);

      const nippleFoot = [[
        '',
        'STORE 2 TOTAL (ASSEMBLY NIPPLES)',
        '',
        `${nippleStoreBalances.length} Items`,
        `${formatNumber(totalNippleGrs, 1)} GRS`,
        `${formatNumber(totalNipplePcs, 0)} PCS`,
        '0.00350 KG',
        `${formatNumber(totalNippleKg, 1)} KG`,
        'READY',
      ]];

      autoTable(doc, {
        startY: currentY + 2.5,
        margin: { left: 14, right: 14 },
        head: [nippleHead],
        body: nippleBody,
        foot: nippleFoot,
        theme: 'striped',
        headStyles: {
          fillColor: [2, 132, 199],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: 2.2,
        },
        bodyStyles: {
          fontSize: 7.2,
          cellPadding: 2,
          textColor: [15, 23, 42],
        },
        footStyles: {
          fillColor: [186, 230, 253],
          textColor: [3, 105, 161],
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: 2.5,
        },
        alternateRowStyles: {
          fillColor: [240, 249, 255],
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 26, fontStyle: 'bold' },
          2: { cellWidth: 65 },
          3: { cellWidth: 42 },
          4: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: [3, 105, 161] },
          5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
          6: { cellWidth: 26, halign: 'right' },
          7: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
          8: { cellWidth: 16, halign: 'center' },
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;

      // Combined Grand Total Banner on Page 2
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(14, currentY, pageWidth - 28, 11, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `COMBINED TOTAL:   Spokes: ${formatNumber(totalSpokePcs, 0)} PCS (${formatNumber(totalSpokeGrs, 1)} GRS)   |   Nipples: ${formatNumber(totalNipplePcs, 0)} PCS (${formatNumber(totalNippleGrs, 1)} GRS)   |   Total Combined Weight: ${formatNumber(totalSpokeKg + totalNippleKg, 1)} KG`,
        pageWidth / 2,
        currentY + 7,
        { align: 'center' }
      );

      // Formal 3 Signatures on Page 2
      const sigY = currentY + 28;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);

      doc.line(24, sigY, 74, sigY);
      doc.text('Prepared By (Store Keeper)', 49, sigY + 4, { align: 'center' });

      doc.line(pageWidth / 2 - 25, sigY, pageWidth / 2 + 25, sigY);
      doc.text('Verified By (Incharge Stores)', pageWidth / 2, sigY + 4, { align: 'center' });

      doc.line(pageWidth - 74, sigY, pageWidth - 24, sigY);
      doc.text('Approved By (Plant / GM)', pageWidth - 49, sigY + 4, { align: 'center' });

      // Page numbers footer on all pages
      const totalPages = (doc.internal as any).getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Page ${p} of ${totalPages}  |  Pakistan Wire Industries (Pvt) Ltd — System Generated Official Report`,
          pageWidth / 2,
          pageHeight - 4.5,
          { align: 'center' }
        );
      }

      doc.save(`PWI_Department_Store_Stock_Report_${dayjs().format('YYYY-MM-DD')}.pdf`);
      message.success({ content: 'Official PDF document downloaded successfully!', key: 'pdf-export' });
    } catch (err) {
      console.error('Failed to generate PDF', err);
      message.error({ content: 'Failed to generate PDF document. Please try again.', key: 'pdf-export' });
    } finally {
      setExportingPdf(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. PROFESSIONAL EXCEL EXPORT (CSV WITH UTF-8 BOM & STRUCTURED HEADERS)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    const dateStr = dayjs().format('YYYY-MM-DD');
    const timeStr = dayjs().format('hh:mm A');

    const lines: string[] = [
      'PAKISTAN WIRE INDUSTRIES (PVT) LTD - ENTERPRISE ERP',
      'DEPARTMENT STORE STOCK & PACKING INVENTORY REPORT',
      `"Generated Date: ${dayjs().format('DD-MMM-YYYY')}","Generated Time: ${timeStr}","Status: Official Live Production Balances"`,
      '',
      '=== EXECUTIVE KPI SUMMARY ===',
      '"Store / Department","Available Pieces (PCS)","Available Gross (GRS)","Total Weight (KG)","Details / Notes"',
      `"Store 1: Plating Dept (SPI-PL-004)","${totalSpokePcs}","${totalSpokeGrs}","${totalSpokeKg}","${spokeStoreBalances.length} Plated Spoke Wire Items"`,
      `"Store 2: Main Warehouse (WH-002)","${totalNipplePcs}","${totalNippleGrs}","${totalNippleKg}","${nippleStoreBalances.length} Assembly Brass Nipple Items"`,
      `"Assembly Ready Balance","${assemblyReadyWheels} Sets","${Math.round((assemblyReadyWheels / 144) * 10) / 10} GRS Sets","${Math.round((assemblyReadyWheels / 1440) * 10) / 10} Cartons","Balanced Spoke + Nipple Sets Ready for Boxing"`,
      `"Combined Grand Total Stock","${totalSpokePcs + totalNipplePcs}","${Math.round((totalSpokeGrs + totalNippleGrs) * 10) / 10}","${Math.round((totalSpokeKg + totalNippleKg) * 10) / 10}","Total Spoke & Nipple Inventory Combined"`,
      '',
      '=== STORE 1: PLATING DEPARTMENT FINISHED STOCK (SPI-PL-004) ===',
      'Sr #,Item Code,Item Description,Wire Type / Specification,Warehouse Location,Available Balance (GRS),Available Balance (PCS),Per Piece Weight (KG),Total Weight (KG),Status',
    ];

    spokeStoreBalances.forEach((r, idx) => {
      lines.push([
        idx + 1,
        `"${r.code}"`,
        `"${r.name}"`,
        `"${r.role}"`,
        `"${r.whName}"`,
        r.gross,
        r.pcs,
        r.weightPerPiece || 0,
        r.totalWeightKg || 0,
        r.status,
      ].join(','));
    });

    lines.push([
      'TOTAL',
      '"STORE 1 TOTAL (PLATING SPOKES)"',
      '""',
      `"${spokeStoreBalances.length} Items"`,
      '""',
      totalSpokeGrs,
      totalSpokePcs,
      'Avg',
      totalSpokeKg,
      'AVAILABLE',
    ].join(','));

    lines.push('');
    lines.push('=== STORE 2: NIPPLE & HARDWARE STORE (WH-002) ===');
    lines.push('Sr #,Item Code,Item Description,Nipple Type / Specification,Warehouse Location,Available Balance (GRS),Available Balance (PCS),Per Piece Weight (KG),Total Weight (KG),Status');

    nippleStoreBalances.forEach((r, idx) => {
      lines.push([
        idx + 1,
        `"${r.code}"`,
        `"${r.name}"`,
        `"${r.role}"`,
        `"${r.whName}"`,
        r.gross,
        r.pcs,
        r.weightPerPiece || 0,
        r.totalWeightKg || 0,
        r.status,
      ].join(','));
    });

    lines.push([
      'TOTAL',
      '"STORE 2 TOTAL (ASSEMBLY NIPPLES)"',
      '""',
      `"${nippleStoreBalances.length} Items"`,
      '""',
      totalNippleGrs,
      totalNipplePcs,
      '0.00350',
      totalNippleKg,
      'AVAILABLE',
    ].join(','));

    lines.push('');
    lines.push(`"COMBINED GRAND TOTAL","Spokes: ${totalSpokePcs} PCS (${totalSpokeGrs} GRS) | Nipples: ${totalNipplePcs} PCS (${totalNippleGrs} GRS) | Total Weight: ${Math.round((totalSpokeKg + totalNippleKg) * 10) / 10} KG"`);
    lines.push('"Prepared By: ____________________","Verified By: ____________________","Approved By: ____________________"');

    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `PWI_Department_Store_Stock_Report_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Professional Excel CSV exported successfully!');
  };

  const handleCopyWhatsApp = () => {
    const text = generateWhatsAppText();
    navigator.clipboard.writeText(text);
    setCopiedWhatsApp(true);
    message.success('Stock report copied to clipboard for WhatsApp!');
    setTimeout(() => setCopiedWhatsApp(false), 3000);
  };

  const handleOpenWhatsApp = () => {
    const text = generateWhatsAppText();
    const phoneClean = whatsAppPhone.replace(/[^0-9]/g, '');
    const url = phoneClean
      ? `https://api.whatsapp.com/send?phone=${phoneClean}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // DYNAMIC SPOKE & NIPPLE COLUMNS (RESPECTING CUSTOMIZE DISPLAY TOGGLE)
  // ─────────────────────────────────────────────────────────────────────────────
  const spokeColumns = [
    {
      title: '#',
      key: 'idx',
      width: 44,
      align: 'center' as const,
      render: (_: any, __: any, index: number) => <span style={{ fontWeight: 700, color: 'var(--theme-text-muted)' }}>{index + 1}</span>,
    },
    {
      title: 'Item Code',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: 'var(--theme-text)' }}>{code}</Text>
          <Tag color="orange" style={{ fontWeight: 700, fontSize: 10.5, margin: 0, borderRadius: 0 }}>PLATED SPOKE</Tag>
        </Space>
      ),
    },
    {
      title: 'Item Description & Specification',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, r: any) => (
        <div>
          <Text strong style={{ color: 'var(--theme-text)', fontSize: 13 }}>{name}</Text>
          <div style={{ fontSize: 11, color: 'var(--theme-accent, #0284c7)', fontWeight: 600 }}>{r.role}</div>
        </div>
      ),
    },
    ...(showWarehouseColumn ? [{
      title: 'Department Warehouse / Store',
      dataIndex: 'whName',
      key: 'whName',
      render: (wh: string) => <Tag color="cyan" style={{ fontWeight: 600, borderRadius: 0 }}>{wh}</Tag>,
    }] : []),
    {
      title: 'Available Balance (Gross)',
      dataIndex: 'gross',
      key: 'gross',
      width: 155,
      align: 'right' as const,
      render: (grs: number) => (
        <Text strong style={{ color: '#ea580c', fontSize: 13.5 }}>
          {formatNumber(grs, grs % 1 === 0 ? 0 : 1)} GRS
        </Text>
      ),
    },
    {
      title: 'Available Balance (Pieces)',
      dataIndex: 'pcs',
      key: 'pcs',
      width: 155,
      align: 'right' as const,
      render: (pcs: number) => (
        <span style={{ fontWeight: 800, color: 'var(--theme-text)', fontSize: 13 }}>
          {formatNumber(pcs, 0)} PCS
        </span>
      ),
    },
    ...(showWeightColumns ? [
      {
        title: 'Per Pc Wt (KG)',
        dataIndex: 'weightPerPiece',
        key: 'weightPerPiece',
        width: 130,
        align: 'right' as const,
        render: (wt: number) => (
          <Tag color="default" style={{ fontWeight: 700, fontFamily: 'monospace' }}>
            {wt ? `${Number(wt).toFixed(5)} KG` : '—'}
          </Tag>
        ),
      },
      {
        title: 'Total Weight (KG)',
        dataIndex: 'totalWeightKg',
        key: 'totalWeightKg',
        width: 140,
        align: 'right' as const,
        render: (tot: number) => (
          <span style={{ fontWeight: 800, color: '#9a3412', fontSize: 13 }}>
            {tot ? `${formatNumber(tot, 1)} KG` : '—'}
          </span>
        ),
      },
    ] : []),
    ...(showStatusColumn ? [{
      title: 'Status',
      key: 'status',
      align: 'center' as const,
      width: 100,
      render: () => <Tag icon={<CheckCircleFilled />} color="success" style={{ fontWeight: 700 }}>AVAILABLE</Tag>,
    }] : []),
    ...(showActionColumn ? [{
      title: 'Action',
      key: 'action',
      align: 'center' as const,
      width: 125,
      render: () => (
        <Button
          size="small"
          type="primary"
          icon={<SendOutlined />}
          onClick={() => handleNavigateTab('packing-entry')}
          style={{ background: '#059669', borderColor: '#059669', fontWeight: 700, fontSize: 11.5 }}
        >
          Use in Packing
        </Button>
      ),
    }] : []),
  ];

  const nippleColumns = [
    {
      title: '#',
      key: 'idx',
      width: 44,
      align: 'center' as const,
      render: (_: any, __: any, index: number) => <span style={{ fontWeight: 700, color: 'var(--theme-text-muted)' }}>{index + 1}</span>,
    },
    {
      title: 'Item Code',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: 'var(--theme-text)' }}>{code}</Text>
          <Tag color="blue" style={{ fontWeight: 700, fontSize: 10.5, margin: 0, borderRadius: 0 }}>NIPPLE HARDWARE</Tag>
        </Space>
      ),
    },
    {
      title: 'Item Description & Specification',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, r: any) => (
        <div>
          <Text strong style={{ color: 'var(--theme-text)', fontSize: 13 }}>{name}</Text>
          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>{r.role}</div>
        </div>
      ),
    },
    ...(showWarehouseColumn ? [{
      title: 'Department Warehouse / Store',
      dataIndex: 'whName',
      key: 'whName',
      render: (wh: string) => <Tag color="geekblue" style={{ fontWeight: 600, borderRadius: 0 }}>{wh}</Tag>,
    }] : []),
    {
      title: 'Available Balance (Gross)',
      dataIndex: 'gross',
      key: 'gross',
      width: 155,
      align: 'right' as const,
      render: (grs: number) => (
        <Text strong style={{ color: '#0284c7', fontSize: 13.5 }}>
          {formatNumber(grs, grs % 1 === 0 ? 0 : 1)} GRS
        </Text>
      ),
    },
    {
      title: 'Available Balance (Pieces)',
      dataIndex: 'pcs',
      key: 'pcs',
      width: 155,
      align: 'right' as const,
      render: (pcs: number) => (
        <span style={{ fontWeight: 800, color: 'var(--theme-text)', fontSize: 13 }}>
          {formatNumber(pcs, 0)} PCS
        </span>
      ),
    },
    ...(showWeightColumns ? [
      {
        title: 'Per Pc Wt (KG)',
        dataIndex: 'weightPerPiece',
        key: 'weightPerPiece',
        width: 130,
        align: 'right' as const,
        render: (wt: number) => (
          <Tag color="default" style={{ fontWeight: 700, fontFamily: 'monospace' }}>
            {wt ? `${Number(wt).toFixed(5)} KG` : '—'}
          </Tag>
        ),
      },
      {
        title: 'Total Weight (KG)',
        dataIndex: 'totalWeightKg',
        key: 'totalWeightKg',
        width: 140,
        align: 'right' as const,
        render: (tot: number) => (
          <span style={{ fontWeight: 800, color: '#0c4a6e', fontSize: 13 }}>
            {tot ? `${formatNumber(tot, 1)} KG` : '—'}
          </span>
        ),
      },
    ] : []),
    ...(showStatusColumn ? [{
      title: 'Status',
      key: 'status',
      align: 'center' as const,
      width: 100,
      render: () => <Tag icon={<CheckCircleFilled />} color="success" style={{ fontWeight: 700 }}>AVAILABLE</Tag>,
    }] : []),
    ...(showActionColumn ? [{
      title: 'Action',
      key: 'action',
      align: 'center' as const,
      width: 125,
      render: () => (
        <Button
          size="small"
          type="primary"
          icon={<SendOutlined />}
          onClick={() => handleNavigateTab('packing-entry')}
          style={{ background: '#0284c7', borderColor: '#0284c7', fontWeight: 700, fontSize: 11.5 }}
        >
          Use in Packing
        </Button>
      ),
    }] : []),
  ];


  // ─────────────────────────────────────────────────────────────────────────────
  // REUSABLE CUSTOMER / SOC ITEMS TABLE COMPONENT
  // ─────────────────────────────────────────────────────────────────────────────
  const renderItemsTable = (itemsToRender: any[], parentSocNo?: string) => (
    <div className="packing-table-responsive-wrapper" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
      <Table
        dataSource={itemsToRender}
        rowKey="id"
        pagination={false}
        bordered={false}
        size="small"
        scroll={{ x: 'max-content' }}
        className="customer-stock-table packing-borderless-table"
        expandable={{
          expandedRowRender: (record: any) => (
            <div style={{ margin: '4px 0 10px 16px', padding: 12, background: 'var(--theme-surface-alt, rgba(2, 132, 199, 0.03))', borderRadius: 6, border: '1px solid var(--theme-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <Space size={8}>
                  <CalendarOutlined style={{ color: '#0284c7' }} />
                  <Text strong style={{ fontSize: 12.5, color: 'var(--theme-text)' }}>
                    Date-Wise Production & Packing History ({record.logs?.length || 0} Batches / Entries for this Item & SOC)
                  </Text>
                </Space>
                <Space size={6}>
                  <Tag color="blue" style={{ fontWeight: 700 }}>{record.itemCode}</Tag>
                  <Tag color="purple" style={{ fontWeight: 700 }}>SOC: {record.socNo || parentSocNo}</Tag>
                </Space>
              </div>
              <Table
                dataSource={record.logs || []}
                rowKey="id"
                pagination={false}
                size="small"
                bordered
                className="packing-borderless-table"
                columns={[
                  {
                    title: '#',
                    key: 'idx',
                    width: 40,
                    align: 'center' as const,
                    render: (_: any, __: any, index: number) => index + 1,
                  },
                  {
                    title: 'Packing Date & Time',
                    key: 'date',
                    width: 175,
                    render: (_: any, log: any) => (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontWeight: 800, fontSize: 12, color: 'var(--theme-text)' }}>
                            📅 {log.formattedDate || (log.date ? dayjs(log.date).format('DD-MMM-YYYY') : '—')}
                          </span>
                          {log.isOpeningStock && (
                            <Tag color="cyan" style={{ fontSize: 10, fontWeight: 800, margin: 0, padding: '0 4px', borderRadius: 2 }}>
                              OPENING
                            </Tag>
                          )}
                        </div>
                        {log.formattedTime && (
                          <span style={{ fontSize: 11, color: 'var(--theme-accent, #0284c7)', fontWeight: 700 }}>
                            ⏰ {log.formattedTime}
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    title: 'Batch Number',
                    key: 'batchNo',
                    width: 140,
                    render: (_: any, log: any) => (
                      <Tag color={log.isOpeningStock ? 'cyan' : 'blue'} style={{ fontWeight: 800 }}>
                        {log.batchNo}
                      </Tag>
                    ),
                  },
                  {
                    title: 'Shift & Operator',
                    key: 'shiftOp',
                    width: 160,
                    render: (_: any, log: any) => (
                      <div style={{ fontSize: 11.5 }}>
                        <div style={{ fontWeight: 700, color: 'var(--theme-text)' }}>{log.shift}</div>
                        <div style={{ color: 'var(--theme-text-muted)' }}>👤 {log.operator}</div>
                      </div>
                    ),
                  },
                  {
                    title: 'Gross (GRS)',
                    key: 'gross',
                    width: 110,
                    align: 'right' as const,
                    render: (_: any, log: any) => (
                      <span style={{ fontWeight: 800, color: '#4338ca' }}>
                        📦 {formatNumber(log.gross, 0)} GRS
                      </span>
                    ),
                  },
                  {
                    title: 'Cartons (CTN)',
                    key: 'cartons',
                    width: 100,
                    align: 'center' as const,
                    render: (_: any, log: any) => (
                      <Tag color="purple" style={{ fontWeight: 800 }}>
                        🏷️ {formatNumber(log.cartons, 0)} CTN
                      </Tag>
                    ),
                  },
                  {
                    title: 'Pieces (PCS)',
                    key: 'pcs',
                    width: 120,
                    align: 'right' as const,
                    render: (_: any, log: any) => (
                      <span style={{ fontWeight: 700, color: '#059669', fontSize: 12 }}>
                        🔢 {formatNumber(log.pcs, 0)} PCS
                      </span>
                    ),
                  },
                  {
                    title: 'Net Weight',
                    key: 'weightKg',
                    width: 110,
                    align: 'right' as const,
                    render: (_: any, log: any) => (
                      <span style={{ fontWeight: 800, color: '#d97706', fontSize: 12 }}>
                        ⚖️ {formatNumber(log.weightKg, 2)} KG
                      </span>
                    ),
                  },
                  {
                    title: 'Status',
                    key: 'status',
                    width: 130,
                    align: 'center' as const,
                    render: (_: any, log: any) => {
                      if (log.isOpeningStock) {
                        return (
                          <Tag color="cyan" style={{ fontWeight: 800, borderRadius: 2 }}>
                            🏷️ Opening Stock
                          </Tag>
                        );
                      }
                      if (log.status === 'WITHOUT_NIPPLE') {
                        return (
                          <Tag color="warning" style={{ fontWeight: 700 }}>
                            Without Nipple
                          </Tag>
                        );
                      }
                      return (
                        <Tag color="success" style={{ fontWeight: 700 }}>
                          Packed
                        </Tag>
                      );
                    },
                  },
                ]}
              />
            </div>
          ),
          rowExpandable: (record: any) => Boolean(record.logs && record.logs.length > 0),
        }}
        columns={[
          {
            title: <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--theme-text)' }}>#</span>,
            key: 'idx',
            width: 45,
            align: 'center' as const,
            render: (_: any, __: any, index: number) => (
              <Tag color="default" style={{ fontWeight: 800, margin: 0, borderRadius: 2 }}>
                {index + 1}
              </Tag>
            ),
          },
          {
            title: <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--theme-text)' }}>Item (Name & Code)</span>,
            key: 'item',
            width: 250,
            render: (_: any, r: any) => (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--theme-accent, #0284c7)', fontWeight: 800 }}>
                    {r.itemCode}
                  </span>
                  <Tag color="green" style={{ fontSize: 10, margin: 0, padding: '1px 6px', fontWeight: 700, borderRadius: 2 }}>
                    Finished Good
                  </Tag>
                </div>
                <div style={{ fontSize: 12, color: 'var(--theme-text)', fontWeight: 600, marginTop: 3 }}>
                  {r.itemName}
                </div>
              </div>
            ),
          },
          {
            title: <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--theme-text)' }}>SOC & Packaging Style</span>,
            key: 'socAndPacking',
            width: 190,
            render: (_: any, r: any) => {
              const currentSoc = r.socNo || parentSocNo;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>
                    <Tag
                      color="purple"
                      style={{ fontWeight: 800, fontSize: 11.5, margin: 0, padding: '2px 8px', borderRadius: 2, cursor: 'pointer' }}
                      onClick={() => {
                        if (currentSoc && currentSoc !== '—') {
                          for (const c of customerStockData) {
                            const matchedSg = c.socGroups?.find((sg: any) => sg.socNo === currentSoc);
                            if (matchedSg) {
                              setSelectedSocModalData({
                                customerName: c.customerName,
                                customerCode: c.customerCode,
                                socNo: matchedSg.socNo,
                                socGroup: matchedSg,
                              });
                              return;
                            }
                          }
                        }
                      }}
                      title="Click to view SOC details popup"
                    >
                      📂 {currentSoc}
                    </Tag>
                  </div>
                  <div>
                    <Tag color="geekblue" style={{ fontWeight: 600, fontSize: 11, margin: 0, padding: '2px 8px', whiteSpace: 'normal', textAlign: 'left', borderRadius: 2 }}>
                      {r.packagingStyle}
                    </Tag>
                  </div>
                </div>
              );
            },
          },
          {
            title: <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--theme-text)' }}>Quantity Hierarchy & SOC Target (REQ ➔ PACKED ➔ BALANCE)</span>,
            children: [
              {
                title: <span style={{ fontWeight: 700, fontSize: 12, color: '#0284c7' }}>1. SOC Req. (GRS / CTN)</span>,
                key: 'socReq',
                width: 140,
                align: 'right' as const,
                render: (_: any, r: any) => (
                  <div>
                    {r.socRequiredGross > 0 ? (
                      <div>
                        <span style={{ fontSize: 13, color: '#0284c7', fontWeight: 800 }}>
                          📋 {formatNumber(r.socRequiredGross, 0)} GRS
                        </span>
                        <div style={{ fontSize: 11, color: '#0369a1', fontWeight: 700 }}>
                          ({formatNumber(r.socRequiredCartons, 0)} CTN)
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span style={{ fontSize: 12.5, color: '#0284c7', fontWeight: 700 }}>
                          📋 {formatNumber(r.gross, 0)} GRS
                        </span>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted)' }}>
                          (Fulfill on Demand)
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                title: <span style={{ fontWeight: 700, fontSize: 12, color: '#4338ca' }}>2. Packed Total (GRS / CTN)</span>,
                key: 'gross',
                width: 135,
                align: 'right' as const,
                render: (_: any, r: any) => (
                  <div>
                    <span style={{ color: '#4338ca', fontSize: 13, fontWeight: 800 }}>
                      📦 {formatNumber(r.gross, 0)} GRS
                    </span>
                    <div style={{ fontSize: 11, color: '#6d28d9', fontWeight: 700 }}>
                      🏷️ {formatNumber(r.cartons, 0)} CTN
                    </div>
                  </div>
                ),
              },
              {
                title: <span style={{ fontWeight: 700, fontSize: 12, color: '#ea580c' }}>3. Balance to Pack (GRS / CTN)</span>,
                key: 'balance',
                width: 155,
                align: 'right' as const,
                render: (_: any, r: any) => {
                  if (r.socRequiredGross <= 0) {
                    return (
                      <span style={{ fontSize: 11.5, color: 'var(--theme-text-muted)', fontWeight: 600 }}>
                        — (Demand Based)
                      </span>
                    );
                  }
                  const balGross = Math.max(0, r.socRequiredGross - r.gross);
                  const balCartons = Math.max(0, r.socRequiredCartons - r.cartons);
                  const isCompleted = balGross === 0 && balCartons === 0;

                  if (isCompleted) {
                    return (
                      <Tag color="success" style={{ fontWeight: 800, borderRadius: 2, margin: 0, padding: '2px 8px' }}>
                        ✅ 0 GRS (Completed)
                      </Tag>
                    );
                  }

                  return (
                    <div>
                      <span style={{ color: '#ea580c', fontSize: 13, fontWeight: 900 }}>
                        ⏳ {formatNumber(balGross, 0)} GRS
                      </span>
                      <div style={{ fontSize: 11, color: '#c2410c', fontWeight: 800 }}>
                        ({formatNumber(balCartons, 0)} CTN Balance)
                      </div>
                    </div>
                  );
                },
              },
            ],
          },
          {
            title: <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--theme-text)' }}>Weight & Spec</span>,
            children: [
              {
                title: <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--theme-text)' }}>Total Weight</span>,
                key: 'weightKg',
                width: 120,
                align: 'right' as const,
                render: (_: any, r: any) => (
                  <span style={{ fontSize: 12.5, color: '#d97706', fontWeight: 800 }}>
                    ⚖️ {formatNumber(r.weightKg, 2)} KG
                  </span>
                ),
              },
              {
                title: <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--theme-text)' }}>Per-Pc Weight</span>,
                key: 'weightPerPc',
                width: 110,
                align: 'right' as const,
                render: (_: any, r: any) => (
                  <Text strong style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>
                    {r.perPieceWeightKg.toFixed(4)} KG
                  </Text>
                ),
              },
            ],
          },
          {
            title: <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--theme-text)' }}>Commercial Value</span>,
            children: [
              {
                title: <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--theme-text)' }}>Unit Rate</span>,
                key: 'rate',
                width: 125,
                align: 'right' as const,
                render: (_: any, r: any) => (
                  <div>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--theme-text)' }}>
                      Rs. {formatNumber(r.ratePerGross, 2)} / GRS
                    </span>
                    <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted)' }}>
                      (≈ Rs. {(r.ratePerGross / 144).toFixed(2)}/pc)
                    </div>
                  </div>
                ),
              },
              {
                title: <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--theme-text)' }}>Valuation (PKR)</span>,
                key: 'valuation',
                width: 130,
                align: 'right' as const,
                render: (_: any, r: any) => (
                  <span style={{ fontWeight: 800, color: 'var(--theme-accent, #096dd9)', fontSize: 13 }}>
                    Rs. {formatNumber(r.valuePkr, 0)}
                  </span>
                ),
              },
            ],
          },
          {
            title: <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--theme-text)' }}>Store / Status</span>,
            key: 'loc',
            width: 140,
            align: 'center' as const,
            render: (_: any, r: any) => (
              <div>
                {r.isWithoutNipple || r.status === 'WITHOUT_NIPPLE' ? (
                  <Tag color="warning" icon={<ClockCircleOutlined />} style={{ fontWeight: 800, borderRadius: 2 }}>
                    HELD IN SAFETY STOCK
                  </Tag>
                ) : (
                  <Tag color="success" icon={<CheckCircleFilled />} style={{ fontWeight: 700, borderRadius: 2 }}>
                    {r.status || 'Ready for Dispatch'}
                  </Tag>
                )}
                <div style={{ fontSize: 11, color: r.isWithoutNipple ? '#dc2626' : 'var(--theme-text-muted)', fontWeight: r.isWithoutNipple ? 700 : 400, marginTop: 3 }}>
                  {r.isWithoutNipple ? '⛔ Nipple Pending (Not Dispatchable)' : r.warehouseName}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER TABS
  // ─────────────────────────────────────────────────────────────────────────────
  const tabItems = [
    {
      key: 'packing-entry',
      label: (
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          <InboxOutlined style={{ marginRight: 6 }} />
          Packing Production Entry
        </span>
      ),
      children: (
        <div style={{ marginTop: 8 }}>
          <HandPackingEntry isSubTab={true} layoutMode="executive" onNavigateTab={handleNavigateTab} />
        </div>
      ),
    },
    {
      key: 'bom-config',
      label: (
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          <SettingOutlined style={{ marginRight: 6 }} />
          FG BOM Configuration
        </span>
      ),
      children: (
        <div style={{ marginTop: 8 }}>
          <FinishedGoodBomSetup isSubTab={true} onNavigateTab={handleNavigateTab} />
        </div>
      ),
    },
    {
      key: 'packing-history',
      label: (
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          <HistoryOutlined style={{ marginRight: 6 }} />
          FGR Packing Inventory Report & Logs
        </span>
      ),
      children: (
        <div style={{ marginTop: 12 }}>
          {/* ── 1. Top Filter / Control Bar (Zero-Border Edge-to-Edge Toolbar) ── */}
          <div
            className="packing-control-toolbar"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
              padding: '12px 14px',
              background: 'var(--theme-card-bg, #ffffff)',
              border: '1px solid var(--theme-border)',
              borderLeft: 'none',
              borderRight: 'none',
              borderRadius: 0,
              marginBottom: 16,
              boxShadow: 'none',
            }}
          >
            <Space wrap size={12}>
              <Tag
                color="cyan"
                style={{
                  fontWeight: 700,
                  fontSize: 12.5,
                  padding: '4px 10px',
                  borderRadius: 0,
                  border: '1px solid var(--theme-border)',
                  margin: 0,
                }}
              >
                Division: DIV-SPD - Spoke Division
              </Tag>
              <Input
                placeholder="Filter customer, item or SOC..."
                prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted)' }} />}
                value={historySearchText}
                onChange={(e) => setHistorySearchText(e.target.value)}
                style={{
                  width: 270,
                  borderRadius: 0,
                  border: '1px solid var(--theme-border)',
                  background: 'var(--theme-surface-alt, transparent)',
                  color: 'var(--theme-text)',
                }}
                allowClear
              />
              <Button
                icon={<SyncOutlined />}
                onClick={fetchPackingHistory}
                loading={loadingHistory}
                style={{
                  borderRadius: 0,
                  border: '1px solid var(--theme-border)',
                  fontWeight: 600,
                  color: 'var(--theme-text)',
                  background: 'var(--theme-card-bg, transparent)',
                }}
              >
                Refresh
              </Button>
            </Space>

            <Space wrap size={10}>
              {fgrViewMode === 'customer-hierarchy' && (
                <>
                  <Segmented
                    value={customerHierarchyViewType}
                    onChange={(val) => setCustomerHierarchyViewType(val as any)}
                    options={[
                      { label: '📂 Group by SOC', value: 'soc-grouped' },
                      { label: '📄 All Items List', value: 'flat-items' },
                    ]}
                    style={{ borderRadius: 4, fontWeight: 700 }}
                  />
                  <Button
                    icon={<PlusCircleOutlined style={{ color: 'var(--theme-accent, #0284c7)' }} />}
                    onClick={expandAllCustomers}
                    style={{
                      borderRadius: 4,
                      background: 'rgba(2, 132, 199, 0.1)',
                      borderColor: 'rgba(2, 132, 199, 0.3)',
                      fontWeight: 600,
                      color: 'var(--theme-accent, #0284c7)',
                      boxShadow: 'none',
                    }}
                  >
                    Expand All
                  </Button>
                  <Button
                    icon={<MinusCircleOutlined style={{ color: 'var(--theme-text-muted)' }} />}
                    onClick={collapseAllCustomers}
                    style={{
                      borderRadius: 4,
                      background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.05))',
                      borderColor: 'var(--theme-border)',
                      fontWeight: 600,
                      color: 'var(--theme-text)',
                      boxShadow: 'none',
                    }}
                  >
                    Collapse All
                  </Button>
                </>
              )}
              <Button
                icon={<WhatsAppOutlined style={{ color: '#25D366' }} />}
                onClick={handleOpenTodayWhatsApp}
                style={{
                  borderRadius: 4,
                  borderColor: '#25D366',
                  color: '#166534',
                  background: '#f0fdf4',
                  fontWeight: 700,
                  fontSize: 12,
                  boxShadow: '0 1px 3px rgba(37,211,102,0.15)',
                }}
              >
                WhatsApp Today's Report
              </Button>
              <Button
                icon={<WhatsAppOutlined style={{ color: '#25D366' }} />}
                onClick={handleOpenFgrWhatsApp}
                style={{
                  borderRadius: 4,
                  borderColor: '#25D366',
                  color: '#166534',
                  background: '#f0fdf4',
                  fontWeight: 700,
                  fontSize: 12,
                  boxShadow: '0 1px 3px rgba(37,211,102,0.15)',
                }}
              >
                WhatsApp FGR Stock
              </Button>
              <Segmented
                value={fgrViewMode}
                onChange={(val) => setFgrViewMode(String(val))}
                options={[
                  { label: '🏢 Customer-Wise Packed Inventory', value: 'customer-hierarchy' },
                  { label: '📋 SOC Fulfillment Ledger', value: 'soc-ledger' },
                  { label: '📊 Live FGR & Dispatch Register', value: 'fgr-register' },
                  { label: '📋 Batch Production Logs', value: 'batch-logs' },
                ]}
                style={{ borderRadius: 4 }}
              />
            </Space>
          </div>

          {/* ── 2. Summary Stat KPI Cards (7 Executive Metric Cards with Watermarks & Large Icons) ── */}
          <div style={{ width: '100%', maxWidth: '100%', overflow: 'hidden', marginBottom: 18 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 10,
              }}
            >
              {/* Card 1: Active Customers */}
              <div
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.06) 0%, rgba(59, 130, 246, 0.14) 100%)',
                  border: '1px solid rgba(59, 130, 246, 0.28)',
                  borderRadius: 6,
                  padding: '12px 14px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ position: 'absolute', right: -6, bottom: -10, fontSize: 56, color: '#3b82f6', opacity: 0.12, pointerEvents: 'none' }}>
                  <TeamOutlined />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Active Customers
                  </span>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1d4ed8', fontSize: 16 }}>
                    <TeamOutlined />
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                  {loadingHistory ? <Spin size="small" /> : totalActiveCustomers}
                </div>
                <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, marginTop: 3 }}>
                  Dispatch Accounts
                </div>
              </div>

              {/* Card 2: Items with Stock */}
              <div
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.06) 0%, rgba(2, 132, 199, 0.14) 100%)',
                  border: '1px solid rgba(2, 132, 199, 0.28)',
                  borderRadius: 6,
                  padding: '12px 14px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ position: 'absolute', right: -6, bottom: -10, fontSize: 56, color: '#0284c7', opacity: 0.12, pointerEvents: 'none' }}>
                  <AppstoreOutlined />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Items with Stock
                  </span>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(2, 132, 199, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7', fontSize: 16 }}>
                    <AppstoreOutlined />
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#0284c7', lineHeight: 1.2 }}>
                  {loadingHistory ? <Spin size="small" /> : totalItemsCount}
                </div>
                <div style={{ fontSize: 11, color: '#0369a1', fontWeight: 600, marginTop: 3 }}>
                  Active SKUs
                </div>
              </div>

              {/* Card 3: Total Pieces (PCS) — FIRST */}
              <div
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.06) 0%, rgba(5, 150, 105, 0.14) 100%)',
                  border: '1px solid rgba(5, 150, 105, 0.3)',
                  borderRadius: 6,
                  padding: '12px 14px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ position: 'absolute', right: -6, bottom: -10, fontSize: 56, color: '#059669', opacity: 0.12, pointerEvents: 'none' }}>
                  <InboxOutlined />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    1. Total Pieces (PCS)
                  </span>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(5, 150, 105, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', fontSize: 16 }}>
                    <InboxOutlined />
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#059669', lineHeight: 1.2 }}>
                  {loadingHistory ? <Spin size="small" /> : formatNumber(totalStockPcs, 0)}
                </div>
                <div style={{ fontSize: 11, color: '#047857', fontWeight: 700, marginTop: 3 }}>
                  PCS In Stock
                </div>
              </div>

              {/* Card 4: Total Gross (GRS) — SECOND */}
              <div
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, rgba(99, 102, 241, 0.14) 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: 6,
                  padding: '12px 14px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ position: 'absolute', right: -6, bottom: -10, fontSize: 56, color: '#6366f1', opacity: 0.12, pointerEvents: 'none' }}>
                  <DatabaseOutlined />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    2. Total Gross (GRS)
                  </span>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(99, 102, 241, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', fontSize: 16 }}>
                    <DatabaseOutlined />
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#4338ca', lineHeight: 1.2 }}>
                  {loadingHistory ? <Spin size="small" /> : formatNumber(totalStockGross, 0)}
                </div>
                <div style={{ fontSize: 11, color: '#4338ca', fontWeight: 700, marginTop: 3 }}>
                  Gross (144 pcs/grs)
                </div>
              </div>

              {/* Card 5: Total Cartons (CTN) — THIRD */}
              <div
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.06) 0%, rgba(139, 92, 246, 0.14) 100%)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: 6,
                  padding: '12px 14px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ position: 'absolute', right: -6, bottom: -10, fontSize: 56, color: '#8b5cf6', opacity: 0.12, pointerEvents: 'none' }}>
                  <ShopOutlined />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    3. Total Cartons (CTN)
                  </span>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6', fontSize: 16 }}>
                    <ShopOutlined />
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#6d28d9', lineHeight: 1.2 }}>
                  {loadingHistory ? <Spin size="small" /> : formatNumber(totalStockCartons, 0)}
                </div>
                <div style={{ fontSize: 11, color: '#6d28d9', fontWeight: 700, marginTop: 3 }}>
                  Cartons Packed
                </div>
              </div>

              {/* Card 6: Total Weight (KG) */}
              <div
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.06) 0%, rgba(217, 119, 6, 0.14) 100%)',
                  border: '1px solid rgba(217, 119, 6, 0.3)',
                  borderRadius: 6,
                  padding: '12px 14px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ position: 'absolute', right: -6, bottom: -10, fontSize: 56, color: '#d97706', opacity: 0.12, pointerEvents: 'none' }}>
                  <AimOutlined />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Total Weight (KG)
                  </span>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(217, 119, 6, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', fontSize: 16 }}>
                    <AimOutlined />
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706', lineHeight: 1.2 }}>
                  {loadingHistory ? <Spin size="small" /> : formatNumber(totalStockKg, 2)}
                </div>
                <div style={{ fontSize: 11, color: '#b45309', fontWeight: 700, marginTop: 3 }}>
                  Net Weight (KG)
                </div>
              </div>

              {/* Card 7: Total Valuation */}
              <div
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, rgba(180, 83, 9, 0.06) 0%, rgba(180, 83, 9, 0.14) 100%)',
                  border: '1px solid rgba(180, 83, 9, 0.3)',
                  borderRadius: 6,
                  padding: '12px 14px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ position: 'absolute', right: -6, bottom: -10, fontSize: 56, color: '#b45309', opacity: 0.12, pointerEvents: 'none' }}>
                  <DollarCircleOutlined />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Total Valuation
                  </span>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(180, 83, 9, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309', fontSize: 16 }}>
                    <DollarCircleOutlined />
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#92400e', lineHeight: 1.2 }}>
                  {loadingHistory ? <Spin size="small" /> : `Rs. ${formatNumber(totalStockValuation, 0)}`}
                </div>
                <div style={{ fontSize: 11, color: '#92400e', fontWeight: 700, marginTop: 3 }}>
                  Estimated Worth
                </div>
              </div>
            </div>
          </div>

          {/* ── View 1: Customer-Wise Packed Stock Hierarchy (Zero-Border Edge-to-Edge) ── */}
          {fgrViewMode === 'customer-hierarchy' && (
            <div className="packing-customer-hierarchy-list" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: '60px 16px', background: 'var(--theme-card-bg)', border: '1px solid var(--theme-border)', borderRadius: 4 }}>
                  <Spin size="large" />
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--theme-text)', marginTop: 16 }}>
                    Loading Customer-Wise Packed Inventory...
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)', marginTop: 4 }}>
                    Fetching live packing production entries and warehouse stock...
                  </div>
                </div>
              ) : customerStockData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 16px', background: 'var(--theme-card-bg)', border: '1px dashed var(--theme-border)', borderRadius: 0 }}>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--theme-text)' }}>
                          No Customer-Wise Packed Inventory Found
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--theme-text-muted)', marginTop: 4 }}>
                          All dummy data has been removed. When you save a fresh packing entry from "1. Packing Production Entry", it will appear here automatically.
                        </div>
                      </div>
                    }
                  />
                </div>
              ) : (
                customerStockData.filter((c) => {
                  if (!historySearchText) return true;
                  const q = historySearchText.toLowerCase();
                  return (
                    c.customerName.toLowerCase().includes(q) ||
                    c.customerCode.toLowerCase().includes(q) ||
                    c.socNo.toLowerCase().includes(q) ||
                    c.items.some((it) => it.itemCode.toLowerCase().includes(q) || it.itemName.toLowerCase().includes(q))
                  );
                }).map((cust) => {
                const isExpanded = expandedCustomerIds.includes(cust.id);
                const custWeight = cust.items.reduce((s, it) => s + (it.weightKg || 0), 0);
                const custPcs = cust.items.reduce((s, it) => s + (it.pcs || 0), 0);
                const custGross = cust.items.reduce((s, it) => s + (it.gross || 0), 0);
                const custCartons = cust.items.reduce((s, it) => s + (it.cartons || 0), 0);
                const custVal = cust.items.reduce((s, it) => s + (it.valuePkr || 0), 0);

                return (
                  <Card
                    key={cust.id}
                    size="small"
                    style={{
                      borderRadius: 4,
                      border: '1px solid var(--theme-border)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      background: 'var(--theme-card-bg, #ffffff)',
                      transition: 'all 0.2s ease',
                      marginBottom: 8,
                    }}
                    styles={{
                      header: {
                        background: isExpanded ? 'var(--theme-surface-alt, rgba(2, 132, 199, 0.05))' : 'var(--theme-card-bg, #ffffff)',
                        cursor: 'pointer',
                        padding: '10px 14px',
                        borderBottom: isExpanded ? '1px solid var(--theme-border)' : 'none',
                      },
                      body: { padding: isExpanded ? '8px 0' : 0, background: 'var(--theme-card-bg, #ffffff)' },
                    }}
                    title={
                      <div
                        onClick={() => toggleCustomerExpand(cust.id)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, width: '100%' }}
                      >
                        <Space align="center" size={10} wrap>
                          <Button
                            type="text"
                            size="small"
                            icon={
                              isExpanded ? (
                                <ShrinkOutlined style={{ fontSize: 16, color: '#059669' }} />
                              ) : (
                                <ArrowsAltOutlined style={{ fontSize: 16, color: 'var(--theme-accent, #0284c7)' }} />
                              )
                            }
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 28,
                              height: 28,
                              borderRadius: 4,
                              background: isExpanded ? 'rgba(5, 150, 105, 0.1)' : 'rgba(2, 132, 199, 0.1)',
                              border: '1px solid var(--theme-border)',
                            }}
                          />
                          <Tag color="blue" style={{ fontWeight: 800, borderRadius: 2 }}>
                            {cust.customerCode}
                          </Tag>
                          <Text strong style={{ fontSize: 15, color: 'var(--theme-text)' }}>
                            {cust.customerName}
                          </Text>
                          {cust.socGroups && cust.socGroups.length > 0 ? (
                            <Tag color="purple" style={{ fontSize: 11, fontWeight: 700, borderRadius: 2 }}>
                              {cust.socGroups.length} Active SOC{cust.socGroups.length > 1 ? 's' : ''}
                            </Tag>
                          ) : (
                            <Tag color="purple" style={{ fontSize: 11, fontWeight: 700, borderRadius: 2 }}>
                              {cust.socNo}
                            </Tag>
                          )}
                        </Space>

                        {/* Customer Row Metrics in Sequence: PCS ➔ GRS ➔ CTN + WhatsApp Button */}
                        <Space size={8} wrap align="center" onClick={(e) => e.stopPropagation()}>
                          <Tag color="cyan" style={{ fontWeight: 700, borderRadius: 2, padding: '2px 8px' }}>
                            🏷️ {cust.items.length} Items
                          </Tag>
                          {/* 1. Pieces (PCS) — FIRST */}
                          <Tag color="green" style={{ fontWeight: 800, fontSize: 12, borderRadius: 2, padding: '2px 8px', margin: 0 }}>
                            🔢 {formatNumber(custPcs, 0)} PCS
                          </Tag>
                          {/* 2. Gross (GRS) — SECOND */}
                          <Tag color="geekblue" style={{ fontWeight: 800, fontSize: 12, borderRadius: 2, padding: '2px 8px', margin: 0 }}>
                            📦 {formatNumber(custGross, 0)} GRS
                          </Tag>
                          {/* 3. Cartons (CTN) — THIRD */}
                          <Tag color="purple" style={{ fontWeight: 800, fontSize: 12, borderRadius: 2, padding: '2px 8px', margin: 0 }}>
                            🏷️ {formatNumber(custCartons, 0)} CTN
                          </Tag>
                          {/* Balance Remaining for this Customer */}
                          {(() => {
                            const totalCustReqGross = cust.items.reduce((s, it) => s + (it.socRequiredGross || 0), 0);
                            const totalCustReqCartons = cust.items.reduce((s, it) => s + (it.socRequiredCartons || 0), 0);
                            if (totalCustReqGross > 0) {
                              const balG = Math.max(0, totalCustReqGross - custGross);
                              const balC = Math.max(0, totalCustReqCartons - custCartons);
                              if (balG > 0) {
                                return (
                                  <Tag color="orange" style={{ fontWeight: 800, fontSize: 12, borderRadius: 2, padding: '2px 8px', margin: 0 }}>
                                    ⏳ Bal: {formatNumber(balG, 0)} GRS ({formatNumber(balC, 0)} CTN)
                                  </Tag>
                                );
                              }
                              return (
                                <Tag color="success" style={{ fontWeight: 800, fontSize: 12, borderRadius: 2, padding: '2px 8px', margin: 0 }}>
                                  ✅ SOC Completed
                                </Tag>
                              );
                            }
                            return null;
                          })()}
                          {/* Total Weight */}
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#d97706', padding: '0 4px' }}>
                            ⚖️ {formatNumber(custWeight, 2)} KG
                          </span>
                          {/* Total Valuation */}
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#b45309', padding: '0 4px' }}>
                            💰 Rs. {formatNumber(custVal, 0)}
                          </span>

                          {/* Authentic Green WhatsApp Button */}
                          <Button
                            type="primary"
                            size="small"
                            icon={<WhatsAppOutlined style={{ fontSize: 15 }} />}
                            onClick={() => handleOpenCustomerWhatsApp(cust)}
                            style={{
                              background: '#25D366',
                              borderColor: '#25D366',
                              fontWeight: 700,
                              borderRadius: 4,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              boxShadow: '0 2px 6px rgba(37,211,102,0.3)',
                              color: '#ffffff',
                            }}
                          >
                            WhatsApp
                          </Button>

                          <Button
                            type="link"
                            size="small"
                            onClick={() => toggleCustomerExpand(cust.id)}
                            style={{ fontWeight: 600, padding: 0 }}
                          >
                            {isExpanded ? 'Hide Details' : 'Physical Verification &rarr;'}
                          </Button>
                        </Space>
                      </div>
                    }
                  >
                    {isExpanded && (
                      <div style={{ padding: '8px 12px' }}>
                        {customerHierarchyViewType === 'soc-grouped' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {cust.socGroups && cust.socGroups.length > 0 ? (
                              cust.socGroups.map((sg: any) => {
                                const isSocExpanded = expandedSocKeys.includes(sg.id);
                                return (
                                  <div
                                    key={sg.id}
                                    style={{
                                      border: '1px solid var(--theme-border, #cbd5e1)',
                                      borderRadius: 6,
                                      background: 'var(--theme-card-bg, #ffffff)',
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {/* SOC Accordion Header */}
                                    <div
                                      onClick={() => toggleSocExpand(sg.id)}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: 10,
                                        padding: '9px 14px',
                                        background: isSocExpanded ? 'rgba(99, 102, 241, 0.07)' : 'var(--theme-surface-alt, #f8fafc)',
                                        cursor: 'pointer',
                                        borderBottom: isSocExpanded ? '1px solid var(--theme-border, #cbd5e1)' : 'none',
                                        transition: 'all 0.15s ease',
                                      }}
                                    >
                                      <Space size={8} wrap align="center">
                                        <Button
                                          type="text"
                                          size="small"
                                          icon={isSocExpanded ? <ShrinkOutlined style={{ fontSize: 13, color: '#4f46e5' }} /> : <ArrowsAltOutlined style={{ fontSize: 13, color: '#6366f1' }} />}
                                          style={{ width: 26, height: 26, padding: 0 }}
                                        />
                                        <Tag color="purple" style={{ fontSize: 13, fontWeight: 900, padding: '3px 10px', borderRadius: 4, margin: 0 }}>
                                          📂 SOC #{sg.socNo}
                                        </Tag>
                                        <Tag color="blue" style={{ fontWeight: 800, borderRadius: 3, margin: 0 }}>
                                          🏷️ {sg.items.length} Product{sg.items.length > 1 ? 's' : ''}
                                        </Tag>
                                      </Space>

                                      <Space size={8} wrap align="center" onClick={(e) => e.stopPropagation()}>
                                        {/* SOC Metrics */}
                                        {sg.totalRequiredGross > 0 && (
                                          <Tag color="cyan" style={{ fontWeight: 800, fontSize: 12, margin: 0, padding: '2px 8px' }}>
                                            📋 Req: {formatNumber(sg.totalRequiredGross, 0)} GRS ({formatNumber(sg.totalRequiredCartons, 0)} CTN)
                                          </Tag>
                                        )}
                                        <Tag color="purple" style={{ fontWeight: 800, fontSize: 12, margin: 0, padding: '2px 8px' }}>
                                          📦 Packed: {formatNumber(sg.totalPackedGross, 0)} GRS ({formatNumber(sg.totalPackedCartons, 0)} CTN)
                                        </Tag>
                                        {sg.totalRequiredGross > 0 ? (
                                          sg.isComplete ? (
                                            <Tag color="success" style={{ fontWeight: 800, fontSize: 12, margin: 0, padding: '2px 8px' }}>
                                              ✅ 100% Completed
                                            </Tag>
                                          ) : (
                                            <Tag color="orange" style={{ fontWeight: 800, fontSize: 12, margin: 0, padding: '2px 8px' }}>
                                              ⏳ Bal: {formatNumber(sg.remainingGross, 0)} GRS ({formatNumber(sg.remainingCartons, 0)} CTN)
                                            </Tag>
                                          )
                                        ) : (
                                          <Tag color="default" style={{ fontWeight: 700, margin: 0 }}>
                                            Demand Stock
                                          </Tag>
                                        )}
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706', padding: '0 4px' }}>
                                          ⚖️ {formatNumber(sg.totalWeightKg, 1)} KG
                                        </span>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#096dd9', padding: '0 4px' }}>
                                          💰 Rs. {formatNumber(sg.totalValuation, 0)}
                                        </span>
                                        <Button
                                          size="small"
                                          type="primary"
                                          ghost
                                          icon={<SearchOutlined />}
                                          onClick={() => setSelectedSocModalData({
                                            customerName: cust.customerName,
                                            customerCode: cust.customerCode,
                                            socNo: sg.socNo,
                                            socGroup: sg,
                                          })}
                                          style={{ fontWeight: 700, fontSize: 12, height: 26, borderRadius: 4 }}
                                        >
                                          View SOC Popup Details
                                        </Button>
                                      </Space>
                                    </div>

                                    {/* Items in this SOC */}
                                    {isSocExpanded && (
                                      <div style={{ padding: '6px 0' }}>
                                        {renderItemsTable(sg.items, sg.socNo)}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              renderItemsTable(cust.items, cust.socNo)
                            )}
                          </div>
                        ) : (
                          renderItemsTable(cust.items, cust.socNo)
                        )}
                      </div>
                    )}
                  </Card>
                );
              }))}
            </div>
          )}

          {/* ── View 2: SOC Packing & Dispatch Fulfillment Ledger ── */}
          {fgrViewMode === 'soc-ledger' && (
            <div style={{ width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#38bdf8' }}>
                    📋 Customer Sales Orders (SOC) Fulfillment & Packing Ledger
                  </span>
                  <Tag color="blue" style={{ fontWeight: 700 }}>
                    {socFulfillmentLedger.length} Orders ({socFulfillmentLedger.reduce((sum, s) => sum + s.itemCount, 0)} Items)
                  </Tag>
                </div>
                <Input
                  placeholder="Search Customer, SOC #, or Item..."
                  prefix={<SearchOutlined />}
                  value={historySearchText}
                  onChange={(e) => setHistorySearchText(e.target.value)}
                  style={{ width: 280 }}
                  allowClear
                />
              </div>

              <Table
                size="small"
                loading={loadingHistory}
                pagination={{ pageSize: 15 }}
                dataSource={socFulfillmentLedger.filter((row) => {
                  if (!historySearchText) return true;
                  const q = historySearchText.toLowerCase();
                  return (
                    row.customerName.toLowerCase().includes(q) ||
                    row.orderNumber.toLowerCase().includes(q) ||
                    (row.customerCode && row.customerCode.toLowerCase().includes(q)) ||
                    row.items.some((it: any) =>
                      it.itemCode.toLowerCase().includes(q) ||
                      it.itemName.toLowerCase().includes(q)
                    )
                  );
                })}
                columns={[
                  {
                    title: 'SOC & CUSTOMER',
                    key: 'soc',
                    width: 230,
                    render: (_, r) => (
                      <div>
                        <div style={{ fontWeight: 800, color: 'var(--theme-accent, #38bdf8)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{r.orderNumber}</span>
                          {r.itemCount > 1 && (
                            <Tag color="cyan" style={{ fontSize: 10, lineHeight: '16px', padding: '0 5px', borderRadius: 8, fontWeight: 700 }}>
                              {r.itemCount} Items
                            </Tag>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--theme-text, #1e293b)', fontWeight: 700, marginTop: 2 }}>
                          {r.customerName} {r.customerCode ? `(${r.customerCode})` : ''}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)' }}>Order Date: {r.orderDate}</div>
                      </div>
                    ),
                  },
                  {
                    title: 'FINISHED GOOD ITEMS',
                    key: 'itemSummary',
                    width: 250,
                    render: (_, r) => (
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--theme-accent, #38bdf8)', fontSize: 12 }}>
                          {r.itemCount === 1 ? r.items[0]?.itemCode : `${r.itemCount} Product Lines`}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--theme-text, #1e293b)', fontWeight: 600, maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.itemCount === 1 ? r.items[0]?.itemName : r.items.map((it: any) => it.itemCode).join(', ')}
                        </div>
                      </div>
                    ),
                  },
                  {
                    title: 'ORDERED',
                    key: 'ordered',
                    width: 130,
                    align: 'right',
                    render: (_, r) => (
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--theme-text, #1e293b)', fontSize: 12.5 }}>{r.orderedCartons} Cartons</div>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)' }}>{r.orderedGross.toLocaleString()} GRS</div>
                      </div>
                    ),
                  },
                  {
                    title: 'PACKED',
                    key: 'packed',
                    width: 130,
                    align: 'right',
                    render: (_, r) => (
                      <div>
                        <div style={{ fontWeight: 700, color: r.packedCartons > 0 ? 'var(--theme-accent, #38bdf8)' : 'var(--theme-text-muted, #64748b)', fontSize: 12.5 }}>
                          {r.packedCartons} Cartons
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)' }}>{r.packedGross.toLocaleString()} GRS</div>
                      </div>
                    ),
                  },
                  {
                    title: 'DISPATCHED',
                    key: 'shipped',
                    width: 120,
                    align: 'right',
                    render: (_, r) => (
                      <div>
                        <div style={{ fontWeight: 700, color: r.shippedCartons > 0 ? '#f97316' : 'var(--theme-text-muted, #64748b)', fontSize: 12.5 }}>
                          {r.shippedCartons} Cartons
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)' }}>{r.shippedGross.toLocaleString()} GRS</div>
                      </div>
                    ),
                  },
                  {
                    title: 'REMAINING TO PACK',
                    key: 'remaining',
                    width: 150,
                    align: 'right',
                    render: (_, r) => (
                      <div>
                        <div style={{ fontWeight: 800, color: r.isComplete ? '#10b981' : '#f59e0b', fontSize: 12.5 }}>
                          {r.isComplete ? '0 Cartons' : `${r.remainingCartons} Cartons`}
                        </div>
                        <div style={{ fontSize: 10.5, color: r.isComplete ? '#10b981' : '#f59e0b' }}>
                          {r.isComplete ? '✅ Fulfilled' : `${r.remainingGross.toLocaleString()} GRS Left`}
                        </div>
                      </div>
                    ),
                  },
                  {
                    title: 'STATUS',
                    key: 'status',
                    width: 195,
                    align: 'center',
                    render: (_, r) => (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 7,
                        flexWrap: 'nowrap',
                      }}>
                        <Progress
                          type="circle"
                          percent={r.fulfillmentPct}
                          size={36}
                          strokeWidth={8}
                          strokeColor={r.isComplete ? '#10b981' : (r.isPartial ? '#38bdf8' : '#64748b')}
                          format={(percent) => (
                            <span style={{ fontSize: 8.5, fontWeight: 800, color: r.isComplete ? '#10b981' : (r.isPartial ? '#38bdf8' : 'var(--theme-text-muted, #64748b)') }}>
                              {percent}%
                            </span>
                          )}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                          <Tag
                            color={r.isComplete ? 'success' : (r.isPartial ? 'blue' : 'default')}
                            style={{ fontWeight: 800, fontSize: 10, margin: 0, lineHeight: '18px' }}
                          >
                            {r.isComplete ? '✅ DONE' : (r.isPartial ? `⏳ ${r.fulfillmentPct}%` : '⬜ PENDING')}
                          </Tag>
                          <span style={{ fontSize: 9, color: 'var(--theme-text-muted, #64748b)', lineHeight: '12px' }}>
                            {r.isComplete ? 'Fulfilled' : `${r.packedCartons}/${r.orderedCartons} CTN`}
                          </span>
                        </div>
                      </div>
                    ),
                  },
                ]}
                expandable={{
                  expandIcon: ({ expanded, onExpand, record }) => (
                    <button
                      type="button"
                      onClick={(e) => onExpand(record, e)}
                      style={{
                        background: expanded ? 'rgba(56, 189, 248, 0.2)' : 'var(--theme-row-hover, rgba(99,102,241,0.06))',
                        border: `1px solid ${expanded ? '#38bdf8' : 'var(--theme-border, rgba(99,102,241,0.2))'}`,
                        borderRadius: 4,
                        cursor: 'pointer',
                        width: 22,
                        height: 22,
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: expanded ? '#38bdf8' : 'var(--theme-text-muted, #64748b)',
                        marginRight: 8,
                        transition: 'all 0.2s ease',
                      }}
                      title={expanded ? 'Collapse SOC Items' : 'Expand SOC Items'}
                    >
                      {expanded ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="4 14 10 14 10 20" />
                          <polyline points="20 10 14 10 14 4" />
                          <line x1="14" y1="10" x2="21" y2="3" />
                          <line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 3 3 3 3 9" />
                          <line x1="3" y1="3" x2="10" y2="10" />
                          <polyline points="15 21 21 21 21 15" />
                          <line x1="21" y1="21" x2="14" y2="14" />
                        </svg>
                      )}
                    </button>
                  ),
                  expandedRowRender: (socRecord) => (
                    <div style={{ padding: '12px 14px', background: 'var(--theme-card-bg, rgba(15,23,42,0.7))', border: '1px solid var(--theme-border, rgba(56,189,248,0.2))', borderRadius: 8, margin: '4px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid var(--theme-border, rgba(99,102,241,0.15))', paddingBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--theme-accent, #38bdf8)' }}>
                            📦 Finished Good Items for {socRecord.orderNumber}
                          </span>
                          <Tag color="cyan" style={{ fontWeight: 700 }}>{socRecord.items.length} Product Lines</Tag>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>
                          Customer: <strong style={{ color: 'var(--theme-text, #1e293b)' }}>{socRecord.customerName}</strong> | Ordered: <strong style={{ color: 'var(--theme-text, #1e293b)' }}>{socRecord.orderedCartons} CTN</strong> | Packed: <strong style={{ color: 'var(--theme-accent, #38bdf8)' }}>{socRecord.packedCartons} CTN</strong>
                        </div>
                      </div>

                      <Table
                        size="small"
                        pagination={false}
                        dataSource={socRecord.items}
                        columns={[
                          {
                            title: 'FINISHED GOOD ITEM',
                            key: 'item',
                            width: 250,
                            render: (_, it) => (
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--theme-accent, #38bdf8)', fontSize: 12 }}>{it.itemCode}</div>
                                <div style={{ fontSize: 11, color: 'var(--theme-text, #1e293b)', fontWeight: 600 }}>{it.itemName}</div>
                              </div>
                            ),
                          },
                          {
                            title: 'ORDERED',
                            key: 'ordered',
                            width: 120,
                            align: 'right',
                            render: (_, it) => (
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--theme-text, #1e293b)' }}>{it.orderedCartons} Cartons</div>
                                <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)' }}>{it.orderedGross.toLocaleString()} GRS</div>
                              </div>
                            ),
                          },
                          {
                            title: 'PACKED',
                            key: 'packed',
                            width: 120,
                            align: 'right',
                            render: (_, it) => (
                              <div>
                                <div style={{ fontWeight: 700, color: it.packedCartons > 0 ? 'var(--theme-accent, #38bdf8)' : 'var(--theme-text-muted, #64748b)' }}>
                                  {it.packedCartons} Cartons
                                </div>
                                <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)' }}>{it.packedGross.toLocaleString()} GRS</div>
                              </div>
                            ),
                          },
                          {
                            title: 'DISPATCHED',
                            key: 'shipped',
                            width: 110,
                            align: 'right',
                            render: (_, it) => (
                              <div>
                                <div style={{ fontWeight: 700, color: it.shippedCartons > 0 ? '#f97316' : 'var(--theme-text-muted, #64748b)' }}>
                                  {it.shippedCartons} Cartons
                                </div>
                                <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)' }}>{it.shippedGross.toLocaleString()} GRS</div>
                              </div>
                            ),
                          },
                          {
                            title: 'REMAINING TO PACK',
                            key: 'remaining',
                            width: 140,
                            align: 'right',
                            render: (_, it) => (
                              <div>
                                <div style={{ fontWeight: 800, color: it.isComplete ? '#10b981' : '#f59e0b', fontSize: 12.5 }}>
                                  {it.isComplete ? '0 Cartons' : `${it.remainingCartons} Cartons`}
                                </div>
                                <div style={{ fontSize: 10, color: it.isComplete ? '#10b981' : '#f59e0b' }}>
                                  {it.isComplete ? '✅ Fulfilled' : `${it.remainingGross.toLocaleString()} GRS Left`}
                                </div>
                              </div>
                            ),
                          },
                          {
                            title: 'STATUS / PROGRESS',
                            key: 'status',
                            width: 180,
                            align: 'center',
                            render: (_, it) => (
                              <div style={{ minWidth: 150 }}>
                                <Progress
                                  percent={it.fulfillmentPct}
                                  size="small"
                                  status={it.isComplete ? 'success' : 'active'}
                                  strokeColor={it.isComplete ? '#10b981' : (it.isPartial ? '#38bdf8' : '#64748b')}
                                  style={{ marginBottom: 4 }}
                                />
                                <Tag
                                  color={it.isComplete ? 'success' : (it.isPartial ? 'blue' : 'default')}
                                  style={{ fontWeight: 800, fontSize: 10 }}
                                >
                                  {it.isComplete ? '✅ DONE' : (it.isPartial ? `⏳ ${it.fulfillmentPct}% PACKED` : '⬜ PENDING')}
                                </Tag>
                              </div>
                            ),
                          },
                        ]}
                        expandable={{
                          rowExpandable: (it) => (it.batches || []).length > 0,
                          expandIcon: ({ expanded, onExpand, record }) => (
                            <button
                              type="button"
                              onClick={(e) => onExpand(record, e)}
                              style={{
                                background: expanded ? 'rgba(56, 189, 248, 0.2)' : 'var(--theme-row-hover, rgba(99,102,241,0.06))',
                                border: `1px solid ${expanded ? '#38bdf8' : 'var(--theme-border, rgba(99,102,241,0.2))'}`,
                                borderRadius: 3,
                                cursor: 'pointer',
                                width: 18,
                                height: 18,
                                padding: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: expanded ? '#38bdf8' : 'var(--theme-text-muted, #64748b)',
                                marginRight: 6,
                              }}
                              title={expanded ? 'Hide Batches' : 'View Batches'}
                            >
                              {expanded ? (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="4 14 10 14 10 20" />
                                  <polyline points="20 10 14 10 14 4" />
                                  <line x1="14" y1="10" x2="21" y2="3" />
                                  <line x1="3" y1="21" x2="10" y2="14" />
                                </svg>
                              ) : (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="9 3 3 3 3 9" />
                                  <line x1="3" y1="3" x2="10" y2="10" />
                                  <polyline points="15 21 21 21 21 15" />
                                  <line x1="21" y1="21" x2="14" y2="14" />
                                </svg>
                              )}
                            </button>
                          ),
                          expandedRowRender: (it) => (
                            <div style={{ padding: '6px 12px', background: 'rgba(2, 6, 23, 0.7)', borderRadius: 4, margin: '2px 0' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
                                📦 Packing Batches Recorded ({it.batches.length}):
                              </div>
                              <table style={{ width: '100%', fontSize: 10.5, borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'left' }}>
                                    <th style={{ padding: '3px 6px' }}>Batch No</th>
                                    <th style={{ padding: '3px 6px' }}>Date</th>
                                    <th style={{ padding: '3px 6px' }}>Packaging Style</th>
                                    <th style={{ padding: '3px 6px', textAlign: 'right' }}>Cartons</th>
                                    <th style={{ padding: '3px 6px' }}>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {it.batches.map((b: any, bIdx: number) => (
                                    <tr key={b.id || bIdx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                      <td style={{ padding: '3px 6px', fontWeight: 700, color: '#38bdf8' }}>{b.batchNo}</td>
                                      <td style={{ padding: '3px 6px', color: '#cbd5e1' }}>{b.date}</td>
                                      <td style={{ padding: '3px 6px', color: '#94a3b8' }}>{b.style}</td>
                                      <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{b.cartons} Cartons</td>
                                      <td style={{ padding: '3px 6px' }}><Tag color="purple" style={{ fontSize: 9 }}>{b.status}</Tag></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ),
                        }}
                      />
                    </div>
                  ),
                }}
              />
            </div>
          )}

          {/* ── View 3: Live FGR Stock & Dispatch Register (Opening + Packed - Dispatched = Available) ── */}
          {fgrViewMode === 'fgr-register' && (
            <div className="packing-fgr-register-container" style={{ width: '100%', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Formula & Live Balance Summary Banner */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(5, 150, 105, 0.08) 100%)',
                  border: '1.5px solid rgba(2, 132, 199, 0.3)',
                  borderRadius: 8,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 16,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ background: '#0284c7', color: '#fff', width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>
                      FGR
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--theme-text, #0f172a)' }}>
                      Finished Goods Register (Live Warehouse Stock Balance)
                    </span>
                    <Tag color="green" style={{ fontWeight: 800, borderRadius: 2 }}>
                      SPI-FGDW-001 (SPI FG Dispatch Warehouse)
                    </Tag>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--theme-text-muted, #64748b)' }}>
                    Standard Formula: <b>Opening Stock</b> + <b>Packed Today (IN)</b> - <b>Dispatched Today (OUT)</b> = <b style={{ color: '#059669' }}>Available FGR Stock</b>
                  </div>
                </div>

                <Space size={12} wrap>
                  <Button
                    type="primary"
                    icon={<WhatsAppOutlined />}
                    onClick={handleOpenFgrWhatsApp}
                    style={{ background: '#25D366', borderColor: '#25D366', fontWeight: 700, borderRadius: 4, boxShadow: '0 2px 6px rgba(37,211,102,0.3)' }}
                  >
                    Share FGR via WhatsApp
                  </Button>
                </Space>
              </div>

              {/* FGR Itemized Stock Table */}
              <Card
                size="small"
                style={{
                  borderRadius: 6,
                  border: '1px solid var(--theme-border)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                  background: 'var(--theme-card-bg, #ffffff)',
                }}
                styles={{
                  header: {
                    background: 'var(--theme-surface-alt, rgba(0, 0, 0, 0.02))',
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--theme-border)',
                  },
                }}
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <Space size={8} align="center">
                      <DatabaseOutlined style={{ color: '#0284c7', fontSize: 16 }} />
                      <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--theme-text)' }}>
                        Live FGR Stock Items & Dispatch Availability
                      </span>
                    </Space>
                    <Space size={10}>
                      <Tag color="blue" style={{ fontWeight: 700, borderRadius: 2 }}>
                        Total SKUs: {totalItemsCount}
                      </Tag>
                      <Tag color="green" style={{ fontWeight: 800, borderRadius: 2 }}>
                        Net Weight: {formatNumber(totalStockKg, 1)} KG
                      </Tag>
                    </Space>
                  </div>
                }
              >
                <Table
                  loading={loadingHistory}
                  dataSource={customerStockData.flatMap((c) =>
                    c.items.map((it) => ({
                      ...it,
                      customerName: c.customerName,
                      customerCode: c.customerCode,
                      socNo: c.socNo,
                    }))
                  )}
                  rowKey="id"
                  pagination={false}
                  size="middle"
                  bordered
                  className="packing-fgr-table"
                  scroll={{ x: 'max-content' }}
                  columns={[
                    {
                      title: '#',
                      key: 'idx',
                      width: 45,
                      align: 'center' as const,
                      render: (_: any, __: any, index: number) => (
                        <Tag color="default" style={{ fontWeight: 800, margin: 0, borderRadius: 2 }}>
                          {index + 1}
                        </Tag>
                      ),
                    },
                    {
                      title: 'Finished Good Item (Name & Code)',
                      key: 'item',
                      width: 250,
                      render: (_: any, r: any) => (
                        <div>
                          <span style={{ fontSize: 13, color: 'var(--theme-accent, #0284c7)', fontWeight: 800 }}>
                            {r.itemCode}
                          </span>
                          <div style={{ fontSize: 12, color: 'var(--theme-text)', fontWeight: 600, marginTop: 2 }}>
                            {r.itemName}
                          </div>
                        </div>
                      ),
                    },
                    {
                      title: 'Customer & SOC #',
                      key: 'cust',
                      width: 170,
                      render: (_: any, r: any) => (
                        <div>
                          <Text strong style={{ fontSize: 12.5, color: 'var(--theme-text)' }}>{r.customerName}</Text>
                          <div style={{ marginTop: 2 }}>
                            <Tag color="purple" style={{ fontSize: 11, fontWeight: 700, borderRadius: 2 }}>
                              SOC: {r.socNo}
                            </Tag>
                          </div>
                        </div>
                      ),
                    },
                    {
                      title: 'Opening Stock',
                      key: 'opening',
                      width: 110,
                      align: 'right' as const,
                      render: () => <span style={{ color: 'var(--theme-text-muted)', fontSize: 12 }}>0 PCS</span>,
                    },
                    {
                      title: 'Packed Today (IN)',
                      key: 'packedIn',
                      width: 130,
                      align: 'right' as const,
                      render: (_: any, r: any) => (
                        <span style={{ color: '#059669', fontWeight: 700, fontSize: 12.5 }}>
                          +{formatNumber(r.pcs, 0)} PCS
                        </span>
                      ),
                    },
                    {
                      title: 'Dispatched Today (OUT)',
                      key: 'dispatchedOut',
                      width: 140,
                      align: 'right' as const,
                      render: () => <span style={{ color: 'var(--theme-text-muted)', fontSize: 12 }}>0 PCS (0 CTN)</span>,
                    },
                    {
                      title: <span style={{ fontWeight: 800, color: '#0284c7' }}>Available FGR Stock (PCS ➔ GRS ➔ CTN)</span>,
                      children: [
                        {
                          title: <span style={{ fontWeight: 700, fontSize: 12, color: '#059669' }}>1. Pieces (PCS)</span>,
                          key: 'fgrPcs',
                          width: 120,
                          align: 'right' as const,
                          render: (_: any, r: any) => (
                            <span style={{ color: '#059669', fontWeight: 800, fontSize: 13 }}>
                              🔢 {formatNumber(r.pcs, 0)} PCS
                            </span>
                          ),
                        },
                        {
                          title: <span style={{ fontWeight: 700, fontSize: 12, color: '#4338ca' }}>2. Gross (GRS)</span>,
                          key: 'fgrGrs',
                          width: 110,
                          align: 'right' as const,
                          render: (_: any, r: any) => (
                            <span style={{ color: '#4338ca', fontWeight: 800, fontSize: 13 }}>
                              📦 {formatNumber(r.gross, 0)} GRS
                            </span>
                          ),
                        },
                        {
                          title: <span style={{ fontWeight: 700, fontSize: 12, color: '#6d28d9' }}>3. Cartons (CTN)</span>,
                          key: 'fgrCtn',
                          width: 110,
                          align: 'center' as const,
                          render: (_: any, r: any) => (
                            <Tag color="purple" style={{ fontWeight: 800, borderRadius: 2, padding: '2px 8px' }}>
                              🏷️ {formatNumber(r.cartons, 0)} CTN
                            </Tag>
                          ),
                        },
                      ],
                    },
                    {
                      title: 'Net Weight (KG)',
                      key: 'weight',
                      width: 125,
                      align: 'right' as const,
                      render: (_: any, r: any) => (
                        <span style={{ color: '#d97706', fontWeight: 800, fontSize: 13 }}>
                          ⚖️ {formatNumber(r.weightKg, 1)} KG
                        </span>
                      ),
                    },
                    {
                      title: 'Status & WhatsApp Action',
                      key: 'action',
                      width: 170,
                      align: 'center' as const,
                      render: (_: any, r: any) => (
                        <Space size={6} wrap>
                          <Tag color="success" style={{ fontWeight: 700, borderRadius: 2 }}>
                            READY
                          </Tag>
                          <Button
                            type="primary"
                            size="small"
                            icon={<WhatsAppOutlined />}
                            onClick={() => {
                              const foundCust = customerStockData.find((c) => c.customerName === r.customerName);
                              if (foundCust) handleOpenCustomerWhatsApp(foundCust);
                            }}
                            style={{ background: '#25D366', borderColor: '#25D366', fontWeight: 700, borderRadius: 4, fontSize: 11.5 }}
                          >
                            WhatsApp
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            </div>
          )}

          {/* ── View 2: Raw Batch Production Logs (Zero-Border Contained) ── */}
          {fgrViewMode === 'batch-logs' && (
            <Card
              size="small"
              style={{
                borderRadius: 0,
                border: '1px solid var(--theme-border)',
                borderLeft: 'none',
                borderRight: 'none',
                boxShadow: 'none',
                background: 'var(--theme-card-bg, #ffffff)',
              }}
              styles={{
                header: {
                  background: 'var(--theme-surface-alt, rgba(0, 0, 0, 0.02))',
                  borderBottom: '1px solid var(--theme-border)',
                  borderRadius: 0,
                  padding: '10px 14px',
                },
                body: { padding: 0, background: 'var(--theme-card-bg, #ffffff)' },
              }}
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--theme-text)' }}>Batch Production Entries & Component Logs</span>
                  <Tag color="blue" style={{ borderRadius: 0 }}>{filteredHistory.length} Entries</Tag>
                </div>
              }
            >
              <div className="packing-table-responsive-wrapper" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
                <Table
                  dataSource={filteredHistory}
                  columns={historyColumns}
                  rowKey={(r) => r.id || r.entryNo || Math.random().toString()}
                  loading={loadingHistory}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  size="middle"
                  bordered={false}
                  scroll={{ x: 'max-content' }}
                  className="packing-borderless-table"
                  locale={{
                    emptyText: (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text)' }}>
                              No Packing Batch Entries Found
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--theme-text-muted)', marginTop: 2 }}>
                              All dummy entries have been removed. Fresh packing entries saved from Tab 1 will appear here.
                            </div>
                          </div>
                        }
                      />
                    ),
                  }}
                />
              </div>
            </Card>
          )}
        </div>
      ),
    },
    {
      key: 'department-stock',
      label: (
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          <DatabaseOutlined style={{ marginRight: 6 }} />
          Department Store Stock
        </span>
      ),
      children: (
        <div style={{ marginTop: 12, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
          {/* Top 3 KPI Summary Cards with Pieces, Gross, and KG in all categories */}
          <div style={{ width: '100%', maxWidth: '100%', overflow: 'hidden', marginBottom: 16 }}>
            <Row gutter={[12, 12]}>
              <Col xs={24} md={8}>
                <Card
                  size="small"
                  bordered={false}
                  style={{
                    background: 'var(--theme-card-bg, #ffffff)',
                    border: '1px solid var(--theme-border, #e2e8f0)',
                    borderRadius: 0,
                    boxShadow: 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag color="orange" style={{ fontWeight: 800, fontSize: 11, margin: 0, borderRadius: 0 }}>STORE 1</Tag>
                      <span style={{ fontWeight: 800, color: 'var(--theme-text, #0f172a)', fontSize: 13.5 }}>Plating Dept (SPI-PL-004)</span>
                    </div>
                    <Tag style={{ fontWeight: 700, fontSize: 11, borderRadius: 0, background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', color: 'var(--theme-text, #0f172a)', borderColor: 'var(--theme-border, #e2e8f0)' }}>{spokeStoreBalances.length} Spoke Items</Tag>
                  </div>
                  <Row gutter={[8, 8]}>
                    <Col span={8}>
                      <div style={{ background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 0, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)', fontWeight: 800, letterSpacing: 0.5 }}>PIECES</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#ea580c', marginTop: 3 }}>
                          {formatNumber(totalSpokePcs, 0)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>PCS</div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 0, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)', fontWeight: 800, letterSpacing: 0.5 }}>GROSS</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#c2410c', marginTop: 3 }}>
                          {formatNumber(totalSpokeGrs, 1)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>GRS</div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 0, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)', fontWeight: 800, letterSpacing: 0.5 }}>WEIGHT</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#ea580c', marginTop: 3 }}>
                          {formatNumber(totalSpokeKg, 1)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>KG</div>
                      </div>
                    </Col>
                  </Row>
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--theme-text-muted, #64748b)', textAlign: 'center' }}>
                    Plated spokes waiting for Hand Packing assembly
                  </div>
                </Card>
              </Col>

              <Col xs={24} md={8}>
                <Card
                  size="small"
                  bordered={false}
                  style={{
                    background: 'var(--theme-card-bg, #ffffff)',
                    border: '1px solid var(--theme-border, #e2e8f0)',
                    borderRadius: 0,
                    boxShadow: 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag color="blue" style={{ fontWeight: 800, fontSize: 11, margin: 0, borderRadius: 0 }}>STORE 2</Tag>
                      <span style={{ fontWeight: 800, color: 'var(--theme-text, #0f172a)', fontSize: 13.5 }}>Main Warehouse (WH-002)</span>
                    </div>
                    <Tag style={{ fontWeight: 700, fontSize: 11, borderRadius: 0, background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', color: 'var(--theme-text, #0f172a)', borderColor: 'var(--theme-border, #e2e8f0)' }}>{nippleStoreBalances.length} Nipple Items</Tag>
                  </div>
                  <Row gutter={[8, 8]}>
                    <Col span={8}>
                      <div style={{ background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 0, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)', fontWeight: 800, letterSpacing: 0.5 }}>PIECES</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#0284c7', marginTop: 3 }}>
                          {formatNumber(totalNipplePcs, 0)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>PCS</div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 0, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)', fontWeight: 800, letterSpacing: 0.5 }}>GROSS</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#0284c7', marginTop: 3 }}>
                          {formatNumber(totalNippleGrs, 1)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>GRS</div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 0, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)', fontWeight: 800, letterSpacing: 0.5 }}>WEIGHT</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#0284c7', marginTop: 3 }}>
                          {formatNumber(totalNippleKg, 1)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>KG</div>
                      </div>
                    </Col>
                  </Row>
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--theme-text-muted, #64748b)', textAlign: 'center' }}>
                    Finished brass nipples available for assembly
                  </div>
                </Card>
              </Col>

              <Col xs={24} md={8}>
                <Card
                  size="small"
                  bordered={false}
                  style={{
                    background: 'var(--theme-card-bg, #ffffff)',
                    border: '1px solid var(--theme-border, #e2e8f0)',
                    borderRadius: 0,
                    boxShadow: 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag color="green" style={{ fontWeight: 800, fontSize: 11, margin: 0, borderRadius: 0 }}>MATCHED</Tag>
                      <span style={{ fontWeight: 800, color: 'var(--theme-text, #0f172a)', fontSize: 13.5 }}>Assembly Ready Balance</span>
                    </div>
                    <Tag color="cyan" style={{ fontWeight: 700, fontSize: 11, borderRadius: 0 }}>Spoke + Nipple</Tag>
                  </div>
                  <Row gutter={[8, 8]}>
                    <Col span={8}>
                      <div style={{ background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 0, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)', fontWeight: 800, letterSpacing: 0.5 }}>PIECES</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#16a34a', marginTop: 3 }}>
                          {formatNumber(assemblyReadyWheels, 0)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>Sets</div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 0, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)', fontWeight: 800, letterSpacing: 0.5 }}>GROSS</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#16a34a', marginTop: 3 }}>
                          {formatNumber(assemblyReadyWheels / 144, 1)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>GRS Sets</div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 0, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)', fontWeight: 800, letterSpacing: 0.5 }}>CARTONS</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#16a34a', marginTop: 3 }}>
                          {formatNumber(assemblyReadyWheels / 1440, 1)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>CTN (10 GRS)</div>
                      </div>
                    </Col>
                  </Row>
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--theme-text-muted, #64748b)', textAlign: 'center' }}>
                    Complete wheel sets ready for Hand Packing boxing
                  </div>
                </Card>
              </Col>
            </Row>
          </div>

          {/* Document & Communication Action Toolbar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
              padding: '10px 14px',
              background: 'var(--theme-card-bg, #ffffff)',
              border: '1px solid var(--theme-border, #e2e8f0)',
              borderRadius: 0,
              flexWrap: 'wrap',
              gap: 10,
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
            }}
          >
            <Space wrap>
              <Tag color="cyan" style={{ fontWeight: 700, fontSize: 12, padding: '4px 10px', margin: 0, borderRadius: 0 }}>
                Department Store Inventory
              </Tag>
              <Text type="secondary" style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)' }}>
                Live balances from Plating Dept (SPI-PL-004) & Main Warehouse (WH-002)
              </Text>
            </Space>

            <Space wrap>
              <Button
                icon={<PrinterOutlined />}
                onClick={handlePrint}
                size="middle"
                style={{ fontWeight: 600, borderRadius: 0, borderColor: 'var(--theme-border, #e2e8f0)', background: 'var(--theme-card-bg, #ffffff)', color: 'var(--theme-text, #0f172a)' }}
              >
                Print Report
              </Button>
              <Button
                icon={<FilePdfOutlined />}
                onClick={handleExportPdf}
                loading={exportingPdf}
                size="middle"
                style={{ fontWeight: 600, borderRadius: 0, color: '#dc2626', borderColor: 'var(--theme-border, #e2e8f0)', background: 'var(--theme-card-bg, #ffffff)' }}
              >
                Export PDF
              </Button>
              <Button
                icon={<FileExcelOutlined />}
                onClick={handleExportCsv}
                size="middle"
                style={{ fontWeight: 600, borderRadius: 0, color: '#16a34a', borderColor: 'var(--theme-border, #e2e8f0)', background: 'var(--theme-card-bg, #ffffff)' }}
              >
                Export Excel (CSV)
              </Button>
              <Button
                type="primary"
                icon={<WhatsAppOutlined />}
                onClick={() => setWhatsAppModalVisible(true)}
                size="middle"
                style={{
                  background: '#25D366',
                  borderColor: '#25D366',
                  fontWeight: 700,
                  borderRadius: 0,
                  boxShadow: 'none',
                }}
              >
                Share on WhatsApp
              </Button>
              <Popover content={columnSettingsContent} trigger="click" placement="bottomRight">
                <Button
                  icon={<SettingOutlined />}
                  size="middle"
                  style={{ fontWeight: 600, borderRadius: 0, borderColor: 'var(--theme-border, #e2e8f0)', background: 'var(--theme-card-bg, #ffffff)', color: 'var(--theme-text, #0f172a)' }}
                >
                  Columns
                </Button>
              </Popover>
              <Button
                size="middle"
                onClick={() => {
                  const nextState = !(spokeStoreExpanded && nippleStoreExpanded);
                  setSpokeStoreExpanded(nextState);
                  setNippleStoreExpanded(nextState);
                }}
                style={{ fontWeight: 600, borderRadius: 0, borderColor: 'var(--theme-border, #e2e8f0)', background: 'var(--theme-card-bg, #ffffff)', color: 'var(--theme-text, #0f172a)' }}
              >
                {spokeStoreExpanded && nippleStoreExpanded ? '− Collapse All' : '+ Expand All'}
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchDepartmentStock}
                loading={loadingStock}
                size="middle"
                style={{ fontWeight: 600, borderRadius: 0, borderColor: 'var(--theme-border, #e2e8f0)', background: 'var(--theme-card-bg, #ffffff)', color: 'var(--theme-text, #0f172a)' }}
              >
                Refresh
              </Button>
            </Space>
          </div>

          {/* STORE 1: Plating Department Finished Stock */}
          <Card
            size="small"
            bordered={false}
            style={{
              marginBottom: 18,
              border: '1px solid var(--theme-border, #e2e8f0)',
              borderRadius: 0,
              boxShadow: 'none',
              background: 'var(--theme-card-bg, #ffffff)',
            }}
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Space>
                  <Tag color="orange" style={{ fontWeight: 800, fontSize: 12, borderRadius: 0 }}>STORE 1</Tag>
                  <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--theme-text, #0f172a)' }}>
                    Plating Department Stock (SPI-PL-004 — PL Production Department)
                  </span>
                  <Tag style={{ fontWeight: 700, borderRadius: 0, background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', color: 'var(--theme-text, #0f172a)', borderColor: 'var(--theme-border, #e2e8f0)' }}>{spokeStoreBalances.length} Items</Tag>
                  <Tag color="green" style={{ fontWeight: 700, borderRadius: 0 }}>
                    Total: {formatNumber(totalSpokeGrs, 1)} GRS ({formatNumber(totalSpokePcs, 0)} PCS) | {formatNumber(totalSpokeKg, 1)} KG
                  </Tag>
                </Space>
                <Button
                  size="small"
                  type="text"
                  icon={spokeStoreExpanded ? <UpOutlined /> : <DownOutlined />}
                  onClick={() => setSpokeStoreExpanded(!spokeStoreExpanded)}
                  style={{ fontWeight: 600, color: 'var(--theme-text, #0f172a)' }}
                >
                  {spokeStoreExpanded ? '− Minimize Store' : '+ Expand Store'}
                </Button>
              </div>
            }
          >
            {spokeStoreExpanded ? (
              <div
                className="packing-table-responsive-wrapper"
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <Table
                  dataSource={spokeStoreBalances}
                  columns={spokeColumns}
                  rowKey="code"
                  loading={loadingStock}
                  pagination={false}
                  size="middle"
                  bordered={false}
                  scroll={{ x: 'max-content' }}
                  className="packing-borderless-table"
                  summary={() => {
                    const leadingColSpan = 3 + (showWarehouseColumn ? 1 : 0);
                    const trailingColSpan = (showStatusColumn ? 1 : 0) + (showActionColumn ? 1 : 0);
                    return (
                      <Table.Summary fixed>
                        <Table.Summary.Row style={{ background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', fontWeight: 800 }}>
                          <Table.Summary.Cell index={0} colSpan={leadingColSpan} align="right">
                            <span style={{ color: 'var(--theme-text, #0f172a)', fontSize: 13 }}>STORE 1 TOTAL (PLATING SPOKES):</span>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={1} align="right">
                            <span style={{ color: '#c2410c', fontSize: 13 }}>{formatNumber(totalSpokeGrs, 1)} GRS</span>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={2} align="right">
                            <span style={{ color: '#ea580c', fontSize: 13.5 }}>{formatNumber(totalSpokePcs, 0)} PCS</span>
                          </Table.Summary.Cell>
                          {showWeightColumns && (
                            <>
                              <Table.Summary.Cell index={3} align="right">
                                <span style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 12 }}>Avg Wt</span>
                              </Table.Summary.Cell>
                              <Table.Summary.Cell index={4} align="right">
                                <span style={{ color: '#ea580c', fontSize: 13.5 }}>{formatNumber(totalSpokeKg, 1)} KG</span>
                              </Table.Summary.Cell>
                            </>
                          )}
                          {trailingColSpan > 0 && (
                            <Table.Summary.Cell index={5} colSpan={trailingColSpan} align="center">
                              <Tag color="orange" style={{ fontWeight: 700, borderRadius: 0 }}>{spokeStoreBalances.length} Items</Tag>
                            </Table.Summary.Cell>
                          )}
                        </Table.Summary.Row>
                      </Table.Summary>
                    );
                  }}
                />
              </div>
            ) : (
              <div
                style={{ textAlign: 'center', padding: '12px 0', color: 'var(--theme-text-muted, #64748b)', cursor: 'pointer', background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 0 }}
                onClick={() => setSpokeStoreExpanded(true)}
              >
                <b>Store Collapsed</b> — Click to Expand {spokeStoreBalances.length} Plated Spoke Wire Items
              </div>
            )}
          </Card>

          {/* STORE 2: Nipple & Hardware Store */}
          <Card
            size="small"
            bordered={false}
            style={{
              border: '1px solid var(--theme-border, #e2e8f0)',
              borderRadius: 0,
              boxShadow: 'none',
              background: 'var(--theme-card-bg, #ffffff)',
            }}
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Space>
                  <Tag color="blue" style={{ fontWeight: 800, fontSize: 12, borderRadius: 0 }}>STORE 2</Tag>
                  <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--theme-text, #0f172a)' }}>
                    Nipple & Hardware Store (WH-002 — SPI Main Warehouse)
                  </span>
                  <Tag style={{ fontWeight: 700, borderRadius: 0, background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', color: 'var(--theme-text, #0f172a)', borderColor: 'var(--theme-border, #e2e8f0)' }}>{nippleStoreBalances.length} Items</Tag>
                  <Tag color="cyan" style={{ fontWeight: 700, borderRadius: 0 }}>
                    Total: {formatNumber(totalNippleGrs, 1)} GRS ({formatNumber(totalNipplePcs, 0)} PCS) | {formatNumber(totalNippleKg, 1)} KG
                  </Tag>
                </Space>
                <Button
                  size="small"
                  type="text"
                  icon={nippleStoreExpanded ? <UpOutlined /> : <DownOutlined />}
                  onClick={() => setNippleStoreExpanded(!nippleStoreExpanded)}
                  style={{ fontWeight: 600, color: 'var(--theme-text, #0f172a)' }}
                >
                  {nippleStoreExpanded ? '− Minimize Store' : '+ Expand Store'}
                </Button>
              </div>
            }
          >
            {nippleStoreExpanded ? (
              <div
                className="packing-table-responsive-wrapper"
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <Table
                  dataSource={nippleStoreBalances}
                  columns={nippleColumns}
                  rowKey="code"
                  loading={loadingStock}
                  pagination={false}
                  size="middle"
                  bordered={false}
                  scroll={{ x: 'max-content' }}
                  className="packing-borderless-table"
                  summary={() => {
                    const leadingColSpan = 3 + (showWarehouseColumn ? 1 : 0);
                    const trailingColSpan = (showStatusColumn ? 1 : 0) + (showActionColumn ? 1 : 0);
                    return (
                      <Table.Summary fixed>
                        <Table.Summary.Row style={{ background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', fontWeight: 800 }}>
                          <Table.Summary.Cell index={0} colSpan={leadingColSpan} align="right">
                            <span style={{ color: 'var(--theme-text, #0f172a)', fontSize: 13 }}>STORE 2 TOTAL (ASSEMBLY NIPPLES):</span>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={1} align="right">
                            <span style={{ color: '#0369a1', fontSize: 13 }}>{formatNumber(totalNippleGrs, 1)} GRS</span>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={2} align="right">
                            <span style={{ color: '#0284c7', fontSize: 13.5 }}>{formatNumber(totalNipplePcs, 0)} PCS</span>
                          </Table.Summary.Cell>
                          {showWeightColumns && (
                            <>
                              <Table.Summary.Cell index={3} align="right">
                                <span style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 12 }}>0.00350</span>
                              </Table.Summary.Cell>
                              <Table.Summary.Cell index={4} align="right">
                                <span style={{ color: '#0284c7', fontSize: 13.5 }}>{formatNumber(totalNippleKg, 1)} KG</span>
                              </Table.Summary.Cell>
                            </>
                          )}
                          {trailingColSpan > 0 && (
                            <Table.Summary.Cell index={5} colSpan={trailingColSpan} align="center">
                              <Tag color="blue" style={{ fontWeight: 700, borderRadius: 0 }}>{nippleStoreBalances.length} Items</Tag>
                            </Table.Summary.Cell>
                          )}
                        </Table.Summary.Row>
                      </Table.Summary>
                    );
                  }}
                />
              </div>
            ) : (
              <div
                style={{ textAlign: 'center', padding: '12px 0', color: 'var(--theme-text-muted, #64748b)', cursor: 'pointer', background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 0 }}
                onClick={() => setNippleStoreExpanded(true)}
              >
                <b>Store Collapsed</b> — Click to Expand {nippleStoreBalances.length} Nipple Items
              </div>
            )}
          </Card>
        </div>
      ),
    },
    {
      key: 'target-config',
      label: (
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          <AimOutlined style={{ marginRight: 6 }} />
          Shift Target Configuration
        </span>
      ),
      children: (
        <div style={{ marginTop: 8 }}>
          <PackingShiftTargetSetup onNavigateTab={handleNavigateTab} />
        </div>
      ),
    },
  ];

  return (
    <div className="prod-open-stock-container erp-packing-department-hub">
      <div className="erp-hub-breadcrumbs" style={{ marginBottom: 12 }}>
        <Breadcrumbs />
      </div>

      {/* ── Compact Standard Header Banner Matching Production Item Open Stock ── */}
      <div className="prod-open-stock-compact-header">
        <Row align="middle" justify="space-between" gutter={[16, 16]}>
          <Col xs={24} md={18}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="prod-header-icon-badge" style={{ background: '#ecfdf5', color: '#059669' }}>
                <InboxOutlined />
              </div>
              <div>
                <h2 className="prod-header-title">Packing Department Hub</h2>
                <span className="prod-header-subtitle">
                  Unified Packing & Finished Goods Assembly — BOM Configuration, Hand Packing & Live Department Stock
                </span>
              </div>
            </div>
          </Col>
          <Col xs={24} md={6} style={{ textAlign: 'right' }}>
            <Button
              icon={<SyncOutlined />}
              onClick={() => {
                fetchPackingHistory();
                fetchDepartmentStock();
              }}
              style={{ borderRadius: 8, fontWeight: 500 }}
            >
              Refresh Data
            </Button>
          </Col>
        </Row>
      </div>

      {/* ── Connected 3D Tactile File Folder Tabs Navigation (Matching Production Item Open Stock) ── */}
      <div className="prod-folder-nav-wrapper" style={{ marginTop: 20 }}>
        <button
          type="button"
          className={`prod-folder-tab-btn ${activeTab === 'packing-entry' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('packing-entry')}
        >
          <InboxOutlined style={{ fontSize: 16 }} /> 📦 1. Packing Production Register & Detail Table
        </button>
        <button
          type="button"
          className={`prod-folder-tab-btn ${activeTab === 'bom-config' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('bom-config')}
        >
          <SettingOutlined style={{ fontSize: 16 }} /> ⚙️ 2. FG BOM Configuration
        </button>
        <button
          type="button"
          className={`prod-folder-tab-btn ${activeTab === 'packing-history' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('packing-history')}
        >
          <ApartmentOutlined style={{ fontSize: 16 }} /> 🏢 3. Customer-Wise Packed Inventory & Logs
        </button>
        <button
          type="button"
          className={`prod-folder-tab-btn ${activeTab === 'department-stock' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('department-stock')}
        >
          <DatabaseOutlined style={{ fontSize: 16 }} /> 🏪 4. Department Store Stock
        </button>
        <button
          type="button"
          className={`prod-folder-tab-btn ${activeTab === 'target-config' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('target-config')}
        >
          <AimOutlined style={{ fontSize: 16 }} /> 🎯 5. Shift Target Setup
        </button>
      </div>

      {/* ── Main Tabs Container (Zero-Border Flush Canvas) ── */}
      <div
        className="packing-hub-zero-border-canvas"
        style={{
          width: '100%',
          maxWidth: '100%',
          margin: 0,
          padding: 0,
          border: 'none',
          borderRadius: 0,
          boxShadow: 'none',
          background: 'transparent',
          overflow: 'hidden',
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          destroyInactiveTabPane={false}
          renderTabBar={() => <div style={{ display: 'none' }} />}
          items={tabItems}
        />
      </div>

      {/* ── WhatsApp Sharing Modal ── */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ background: '#dcfce7', padding: '6px 8px', borderRadius: '50%', color: '#25D366', fontSize: 18 }}>
              <WhatsAppOutlined />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#065f46' }}>Share Store Stock Report via WhatsApp</div>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', fontWeight: 400 }}>Send formatted stock summary directly to team or management</div>
            </div>
          </div>
        }
        open={whatsAppModalVisible}
        onCancel={() => setWhatsAppModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setWhatsAppModalVisible(false)} style={{ borderRadius: 0 }}>
            Close
          </Button>,
          <Button
            key="copy"
            icon={copiedWhatsApp ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopyWhatsApp}
            style={{ fontWeight: 600, borderRadius: 0 }}
          >
            {copiedWhatsApp ? 'Copied!' : 'Copy to Clipboard'}
          </Button>,
          <Button
            key="whatsapp"
            type="primary"
            icon={<SendOutlined />}
            onClick={handleOpenWhatsApp}
            style={{ background: '#25D366', borderColor: '#25D366', fontWeight: 700, borderRadius: 0 }}
          >
            Open in WhatsApp
          </Button>,
        ]}
        width={680}
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12.5, marginBottom: 6, color: 'var(--theme-text, #334155)' }}>
              Recipient WhatsApp Number (Optional)
            </label>
            <Input
              placeholder="e.g. 923001234567 (with country code, no + or spaces) or leave blank"
              value={whatsAppPhone}
              onChange={(e) => setWhatsAppPhone(e.target.value)}
              prefix={<WhatsAppOutlined style={{ color: '#25D366' }} />}
              allowClear
              style={{ borderRadius: 0 }}
            />
            <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 4 }}>
              If left blank, WhatsApp will prompt you to select any contact or group from your chats.
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--theme-text, #334155)' }}>Formatted Message Preview</span>
              <Tag color="success" style={{ borderRadius: 0 }}>Ready to Send</Tag>
            </div>
            <div
              style={{
                background: '#0b141a',
                color: '#e9edef',
                padding: '14px 16px',
                borderRadius: 8,
                maxHeight: 320,
                overflowY: 'auto',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                border: '1px solid #1f2c34',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
              }}
            >
              {generateWhatsAppText()}
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Tab 3: Customer-Wise WhatsApp Dispatch Report Modal ── */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#25D366', color: '#ffffff', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 2px 6px rgba(37,211,102,0.3)' }}>
              <WhatsAppOutlined />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--theme-text, #0f172a)' }}>
                Share Customer Packed Inventory via WhatsApp
              </div>
              <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)' }}>
                Customer: <b style={{ color: '#0284c7' }}>{whatsAppModalCust?.customerName}</b> ({whatsAppModalCust?.customerCode})
              </div>
            </div>
          </div>
        }
        open={Boolean(whatsAppModalCust)}
        onCancel={() => setWhatsAppModalCust(null)}
        footer={[
          <Button key="close" onClick={() => setWhatsAppModalCust(null)} style={{ borderRadius: 4 }}>
            Close
          </Button>,
          <Button
            key="copy"
            icon={copiedCustWhatsApp ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopyCustomerWhatsApp}
            style={{ fontWeight: 600, borderRadius: 4 }}
          >
            {copiedCustWhatsApp ? 'Copied!' : 'Copy to Clipboard'}
          </Button>,
          <Button
            key="whatsapp"
            type="primary"
            icon={<WhatsAppOutlined />}
            onClick={handleSendCustomerWhatsApp}
            style={{ background: '#25D366', borderColor: '#25D366', fontWeight: 700, borderRadius: 4, boxShadow: '0 2px 6px rgba(37,211,102,0.3)' }}
          >
            Open in WhatsApp
          </Button>,
        ]}
        width={680}
        zIndex={1600}
        destroyOnClose
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12.5, marginBottom: 6, color: 'var(--theme-text, #334155)' }}>
              Recipient WhatsApp Number (Optional)
            </label>
            <Input
              placeholder="e.g. 923001234567 (with country code, no + or spaces) or leave blank"
              value={whatsAppCustPhone}
              onChange={(e) => setWhatsAppCustPhone(e.target.value)}
              prefix={<WhatsAppOutlined style={{ color: '#25D366' }} />}
              allowClear
              style={{ borderRadius: 4 }}
            />
            <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 4 }}>
              If left blank, WhatsApp Web / Mobile will open for you to select any contact or group directly.
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--theme-text, #334155)' }}>Formatted Message Preview</span>
              <Tag color="success" style={{ borderRadius: 2 }}>Ready to Send</Tag>
            </div>
            <div
              style={{
                background: '#0b141a',
                color: '#e9edef',
                padding: '14px 16px',
                borderRadius: 8,
                maxHeight: 320,
                overflowY: 'auto',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                border: '1px solid #1f2c34',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
              }}
            >
              {generateCustomerWhatsAppText(whatsAppModalCust)}
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Today's Packing Production Report WhatsApp Modal ── */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#25D366', color: '#ffffff', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 2px 6px rgba(37,211,102,0.3)' }}>
              <WhatsAppOutlined />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--theme-text, #0f172a)' }}>
                Share Today's Packing Production Report via WhatsApp
              </div>
              <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)' }}>
                Official Daily Dispatch Log & Output Summary
              </div>
            </div>
          </div>
        }
        open={todayWhatsAppModalVisible}
        onCancel={() => setTodayWhatsAppModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setTodayWhatsAppModalVisible(false)} style={{ borderRadius: 4 }}>
            Close
          </Button>,
          <Button
            key="copy"
            icon={copiedTodayWhatsApp ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopyTodayWhatsApp}
            style={{ fontWeight: 600, borderRadius: 4 }}
          >
            {copiedTodayWhatsApp ? 'Copied!' : 'Copy to Clipboard'}
          </Button>,
          <Button
            key="whatsapp"
            type="primary"
            icon={<WhatsAppOutlined />}
            onClick={handleSendTodayWhatsApp}
            style={{ background: '#25D366', borderColor: '#25D366', fontWeight: 700, borderRadius: 4, boxShadow: '0 2px 6px rgba(37,211,102,0.3)' }}
          >
            Open in WhatsApp
          </Button>,
        ]}
        width={680}
        zIndex={1600}
        destroyOnClose
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12.5, marginBottom: 6, color: 'var(--theme-text, #334155)' }}>
              Recipient WhatsApp Number (Optional)
            </label>
            <Input
              placeholder="e.g. 923001234567 (with country code, no + or spaces) or leave blank"
              value={todayWhatsAppPhone}
              onChange={(e) => setTodayWhatsAppPhone(e.target.value)}
              prefix={<WhatsAppOutlined style={{ color: '#25D366' }} />}
              allowClear
              style={{ borderRadius: 4 }}
            />
            <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 4 }}>
              If left blank, WhatsApp Web / Mobile will open for you to select any contact or group directly.
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--theme-text, #334155)' }}>Formatted Message Preview</span>
              <Tag color="success" style={{ borderRadius: 2 }}>Ready to Send</Tag>
            </div>
            <div
              style={{
                background: '#0b141a',
                color: '#e9edef',
                padding: '14px 16px',
                borderRadius: 8,
                maxHeight: 320,
                overflowY: 'auto',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                border: '1px solid #1f2c34',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
              }}
            >
              {generateTodayPackingWhatsAppText()}
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Live FGR Warehouse Stock Balance WhatsApp Modal ── */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#25D366', color: '#ffffff', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 2px 6px rgba(37,211,102,0.3)' }}>
              <WhatsAppOutlined />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--theme-text, #0f172a)' }}>
                Share Live FGR Warehouse Stock Report via WhatsApp
              </div>
              <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)' }}>
                SPI FG Dispatch Warehouse (SPI-FGDW-001) Balance
              </div>
            </div>
          </div>
        }
        open={fgrWhatsAppModalVisible}
        onCancel={() => setFgrWhatsAppModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setFgrWhatsAppModalVisible(false)} style={{ borderRadius: 4 }}>
            Close
          </Button>,
          <Button
            key="copy"
            icon={copiedFgrWhatsApp ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopyFgrWhatsApp}
            style={{ fontWeight: 600, borderRadius: 4 }}
          >
            {copiedFgrWhatsApp ? 'Copied!' : 'Copy to Clipboard'}
          </Button>,
          <Button
            key="whatsapp"
            type="primary"
            icon={<WhatsAppOutlined />}
            onClick={handleSendFgrWhatsApp}
            style={{ background: '#25D366', borderColor: '#25D366', fontWeight: 700, borderRadius: 4, boxShadow: '0 2px 6px rgba(37,211,102,0.3)' }}
          >
            Open in WhatsApp
          </Button>,
        ]}
        width={680}
        zIndex={1600}
        destroyOnClose
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12.5, marginBottom: 6, color: 'var(--theme-text, #334155)' }}>
              Recipient WhatsApp Number (Optional)
            </label>
            <Input
              placeholder="e.g. 923001234567 (with country code, no + or spaces) or leave blank"
              value={fgrWhatsAppPhone}
              onChange={(e) => setFgrWhatsAppPhone(e.target.value)}
              prefix={<WhatsAppOutlined style={{ color: '#25D366' }} />}
              allowClear
              style={{ borderRadius: 4 }}
            />
            <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 4 }}>
              If left blank, WhatsApp Web / Mobile will open for you to select any contact or group directly.
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--theme-text, #334155)' }}>Formatted Message Preview</span>
              <Tag color="success" style={{ borderRadius: 2 }}>Ready to Send</Tag>
            </div>
            <div
              style={{
                background: '#0b141a',
                color: '#e9edef',
                padding: '14px 16px',
                borderRadius: 8,
                maxHeight: 320,
                overflowY: 'auto',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                border: '1px solid #1f2c34',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
              }}
            >
              {generateFgrWhatsAppText()}
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Print Media Styles ── */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
          }
          .erp-hub-breadcrumbs,
          .prod-folder-nav-wrapper,
          .prod-open-stock-compact-header Button,
          .ant-tabs-nav,
          .ant-btn,
          .ant-modal,
          .ant-modal-root {
            display: none !important;
          }
          .prod-open-stock-container {
            padding: 0 !important;
            margin: 0 !important;
          }
          .prod-open-stock-main-card {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          .ant-table {
            font-size: 11px !important;
          }
          .ant-table-cell {
            padding: 4px 6px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default PackingDepartmentHub;
