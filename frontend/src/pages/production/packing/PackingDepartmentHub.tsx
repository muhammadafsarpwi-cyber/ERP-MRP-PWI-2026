import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Tabs, Card, Tag, Typography, Space, Button, Table, Input, Row, Col, Segmented,
  Modal, message, Popover, Checkbox,
} from 'antd';
import {
  InboxOutlined, SettingOutlined, HistoryOutlined,
  SearchOutlined, ReloadOutlined, DownOutlined,
  CheckCircleFilled, DatabaseOutlined,
  SyncOutlined, PlusCircleOutlined, MinusCircleOutlined,
  PartitionOutlined, ApartmentOutlined,
  ArrowsAltOutlined, ShrinkOutlined, SendOutlined, UpOutlined,
  PrinterOutlined, FilePdfOutlined, FileExcelOutlined, WhatsAppOutlined,
  CopyOutlined, CheckOutlined,
} from '@ant-design/icons';
import HandPackingEntry from './HandPackingEntry';
import FinishedGoodBomSetup from '../bom/FinishedGoodBomSetup';
import Breadcrumbs from '../../../components/shared/Breadcrumbs';
import apiService from '../../../services/api';
import { formatNumber, toNum } from '../../../utils/numberFormat';
import dayjs from 'dayjs';
import '../productionItemOpenStock.css';

const { Text } = Typography;

