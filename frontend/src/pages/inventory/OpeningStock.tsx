import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Form,
  Input,
  Select,
  InputNumber,
  Table,
  Card,
  App,
  Typography,
  Space,
  DatePicker,
  Row,
  Col,
  Tooltip,
  Modal,
  Tag,
  Alert,
  theme,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SendOutlined,
  DownloadOutlined,
  UploadOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  ClearOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  ApartmentOutlined,
  ShopOutlined,
  CalendarOutlined,
  NumberOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../services/api';
import dashboardService, { FilterOption } from '../../services/dashboardService';
import OpeningStockHistoryModal from './OpeningStockHistoryModal';
import OpeningStockTemplateModal from './OpeningStockTemplateModal';
import OpeningStockImportWizardModal from './OpeningStockImportWizardModal';
import { type TemplateItemRecord } from '../../utils/openingStockSpreadsheet';
import { usePermission } from '../../hooks/usePermission';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { ConfirmAndSuccessModal, type ConfirmAndSuccessPhase } from '../../components/shared';

const { Text } = Typography;

interface ItemOption extends TemplateItemRecord {
  code?: string;
  item_code?: string;
  base_uom_id?: string;
  uom_id?: string;
  cost_price?: number;
  standard_cost?: number;
  divisionId?: string;
  itemType?: string;
  uomCode?: string;
}

interface WarehouseOption {
  id: string;
  name: string;
  code?: string;
  warehouseCode?: string;
  warehouse_code?: string;
  division_id?: string;
  divisionId?: string;
}

interface UomOption {
  id: string;
  name: string;
  code?: string;
}

interface OpeningStockLine {
  key: string;
  itemId: string;
  itemCode?: string;
  itemName?: string;
  uomId: string;
  quantity: number;
  unitCost: number;
  batchNumber?: string;
  serialNumber?: string;
  notes?: string;
}

const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
let openingStockLookupCache: {
  ts: number;
  divisions: FilterOption[];
  warehouses: WarehouseOption[];
  uoms: UomOption[];
  allItems: ItemOption[];
} | null = null;

const normalizeItemOption = (it: any, divNameMap: Map<string, string>): ItemOption => {
  const code = it.itemCode || it.code || it.item_code || '';
  const uomCode = it.baseUomCode || it.baseUom?.code || it.uomCode || '';
  const uomId = it.baseUomId || it.base_uom_id || it.uomId || it.uom_id || '';
  const divisionId = it.divisionId || it.division_id || undefined;
  return {
    ...it,
    id: it.id,
    itemCode: code,
    code,
    item_code: code,
    name: it.name || '',
    categoryName: it.categoryName || it.category?.name || null,
    itemType: it.itemType || null,
    uomId,
    base_uom_id: uomId,
    uom_id: uomId,
    uomCode,
    divisionId,
    divisionName: divisionId ? divNameMap.get(divisionId) || null : null,
    costPrice: it.costPrice ?? it.cost_price ?? it.standardCost ?? it.standard_cost ?? 0,
    cost_price: it.costPrice ?? it.cost_price ?? 0,
    standard_cost: it.standardCost ?? it.standard_cost ?? 0,
    isStoreItem: Boolean(it.isStoreItem ?? it.is_store_item),
  };
};

