import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Tabs,
  Select,
  DatePicker,
  Input,
  InputNumber,
  Button,
  Table,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Statistic,
  Alert,
  Popconfirm,
  App,
  Badge,
  Upload,
  Tooltip,
} from 'antd';
import {
  DatabaseOutlined,
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  BarChartOutlined,
  HistoryOutlined,
  SyncOutlined,
  DownloadOutlined,
  UploadOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ClearOutlined,
  ShopOutlined,
  CalculatorOutlined,
  ApartmentOutlined,
  MinusOutlined,
  LockOutlined,
  UnlockOutlined,
  BranchesOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import './productionItemOpenStock.css';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// Type definitions
export interface MatrixItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  uomId?: string;
  uomCode: string;
  baseUomSymbol?: string;
  primaryStock: number;
  isKg: boolean;
  weightPerPiece: number;
  convertedWeightKg: number;
  convertedPieces: number;
  unitCost: number;
  totalValuation: number;
}

export interface DepartmentStockMatrixRow {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  warehouseType: string;
  inferredDivision: string;
  divisionCode: string;
  divisionName: string;
  summary: {
    totalItems: number;
    totalWeightKg: number;
    totalPieces: number;
    totalValuation: number;
  };
  items: MatrixItem[];
}

export interface ProductionWarehouse {
  id: string;
  warehouseCode: string;
  warehouseName?: string;
  name?: string;
  divisionId?: string;
  divisionName?: string;
  departmentId?: string;
  departmentName?: string;
}

export interface ProductionItem {
  id: string;
  itemCode: string;
  name?: string;
  itemName?: string;
  itemType: string;
  categoryName?: string;
  uomId?: string;
  baseUomId?: string;
  uomName?: string;
  uomCode?: string;
  currentBalance: number;
  weightPerPiece?: number | null;
  piecesPerKg?: number | null;
  unitCost?: number;
  costPrice?: number;
}

export interface OpenStockLine {
  key: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  uomId: string;
  uomCode: string;
  currentBalance: number;
  quantity: number; // Pieces or base units
  weightPerPiece: number; // Weight per piece in Kg (e.g. 0.009670)
  totalWeightKg: number; // Calculated: quantity * weightPerPiece
  unitCost: number; // Rate per Kg (or per piece if no weight)
  batchNumber?: string;
  notes?: string;
}

export interface StockAdjustmentLine {
  key: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  uomId: string;
  uomCode: string;
  systemQuantity: number;
  physicalQuantity: number;
  weightPerPiece: number;
  systemWeightKg: number;
  physicalWeightKg: number;
  unitCost: number;
  reason: string;
  notes?: string;
}

export interface HistoryRecord {
  id: string;
  transactionType: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  balanceAfter: number;
  referenceType: string;
  referenceNumber: string;
  notes: string;
  createdAt: string;
  item?: {
    id: string;
    itemCode: string;
    name?: string;
    itemName?: string;
    itemType: string;
  };
  warehouse?: {
    id: string;
    warehouseCode: string;
    warehouseName?: string;
    name?: string;
  };
  user?: {
    id: string;
    fullName: string;
  };
}

export interface StatsData {
  totalItemsCount?: number;
  totalStockQty?: number;
  totalStockValue?: number;
  byItemType?: Array<{ type: string; count: number; totalQty?: number; totalValue?: number }>;
  byWarehouse?: Array<{ warehouseId?: string; warehouseName?: string; warehouseCode?: string; totalQty?: number; totalValue?: number }>;
  adjustmentsSummary?: { totalAdjustments?: number; surplusCount?: number; shortageCount?: number; netVarianceQty?: number };
  summary?: {
    totalStockQty: number;
    totalItems: number;
    surplusCount: number;
    surplusQty: number;
    shortageCount: number;
    shortageQty: number;
    netVarianceQty: number;
  };
  itemTypes?: Array<{ type: string; count: number; qty: number; percentage: number }>;
  warehouses?: Array<{ id: string; code: string; name: string; itemCount: number; qty: number }>;
  adjustments?: { surplusCount: number; surplusQty: number; shortageCount: number; shortageQty: number };
}

const ITEM_TYPE_COLORS: Record<string, string> = {
  RAW_MATERIAL: 'purple',
  WORK_IN_PROGRESS: 'blue',
  SEMI_FINISHED: 'orange',
  FINISHED_GOOD: 'green',
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  RAW_MATERIAL: 'Raw Material',
  WORK_IN_PROGRESS: 'Work In Progress',
  SEMI_FINISHED: 'Semi-Finished',
  FINISHED_GOOD: 'Finished Good',
};