export const PackingDepartmentHub: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'packing-entry';

  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Sync tab with search params without losing state
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams, activeTab]);

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
  // TAB 3: CUSTOMER-WISE PACKED INVENTORY HIERARCHY (Matching Image 3 & 2)
  // ─────────────────────────────────────────────────────────────────────────────
  const [fgrViewMode, setFgrViewMode] = useState<string>('customer-hierarchy');
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<string[]>(['CUST-CRW']);

  const CUSTOMER_STOCK_DATA = [
    {
      id: 'CUST-CRW',
      customerCode: 'CUST-CRW',
      customerName: 'Crown Motors (Pvt) Ltd',
      socNo: 'SOC-2026-0842',
      items: [
        {
          id: 'spk-007-crw',
          itemCode: 'SPI-FG-SPK-007',
          itemName: '300X17 S9 Inn / Out Spoke Straight_125-S9 Nipple',
          packagingStyle: 'White Poly Bag with Brand Sticker',
          perPieceWeightKg: 0.0090,
          cartons: 50,
          gross: 500,
          pcs: 72000,
          weightKg: 648.0,
          ratePkr: 5.0,
          valuePkr: 360000,
          warehouseName: 'SPI FG Dispatch Warehouse',
          status: 'Ready',
        },
        {
          id: 'spk-003-crw',
          itemCode: 'SPI-FG-SPK-003',
          itemName: '250X18 Inn / Out Spoke Butted_CD-250X17 Nipple',
          packagingStyle: 'Plain White Poly Bag',
          perPieceWeightKg: 0.0090,
          cartons: 50,
          gross: 500,
          pcs: 72000,
          weightKg: 648.0,
          ratePkr: 5.0,
          valuePkr: 360000,
          warehouseName: 'SPI FG Dispatch Warehouse',
          status: 'Ready',
        },
      ],
    },
    {
      id: 'CUST-UAI',
      customerCode: 'CUST-UAI',
      customerName: 'United Auto Industries',
      socNo: 'SOC-2026-0915',
      items: [
        {
          id: 'spk-004-uai',
          itemCode: 'SPI-FG-SPK-004',
          itemName: 'CD-250*18 Outer Butted Spoke Assembly',
          packagingStyle: 'Customer Branded Printed Bag',
          perPieceWeightKg: 0.0075,
          cartons: 80,
          gross: 800,
          pcs: 115200,
          weightKg: 864.0,
          ratePkr: 5.0,
          valuePkr: 576000,
          warehouseName: 'SPI FG Dispatch Warehouse',
          status: 'Ready',
        },
        {
          id: 'np-005-uai',
          itemCode: 'SPI-FG-NP-005',
          itemName: '125-S9 Nipple Master Cartons',
          packagingStyle: 'OEM Blister Packing',
          perPieceWeightKg: 0.0075,
          cartons: 40,
          gross: 400,
          pcs: 57600,
          weightKg: 432.0,
          ratePkr: 5.0,
          valuePkr: 288000,
          warehouseName: 'WH-002 (SPI Main Warehouse)',
          status: 'Ready',
        },
      ],
    },
    {
      id: 'CUST-SAM',
      customerCode: 'CUST-SAM',
      customerName: 'Super Asia Motors',
      socNo: 'SOC-2026-0773',
      items: [
        {
          id: 'spk-011-sam',
          itemCode: 'SPI-FG-SPK-011',
          itemName: 'DS Front Inn / Out Spoke Straight_225X17 Nipple',
          packagingStyle: 'Transparent Poly Bag with Barcode',
          perPieceWeightKg: 0.0090,
          cartons: 50,
          gross: 500,
          pcs: 72000,
          weightKg: 648.0,
          ratePkr: 5.0,
          valuePkr: 360000,
          warehouseName: 'SPI FG Dispatch Warehouse',
          status: 'Ready',
        },
      ],
    },
    {
      id: 'CUST-GEN',
      customerCode: 'CUST-GEN',
      customerName: 'Open Market / General Stock',
      socNo: 'SOC-2026-0501',
      items: [
        {
          id: 'spk-007-gen',
          itemCode: 'SPI-FG-SPK-007',
          itemName: '300X17 S9 Standard Retail Packs',
          packagingStyle: 'Brown Export Master Carton',
          perPieceWeightKg: 0.0090,
          cartons: 100,
          gross: 1000,
          pcs: 144000,
          weightKg: 1296.0,
          ratePkr: 5.0,
          valuePkr: 720000,
          warehouseName: 'SPI FG Dispatch Warehouse',
          status: 'Ready',
        },
      ],
    },
  ];

  const totalActiveCustomers = CUSTOMER_STOCK_DATA.length;
  const totalItemsCount = CUSTOMER_STOCK_DATA.reduce((acc, c) => acc + c.items.length, 0);
  const totalStockKg = CUSTOMER_STOCK_DATA.reduce((acc, c) => acc + c.items.reduce((sum, it) => sum + it.weightKg, 0), 0);
  const totalStockPcs = CUSTOMER_STOCK_DATA.reduce((acc, c) => acc + c.items.reduce((sum, it) => sum + it.pcs, 0), 0);
  const totalStockValuation = CUSTOMER_STOCK_DATA.reduce((acc, c) => acc + c.items.reduce((sum, it) => sum + it.valuePkr, 0), 0);

  const toggleCustomerExpand = (custId: string) => {
    setExpandedCustomerIds((prev) =>
      prev.includes(custId) ? prev.filter((id) => id !== custId) : [...prev, custId]
    );
  };

  const expandAllCustomers = () => {
    setExpandedCustomerIds(CUSTOMER_STOCK_DATA.map((c) => c.id));
  };

  const collapseAllCustomers = () => {
    setExpandedCustomerIds([]);
  };
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [historySearchText, setHistorySearchText] = useState<string>('');

  const fetchPackingHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res: any = await apiService.get('/production/entries?limit=50').catch(() => null);
      let list: any[] = [];
      if (Array.isArray(res)) list = res;
      else if (Array.isArray(res?.data)) list = res.data;
      else if (Array.isArray(res?.items)) list = res.items;
      else if (Array.isArray(res?.data?.items)) list = res.data.items;

      // Filter entries with packing remarks or hand packing
      const packingEntries = list.filter((e) => {
        const rem = (e.remarks || '').toLowerCase();
        const machine = (e.machineNo || '').toLowerCase();
        return rem.includes('packing') || machine.includes('hand packing') || e.entryType === 'PACKING';
      });

      setHistoryLogs(packingEntries.length > 0 ? packingEntries : list.slice(0, 15));
    } catch (err) {
      console.warn('Failed to load packing history', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'packing-history' && historyLogs.length === 0) {
      fetchPackingHistory();
    }
  }, [activeTab, fetchPackingHistory, historyLogs.length]);

  const filteredHistory = historyLogs.filter((item) => {
    if (!historySearchText) return true;
    const q = historySearchText.toLowerCase();
    const batch = (item.entryNo || item.id || '').toLowerCase();
    const itemCode = (item.item?.itemCode || item.itemCode || '').toLowerCase();
    const itemName = (item.item?.name || item.itemName || '').toLowerCase();
    const remarks = (item.remarks || '').toLowerCase();
    return batch.includes(q) || itemCode.includes(q) || itemName.includes(q) || remarks.includes(q);
  });

  const historyColumns = [
    {
      title: 'Entry / Batch No',
      dataIndex: 'entryNo',
      key: 'entryNo',
      render: (no: string, r: any) => (
        <Space direction="vertical" size={1}>
          <Text strong style={{ color: '#0f172a' }}>{no || `PKG-${r.id?.slice(0, 8)}`}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {r.entryDate ? dayjs(r.entryDate).format('YYYY-MM-DD') : 'Today'}
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
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{r.machineNo || 'Hand Packing Chain'}</div>
        </div>
      ),
    },
    {
      title: 'Finished Good',
      key: 'finishedGood',
      render: (_: any, r: any) => (
        <div>
          <Text strong style={{ color: '#0284c7' }}>{r.item?.itemCode || 'SPI-FG-SPK-007'}</Text>
          <div style={{ fontSize: 11, color: '#334155' }}>
            {r.item?.name || '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple'}
          </div>
        </div>
      ),
    },
    {
      title: 'Quantity Packed',
      key: 'quantity',
      render: (_: any, r: any) => {
        const pcs = toNum(r.actualQuantity || 72000);
        const gross = Math.round(pcs / 144);
        const cartons = Math.round(gross / 10);
        return (
          <div>
            <Text strong style={{ color: '#059669', fontSize: 13 }}>
              {cartons} Cartons
            </Text>
            <div style={{ fontSize: 11, color: '#64748b' }}>
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
        const pcs = toNum(r.actualQuantity || 72000);
        const gross = Math.round(pcs / 144);
        const innerGross = Math.round(gross * 0.5);
        const outerGross = Math.round(gross * 0.5);
        const nippleGross = gross;
        return (
          <Space direction="vertical" size={1} style={{ fontSize: 11 }}>
            <span><Tag color="orange" style={{ margin: 0 }}>Inner:</Tag> {innerGross} GRS (WIP-SPL-013)</span>
            <span><Tag color="orange" style={{ margin: 0 }}>Outer:</Tag> {outerGross} GRS (WIP-SPL-014)</span>
            <span><Tag color="blue" style={{ margin: 0 }}>Nipple:</Tag> {nippleGross} GRS (SPI-FG-NP-005)</span>
          </Space>
        );
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
          <span style={{ fontWeight: 600, color: '#334155' }}>{r.operatorName || 'Muhammad Afsar'}</span>
          <div style={{ fontSize: 11, color: '#64748b' }}>{r.shift?.name || 'General Shift'}</div>
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
  // ─────────────────────────────────────────────────────────────────────────────
  const INITIAL_SPOKE_STORE_ITEMS = [
    { id: 'e72d30e1-e0da-447c-af1e-6a57d9aad0af', code: 'WIP-SPL-001', name: 'CD-250*17 Inner Butted', role: 'Inner Butted Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 27089, defaultGrs: 188.1, weightPerPiece: 0.00929 },
    { id: 'a7b4d433-e97c-4d11-bc26-75541f4f1593', code: 'WIP-SPL-002', name: 'CD-250*17 Outer Butted', role: 'Outer Butted Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 12497, defaultGrs: 86.8, weightPerPiece: 0.00925 },
    { id: 'dfbcafb0-6b5a-446a-8c46-804f0555e72b', code: 'WIP-SPL-003', name: 'CD-250*18 Inner Butted', role: 'Inner Butted Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 5440, defaultGrs: 37.8, weightPerPiece: 0.00993 },
    { id: 'ef0b56f7-9147-4d95-b63c-24e50da9be8f', code: 'WIP-SPL-004', name: 'CD-250*18 Outer Butted', role: 'Outer Butted Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 7663, defaultGrs: 53.2, weightPerPiece: 0.00981 },
    { id: 'bad446f8-9bf6-49ce-b63b-e88c54607003', code: 'WIP-SPL-013', name: '125-300*17 Inner Straight', role: 'Inner Spoke (90° Hook)', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 65092, defaultGrs: 452.0, weightPerPiece: 0.01250 },
    { id: 'beaa0ddf-e109-4f48-9609-04e5967bc795', code: 'WIP-SPL-014', name: '125-300*17 Outer Straight', role: 'Outer Spoke (75° Hook)', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 104558, defaultGrs: 726.1, weightPerPiece: 0.01261 },
    { id: 'wip-spl-017', code: 'WIP-SPL-017', name: '225*17 Inner Straight', role: 'Inner Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 6608, defaultGrs: 45.9, weightPerPiece: 0.00872 },
    { id: 'wip-spl-018', code: 'WIP-SPL-018', name: '225*17 Outer Straight', role: 'Outer Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 24040, defaultGrs: 166.9, weightPerPiece: 0.00854 },
    { id: 'wip-spl-006', code: 'WIP-SPL-006', name: '250*17 Outer Straight', role: 'Outer Spoke', wh: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', whName: 'PL Production Department (SPI-PL-004)', type: 'SEMI_FINISHED', defaultPcs: 26685, defaultGrs: 185.3, weightPerPiece: 0.01049 },
  ];

  const INITIAL_NIPPLE_STORE_ITEMS = [
    { id: 'ced9ab53-b470-47c2-83a9-829726b38b5b', code: 'SPI-FG-NP-005', name: '125-S9 Nipple', role: 'Standard Brass Nipple', wh: 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d', whName: 'SPI Main Warehouse (WH-002)', type: 'FINISHED_GOOD', defaultPcs: 1362384, defaultGrs: 9461.0, weightPerPiece: 0.0035 },
    { id: 'spi-fg-np-002', code: 'SPI-FG-NP-002', name: 'CD-250X17 Nipple', role: 'Butted Nipple', wh: 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d', whName: 'SPI Main Warehouse (WH-002)', type: 'FINISHED_GOOD', defaultPcs: 1008000, defaultGrs: 7000.0, weightPerPiece: 0.0035 },
    { id: '1fb94e18-cb0a-4447-adfa-13f6d7c9e4af', code: 'FG-NP-004', name: 'RM-250*17 Nipple', role: 'Assembly Spoke Nipple', wh: 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d', whName: 'SPI Main Warehouse (WH-002)', type: 'FINISHED_GOOD', defaultPcs: 1393344, defaultGrs: 9676.0, weightPerPiece: 0.0035 },
    { id: 'spi-fg-np-003', code: 'SPI-FG-NP-003', name: '125-300X17 Nipple', role: 'Large Gauge Nipple', wh: 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d', whName: 'SPI Main Warehouse (WH-002)', type: 'FINISHED_GOOD', defaultPcs: 2162880, defaultGrs: 15020.0, weightPerPiece: 0.0035 },
    { id: '43cec585-2413-4374-a77d-fc4ed263276d', code: 'SPI-FG-NP-001', name: 'Front Wheel 225X17 Nipple', role: 'Front Wheel Nipple', wh: 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d', whName: 'SPI Main Warehouse (WH-002)', type: 'FINISHED_GOOD', defaultPcs: 69120, defaultGrs: 480.0, weightPerPiece: 0.0035 },
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

      const [resPl, resWh2] = await Promise.allSettled([
        apiService.get(`/inventory/balances?warehouseId=${plWhId}`),
        apiService.get(`/inventory/balances?warehouseId=${wh2Id}`),
      ]);

      const plVal = resPl.status === 'fulfilled' ? (resPl.value as any) : null;
      const wh2Val = resWh2.status === 'fulfilled' ? (resWh2.value as any) : null;
      const plRows = plVal
        ? (Array.isArray(plVal) ? plVal : (plVal.data || []))
        : [];
      const wh2Rows = wh2Val
        ? (Array.isArray(wh2Val) ? wh2Val : (wh2Val.data || []))
        : [];

      // 1. Process Spokes from SPI-PL-004 (filter > 0 strictly)
      const spokes: any[] = [];
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
    if (activeTab === 'department-stock' && (spokeStoreBalances.length === 0 || nippleStoreBalances.length === 0)) {
      fetchDepartmentStock();
    }
  }, [activeTab, fetchDepartmentStock, spokeStoreBalances.length, nippleStoreBalances.length]);

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
      <div style={{ fontWeight: 800, fontSize: 12.5, color: '#1e293b', marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
        Column Display Settings
      </div>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Checkbox
          checked={showWarehouseColumn}
          onChange={(e) => setShowWarehouseColumn(e.target.checked)}
        >
          <span style={{ fontSize: 12, fontWeight: 600 }}>Warehouse Location</span>
          <div style={{ fontSize: 10, color: '#94a3b8', marginLeft: 22 }}>(Already in section title)</div>
        </Checkbox>
        <Checkbox
          checked={showWeightColumns}
          onChange={(e) => setShowWeightColumns(e.target.checked)}
        >
          <span style={{ fontSize: 12, fontWeight: 600 }}>Weight Columns (KG)</span>
          <div style={{ fontSize: 10, color: '#94a3b8', marginLeft: 22 }}>Per-pc & total weight</div>
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
      render: (_: any, __: any, index: number) => <span style={{ fontWeight: 700, color: '#64748b' }}>{index + 1}</span>,
    },
    {
      title: 'Item Code',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: '#0f172a' }}>{code}</Text>
          <Tag color="orange" style={{ fontWeight: 700, fontSize: 10.5, margin: 0 }}>PLATED SPOKE</Tag>
        </Space>
      ),
    },
    {
      title: 'Item Description & Specification',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, r: any) => (
        <div>
          <Text strong style={{ color: '#1e293b', fontSize: 13 }}>{name}</Text>
          <div style={{ fontSize: 11, color: '#0284c7', fontWeight: 600 }}>{r.role}</div>
        </div>
      ),
    },
    ...(showWarehouseColumn ? [{
      title: 'Department Warehouse / Store',
      dataIndex: 'whName',
      key: 'whName',
      render: (wh: string) => <Tag color="cyan" style={{ fontWeight: 600 }}>{wh}</Tag>,
    }] : []),
    {
      title: 'Available Balance (Gross)',
      dataIndex: 'gross',
      key: 'gross',
      width: 155,
      align: 'right' as const,
      render: (grs: number) => (
        <Text strong style={{ color: '#c2410c', fontSize: 13.5 }}>
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
        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 13 }}>
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
      render: (_: any, __: any, index: number) => <span style={{ fontWeight: 700, color: '#64748b' }}>{index + 1}</span>,
    },
    {
      title: 'Item Code',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: '#0f172a' }}>{code}</Text>
          <Tag color="blue" style={{ fontWeight: 700, fontSize: 10.5, margin: 0 }}>NIPPLE HARDWARE</Tag>
        </Space>
      ),
    },
    {
      title: 'Item Description & Specification',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, r: any) => (
        <div>
          <Text strong style={{ color: '#1e293b', fontSize: 13 }}>{name}</Text>
          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>{r.role}</div>
        </div>
      ),
    },
    ...(showWarehouseColumn ? [{
      title: 'Department Warehouse / Store',
      dataIndex: 'whName',
      key: 'whName',
      render: (wh: string) => <Tag color="geekblue" style={{ fontWeight: 600 }}>{wh}</Tag>,
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
        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 13 }}>
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
          {/* ── 1. Top Filter / Control Bar (Matching Image 2 & Mockup) ── */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
              padding: '12px 16px',
              background: '#ffffff',
              border: '1.5px solid #e2e8f0',
              borderRadius: 10,
              marginBottom: 16,
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <Space wrap size={12}>
              <Tag
                color="cyan"
                style={{
                  fontWeight: 700,
                  fontSize: 12.5,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid #a5f3fc',
                  margin: 0,
                }}
              >
                Division: DIV-SPD - Spoke Division
              </Tag>
              <Input
                placeholder="Filter customer, item or SOC..."
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                value={historySearchText}
                onChange={(e) => setHistorySearchText(e.target.value)}
                style={{
                  width: 270,
                  borderRadius: 8,
                  border: '1.5px solid #cbd5e1',
                }}
                allowClear
              />
              <Button
                icon={<SyncOutlined />}
                onClick={fetchPackingHistory}
                loading={loadingHistory}
                style={{
                  borderRadius: 8,
                  border: '1.5px solid #cbd5e1',
                  fontWeight: 600,
                  color: '#334155',
                }}
              >
                Refresh
              </Button>
            </Space>

            <Space wrap size={10}>
              {fgrViewMode === 'customer-hierarchy' && (
                <>
                  <Button
                    icon={<PlusCircleOutlined style={{ color: '#0284c7' }} />}
                    onClick={expandAllCustomers}
                    style={{
                      borderRadius: 20,
                      background: '#f0f9ff',
                      borderColor: '#bae6fd',
                      fontWeight: 600,
                      color: '#0369a1',
                      boxShadow: '0 1px 2px rgba(2, 132, 199, 0.08)',
                    }}
                  >
                    Expand All
                  </Button>
                  <Button
                    icon={<MinusCircleOutlined style={{ color: '#64748b' }} />}
                    onClick={collapseAllCustomers}
                    style={{
                      borderRadius: 20,
                      background: '#f8fafc',
                      borderColor: '#cbd5e1',
                      fontWeight: 600,
                      color: '#475569',
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                    }}
                  >
                    Collapse All
                  </Button>
                </>
              )}
              <Segmented
                value={fgrViewMode}
                onChange={(val) => setFgrViewMode(String(val))}
                options={[
                  { label: '🏢 Customer-Wise Packed Inventory', value: 'customer-hierarchy' },
                  { label: '📋 Batch Production Logs', value: 'batch-logs' },
                ]}
              />
            </Space>
          </div>

          {/* ── 2. Summary Stat KPI Cards (Directly Below Control Strip) ── */}
          <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
            <Col xs={12} sm={8} md={4} lg={4}>
              <Card
                size="small"
                style={{
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  textAlign: 'center',
                  background: '#ffffff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Active Customers</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{totalActiveCustomers}</div>
              </Card>
            </Col>
            <Col xs={12} sm={8} md={5} lg={5}>
              <Card
                size="small"
                style={{
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  textAlign: 'center',
                  background: '#ffffff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Items with Stock</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>{totalItemsCount} Items</div>
              </Card>
            </Col>
            <Col xs={12} sm={8} md={5} lg={5}>
              <Card
                size="small"
                style={{
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  textAlign: 'center',
                  background: '#ffffff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>⚖️ Total Weight (KG)</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706', marginTop: 4 }}>{formatNumber(totalStockKg, 2)} KG</div>
              </Card>
            </Col>
            <Col xs={12} sm={8} md={5} lg={5}>
              <Card
                size="small"
                style={{
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  textAlign: 'center',
                  background: '#ffffff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>🔢 Total Pieces (PCS)</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginTop: 4 }}>{formatNumber(totalStockPcs, 0)} PCS</div>
              </Card>
            </Col>
            <Col xs={24} sm={8} md={5} lg={5}>
              <Card
                size="small"
                style={{
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  textAlign: 'center',
                  background: '#ffffff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total Valuation</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#b45309', marginTop: 4 }}>Rs. {formatNumber(totalStockValuation, 0)}</div>
              </Card>
            </Col>
          </Row>

          {/* ── View 1: Customer-Wise Packed Stock Hierarchy Matching Image 3 & 2 ── */}
          {fgrViewMode === 'customer-hierarchy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {CUSTOMER_STOCK_DATA.filter((c) => {
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
                const custWeight = cust.items.reduce((s, it) => s + it.weightKg, 0);
                const custPcs = cust.items.reduce((s, it) => s + it.pcs, 0);
                const custVal = cust.items.reduce((s, it) => s + it.valuePkr, 0);

                return (
                  <Card
                    key={cust.id}
                    size="small"
                    style={{
                      borderRadius: 10,
                      border: isExpanded ? '2px solid #0284c7' : '1.5px solid #cbd5e1',
                      boxShadow: isExpanded ? '0 4px 12px rgba(2, 132, 199, 0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
                      transition: 'all 0.2s ease',
                    }}
                    styles={{
                      header: { background: isExpanded ? '#f0f9ff' : '#ffffff', cursor: 'pointer', padding: '10px 14px' },
                      body: { padding: isExpanded ? '12px 14px' : 0 },
                    }}
                    title={
                      <div
                        onClick={() => toggleCustomerExpand(cust.id)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, width: '100%' }}
                      >
                        <Space align="center" size={12} wrap>
                          <Button
                            type="text"
                            size="small"
                            icon={
                              isExpanded ? (
                                <ShrinkOutlined style={{ fontSize: 16, color: '#059669' }} />
                              ) : (
                                <ArrowsAltOutlined style={{ fontSize: 16, color: '#0284c7' }} />
                              )
                            }
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 32,
                              height: 32,
                              borderRadius: 6,
                              background: isExpanded ? '#ecfdf5' : '#f0f9ff',
                              border: isExpanded ? '1.5px solid #a7f3d0' : '1.5px solid #bae6fd',
                            }}
                          />
                          <Tag color="blue" style={{ fontWeight: 800 }}>
                            {cust.customerCode}
                          </Tag>
                          <Text strong style={{ fontSize: 15, color: '#0f172a' }}>
                            {cust.customerName}
                          </Text>
                          <Tag color="purple" style={{ fontSize: 11, fontWeight: 700 }}>
                            {cust.socNo}
                          </Tag>
                        </Space>

                        <Space size={14} wrap align="center">
                          <Tag color="cyan" style={{ fontWeight: 700 }}>
                            🏷️ {cust.items.length} Items
                          </Tag>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>
                            ⚖️ {formatNumber(custWeight, 2)} KG
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>
                            📦 {formatNumber(custPcs, 0)} PCS
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#b45309' }}>
                            💰 Rs. {formatNumber(custVal, 0)}
                          </span>
                          <Button type="link" size="small" style={{ fontWeight: 600, padding: 0 }}>
                            Physical Verification &rarr;
                          </Button>
                        </Space>
                      </div>
                    }
                  >
                    {isExpanded && (
                      <Table
                        dataSource={cust.items}
                        rowKey="id"
                        pagination={false}
                        bordered
                        size="small"
                        className="customer-stock-table"
                        columns={[
                          {
                            title: <span style={{ fontWeight: 800, fontSize: 13 }}>#</span>,
                            key: 'idx',
                            width: 45,
                            align: 'center' as const,
                            render: (_: any, __: any, index: number) => (
                              <Tag color="default" style={{ fontWeight: 800, margin: 0 }}>
                                {index + 1}
                              </Tag>
                            ),
                          },
                          {
                            title: <span style={{ fontWeight: 800, fontSize: 13 }}>Item (Name & Code)</span>,
                            key: 'item',
                            width: 260,
                            render: (_: any, r: any) => (
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 13, color: '#0284c7', fontWeight: 800 }}>
                                    {r.itemCode}
                                  </span>
                                  <Tag color="green" style={{ fontSize: 10, margin: 0, padding: '1px 6px', fontWeight: 700, borderRadius: 4 }}>
                                    Finished Good
                                  </Tag>
                                </div>
                                <div style={{ fontSize: 12, color: '#1e293b', fontWeight: 600, marginTop: 3 }}>
                                  {r.itemName}
                                </div>
                              </div>
                            ),
                          },
                          {
                            title: <span style={{ fontWeight: 800, fontSize: 13 }}>SOC & Packaging Style</span>,
                            key: 'socAndPacking',
                            width: 200,
                            render: (_: any, r: any) => (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div>
                                  <Tag color="purple" style={{ fontWeight: 800, fontSize: 11.5, margin: 0, padding: '2px 8px' }}>
                                    {r.socNo || cust.socNo}
                                  </Tag>
                                </div>
                                <div>
                                  <Tag color="geekblue" style={{ fontWeight: 600, fontSize: 11, margin: 0, padding: '2px 8px', whiteSpace: 'normal', textAlign: 'left' }}>
                                    {r.packagingStyle}
                                  </Tag>
                                </div>
                              </div>
                            ),
                          },
                          {
                            title: <span style={{ fontWeight: 800, fontSize: 13 }}>Per-Piece Weight</span>,
                            key: 'weightPerPc',
                            width: 120,
                            align: 'center' as const,
                            render: (_: any, r: any) => (
                              <Text strong style={{ fontSize: 12, color: '#475569' }}>
                                {r.perPieceWeightKg.toFixed(4)} KG
                              </Text>
                            ),
                          },
                          {
                            title: <span style={{ fontWeight: 800, fontSize: 13, color: '#064e3b' }}>Book Stock</span>,
                            children: [
                              {
                                title: <span style={{ fontWeight: 700, fontSize: 12 }}>GRS</span>,
                                key: 'gross',
                                width: 90,
                                align: 'center' as const,
                                render: (_: any, r: any) => (
                                  <Text strong style={{ color: '#059669', fontSize: 13 }}>
                                    {formatNumber(r.gross, 0)} GRS
                                  </Text>
                                ),
                              },
                              {
                                title: <span style={{ fontWeight: 700, fontSize: 12 }}>CTN</span>,
                                key: 'cartons',
                                width: 95,
                                align: 'center' as const,
                                render: (_: any, r: any) => (
                                  <Tag color="blue" style={{ fontWeight: 700 }}>
                                    {formatNumber(r.cartons, 0)} CTN
                                  </Tag>
                                ),
                              },
                            ],
                          },
                          {
                            title: <span style={{ fontWeight: 800, fontSize: 13, color: '#064e3b' }}>Dual-Unit Breakdown</span>,
                            children: [
                              {
                                title: <span style={{ fontWeight: 700, fontSize: 12 }}>Weight KG</span>,
                                key: 'weightKg',
                                width: 115,
                                align: 'right' as const,
                                render: (_: any, r: any) => (
                                  <span style={{ fontSize: 12.5, color: '#d97706', fontWeight: 800 }}>
                                    ⚖️ {formatNumber(r.weightKg, 2)} KG
                                  </span>
                                ),
                              },
                              {
                                title: <span style={{ fontWeight: 700, fontSize: 12 }}>Pieces PCS</span>,
                                key: 'pcs',
                                width: 115,
                                align: 'right' as const,
                                render: (_: any, r: any) => (
                                  <span style={{ fontSize: 12.5, color: '#0284c7', fontWeight: 800 }}>
                                    🔢 {formatNumber(r.pcs, 0)} PCS
                                  </span>
                                ),
                              },
                            ],
                          },
                          {
                            title: <span style={{ fontWeight: 800, fontSize: 13 }}>Unit Rate</span>,
                            key: 'rate',
                            width: 110,
                            align: 'right' as const,
                            render: (_: any, r: any) => (
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                                Rs. {r.ratePkr.toFixed(2)}/pc
                              </span>
                            ),
                          },
                          {
                            title: <span style={{ fontWeight: 800, fontSize: 13 }}>Total Valuation (PKR)</span>,
                            key: 'valuation',
                            width: 140,
                            align: 'right' as const,
                            render: (_: any, r: any) => (
                              <span style={{ fontWeight: 800, color: '#096dd9', fontSize: 13.5 }}>
                                Rs. {formatNumber(r.valuePkr, 0)}
                              </span>
                            ),
                          },
                          {
                            title: <span style={{ fontWeight: 800, fontSize: 13 }}>Store / Status</span>,
                            key: 'loc',
                            width: 140,
                            align: 'center' as const,
                            render: (_: any, r: any) => (
                              <div>
                                <Tag color="success" icon={<CheckCircleFilled />} style={{ fontWeight: 700 }}>
                                  {r.status}
                                </Tag>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                                  {r.warehouseName}
                                </div>
                              </div>
                            ),
                          },
                        ]}
                      />
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* ── View 2: Raw Batch Production Logs ── */}
          {fgrViewMode === 'batch-logs' && (
            <Card
              size="small"
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: 13.5 }}>Batch Production Entries & Component Logs</span>
                  <Tag color="blue">{filteredHistory.length} Entries</Tag>
                </div>
              }
            >
              <Table
                dataSource={filteredHistory}
                columns={historyColumns}
                rowKey={(r) => r.id || r.entryNo || Math.random().toString()}
                loading={loadingHistory}
                pagination={{ pageSize: 10, showSizeChanger: true }}
                size="middle"
                bordered
              />
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
        <div style={{ marginTop: 12 }}>
          {/* Top 3 KPI Summary Cards with Pieces, Gross, and KG in all categories */}
          <Row gutter={[14, 14]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={8}>
              <Card
                size="small"
                style={{
                  background: 'linear-gradient(180deg, #fff7ed 0%, #ffffff 100%)',
                  borderColor: '#fed7aa',
                  borderRadius: 10,
                  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.08)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag color="orange" style={{ fontWeight: 800, fontSize: 11, margin: 0 }}>STORE 1</Tag>
                    <span style={{ fontWeight: 800, color: '#9a3412', fontSize: 13.5 }}>Plating Dept (SPI-PL-004)</span>
                  </div>
                  <Tag color="default" style={{ fontWeight: 700, fontSize: 11 }}>{spokeStoreBalances.length} Spoke Items</Tag>
                </div>
                <Row gutter={[8, 8]}>
                  <Col span={8}>
                    <div style={{ background: '#ffffff', border: '1px solid #ffedd5', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10.5, color: '#7c2d12', fontWeight: 800, letterSpacing: 0.5 }}>PIECES</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#ea580c', marginTop: 3 }}>
                        {formatNumber(totalSpokePcs, 0)}
                      </div>
                      <div style={{ fontSize: 10, color: '#9a3412', fontWeight: 600 }}>PCS</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ background: '#ffffff', border: '1px solid #ffedd5', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10.5, color: '#7c2d12', fontWeight: 800, letterSpacing: 0.5 }}>GROSS</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#c2410c', marginTop: 3 }}>
                        {formatNumber(totalSpokeGrs, 1)}
                      </div>
                      <div style={{ fontSize: 10, color: '#9a3412', fontWeight: 600 }}>GRS</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ background: '#ffffff', border: '1px solid #ffedd5', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10.5, color: '#7c2d12', fontWeight: 800, letterSpacing: 0.5 }}>WEIGHT</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#9a3412', marginTop: 3 }}>
                        {formatNumber(totalSpokeKg, 1)}
                      </div>
                      <div style={{ fontSize: 10, color: '#9a3412', fontWeight: 600 }}>KG</div>
                    </div>
                  </Col>
                </Row>
                <div style={{ marginTop: 8, fontSize: 11, color: '#78350f', textAlign: 'center' }}>
                  Plated spokes waiting for Hand Packing assembly
                </div>
              </Card>
            </Col>

            <Col xs={24} md={8}>
              <Card
                size="small"
                style={{
                  background: 'linear-gradient(180deg, #f0f9ff 0%, #ffffff 100%)',
                  borderColor: '#bae6fd',
                  borderRadius: 10,
                  boxShadow: '0 2px 6px rgba(2, 132, 199, 0.08)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag color="blue" style={{ fontWeight: 800, fontSize: 11, margin: 0 }}>STORE 2</Tag>
                    <span style={{ fontWeight: 800, color: '#0369a1', fontSize: 13.5 }}>Main Warehouse (WH-002)</span>
                  </div>
                  <Tag color="default" style={{ fontWeight: 700, fontSize: 11 }}>{nippleStoreBalances.length} Nipple Items</Tag>
                </div>
                <Row gutter={[8, 8]}>
                  <Col span={8}>
                    <div style={{ background: '#ffffff', border: '1px solid #e0f2fe', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10.5, color: '#075985', fontWeight: 800, letterSpacing: 0.5 }}>PIECES</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#0284c7', marginTop: 3 }}>
                        {formatNumber(totalNipplePcs, 0)}
                      </div>
                      <div style={{ fontSize: 10, color: '#0369a1', fontWeight: 600 }}>PCS</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ background: '#ffffff', border: '1px solid #e0f2fe', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10.5, color: '#075985', fontWeight: 800, letterSpacing: 0.5 }}>GROSS</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#0369a1', marginTop: 3 }}>
                        {formatNumber(totalNippleGrs, 1)}
                      </div>
                      <div style={{ fontSize: 10, color: '#0369a1', fontWeight: 600 }}>GRS</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ background: '#ffffff', border: '1px solid #e0f2fe', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10.5, color: '#075985', fontWeight: 800, letterSpacing: 0.5 }}>WEIGHT</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#0c4a6e', marginTop: 3 }}>
                        {formatNumber(totalNippleKg, 1)}
                      </div>
                      <div style={{ fontSize: 10, color: '#0369a1', fontWeight: 600 }}>KG</div>
                    </div>
                  </Col>
                </Row>
                <div style={{ marginTop: 8, fontSize: 11, color: '#0369a1', textAlign: 'center' }}>
                  Finished brass nipples available for assembly
                </div>
              </Card>
            </Col>

            <Col xs={24} md={8}>
              <Card
                size="small"
                style={{
                  background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
                  borderColor: '#bbf7d0',
                  borderRadius: 10,
                  boxShadow: '0 2px 6px rgba(22, 163, 74, 0.08)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag color="green" style={{ fontWeight: 800, fontSize: 11, margin: 0 }}>MATCHED</Tag>
                    <span style={{ fontWeight: 800, color: '#166534', fontSize: 13.5 }}>Assembly Ready Balance</span>
                  </div>
                  <Tag color="cyan" style={{ fontWeight: 700, fontSize: 11 }}>Spoke + Nipple</Tag>
                </div>
                <Row gutter={[8, 8]}>
                  <Col span={8}>
                    <div style={{ background: '#ffffff', border: '1px solid #dcfce7', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10.5, color: '#14532d', fontWeight: 800, letterSpacing: 0.5 }}>PIECES</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#16a34a', marginTop: 3 }}>
                        {formatNumber(assemblyReadyWheels, 0)}
                      </div>
                      <div style={{ fontSize: 10, color: '#166534', fontWeight: 600 }}>Sets</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ background: '#ffffff', border: '1px solid #dcfce7', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10.5, color: '#14532d', fontWeight: 800, letterSpacing: 0.5 }}>GROSS</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#15803d', marginTop: 3 }}>
                        {formatNumber(assemblyReadyWheels / 144, 1)}
                      </div>
                      <div style={{ fontSize: 10, color: '#166534', fontWeight: 600 }}>GRS Sets</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ background: '#ffffff', border: '1px solid #dcfce7', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10.5, color: '#14532d', fontWeight: 800, letterSpacing: 0.5 }}>CARTONS</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#166534', marginTop: 3 }}>
                        {formatNumber(assemblyReadyWheels / 1440, 1)}
                      </div>
                      <div style={{ fontSize: 10, color: '#166534', fontWeight: 600 }}>CTN (10 GRS)</div>
                    </div>
                  </Col>
                </Row>
                <div style={{ marginTop: 8, fontSize: 11, color: '#166534', textAlign: 'center' }}>
                  Complete wheel sets ready for Hand Packing boxing
                </div>
              </Card>
            </Col>
          </Row>

          {/* Document & Communication Action Toolbar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14,
              padding: '10px 14px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <Space wrap>
              <Tag color="cyan" style={{ fontWeight: 700, fontSize: 12, padding: '4px 10px', margin: 0 }}>
                Department Store Inventory
              </Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Live balances from Plating Dept (SPI-PL-004) & Main Warehouse (WH-002)
              </Text>
            </Space>

            <Space wrap>
              <Button
                icon={<PrinterOutlined />}
                onClick={handlePrint}
                size="middle"
                style={{ fontWeight: 600, borderRadius: 6 }}
              >
                Print Report
              </Button>
              <Button
                icon={<FilePdfOutlined />}
                onClick={handleExportPdf}
                loading={exportingPdf}
                size="middle"
                style={{ fontWeight: 600, borderRadius: 6, color: '#dc2626', borderColor: '#fca5a5' }}
              >
                Export PDF
              </Button>
              <Button
                icon={<FileExcelOutlined />}
                onClick={handleExportCsv}
                size="middle"
                style={{ fontWeight: 600, borderRadius: 6, color: '#16a34a', borderColor: '#86efac' }}
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
                  borderRadius: 6,
                  boxShadow: '0 2px 4px rgba(37, 211, 102, 0.3)',
                }}
              >
                Share on WhatsApp
              </Button>
              <Popover content={columnSettingsContent} trigger="click" placement="bottomRight">
                <Button
                  icon={<SettingOutlined />}
                  size="middle"
                  style={{ fontWeight: 600, borderRadius: 6 }}
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
                style={{ fontWeight: 600, borderRadius: 6 }}
              >
                {spokeStoreExpanded && nippleStoreExpanded ? '− Collapse All' : '+ Expand All'}
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchDepartmentStock}
                loading={loadingStock}
                size="middle"
                style={{ fontWeight: 600, borderRadius: 6 }}
              >
                Refresh
              </Button>
            </Space>
          </div>

          {/* STORE 1: Plating Department Finished Stock */}
          <Card
            size="small"
            style={{ marginBottom: 18, borderColor: '#fed7aa', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Space>
                  <Tag color="orange" style={{ fontWeight: 800, fontSize: 12 }}>STORE 1</Tag>
                  <span style={{ fontWeight: 800, fontSize: 13.5, color: '#9a3412' }}>
                    Plating Department Stock (SPI-PL-004 — PL Production Department)
                  </span>
                  <Tag color="default" style={{ fontWeight: 700 }}>{spokeStoreBalances.length} Items</Tag>
                  <Tag color="green" style={{ fontWeight: 700 }}>
                    Total: {formatNumber(totalSpokeGrs, 1)} GRS ({formatNumber(totalSpokePcs, 0)} PCS) | {formatNumber(totalSpokeKg, 1)} KG
                  </Tag>
                </Space>
                <Button
                  size="small"
                  type="text"
                  icon={spokeStoreExpanded ? <UpOutlined /> : <DownOutlined />}
                  onClick={() => setSpokeStoreExpanded(!spokeStoreExpanded)}
                  style={{ fontWeight: 600, color: '#9a3412' }}
                >
                  {spokeStoreExpanded ? '− Minimize Store' : '+ Expand Store'}
                </Button>
              </div>
            }
          >
            {spokeStoreExpanded ? (
              <Table
                dataSource={spokeStoreBalances}
                columns={spokeColumns}
                rowKey="code"
                loading={loadingStock}
                pagination={false}
                size="middle"
                bordered
                summary={() => {
                  const leadingColSpan = 3 + (showWarehouseColumn ? 1 : 0);
                  const trailingColSpan = (showStatusColumn ? 1 : 0) + (showActionColumn ? 1 : 0);
                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row style={{ background: '#fff7ed', fontWeight: 800 }}>
                        <Table.Summary.Cell index={0} colSpan={leadingColSpan} align="right">
                          <span style={{ color: '#9a3412', fontSize: 13 }}>STORE 1 TOTAL (PLATING SPOKES):</span>
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
                              <span style={{ color: '#64748b', fontSize: 12 }}>Avg Wt</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={4} align="right">
                              <span style={{ color: '#9a3412', fontSize: 13.5 }}>{formatNumber(totalSpokeKg, 1)} KG</span>
                            </Table.Summary.Cell>
                          </>
                        )}
                        {trailingColSpan > 0 && (
                          <Table.Summary.Cell index={5} colSpan={trailingColSpan} align="center">
                            <Tag color="orange" style={{ fontWeight: 700 }}>{spokeStoreBalances.length} Items</Tag>
                          </Table.Summary.Cell>
                        )}
                      </Table.Summary.Row>
                    </Table.Summary>
                  );
                }}
              />
            ) : (
              <div
                style={{ textAlign: 'center', padding: '12px 0', color: '#64748b', cursor: 'pointer', background: '#fffbeb', borderRadius: 4 }}
                onClick={() => setSpokeStoreExpanded(true)}
              >
                <b>Store Collapsed</b> — Click to Expand {spokeStoreBalances.length} Plated Spoke Wire Items
              </div>
            )}
          </Card>

          {/* STORE 2: Nipple & Hardware Store */}
          <Card
            size="small"
            style={{ borderColor: '#bae6fd', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Space>
                  <Tag color="blue" style={{ fontWeight: 800, fontSize: 12 }}>STORE 2</Tag>
                  <span style={{ fontWeight: 800, fontSize: 13.5, color: '#0369a1' }}>
                    Nipple & Hardware Store (WH-002 — SPI Main Warehouse)
                  </span>
                  <Tag color="default" style={{ fontWeight: 700 }}>{nippleStoreBalances.length} Items</Tag>
                  <Tag color="cyan" style={{ fontWeight: 700 }}>
                    Total: {formatNumber(totalNippleGrs, 1)} GRS ({formatNumber(totalNipplePcs, 0)} PCS) | {formatNumber(totalNippleKg, 1)} KG
                  </Tag>
                </Space>
                <Button
                  size="small"
                  type="text"
                  icon={nippleStoreExpanded ? <UpOutlined /> : <DownOutlined />}
                  onClick={() => setNippleStoreExpanded(!nippleStoreExpanded)}
                  style={{ fontWeight: 600, color: '#0369a1' }}
                >
                  {nippleStoreExpanded ? '− Minimize Store' : '+ Expand Store'}
                </Button>
              </div>
            }
          >
            {nippleStoreExpanded ? (
              <Table
                dataSource={nippleStoreBalances}
                columns={nippleColumns}
                rowKey="code"
                loading={loadingStock}
                pagination={false}
                size="middle"
                bordered
                summary={() => {
                  const leadingColSpan = 3 + (showWarehouseColumn ? 1 : 0);
                  const trailingColSpan = (showStatusColumn ? 1 : 0) + (showActionColumn ? 1 : 0);
                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row style={{ background: '#f0f9ff', fontWeight: 800 }}>
                        <Table.Summary.Cell index={0} colSpan={leadingColSpan} align="right">
                          <span style={{ color: '#0369a1', fontSize: 13 }}>STORE 2 TOTAL (ASSEMBLY NIPPLES):</span>
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
                              <span style={{ color: '#64748b', fontSize: 12 }}>0.00350</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={4} align="right">
                              <span style={{ color: '#0c4a6e', fontSize: 13.5 }}>{formatNumber(totalNippleKg, 1)} KG</span>
                            </Table.Summary.Cell>
                          </>
                        )}
                        {trailingColSpan > 0 && (
                          <Table.Summary.Cell index={5} colSpan={trailingColSpan} align="center">
                            <Tag color="blue" style={{ fontWeight: 700 }}>{nippleStoreBalances.length} Items</Tag>
                          </Table.Summary.Cell>
                        )}
                      </Table.Summary.Row>
                    </Table.Summary>
                  );
                }}
              />
            ) : (
              <div
                style={{ textAlign: 'center', padding: '12px 0', color: '#64748b', cursor: 'pointer', background: '#f0f9ff', borderRadius: 4 }}
                onClick={() => setNippleStoreExpanded(true)}
              >
                <b>Store Collapsed</b> — Click to Expand {nippleStoreBalances.length} Nipple Items
              </div>
            )}
          </Card>
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
          <InboxOutlined /> 1. Packing Production Entry
        </button>
        <button
          type="button"
          className={`prod-folder-tab-btn ${activeTab === 'bom-config' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('bom-config')}
        >
          <PartitionOutlined /> 2. FG BOM Configuration
        </button>
        <button
          type="button"
          className={`prod-folder-tab-btn ${activeTab === 'packing-history' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('packing-history')}
        >
          <ApartmentOutlined /> 3. Customer-Wise Packed Inventory & Logs
        </button>
        <button
          type="button"
          className={`prod-folder-tab-btn ${activeTab === 'department-stock' ? 'is-active' : ''}`}
          onClick={() => handleTabChange('department-stock')}
        >
          <DatabaseOutlined /> 4. Department Store Stock
        </button>
      </div>

      {/* ── Main Tabs Container (Theme-Halo Border with Persistent Tab Content) ── */}
      <Card className="prod-open-stock-main-card" bordered={false}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          destroyInactiveTabPane={false}
          renderTabBar={() => <div style={{ display: 'none' }} />}
          items={tabItems}
        />
      </Card>

      {/* ── WhatsApp Sharing Modal ── */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ background: '#dcfce7', padding: '6px 8px', borderRadius: '50%', color: '#25D366', fontSize: 18 }}>
              <WhatsAppOutlined />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#065f46' }}>Share Store Stock Report via WhatsApp</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>Send formatted stock summary directly to team or management</div>
            </div>
          </div>
        }
        open={whatsAppModalVisible}
        onCancel={() => setWhatsAppModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setWhatsAppModalVisible(false)}>
            Close
          </Button>,
          <Button
            key="copy"
            icon={copiedWhatsApp ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopyWhatsApp}
            style={{ fontWeight: 600 }}
          >
            {copiedWhatsApp ? 'Copied!' : 'Copy to Clipboard'}
          </Button>,
          <Button
            key="whatsapp"
            type="primary"
            icon={<SendOutlined />}
            onClick={handleOpenWhatsApp}
            style={{ background: '#25D366', borderColor: '#25D366', fontWeight: 700 }}
          >
            Open in WhatsApp
          </Button>,
        ]}
        width={680}
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12.5, marginBottom: 6, color: '#334155' }}>
              Recipient WhatsApp Number (Optional)
            </label>
            <Input
              placeholder="e.g. 923001234567 (with country code, no + or spaces) or leave blank"
              value={whatsAppPhone}
              onChange={(e) => setWhatsAppPhone(e.target.value)}
              prefix={<WhatsAppOutlined style={{ color: '#25D366' }} />}
              allowClear
              style={{ borderRadius: 6 }}
            />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              If left blank, WhatsApp will prompt you to select any contact or group from your chats.
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: '#334155' }}>Formatted Message Preview</span>
              <Tag color="success">Ready to Send</Tag>
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
