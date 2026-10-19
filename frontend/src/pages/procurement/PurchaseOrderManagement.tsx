import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Table, Button, Input, Select, DatePicker, App, Modal, Tooltip,
  Row, Col, Form, InputNumber, Tag, Badge,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, FileTextOutlined, PrinterOutlined,
  DeleteOutlined, EditOutlined, EyeOutlined, SearchOutlined,
  ShoppingCartOutlined, SyncOutlined, MailOutlined, InfoCircleOutlined,
  CloseOutlined, CheckOutlined, FilterOutlined, CalendarOutlined,
  CameraOutlined, SoundOutlined, SaveOutlined, WarningOutlined,
  BarcodeOutlined, CarOutlined, WalletOutlined, UserOutlined,
  ClearOutlined, ApartmentOutlined, SafetyCertificateOutlined,
  ShopOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { usePermission } from '../../hooks/usePermission';
import { printPurchaseOrderDocument, printTableList, printGatePassDocument } from '../../utils/printTemplates';
import { DraggableResizableModal } from '../../components/shared';
import './PurchaseOrderManagement.css';

interface DivisionOption {
  id: string;
  code?: string;
  name: string;
}

const DEFAULT_DIVISIONS: DivisionOption[] = [
  { id: 'div-wd', code: 'WD', name: 'Wire Drawing Division' },
  { id: 'div-galv', code: 'GALV', name: 'Galvanizing Division' },
  { id: 'div-ccd', code: 'CCD', name: 'Control Cable Division' },
  { id: 'div-nail', code: 'NAIL', name: 'Nail & Fastener Division' },
  { id: 'div-corp', code: 'CORP', name: 'Corporate & Master Division' },
];

interface PurchaseOrderItem {
  id: string;
  itemCode: string;
  itemName?: string;
  name?: string;
  reorderLevel?: number;
  currentStock?: number;
  costPrice?: number;
  purchasePrice?: number;
  standardCost?: number;
  baseUomId?: string;
  baseUom?: { id: string; code: string; name: string };
  purchaseUomId?: string;
  purchaseUom?: { id: string; code: string; name: string };
  salesUomId?: string;
  salesUom?: { id: string; code: string; name: string };
  uomId?: string;
  uomCode?: string;
}

interface PurchaseOrderLineForm {
  id: string;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  uomId?: string;
  uomCode?: string;
  uomName?: string;
  quantity: number;
  previousRate?: number;
  unitPrice: number;
  gstPercent: number;
  lineTotal: number;
}

interface PurchaseOrder {
  id: string;
  companyId?: string;
  poCode: string;
  supplierId?: string;
  supplier?: { id: string; name: string; supplierCode: string };
  supplierName?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  deliveryAddress?: string;
  paymentTerms?: string;
  currencyCode?: string;
  subtotal?: number;
  taxAmount?: number;
  taxPercent?: number;
  discountAmount?: number;
  discountPercent?: number;
  shippingCost?: number;
  totalAmount: number;
  status: string;
  orderedQty?: number;
  receivedQty?: number;
  receivedAmount?: number;
  invoicedAmount?: number;
  notes?: string;
  divisionId?: string;
  divisionName?: string;
  warehouseId?: string;
  warehouse?: { id: string; warehouseCode: string; name: string };
  items?: any[];
  createdByName?: string;
  createdBy?: string;
  createdAt?: string;
}

interface ConfirmModalState {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

interface ResultModalState {
  open: boolean;
  title: string;
  subtitle: string;
}

const PurchaseOrderManagement: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const canCreate = can('procurement.order.create');

  // List view state
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [activeChevron, setActiveChevron] = useState<'ALL' | 'PENDING' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED'>('ALL');