const fmtNum = (num?: number | null, decimals = 2) => {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return '0';
  return Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

export const ProductionItemOpenStock: React.FC = () => {
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState<string>('opening');

  // Master Data state
  const [warehouses, setWarehouses] = useState<ProductionWarehouse[]>([]);
  const [items, setItems] = useState<ProductionItem[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);

  // Tab 1: Opening Stock Form State
  const [cutoffDate, setCutoffDate] = useState<dayjs.Dayjs>(dayjs('2026-09-30'));
  const [referenceNumber, setReferenceNumber] = useState<string>(`POS-${dayjs().format('YYYYMMDD-HHmm')}`);
  const [generalNotes, setGeneralNotes] = useState<string>('Initial cutoff floor stock balance entry');
  const [openStockLines, setOpenStockLines] = useState<OpenStockLine[]>([]);
  const [submittingOpenStock, setSubmittingOpenStock] = useState(false);
  const [filterItemType, setFilterItemType] = useState<string>('ALL');

  // Tab 2: Stock Adjustment State
  const [adjWarehouseId, setAdjWarehouseId] = useState<string>('');
  const [adjDate, setAdjDate] = useState<dayjs.Dayjs>(dayjs());
  const [adjReferenceNumber, setAdjReferenceNumber] = useState<string>(`PSA-${dayjs().format('YYYYMMDD-HHmm')}`);
  const [adjDefaultReason, setAdjDefaultReason] = useState<string>('PHYSICAL_COUNT_DISCREPANCY');
  const [adjGeneralNotes, setAdjGeneralNotes] = useState<string>('Floor physical verification adjustment');
  const [adjLines, setAdjLines] = useState<StockAdjustmentLine[]>([]);
  const [submittingAdj, setSubmittingAdj] = useState(false);

  // Tab 3: Stats & Analytics State
  const [stats, setStats] = useState<StatsData | null>(null);

  // Tab 4: History State
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilterType, setHistoryFilterType] = useState<string>('ALL');
  const [historyWarehouseId, setHistoryWarehouseId] = useState<string>('ALL');
  const [historySearch, setHistorySearch] = useState<string>('');

  // Tab 5: Department Stock Matrix & Hierarchy State
  const [matrixData, setMatrixData] = useState<DepartmentStockMatrixRow[]>([]);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [matrixDivision, setMatrixDivision] = useState<string>('ALL');
  const [matrixSearch, setMatrixSearch] = useState<string>('');
  const [expandedWhKeys, setExpandedWhKeys] = useState<string[]>([]);
  const [isReorderMode, setIsReorderMode] = useState<boolean>(false);

  // 1. Load Production Warehouses on Mount
  const loadWarehouses = useCallback(async () => {
    setLoadingWarehouses(true);
    try {
      const res = await apiService.get<{ success: boolean; data: ProductionWarehouse[] }>('/production/open-stock/warehouses');
      if (res && res.data) {
        setWarehouses(res.data);
        if (res.data.length > 0) {
          setSelectedWarehouseId((prev) => prev || res.data[0].id);
          setAdjWarehouseId((prev) => prev || res.data[0].id);
        }
      }
    } catch (err: any) {
      message.error(err?.message || 'Failed to load production floor warehouses');
    } finally {
      setLoadingWarehouses(false);
    }
  }, [message]);

  // 2. Load Items for Selected Warehouse
  const loadItems = useCallback(async (warehouseId?: string) => {
    setLoadingItems(true);
    try {
      const params: any = {};
      if (warehouseId) params.warehouseId = warehouseId;
      const res = await apiService.get<{ success: boolean; data: ProductionItem[] }>('/production/open-stock/items', params);
      if (res && res.data) {
        setItems(res.data);
      }
    } catch (err: any) {
      message.error(err?.message || 'Failed to load production items');
    } finally {
      setLoadingItems(false);
    }
  }, [message]);

  // 3. Load Stats
  const loadStats = useCallback(async (warehouseId?: string) => {
    try {
      const params: any = {};
      if (warehouseId) params.warehouseId = warehouseId;
      const res = await apiService.get<{ success: boolean; data: StatsData }>('/production/open-stock/stats', params);
      if (res && res.data) {
        setStats(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  // 4. Load History (defaults to ALL warehouses so records are never hidden)
  const loadHistory = useCallback(async (warehouseId?: string) => {
    setLoadingHistory(true);
    try {
      const params: any = { limit: 100 };
      if (warehouseId && warehouseId !== 'ALL') params.warehouseId = warehouseId;
      const res = await apiService.get<{ success: boolean; data: HistoryRecord[]; total: number }>('/production/open-stock/history', params);
      if (res && res.data) {
        setHistoryRecords(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // 5. Load Department Stock Matrix (Tab 5)
  const loadMatrix = useCallback(async (divId?: string, search?: string) => {
    setLoadingMatrix(true);
    try {
      const params: any = {};
      if (divId && divId !== 'ALL') params.divisionId = divId;
      if (search && search.trim()) params.search = search.trim();

      const res = await apiService.get<{ success: boolean; data: DepartmentStockMatrixRow[] }>(
        '/production/open-stock/matrix',
        params,
      );
      if (res && res.data) {
        let rows = res.data;

        // Apply saved custom order if present
        const storageKey = `pwi_prod_matrix_wh_order_${divId || 'ALL'}`;
        const savedOrderJson = localStorage.getItem(storageKey);
        if (savedOrderJson) {
          try {
            const savedOrder: string[] = JSON.parse(savedOrderJson);
            if (Array.isArray(savedOrder) && savedOrder.length > 0) {
              const orderMap = new Map<string, number>();
              savedOrder.forEach((id, idx) => orderMap.set(id, idx));
              rows = [...rows].sort((a, b) => {
                const posA = orderMap.has(a.warehouseId) ? orderMap.get(a.warehouseId)! : 9999;
                const posB = orderMap.has(b.warehouseId) ? orderMap.get(b.warehouseId)! : 9999;
                return posA - posB;
              });
            }
          } catch {
            // fallback
          }
        }
        setMatrixData(rows);
      }
    } catch (err: any) {
      console.error('Failed to load department stock matrix:', err);
    } finally {
      setLoadingMatrix(false);
    }
  }, []);

  const handleMoveWarehouse = (index: number, direction: 'UP' | 'DOWN') => {
    const targetIdx = direction === 'UP' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= matrixData.length) return;

    const newRows = [...matrixData];
    const temp = newRows[index];
    newRows[index] = newRows[targetIdx];
    newRows[targetIdx] = temp;

    setMatrixData(newRows);
  };

  const handleSaveCustomOrder = () => {
    const storageKey = `pwi_prod_matrix_wh_order_${matrixDivision || 'ALL'}`;
    const order = matrixData.map((r) => r.warehouseId);
    localStorage.setItem(storageKey, JSON.stringify(order));
    setIsReorderMode(false);
    message.success('Custom department arrangement saved permanently for this division!');
  };

  const handleResetOrder = () => {
    const storageKey = `pwi_prod_matrix_wh_order_${matrixDivision || 'ALL'}`;
    localStorage.removeItem(storageKey);
    loadMatrix(matrixDivision, matrixSearch);
    message.info('Department arrangement reset to default code sequence.');
  };

  const handleToggleExpandWh = (warehouseId: string) => {
    setExpandedWhKeys((prev) =>
      prev.includes(warehouseId) ? prev.filter((k) => k !== warehouseId) : [...prev, warehouseId],
    );
  };

  const handleExpandAllWh = () => {
    setExpandedWhKeys(matrixData.map((r) => r.warehouseId));
  };

  const handleCollapseAllWh = () => {
    setExpandedWhKeys([]);
  };

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    if (selectedWarehouseId) {
      loadItems(selectedWarehouseId);
    }
  }, [selectedWarehouseId, loadItems]);

  useEffect(() => {
    if (activeTab === 'analytics') {
      loadStats(selectedWarehouseId);
    } else if (activeTab === 'history') {
      loadHistory(historyWarehouseId);
    } else if (activeTab === 'matrix') {
      loadMatrix(matrixDivision, matrixSearch);
    }
  }, [activeTab, selectedWarehouseId, historyWarehouseId, loadStats, loadHistory, loadMatrix, matrixDivision, matrixSearch]);

  // Helper map for fast item lookup
  const itemsMap = useMemo(() => {
    const map = new Map<string, ProductionItem>();
    items.forEach((it) => map.set(it.id, it));
    return map;
  }, [items]);

  // Auto-sync item weights if lines are present and items finish loading
  useEffect(() => {
    if (items.length > 0 && openStockLines.length > 0) {
      let changed = false;
      const updatedLines = openStockLines.map((line) => {
        if (!line.itemId) return line;
        const it = itemsMap.get(line.itemId);
        if (it && it.weightPerPiece && Number(it.weightPerPiece) > 0 && (!line.weightPerPiece || line.weightPerPiece === 0)) {
          changed = true;
          const wt = Number(it.weightPerPiece);
          const totWt = Number(((line.quantity || 0) * wt).toFixed(4));
          return {
            ...line,
            weightPerPiece: wt,
            totalWeightKg: totWt,
          };
        }
        return line;
      });
      if (changed) {
        setOpenStockLines(updatedLines);
      }
    }
  }, [items, itemsMap]);

  // -------------------------------------------------------------------------
  // Tab 1 Actions: Opening Stock
  // -------------------------------------------------------------------------
  const handleAddLine = () => {
    const newLine: OpenStockLine = {
      key: `line-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      itemId: '',
      itemCode: '',
      itemName: '',
      itemType: filterItemType !== 'ALL' ? filterItemType : '',
      uomId: '',
      uomCode: '',
      currentBalance: 0,
      quantity: 0,
      weightPerPiece: 0,
      totalWeightKg: 0,
      unitCost: 0,
      batchNumber: `BAT-${dayjs().format('YYMM')}`,
      notes: '',
    };
    setOpenStockLines((prev) => [...prev, newLine]);
  };

  const handleAutoPopulateFloorItems = () => {
    if (items.length === 0) {
      message.warning('No production items found for this department/division.');
      return;
    }
    const populatedLines: OpenStockLine[] = items.map((it) => {
      const itemName = it.itemName || it.name || it.itemCode;
      const uom = it.uomCode || (it as any).baseUom?.code || (it as any).baseUom?.symbol || 'PCS';
      const cost = it.unitCost ?? (it as any).costPrice ?? 0;
      const weightPerPiece = it.weightPerPiece && Number(it.weightPerPiece) > 0 ? Number(it.weightPerPiece) : 0;
      const qty = it.currentBalance > 0 ? it.currentBalance : 0;
      const totalWeightKg = weightPerPiece > 0
        ? Number((qty * weightPerPiece).toFixed(4))
        : (uom.toUpperCase() === 'KG' ? qty : 0);

      return {
        key: `auto-${it.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        itemId: it.id,
        itemCode: it.itemCode,
        itemName: itemName,
        itemType: it.itemType,
        uomId: it.uomId || it.baseUomId || '',
        uomCode: uom,
        currentBalance: it.currentBalance || 0,
        quantity: qty,
        weightPerPiece,
        totalWeightKg,
        unitCost: cost,
        batchNumber: `OPN-${dayjs().format('YYMM')}`,
        notes: 'Cutoff balance 30th date',
      };
    });
    setOpenStockLines(populatedLines);
    message.success(`Loaded ${populatedLines.length} production items with names & weight rates!`);
  };

  const handleUpdateLine = (key: string, field: keyof OpenStockLine, value: any) => {
    setOpenStockLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;

        let updated = { ...line };

        if (field === 'itemId') {
          const selected = itemsMap.get(value);
          if (selected) {
            const itemName = selected.itemName || selected.name || selected.itemCode;
            const uom = selected.uomCode || (selected as any).baseUom?.code || (selected as any).baseUom?.symbol || 'PCS';
            const cost = selected.unitCost ?? (selected as any).costPrice ?? 0;
            const weightPerPiece = selected.weightPerPiece && Number(selected.weightPerPiece) > 0 ? Number(selected.weightPerPiece) : 0;
            const qty = line.quantity || 0;
            const totalWeightKg = weightPerPiece > 0
              ? Number((qty * weightPerPiece).toFixed(4))
              : (uom.toUpperCase() === 'KG' ? qty : 0);

            updated = {
              ...line,
              itemId: selected.id,
              itemCode: selected.itemCode,
              itemName: itemName,
              itemType: selected.itemType,
              uomId: selected.uomId || selected.baseUomId || '',
              uomCode: uom,
              currentBalance: selected.currentBalance || 0,
              weightPerPiece,
              totalWeightKg,
              unitCost: cost,
            };
          }
        } else if (field === 'quantity') {
          const newQty = Number(value) || 0;
          const totalWeightKg = line.weightPerPiece > 0
            ? Number((newQty * line.weightPerPiece).toFixed(4))
            : (line.uomCode?.toUpperCase() === 'KG' ? newQty : 0);
          updated = { ...line, quantity: newQty, totalWeightKg };
        } else if (field === 'weightPerPiece') {
          const newWeight = Number(value) || 0;
          const totalWeightKg = newWeight > 0
            ? Number(((line.quantity || 0) * newWeight).toFixed(4))
            : (line.uomCode?.toUpperCase() === 'KG' ? (line.quantity || 0) : 0);
          updated = { ...line, weightPerPiece: newWeight, totalWeightKg };
        } else {
          updated = { ...line, [field]: value };
        }

        return updated;
      })
    );
  };

  const handleDeleteLine = (key: string) => {
    setOpenStockLines((prev) => prev.filter((line) => line.key !== key));
  };

  const handleClearAllLines = () => {
    setOpenStockLines([]);
    message.info('All lines cleared.');
  };

  // CSV Template Download
  const handleDownloadTemplate = () => {
    const headers = [
      'ItemCode',
      'ItemName',
      'ItemType',
      'UOM',
      'OpeningQuantityPcs',
      'PerPieceWeightKg',
      'TotalWeightKg',
      'RatePerKg',
      'BatchNumber',
      'Notes',
    ];
    const sampleRows = items.slice(0, 15).map((it) => {
      const name = it.itemName || it.name || it.itemCode;
      const uom = it.uomCode || (it as any).baseUom?.code || 'PCS';
      const cost = it.unitCost ?? (it as any).costPrice ?? 0;
      const wt = it.weightPerPiece && Number(it.weightPerPiece) > 0 ? Number(it.weightPerPiece) : 0;
      const qty = it.currentBalance || 100;
      const totWt = wt > 0 ? (qty * wt).toFixed(4) : (uom.toUpperCase() === 'KG' ? qty : 0);
      return [
        `"${it.itemCode}"`,
        `"${name.replace(/"/g, '""')}"`,
        `"${it.itemType}"`,
        `"${uom}"`,
        qty,
        wt,
        totWt,
        cost,
        `"BATCH-001"`,
        `"Floor opening stock"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...sampleRows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `production_open_stock_template_${dayjs().format('YYYYMMDD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('CSV Template downloaded!');
  };

  // CSV Import
  const handleCsvUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) return;
        const rows = text.split('\n').map((r) => r.trim()).filter((r) => r.length > 0);
        if (rows.length < 2) {
          message.warning('CSV file is empty or missing headers.');
          return;
        }

        const newLines: OpenStockLine[] = [];
        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
          if (cols.length >= 5) {
            const itemCode = cols[0];
            const matchingItem = items.find((it) => it.itemCode.toLowerCase() === itemCode.toLowerCase());
            const qty = parseFloat(cols[4]) || 0;
            const wtPerPc = cols[5] !== undefined && cols[5] !== '' ? parseFloat(cols[5]) : (matchingItem?.weightPerPiece || 0);
            const rate = cols[7] !== undefined && cols[7] !== '' ? parseFloat(cols[7]) : (matchingItem?.unitCost ?? (matchingItem as any)?.costPrice ?? 0);
            const batch = cols[8] || '';
            const notes = cols[9] || '';

            if (matchingItem) {
              const itemName = matchingItem.itemName || matchingItem.name || matchingItem.itemCode;
              const uom = matchingItem.uomCode || (matchingItem as any).baseUom?.code || 'PCS';
              const totalWeightKg = wtPerPc > 0
                ? Number((qty * wtPerPc).toFixed(4))
                : (uom.toUpperCase() === 'KG' ? qty : 0);

              newLines.push({
                key: `csv-${matchingItem.id}-${Date.now()}-${i}`,
                itemId: matchingItem.id,
                itemCode: matchingItem.itemCode,
                itemName: itemName,
                itemType: matchingItem.itemType,
                uomId: matchingItem.uomId || matchingItem.baseUomId || '',
                uomCode: uom,
                currentBalance: matchingItem.currentBalance || 0,
                quantity: qty,
                weightPerPiece: wtPerPc,
                totalWeightKg,
                unitCost: rate,
                batchNumber: batch,
                notes: notes,
              });
            }
          }
        }

        if (newLines.length > 0) {
          setOpenStockLines((prev) => [...prev, ...newLines]);
          message.success(`Imported ${newLines.length} items from CSV successfully!`);
        } else {
          message.warning('No matching production item codes found in CSV file.');
        }
      } catch (err: any) {
        message.error('Failed to parse CSV file: ' + err.message);
      }
    };
    reader.readAsText(file);
    return false;
  };

  // Submit Tab 1: Post Opening Stock
  const handleSaveOpenStock = async () => {
    if (!selectedWarehouseId) {
      message.error('Please select a production warehouse / department first.');
      return;
    }
    const validLines = openStockLines.filter((l) => l.itemId && l.quantity > 0);
    if (validLines.length === 0) {
      message.error('Please enter at least one line with valid item and positive quantity.');
      return;
    }

    setSubmittingOpenStock(true);
    try {
      const selectedWh = warehouses.find((w) => w.id === selectedWarehouseId);
      const payload = {
        warehouseId: selectedWarehouseId,
        divisionId: selectedWh?.divisionId || undefined,
        transactionDate: cutoffDate.toISOString(),
        date: cutoffDate.toISOString(),
        referenceNumber: referenceNumber.trim() || undefined,
        notes: generalNotes.trim() || undefined,
        lines: validLines.map((l) => {
          const masterWt = itemsMap.get(l.itemId)?.weightPerPiece || 0;
          const effectiveWt = l.weightPerPiece > 0 ? l.weightPerPiece : masterWt;
          const calculatedTotWt = effectiveWt > 0 ? Number(((l.quantity || 0) * effectiveWt).toFixed(4)) : (Number(l.totalWeightKg) || 0);
          const totVal = calculatedTotWt > 0 ? (calculatedTotWt * l.unitCost) : (l.quantity * l.unitCost);
          const weightRemark = calculatedTotWt > 0
            ? ` (${fmtNum(calculatedTotWt)} Kg @ ${l.unitCost} Rs/Kg)`
            : '';
          const effectiveUnitCost = l.quantity > 0 ? Number((totVal / l.quantity).toFixed(4)) : l.unitCost;

          return {
            itemId: l.itemId,
            uomId: l.uomId || undefined,
            quantity: Number(l.quantity),
            unitCost: effectiveUnitCost,
            weightPerPiece: effectiveWt > 0 ? Number(effectiveWt) : undefined,
            totalWeightKg: calculatedTotWt > 0 ? Number(calculatedTotWt) : undefined,
            ratePerKg: l.unitCost > 0 ? Number(l.unitCost) : undefined,
            batchNumber: l.batchNumber || undefined,
            notes: (l.notes ? `${l.notes}${weightRemark}` : weightRemark.trim()) || undefined,
          };
        }),
      };

      const res = await apiService.post<{ success: boolean; message: string; count: number }>('/production/open-stock', payload);
      if (res && res.success) {
        message.success(res.message || `Successfully posted ${res.count} production opening stock entries!`);
        setOpenStockLines([]);
        setReferenceNumber(`POS-${dayjs().format('YYYYMMDD-HHmm')}`);
        loadItems(selectedWarehouseId);
        loadStats(selectedWarehouseId);
        loadHistory(historyWarehouseId);
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.message
        ? (Array.isArray(err.response.data.message) ? err.response.data.message.join(', ') : err.response.data.message)
        : (err?.message || 'Failed to post production opening stock.');
      message.error(errMsg);
    } finally {
      setSubmittingOpenStock(false);
    }
  };

  // -------------------------------------------------------------------------
  // Tab 2 Actions: Stock Adjustment & Variance
  // -------------------------------------------------------------------------
  const handleLoadItemsForAdjustment = () => {
    if (items.length === 0) {
      message.warning('No items loaded. Please select a department/warehouse first.');
      return;
    }
    const lines: StockAdjustmentLine[] = items.map((it) => {
      const itemName = it.itemName || it.name || it.itemCode;
      const uom = it.uomCode || (it as any).baseUom?.code || 'PCS';
      const isKg = (uom || '').toUpperCase() === 'KG';
      const cost = it.unitCost ?? (it as any).costPrice ?? 0;
      const weightPerPiece = it.weightPerPiece && Number(it.weightPerPiece) > 0 ? Number(it.weightPerPiece) : 0;
      const sysQty = it.currentBalance || 0;
      // If item is already in KG (like coils), system weight is the balance itself.
      // If item is in PCS, system weight is sysQty * weightPerPiece.
      const sysWt = isKg
        ? sysQty
        : (weightPerPiece > 0 ? Number((sysQty * weightPerPiece).toFixed(4)) : 0);

      return {
        key: `adj-${it.id}-${Date.now()}`,
        itemId: it.id,
        itemCode: it.itemCode,
        itemName: itemName,
        itemType: it.itemType,
        uomId: it.uomId || it.baseUomId || '',
        uomCode: uom,
        systemQuantity: sysQty,
        physicalQuantity: sysQty,
        weightPerPiece,
        systemWeightKg: sysWt,
        physicalWeightKg: sysWt,
        unitCost: cost,
        reason: adjDefaultReason,
        notes: '',
      };
    });
    setAdjLines(lines);
    message.success(`Loaded ${lines.length} items for floor physical count verification.`);
  };

  const handleZeroOutPhysicalCount = () => {
    setAdjLines((prev) =>
      prev.map((line) => ({
        ...line,
        physicalQuantity: 0,
        physicalWeightKg: 0,
      }))
    );
    message.info('All physical counts set to 0. Review variances and click Save to post.');
  };

  const handleAddAdjustmentLine = () => {
    const newLine: StockAdjustmentLine = {
      key: `adj-manual-${Date.now()}`,
      itemId: '',
      itemCode: '',
      itemName: '',
      itemType: '',
      uomId: '',
      uomCode: '',
      systemQuantity: 0,
      physicalQuantity: 0,
      weightPerPiece: 0,
      systemWeightKg: 0,
      physicalWeightKg: 0,
      unitCost: 0,
      reason: adjDefaultReason,
      notes: '',
    };
    setAdjLines((prev) => [...prev, newLine]);
  };

  const handleUpdateAdjLine = (key: string, field: keyof StockAdjustmentLine, value: any) => {
    setAdjLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;

        let updated = { ...line };

        if (field === 'itemId') {
          const selected = itemsMap.get(value);
          if (selected) {
            const itemName = selected.itemName || selected.name || selected.itemCode;
            const uom = selected.uomCode || (selected as any).baseUom?.code || 'PCS';
            const isKg = (uom || '').toUpperCase() === 'KG';
            const cost = selected.unitCost ?? (selected as any).costPrice ?? 0;
            const weightPerPiece = selected.weightPerPiece && Number(selected.weightPerPiece) > 0 ? Number(selected.weightPerPiece) : 0;
            const sysQty = selected.currentBalance || 0;
            const physQty = selected.currentBalance || 0;
            const sysWt = isKg ? sysQty : (weightPerPiece > 0 ? Number((sysQty * weightPerPiece).toFixed(4)) : 0);
            const physWt = sysWt;

            updated = {
              ...line,
              itemId: selected.id,
              itemCode: selected.itemCode,
              itemName: itemName,
              itemType: selected.itemType,
              uomId: selected.uomId || selected.baseUomId || '',
              uomCode: uom,
              systemQuantity: sysQty,
              physicalQuantity: physQty,
              weightPerPiece,
              systemWeightKg: sysWt,
              physicalWeightKg: physWt,
              unitCost: cost,
            };
          }
        } else if (field === 'physicalQuantity') {
          const physQty = Number(value) || 0;
          const isKg = (line.uomCode || '').toUpperCase() === 'KG';
          const physWt = isKg
            ? physQty
            : (line.weightPerPiece > 0 ? Number((physQty * line.weightPerPiece).toFixed(4)) : 0);
          updated = { ...line, physicalQuantity: physQty, physicalWeightKg: physWt };
        } else if (field === 'weightPerPiece') {
          const wt = Number(value) || 0;
          const isKg = (line.uomCode || '').toUpperCase() === 'KG';
          const sysWt = isKg ? line.systemQuantity : (wt > 0 ? Number((line.systemQuantity * wt).toFixed(4)) : 0);
          const physWt = isKg ? line.physicalQuantity : (wt > 0 ? Number((line.physicalQuantity * wt).toFixed(4)) : 0);
          updated = { ...line, weightPerPiece: wt, systemWeightKg: sysWt, physicalWeightKg: physWt };
        } else {
          updated = { ...line, [field]: value };
        }

        return updated;
      })
    );
  };

  const handleDeleteAdjLine = (key: string) => {
    setAdjLines((prev) => prev.filter((line) => line.key !== key));
  };

  const handleSaveAdjustment = async () => {
    if (!adjWarehouseId) {
      message.error('Please select a production warehouse / department.');
      return;
    }
    const varianceLines = adjLines.filter((l) => l.itemId && l.physicalQuantity !== l.systemQuantity);
    if (varianceLines.length === 0) {
      message.warning('No variance detected! Physical quantities are identical to system book balance.');
      return;
    }

    setSubmittingAdj(true);
    try {
      const selectedWh = warehouses.find((w) => w.id === adjWarehouseId);
      const payload = {
        warehouseId: adjWarehouseId,
        divisionId: selectedWh?.divisionId || undefined,
        transactionDate: adjDate.toISOString(),
        date: adjDate.toISOString(),
        referenceNumber: adjReferenceNumber.trim() || undefined,
        reason: adjDefaultReason,
        adjustmentReason: adjDefaultReason,
        notes: adjGeneralNotes.trim() || undefined,
        lines: varianceLines.map((l) => {
          const wtDiff = l.physicalWeightKg - l.systemWeightKg;
          const wtNote = l.physicalWeightKg > 0 ? ` (Phys: ${fmtNum(l.physicalWeightKg)} Kg, Var: ${fmtNum(wtDiff)} Kg)` : '';

          return {
            itemId: l.itemId,
            uomId: l.uomId || undefined,
            currentStock: Number(l.systemQuantity),
            systemQuantity: Number(l.systemQuantity),
            physicalStock: Number(l.physicalQuantity),
            physicalQuantity: Number(l.physicalQuantity),
            unitCost: Number(l.unitCost) || 0,
            weightPerPiece: l.weightPerPiece > 0 ? Number(l.weightPerPiece) : undefined,
            physicalWeightKg: l.physicalWeightKg > 0 ? Number(l.physicalWeightKg) : undefined,
            ratePerKg: l.unitCost > 0 ? Number(l.unitCost) : undefined,
            reason: l.reason || adjDefaultReason,
            notes: (l.notes ? `${l.notes}${wtNote}` : wtNote.trim()) || undefined,
          };
        }),
      };

      const res = await apiService.post<{ success: boolean; message: string; count: number }>('/production/open-stock/adjust', payload);
      if (res && res.success) {
        message.success(res.message || `Successfully adjusted ${res.count} stock items!`);
        setAdjLines([]);
        setAdjReferenceNumber(`PSA-${dayjs().format('YYYYMMDD-HHmm')}`);
        loadItems(adjWarehouseId);
        loadStats(adjWarehouseId);
        loadHistory(historyWarehouseId);
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.message
        ? (Array.isArray(err.response.data.message) ? err.response.data.message.join(', ') : err.response.data.message)
        : (err?.message || 'Failed to post stock adjustment.');
      message.error(errMsg);
    } finally {
      setSubmittingAdj(false);
    }
  };

  // -------------------------------------------------------------------------
  // Filtering & Computed Values
  // -------------------------------------------------------------------------
  const filteredOpenStockLines = useMemo(() => {
    if (filterItemType === 'ALL') return openStockLines;
    return openStockLines.filter((l) => !l.itemId || !l.itemType || l.itemType === filterItemType);
  }, [openStockLines, filterItemType]);

  const openStockSummary = useMemo(() => {
    let totalQty = 0;
    let totalWeight = 0;
    let totalValue = 0;
    openStockLines.forEach((line) => {
      const q = Number(line.quantity) || 0;
      const w = Number(line.totalWeightKg) || 0;
      const c = Number(line.unitCost) || 0;
      totalQty += q;
      totalWeight += w;
      totalValue += w > 0 ? (w * c) : (q * c);
    });
    return {
      lineCount: openStockLines.length,
      validCount: openStockLines.filter((l) => l.itemId && l.quantity > 0).length,
      totalQty,
      totalWeight,
      totalValue,
    };
  }, [openStockLines]);

  const adjSummary = useMemo(() => {
    let surplusCount = 0;
    let shortageCount = 0;
    let netVarianceQty = 0;
    let netVarianceWeight = 0;
    adjLines.forEach((l) => {
      const diff = (Number(l.physicalQuantity) || 0) - (Number(l.systemQuantity) || 0);
      const wtDiff = (Number(l.physicalWeightKg) || 0) - (Number(l.systemWeightKg) || 0);
      if (diff > 0) surplusCount++;
      if (diff < 0) shortageCount++;
      netVarianceQty += diff;
      netVarianceWeight += wtDiff;
    });
    return {
      surplusCount,
      shortageCount,
      netVarianceQty,
      netVarianceWeight,
      totalCount: adjLines.length,
    };
  }, [adjLines]);

  const filteredHistory = useMemo(() => {
    return historyRecords.filter((h) => {
      if (historyFilterType !== 'ALL' && h.transactionType !== historyFilterType) return false;
      if (historySearch) {
        const q = historySearch.toLowerCase();
        const code = h.item?.itemCode?.toLowerCase() || '';
        const name = (h.item?.itemName || (h.item as any)?.name || '')?.toLowerCase();
        const ref = h.referenceNumber?.toLowerCase() || '';
        if (!code.includes(q) && !name.includes(q) && !ref.includes(q)) return false;
      }
      return true;
    });
  }, [historyRecords, historyFilterType, historySearch]);

  // -------------------------------------------------------------------------
  // Columns for Tables
  // -------------------------------------------------------------------------
  const openStockColumns: ColumnsType<OpenStockLine> = [
    {
      title: '#',
      width: 45,
      render: (_, __, idx) => idx + 1,
    },
    {
      title: 'Item (Name & Code)',
      dataIndex: 'itemId',
      key: 'itemId',
      width: 290,
      render: (val, record) => {
        const displayName = record.itemName || (record as any).name || '';
        return (
          <div>
            <Select
              showSearch
              placeholder="Select production item..."
              value={val || undefined}
              onChange={(newVal) => handleUpdateLine(record.key, 'itemId', newVal)}
              filterOption={(input, option) =>
                String(option?.children || '')
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              style={{ width: '100%' }}
            >
              {items
                .filter((it) => filterItemType === 'ALL' || it.itemType === filterItemType)
                .map((it) => {
                  const itName = it.itemName || it.name || '';
                  return (
                    <Option key={it.id} value={it.id}>
                      {itName ? `${itName} (${it.itemCode})` : it.itemCode}
                    </Option>
                  );
                })}
            </Select>

            {/* Prominent Name and Details Badge */}
            <div style={{ marginTop: 5 }}>
              {displayName ? (
                <div style={{ fontWeight: 600, color: '#096dd9', fontSize: 13, marginBottom: 2 }}>
                  {displayName}
                </div>
              ) : null}
              <Space size={6} wrap style={{ marginTop: 2 }}>
                {record.itemCode && (
                  <Text type="secondary" code style={{ fontSize: 11 }}>
                    {record.itemCode}
                  </Text>
                )}
                {record.itemType && (
                  <Tag color={ITEM_TYPE_COLORS[record.itemType] || 'default'} style={{ fontSize: 10 }}>
                    {ITEM_TYPE_LABELS[record.itemType] || record.itemType}
                  </Tag>
                )}
                <Text type="secondary" style={{ fontSize: 11 }}>
                  UOM: {record.uomCode || 'PCS'}
                </Text>
              </Space>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Floor Stock',
      dataIndex: 'currentBalance',
      key: 'currentBalance',
      width: 120,
      render: (val, record) => (
        <Badge
          count={`${fmtNum(val)} ${record.uomCode || 'PCS'}`}
          style={{ backgroundColor: (val || 0) > 0 ? '#108ee9' : '#8c8c8c' }}
        />
      ),
    },
    {
      title: 'Opening Qty (Pcs)',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 140,
      render: (val, record) => (
        <InputNumber
          min={0}
          step={1}
          value={val}
          onChange={(newVal) => handleUpdateLine(record.key, 'quantity', newVal || 0)}
          style={{ width: '100%', borderColor: '#52c41a', fontWeight: 'bold' }}
          placeholder="0"
        />
      ),
    },
    {
      title: (
        <Tooltip title="Fixed weight per single piece in kilograms (loaded automatically from Item Master). Multiplies with Pcs to calculate Total Weight.">
          <span>
            Per Pc Wt (Kg) <Tag color="blue" style={{ fontSize: 10, marginLeft: 4, padding: '0 4px', lineHeight: '16px' }}>AUTO</Tag>
          </span>
        </Tooltip>
      ),
      dataIndex: 'weightPerPiece',
      key: 'weightPerPiece',
      width: 140,
      render: (val, record) => {
        const masterWt = itemsMap.get(record.itemId)?.weightPerPiece || 0;
        const currentVal = (val !== undefined && Number(val) > 0) ? Number(val) : (masterWt > 0 ? Number(masterWt) : undefined);
        return (
          <InputNumber
            min={0}
            step={0.0001}
            precision={6}
            value={currentVal}
            onChange={(newVal) => handleUpdateLine(record.key, 'weightPerPiece', newVal || 0)}
            style={{ width: '100%', borderColor: '#1890ff', fontWeight: 500 }}
            placeholder={masterWt > 0 ? masterWt.toFixed(6) : "0.000000"}
          />
        );
      },
    },
    {
      title: (
        <Tooltip title="Calculated Total Weight in Kg = Quantity (Pcs) × Per Piece Weight (Kg)">
          <span>Total Wt (Kg)</span>
        </Tooltip>
      ),
      key: 'totalWeightKg',
      width: 120,
      render: (_, record) => {
        const masterWt = itemsMap.get(record.itemId)?.weightPerPiece || 0;
        const effectiveWt = (record.weightPerPiece && Number(record.weightPerPiece) > 0) ? Number(record.weightPerPiece) : Number(masterWt);
        const qty = Number(record.quantity) || 0;
        const wt = Number(record.totalWeightKg) > 0
          ? Number(record.totalWeightKg)
          : (effectiveWt > 0 ? Number((qty * effectiveWt).toFixed(4)) : (record.uomCode?.toUpperCase() === 'KG' ? qty : 0));
        return (
          <Tag color={wt > 0 ? 'cyan' : 'default'} style={{ fontWeight: 600, fontSize: 12 }}>
            {fmtNum(wt, 3)} Kg
          </Tag>
        );
      },
    },
    {
      title: (
        <Tooltip title="Cost Rate in PKR per Kg (multiplied with Total Weight Kg to get Total Value)">
          <span>Rate / Kg (PKR)</span>
        </Tooltip>
      ),
      dataIndex: 'unitCost',
      key: 'unitCost',
      width: 125,
      render: (val, record) => (
        <InputNumber
          min={0}
          step={0.5}
          value={val}
          onChange={(newVal) => handleUpdateLine(record.key, 'unitCost', newVal || 0)}
          style={{ width: '100%', borderColor: '#faad14' }}
          placeholder="310.0"
        />
      ),
    },
    {
      title: (
        <Tooltip title="Total Value = Total Weight (Kg) × Rate / Kg">
          <span>Total Value (PKR)</span>
        </Tooltip>
      ),
      key: 'totalValue',
      width: 130,
      render: (_, record) => {
        const masterWt = itemsMap.get(record.itemId)?.weightPerPiece || 0;
        const effectiveWt = (record.weightPerPiece && Number(record.weightPerPiece) > 0) ? Number(record.weightPerPiece) : Number(masterWt);
        const qty = Number(record.quantity) || 0;
        const wt = Number(record.totalWeightKg) > 0
          ? Number(record.totalWeightKg)
          : (effectiveWt > 0 ? Number((qty * effectiveWt).toFixed(4)) : (record.uomCode?.toUpperCase() === 'KG' ? qty : 0));
        const rate = Number(record.unitCost) || 0;
        const total = wt > 0 ? (wt * rate) : (qty * rate);
        return <Text strong style={{ color: '#096dd9' }}>{fmtNum(total)} Rs</Text>;
      },
    },
    {
      title: 'Batch / Lot #',
      dataIndex: 'batchNumber',
      key: 'batchNumber',
      width: 120,
      render: (val, record) => (
        <Input
          value={val}
          onChange={(e) => handleUpdateLine(record.key, 'batchNumber', e.target.value)}
          placeholder="e.g. BAT-2609"
        />
      ),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      width: 130,
      render: (val, record) => (
        <Input
          value={val}
          onChange={(e) => handleUpdateLine(record.key, 'notes', e.target.value)}
          placeholder="Remarks"
        />
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 50,
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteLine(record.key)}
        />
      ),
    },
  ];

  const adjColumns: ColumnsType<StockAdjustmentLine> = [
    {
      title: '#',
      width: 45,
      render: (_, __, idx) => idx + 1,
    },
    {
      title: 'Item (Name & Code)',
      dataIndex: 'itemId',
      key: 'itemId',
      width: 290,
      render: (val, record) => {
        const displayName = record.itemName || (record as any).name || '';
        return (
          <div>
            <Select
              showSearch
              placeholder="Select item to adjust..."
              value={val || undefined}
              onChange={(newVal) => handleUpdateAdjLine(record.key, 'itemId', newVal)}
              filterOption={(input, option) =>
                String(option?.children || '')
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              style={{ width: '100%' }}
            >
              {items.map((it) => {
                const itName = it.itemName || it.name || '';
                return (
                  <Option key={it.id} value={it.id}>
                    {itName ? `${itName} (${it.itemCode})` : it.itemCode}
                  </Option>
                );
              })}
            </Select>

            <div style={{ marginTop: 4 }}>
              {displayName ? (
                <div style={{ fontWeight: 600, color: '#096dd9', fontSize: 13, marginBottom: 2 }}>
                  {displayName}
                </div>
              ) : null}
              <Space size={6} wrap style={{ marginTop: 2 }}>
                {record.itemCode && (
                  <Text type="secondary" code style={{ fontSize: 11 }}>
                    {record.itemCode}
                  </Text>
                )}
                {record.itemType && (
                  <Tag color={ITEM_TYPE_COLORS[record.itemType] || 'default'} style={{ fontSize: 10 }}>
                    {ITEM_TYPE_LABELS[record.itemType] || record.itemType}
                  </Tag>
                )}
                <Text type="secondary" style={{ fontSize: 11 }}>
                  UOM: {record.uomCode || 'PCS'}
                </Text>
              </Space>
            </div>
          </div>
        );
      },
    },
    {
      title: 'System Book Stock',
      dataIndex: 'systemQuantity',
      key: 'systemQuantity',
      width: 140,
      render: (val, record) => {
        const isKg = (record.uomCode || '').toUpperCase() === 'KG';
        const wt = Number(record.weightPerPiece) || 0;
        const equivPcs = isKg && wt > 0 ? Math.round(val / wt) : 0;
        const equivKg = !isKg && wt > 0 ? Number((val * wt).toFixed(2)) : 0;

        return (
          <div>
            <Tag color="geekblue" style={{ fontSize: 13, fontWeight: 600 }}>
              {fmtNum(val)} {record.uomCode || 'PCS'}
            </Tag>
            {isKg && equivPcs > 0 && (
              <div style={{ fontSize: 11, color: '#1890ff', marginTop: 3, fontWeight: 500 }}>
                ≈ {fmtNum(equivPcs)} PCS
              </div>
            )}
            {!isKg && equivKg > 0 && (
              <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 3 }}>
                {fmtNum(equivKg, 2)} Kg
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: (
        <Tooltip title="Verified floor physical stock. For KG items (wire coils) enter weight in KG; for Piece items (spokes/nipples) enter pieces.">
          <span>Physical Count (Stock UOM)</span>
        </Tooltip>
      ),
      dataIndex: 'physicalQuantity',
      key: 'physicalQuantity',
      width: 175,
      render: (val, record) => {
        const isKg = (record.uomCode || '').toUpperCase() === 'KG';
        const wt = Number(record.weightPerPiece) || 0;
        const numVal = Number(val) || 0;
        const equivPcs = isKg && wt > 0 ? Math.round(numVal / wt) : 0;
        const equivKg = !isKg && wt > 0 ? Number((numVal * wt).toFixed(2)) : 0;

        return (
          <div>
            <InputNumber
              min={0}
              step={isKg ? 0.01 : 1}
              precision={isKg ? 4 : 0}
              value={val}
              addonAfter={record.uomCode || 'PCS'}
              onChange={(newVal) => handleUpdateAdjLine(record.key, 'physicalQuantity', newVal !== null && newVal !== undefined ? newVal : 0)}
              style={{ width: '100%', fontWeight: 'bold' }}
            />
            {isKg && wt > 0 && (
              <div style={{ fontSize: 11, color: '#1890ff', marginTop: 2, fontWeight: 500 }}>
                ≈ {fmtNum(equivPcs)} PCS
              </div>
            )}
            {!isKg && wt > 0 && (
              <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>
                {fmtNum(equivKg, 2)} Kg
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Per Pc Wt (Kg)',
      dataIndex: 'weightPerPiece',
      key: 'weightPerPiece',
      width: 125,
      render: (val, record) => (
        <InputNumber
          min={0}
          step={0.0001}
          precision={6}
          value={val}
          onChange={(newVal) => handleUpdateAdjLine(record.key, 'weightPerPiece', newVal || 0)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Variance (+ Surplus / - Shortage)',
      key: 'variance',
      width: 180,
      render: (_, record) => {
        const diff = (Number(record.physicalQuantity) || 0) - (Number(record.systemQuantity) || 0);
        const isKg = (record.uomCode || '').toUpperCase() === 'KG';
        const wt = Number(record.weightPerPiece) || 0;
        const equivDiffPcs = isKg && wt > 0 ? Math.round(diff / wt) : 0;
        const equivDiffKg = !isKg && wt > 0 ? Number((diff * wt).toFixed(2)) : 0;

        if (diff === 0) {
          return <Tag color="default"><CheckCircleOutlined /> Exact Match</Tag>;
        }
        if (diff > 0) {
          return (
            <div>
              <Tag color="success" style={{ fontWeight: 'bold' }}>
                <ArrowUpOutlined /> +{fmtNum(diff)} {record.uomCode || 'PCS'}
              </Tag>
              {isKg && equivDiffPcs > 0 && (
                <div style={{ fontSize: 11, color: '#389e0d', marginTop: 2, fontWeight: 500 }}>
                  ≈ +{fmtNum(equivDiffPcs)} PCS
                </div>
              )}
              {!isKg && equivDiffKg > 0 && (
                <div style={{ fontSize: 11, color: '#389e0d', marginTop: 2 }}>
                  +{fmtNum(equivDiffKg, 2)} Kg
                </div>
              )}
            </div>
          );
        }
        return (
          <div>
            <Tag color="error" style={{ fontWeight: 'bold' }}>
              <ArrowDownOutlined /> {fmtNum(diff)} {record.uomCode || 'PCS'}
            </Tag>
            {isKg && wt > 0 && (
              <div style={{ fontSize: 11, color: '#cf1322', marginTop: 2, fontWeight: 500 }}>
                ≈ {fmtNum(equivDiffPcs)} PCS
              </div>
            )}
            {!isKg && equivDiffKg < 0 && (
              <div style={{ fontSize: 11, color: '#cf1322', marginTop: 2 }}>
                {fmtNum(equivDiffKg, 2)} Kg
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Adjustment Reason',
      dataIndex: 'reason',
      key: 'reason',
      width: 180,
      render: (val, record) => (
        <Select
          value={val || adjDefaultReason}
          onChange={(newVal) => handleUpdateAdjLine(record.key, 'reason', newVal)}
          style={{ width: '100%' }}
        >
          <Option value="PHYSICAL_COUNT_DISCREPANCY">Floor Count Discrepancy</Option>
          <Option value="DAMAGED_SCRAP">Damaged / Floor Scrap</Option>
          <Option value="CUTOFF_CALIBRATION">Cutoff Stock Calibration</Option>
          <Option value="EVAPORATION_LEAKAGE">Floor Leakage / Evaporation</Option>
          <Option value="RECLASSIFICATION">Type Reclassification</Option>
          <Option value="OTHER">Other Reason</Option>
        </Select>
      ),
    },
    {
      title: 'Remarks / Notes',
      dataIndex: 'notes',
      key: 'notes',
      width: 140,
      render: (val, record) => (
        <Input
          value={val}
          onChange={(e) => handleUpdateAdjLine(record.key, 'notes', e.target.value)}
          placeholder="Reason notes"
        />
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 50,
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteAdjLine(record.key)}
        />
      ),
    },
  ];

  const handleReverseHistoryRecord = async (id: string) => {
    try {
      const res = await apiService.post<{ success: boolean; message: string }>(`/production/open-stock/history/${id}/reverse`, {});
      if (res && res.success) {
        message.success(res.message || 'Transaction reversed successfully.');
        loadHistory(historyWarehouseId);
        loadItems(selectedWarehouseId);
        loadStats(selectedWarehouseId);
      }
    } catch (err: any) {
      message.error(err?.message || 'Failed to reverse transaction.');
    }
  };

  const historyColumns: ColumnsType<HistoryRecord> = [
    {
      title: 'Date & Time',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (val) => dayjs(val).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: 'Reference #',
      dataIndex: 'referenceNumber',
      key: 'referenceNumber',
      width: 170,
      render: (val) => <Text code>{val}</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'transactionType',
      key: 'transactionType',
      width: 140,
      render: (val) => {
        if (val === 'OPENING' || val === 'OPENING_STOCK') return <Tag color="blue">OPENING STOCK</Tag>;
        if (val === 'ADJUSTMENT_IN') return <Tag color="green">+ ADJUSTMENT IN</Tag>;
        if (val === 'ADJUSTMENT_OUT') return <Tag color="red">- ADJUSTMENT OUT</Tag>;
        return <Tag color="cyan">{val}</Tag>;
      },
    },
    {
      title: 'Floor / Warehouse',
      key: 'warehouse',
      width: 170,
      render: (_, record: any) =>
        record.warehouse?.warehouseName ||
        record.warehouse?.name ||
        record.warehouseName ||
        record.warehouse?.warehouseCode ||
        record.warehouseCode ||
        '-',
    },
    {
      title: 'Item (Name & Code)',
      key: 'item',
      width: 260,
      render: (_, record: any) => {
        const displayName = record.itemName || record.item?.itemName || record.item?.name || record.itemCode || record.item?.itemCode;
        const code = record.itemCode || record.item?.itemCode;
        const type = record.itemType || record.item?.itemType;
        return (
          <div>
            <div style={{ fontWeight: 600, color: '#096dd9', fontSize: 13 }}>
              {displayName || '—'}
            </div>
            <Space size={6} wrap style={{ marginTop: 2 }}>
              {code && (
                <Text type="secondary" code style={{ fontSize: 11 }}>
                  {code}
                </Text>
              )}
              {type && (
                <Tag color={ITEM_TYPE_COLORS[type] || 'default'} style={{ fontSize: 10 }}>
                  {ITEM_TYPE_LABELS[type] || type}
                </Tag>
              )}
            </Space>
          </div>
        );
      },
    },
    {
      title: 'Qty Applied',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 120,
      render: (val, record: any) => {
        const isNeg = record.transactionType === 'ADJUSTMENT_OUT' || (val < 0);
        return (
          <Text strong style={{ color: isNeg ? '#cf1322' : '#389e0d' }}>
            {isNeg ? '-' : '+'}{fmtNum(Math.abs(val))} {record.uomSymbol || record.uomCode || 'PCS'}
          </Text>
        );
      },
    },
    {
      title: 'Floor Balance After',
      dataIndex: 'balanceAfter',
      key: 'balanceAfter',
      width: 140,
      render: (val, record: any) => {
        const bal = val !== undefined && val !== null ? val : record.quantity;
        return (
          <Badge
            count={`${fmtNum(bal)} ${record.uomSymbol || record.uomCode || 'PCS'}`}
            style={{ backgroundColor: '#52c41a' }}
          />
        );
      },
    },
    {
      title: 'Unit Cost',
      dataIndex: 'unitCost',
      key: 'unitCost',
      width: 110,
      render: (val) => `${fmtNum(val)} Rs`,
    },
    {
      title: 'Notes / Reason',
      dataIndex: 'notes',
      key: 'notes',
      render: (val) => val || '-',
    },
    {
      title: 'Action',
      key: 'action',
      width: 90,
      render: (_, record: any) => (
        <Popconfirm
          title="Reverse Entry"
          description="Are you sure you want to reverse/cancel this entry? This will adjust the floor stock back."
          onConfirm={() => handleReverseHistoryRecord(record.id)}
          okText="Yes, Reverse"
          cancelText="No"
          okButtonProps={{ danger: true }}
        >
          <Button size="small" danger icon={<DeleteOutlined />}>
            Reverse
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="prod-open-stock-container">
      {/* Sleek Modern Header Toolbar (Theme-Integrated) */}
      <div className="prod-open-stock-compact-header">
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col xs={24} md={18}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="prod-header-icon-badge">
                <DatabaseOutlined style={{ fontSize: 20 }} />
              </div>
              <div>
                <h2 className="prod-header-title">Production Item Open Stock</h2>
                <span className="prod-header-subtitle">
                  Cutoff floor stock initialization & physical stock adjustments (FT, SP, PVC, ST, SW, PL) • 100% Floor Traceability
                </span>
              </div>
            </div>
          </Col>
          <Col xs={24} md={6} style={{ textAlign: 'right' }}>
            <Button
              icon={<SyncOutlined />}
              onClick={() => {
                loadWarehouses();
                if (selectedWarehouseId) loadItems(selectedWarehouseId);
                if (activeTab === 'analytics') loadStats(selectedWarehouseId);
                if (activeTab === 'history') loadHistory(selectedWarehouseId);
                if (activeTab === 'matrix') loadMatrix(matrixDivision, matrixSearch);
              }}
              style={{ borderRadius: 8, fontWeight: 500 }}
            >
              Refresh Data
            </Button>
          </Col>
        </Row>
      </div>

      {/* Connected Folder Tabs Navigation (Company Settings Style) */}
      <div className="prod-folder-nav-wrapper" style={{ marginTop: 20 }}>
        <button
          type="button"
          className={`prod-folder-tab-btn ${activeTab === 'opening' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('opening')}
        >
          <DatabaseOutlined /> 1. Opening Stock Entry
        </button>
        <button
          type="button"
          className={`prod-folder-tab-btn ${activeTab === 'adjustment' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('adjustment')}
        >
          <ThunderboltOutlined /> 2. Floor Stock Adjustment & Variance
        </button>
        <button
          type="button"
          className={`prod-folder-tab-btn ${activeTab === 'analytics' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChartOutlined /> 3. Stock & Variance Analytics
        </button>
        <button
          type="button"
          className={`prod-folder-tab-btn ${activeTab === 'history' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <HistoryOutlined /> 4. History & Ledger Audit
        </button>
        <button
          type="button"
          className={`prod-folder-tab-btn ${activeTab === 'matrix' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('matrix')}
        >
          <ApartmentOutlined /> 5. Department Stock Breakdown & Hierarchy
        </button>
      </div>

      {/* Main Tabs Container */}
      <Card className="prod-open-stock-main-card" bordered={false}>
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k)}
          renderTabBar={() => <div style={{ display: 'none' }} />}
          items={[
            {
              key: 'opening',
              label: (
                <span>
                  <DatabaseOutlined /> 1. Opening Stock Entry
                </span>
              ),
              children: (
                <div className="prod-open-stock-tab-content">
                  {/* Filter & Control Strip */}
                  <div className="prod-controls-strip">
                    <Row gutter={[16, 16]} align="bottom">
                      <Col xs={24} sm={12} md={7}>
                        <div className="prod-control-label">
                          <ShopOutlined /> Production Department / Warehouse *
                        </div>
                        <Select
                          showSearch
                          value={selectedWarehouseId || undefined}
                          onChange={(val) => {
                            setSelectedWarehouseId(val);
                            setOpenStockLines([]);
                          }}
                          loading={loadingWarehouses}
                          placeholder="Select Department / Floor Warehouse..."
                          style={{ width: '100%' }}
                        >
                          {warehouses.map((w) => (
                            <Option key={w.id} value={w.id}>
                              {w.warehouseCode} - {w.warehouseName || w.name} ({w.divisionName || 'Floor'})
                            </Option>
                          ))}
                        </Select>
                      </Col>

                      <Col xs={24} sm={12} md={5}>
                        <div className="prod-control-label">Cutoff Date *</div>
                        <DatePicker
                          value={cutoffDate}
                          onChange={(d) => d && setCutoffDate(d)}
                          style={{ width: '100%' }}
                          format="YYYY-MM-DD"
                        />
                      </Col>

                      <Col xs={24} sm={12} md={6}>
                        <div className="prod-control-label">Reference Number</div>
                        <Input
                          value={referenceNumber}
                          onChange={(e) => setReferenceNumber(e.target.value)}
                          placeholder="e.g. POS-202610-001"
                        />
                      </Col>

                      <Col xs={24} sm={12} md={6}>
                        <div className="prod-control-label">General Remarks / Notes</div>
                        <Input
                          value={generalNotes}
                          onChange={(e) => setGeneralNotes(e.target.value)}
                          placeholder="Opening stock as of 30th date..."
                        />
                      </Col>
                    </Row>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="prod-actions-bar">
                    <Row justify="space-between" align="middle" gutter={[12, 12]}>
                      <Col xs={24} xl={17}>
                        <Space wrap size={12}>
                          <Button
                            type="primary"
                            icon={<ThunderboltOutlined />}
                            onClick={handleAutoPopulateFloorItems}
                            loading={loadingItems}
                            style={{
                              background: 'linear-gradient(135deg, var(--theme-accent, #1890ff) 0%, var(--theme-primary, #096dd9) 100%)',
                              borderColor: 'var(--theme-accent, #1890ff)',
                              color: 'var(--theme-on-accent, #ffffff)',
                              fontWeight: 600,
                              borderRadius: 8,
                              boxShadow: '0 3px 12px var(--theme-accent-soft, rgba(24, 144, 255, 0.35))',
                            }}
                          >
                            ⚡ Populate Floor Items ({items.length})
                          </Button>
                          <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleAddLine}
                            style={{
                              background: 'var(--theme-accent, #1890ff)',
                              borderColor: 'var(--theme-accent, #1890ff)',
                              color: 'var(--theme-on-accent, #ffffff)',
                              fontWeight: 600,
                              borderRadius: 8,
                            }}
                          >
                            Add Row
                          </Button>
                          <Button
                            icon={<DownloadOutlined />}
                            onClick={handleDownloadTemplate}
                            style={{ borderRadius: 8, fontWeight: 500 }}
                          >
                            Download CSV Template
                          </Button>
                          <Upload
                            accept=".csv"
                            beforeUpload={handleCsvUpload}
                            showUploadList={false}
                          >
                            <Button icon={<UploadOutlined />} style={{ borderRadius: 8, fontWeight: 500 }}>
                              Upload CSV
                            </Button>
                          </Upload>
                          {openStockLines.length > 0 && (
                            <Popconfirm
                              title="Clear all lines?"
                              description="Are you sure you want to remove all lines from the grid?"
                              onConfirm={handleClearAllLines}
                              okText="Yes, Clear"
                              cancelText="Cancel"
                            >
                              <Button danger icon={<ClearOutlined />} style={{ borderRadius: 8 }}>
                                Clear Lines
                              </Button>
                            </Popconfirm>
                          )}
                        </Space>
                      </Col>

                      <Col xs={24} xl={7} style={{ textAlign: 'right' }}>
                        <Space wrap>
                          <Text type="secondary" style={{ fontSize: 12 }}>Filter by Type:</Text>
                          <Select
                            value={filterItemType}
                            onChange={(v) => setFilterItemType(v)}
                            style={{ width: 170 }}
                            size="middle"
                          >
                            <Option value="ALL">All Production Types</Option>
                            <Option value="RAW_MATERIAL">Raw Material</Option>
                            <Option value="WORK_IN_PROGRESS">Work In Progress</Option>
                            <Option value="SEMI_FINISHED">Semi-Finished</Option>
                            <Option value="FINISHED_GOOD">Finished Good</Option>
                          </Select>
                        </Space>
                      </Col>
                    </Row>
                  </div>

                  {/* Open Stock Grid Table */}
                  <div style={{ marginTop: 12 }}>
                    <Table
                      dataSource={filteredOpenStockLines}
                      columns={openStockColumns}
                      pagination={{ pageSize: 25, showSizeChanger: true }}
                      scroll={{ x: 1300 }}
                      size="middle"
                      locale={{
                        emptyText: (
                          <div style={{ padding: '30px 0', textAlign: 'center' }}>
                            <DatabaseOutlined style={{ fontSize: 40, color: '#bfbfbf', marginBottom: 10 }} />
                            <Paragraph style={{ margin: 0 }}>
                              No opening stock lines entered yet.
                            </Paragraph>
                            <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
                              Click <b>"Auto-Populate All Floor Items"</b> above to load all items with names for this department, or click <b>"Add Row"</b>.
                            </Paragraph>
                          </div>
                        ),
                      }}
                    />
                  </div>

                  {/* Bottom Summary & Submit Bar */}
                  <div className="prod-summary-bar">
                    <Row justify="space-between" align="middle" gutter={[16, 16]}>
                      <Col xs={24} md={16}>
                        <Space size="large" wrap>
                          <Statistic
                            title="Total Line Items"
                            value={openStockSummary.lineCount}
                            suffix={`(${openStockSummary.validCount} valid)`}
                            valueStyle={{ fontSize: 18 }}
                          />
                          <Statistic
                            title="Total Quantity (Pcs)"
                            value={fmtNum(openStockSummary.totalQty)}
                            valueStyle={{ fontSize: 18, color: '#389e0d' }}
                          />
                          <Statistic
                            title="Total Weight (Kg)"
                            value={fmtNum(openStockSummary.totalWeight, 2)}
                            suffix="Kg"
                            valueStyle={{ fontSize: 18, color: '#08979c' }}
                          />
                          <Statistic
                            title="Total Estimated Value"
                            value={fmtNum(openStockSummary.totalValue)}
                            prefix="Rs."
                            valueStyle={{ fontSize: 18, color: '#096dd9' }}
                          />
                        </Space>
                      </Col>

                      <Col xs={24} md={8} style={{ textAlign: 'right' }}>
                        <Button
                          type="primary"
                          size="large"
                          icon={<SaveOutlined />}
                          loading={submittingOpenStock}
                          onClick={handleSaveOpenStock}
                          disabled={openStockSummary.validCount === 0}
                          className="prod-btn-submit-save"
                        >
                          Save & Post Opening Stock
                        </Button>
                      </Col>
                    </Row>
                  </div>
                </div>
              ),
            },
            {
              key: 'adjustment',
              label: (
                <span>
                  <ThunderboltOutlined /> 2. Floor Stock Adjustment & Variance
                </span>
              ),
              children: (
                <div className="prod-open-stock-tab-content">
                  <Alert
                    message="Floor Stock Discrepancy Adjustment"
                    description="Enter physical count stock against system book balance. System automatically calculates surplus (+) or shortage (-) variances and updates inventory balances and stock ledger with full audit trails."
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />

                  {/* Controls Strip */}
                  <div className="prod-controls-strip">
                    <Row gutter={[16, 16]} align="bottom">
                      <Col xs={24} sm={12} md={7}>
                        <div className="prod-control-label">Department / Warehouse *</div>
                        <Select
                          showSearch
                          value={adjWarehouseId || undefined}
                          onChange={(val) => {
                            setAdjWarehouseId(val);
                            setAdjLines([]);
                          }}
                          placeholder="Select Department / Warehouse..."
                          style={{ width: '100%' }}
                        >
                          {warehouses.map((w) => (
                            <Option key={w.id} value={w.id}>
                              {w.warehouseCode} - {w.warehouseName || w.name}
                            </Option>
                          ))}
                        </Select>
                      </Col>

                      <Col xs={24} sm={12} md={5}>
                        <div className="prod-control-label">Adjustment Date *</div>
                        <DatePicker
                          value={adjDate}
                          onChange={(d) => d && setAdjDate(d)}
                          style={{ width: '100%' }}
                        />
                      </Col>

                      <Col xs={24} sm={12} md={6}>
                        <div className="prod-control-label">Reference Number</div>
                        <Input
                          value={adjReferenceNumber}
                          onChange={(e) => setAdjReferenceNumber(e.target.value)}
                        />
                      </Col>

                      <Col xs={24} sm={12} md={6}>
                        <div className="prod-control-label">Default Adjustment Reason</div>
                        <Select
                          value={adjDefaultReason}
                          onChange={(v) => setAdjDefaultReason(v)}
                          style={{ width: '100%' }}
                        >
                          <Option value="PHYSICAL_COUNT_DISCREPANCY">Floor Count Discrepancy</Option>
                          <Option value="DAMAGED_SCRAP">Damaged / Floor Scrap</Option>
                          <Option value="CUTOFF_CALIBRATION">Cutoff Stock Calibration</Option>
                          <Option value="EVAPORATION_LEAKAGE">Floor Leakage / Evaporation</Option>
                          <Option value="RECLASSIFICATION">Type Reclassification</Option>
                          <Option value="OTHER">Other Reason</Option>
                        </Select>
                      </Col>
                    </Row>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="prod-actions-bar">
                    <Space wrap size={16}>
                      <Button
                        type="primary"
                        icon={<ThunderboltOutlined />}
                        onClick={handleLoadItemsForAdjustment}
                        style={{
                          background: 'linear-gradient(135deg, var(--theme-accent, #08979c) 0%, var(--theme-primary, #006d75) 100%)',
                          borderColor: 'var(--theme-accent, #08979c)',
                          color: 'var(--theme-on-accent, #ffffff)',
                          borderRadius: 8,
                          fontWeight: 600,
                          boxShadow: '0 3px 10px var(--theme-accent-soft, rgba(8, 151, 156, 0.35))',
                        }}
                      >
                        ⚡ Load Current Floor Items for Physical Verification
                      </Button>
                      <Button
                        icon={<PlusOutlined />}
                        onClick={handleAddAdjustmentLine}
                        style={{ borderRadius: 8, fontWeight: 500 }}
                      >
                        + Add Item Manually
                      </Button>
                      {adjLines.length > 0 && (
                        <Popconfirm
                          title="Zero-Out Physical Count?"
                          description="Set physical count to 0 for all loaded items? This creates a full shortage variance to write off/reset floor stock to 0."
                          onConfirm={handleZeroOutPhysicalCount}
                          okText="Yes, Set All to 0"
                          cancelText="Cancel"
                          okButtonProps={{ danger: true }}
                        >
                          <Button danger style={{ borderColor: '#ff4d4f', color: '#ff4d4f', borderRadius: 8, fontWeight: 500 }}>
                            Zero-Out All Physical Counts (0)
                          </Button>
                        </Popconfirm>
                      )}
                      {adjLines.length > 0 && (
                        <Button danger icon={<ClearOutlined />} onClick={() => setAdjLines([])} style={{ borderRadius: 8, fontWeight: 500 }}>
                          Clear Grid
                        </Button>
                      )}
                    </Space>
                  </div>

                  {/* Adjustment Grid Table */}
                  <div style={{ marginTop: 12 }}>
                    <Table
                      dataSource={adjLines}
                      columns={adjColumns}
                      pagination={{ pageSize: 25, showSizeChanger: true }}
                      scroll={{ x: 1300 }}
                      size="middle"
                      locale={{
                        emptyText: (
                          <div style={{ padding: '30px 0', textAlign: 'center' }}>
                            <ThunderboltOutlined style={{ fontSize: 40, color: '#bfbfbf', marginBottom: 10 }} />
                            <Paragraph style={{ margin: 0 }}>
                              No adjustment lines loaded.
                            </Paragraph>
                            <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
                              Click <b>"Load Current Floor Items for Physical Verification"</b> to compare book balances with floor counts.
                            </Paragraph>
                          </div>
                        ),
                      }}
                    />
                  </div>

                  {/* Bottom Summary Bar */}
                  <div className="prod-summary-bar">
                    <Row justify="space-between" align="middle" gutter={[16, 16]}>
                      <Col xs={24} md={16}>
                        <Space size="large" wrap>
                          <Statistic
                            title="Total Items Audited"
                            value={adjSummary.totalCount}
                            valueStyle={{ fontSize: 18 }}
                          />
                          <Statistic
                            title="Surplus Items"
                            value={adjSummary.surplusCount}
                            valueStyle={{ fontSize: 18, color: '#389e0d' }}
                            prefix={<ArrowUpOutlined />}
                          />
                          <Statistic
                            title="Shortage Items"
                            value={adjSummary.shortageCount}
                            valueStyle={{ fontSize: 18, color: '#cf1322' }}
                            prefix={<ArrowDownOutlined />}
                          />
                          <Statistic
                            title="Net Quantity Variance"
                            value={fmtNum(adjSummary.netVarianceQty)}
                            suffix="Pcs"
                            valueStyle={{
                              fontSize: 18,
                              color: adjSummary.netVarianceQty >= 0 ? '#389e0d' : '#cf1322',
                            }}
                          />
                          <Statistic
                            title="Net Weight Variance"
                            value={fmtNum(adjSummary.netVarianceWeight, 2)}
                            suffix="Kg"
                            valueStyle={{
                              fontSize: 18,
                              color: adjSummary.netVarianceWeight >= 0 ? '#08979c' : '#cf1322',
                            }}
                          />
                        </Space>
                      </Col>

                      <Col xs={24} md={8} style={{ textAlign: 'right' }}>
                        <Button
                          type="primary"
                          size="large"
                          icon={<SaveOutlined />}
                          loading={submittingAdj}
                          onClick={handleSaveAdjustment}
                          disabled={adjSummary.surplusCount === 0 && adjSummary.shortageCount === 0}
                          className="prod-btn-submit-save"
                        >
                          Save & Post Stock Adjustment
                        </Button>
                      </Col>
                    </Row>
                  </div>
                </div>
              ),
            },
            {
              key: 'analytics',
              label: (
                <span>
                  <BarChartOutlined /> 3. Stock & Variance Analytics
                </span>
              ),
              children: (
                <div className="prod-open-stock-tab-content">
                  {/* Top KPI Cards */}
                  {(() => {
                    const statsTotalItems = stats?.summary?.totalItems ?? stats?.totalItemsCount ?? 0;
                    const statsTotalQty = stats?.summary?.totalStockQty ?? stats?.totalStockQty ?? 0;
                    const statsTotalValue = stats?.totalStockValue ?? 0;
                    const statsSurplusCount = stats?.adjustments?.surplusCount ?? stats?.adjustmentsSummary?.surplusCount ?? 0;
                    const statsShortageCount = stats?.adjustments?.shortageCount ?? stats?.adjustmentsSummary?.shortageCount ?? 0;
                    const statsTotalAdjustments = (statsSurplusCount + statsShortageCount) || (stats?.adjustmentsSummary?.totalAdjustments ?? 0);
                    const statsNetVariance = stats?.summary?.netVarianceQty ?? stats?.adjustmentsSummary?.netVarianceQty ?? 0;

                    const statsItemTypes = (stats?.itemTypes || stats?.byItemType || []).map((it: any) => ({
                      type: it.type,
                      count: it.count,
                      totalQty: it.qty ?? it.totalQty ?? 0,
                      totalValue: it.totalValue ?? 0,
                    }));

                    const statsWarehouses = (stats?.warehouses || stats?.byWarehouse || []).map((w: any) => ({
                      warehouseId: w.id || w.warehouseId,
                      warehouseCode: w.code || w.warehouseCode,
                      warehouseName: w.name || w.warehouseName,
                      totalQty: w.qty ?? w.totalQty ?? 0,
                      totalValue: w.totalValue ?? 0,
                    }));

                    return (
                      <>
                        <Row gutter={[16, 16]}>
                          <Col xs={24} sm={12} md={6}>
                            <Card className="prod-kpi-card" bordered={false}>
                              <Statistic
                                title="Total Active Production Items"
                                value={statsTotalItems}
                                prefix={<DatabaseOutlined style={{ color: '#1890ff' }} />}
                              />
                            </Card>
                          </Col>
                          <Col xs={24} sm={12} md={6}>
                            <Card className="prod-kpi-card" bordered={false}>
                              <Statistic
                                title="Total Floor Stock Quantity"
                                value={fmtNum(statsTotalQty)}
                                prefix={<DatabaseOutlined style={{ color: '#52c41a' }} />}
                                valueStyle={{ color: '#389e0d' }}
                              />
                            </Card>
                          </Col>
                          <Col xs={24} sm={12} md={6}>
                            <Card className="prod-kpi-card" bordered={false}>
                              <Statistic
                                title="Estimated Floor Valuation"
                                value={fmtNum(statsTotalValue)}
                                prefix="Rs."
                                valueStyle={{ color: '#096dd9' }}
                              />
                            </Card>
                          </Col>
                          <Col xs={24} sm={12} md={6}>
                            <Card className="prod-kpi-card" bordered={false}>
                              <Statistic
                                title="Floor Stock Adjustments Logged"
                                value={statsTotalAdjustments}
                                prefix={<ThunderboltOutlined style={{ color: '#fa8c16' }} />}
                                suffix={
                                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                                    (+{statsSurplusCount} / -{statsShortageCount})
                                  </span>
                                }
                              />
                            </Card>
                          </Col>
                        </Row>

                        {/* Visual Breakdown Charts */}
                        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                          {/* Chart 1: Item Type Distribution */}
                          <Col xs={24} lg={12}>
                            <Card
                              title={<span>📦 Floor Inventory by Item Type (Raw Material, WIP, Semi-Finished, Finished Goods)</span>}
                              bordered={false}
                              className="prod-chart-card"
                            >
                              {statsItemTypes.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                                  {statsItemTypes.map((item) => {
                                    const maxQty = Math.max(...statsItemTypes.map((x) => x.totalQty || 1));
                                    const pct = Math.min(100, Math.max(8, Math.round(((item.totalQty || 0) / maxQty) * 100)));
                                    const color =
                                      item.type === 'RAW_MATERIAL'
                                        ? '#722ed1'
                                        : item.type === 'WORK_IN_PROGRESS'
                                        ? '#1890ff'
                                        : item.type === 'SEMI_FINISHED'
                                        ? '#fa8c16'
                                        : '#52c41a';

                                    return (
                                      <div key={item.type}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                          <Text strong>{ITEM_TYPE_LABELS[item.type] || item.type}</Text>
                                          <Text type="secondary">
                                            {item.count} items | <b>{fmtNum(item.totalQty)}</b> units {item.totalValue > 0 ? `| ${fmtNum(item.totalValue)} Rs` : ''}
                                          </Text>
                                        </div>
                                        <div className="prod-chart-bar-bg">
                                          <div
                                            className="prod-chart-bar-fill"
                                            style={{
                                              width: `${pct}%`,
                                              backgroundColor: color,
                                            }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                  <Text type="secondary">No stock data available yet.</Text>
                                </div>
                              )}
                            </Card>
                          </Col>

                          {/* Chart 2: Department / Warehouse Distribution */}
                          <Col xs={24} lg={12}>
                            <Card
                              title={<span>🏭 Floor Inventory by Department / Warehouse</span>}
                              bordered={false}
                              className="prod-chart-card"
                            >
                              {statsWarehouses.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                                  {statsWarehouses.map((w) => {
                                    const maxQty = Math.max(...statsWarehouses.map((x) => x.totalQty || 1));
                                    const pct = Math.min(100, Math.max(8, Math.round(((w.totalQty || 0) / maxQty) * 100)));

                                    return (
                                      <div key={w.warehouseId}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                          <Text strong>
                                            {w.warehouseCode} - {w.warehouseName}
                                          </Text>
                                          <Text type="secondary">
                                            <b>{fmtNum(w.totalQty)}</b> units {w.totalValue > 0 ? `| ${fmtNum(w.totalValue)} Rs` : ''}
                                          </Text>
                                        </div>
                                        <div className="prod-chart-bar-bg">
                                          <div
                                            className="prod-chart-bar-fill"
                                            style={{
                                              width: `${pct}%`,
                                              backgroundColor: '#13c2c2',
                                            }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                  <Text type="secondary">No warehouse data available yet.</Text>
                                </div>
                              )}
                            </Card>
                          </Col>
                        </Row>

                        {/* Chart 3: Variance Surplus vs Shortage */}
                        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                          <Col xs={24}>
                            <Card
                              title={<span>⚖️ Floor Variance Breakdown</span>}
                              bordered={false}
                              className="prod-chart-card"
                            >
                              <Row gutter={[24, 24]} align="middle">
                                <Col xs={24} md={8}>
                                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                    <Statistic
                                      title="Surplus"
                                      value={statsSurplusCount}
                                      prefix={<ArrowUpOutlined style={{ color: '#52c41a' }} />}
                                      suffix="items"
                                      valueStyle={{ color: '#389e0d', fontSize: 26 }}
                                    />
                                  </div>
                                </Col>
                                <Col xs={24} md={8}>
                                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                    <Statistic
                                      title="Shortage"
                                      value={statsShortageCount}
                                      prefix={<ArrowDownOutlined style={{ color: '#f5222d' }} />}
                                      suffix="items"
                                      valueStyle={{ color: '#cf1322', fontSize: 26 }}
                                    />
                                  </div>
                                </Col>
                                <Col xs={24} md={8}>
                                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                    <Statistic
                                      title="Net Floor Quantity Variance"
                                      value={fmtNum(statsNetVariance)}
                                      valueStyle={{
                                        fontSize: 26,
                                        color: statsNetVariance >= 0 ? '#389e0d' : '#cf1322',
                                      }}
                                    />
                                  </div>
                                </Col>
                              </Row>
                            </Card>
                          </Col>
                        </Row>
                      </>
                    );
                  })()}
                </div>
              ),
            },
            {
              key: 'history',
              label: (
                <span>
                  <HistoryOutlined /> 4. History & Ledger Audit
                </span>
              ),
              children: (
                <div className="prod-open-stock-tab-content">
                  {/* History Toolbar */}
                  <div className="prod-actions-bar">
                    <Row justify="space-between" align="middle" gutter={[12, 12]}>
                      <Col xs={24} md={16}>
                        <Space wrap>
                          <Input.Search
                            placeholder="Search by Item Code, Name or Reference..."
                            value={historySearch}
                            onChange={(e) => setHistorySearch(e.target.value)}
                            style={{ width: 240 }}
                            allowClear
                          />
                          <Select
                            value={historyWarehouseId}
                            onChange={(v) => {
                              setHistoryWarehouseId(v);
                              loadHistory(v);
                            }}
                            style={{ width: 220 }}
                          >
                            <Option value="ALL">All Departments / Warehouses</Option>
                            {warehouses.map((w) => (
                              <Option key={w.id} value={w.id}>
                                {w.warehouseCode} - {w.warehouseName || w.name}
                              </Option>
                            ))}
                          </Select>
                          <Select
                            value={historyFilterType}
                            onChange={(v) => setHistoryFilterType(v)}
                            style={{ width: 170 }}
                          >
                            <Option value="ALL">All Transactions</Option>
                            <Option value="OPENING">Opening Stock Only</Option>
                            <Option value="ADJUSTMENT_IN">Adjustment In (+)</Option>
                            <Option value="ADJUSTMENT_OUT">Adjustment Out (-)</Option>
                          </Select>
                          <Button
                            icon={<SyncOutlined />}
                            onClick={() => loadHistory(historyWarehouseId)}
                            loading={loadingHistory}
                          >
                            Refresh
                          </Button>
                        </Space>
                      </Col>

                      <Col xs={24} md={8} style={{ textAlign: 'right' }}>
                        <Text type="secondary">Showing {filteredHistory.length} audit records</Text>
                      </Col>
                    </Row>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <Table
                      dataSource={filteredHistory}
                      columns={historyColumns}
                      rowKey="id"
                      pagination={{ pageSize: 25, showSizeChanger: true }}
                      scroll={{ x: 1100 }}
                      size="middle"
                      loading={loadingHistory}
                    />
                  </div>
                </div>
              ),
            },
            {
              key: 'matrix',
              label: (
                <span>
                  <ApartmentOutlined /> 5. Department Stock Breakdown & Hierarchy
                </span>
              ),
              children: (
                <div className="prod-open-stock-tab-content">
                  {/* Top Control Bar */}
                  <div className="matrix-toolbar">
                    <Row justify="space-between" align="middle" gutter={[16, 16]}>
                      <Col xs={24} lg={14}>
                        <Space wrap size="middle">
                          <div>
                            <Text strong style={{ marginRight: 8, fontSize: 13 }}>Division:</Text>
                            <Select
                              value={matrixDivision}
                              onChange={(val) => {
                                setMatrixDivision(val);
                                loadMatrix(val, matrixSearch);
                              }}
                              style={{ width: 220 }}
                            >
                              <Option value="ALL">All Divisions</Option>
                              <Option value="d1000000-0000-0000-0000-000000000001">DIV-SPD - Spoke Division</Option>
                              <Option value="d1000000-0000-0000-0000-000000000002">DIV-CCD - Control Cable Division</Option>
                              <Option value="83ecd746-1cc9-4849-bec4-d00bcc3ceeec">DIV-PWI - Main Division E-51</Option>
                              <Option value="0653339b-94d0-4cc5-b880-e07908b2015f">DIV-NB - NB Division</Option>
                            </Select>
                          </div>

                          <Input.Search
                            placeholder="Filter department or item..."
                            allowClear
                            value={matrixSearch}
                            onChange={(e) => setMatrixSearch(e.target.value)}
                            onSearch={(val) => loadMatrix(matrixDivision, val)}
                            style={{ width: 240 }}
                          />

                          <Button
                            icon={<SyncOutlined />}
                            onClick={() => loadMatrix(matrixDivision, matrixSearch)}
                            loading={loadingMatrix}
                          >
                            Refresh
                          </Button>
                        </Space>
                      </Col>

                      <Col xs={24} lg={10} style={{ textAlign: 'right' }}>
                        <Space wrap size="small">
                          <Button
                            icon={<PlusOutlined />}
                            onClick={handleExpandAllWh}
                            size="small"
                          >
                            Expand All [+]
                          </Button>
                          <Button
                            icon={<MinusOutlined />}
                            onClick={handleCollapseAllWh}
                            size="small"
                          >
                            Collapse All [-]
                          </Button>

                          {isReorderMode ? (
                            <>
                              <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                onClick={handleSaveCustomOrder}
                                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                              >
                                Save Custom Layout
                              </Button>
                              <Button
                                icon={<ClearOutlined />}
                                onClick={handleResetOrder}
                                danger
                              >
                                Reset Order
                              </Button>
                              <Button
                                icon={<LockOutlined />}
                                onClick={() => setIsReorderMode(false)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              icon={<UnlockOutlined />}
                              onClick={() => setIsReorderMode(true)}
                              style={{ borderColor: '#faad14', color: '#d48806' }}
                            >
                              Re-order / Sequence Edit
                            </Button>
                          )}
                        </Space>
                      </Col>
                    </Row>
                  </div>

                  {/* Mode Alert if Re-ordering */}
                  {isReorderMode && (
                    <Alert
                      message="Re-order Sequence Mode Active"
                      description="Use the Up (▲) and Down (▼) buttons on each department card to arrange the sequence as needed. When finished, click 'Save Custom Layout' to permanently store this order for the selected division."
                      type="warning"
                      showIcon
                      style={{ marginBottom: 16 }}
                    />
                  )}

                  {/* Total Summary Strip */}
                  {(() => {
                    const totalDepts = matrixData.length;
                    const totalItems = matrixData.reduce((sum, r) => sum + (r.summary?.totalItems || 0), 0);
                    const totalWeightKg = matrixData.reduce((sum, r) => sum + (r.summary?.totalWeightKg || 0), 0);
                    const totalPieces = matrixData.reduce((sum, r) => sum + (r.summary?.totalPieces || 0), 0);
                    const totalValuation = matrixData.reduce((sum, r) => sum + (r.summary?.totalValuation || 0), 0);

                    return (
                      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                        <Col xs={12} sm={6} md={4}>
                          <Card size="small" style={{ borderRadius: 8, background: '#f8fafc', textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Active Floors</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{totalDepts}</div>
                          </Card>
                        </Col>
                        <Col xs={12} sm={6} md={5}>
                          <Card size="small" style={{ borderRadius: 8, background: '#f8fafc', textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Items with Stock</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#1890ff', marginTop: 2 }}>{totalItems} Items</div>
                          </Card>
                        </Col>
                        <Col xs={12} sm={6} md={5}>
                          <Card size="small" style={{ borderRadius: 8, background: '#f0f5ff', border: '1px solid #adc6ff', textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: '#1d39c4', fontWeight: 600, textTransform: 'uppercase' }}>⚖️ Total Weight (KG)</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#1d39c4', marginTop: 2 }}>{fmtNum(totalWeightKg, 2)} Kg</div>
                          </Card>
                        </Col>
                        <Col xs={12} sm={6} md={5}>
                          <Card size="small" style={{ borderRadius: 8, background: '#e6fffb', border: '1px solid #87e8de', textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: '#006d75', fontWeight: 600, textTransform: 'uppercase' }}>🔢 Total Pieces (PCS)</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#006d75', marginTop: 2 }}>{fmtNum(totalPieces, 0)} Pcs</div>
                          </Card>
                        </Col>
                        <Col xs={12} sm={6} md={5}>
                          <Card size="small" style={{ borderRadius: 8, background: '#fffbe6', border: '1px solid #ffe58f', textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: '#d48806', fontWeight: 600, textTransform: 'uppercase' }}>Total Valuation</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#d48806', marginTop: 2 }}>Rs. {fmtNum(totalValuation, 0)}</div>
                          </Card>
                        </Col>
                      </Row>
                    );
                  })()}

                  {/* List of Department/Warehouse Cards */}
                  {loadingMatrix ? (
                    <div style={{ textAlign: 'center', padding: '60px 0' }}>
                      <SyncOutlined spin style={{ fontSize: 32, color: '#1890ff' }} />
                      <div style={{ marginTop: 12, color: '#64748b' }}>Loading department stock matrix...</div>
                    </div>
                  ) : matrixData.length === 0 ? (
                    <Alert
                      message="No Department Floor Stock Found"
                      description="No active stock balances match the selected division or search query."
                      type="info"
                      showIcon
                      style={{ marginTop: 20 }}
                    />
                  ) : (
                    matrixData.map((wh, idx) => {
                      const isExpanded = expandedWhKeys.includes(wh.warehouseId);
                      const itemCount = wh.summary?.totalItems || wh.items?.length || 0;
                      const totWeight = wh.summary?.totalWeightKg || 0;
                      const totPieces = wh.summary?.totalPieces || 0;

                      return (
                        <div key={wh.warehouseId} className={`matrix-wh-card ${isExpanded ? 'is-expanded' : ''}`}>
                          {/* Warehouse Card Header */}
                          <div
                            className="matrix-wh-header"
                            onClick={() => handleToggleExpandWh(wh.warehouseId)}
                          >
                            <div className="matrix-wh-title-box">
                              {/* Re-order controls when in edit mode */}
                              {isReorderMode && (
                                <div className="matrix-order-controls" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="small"
                                    icon={<ArrowUpOutlined />}
                                    disabled={idx === 0}
                                    onClick={() => handleMoveWarehouse(idx, 'UP')}
                                  />
                                  <Button
                                    size="small"
                                    icon={<ArrowDownOutlined />}
                                    disabled={idx === matrixData.length - 1}
                                    onClick={() => handleMoveWarehouse(idx, 'DOWN')}
                                  />
                                  <Tag color="orange" style={{ fontWeight: 'bold' }}>#{idx + 1}</Tag>
                                </div>
                              )}

                              {/* Prominent [+] / [-] Expand Button */}
                              <button
                                type="button"
                                className={`matrix-expand-btn ${isExpanded ? 'btn-minus' : 'btn-plus'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleExpandWh(wh.warehouseId);
                                }}
                              >
                                {isExpanded ? '−' : '+'}
                              </button>

                              <Tag color="blue" style={{ fontSize: 13, fontWeight: 700, padding: '2px 8px' }}>
                                {wh.warehouseCode}
                              </Tag>

                              <Text strong style={{ fontSize: 15, color: '#1e293b' }}>
                                {wh.warehouseName}
                              </Text>

                              <Tag color={wh.inferredDivision === 'SPI' ? 'purple' : wh.inferredDivision === 'CCD' ? 'cyan' : 'default'}>
                                {wh.divisionName || wh.inferredDivision}
                              </Tag>
                            </div>

                            {/* Summary Badges on Header */}
                            <div className="matrix-wh-summary-badges" onClick={(e) => e.stopPropagation()}>
                              <Tag color={itemCount > 0 ? 'geekblue' : 'default'} style={{ fontSize: 12 }}>
                                📦 {itemCount} Items
                              </Tag>
                              <Tag color="blue" style={{ fontSize: 12, fontWeight: 600 }}>
                                ⚖️ {fmtNum(totWeight, 2)} KG
                              </Tag>
                              <Tag color="cyan" style={{ fontSize: 12, fontWeight: 600 }}>
                                🔢 {fmtNum(totPieces, 0)} PCS
                              </Tag>
                              <Button
                                size="small"
                                type="link"
                                onClick={() => {
                                  setAdjWarehouseId(wh.warehouseId);
                                  setActiveTab('adjustment');
                                }}
                              >
                                Physical Verification &rarr;
                              </Button>
                            </div>
                          </div>

                          {/* Expanded Item Breakdown Table */}
                          {isExpanded && (
                            <div className="matrix-item-content">
                              {wh.items && wh.items.length > 0 ? (
                                <Table
                                  dataSource={wh.items}
                                  rowKey="itemId"
                                  pagination={false}
                                  size="small"
                                  bordered
                                  columns={[
                                    {
                                      title: '#',
                                      width: 45,
                                      align: 'center',
                                      render: (_, __, i) => i + 1,
                                    },
                                    {
                                      title: 'Item (Name & Code)',
                                      key: 'item',
                                      width: 280,
                                      render: (_, rec) => (
                                        <div>
                                          <div style={{ fontWeight: 600, color: '#096dd9', fontSize: 13 }}>
                                            {rec.itemName}
                                          </div>
                                          <Space size={6} wrap style={{ marginTop: 2 }}>
                                            <Text type="secondary" code style={{ fontSize: 11 }}>
                                              {rec.itemCode}
                                            </Text>
                                            <Tag color={ITEM_TYPE_COLORS[rec.itemType] || 'default'} style={{ fontSize: 10 }}>
                                              {ITEM_TYPE_LABELS[rec.itemType] || rec.itemType}
                                            </Tag>
                                          </Space>
                                        </div>
                                      ),
                                    },
                                    {
                                      title: (
                                        <Tooltip title="Auto-loaded from Item Master profile">
                                          <span>Per-Piece Weight (Kg/pc)</span>
                                        </Tooltip>
                                      ),
                                      key: 'weightPerPiece',
                                      width: 160,
                                      align: 'right',
                                      render: (_, rec) =>
                                        rec.weightPerPiece > 0 ? (
                                          <Space size={4}>
                                            <Text strong style={{ color: '#08979c', fontFamily: 'monospace' }}>
                                              {rec.weightPerPiece.toFixed(6)}
                                            </Text>
                                            <Tag color="cyan" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                                              AUTO
                                            </Tag>
                                          </Space>
                                        ) : (
                                          <Text type="secondary" style={{ fontSize: 11 }}>
                                            Not set (0)
                                          </Text>
                                        ),
                                    },
                                    {
                                      title: 'System Book Stock',
                                      key: 'primaryStock',
                                      width: 140,
                                      align: 'right',
                                      render: (_, rec) => (
                                        <div>
                                          <Text strong style={{ fontSize: 13 }}>
                                            {fmtNum(rec.primaryStock, rec.isKg ? 2 : 0)}
                                          </Text>{' '}
                                          <Tag color={rec.isKg ? 'geekblue' : 'cyan'}>{rec.uomCode}</Tag>
                                        </div>
                                      ),
                                    },
                                    {
                                      title: (
                                        <Tooltip title="Dual-Line Conversion: Line 1 for KG, Line 2 for Pieces using Per-Piece Weight">
                                          <span>Dual-Unit Breakdown (KG ↔ PCS)</span>
                                        </Tooltip>
                                      ),
                                      key: 'dualConversion',
                                      width: 240,
                                      render: (_, rec) => {
                                        const weightFormula = rec.isKg
                                          ? 'Direct Book Weight'
                                          : `${fmtNum(rec.primaryStock, 0)} PCS × ${rec.weightPerPiece.toFixed(6)} Kg/pc`;
                                        const piecesFormula = rec.isKg
                                          ? `${fmtNum(rec.primaryStock, 2)} KG ÷ ${rec.weightPerPiece.toFixed(6)} Kg/pc`
                                          : 'Direct Book Pieces';

                                        return (
                                          <div className="matrix-dual-unit-box">
                                            <Tooltip title={`Weight: ${weightFormula}`}>
                                              <div className="matrix-unit-line line-weight">
                                                <span style={{ fontWeight: 600 }}>⚖️ Weight (KG)</span>
                                                <span style={{ fontWeight: 700 }}>
                                                  {fmtNum(rec.convertedWeightKg, 2)} KG
                                                </span>
                                              </div>
                                            </Tooltip>
                                            <Tooltip title={`Pieces: ${piecesFormula}`}>
                                              <div className="matrix-unit-line line-pcs">
                                                <span style={{ fontWeight: 600 }}>🔢 Pieces (PCS)</span>
                                                <span style={{ fontWeight: 700 }}>
                                                  {fmtNum(rec.convertedPieces, 0)} PCS
                                                </span>
                                              </div>
                                            </Tooltip>
                                          </div>
                                        );
                                      },
                                    },
                                    {
                                      title: 'Unit Rate & Value (PKR)',
                                      key: 'valuation',
                                      width: 160,
                                      align: 'right',
                                      render: (_, rec) => (
                                        <div>
                                          <div style={{ fontSize: 11, color: '#64748b' }}>
                                            {rec.unitCost > 0 ? `@ ${fmtNum(rec.unitCost, 2)} Rs` : '—'}
                                          </div>
                                          <div style={{ fontWeight: 700, color: '#096dd9', fontSize: 13 }}>
                                            {fmtNum(rec.totalValuation)} Rs
                                          </div>
                                        </div>
                                      ),
                                    },
                                    {
                                      title: 'Action',
                                      key: 'action',
                                      width: 90,
                                      align: 'center',
                                      render: () => (
                                        <Button
                                          size="small"
                                          type="link"
                                          onClick={() => {
                                            setAdjWarehouseId(wh.warehouseId);
                                            setActiveTab('adjustment');
                                          }}
                                        >
                                          Adjust
                                        </Button>
                                      ),
                                    },
                                  ]}
                                />
                              ) : (
                                <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8' }}>
                                  No items currently recorded with positive balance in this department.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default ProductionItemOpenStock;