const fmt = (num?: number | null, decimals = 2) => {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return '0';
  return Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

const OpeningStock: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { can } = usePermission();
  const canCreateOpening = can('inventory.opening_stock.create');
  const canExportOpening = can('inventory.opening_stock.export');
  const canPrintOpening = can('inventory.opening_stock.print');

  const [form] = Form.useForm();
  const selectedWarehouseId = Form.useWatch('warehouseId', form);
  const selectedDateValue = Form.useWatch('transactionDate', form);
  const selectedReferenceValue = Form.useWatch('referenceNumber', form);
  const [lines, setLines] = useState<OpeningStockLine[]>([
    { key: 'line-init-1', itemId: '', uomId: '', quantity: 1, unitCost: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'none' | 'template' | 'import' | 'history'>('none');
  const historyOpen = activeModal === 'history';
  const templateModalOpen = activeModal === 'template';
  const importWizardOpen = activeModal === 'import';
  const [balanceRefreshTick, setBalanceRefreshTick] = useState(0);
  const [feedbackPhase, setFeedbackPhase] = useState<ConfirmAndSuccessPhase>('idle');
  const [postedSummary, setPostedSummary] = useState<{
    lineCount: number;
    refNum: string;
    totalQty: number;
    totalVal: number;
    errorMessage?: string;
  }>({ lineCount: 0, refNum: '', totalQty: 0, totalVal: 0 });

  const [divisions, setDivisions] = useState<FilterOption[]>(() => openingStockLookupCache?.divisions || []);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | undefined>(undefined);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>(() => openingStockLookupCache?.warehouses || []);
  const [allItems, setAllItems] = useState<ItemOption[]>(() => openingStockLookupCache?.allItems || []);
  const [uoms, setUoms] = useState<UomOption[]>(() => openingStockLookupCache?.uoms || []);
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);
  const [warehouseBalances, setWarehouseBalances] = useState<Map<string, number>>(new Map());

  // 1. Fetch & cache Division, Warehouse, UOM, and Item lookups ONCE with zero-lag switching
  const fetchDropdowns = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && openingStockLookupCache && now - openingStockLookupCache.ts < LOOKUP_CACHE_TTL_MS) {
      setDivisions(openingStockLookupCache.divisions);
      setWarehouses(openingStockLookupCache.warehouses);
      setUoms(openingStockLookupCache.uoms);
      setAllItems(openingStockLookupCache.allItems);
      return;
    }

    setLoadingDropdowns(true);
    try {
      const [divRes, warehouseRes, uomRes, itemRes] = await Promise.all([
        dashboardService.getFilterDivisions().catch(() => ({ data: [] })),
        apiService.get<any>('/warehouses', { limit: 200 }).catch(() => ({ data: [] })),
        apiService.get<any>('/master-data/uom', { limit: 100 }).catch(() => ({ data: [] })),
        apiService.get<any>('/master-data/items/lookup').catch(() => ({ data: [] })),
      ]);

      const nextDivs: FilterOption[] = Array.isArray(divRes?.data) ? divRes.data : [];
      const divNameMap = new Map<string, string>(nextDivs.map((d) => [d.id, d.name]));

      const rawWarehouses = warehouseRes?.data?.warehouses || warehouseRes?.data || [];
      const nextWhs: WarehouseOption[] = Array.isArray(rawWarehouses) ? rawWarehouses : [];

      const rawUoms = uomRes?.data?.uoms || uomRes?.data || [];
      const nextUoms: UomOption[] = Array.isArray(rawUoms) ? rawUoms : [];

      const rawItems: any[] = Array.isArray(itemRes) ? itemRes : itemRes?.data?.items || itemRes?.data || [];
      const nextItems = rawItems
        .filter((it) => Boolean(it?.id))
        .map((it) => normalizeItemOption(it, divNameMap));

      openingStockLookupCache = {
        ts: Date.now(),
        divisions: nextDivs,
        warehouses: nextWhs,
        uoms: nextUoms,
        allItems: nextItems,
      };

      setDivisions(nextDivs);
      setWarehouses(nextWhs);
      setUoms(nextUoms);
      setAllItems(nextItems);
    } catch (err: any) {
      console.error('Failed to load dropdown data:', err);
      message.error('Failed to load initial master data');
    } finally {
      setLoadingDropdowns(false);
    }
  }, [message]);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  // Zero-lag synchronously filtered items for the active Division (derived from cached master lookup)
  const items = useMemo(() => {
    if (!selectedDivisionId) return [];
    return allItems.filter((it) => !it.divisionId || it.divisionId === selectedDivisionId);
  }, [allItems, selectedDivisionId]);

  const loadingItems = loadingDropdowns && allItems.length === 0;

  // Warehouses strictly belonging to the selected division
  const filteredWarehouses = useMemo(() => {
    if (!selectedDivisionId) return [];
    return warehouses.filter((w) => (w.divisionId || w.division_id) === selectedDivisionId);
  }, [warehouses, selectedDivisionId]);

  // Auto-select the Division's General/Main Store warehouse (or the sole warehouse)
  useEffect(() => {
    if (!selectedDivisionId || filteredWarehouses.length === 0) return;
    const currentWh = form.getFieldValue('warehouseId');
    if (currentWh && filteredWarehouses.some((w) => w.id === currentWh)) return;

    if (filteredWarehouses.length === 1) {
      form.setFieldValue('warehouseId', filteredWarehouses[0].id);
      return;
    }

    const preferredGeneral = filteredWarehouses.find((w) => {
      const wType = String((w as any).warehouseType || (w as any).warehouse_type || '').toUpperCase();
      const wCode = String(w.code || (w as any).warehouseCode || '').toUpperCase();
      const wName = String(w.name || '').toLowerCase();
      return (
        wType === 'GENERAL' ||
        wType === 'MAIN' ||
        wCode.includes('MWH') ||
        wName.includes('main warehouse') ||
        wName.includes('general store')
      );
    });
    if (preferredGeneral) {
      form.setFieldValue('warehouseId', preferredGeneral.id);
    }
  }, [filteredWarehouses, selectedDivisionId, form]);

  // Fetch live stock balances for the selected warehouse (or division's warehouses) so Current Stock (In Hand) is always accurate
  useEffect(() => {
    if (!selectedWarehouseId && (!selectedDivisionId || filteredWarehouses.length === 0)) {
      setWarehouseBalances(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = selectedWarehouseId
          ? `/inventory/balances?warehouseId=${selectedWarehouseId}&limit=5000`
          : `/inventory/balances?limit=5000`;
        const res = await apiService.get<any>(url);
        const raw: any[] = Array.isArray(res) ? res : res?.data || [];
        const divWhIds = new Set(filteredWarehouses.map((w) => w.id));
        const map = new Map<string, number>();
        raw.forEach((b: any) => {
          const whId = b.warehouseId || b.warehouse_id;
          if (!selectedWarehouseId && whId && !divWhIds.has(whId)) return;
          const itemId = b.itemId || b.item_id;
          if (!itemId) return;
          const prev = map.get(itemId) || 0;
          map.set(itemId, prev + Number(b.onHand ?? b.on_hand ?? 0));
        });
        if (!cancelled) setWarehouseBalances(map);
      } catch {
        if (!cancelled) setWarehouseBalances(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedWarehouseId, selectedDivisionId, filteredWarehouses, balanceRefreshTick]);

  const duplicateStockLines = useMemo(() => {
    return lines.filter((l) => l.itemId && (warehouseBalances.get(l.itemId) || 0) > 0);
  }, [lines, warehouseBalances]);

  // Auto-generate reference number and date on mount
  useEffect(() => {
    const todayStr = dayjs().format('YYYYMMDD');
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    form.setFieldsValue({
      referenceNumber: `OPN-${todayStr}-${randomSuffix}`,
      transactionDate: dayjs(),
    });
  }, [form]);

  // 2. Line management
  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: `line-${Date.now()}-${prev.length}`,
        itemId: '',
        uomId: '',
        quantity: 1,
        unitCost: 0,
      },
    ]);
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const updateLine = (key: string, field: keyof OpeningStockLine, value: any) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;

        const updated = { ...l, [field]: value };

        // If item is changed, auto-populate UOM, unitCost, itemCode, itemName
        if (field === 'itemId') {
          const found = items.find((i) => i.id === value);
          if (found) {
            updated.itemCode = found.code || found.item_code || '';
            updated.itemName = found.name || '';
            if (found.base_uom_id || found.uom_id) {
              updated.uomId = found.base_uom_id || found.uom_id || '';
            }
            if (found.cost_price !== undefined && found.cost_price !== null) {
              updated.unitCost = Number(found.cost_price) || 0;
            } else if (found.standard_cost !== undefined && found.standard_cost !== null) {
              updated.unitCost = Number(found.standard_cost) || 0;
            }
          }
        }

        return updated;
      })
    );
  };

  const clearAllLines = () => {
    setLines([]);
  };

  // 3. Totals calculation
  const totalQuantity = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
    [lines]
  );
  const totalValue = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0),
    [lines]
  );

  // 4. Smart Template Download (delegated to OpeningStockTemplateModal — mutually exclusive)
  const openTemplateModal = () => setActiveModal('template');

  // 5. Export Current Lines to CSV
  const exportToCsv = () => {
    if (lines.length === 0) {
      message.warning('No lines to export. Add lines first.');
      return;
    }

    const headers = ['Item Code', 'Item Name', 'UOM', 'Quantity', 'Unit Cost', 'Total Cost', 'Batch Number', 'Serial Number', 'Notes'];
    const csvRows = lines.map((l) => {
      const itm = items.find((i) => i.id === l.itemId);
      const uom = uoms.find((u) => u.id === l.uomId);
      const itemCode = itm?.code || itm?.item_code || l.itemCode || '';
      const itemName = itm?.name || l.itemName || '';
      const uomCode = uom?.code || uom?.name || '';
      const totalCost = (Number(l.quantity) || 0) * (Number(l.unitCost) || 0);

      return [
        `"${itemCode}"`,
        `"${itemName.replace(/"/g, '""')}"`,
        `"${uomCode}"`,
        `"${l.quantity}"`,
        `"${l.unitCost}"`,
        `"${totalCost.toFixed(2)}"`,
        `"${l.batchNumber || ''}"`,
        `"${l.serialNumber || ''}"`,
        `"${(l.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `opening_stock_${dayjs().format('YYYYMMDD_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success(`Exported ${lines.length} lines to CSV`);
  };

  // 6. Smart Import Wizard & Batch History (mutually exclusive)
  const openImportWizard = () => setActiveModal('import');
  const openHistoryModal = () => setActiveModal('history');

  // 6b. Export to Excel (.xls SpreadsheetML)
  const handleExportExcel = () => {
    if (lines.length === 0) {
      message.warning('Add lines first before exporting to Excel');
      return;
    }
    const values = form.getFieldsValue();
    const warehouseObj = warehouses.find((w) => w.id === values.warehouseId);
    const divisionObj = divisions.find((d) => d.id === selectedDivisionId);
    const refNum = values.referenceNumber || 'N/A';
    const dateStr = values.transactionDate ? dayjs(values.transactionDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    const warehouseName = warehouseObj?.name || 'N/A';
    const divisionName = divisionObj?.name || 'All Divisions';

    const esc = (s: unknown) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const rowsXml = lines
      .map((l, idx) => {
        const itm = items.find((i) => i.id === l.itemId);
        const uom = uoms.find((u) => u.id === l.uomId);
        const itemCode = itm?.code || itm?.item_code || l.itemCode || '';
        const itemName = itm?.name || l.itemName || '';
        const uomName = uom?.code || uom?.name || '';
        const qty = Number(l.quantity) || 0;
        const unitCost = Number(l.unitCost) || 0;
        const lineCost = qty * unitCost;
        return `<Row>
          <Cell ss:StyleID="cellC"><Data ss:Type="Number">${idx + 1}</Data></Cell>
          <Cell ss:StyleID="cell"><Data ss:Type="String">${esc(itemCode)}</Data></Cell>
          <Cell ss:StyleID="cell"><Data ss:Type="String">${esc(itemName)}</Data></Cell>
          <Cell ss:StyleID="cellC"><Data ss:Type="String">${esc(uomName)}</Data></Cell>
          <Cell ss:StyleID="num"><Data ss:Type="Number">${qty}</Data></Cell>
          <Cell ss:StyleID="num"><Data ss:Type="Number">${unitCost}</Data></Cell>
          <Cell ss:StyleID="numB"><Data ss:Type="Number">${lineCost}</Data></Cell>
          <Cell ss:StyleID="cell"><Data ss:Type="String">${esc(l.batchNumber || '')}</Data></Cell>
          <Cell ss:StyleID="cell"><Data ss:Type="String">${esc(l.serialNumber || '')}</Data></Cell>
          <Cell ss:StyleID="cell"><Data ss:Type="String">${esc(l.notes || '')}</Data></Cell>
        </Row>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="title"><Font ss:Bold="1" ss:Size="14" ss:Color="#1E293B"/></Style>
  <Style ss:ID="meta"><Font ss:Bold="1" ss:Size="10" ss:Color="#475569"/></Style>
  <Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1D4ED8" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
  <Style ss:ID="cell"><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders></Style>
  <Style ss:ID="cellC"><Alignment ss:Horizontal="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders></Style>
  <Style ss:ID="num"><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders></Style>
  <Style ss:ID="numB"><Font ss:Bold="1"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders></Style>
  <Style ss:ID="tot"><Font ss:Bold="1"/><Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/></Style>
 </Styles>
 <Worksheet ss:Name="Opening Stock">
  <Table>
   <Column ss:Width="35"/><Column ss:Width="110"/><Column ss:Width="240"/><Column ss:Width="60"/><Column ss:Width="85"/><Column ss:Width="105"/><Column ss:Width="110"/><Column ss:Width="90"/><Column ss:Width="90"/><Column ss:Width="140"/>
   <Row><Cell ss:StyleID="title"><Data ss:Type="String">Pakistan Wire Industries (Pvt.) LTD — Store Opening Stock</Data></Cell></Row>
   <Row><Cell ss:StyleID="meta"><Data ss:Type="String">Reference #: ${esc(refNum)} | Date: ${esc(dateStr)} | Division: ${esc(divisionName)} | Warehouse: ${esc(warehouseName)}</Data></Cell></Row>
   <Row/>
   <Row>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">#</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Item Code</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Item Description</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">UOM</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Quantity</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Unit Cost (PKR)</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Total Cost (PKR)</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Batch #</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Serial #</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Notes</Data></Cell>
   </Row>
   ${rowsXml}
   <Row>
    <Cell ss:StyleID="tot"/><Cell ss:StyleID="tot"><Data ss:Type="String">TOTAL</Data></Cell>
    <Cell ss:StyleID="tot"><Data ss:Type="String">${lines.length} Items</Data></Cell>
    <Cell ss:StyleID="tot"/>
    <Cell ss:StyleID="tot"><Data ss:Type="Number">${totalQuantity}</Data></Cell>
    <Cell ss:StyleID="tot"/>
    <Cell ss:StyleID="tot"><Data ss:Type="Number">${totalValue}</Data></Cell>
    <Cell ss:StyleID="tot"/><Cell ss:StyleID="tot"/><Cell ss:StyleID="tot"/>
   </Row>
  </Table>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Store_Opening_Stock_${refNum}_${dateStr}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('Excel workbook exported successfully');
  };

  // 7. Print / Export to PDF
  const handlePrintPdf = () => {
    if (lines.length === 0) {
      message.warning('Add lines first before generating PDF');
      return;
    }

    const values = form.getFieldsValue();
    const warehouseObj = warehouses.find((w) => w.id === values.warehouseId);
    const divisionObj = divisions.find((d) => d.id === selectedDivisionId);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    // Header
    doc.setFontSize(18);
    doc.setTextColor(20, 35, 60);
    doc.text('Pakistan Wire Industries (Pvt.) LTD', 40, 42);

    doc.setFontSize(12);
    doc.setTextColor(37, 99, 235);
    doc.text('STORE OPENING STOCK NOTE', 40, 60);

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    const refNum = values.referenceNumber || 'N/A';
    const dateStr = values.transactionDate ? dayjs(values.transactionDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    const warehouseName = warehouseObj?.name || 'N/A';
    const divisionName = divisionObj?.name || 'All Divisions';

    doc.text(`Reference #: ${refNum}`, 40, 80);
    doc.text(`Posting Date: ${dateStr}`, 220, 80);
    doc.text(`Division: ${divisionName}`, 400, 80);
    doc.text(`Target Warehouse: ${warehouseName}`, 580, 80);

    const tableHeaders = [
      ['#', 'Item Code', 'Item Description', 'UOM', 'Quantity', 'Unit Cost (PKR)', 'Total Cost (PKR)', 'Batch #', 'Serial #']
    ];

    const tableData = lines.map((l, idx) => {
      const itm = items.find((i) => i.id === l.itemId);
      const uom = uoms.find((u) => u.id === l.uomId);
      const itemCode = itm?.code || itm?.item_code || l.itemCode || '—';
      const itemName = itm?.name || l.itemName || '—';
      const uomName = uom?.code || uom?.name || '—';
      const lineCost = (Number(l.quantity) || 0) * (Number(l.unitCost) || 0);

      return [
        String(idx + 1),
        itemCode,
        itemName,
        uomName,
        fmt(l.quantity, 2),
        fmt(l.unitCost, 2),
        fmt(lineCost, 2),
        l.batchNumber || '—',
        l.serialNumber || '—',
      ];
    });

    autoTable(doc, {
      head: tableHeaders,
      body: tableData,
      startY: 96,
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [24, 144, 255], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 25, halign: 'center' },
        1: { cellWidth: 95 },
        2: { cellWidth: 220 },
        3: { cellWidth: 50, halign: 'center' },
        4: { cellWidth: 65, halign: 'right' },
        5: { cellWidth: 75, halign: 'right' },
        6: { cellWidth: 80, halign: 'right' },
        7: { cellWidth: 70 },
        8: { cellWidth: 70 },
      },
    });

    // Summary Box & Signatures
    const finalY = (doc as any).lastAutoTable.finalY + 20;

    doc.setFontSize(9);
    doc.setTextColor(30);
    doc.text(`Total Line Items: ${lines.length}`, 40, finalY);
    doc.text(`Total Quantity: ${fmt(totalQuantity, 2)}`, 220, finalY);
    doc.text(`Total Inventory Value: PKR ${fmt(totalValue, 2)}`, 400, finalY);

    // Signatures
    const sigY = finalY + 45;
    doc.setDrawColor(180);
    doc.line(40, sigY, 180, sigY);
    doc.line(320, sigY, 460, sigY);
    doc.line(600, sigY, 740, sigY);

    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Prepared By (Store Officer)', 40, sigY + 14);
    doc.text('Verified By (Inventory Incharge)', 320, sigY + 14);
    doc.text('Authorized By (Plant GM / Director)', 600, sigY + 14);

    doc.save(`Store_Opening_Stock_${refNum}_${dateStr}.pdf`);
    message.success('PDF document generated successfully');
  };

  // 8. Validate & Open Centered Confirmation Modal
  const validateBeforePost = async () => {
    if (lines.length === 0) {
      message.warning('Add at least one opening stock line');
      return null;
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.itemId) {
        message.error(`Line #${i + 1}: Please select an Item`);
        return null;
      }
      if (!l.uomId) {
        message.error(`Line #${i + 1}: Please select a UOM`);
        return null;
      }
      if (!l.quantity || Number(l.quantity) <= 0) {
        message.error(`Line #${i + 1}: Quantity must be greater than 0`);
        return null;
      }
    }

    const values = await form.validateFields().catch(() => null);
    return values || null;
  };

  const handleOpenPostConfirm = async () => {
    const values = await validateBeforePost();
    if (!values) return;
    setPostedSummary({
      lineCount: lines.length,
      refNum: String(values.referenceNumber || ''),
      totalQty: totalQuantity,
      totalVal: totalValue,
    });
    setFeedbackPhase('confirm');
  };

  // Submit to Backend
  const handleSubmit = async () => {
    const values = await validateBeforePost();
    if (!values) return;

    const postedCount = lines.length;
    const postedQty = totalQuantity;
    const postedVal = totalValue;
    const postedRef = String(values.referenceNumber || '');

    setFeedbackPhase('saving');
    setSubmitting(true);
    try {
      const payload = {
        warehouseId: values.warehouseId,
        referenceNumber: values.referenceNumber,
        transactionDate: values.transactionDate ? values.transactionDate.toISOString() : new Date().toISOString(),
        source: 'MANUAL',
        lines: lines.map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost) || 0,
          batchNumber: l.batchNumber || undefined,
          serialNumber: l.serialNumber || undefined,
          notes: l.notes || undefined,
        })),
      };

      await apiService.post('/inventory/opening-stock', payload);
      setLines([]);
      setBalanceRefreshTick((t) => t + 1);

      const todayStr = dayjs().format('YYYYMMDD');
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      form.setFieldsValue({
        referenceNumber: `OPN-${todayStr}-${randomSuffix}`,
        transactionDate: dayjs(),
      });

      setPostedSummary({
        lineCount: postedCount,
        refNum: postedRef,
        totalQty: postedQty,
        totalVal: postedVal,
      });
      setFeedbackPhase('success');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to post opening stock';
      setPostedSummary((prev) => ({
        ...prev,
        errorMessage: Array.isArray(msg) ? msg[0] : String(msg),
      }));
      setFeedbackPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  // Mount Import / Template / Export / Print actions on the Main ERP Header
  const headerActionsRef = useRef({
    openTemplateModal,
    openImportWizard,
    exportToCsv,
    handleExportExcel,
    handlePrintPdf,
  });
  headerActionsRef.current = {
    openTemplateModal,
    openImportWizard,
    exportToCsv,
    handleExportExcel,
    handlePrintPdf,
  };

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    const actions: Array<{ key: string; node: React.ReactNode }> = [];
    if (canCreateOpening) {
      actions.push(
        {
          key: 'os-template-modal',
          node: (
            <Tooltip title="Download pre-filled Division Excel (.xlsx) or CSV template">
              <Button size="small" icon={<DownloadOutlined />} onClick={() => headerActionsRef.current.openTemplateModal()}>
                Download Template
              </Button>
            </Tooltip>
          ),
        },
        {
          key: 'os-import-wizard',
          node: (
            <Tooltip title="Open 3-step Excel / CSV Opening Stock Import Wizard">
              <Button size="small" type="primary" ghost icon={<UploadOutlined />} onClick={() => headerActionsRef.current.openImportWizard()}>
                Import Excel / CSV
              </Button>
            </Tooltip>
          ),
        },
      );
    }
    if (canExportOpening) {
      actions.push(
        {
          key: 'os-export-csv',
          node: (
            <Tooltip title="Export current table lines to CSV">
              <Button size="small" icon={<DownloadOutlined />} disabled={lines.length === 0} onClick={() => headerActionsRef.current.exportToCsv()}>
                Export CSV
              </Button>
            </Tooltip>
          ),
        },
        {
          key: 'os-export-excel',
          node: (
            <Tooltip title="Export styled Excel workbook (.xls)">
              <Button
                size="small"
                icon={<FileExcelOutlined />}
                disabled={lines.length === 0}
                onClick={() => headerActionsRef.current.handleExportExcel()}
                style={{ color: token.colorSuccess, borderColor: token.colorBorder, fontWeight: 600 }}
              >
                Excel
              </Button>
            </Tooltip>
          ),
        },
      );
    }
    if (canPrintOpening) {
      actions.push({
        key: 'os-print-pdf',
        node: (
          <Tooltip title="Download / Print Store Opening Stock PDF">
            <Button
              size="small"
              icon={<FilePdfOutlined />}
              disabled={lines.length === 0}
              onClick={() => headerActionsRef.current.handlePrintPdf()}
              style={{ color: token.colorError, borderColor: token.colorBorder, fontWeight: 600 }}
            >
              PDF
            </Button>
          </Tooltip>
        ),
      });
    }
    setHeaderActions(actions);
    return () => clearHeaderActions();
  }, [lines.length, canCreateOpening, canExportOpening, canPrintOpening, token.colorBorder, token.colorError, token.colorSuccess, setHeaderActions, clearHeaderActions]);

  const visibleItems = useMemo(() => {
    const wh = warehouses.find((w) => w.id === selectedWarehouseId);
    const whType = String((wh as any)?.warehouseType || (wh as any)?.warehouse_type || '').toUpperCase();
    const isManufacturingSpecificWh = whType === 'RAW_MATERIAL' || whType === 'FINISHED_GOODS' || whType === 'WIP';
    if (isManufacturingSpecificWh) return items;
    const excluded = new Set(['RAW_MATERIAL', 'FINISHED_GOOD', 'WORK_IN_PROGRESS', 'SEMI_FINISHED']);
    return items.filter(
      (i) =>
        Boolean((i as any).isStoreItem ?? (i as any).is_store_item) &&
        !excluded.has(String(i.itemType || '').toUpperCase()),
    );
  }, [items, warehouses, selectedWarehouseId]);

  const lineColumns: ColumnsType<OpeningStockLine> = [
    {
      title: '#',
      key: 'index',
      width: 44,
      align: 'center',
      render: (_: unknown, __, idx) => (
        <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</Text>
      ),
    },
    {
      title: 'Item',
      dataIndex: 'itemId',
      key: 'itemId',
      width: 340,
      render: (_: unknown, record) => (
        <Tooltip title={record.itemName ? `${record.itemCode || ''} — ${record.itemName}` : undefined}>
          <Select
            size="small"
            showSearch
            optionFilterProp="searchValue"
            popupMatchSelectWidth={false}
            styles={{ popup: { root: { minWidth: 640, maxWidth: 'min(880px, 94vw)' } } }}
            listHeight={360}
            loading={loadingItems}
            disabled={!selectedDivisionId}
            placeholder={selectedDivisionId ? 'Search by item code or name' : 'Select a division first'}
            notFoundContent={loadingItems ? 'Loading division items...' : 'No items found in this division'}
            value={record.itemId || undefined}
            onChange={(v) => updateLine(record.key, 'itemId', v)}
            style={{ width: '100%' }}
            optionLabelProp="shortLabel"
            options={visibleItems.map((i) => ({
              value: i.id,
              shortLabel: `${i.code || i.item_code || ''} — ${i.name}`.trim(),
              searchValue: `${i.code || ''} ${i.item_code || ''} ${i.name || ''}`,
              code: i.code || i.item_code || '',
              name: i.name,
              itemType: i.itemType,
              uomCode: i.uomCode,
            }))}
            optionRender={(option) => (
              <div style={{ padding: '4px 2px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ lineHeight: 1.4, whiteSpace: 'normal' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: token.colorPrimary, marginRight: 8 }}>
                    {option.data.code}
                  </span>
                  <span>{option.data.name}</span>
                </div>
                <div style={{ whiteSpace: 'nowrap', fontSize: 11, opacity: 0.75 }}>
                  {option.data.itemType ? String(option.data.itemType).replace(/_/g, ' ') : ''}
                  {option.data.uomCode ? ` · ${option.data.uomCode}` : ''}
                </div>
              </div>
            )}
          />
        </Tooltip>
      ),
    },
    {
      title: 'UOM',
      dataIndex: 'uomId',
      key: 'uomId',
      width: 105,
      render: (_: unknown, record) => (
        <Select
          size="small"
          placeholder="UOM"
          value={record.uomId || undefined}
          onChange={(v) => updateLine(record.key, 'uomId', v)}
          style={{ width: '100%' }}
          options={uoms.map((u) => ({ value: u.id, label: u.code || u.name }))}
        />
      ),
    },
    {
      title: 'Current Stock',
      key: 'currentStock',
      width: 165,
      align: 'right',
      render: (_: unknown, record) => {
        if (!record.itemId) {
          return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
        }
        const currentStock = warehouseBalances.get(record.itemId) || 0;
        return (
          <Space size={6} style={{ whiteSpace: 'nowrap' }}>
            <Text
              strong
              style={{
                fontVariantNumeric: 'tabular-nums',
                color: currentStock > 0 ? token.colorWarning : token.colorTextSecondary,
              }}
            >
              {fmt(currentStock, 2)}
            </Text>
            {currentStock > 0 && (
              <Tag color="warning" style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>
                In Stock
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Opening Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 120,
      render: (_: unknown, record) => (
        <InputNumber
          size="small"
          controls={false}
          min={0}
          value={record.quantity === 0 ? null : record.quantity}
          placeholder="0"
          onFocus={(e) => e.target.select()}
          onChange={(v) => updateLine(record.key, 'quantity', v !== null && v !== undefined ? Number(v) : 0)}
          formatter={(v) => (v !== undefined && v !== null ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
          parser={(v) => (v ? parseFloat(v.replace(/,/g, '')) : 0)}
          style={{ width: '100%', fontVariantNumeric: 'tabular-nums' }}
        />
      ),
    },
    {
      title: 'Unit Cost (PKR)',
      dataIndex: 'unitCost',
      key: 'unitCost',
      width: 135,
      render: (_: unknown, record) => (
        <InputNumber
          size="small"
          controls={false}
          min={0}
          value={record.unitCost === 0 ? null : record.unitCost}
          placeholder="0"
          onFocus={(e) => e.target.select()}
          onChange={(v) => updateLine(record.key, 'unitCost', v !== null && v !== undefined ? Number(v) : 0)}
          formatter={(v) => (v !== undefined && v !== null ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
          parser={(v) => (v ? parseFloat(v.replace(/,/g, '')) : 0)}
          style={{ width: '100%', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
        />
      ),
    },
    {
      title: 'Total Cost (PKR)',
      key: 'totalCost',
      width: 135,
      align: 'right',
      render: (_: unknown, record) => (
        <Text strong style={{ color: token.colorPrimary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {fmt((Number(record.quantity) || 0) * (Number(record.unitCost) || 0))}
        </Text>
      ),
    },
    {
      title: 'Batch #',
      dataIndex: 'batchNumber',
      key: 'batchNumber',
      width: 120,
      render: (_: unknown, record) => (
        <Input
          size="small"
          placeholder="Optional"
          value={record.batchNumber}
          onChange={(e) => updateLine(record.key, 'batchNumber', e.target.value)}
        />
      ),
    },
    {
      title: 'Serial #',
      dataIndex: 'serialNumber',
      key: 'serialNumber',
      width: 120,
      render: (_: unknown, record) => (
        <Input
          size="small"
          placeholder="Optional"
          value={record.serialNumber}
          onChange={(e) => updateLine(record.key, 'serialNumber', e.target.value)}
        />
      ),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      width: 150,
      render: (_: unknown, record) => (
        <Input
          size="small"
          placeholder="Notes / Remarks"
          value={record.notes}
          onChange={(e) => updateLine(record.key, 'notes', e.target.value)}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 40,
      align: 'center',
      render: (_: unknown, record) => (
        <Tooltip title="Remove Line">
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeLine(record.key)}
            size="small"
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <style>{`
        .opening-stock-compact-table .ant-table-cell {
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
      `}</style>

      {/* Page Header */}
      <div style={{ marginBottom: 20 }}>
        <Space align="center" size={12}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `linear-gradient(135deg, ${token.colorPrimary} 0%, ${token.colorInfo} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: token.boxShadowSecondary,
          }}>
            <DatabaseOutlined style={{ fontSize: 20, color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: token.colorText, lineHeight: 1.2 }}>
              Store Opening Stock
            </div>
            <div style={{ fontSize: 12.5, color: token.colorTextSecondary, marginTop: 2 }}>
              Post initial stock balances, bulk import pre-filled Division templates, and manage batch history
            </div>
          </div>
        </Space>
      </div>

      {/* Dashboard-Style Filter / Parameters Panel */}
      <div style={{
        background: `var(--theme-surface, ${token.colorBgContainer})`,
        border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 16,
      }}>
        <Form form={form} layout="vertical" style={{ margin: 0 }}>
          <Row gutter={[12, 12]} align="stretch">
            <Col xs={24} sm={12} md={6}>
              <div style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
                background: token.colorFillAlter,
                height: '100%',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: token.colorTextTertiary, marginBottom: 4 }}>
                  <ApartmentOutlined style={{ marginRight: 5, color: token.colorWarning }} />
                  Division
                </div>
                <Select
                  placeholder="Select division"
                  variant="borderless"
                  showSearch
                  optionFilterProp="label"
                  value={selectedDivisionId}
                  onChange={(val) => {
                    setSelectedDivisionId(val);
                    form.setFieldValue('warehouseId', undefined);
                    setLines([{ key: `line-${Date.now()}`, itemId: '', uomId: '', quantity: 1, unitCost: 0 }]);
                  }}
                  options={divisions.map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                  style={{ width: '100%', fontWeight: 600 }}
                />
              </div>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <div style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
                background: token.colorFillAlter,
                height: '100%',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: token.colorTextTertiary, marginBottom: 4 }}>
                  <ShopOutlined style={{ marginRight: 5, color: token.colorInfo }} />
                  Warehouse <span style={{ color: token.colorError }}>*</span>
                </div>
                <Form.Item
                  name="warehouseId"
                  rules={[{ required: true, message: 'Select a warehouse' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Select
                    variant="borderless"
                    placeholder={selectedDivisionId ? 'Select warehouse' : 'Select division first'}
                    disabled={!selectedDivisionId}
                    notFoundContent="No warehouse configured for this division"
                    popupMatchSelectWidth={false}
                    showSearch
                    optionFilterProp="label"
                    options={filteredWarehouses.map((w) => ({
                      value: w.id,
                      label: `${(w as any).warehouseCode || w.code || w.warehouse_code || ''} — ${w.name}`,
                    }))}
                    style={{ width: '100%', fontWeight: 600 }}
                  />
                </Form.Item>
              </div>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <div style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
                background: token.colorFillAlter,
                height: '100%',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: token.colorTextTertiary, marginBottom: 4 }}>
                  <NumberOutlined style={{ marginRight: 5, color: token.colorPrimary }} />
                  Reference # <span style={{ color: token.colorError }}>*</span>
                </div>
                <Form.Item
                  name="referenceNumber"
                  rules={[{ required: true, message: 'Reference required' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Input variant="borderless" placeholder="e.g. OPN-20260920-001" style={{ fontWeight: 600, paddingLeft: 0 }} />
                </Form.Item>
              </div>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <div style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
                background: token.colorFillAlter,
                height: '100%',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: token.colorTextTertiary, marginBottom: 4 }}>
                  <CalendarOutlined style={{ marginRight: 5, color: token.colorSuccess }} />
                  Posting Date
                </div>
                <Form.Item
                  name="transactionDate"
                  style={{ marginBottom: 0 }}
                >
                  <DatePicker variant="borderless" style={{ width: '100%', fontWeight: 600, paddingLeft: 0 }} />
                </Form.Item>
              </div>
            </Col>
          </Row>
        </Form>
      </div>

      {/* Theme-Aware Summary KPI Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <div style={{
            background: `var(--theme-surface, ${token.colorBgContainer})`,
            border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
            borderTop: `3px solid ${token.colorPrimary}`,
            borderRadius: 10,
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Line Items
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: token.colorText, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              <DatabaseOutlined style={{ fontSize: 16, marginRight: 8, color: token.colorPrimary }} />
              {lines.length}
            </div>
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div style={{
            background: `var(--theme-surface, ${token.colorBgContainer})`,
            border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
            borderTop: `3px solid ${token.colorSuccess}`,
            borderRadius: 10,
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Quantity
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: token.colorSuccess, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(totalQuantity, 2)}
            </div>
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div style={{
            background: `var(--theme-surface, ${token.colorBgContainer})`,
            border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
            borderTop: `3px solid ${token.colorInfo}`,
            borderRadius: 10,
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Value (PKR)
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: token.colorInfo, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(totalValue, 2)}
            </div>
          </div>
        </Col>
      </Row>

      {/* Table Card */}
      <Card
        style={{
          borderRadius: 12,
          boxShadow: token.boxShadowTertiary,
        }}
        styles={{ header: { borderBottom: `1px solid ${token.colorBorderSecondary}` } }}
        title={
          <Space size={10}>
            <FileTextOutlined style={{ color: token.colorPrimary }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Opening Stock Lines</span>
            <Tag color={lines.length > 0 ? 'blue' : 'default'} style={{ margin: 0, borderRadius: 10, fontWeight: 600 }}>
              {lines.length} {lines.length === 1 ? 'item' : 'items'}
            </Tag>
          </Space>
        }
        extra={
          <Space size={8} wrap>
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={openHistoryModal}
            >
              Opening Stock History
            </Button>
            {lines.length > 0 && (
              <Button size="small" danger icon={<ClearOutlined />} onClick={() => setClearConfirmOpen(true)}>
                Clear All
              </Button>
            )}
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addLine}>
              Add Line
            </Button>
          </Space>
        }
      >
        <Table
          className="opening-stock-compact-table"
          dataSource={lines}
          columns={lineColumns}
          rowKey="key"
          pagination={false}
          size="small"
          locale={{ emptyText: 'No opening stock lines added. Click "Add Line" or "Import Excel / CSV" to begin.' }}
          scroll={{ x: 'max-content' }}
        />

        {lines.length > 0 && (
          <div style={{
            marginTop: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            padding: '12px 16px',
            background: token.colorFillAlter,
            borderRadius: 8,
            border: `1px solid ${token.colorBorderSecondary}`,
          }}>
            <Text type="secondary" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
              Items: <strong>{lines.length}</strong> &nbsp;|&nbsp; Total Qty: <strong>{fmt(totalQuantity, 2)}</strong> &nbsp;|&nbsp; Total Value: <strong>PKR {fmt(totalValue, 2)}</strong>
            </Text>
            {canCreateOpening && (
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={submitting}
              onClick={handleOpenPostConfirm}
              size="large"
              style={{
                borderRadius: 8,
                fontWeight: 600,
              }}
            >
              Post Opening Stock
            </Button>
            )}
          </div>
        )}
      </Card>

      <Modal
        open={clearConfirmOpen}
        centered
        title="Clear All Lines?"
        onCancel={() => setClearConfirmOpen(false)}
        onOk={() => {
          clearAllLines();
          setClearConfirmOpen(false);
        }}
        okText="Clear All"
        cancelText="Go Back"
        okButtonProps={{ danger: true }}
      >
        <Text type="secondary">
          This will remove all {lines.length} {lines.length === 1 ? 'line' : 'lines'} from this form. Already posted records are not affected.
        </Text>
      </Modal>

      <ConfirmAndSuccessModal
        open={feedbackPhase !== 'idle'}
        phase={feedbackPhase}
        confirmTitle="Confirm & Post Opening Stock"
        confirmDescription="This will record initial stock ledger entries and update inventory balances immediately."
        confirmText="Confirm & Post"
        savingText="Saving..."
        savingSubtext="Updating store ledger & stock balances"
        referenceNumber={postedSummary.refNum}
        successMessage={`${postedSummary.lineCount} ${postedSummary.lineCount === 1 ? 'line' : 'lines'} posted (PKR ${fmt(postedSummary.totalVal, 2)}).`}
        extraSuccessAction={{
          label: 'View in Store Stock Balance',
          onClick: () => {
            setFeedbackPhase('idle');
            navigate('/store/stock-balance');
          },
        }}
        errorMessage={postedSummary.errorMessage}
        summaryRows={[
          { label: 'Reference #', value: postedSummary.refNum || '—' },
          { label: 'Line Items', value: postedSummary.lineCount },
          { label: 'Total Quantity', value: fmt(postedSummary.totalQty, 2) },
          { label: 'Total Value', value: `PKR ${fmt(postedSummary.totalVal, 2)}`, highlight: true },
        ]}
        confirmAlert={
          duplicateStockLines.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              message={`${duplicateStockLines.length} ${duplicateStockLines.length === 1 ? 'item already has' : 'items already have'} stock in this warehouse`}
              description="Posting Opening Stock will add to the existing stock balance. Please verify quantities to avoid double-counting."
            />
          ) : undefined
        }
        onConfirm={handleSubmit}
        onCancel={() => setFeedbackPhase('idle')}
        onOk={() => setFeedbackPhase('idle')}
      />

      <OpeningStockTemplateModal
        open={templateModalOpen}
        onClose={() => setActiveModal((cur) => (cur === 'template' ? 'none' : cur))}
        divisions={divisions}
        warehouses={warehouses}
        selectedDivisionId={selectedDivisionId}
        selectedWarehouseId={selectedWarehouseId}
        allItems={allItems}
        warehouseBalances={warehouseBalances}
        onOpenImportWizard={openImportWizard}
        onSelectScope={(divId, whId) => {
          if (divId && divId !== selectedDivisionId) {
            setSelectedDivisionId(divId);
          }
          if (whId) {
            form.setFieldValue('warehouseId', whId);
          }
        }}
      />

      <OpeningStockImportWizardModal
        open={importWizardOpen}
        onClose={() => setActiveModal((cur) => (cur === 'import' ? 'none' : cur))}
        divisions={divisions}
        warehouses={warehouses}
        allItems={allItems}
        uoms={uoms}
        warehouseBalances={warehouseBalances}
        initialDivisionId={selectedDivisionId}
        initialWarehouseId={selectedWarehouseId}
        initialDate={selectedDateValue}
        initialReference={selectedReferenceValue}
        onOpenTemplateModal={openTemplateModal}
        onCopyToLinesGrid={(importedLines, divId, whId) => {
          if (divId && divId !== selectedDivisionId) {
            setSelectedDivisionId(divId);
          }
          if (whId) {
            form.setFieldValue('warehouseId', whId);
          }
          const nextLines: OpeningStockLine[] = importedLines.map((il, i) => ({
            key: `wizard-${Date.now()}-${i}`,
            itemId: il.itemId,
            itemCode: il.itemCode,
            itemName: il.itemName,
            uomId: il.uomId,
            quantity: il.quantity,
            unitCost: il.unitCost,
            batchNumber: il.batchNumber,
            serialNumber: il.serialNumber,
            notes: il.notes,
          }));
          setLines((prev) => {
            const nonEmpty = prev.filter((l) => l.itemId);
            return [...nonEmpty, ...nextLines];
          });
        }}
        onBatchPosted={() => {
          setBalanceRefreshTick((t) => t + 1);
          const todayStr = dayjs().format('YYYYMMDD');
          const randomSuffix = Math.floor(100 + Math.random() * 900);
          form.setFieldsValue({
            referenceNumber: `OPN-${todayStr}-${randomSuffix}`,
            transactionDate: dayjs(),
          });
        }}
        onViewHistory={openHistoryModal}
      />

      <OpeningStockHistoryModal
        open={historyOpen}
        onClose={() => setActiveModal((cur) => (cur === 'history' ? 'none' : cur))}
        divisions={divisions}
        warehouses={warehouses}
        onHistoryChanged={() => setBalanceRefreshTick((t) => t + 1)}
      />
    </div>
  );
};

export default OpeningStock;