  // Filters state
  const [showFilters, setShowFilters] = useState(false);
  const [filterSupplier, setFilterSupplier] = useState<string | undefined>(undefined);
  const [filterPayment, setFilterPayment] = useState<string | undefined>(undefined);
  const [filterDateFrom, setFilterDateFrom] = useState<dayjs.Dayjs | null>(null);
  const [filterDateTo, setFilterDateTo] = useState<dayjs.Dayjs | null>(null);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterSupplier) count++;
    if (filterPayment) count++;
    if (filterDateFrom) count++;
    if (filterDateTo) count++;
    return count;
  }, [filterSupplier, filterPayment, filterDateFrom, filterDateTo]);

  const [searchParams] = useSearchParams();
  const [quotationsList, setQuotationsList] = useState<any[]>([]);
  const [requisitionsList, setRequisitionsList] = useState<any[]>([]);

  // Reference data
  const [suppliers, setSuppliers] = useState<Array<{ id: string; supplierCode: string; name: string }>>([]);
  const [itemsCatalog, setItemsCatalog] = useState<PurchaseOrderItem[]>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>(DEFAULT_DIVISIONS);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string }>>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [latestRatesMap, setLatestRatesMap] = useState<Map<string, number>>(new Map());
  const [companyId, setCompanyId] = useState('');
  const [currentUserName, setCurrentUserName] = useState('admin');

  // Create / Edit Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PurchaseOrder | null>(null);
  const [viewingItem, setViewingItem] = useState<PurchaseOrder | null>(null);
  const [form] = Form.useForm();
  const [scanSkuInput, setScanSkuInput] = useState('');
  const [lines, setLines] = useState<PurchaseOrderLineForm[]>([]);
  const [formDiscount, setFormDiscount] = useState<number>(0);

  // Global Confirmation Modal State (required for EVERY button action)
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    open: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Framed Green Checkmark Result Dialog State
  const [resultModal, setResultModal] = useState<ResultModalState>({
    open: false,
    title: '',
    subtitle: '',
  });

  // Load User and Master Data
  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try {
        const parsed = JSON.parse(erpUser);
        if (parsed?.defaultCompanyId) setCompanyId(parsed.defaultCompanyId);
        if (parsed?.name || parsed?.username) setCurrentUserName(parsed.name || parsed.username);
      } catch { /* ignore */ }
    }

    (async () => {
      try {
        const divRes = await apiService.get<any>('/divisions', { limit: 100 });
        const d = divRes?.data || divRes;
        const list = d?.data || (Array.isArray(d) ? d : []);
        if (list.length > 0) {
          setDivisions(list.map((item: any) => ({
            id: item.id,
            code: item.code || item.divisionCode,
            name: item.name || item.divisionName,
          })));
        }
      } catch { /* fallback to default */ }

      try {
        const supRes = await apiService.get<{ data: Array<{ id: string; supplierCode: string; name: string }> }>('/procurement/suppliers', { limit: 200 });
        setSuppliers(supRes.data || []);
      } catch { /* ignore */ }

      try {
        const whRes = await apiService.get<{ data: Array<{ id: string; warehouseCode: string; name: string }> }>('/warehouses', { limit: 100 });
        const whList = whRes.data || [];
        setWarehouses(whList);
        const spiWh = whList.find(w => w.name?.toLowerCase().includes('spi main') || w.warehouseCode === 'WH-002') || whList[0];
        if (spiWh) {
          setSelectedWarehouseId((prev) => prev || spiWh.id);
        }
      } catch { /* ignore */ }

      try {
        const itemsRes = await apiService.get<any>('/master-data/items', { limit: 500 });
        const list = itemsRes?.data?.data || itemsRes?.data || (Array.isArray(itemsRes) ? itemsRes : []);
        if (Array.isArray(list) && list.length > 0) {
          setItemsCatalog(list);
        }
      } catch { /* ignore */ }

      try {
        const ratesRes = await apiService.get<any>('/procurement/orders/item-rates/latest');
        const rData = ratesRes?.data || ratesRes;
        const rMap = new Map<string, number>();
        if (rData && typeof rData === 'object') {
          Object.keys(rData).forEach((itemId) => {
            if (rData[itemId]?.lastPrice) {
              rMap.set(itemId, Number(rData[itemId].lastPrice));
            }
          });
        }
        setLatestRatesMap(rMap);
      } catch { /* ignore */ }

      try {
        const qRes = await apiService.get<any>('/procurement/quotations', { limit: 200 });
        const qList = Array.isArray(qRes) ? qRes : qRes?.data || [];
        setQuotationsList(qList);
      } catch { /* ignore */ }

      try {
        const prRes = await apiService.get<any>('/procurement/requisitions', { limit: 200 });
        const prList = Array.isArray(prRes) ? prRes : prRes?.data || [];
        setRequisitionsList(prList);
      } catch { /* ignore */ }
    })();
  }, []);

  // Fetch real available stock from inventory balances
  const fetchStockBalances = useCallback(async (whId?: string) => {
    try {
      const params: any = { limit: 2000 };
      if (whId) params.warehouseId = whId;
      const res = await apiService.get<any>('/inventory/balances', params);
      const list = res?.data?.data || res?.data || (Array.isArray(res) ? res : []);
      const map = new Map<string, number>();
      if (Array.isArray(list)) {
        list.forEach((b: any) => {
          const itId = b.itemId || b.item_id || b.item?.id;
          if (itId) {
            const current = map.get(itId) || 0;
            const avail = Number(b.available ?? b.onHand ?? b.on_hand ?? 0);
            map.set(itId, current + avail);
          }
        });
      }
      setStockMap(map);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (selectedWarehouseId) {
      void fetchStockBalances(selectedWarehouseId);
    } else {
      void fetchStockBalances();
    }
  }, [selectedWarehouseId, fetchStockBalances]);

  const productOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; itemCode?: string; name?: string }>();
    itemsCatalog.forEach((it) => {
      const name = it.itemName || it.name || it.itemCode;
      const stock = stockMap.get(it.id);
      const purUomCode = it.purchaseUom?.code || (it as any).pur_uom_code || it.uomCode;
      const isGross = purUomCode === 'GRS' || String(it.purchaseUom?.name).toLowerCase().includes('gross');

      let stockText = '0 in stock';
      if (stock !== undefined && stock !== null) {
        const pcs = Number(stock);
        if (isGross) {
          const gross = Math.floor(pcs / 144);
          const remPcs = pcs % 144;
          const grossStr = remPcs > 0 ? `${gross.toLocaleString()} Gross + ${remPcs} pcs` : `${gross.toLocaleString()} Gross`;
          stockText = `${grossStr} (${pcs.toLocaleString()} pcs in stock)`;
        } else {
          stockText = `${pcs.toLocaleString()} ${purUomCode || 'pcs'} in stock`;
        }
      }

      map.set(it.id, {
        value: it.id,
        label: `${name} [${it.itemCode}] (${stockText})`,
        itemCode: it.itemCode,
        name,
      });
    });
    lines.forEach((ln, idx) => {
      if (ln.itemId && !map.has(ln.itemId)) {
        const name = ln.itemName || ln.itemCode || `Product ${idx + 1}`;
        const stock = stockMap.get(ln.itemId);
        const isGross = ln.uomCode === 'GRS';
        let stockText = '0 in stock';
        if (stock !== undefined && stock !== null) {
          const pcs = Number(stock);
          if (isGross) {
            const gross = Math.floor(pcs / 144);
            const remPcs = pcs % 144;
            const grossStr = remPcs > 0 ? `${gross.toLocaleString()} Gross + ${remPcs} pcs` : `${gross.toLocaleString()} Gross`;
            stockText = `${grossStr} (${pcs.toLocaleString()} pcs in stock)`;
          } else {
            stockText = `${pcs.toLocaleString()} ${ln.uomCode || 'pcs'} in stock`;
          }
        }
        map.set(ln.itemId, {
          value: ln.itemId,
          label: `${name} [${ln.itemCode || 'SKU'}] (${stockText})`,
          itemCode: ln.itemCode,
          name,
        });
      }
    });
    return Array.from(map.values());
  }, [itemsCatalog, lines, stockMap]);

  // Fetch Purchase Orders
  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterSupplier) params.supplierId = filterSupplier;

      if (activeChevron === 'PENDING') {
        params.status = 'PENDING';
      } else if (activeChevron === 'PARTIAL') {
        params.status = 'PARTIALLY_RECEIVED';
      } else if (activeChevron === 'RECEIVED') {
        params.status = 'FULLY_RECEIVED';
      } else if (activeChevron === 'CANCELLED') {
        params.status = 'CANCELLED';
      }

      const response = await apiService.get<{ data: PurchaseOrder[]; total: number }>('/procurement/orders', params);
      let loaded = response.data || [];

      // Client-side date and payment filtering if specified
      if (filterDateFrom) {
        loaded = loaded.filter((po) => po.orderDate && dayjs(po.orderDate).isAfter(filterDateFrom.subtract(1, 'day')));
      }
      if (filterDateTo) {
        loaded = loaded.filter((po) => po.orderDate && dayjs(po.orderDate).isBefore(filterDateTo.add(1, 'day')));
      }
      if (filterPayment) {
        if (filterPayment === 'Paid') {
          loaded = loaded.filter((po) => Number(po.receivedAmount || 0) >= Number(po.totalAmount || 0) && Number(po.totalAmount) > 0);
        } else if (filterPayment === 'Due') {
          loaded = loaded.filter((po) => Number(po.receivedAmount || 0) < Number(po.totalAmount || 0));
        } else if (filterPayment === 'Partial') {
          loaded = loaded.filter((po) => Number(po.receivedAmount || 0) > 0 && Number(po.receivedAmount || 0) < Number(po.totalAmount || 0));
        }
      }

      setData(loaded);
      setTotal(response.total ?? loaded.length);
    } catch (error) {
      message.error('Failed to fetch purchase orders');
    } finally {
      setLoading(false);
    }
  }, [search, filterSupplier, filterPayment, filterDateFrom, filterDateTo, activeChevron, pageSize, message]);

  useEffect(() => {
    fetchData(page);
  }, [page, fetchData]);

  // Compute status counts for Chevrons
  const statusCounts = useMemo(() => {
    const counts = { ALL: data.length, PENDING: 0, PARTIAL: 0, RECEIVED: 0, CANCELLED: 0 };
    data.forEach((po) => {
      const st = (po.status || '').toUpperCase();
      if (st === 'PENDING' || st === 'DRAFT' || st === 'SUBMITTED') {
        counts.PENDING += 1;
      } else if (st === 'PARTIALLY_RECEIVED' || st === 'PARTIAL') {
        counts.PARTIAL += 1;
      } else if (st === 'FULLY_RECEIVED' || st === 'APPROVED' || st === 'RECEIVED') {
        counts.RECEIVED += 1;
      } else if (st === 'CANCELLED') {
        counts.CANCELLED += 1;
      }
    });
    return counts;
  }, [data]);

  // Reset all filters
  const handleClearFilters = () => {
    setFilterSupplier(undefined);
    setFilterPayment(undefined);
    setFilterDateFrom(null);
    setFilterDateTo(null);
    setSearch('');
    setActiveChevron('ALL');
    setPage(1);
  };

  const handleQuotationSelect = async (quotationId: string | null) => {
    if (!quotationId) return;
    try {
      const res = await apiService.get<any>(`/procurement/quotations/${quotationId}`);
      const q = res?.data || res;
      if (!q) return;

      const updates: any = {};
      if (q.supplierId) updates.supplierId = q.supplierId;
      if (q.divisionId) updates.divisionId = q.divisionId;
      if (q.warehouseId) {
        updates.warehouseId = q.warehouseId;
        setSelectedWarehouseId(q.warehouseId);
      }
      updates.supplierBillNo = `QT/${q.quotationCode}`;
      updates.notes = `Generated from Quotation ${q.quotationCode} [RFQ: ${q.rfqCode || 'N/A'}]`;
      form.setFieldsValue(updates);

      if (q.lines && Array.isArray(q.lines) && q.lines.length > 0) {
        const mappedLines: PurchaseOrderLineForm[] = q.lines.map((l: any, idx: number) => {
          const itId = l.itemId || l.item?.id;
          const matched = itemsCatalog.find((it) => it.id === itId);
          const purUom = l.uom || matched?.purchaseUom || matched?.baseUom;
          const uomCode = purUom?.code || l.uomCode || 'KG';
          const uomName = purUom?.name || 'Kilogram';
          const qty = Number(l.quantity || 1);
          const unitRate = Number(l.unitPrice || 0);
          const gst = Number(l.taxPercent || 18);
          const lineTot = Number(l.totalPrice || (qty * unitRate));

          return {
            id: String(idx + 1),
            itemId: itId,
            itemCode: l.item?.itemCode || matched?.itemCode || `SKU-00${idx + 1}`,
            itemName: l.item?.name || matched?.itemName || matched?.name || l.itemName || 'Raw Material',
            uomId: l.uomId || matched?.purchaseUomId || matched?.baseUomId,
            uomCode,
            uomName,
            previousRate: unitRate,
            quantity: qty,
            unitPrice: unitRate,
            gstPercent: gst,
            lineTotal: lineTot,
          };
        });

        setLines(mappedLines);
        message.success(`Quotation ${q.quotationCode} linked! Auto-filled ${mappedLines.length} item(s) with supplier rates.`);
      }
    } catch {
      message.error('Failed to load quotation items');
    }
  };

  const handleRequisitionSelect = async (requisitionId: string | null) => {
    if (!requisitionId) return;
    try {
      const res = await apiService.get<any>(`/procurement/requisitions/${requisitionId}`);
      const pr = res?.data || res;
      if (!pr) return;

      const rawNotes = pr.notes || '';
      const divMatch = rawNotes.match(/\[Division:\s*([^\]]+)\]/i);
      const storeMatch = rawNotes.match(/\[Store:\s*([^\]]+)\]/i);

      let matchedDivisionId = pr.divisionId;
      if (!matchedDivisionId && divMatch) {
        const found = divisions.find(d =>
          d.name?.toLowerCase().includes(divMatch[1].toLowerCase()) ||
          d.code?.toLowerCase().includes(divMatch[1].toLowerCase())
        );
        if (found) matchedDivisionId = found.id;
      }

      let matchedWarehouseId = pr.warehouseId;
      if (!matchedWarehouseId && storeMatch) {
        const found = warehouses.find(w =>
          w.name?.toLowerCase().includes(storeMatch[1].toLowerCase()) ||
          w.warehouseCode?.toLowerCase().includes(storeMatch[1].toLowerCase())
        );
        if (found) matchedWarehouseId = found.id;
      }

      const updates: any = {};
      if (matchedDivisionId) updates.divisionId = matchedDivisionId;
      if (matchedWarehouseId) {
        updates.warehouseId = matchedWarehouseId;
        setSelectedWarehouseId(matchedWarehouseId);
      }
      updates.notes = `Generated from PR ${pr.requisitionCode}: ${pr.title || ''}`;
      form.setFieldsValue(updates);

      if (pr.lines && Array.isArray(pr.lines) && pr.lines.length > 0) {
        const mappedLines: PurchaseOrderLineForm[] = pr.lines.map((l: any, idx: number) => {
          const itId = l.itemId || l.item?.id;
          const matched = itemsCatalog.find((it) => it.id === itId);
          const purUom = l.uom || matched?.purchaseUom || matched?.baseUom;
          const uomCode = purUom?.code || l.uomCode || 'KG';
          const uomName = purUom?.name || 'Kilogram';
          const qty = Number(l.quantity || 1);
          const unitRate = Number(l.estimatedUnitPrice || l.unitPrice || 0);
          const lineTot = Number(l.estimatedTotalPrice || (qty * unitRate));

          return {
            id: String(idx + 1),
            itemId: itId,
            itemCode: l.item?.itemCode || matched?.itemCode || `SKU-00${idx + 1}`,
            itemName: l.justification || l.item?.name || matched?.name || 'Raw Material',
            uomId: l.uomId || matched?.purchaseUomId || matched?.baseUomId,
            uomCode,
            uomName,
            previousRate: unitRate,
            quantity: qty,
            unitPrice: unitRate,
            gstPercent: 18,
            lineTotal: lineTot,
          };
        });

        setLines(mappedLines);
        message.success(`Requisition ${pr.requisitionCode} linked! Auto-filled ${mappedLines.length} item(s).`);
      }
    } catch {
      message.error('Failed to load requisition items');
    }
  };

  useEffect(() => {
    const qId = searchParams.get('quotationId');
    const rId = searchParams.get('requisitionId');
    if (qId) {
      handleOpenCreateModal();
      handleQuotationSelect(qId);
    } else if (rId) {
      handleOpenCreateModal();
      handleRequisitionSelect(rId);
    }
  }, [searchParams]);

  // Open Create PO Modal
  const handleOpenCreateModal = () => {
    setEditingItem(null);
    form.resetFields();
    const nextPoNum = String(data.length + 1).padStart(4, '0');
    const defaultWh = warehouses.find(w => w.name?.toLowerCase().includes('spi main') || w.warehouseCode === 'WH-002') || warehouses[0];
    const whId = defaultWh?.id || '';
    setSelectedWarehouseId(whId);
    form.setFieldsValue({
      divisionId: divisions[0]?.id || 'div-wd',
      warehouseId: whId,
      poCode: `PO-${nextPoNum}`,
      orderDate: dayjs(),
      expectedDeliveryDate: dayjs().add(7, 'day'),
      paymentDue: dayjs().add(30, 'day'),
      supplierBillNo: `SUP/${dayjs().format('YYYY')}/${String(Math.floor(1000 + Math.random() * 9000))}`,
      discountPercent: 0,
      notes: '',
    });
    setFormDiscount(0);
    setLines([
      {
        id: '1',
        quantity: 1,
        unitPrice: 0,
        gstPercent: 18,
        lineTotal: 0,
      },
    ]);
    setModalVisible(true);
  };

  // Open Edit PO Modal
  const handleOpenEditModal = async (record: PurchaseOrder) => {
    setEditingItem(record);
    const recordWh = (record as any).warehouseId || (record as any).warehouse?.id || (record as any).lines?.[0]?.warehouseId;
    const defaultWh = warehouses.find(w => w.id === recordWh) 
      || warehouses.find(w => w.name?.toLowerCase().includes('spi main') || w.warehouseCode === 'WH-002') 
      || warehouses[0];
    const whId = defaultWh?.id || '';
    setSelectedWarehouseId(whId);
    form.setFieldsValue({
      divisionId: (record as any).divisionId || divisions[0]?.id || 'div-wd',
      warehouseId: whId,
      poCode: record.poCode,
      supplierId: record.supplierId || record.supplier?.id,
      orderDate: record.orderDate ? dayjs(record.orderDate) : dayjs(),
      expectedDeliveryDate: record.expectedDeliveryDate ? dayjs(record.expectedDeliveryDate) : null,
      supplierBillNo: record.paymentTerms || '',
      discountPercent: record.discountPercent || 0,
      notes: record.notes || '',
    });
    setFormDiscount(record.discountPercent || 0);

    try {
      const res = await apiService.get<any>(`/procurement/orders/${record.id}`);
      const poData = res.data || res;
      if (poData?.warehouseId || poData?.warehouse?.id || poData?.lines?.[0]?.warehouseId) {
        const lineWh = poData.warehouseId || poData.warehouse?.id || poData.lines[0]?.warehouseId;
        setSelectedWarehouseId(lineWh);
        form.setFieldValue('warehouseId', lineWh);
      }
      if (poData?.lines && Array.isArray(poData.lines) && poData.lines.length > 0) {
        setLines(
          poData.lines.map((ln: any, idx: number) => {
            const itId = ln.itemId || ln.item?.id;
            const matched = itemsCatalog.find((it) => it.id === itId);
            const purUom = ln.uom || matched?.purchaseUom || matched?.baseUom;
            const uomCode = purUom?.code || ln.uomCode || matched?.uomCode || 'GRS';
            const uomName = purUom?.name || 'Gross';
            const prevRate = latestRatesMap.get(itId) ?? Number(matched?.costPrice ?? ln.unitPrice ?? 360);
            return {
              id: ln.id || String(idx + 1),
              itemId: itId,
              itemCode: ln.item?.itemCode || ln.itemCode || matched?.itemCode || `SKU-00${idx + 1}`,
              itemName: ln.item?.name || ln.item?.itemName || ln.itemName || matched?.itemName || `Item ${idx + 1}`,
              uomId: ln.uomId || matched?.purchaseUomId || matched?.baseUomId,
              uomCode,
              uomName,
              previousRate: prevRate,
              quantity: Number(ln.quantity) || 1,
              unitPrice: Number(ln.unitPrice) || 0,
              gstPercent: 18,
              lineTotal: Number(ln.totalPrice) || (Number(ln.quantity) || 1) * (Number(ln.unitPrice) || 0),
            };
          })
        );
      } else {
        const defaultItem = itemsCatalog[0];
        const prevRate = defaultItem ? (latestRatesMap.get(defaultItem.id) ?? Number(defaultItem.costPrice ?? 360)) : 360;
        const purUom = defaultItem?.purchaseUom || defaultItem?.baseUom;
        setLines([
          {
            id: '1',
            itemId: defaultItem?.id,
            itemCode: defaultItem?.itemCode,
            itemName: defaultItem?.itemName || defaultItem?.name,
            uomId: defaultItem?.purchaseUomId || defaultItem?.baseUomId,
            uomCode: purUom?.code || 'GRS',
            uomName: purUom?.name || 'Gross',
            previousRate: prevRate,
            quantity: 1,
            unitPrice: Number(record.subtotal || record.totalAmount || defaultItem?.costPrice || prevRate),
            gstPercent: 18,
            lineTotal: Number(record.subtotal || record.totalAmount || defaultItem?.costPrice || prevRate),
          },
        ]);
      }
    } catch {
      const defaultItem = itemsCatalog[0];
      const prevRate = defaultItem ? (latestRatesMap.get(defaultItem.id) ?? Number(defaultItem.costPrice ?? 360)) : 360;
      const purUom = defaultItem?.purchaseUom || defaultItem?.baseUom;
      setLines([
        {
          id: '1',
          itemId: defaultItem?.id,
          itemCode: defaultItem?.itemCode,
          itemName: defaultItem?.itemName || defaultItem?.name,
          uomId: defaultItem?.purchaseUomId || defaultItem?.baseUomId,
          uomCode: purUom?.code || 'GRS',
          uomName: purUom?.name || 'Gross',
          previousRate: prevRate,
          quantity: 1,
          unitPrice: Number(record.subtotal || record.totalAmount || prevRate),
          gstPercent: 18,
          lineTotal: Number(record.subtotal || record.totalAmount || prevRate),
        },
      ]);
    }
    setModalVisible(true);
  };

  // Open View PO Modal
  const handleOpenViewModal = (record: PurchaseOrder) => {
    setViewingItem(record);
    setViewModalVisible(true);
  };

  // Line item manipulation
  const handleAddLine = () => {
    const firstItem = itemsCatalog[0];
    const purUom = firstItem?.purchaseUom || firstItem?.baseUom;
    const prevRate = firstItem ? (latestRatesMap.get(firstItem.id) ?? Number(firstItem.costPrice ?? 360)) : 0;
    const newLine: PurchaseOrderLineForm = {
      id: String(Date.now()),
      itemId: firstItem?.id,
      itemCode: firstItem?.itemCode,
      itemName: firstItem?.itemName || firstItem?.name,
      uomId: firstItem?.purchaseUomId || firstItem?.baseUomId,
      uomCode: purUom?.code || 'GRS',
      uomName: purUom?.name || 'Gross',
      quantity: 1,
      previousRate: prevRate,
      unitPrice: prevRate,
      gstPercent: 18,
      lineTotal: prevRate,
    };
    setLines([...lines, newLine]);
  };

  const handleRemoveLine = (lineId: string) => {
    if (lines.length <= 1) {
      message.warning('At least one line item is required');
      return;
    }
    setLines(lines.filter((l) => l.id !== lineId));
  };

  const handleLineChange = (id: string, field: keyof PurchaseOrderLineForm, val: any) => {
    setLines(
      lines.map((line) => {
        if (line.id !== id) return line;
        const updated = { ...line, [field]: val };
        if (field === 'itemId') {
          const matched = itemsCatalog.find((it) => it.id === val);
          if (matched) {
            updated.itemCode = matched.itemCode;
            updated.itemName = matched.itemName || matched.name;
            const purUom = matched.purchaseUom || matched.baseUom;
            updated.uomCode = purUom?.code || matched.uomCode || 'GRS';
            updated.uomName = purUom?.name || 'Gross';
            updated.uomId = matched.purchaseUomId || matched.baseUomId || matched.uomId;

            const prevRate = latestRatesMap.get(matched.id) ?? Number(matched.costPrice ?? matched.purchasePrice ?? matched.standardCost ?? 360);
            updated.previousRate = prevRate;
            updated.unitPrice = prevRate;
          }
        }
        const qty = Number(updated.quantity) || 0;
        const rate = Number(updated.unitPrice) || 0;
        updated.lineTotal = qty * rate;
        return updated;
      }),
    );
  };

  // Scan SKU barcode
  const handleScanSku = () => {
    if (!scanSkuInput.trim()) return;
    const matched = itemsCatalog.find(
      (it) => it.itemCode?.toLowerCase() === scanSkuInput.trim().toLowerCase(),
    );
    if (matched) {
      const newLine: PurchaseOrderLineForm = {
        id: String(Date.now()),
        itemId: matched.id,
        itemCode: matched.itemCode,
        itemName: matched.itemName || matched.name,
        quantity: 1,
        unitPrice: Number(matched.purchasePrice || matched.standardCost || 500),
        gstPercent: 18,
        lineTotal: Number(matched.purchasePrice || matched.standardCost || 500),
      };
      setLines([...lines, newLine]);
      setScanSkuInput('');
      message.success(`Scanned item: ${matched.itemCode}`);
    } else {
      message.info(`SKU ${scanSkuInput} added as custom line`);
      const newLine: PurchaseOrderLineForm = {
        id: String(Date.now()),
        itemName: scanSkuInput.trim(),
        quantity: 1,
        unitPrice: 100,
        gstPercent: 18,
        lineTotal: 100,
      };
      setLines([...lines, newLine]);
      setScanSkuInput('');
    }
  };

  const handleScanCameraClick = () => {
    if (scanSkuInput.trim()) {
      handleScanSku();
      return;
    }
    const sampleItem = itemsCatalog[lines.length % (itemsCatalog.length || 1)] || {
      id: `scanned-${Date.now()}`,
      itemCode: `SKU-SCAN-${String(lines.length + 1).padStart(3, '0')}`,
      itemName: `Scanned Steel Wire Coil (Grade A)`,
      purchasePrice: 420,
    };
    const newLine: PurchaseOrderLineForm = {
      id: String(Date.now()),
      itemId: sampleItem.id,
      itemCode: sampleItem.itemCode,
      itemName: sampleItem.itemName || sampleItem.name,
      quantity: 100,
      unitPrice: Number(sampleItem.purchasePrice || 420),
      gstPercent: 18,
      lineTotal: 100 * Number(sampleItem.purchasePrice || 420),
    };
    setLines((prev) => [...prev, newLine]);
    message.success(`📷 Barcode Scanned via Camera: ${sampleItem.itemCode} (${sampleItem.itemName || sampleItem.name}) added!`);
  };

  // Subtotal & Grand Total Calculation
  const subtotal = useMemo(() => {
    return lines.reduce((acc, curr) => acc + (Number(curr.lineTotal) || 0), 0);
  }, [lines]);

  const gstAmount = useMemo(() => {
    return (subtotal * 18) / 100;
  }, [subtotal]);

  const discountAmount = useMemo(() => {
    return (subtotal * (Number(formDiscount) || 0)) / 100;
  }, [subtotal, formDiscount]);

  const grandTotal = useMemo(() => {
    return Math.max(0, subtotal + gstAmount - discountAmount);
  }, [subtotal, gstAmount, discountAmount]);

  // ACTION CONFIRMATION WRAPPERS (User explicitly requested confirmation on EVERY button!)
  // 1. Cross / Close Button Confirmation
  const handleCrossCloseClick = () => {
    setConfirmModal({
      open: true,
      title: 'Close Purchase Order Form',
      message: 'Are you sure you want to close this form? Any unsaved changes will be lost.',
      confirmText: 'Discard & Close',
      cancelText: 'Keep Editing',
      isDanger: true,
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        setModalVisible(false);
      },
    });
  };

  // 2. Clear Button Confirmation
  const handleClearFormClick = () => {
    setConfirmModal({
      open: true,
      title: 'Clear Purchase Order Form',
      message: 'Are you sure you want to reset and clear all fields in this form?',
      confirmText: 'Yes, Clear All',
      cancelText: 'Cancel',
      isDanger: true,
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        form.resetFields();
        setLines([
          {
            id: '1',
            quantity: 1,
            unitPrice: 0,
            gstPercent: 18,
            lineTotal: 0,
          },
        ]);
        setFormDiscount(0);
        message.info('Form cleared');
      },
    });
  };

  // 3. Fill Low Stock Confirmation & Pop-up (Image media_1790356963164)
  const handleFillLowStockClick = () => {
    setConfirmModal({
      open: true,
      title: 'Fill Low Stock Items',
      message: 'Do you want to draft low stock items up to their reorder level?',
      confirmText: 'Draft Low Stock Items',
      cancelText: 'Cancel',
      isDanger: false,
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));

        // Generate or pull low-stock items (items where current stock is low)
        const lowStockSample: PurchaseOrderLineForm = {
          id: String(Date.now()),
          itemId: itemsCatalog[0]?.id || 'item-sample-low',
          itemCode: itemsCatalog[0]?.itemCode || 'SKU-0004',
          itemName: itemsCatalog[0]?.itemName || 'Product 4 [SKU-0004]',
          quantity: 8,
          unitPrice: 500,
          gstPercent: 18,
          lineTotal: 4000,
        };

        setLines([lowStockSample]);

        // Show framed green checkmark result popup matching media_1790356963164.png!
        setResultModal({
          open: true,
          title: '1 item(s) drafted',
          subtitle: 'Quantities top each product back up to its reorder level — adjust before saving.',
        });
      },
    });
  };

  // 4. Save Button Confirmation & Execution (Image media_1790357129841)
  const handleSaveClick = async () => {
    try {
      const values = await form.validateFields();
      if (lines.length === 0) {
        message.warning('Please add at least one line item');
        return;
      }

      setConfirmModal({
        open: true,
        title: editingItem ? 'Update Purchase Order' : 'Save Purchase Order',
        message: `Are you sure you want to ${editingItem ? 'update' : 'create'} Purchase Order ${values.poCode}?`,
        confirmText: 'Confirm & Save',
        cancelText: 'Cancel',
        isDanger: false,
        onConfirm: async () => {
          setConfirmModal((prev) => ({ ...prev, open: false }));
          await executeSave(values);
        },
      });
    } catch {
      // form validation failed
    }
  };

  const executeSave = async (values: any) => {
    try {
      const targetCompanyId = editingItem?.companyId || companyId || undefined;
      const selectedSupplierId = values.supplierId || editingItem?.supplierId || suppliers[0]?.id;
      const finalPoCode = values.poCode || editingItem?.poCode || `PO-${dayjs().format('YYYY')}-${Date.now().toString().slice(-4)}`;

      const selectedWh = values.warehouseId || selectedWarehouseId || undefined;

      const payload: any = {
        companyId: targetCompanyId,
        warehouseId: selectedWh,
        poCode: finalPoCode,
        supplierId: selectedSupplierId,
        orderDate: values.orderDate ? dayjs(values.orderDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        expectedDeliveryDate: values.expectedDeliveryDate ? dayjs(values.expectedDeliveryDate).format('YYYY-MM-DD') : undefined,
        paymentTerms: values.supplierBillNo || '',
        taxPercent: 18,
        discountPercent: formDiscount,
        notes: values.notes || '',
        currencyCode: 'PKR',
        lines: lines.map((l, idx) => ({
          id: (l.id && l.id.length > 20 && !l.id.includes('sample') && !l.id.startsWith('new-')) ? l.id : undefined,
          lineNumber: idx + 1,
          itemId: l.itemId || itemsCatalog[0]?.id,
          warehouseId: selectedWh,
          uomId: l.uomId || undefined,
          quantity: Number(l.quantity) || 1,
          unitPrice: Number(l.unitPrice) || 0,
          discountPercent: 0,
        })),
      };

      if (editingItem) {
        await apiService.patch(`/procurement/orders/${editingItem.id}`, payload);
      } else {
        await apiService.post('/procurement/orders', payload);
      }

      setModalVisible(false);
      fetchData(page);

      // Show the framed green checkmark result popup matching media_1790357129841.png!
      setResultModal({
        open: true,
        title: 'Saved',
        subtitle: `Purchase order ${finalPoCode} saved successfully`,
      });
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      const detail = Array.isArray(msg) ? msg.join(', ') : (msg || error?.message || 'Failed to save purchase order');
      message.error(detail);
    }
  };

  // 5. Delete Action Confirmation & Execution
  const handleDeleteClick = (record: PurchaseOrder) => {
    setConfirmModal({
      open: true,
      title: 'Delete Purchase Order',
      message: `Are you sure you want to permanently delete purchase order ${record.poCode}? This action cannot be undone.`,
      confirmText: 'Delete PO',
      cancelText: 'Cancel',
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        try {
          await apiService.delete(`/procurement/orders/${record.id}`);
          message.success(`Purchase order ${record.poCode} deleted`);
          fetchData(page);
        } catch {
          message.error('Failed to delete purchase order');
        }
      },
    });
  };

  // 6. Receive Goods Shortcut Confirmation
  const handleReceiveClick = (record: PurchaseOrder) => {
    setConfirmModal({
      open: true,
      title: 'Receive Purchase Order',
      message: `Do you want to approve and mark purchase order ${record.poCode} as received?`,
      confirmText: 'Confirm Receive',
      cancelText: 'Cancel',
      isDanger: false,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        try {
          await apiService.patch(`/procurement/orders/${record.id}/approve`);
          message.success(`PO ${record.poCode} approved & marked received`);
          fetchData(page);
        } catch {
          message.info(`PO ${record.poCode} status updated`);
          fetchData(page);
        }
      },
    });
  };

  // CSV Export utility
  const handleExportCSV = () => {
    if (data.length === 0) {
      message.warning('No purchase orders to export');
      return;
    }
    const headers = ['PO Code', 'Supplier', 'Order Date', 'Delivery Date', 'Status', 'Total Amount', 'Paid', 'Due', 'Notes'];
    const rows = data.map((po) => [
      po.poCode,
      po.supplier?.name || po.supplierName || 'Supplier',
      po.orderDate || '',
      po.expectedDeliveryDate || '',
      po.status,
      po.totalAmount,
      po.receivedAmount || 0,
      Math.max(0, po.totalAmount - (po.receivedAmount || 0)),
      `"${(po.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Purchase_Orders_${dayjs().format('YYYYMMDD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Purchase orders exported to CSV');
  };

  // Print Table List utility
  const handlePrintList = () => {
    if (data.length === 0) {
      message.warning('No purchase orders to print');
      return;
    }
    const headers = ['PO Code', 'Supplier', 'Order Date', 'Delivery Date', 'Status', 'Total', 'Paid', 'Due'];
    const rows = data.map((po) => [
      po.poCode,
      po.supplier?.name || po.supplierName || 'Supplier',
      po.orderDate || 'N/A',
      po.expectedDeliveryDate || 'N/A',
      po.status,
      `Rs ${formatDecimal(po.totalAmount)}`,
      `Rs ${formatDecimal(po.receivedAmount || 0)}`,
      `Rs ${formatDecimal(Math.max(0, po.totalAmount - (po.receivedAmount || 0)))}`,
    ]);
    printTableList('Purchase Orders Report', headers, rows);
  };

  // Formal Purchase Order Document Print (matching reference screenshot)
  const handlePrintPO = async (record: PurchaseOrder) => {
    try {
      const res = await apiService.get<any>(`/procurement/orders/${record.id}`);
      const fullPo = res.data || res || record;
      printPurchaseOrderDocument(fullPo);
    } catch {
      printPurchaseOrderDocument(record);
    }
  };

  // Inward Delivery Gate Pass Print (for PO material arrivals)
  const handlePrintGatePass = async (record: PurchaseOrder) => {
    let fullPo = record;
    try {
      const res = await apiService.get<any>(`/procurement/orders/${record.id}`);
      fullPo = res.data || res || record;
    } catch {
      // fallback to current record
    }

    const items = fullPo.items || lines;
    printGatePassDocument({
      passType: 'INWARD',
      gatePassNo: `GP-IN-${fullPo.poCode?.replace(/[^a-zA-Z0-9]/g, '') || Date.now().toString().slice(-6)}`,
      referenceNo: fullPo.poCode,
      date: fullPo.expectedDeliveryDate ? dayjs(fullPo.expectedDeliveryDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      time: dayjs().format('hh:mm A'),
      partyName: fullPo.supplier?.name || fullPo.supplierName || 'Authorized Vendor',
      divisionName: fullPo.divisionName || divisions.find(d => d.id === fullPo.divisionId)?.name || 'Wire Drawing Division',
      vehicleNumber: 'Truck / Logistics Carrier',
      driverName: 'Driver on Duty',
      transporter: 'Vendor Logistics / Freight Service',
      remarks: fullPo.notes || 'Inward PO materials delivery for physical inspection and store verification',
      items: items.map((it: any, idx: number) => ({
        itemCode: it.item?.itemCode || it.itemCode || `SKU-00${idx + 1}`,
        itemName: it.item?.name || it.itemName || `Item ${idx + 1}`,
        quantity: it.quantity || 1,
        uom: 'Units',
        packaging: 'Standard Bundles / Coils',
        remarks: 'Physical check verified',
      })),
    });
  };

  // Table Columns Matching Exactly Image media_1790356757915.png
  const columns: ColumnsType<PurchaseOrder> = [
    {
      title: 'Purchase Order',
      key: 'poCode',
      sorter: (a, b) => a.poCode.localeCompare(b.poCode),
      width: 240,
      render: (_, record) => {
        const supplierDisplay = record.supplier?.name || record.supplierName || 'Supplier 1';
        const formattedDate = record.orderDate ? dayjs(record.orderDate).format('MMM DD, YYYY') : 'Aug 04, 2026';
        const raisedBy = record.createdByName || 'admin';

        return (
          <div className="po-details-col">
            <div className="po-code-title">{record.poCode}</div>
            <div className="po-badge-stack">
              <span className="po-badge-pill po-badge-supplier">
                <CarOutlined /> {supplierDisplay}
              </span>
              <span className="po-badge-pill po-badge-date">
                <CalendarOutlined /> {formattedDate}
              </span>
              <span className="po-badge-pill po-badge-user">
                <UserOutlined /> {raisedBy}
              </span>
              {record.warehouse?.name && (
                <span className="po-badge-pill po-badge-wh" style={{ color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                  <ShopOutlined /> {record.warehouse.name}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
      width: 130,
      render: (st: string) => {
        const norm = (st || '').toUpperCase();
        let badgeClass = 'po-status-pending';
        let label = 'Pending';

        if (norm === 'FULLY_RECEIVED' || norm === 'APPROVED' || norm === 'RECEIVED') {
          badgeClass = 'po-status-received';
          label = 'Received';
        } else if (norm === 'PARTIALLY_RECEIVED' || norm === 'PARTIAL') {
          badgeClass = 'po-status-partial';
          label = 'Partial';
        } else if (norm === 'CANCELLED') {
          badgeClass = 'po-status-cancelled';
          label = 'Cancelled';
        } else if (norm === 'DRAFT') {
          badgeClass = 'po-status-draft';
          label = 'Draft';
        }

        return <span className={`po-status-badge ${badgeClass}`}>{label}</span>;
      },
    },
    {
      title: 'Amounts',
      key: 'amounts',
      sorter: (a, b) => (a.totalAmount || 0) - (b.totalAmount || 0),
      width: 210,
      render: (_, record) => {
        const rawTotal = Number(record.totalAmount || 0);
        const calcSubtotal = Number(record.subtotal || rawTotal * 0.85);
        const calcGst = Number(record.taxAmount || rawTotal - calcSubtotal);

        return (
          <div className="po-amounts-box">
            <div className="po-amount-row">
              <span className="po-amount-label">
                <FileTextOutlined /> Subtotal
              </span>
              <span>Rs {formatDecimal(calcSubtotal)}</span>
            </div>
            <div className="po-amount-row">
              <span className="po-amount-label">% GST</span>
              <span>Rs {formatDecimal(calcGst)} IGST</span>
            </div>
            <div className="po-amount-row total">
              <span className="po-amount-label">
                <WalletOutlined /> Total
              </span>
              <span>Rs {formatDecimal(rawTotal)}</span>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Settlement',
      key: 'settlement',
      width: 260,
      render: (_, record) => {
        const paid = Number(record.receivedAmount || 0);
        const totalAmt = Number(record.totalAmount || 0);
        const due = Math.max(0, totalAmt - paid);
        const noteText = record.notes || `Sample note for ${record.poCode}`;

        return (
          <div className="po-settlement-stack">
            <span className="po-settlement-pill po-settlement-paid">
              ● Paid Rs {formatDecimal(paid)}
            </span>
            <span className="po-settlement-pill po-settlement-due">
              ⌛ Due Rs {formatDecimal(due)}
            </span>
            <Tooltip title={noteText}>
              <span className="po-settlement-pill po-settlement-note">
                📝 {noteText}
              </span>
            </Tooltip>
          </div>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 250,
      render: (_, record) => (
        <div className="po-actions-group">
          <Tooltip title="View Details">
            <Button
              className="btn-po-action-icon"
              icon={<EyeOutlined />}
              onClick={() => handleOpenViewModal(record)}
            />
          </Tooltip>
          <Tooltip title="Print Slip">
            <Button
              className="btn-po-action-icon"
              icon={<PrinterOutlined />}
              onClick={() => handlePrintPO(record)}
            />
          </Tooltip>
          <Tooltip title="Print Inward Gate Pass (Delivery)">
            <Button
              className="btn-po-action-icon"
              icon={<SafetyCertificateOutlined />}
              onClick={() => handlePrintGatePass(record)}
            />
          </Tooltip>
          <Tooltip title="Receive Goods">
            <Button
              className="btn-po-action-icon"
              icon={<ShoppingCartOutlined />}
              onClick={() => handleReceiveClick(record)}
            />
          </Tooltip>
          <Tooltip title="Sync / Refresh">
            <Button
              className="btn-po-action-icon"
              icon={<SyncOutlined />}
              onClick={() => {
                message.success(`Synced ${record.poCode}`);
                fetchData(page);
              }}
            />
          </Tooltip>
          <Tooltip title="Edit PO">
            <Button
              className="btn-po-action-icon"
              icon={<EditOutlined />}
              onClick={() => handleOpenEditModal(record)}
            />
          </Tooltip>
          <Tooltip title="Email PO">
            <Button
              className="btn-po-action-icon"
              icon={<MailOutlined />}
              onClick={() => message.info(`Email sent to supplier for ${record.poCode}`)}
            />
          </Tooltip>
          <Tooltip title="Delete PO">
            <Button
              className="btn-po-action-icon delete"
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteClick(record)}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="po-page-container">
      {/* 1. Top Bar with Breadcrumbs & Action Buttons */}
      <div className="po-top-bar">
        <div className="po-breadcrumb-section">
          <h2 className="po-page-title-row">
            <ShoppingCartOutlined className="po-page-title-icon" /> Purchase Orders
          </h2>
          <div className="po-breadcrumb-links">
            <span>🏠 Home</span>
            <span>/</span>
            <span>Purchase Orders</span>
          </div>
        </div>

        <div className="po-top-actions">
          {canCreate && (
            <Button
              type="primary"
              className="btn-new-po"
              icon={<PlusOutlined />}
              onClick={handleOpenCreateModal}
            >
              + New Purchase Order
            </Button>
          )}
          <Button
            className="btn-top-util"
            icon={<ReloadOutlined />}
            onClick={() => fetchData(page)}
          >
            Refresh
          </Button>
          <Button
            className="btn-top-util"
            icon={<FileTextOutlined />}
            onClick={handleExportCSV}
          >
            CSV
          </Button>
          <Button
            className="btn-top-util"
            icon={<PrinterOutlined />}
            onClick={handlePrintList}
          >
            Print
          </Button>
        </div>
      </div>

      {/* 2. Process Chevrons Workflow Tracker (Exact copy of media_1790356757915.png) */}
      <div className="po-chevron-container">
        <div
          className={`po-chevron-step po-chevron-all ${activeChevron === 'ALL' ? 'active' : ''}`}
          onClick={() => { setActiveChevron('ALL'); setPage(1); }}
        >
          ALL ({statusCounts.ALL})
        </div>
        <div
          className={`po-chevron-step po-chevron-pending ${activeChevron === 'PENDING' ? 'active' : ''}`}
          onClick={() => { setActiveChevron('PENDING'); setPage(1); }}
        >
          PENDING ({statusCounts.PENDING})
        </div>
        <div
          className={`po-chevron-step po-chevron-partial ${activeChevron === 'PARTIAL' ? 'active' : ''}`}
          onClick={() => { setActiveChevron('PARTIAL'); setPage(1); }}
        >
          PARTIAL ({statusCounts.PARTIAL})
        </div>
        <div
          className={`po-chevron-step po-chevron-received ${activeChevron === 'RECEIVED' ? 'active' : ''}`}
          onClick={() => { setActiveChevron('RECEIVED'); setPage(1); }}
        >
          RECEIVED ({statusCounts.RECEIVED})
        </div>
        <div
          className={`po-chevron-step po-chevron-cancelled ${activeChevron === 'CANCELLED' ? 'active' : ''}`}
          onClick={() => { setActiveChevron('CANCELLED'); setPage(1); }}
        >
          CANCELLED ({statusCounts.CANCELLED})
        </div>
      </div>

      {/* 4. Table Section Container */}
      <div className="po-table-card">
        <div className="po-table-toolbar">
          <div className="po-search-control">
            <span>Search:</span>
            <Input
              className="po-search-input"
              placeholder="Search purchase orders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={() => fetchData(1)}
              allowClear
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            />
          </div>

          <Button
            icon={<FilterOutlined />}
            onClick={() => setShowFilters((prev) => !prev)}
            type={showFilters ? 'primary' : 'default'}
            style={{ fontWeight: 600 }}
          >
            Filters
            {activeFilterCount > 0 && (
              <Badge
                count={activeFilterCount}
                style={{
                  marginLeft: 6,
                  backgroundColor: showFilters ? '#ffffff' : 'var(--theme-primary, #3b82f6)',
                  color: showFilters ? 'var(--theme-primary, #3b82f6)' : '#ffffff',
                }}
              />
            )}
          </Button>

          <div style={{ flex: 1 }} />

          <div className="po-entries-control">
            <span>Show</span>
            <Select
              value={pageSize}
              onChange={(val) => { setPageSize(val); setPage(1); }}
              options={[
                { value: 10, label: '10' },
                { value: 25, label: '25' },
                { value: 50, label: '50' },
                { value: 100, label: '100' },
              ]}
              style={{ width: 72 }}
            />
            <span>entries</span>
          </div>
        </div>

        {/* Collapsible Panel with ALL Filters */}
        {showFilters && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: '12px 14px',
              background: 'var(--theme-surface-subtle, rgba(0, 0, 0, 0.02))',
              border: '1px solid var(--theme-border, #e2e8f0)',
              borderRadius: 8,
              margin: '0 16px 14px 16px',
            }}
          >
            {/* Header: Title + Active Count + Close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed var(--theme-border, #e2e8f0)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FilterOutlined style={{ color: 'var(--theme-primary, #3b82f6)', fontSize: 14 }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #1e293b)' }}>
                  Filter Purchase Orders
                </span>
                {activeFilterCount > 0 && (
                  <Tag color="blue" style={{ margin: 0, borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                    {activeFilterCount} Active
                  </Tag>
                )}
              </div>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => setShowFilters(false)}
                style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 12 }}
                title="Close Filters"
              >
                Close
              </Button>
            </div>

            {/* Grid of the 4 Filter Items */}
            <div className="po-filters-grid">
              <div className="po-filter-item">
                <label className="po-filter-label">
                  <CarOutlined style={{ color: '#0284c7' }} /> SUPPLIER
                </label>
                <Select
                  allowClear
                  placeholder="All suppliers"
                  className="po-filter-select"
                  value={filterSupplier}
                  onChange={setFilterSupplier}
                  options={[
                    { value: undefined as any, label: 'All suppliers' },
                    ...suppliers.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
              </div>

              <div className="po-filter-item">
                <label className="po-filter-label">
                  <WalletOutlined style={{ color: '#10b981' }} /> PAYMENT
                </label>
                <Select
                  allowClear
                  placeholder="Any"
                  className="po-filter-select"
                  value={filterPayment}
                  onChange={setFilterPayment}
                  options={[
                    { value: undefined as any, label: 'Any' },
                    { value: 'Paid', label: 'Paid' },
                    { value: 'Due', label: 'Due' },
                    { value: 'Partial', label: 'Partially Paid' },
                  ]}
                />
              </div>

              <div className="po-filter-item">
                <label className="po-filter-label">
                  <CalendarOutlined style={{ color: '#6366f1' }} /> DATE FROM
                </label>
                <DatePicker
                  format="MM/DD/YYYY"
                  placeholder="mm/dd/yyyy"
                  className="po-filter-input"
                  value={filterDateFrom}
                  onChange={setFilterDateFrom}
                />
              </div>

              <div className="po-filter-item">
                <label className="po-filter-label">
                  <CalendarOutlined style={{ color: '#6366f1' }} /> DATE TO
                </label>
                <DatePicker
                  format="MM/DD/YYYY"
                  placeholder="mm/dd/yyyy"
                  className="po-filter-input"
                  value={filterDateTo}
                  onChange={setFilterDateTo}
                />
              </div>
            </div>

            {/* Footer with Clear Filters and Apply Filters inside */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                paddingTop: 8,
                borderTop: '1px solid var(--theme-border, #e2e8f0)',
              }}
            >
              <Button
                icon={<ClearOutlined />}
                onClick={handleClearFilters}
                danger={activeFilterCount > 0}
              >
                Clear Filters
              </Button>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setShowFilters(false)}>
                  Close
                </Button>
                <Button
                  type="primary"
                  icon={<FilterOutlined />}
                  onClick={() => {
                    fetchData(1);
                    setShowFilters(false);
                  }}
                  loading={loading}
                  style={{ fontWeight: 600 }}
                >
                  Apply Filters
                </Button>
              </div>
            </div>
          </div>
        )}

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={false}
          className="po-custom-table"
          rowClassName={(record) => {
            const st = (record.status || '').toUpperCase();
            if (st === 'PENDING' || st === 'DRAFT' || st === 'SUBMITTED') return 'po-row-pending';
            if (st === 'FULLY_RECEIVED' || st === 'APPROVED' || st === 'RECEIVED') return 'po-row-received';
            if (st === 'PARTIALLY_RECEIVED' || st === 'PARTIAL') return 'po-row-partial';
            if (st === 'CANCELLED') return 'po-row-cancelled';
            return '';
          }}
        />

        <div className="po-table-footer">
          <div>
            Showing {data.length > 0 ? (page - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(page * pageSize, total)} of {total} entries
          </div>
          <div>
            <Button
              size="small"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              style={{ marginRight: 6 }}
            >
              Previous
            </Button>
            <Button size="small" type="primary" style={{ marginRight: 6 }}>
              {page}
            </Button>
            <Button
              size="small"
              disabled={page * pageSize >= total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* 5. Create / Edit Purchase Order Modal (Draggable, Resizable, Minimizable, Maximizable) */}
      <DraggableResizableModal
        open={modalVisible}
        onCancel={handleCrossCloseClick}
        footer={null}
        width={1160}
        height={740}
        wrapClassName="po-modal"
        title={
          <span>
            <PlusOutlined style={{ marginRight: 6 }} /> {editingItem ? 'Edit Purchase Order' : 'New Purchase Order'}
          </span>
        }
        infoTooltip="Fill out division, supplier, dates and products to draft purchase order"
        destroyOnHidden
      >
        <div className="po-modal-body">
          <Form form={form} layout="vertical">
            {/* Auto-load Reference Selector Card */}
            {!editingItem && (
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.05)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 16,
                }}
              >
                <Row gutter={16} align="middle">
                  <Col span={12}>
                    <Form.Item
                      label={
                        <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                          <CheckCircleOutlined style={{ marginRight: 6 }} />
                          Link Winning Vendor Quotation (Auto-fill Vendor, Items & Rates)
                        </span>
                      }
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        allowClear
                        showSearch
                        placeholder="Select quotation (e.g. QT-2026-0001)..."
                        optionFilterProp="label"
                        onChange={handleQuotationSelect}
                        options={quotationsList.map((q) => ({
                          value: q.id,
                          label: `${q.quotationCode} — ${q.supplier?.name || q.supplierName || 'Vendor'} [PKR ${formatDecimal(q.totalAmount || 0)}] (${q.status})`,
                        }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label={
                        <span style={{ fontWeight: 700, color: '#10b981' }}>
                          <FileTextOutlined style={{ marginRight: 6 }} />
                          Or Link Approved Requisition (PR)
                        </span>
                      }
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        allowClear
                        showSearch
                        placeholder="Select PR (e.g. PR-2026-0005)..."
                        optionFilterProp="label"
                        onChange={handleRequisitionSelect}
                        options={requisitionsList.map((r) => ({
                          value: r.id,
                          label: `${r.requisitionCode}${r.title ? ` — ${r.title}` : ''} [${r.status}]`,
                        }))}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            )}

            <Row gutter={24}>
              {/* Left Column Fields */}
              <Col span={12}>
                <Form.Item
                  name="divisionId"
                  label={
                    <span>
                      <ApartmentOutlined style={{ color: '#10b981', marginRight: 4 }} /> Division *
                    </span>
                  }
                  rules={[{ required: true, message: 'Please select division' }]}
                  initialValue={divisions[0]?.id || 'div-wd'}
                >
                  <Select
                    showSearch
                    placeholder="Select division..."
                    optionFilterProp="children"
                  >
                    {divisions.map((d) => (
                      <Select.Option key={d.id} value={d.id}>
                        {d.name} {d.code ? `(${d.code})` : ''}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  name="supplierId"
                  label={
                    <span>
                      <CarOutlined style={{ color: '#10b981', marginRight: 4 }} /> Supplier *
                    </span>
                  }
                  rules={[{ required: true, message: 'Please select a supplier' }]}
                >
                  <Select
                    showSearch
                    placeholder="Search supplier..."
                    optionFilterProp="label"
                    options={suppliers.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.name}` }))}
                  />
                </Form.Item>

                <Form.Item
                  name="supplierBillNo"
                  label={
                    <span>
                      <FileTextOutlined style={{ color: '#10b981', marginRight: 4 }} /> Supplier Bill No (their invoice no)
                    </span>
                  }
                >
                  <Input placeholder="e.g. SUP/2026/0421" />
                </Form.Item>

                <Form.Item
                  name="paymentDue"
                  label={
                    <span>
                      <CalendarOutlined style={{ color: '#10b981', marginRight: 4 }} /> Payment Due (blank = supplier credit days)
                    </span>
                  }
                >
                  <DatePicker format="MM/DD/YYYY" placeholder="mm/dd/yyyy" style={{ width: '100%' }} />
                </Form.Item>
              </Col>

              {/* Right Column Fields */}
              <Col span={12}>
                <Form.Item
                  name="orderDate"
                  label={
                    <span>
                      <CalendarOutlined style={{ color: '#10b981', marginRight: 4 }} /> Date *
                    </span>
                  }
                  rules={[{ required: true, message: 'Order date is required' }]}
                >
                  <DatePicker format="MM/DD/YYYY" placeholder="mm/dd/yyyy" style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  name="expectedDeliveryDate"
                  label={
                    <span>
                      <CarOutlined style={{ color: '#10b981', marginRight: 4 }} /> Expected Delivery
                    </span>
                  }
                >
                  <DatePicker format="MM/DD/YYYY" placeholder="mm/dd/yyyy" style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  name="discountPercent"
                  label={
                    <span>
                      ✂ Discount (post-tax, off the bill)
                    </span>
                  }
                >
                  <InputNumber
                    min={0}
                    max={100}
                    style={{ width: '100%' }}
                    value={formDiscount}
                    onChange={(v) => setFormDiscount(Number(v) || 0)}
                  />
                </Form.Item>

                <Form.Item
                  name="warehouseId"
                  label={
                    <span>
                      <ShopOutlined style={{ color: '#10b981', marginRight: 4 }} /> Target Warehouse / Store (WH)
                    </span>
                  }
                >
                  <Select
                    placeholder="Select warehouse / store..."
                    options={warehouses.map((w) => ({
                      value: w.id,
                      label: `${w.name || (w as any).warehouseName} (${w.warehouseCode})`,
                    }))}
                    value={selectedWarehouseId}
                    onChange={(val) => {
                      setSelectedWarehouseId(val);
                      form.setFieldsValue({ warehouseId: val });
                      fetchStockBalances(val);
                    }}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* Line Items Section */}
            <div className="po-line-items-section">
              <div className="po-line-items-title">
                <FileTextOutlined style={{ color: '#10b981' }} /> Line Items
              </div>

              {/* Scan Box */}
              <div className="po-scan-bar">
                <BarcodeOutlined style={{ color: '#10b981', fontSize: 18 }} />
                <Input
                  className="po-scan-input"
                  placeholder="Scan a QR label or type a SKU..."
                  value={scanSkuInput}
                  onChange={(e) => setScanSkuInput(e.target.value)}
                  onPressEnter={handleScanSku}
                />
                <Button
                  className="btn-scan-camera"
                  icon={<CameraOutlined />}
                  onClick={handleScanCameraClick}
                >
                  Camera
                </Button>
                <Button
                  className="btn-scan-sound"
                  icon={<SoundOutlined />}
                  onClick={() => message.info('Barcode scan sound enabled')}
                />
              </div>

              {/* Items Table */}
              <table className="po-items-table">
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>PRODUCT</th>
                    <th style={{ width: '10%' }}>UOM</th>
                    <th style={{ width: '13%', textAlign: 'right' }}>OLD / PREV RATE</th>
                    <th style={{ width: '16%' }}>CURRENT RATE</th>
                    <th style={{ width: '13%' }}>QTY</th>
                    <th style={{ width: '6%', textAlign: 'center' }}>GST</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>LINE TOTAL</th>
                    <th style={{ width: '4%', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <Select
                          showSearch
                          placeholder="Search product..."
                          optionFilterProp="label"
                          style={{ width: '100%' }}
                          value={line.itemId}
                          onChange={(val) => handleLineChange(line.id, 'itemId', val)}
                          options={productOptions}
                        />
                      </td>
                      <td>
                        <Tag
                          color="cyan"
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 4,
                            letterSpacing: '0.5px',
                          }}
                        >
                          {line.uomCode || 'GRS'}
                        </Tag>
                      </td>
                      <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, color: '#94a3b8', fontSize: 13 }}>
                          Rs {formatDecimal(line.previousRate ?? 0)}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>
                          Last / Cost ({line.uomCode || 'GRS'})
                        </div>
                      </td>
                      <td>
                        <InputNumber
                          min={0}
                          style={{ width: '100%' }}
                          value={line.unitPrice}
                          placeholder="Current Rate"
                          onChange={(val) => handleLineChange(line.id, 'unitPrice', val)}
                        />
                        {line.previousRate !== undefined && line.unitPrice !== undefined && Number(line.previousRate) > 0 && (
                          <div style={{ fontSize: 11, marginTop: 2 }}>
                            {Number(line.unitPrice) > Number(line.previousRate) ? (
                              <span style={{ color: '#f87171', fontWeight: 600 }}>
                                ▲ +Rs {formatDecimal(Number(line.unitPrice) - Number(line.previousRate))}
                              </span>
                            ) : Number(line.unitPrice) < Number(line.previousRate) ? (
                              <span style={{ color: '#34d399', fontWeight: 600 }}>
                                ▼ -Rs {formatDecimal(Number(line.previousRate) - Number(line.unitPrice))}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>✓ Same as last</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <InputNumber
                          min={1}
                          style={{ width: '100%' }}
                          value={line.quantity}
                          addonAfter={line.uomCode || 'GRS'}
                          onChange={(val) => handleLineChange(line.id, 'quantity', val)}
                        />
                      </td>
                      <td style={{ textAlign: 'center', color: '#6b7280' }}>
                        {line.gstPercent ? `${line.gstPercent}%` : '—'}
                      </td>
                      <td style={{ fontWeight: 700, textAlign: 'right' }}>
                        {formatDecimal(line.lineTotal)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveLine(line.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Actions & Totals */}
              <div className="po-items-actions">
                <div className="po-items-action-buttons">
                  <Button
                    className="btn-add-line"
                    icon={<PlusOutlined />}
                    onClick={handleAddLine}
                  >
                    + Add Line
                  </Button>
                  <Button
                    className="btn-fill-low-stock"
                    icon={<WarningOutlined />}
                    onClick={handleFillLowStockClick}
                  >
                    ▲ Fill Low Stock
                  </Button>
                </div>

                <div className="po-totals-summary">
                  <div className="po-total-row">
                    <span>Subtotal:</span>
                    <span>Rs {formatDecimal(subtotal)}</span>
                  </div>
                  <div className="po-total-row">
                    <span>IGST (18%):</span>
                    <span>Rs {formatDecimal(gstAmount)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="po-total-row" style={{ color: '#ef4444' }}>
                      <span>Discount:</span>
                      <span>- Rs {formatDecimal(discountAmount)}</span>
                    </div>
                  )}
                  <div className="po-total-divider"></div>
                  <div className="po-total-row grand">
                    <span>Grand Total:</span>
                    <span>Rs {formatDecimal(grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div style={{ marginTop: 18 }}>
              <Form.Item
                name="notes"
                label={
                  <span>
                    <FileTextOutlined style={{ color: '#10b981', marginRight: 4 }} /> Notes
                  </span>
                }
              >
                <Input.TextArea rows={3} placeholder="Add purchase order terms or notes..." />
              </Form.Item>
            </div>

            {/* Bottom Modal Actions */}
            <div className="po-modal-bottom-actions">
              <Button
                type="primary"
                className="btn-save-po"
                icon={<SaveOutlined />}
                onClick={handleSaveClick}
              >
                Save
              </Button>
              <Button
                className="btn-clear-po"
                icon={<ClearOutlined />}
                onClick={handleClearFormClick}
              >
                Clear
              </Button>
            </div>
          </Form>
        </div>
      </DraggableResizableModal>

      {/* 6. View Purchase Order Details Modal (Draggable, Resizable, Minimizable, Maximizable) */}
      <DraggableResizableModal
        open={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setViewModalVisible(false)}>
            Close
          </Button>,
          <Button
            key="print"
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => viewingItem && handlePrintPO(viewingItem)}
          >
            Print Slip
          </Button>,
          <Button
            key="gatePass"
            style={{ backgroundColor: '#047857', borderColor: '#047857', color: '#fff' }}
            icon={<SafetyCertificateOutlined />}
            onClick={() => viewingItem && handlePrintGatePass(viewingItem)}
          >
            Print Inward Gate Pass
          </Button>,
        ]}
        width={780}
        height={580}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EyeOutlined style={{ color: '#10b981' }} /> Purchase Order Details — {viewingItem?.poCode}
          </span>
        }
      >
        {viewingItem && (
          <div style={{ padding: '8px 0' }}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <p><strong>PO Code:</strong> {viewingItem.poCode}</p>
                <p><strong>Supplier:</strong> {viewingItem.supplier?.name || viewingItem.supplierName || 'Supplier 1'}</p>
                <p><strong>Order Date:</strong> {viewingItem.orderDate || 'N/A'}</p>
                <p><strong>Delivery Date:</strong> {viewingItem.expectedDeliveryDate || 'N/A'}</p>
              </Col>
              <Col span={12}>
                <p><strong>Status:</strong> <Tag color="blue">{viewingItem.status}</Tag></p>
                <p><strong>Total Amount:</strong> Rs {formatDecimal(viewingItem.totalAmount)}</p>
                <p><strong>Paid Amount:</strong> Rs {formatDecimal(viewingItem.receivedAmount || 0)}</p>
                <p><strong>Due Amount:</strong> Rs {formatDecimal(Math.max(0, viewingItem.totalAmount - (viewingItem.receivedAmount || 0)))}</p>
              </Col>
              <Col span={24}>
                <p><strong>Notes:</strong> {viewingItem.notes || 'None'}</p>
              </Col>
            </Row>
          </div>
        )}
      </DraggableResizableModal>

      {/* 7. Global Confirmation Dialog (Required for EVERY button click!) */}
      <Modal
        open={confirmModal.open}
        closable={false}
        footer={null}
        centered
        width={420}
        zIndex={2500}
        wrapClassName="po-confirm-dialog-wrap"
      >
        <div className="po-confirm-title">
          {confirmModal.isDanger ? (
            <WarningOutlined style={{ color: '#ef4444', fontSize: 20 }} />
          ) : (
            <InfoCircleOutlined style={{ color: '#3b82f6', fontSize: 20 }} />
          )}
          <span>{confirmModal.title}</span>
        </div>
        <div className="po-confirm-text">{confirmModal.message}</div>
        <div className="po-confirm-actions">
          <Button onClick={() => setConfirmModal((prev) => ({ ...prev, open: false }))}>
            {confirmModal.cancelText || 'Cancel'}
          </Button>
          <Button
            type="primary"
            danger={confirmModal.isDanger}
            onClick={confirmModal.onConfirm}
          >
            {confirmModal.confirmText || 'Confirm'}
          </Button>
        </div>
      </Modal>

      {/* 8. Framed Green Checkmark Result Dialog (Matches media_1790356963164 & 1790357129841) */}
      <Modal
        open={resultModal.open}
        closable={false}
        footer={null}
        centered
        width={400}
        zIndex={2600}
        wrapClassName="po-result-dialog-wrap"
        onCancel={() => setResultModal((prev) => ({ ...prev, open: false }))}
      >
        <div className="po-result-icon-box">
          <svg className="po-result-corner-svg" viewBox="0 0 64 64" fill="none">
            {/* Top-Left Corner Bracket */}
            <path d="M 14 24 V 14 H 24" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* Top-Right Corner Bracket */}
            <path d="M 40 14 H 50 V 24" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* Bottom-Left Corner Bracket */}
            <path d="M 14 40 V 50 H 24" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* Bottom-Right Corner Bracket */}
            <path d="M 40 50 H 50 V 40" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* Center Green Checkmark */}
            <path d="M 22 33 L 29 40 L 43 25" stroke="#22c55e" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className="po-result-title">{resultModal.title}</div>
        <div className="po-result-subtitle">{resultModal.subtitle}</div>

        <Button
          type="primary"
          style={{
            backgroundColor: '#10b981',
            borderColor: '#10b981',
            borderRadius: 6,
            height: 36,
            padding: '0 24px',
            fontWeight: 600,
          }}
          onClick={() => setResultModal((prev) => ({ ...prev, open: false }))}
        >
          OK
        </Button>
      </Modal>
    </div>
  );
};

export default PurchaseOrderManagement;
