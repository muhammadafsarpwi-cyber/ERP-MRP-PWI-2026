import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Select, InputNumber, Space, Typography, Tag, Input, Tooltip, message } from 'antd';
import {
  PlusOutlined, DeleteOutlined, BarcodeOutlined, CameraOutlined,
  SoundOutlined, AudioMutedOutlined, CheckCircleOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import BarcodeScanner from './BarcodeScanner';

export interface ERPLine {
  id: string;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  uomId?: string;
  uomCode?: string;
  packageQuantity?: number;
  packagingType?: string;
  packagingSize?: number;
  packagingUnit?: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  taxPercent: number;
  warehouseId?: string;
  lineTotal: number;
  // SOC tracking & order validation fields
  salesOrderId?: string;
  salesOrderNumber?: string;
  customerPo?: string;
  orderQuantity?: number;
  orderBalance?: number;
}

export interface ERPLineItemsProps {
  companyId: string;
  value: ERPLine[];
  onChange: (lines: ERPLine[]) => void;
  showWarehouse?: boolean;
  showDiscount?: boolean;
  showTax?: boolean;
  showItemTypeFilter?: boolean;
  defaultItemType?: string;
  warehouses?: Array<{ id: string; warehouseCode: string; name: string; warehouseType?: string }>;
  disabled?: boolean;
  label?: string;
  warehouseId?: string;
  warehouseType?: string;
  divisionId?: string;
  itemType?: string;
  isPurchasable?: boolean;
  currency?: string;
  showAvailability?: boolean;
  availableSalesOrders?: Array<{ id: string; orderNumber: string; customerPo?: string }>;
}

export interface ItemAvailabilityInfo {
  physicalStock: number;
  committedStock: number;
  availableStock: number;
  safetyStock: number;
  projectedBalance: number;
  shortageQty: number;
  orderShortageQty?: number;
  productionRequirementQty?: number;
  uomCode: string;
  status: string;
  statusLabel: string;
}

interface ItemOption {
  id: string;
  itemCode: string;
  name: string;
  itemType?: string;
  uomId?: string;
  baseUomId?: string;
  uomCode?: string;
  baseUom?: { code: string; symbol?: string };
  costPrice?: number;
  sellingPrice?: number;
  packagingType?: string | null;
  packagingSize?: number | null;
  packagingUnit?: string | null;
  barcode?: string | null;
  sku?: string | null;
}

let lineCounter = 1;
const nextId = () => `line_${Date.now()}_${lineCounter++}`;

/**
 * Self-contained crisp audio beep using Web Audio API synthesis
 * Works offline, requires zero audio file downloads.
 */
function playBeepSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // High C crisp confirmation tone
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // Non-blocking
  }
}

const ERPLineItems: React.FC<ERPLineItemsProps> = ({
  companyId,
  value,
  onChange,
  showWarehouse = false,
  showDiscount = true,
  showTax = true,
  showItemTypeFilter = true,
  defaultItemType,
  warehouses = [],
  disabled = false,
  label = 'Items',
  warehouseId,
  warehouseType,
  divisionId,
  itemType,
  isPurchasable,
  currency = 'PKR',
  showAvailability = true,
}) => {
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedItemType, setSelectedItemType] = useState<string>(
    defaultItemType || itemType || (warehouseType === 'RAW_MATERIAL' ? 'RAW_MATERIAL' : 'FINISHED_GOOD')
  );
  const [lineAvailability, setLineAvailability] = useState<Record<string, ItemAvailabilityInfo>>({});

  // Barcode scanner & camera states
  const [scanInput, setScanInput] = useState('');
  const [scannerModalOpen, setScannerModalOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const scanInputRef = useRef<any>(null);

  // Real-time authoritative live inventory check for line items
  useEffect(() => {
    if (!showAvailability) return;
    const linesWithItem = value.filter((l) => Boolean(l.itemId));
    if (linesWithItem.length === 0) {
      setLineAvailability({});
      return;
    }

    let active = true;
    const fetchAvailabilities = async () => {
      const updates: Record<string, ItemAvailabilityInfo> = {};
      await Promise.all(
        linesWithItem.map(async (line) => {
          try {
            const res = await apiService.get<any>(
              `/sales/finished-goods/item-availability/${line.itemId}`,
              { orderQuantity: line.quantity || 1 }
            );
            if (res?.data && active) {
              updates[line.id] = {
                physicalStock: res.data.physicalStock,
                committedStock: res.data.committedStock,
                availableStock: res.data.availableStock,
                safetyStock: res.data.safetyStock,
                projectedBalance: res.data.projectedBalance,
                shortageQty: res.data.shortageQty,
                orderShortageQty: res.data.orderShortageQty,
                productionRequirementQty: res.data.productionRequirementQty,
                uomCode: res.data.uomCode,
                status: res.data.status,
                statusLabel: res.data.statusLabel,
              };
            }
          } catch {
            // Non-blocking for non-FG items
          }
        })
      );
      if (active) {
        setLineAvailability((prev) => ({ ...prev, ...updates }));
      }
    };

    fetchAvailabilities();
    return () => {
      active = false;
    };
  }, [value, showAvailability]);

  const loadItems = useCallback(async (search?: string) => {
    if (!companyId) return;
    try {
      const params: Record<string, any> = {
        companyId,
        search: search || undefined,
        limit: 200,
      };

      const activeType = selectedItemType && selectedItemType !== 'ALL' ? selectedItemType : (itemType || (warehouseType === 'RAW_MATERIAL' ? 'RAW_MATERIAL' : undefined));
      if (activeType && activeType !== 'ALL') {
        params.itemType = activeType;
      }

      if (divisionId) {
        params.divisionId = divisionId;
      }

      if (isPurchasable) {
        params.isPurchasable = true;
      }

      const res = await apiService.get<{ data: ItemOption[] }>('/master-data/items', params);
      const rawItems = res.data || [];
      setItemOptions(rawItems);
    } catch {
      // keep existing options; item search is non-blocking
    }
  }, [companyId, selectedItemType, itemType, warehouseType, divisionId, isPurchasable]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Local filter fallback to guarantee strict separation between FG, WIP, and RM
  const filteredItems = itemOptions.filter((item) => {
    if (!selectedItemType || selectedItemType === 'ALL') return true;
    const typeUpper = (item.itemType || '').toUpperCase();
    if (selectedItemType === 'FINISHED_GOOD') {
      return typeUpper === 'FINISHED_GOOD' || typeUpper === 'FINISHED_GOODS' || typeUpper.includes('FINISH');
    }
    if (selectedItemType === 'SEMI_FINISHED') {
      return typeUpper === 'SEMI_FINISHED' || typeUpper.includes('WIP') || typeUpper.includes('SEMI');
    }
    if (selectedItemType === 'RAW_MATERIAL') {
      return typeUpper === 'RAW_MATERIAL' || typeUpper.includes('RAW');
    }
    return true;
  });

  const addLine = () => {
    onChange([
      ...value,
      { id: nextId(), quantity: 1, rate: 0, discountPercent: 0, taxPercent: 18, lineTotal: 0 },
    ]);
  };

  const updateLine = (id: string, patch: Partial<ERPLine>) => {
    onChange(value.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      const qty = Number(next.quantity || 0);
      const rate = Number(next.rate || 0);
      const discount = Number(next.discountPercent || 0);
      const tax = Number(next.taxPercent !== undefined ? next.taxPercent : 18);
      const base = qty * rate;
      const afterDiscount = base * (1 - discount / 100);
      const afterTax = afterDiscount * (1 + tax / 100);
      next.lineTotal = Math.round(afterTax * 100) / 100;
      return next;
    }));
  };

  const selectItem = (id: string, itemId: string) => {
    const item = itemOptions.find((o) => o.id === itemId);
    if (!item) return;
    const uomStr = item.baseUom?.code || item.uomCode || (typeof (item as any).uom === 'string' ? (item as any).uom : null) || 'M';
    const pSize = item.packagingSize ? Number(item.packagingSize) : undefined;
    const pUnit = item.packagingUnit || (item.packagingType ? item.packagingType.toLowerCase() : undefined);

    let initialQty = 1;
    let initialPkgQty: number | undefined = undefined;
    if (pSize && pSize > 0) {
      initialPkgQty = 1;
      initialQty = pSize;
    }

    updateLine(id, {
      itemId: item.id,
      itemCode: item.itemCode,
      itemName: item.name,
      uomId: item.baseUomId || item.uomId,
      uomCode: uomStr,
      packagingType: item.packagingType || undefined,
      packagingSize: pSize,
      packagingUnit: pUnit,
      packageQuantity: initialPkgQty,
      quantity: initialQty,
      rate: Number(item.sellingPrice ?? item.costPrice ?? 0),
      taxPercent: 18,
    });
  };

  const removeLine = (id: string) => onChange(value.filter((l) => l.id !== id));

  // Barcode / SKU / QR scan or text submission
  const handleBarcodeSubmit = async (rawCode?: string) => {
    const code = (rawCode || scanInput).trim();
    if (!code) return;

    // 1. Check local loaded items first
    let matched = itemOptions.find(
      (o) =>
        (o.barcode && o.barcode.toLowerCase() === code.toLowerCase()) ||
        (o.sku && o.sku.toLowerCase() === code.toLowerCase()) ||
        (o.itemCode && o.itemCode.toLowerCase() === code.toLowerCase()) ||
        o.id === code
    );

    // 2. If not found in memory, query API endpoints
    if (!matched && companyId) {
      try {
        const res = await apiService.get<any>(`/master-data/items/by-barcode/${companyId}/${encodeURIComponent(code)}`);
        if (res?.data) matched = res.data;
      } catch {
        try {
          const resSku = await apiService.get<any>(`/master-data/items/by-sku/${companyId}/${encodeURIComponent(code)}`);
          if (resSku?.data) matched = resSku.data;
        } catch {
          try {
            const resCode = await apiService.get<any>(`/master-data/items/by-code/${companyId}/${encodeURIComponent(code)}`);
            if (resCode?.data) matched = resCode.data;
          } catch {
            // search fallback
            try {
              const resSearch = await apiService.get<any>('/master-data/items', { companyId, search: code, limit: 1 });
              if (resSearch?.data?.[0]) matched = resSearch.data[0];
            } catch {
              // Not found
            }
          }
        }
      }
    }

    if (matched) {
      if (soundEnabled) {
        playBeepSound();
      }

      const pSize = matched.packagingSize ? Number(matched.packagingSize) : 0;
      const pUnit = matched.packagingUnit || (matched.packagingType ? matched.packagingType.toLowerCase() : 'pkg');
      const existingIndex = value.findIndex((l) => l.itemId === matched!.id);

      if (existingIndex >= 0) {
        // Increment quantity in existing row
        const existing = value[existingIndex];
        const addQty = pSize > 0 ? pSize : 1;
        const newQty = Number(existing.quantity || 0) + addQty;
        const newPkgQty = pSize > 0 ? (Number(existing.packageQuantity || 0) + 1) : undefined;

        updateLine(existing.id, {
          quantity: newQty,
          packageQuantity: newPkgQty,
        });
        message.success(`Incremented quantity for "${matched.name}" (+${pSize > 0 ? `1 ${pUnit} = ${pSize}` : '1'})`);
      } else {
        // Add new row with matched item
        const uomStr = matched.baseUom?.code || matched.uomCode || 'M';
        const initialQty = pSize > 0 ? pSize : 1;
        const initialPkgQty = pSize > 0 ? 1 : undefined;
        const rate = Number(matched.sellingPrice ?? matched.costPrice ?? 0);
        const lineTotal = Math.round(initialQty * rate * 1.18 * 100) / 100;

        const newLine: ERPLine = {
          id: nextId(),
          itemId: matched.id,
          itemCode: matched.itemCode,
          itemName: matched.name,
          uomId: matched.baseUomId || matched.uomId,
          uomCode: uomStr,
          packagingType: matched.packagingType || undefined,
          packagingSize: pSize || undefined,
          packagingUnit: pUnit || undefined,
          packageQuantity: initialPkgQty,
          quantity: initialQty,
          rate,
          discountPercent: 0,
          taxPercent: 18,
          lineTotal,
          warehouseId,
        };

        onChange([...value, newLine]);
        message.success(`Scanned and added "${matched.name}" (${matched.itemCode})`);
      }
      setScanInput('');
    } else {
      message.warning(`Item with code/barcode "${code}" not found.`);
    }
  };

  const totals = value.reduce(
    (acc, l) => {
      const opt = itemOptions.find((o) => o.id === l.itemId);
      const pSize = l.packagingSize ?? (opt?.packagingSize ? Number(opt.packagingSize) : 0);
      const pUnit = l.packagingUnit ?? opt?.packagingUnit ?? (opt?.packagingType ? opt.packagingType.toLowerCase() : 'Coil');
      const uomStr = l.uomCode || opt?.baseUom?.code || opt?.uomCode || 'M';

      const qty = Number(l.quantity || 0);
      const pkgQty = l.packageQuantity !== undefined
        ? Number(l.packageQuantity)
        : (pSize > 0 && qty > 0 ? Math.round((qty / pSize) * 100) / 100 : 0);

      const rate = Number(l.rate || 0);
      const base = qty * rate;
      const afterDiscount = base * (1 - Number(l.discountPercent || 0) / 100);
      const afterTax = afterDiscount * (1 + Number(l.taxPercent || 0) / 100);

      if (pkgQty > 0) {
        acc.packageCount += pkgQty;
        if (!acc.packagingUnit) acc.packagingUnit = pUnit;
      }
      if (uomStr && !acc.baseUom) acc.baseUom = uomStr;

      acc.quantity += qty;
      acc.baseAmount += base;
      acc.totalAmount += afterTax;
      return acc;
    },
    { packageCount: 0, packagingUnit: '', baseUom: '', quantity: 0, baseAmount: 0, totalAmount: 0 },
  );

  const columns: ColumnsType<ERPLine> = [
    {
      title: 'Item',
      key: 'item',
      width: 320,
      render: (_, record) => {
        const avail = lineAvailability[record.id];
        // Resolve packaging info from record or matched item in options
        const opt = itemOptions.find((o) => o.id === record.itemId);
        const pSize = record.packagingSize ?? (opt?.packagingSize ? Number(opt.packagingSize) : undefined);
        const pUnit = record.packagingUnit ?? opt?.packagingUnit ?? (opt?.packagingType ? opt.packagingType.toLowerCase() : 'Coil');

        return (
          <div>
            <Select
              showSearch
              placeholder="Select item..."
              value={record.itemId}
              style={{ width: '100%' }}
              disabled={disabled}
              filterOption={(input, option) => {
                const labelStr = String(option?.label || '').toLowerCase();
                const codeStr = String((option as any)?.itemCode || '').toLowerCase();
                const term = input.toLowerCase();
                return labelStr.includes(term) || codeStr.includes(term);
              }}
              onSearch={setSearchText}
              onChange={(v) => selectItem(record.id, v)}
              onDropdownVisibleChange={(open) => { if (open) loadItems(searchText); }}
              options={filteredItems.map((o) => ({
                value: o.id,
                label: o.name,
                itemCode: o.itemCode,
              }))}
              optionRender={(option) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{option.data.label}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginLeft: 8 }}>{option.data.itemCode}</span>
                </div>
              )}
              notFoundContent="No matching items found"
            />

            {/* Packaging Conversion Info Badge, SOC Tag & Order Quantity */}
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {pSize && pSize > 0 ? (
                <Tag color="cyan" style={{ fontSize: 10.5, fontWeight: 700, margin: 0, padding: '1px 6px', borderRadius: 4 }}>
                  📦 1 {pUnit} = {pSize.toLocaleString()} {record.uomCode || 'M'}
                </Tag>
              ) : null}

              {record.salesOrderNumber && (
                <Tag color="geekblue" style={{ fontSize: 10.5, fontWeight: 700, margin: 0, padding: '1px 6px', borderRadius: 4 }}>
                  📋 SOC: {record.salesOrderNumber}
                </Tag>
              )}

              {(record.orderQuantity !== undefined || record.orderBalance !== undefined) && (
                <Tag color="orange" style={{ fontSize: 10.5, fontWeight: 700, margin: 0, padding: '1px 6px', borderRadius: 4 }}>
                  📊 SOC Qty: {Number(record.orderQuantity ?? record.orderBalance ?? 0).toLocaleString()} {record.uomCode || 'M'}
                </Tag>
              )}

              {record.customerPo && (
                <Tag color="purple" style={{ fontSize: 10.5, fontWeight: 600, margin: 0, padding: '1px 6px', borderRadius: 4 }}>
                  PO: {record.customerPo}
                </Tag>
              )}
            </div>

            {/* Stock Availability Breakdown Card */}
            {showAvailability && avail && (
              <div style={{
                marginTop: 6,
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 11,
                background: avail.shortageQty > 0
                  ? 'rgba(239, 68, 68, 0.12)'
                  : (avail.projectedBalance < avail.safetyStock ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.1)'),
                border: `1px solid ${avail.shortageQty > 0 ? '#ef4444' : (avail.projectedBalance < avail.safetyStock ? '#f59e0b' : '#10b981')}`,
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 6,
              }}>
                <div style={{ color: 'var(--inv-text-primary, #0f172a)', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span>Stock: <strong>{avail.physicalStock}</strong> {avail.uomCode}</span>
                  <span style={{ color: '#94a3b8' }}>|</span>
                  <span>Committed: <strong>{avail.committedStock}</strong></span>
                  <span style={{ color: '#94a3b8' }}>|</span>
                  <span>Safety: <strong>{avail.safetyStock}</strong></span>
                  <span style={{ color: '#94a3b8' }}>|</span>
                  <span>Avail: <strong style={{ color: avail.availableStock > 0 ? '#10b981' : '#ef4444' }}>{avail.availableStock}</strong></span>
                  <span style={{ color: '#94a3b8' }}>|</span>
                  <span>Projected: <strong style={{ color: avail.projectedBalance >= 0 ? '#10b981' : '#ef4444' }}>{avail.projectedBalance}</strong></span>
                  {avail.productionRequirementQty !== undefined && avail.productionRequirementQty > 0 && (
                    <>
                      <span style={{ color: '#94a3b8' }}>|</span>
                      <span style={{ color: '#7c3aed', fontWeight: 700 }}>
                        Prod Req: {avail.productionRequirementQty} {avail.uomCode}
                      </span>
                    </>
                  )}
                </div>
                <Tag
                  color={avail.shortageQty > 0 ? 'error' : (avail.projectedBalance < avail.safetyStock ? 'warning' : 'success')}
                  style={{ margin: 0, fontSize: 10, fontWeight: 700 }}
                >
                  {avail.statusLabel}
                </Tag>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Item Code',
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 105,
      render: (code) => <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{code || '-'}</span>,
    },
    {
      title: 'Pkg / Coils',
      key: 'packageQuantity',
      width: 140,
      render: (_, record) => {
        const opt = itemOptions.find((o) => o.id === record.itemId);
        const pSize = record.packagingSize ?? (opt?.packagingSize ? Number(opt.packagingSize) : undefined);
        const pUnit = record.packagingUnit ?? opt?.packagingUnit ?? (opt?.packagingType ? opt.packagingType.toLowerCase() : 'Coil');

        if (!pSize || pSize <= 0) {
          return <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>;
        }

        const currentPkgQty = record.packageQuantity !== undefined
          ? record.packageQuantity
          : (record.quantity ? Math.round((record.quantity / pSize) * 100) / 100 : undefined);

        const hasOrderLimit = record.orderBalance !== undefined && record.orderBalance !== null;
        const maxPkg = hasOrderLimit ? Math.round(((record.orderBalance || 0) / pSize) * 100) / 100 : undefined;
        const isPkgExcess = hasOrderLimit && maxPkg !== undefined && Number(currentPkgQty || 0) > maxPkg;

        return (
          <div>
            <InputNumber
              min={0}
              step={1}
              value={currentPkgQty === 0 || currentPkgQty === undefined ? null : currentPkgQty}
              disabled={disabled}
              placeholder="0"
              status={isPkgExcess ? 'error' : undefined}
              onFocus={(e) => (e.target as HTMLInputElement)?.select?.()}
              addonAfter={<span style={{ fontSize: 11, fontWeight: 600 }}>{pUnit || 'Coil'}</span>}
              style={{
                width: '100%',
                borderColor: isPkgExcess ? '#ef4444' : undefined,
              }}
              onChange={(val) => {
                const pkgQty = Number(val || 0);
                const baseQty = pkgQty * pSize;
                updateLine(record.id, {
                  packageQuantity: pkgQty,
                  quantity: baseQty,
                  packagingSize: pSize,
                  packagingUnit: pUnit,
                });
              }}
            />
            {hasOrderLimit && maxPkg !== undefined && (
              <div style={{ marginTop: 4 }}>
                {isPkgExcess ? (
                  <div
                    style={{
                      padding: '2px 5px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      background: 'rgba(239, 68, 68, 0.18)',
                      border: '1px solid #ef4444',
                      color: '#ef4444',
                    }}
                  >
                    ⚠️ Excess +{((currentPkgQty || 0) - maxPkg).toFixed(1)} {pUnit}!
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: '#94a3b8', padding: '1px 2px' }}>
                    Max: {maxPkg} {pUnit}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Qty',
      key: 'qty',
      width: 155,
      render: (_, record) => {
        const opt = itemOptions.find((o) => o.id === record.itemId);
        const pSize = record.packagingSize ?? (opt?.packagingSize ? Number(opt.packagingSize) : undefined);
        const hasOrderLimit = record.orderBalance !== undefined && record.orderBalance !== null;
        const currentQty = Number(record.quantity || 0);
        const orderBal = Number(record.orderBalance || 0);
        const isExcess = hasOrderLimit && currentQty > orderBal;
        const isFullBalance = hasOrderLimit && currentQty === orderBal && orderBal > 0;
        const isPartial = hasOrderLimit && currentQty < orderBal && currentQty > 0;
        const uomText = record.uomCode || (record as any).uom || opt?.baseUom?.code || 'M';

        return (
          <div>
            <InputNumber
              min={0}
              value={record.quantity === 0 || record.quantity === undefined ? null : record.quantity}
              disabled={disabled}
              placeholder="0"
              status={isExcess ? 'error' : undefined}
              onFocus={(e) => (e.target as HTMLInputElement)?.select?.()}
              addonAfter={<span style={{ fontSize: 11, fontWeight: 600 }}>{uomText}</span>}
              style={{
                width: '100%',
                borderColor: isExcess ? '#ef4444' : undefined,
                boxShadow: isExcess ? '0 0 0 2px rgba(239, 68, 68, 0.2)' : undefined,
              }}
              onChange={(v) => {
                const baseQty = Number(v || 0);
                const pkgQty = (pSize && pSize > 0) ? Math.round((baseQty / pSize) * 100) / 100 : undefined;
                updateLine(record.id, {
                  quantity: baseQty,
                  packageQuantity: pkgQty,
                });
              }}
            />

            {/* SOC Balance & Warning Display underneath Qty input (as marked in red boxes by user) */}
            {hasOrderLimit && (
              <div style={{ marginTop: 4 }}>
                {isExcess && (
                  <div
                    style={{
                      padding: '3px 6px',
                      borderRadius: 4,
                      fontSize: 10.5,
                      fontWeight: 700,
                      background: 'rgba(239, 68, 68, 0.18)',
                      border: '1px solid #ef4444',
                      color: '#ef4444',
                      lineHeight: 1.3,
                    }}
                  >
                    ⚠️ Excess +{(currentQty - orderBal).toLocaleString()} {record.uomCode || 'M'}!
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: '#fca5a5' }}>
                      Max SOC: {orderBal.toLocaleString()} {record.uomCode || 'M'}
                    </div>
                  </div>
                )}
                {isFullBalance && (
                  <div
                    style={{
                      padding: '2px 5px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid #10b981',
                      color: '#10b981',
                      lineHeight: 1.2,
                    }}
                  >
                    ✅ Full Balance ({orderBal.toLocaleString()})
                  </div>
                )}
                {isPartial && (
                  <div
                    style={{
                      padding: '2px 5px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 500,
                      background: 'rgba(59, 130, 246, 0.12)',
                      border: '1px solid #3b82f6',
                      color: '#38bdf8',
                      lineHeight: 1.2,
                    }}
                  >
                    ℹ️ Bal: {(orderBal - currentQty).toLocaleString()} {record.uomCode || 'M'} left
                  </div>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: `Rate (${currency})`,
      key: 'rate',
      width: 125,
      render: (_, record) => (
        <InputNumber
          min={0}
          value={record.rate === 0 || record.rate === undefined ? null : record.rate}
          disabled={disabled}
          onFocus={(e) => (e.target as HTMLInputElement)?.select?.()}
          onChange={(v) => updateLine(record.id, { rate: Number(v || 0) })}
          style={{ width: '100%' }}
          placeholder="0"
        />
      ),
    },
    ...(showDiscount ? [{
      title: 'Disc %',
      key: 'disc',
      width: 90,
      render: (_: unknown, record: ERPLine) => (
        <InputNumber
          min={0}
          max={100}
          value={record.discountPercent === 0 || record.discountPercent === undefined ? null : record.discountPercent}
          disabled={disabled}
          onFocus={(e) => (e.target as HTMLInputElement)?.select?.()}
          onChange={(v) => updateLine(record.id, { discountPercent: Number(v || 0) })}
          style={{ width: '100%' }}
          placeholder="0"
        />
      ),
    }] : []),
    ...(showTax ? [{
      title: 'Tax %',
      key: 'tax',
      width: 100,
      render: (_: unknown, record: ERPLine) => (
        <InputNumber
          min={0}
          max={100}
          value={record.taxPercent === 0 || record.taxPercent === undefined ? null : record.taxPercent}
          disabled={disabled}
          placeholder="18"
          addonAfter="%"
          onFocus={(e) => (e.target as HTMLInputElement)?.select?.()}
          onChange={(v) => updateLine(record.id, { taxPercent: Number(v ?? 18) })}
          style={{ width: '100%' }}
        />
      ),
    }] : []),
    {
      title: `Amount (${currency})`,
      key: 'lineTotal',
      width: 140,
      align: 'right' as const,
      render: (_, record) => (
        <span style={{ fontWeight: 700, color: '#10b981' }}>
          {record.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    ...(showWarehouse ? [{
      title: 'Warehouse',
      key: 'wh',
      width: 155,
      render: (_: unknown, record: ERPLine) => (
        <Select
          placeholder="Warehouse"
          value={record.warehouseId}
          disabled={disabled}
          onChange={(v) => updateLine(record.id, { warehouseId: v })}
          style={{ width: '100%' }}
          options={warehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))}
        />
      ),
    }] : []),
    {
      title: '',
      key: 'actions',
      width: 45,
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          disabled={disabled}
          onClick={() => removeLine(record.id)}
          aria-label="Remove line"
        />
      ),
    },
  ];

  return (
    <div>
      {/* ── BARCODE / QR SCANNER BAR (Matching Reference Image 2) ──────────────── */}
      <div
        className="erp-scan-bar-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          padding: '6px 10px',
          background: 'var(--inv-filter-card-bg, rgba(30, 41, 59, 0.35))',
          borderRadius: 8,
          border: '1.5px dashed var(--inv-border-color, #334155)',
          transition: 'border-color 0.2s ease',
        }}
      >
        <BarcodeOutlined style={{ fontSize: 22, color: '#10b981', flexShrink: 0, marginLeft: 4 }} />
        <Input
          ref={scanInputRef}
          placeholder="Scan a QR label or type a SKU / Item Code / Barcode..."
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          onPressEnter={() => handleBarcodeSubmit()}
          disabled={disabled}
          allowClear
          bordered={false}
          style={{
            flex: 1,
            boxShadow: 'none',
            fontSize: 13,
            color: 'inherit',
          }}
        />
        <Button
          type="default"
          icon={<CameraOutlined />}
          onClick={() => setScannerModalOpen(true)}
          disabled={disabled}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          Camera
        </Button>
        <Tooltip title={soundEnabled ? 'Audio Feedback: ON (Beep on Scan)' : 'Audio Feedback: MUTED'}>
          <Button
            type="text"
            icon={soundEnabled ? <SoundOutlined style={{ color: '#10b981', fontSize: 16 }} /> : <AudioMutedOutlined style={{ color: '#94a3b8', fontSize: 16 }} />}
            onClick={() => setSoundEnabled((prev) => !prev)}
            style={{ borderRadius: 6 }}
          />
        </Tooltip>
      </div>

      {/* ── TOOLBAR HEADER (FILTER ITEMS) ─────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {label}
          </Typography.Text>
          {showItemTypeFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(30, 41, 59, 0.4)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(148, 163, 184, 0.2)' }}>
              <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>Filter Items:</span>
              <Select
                size="small"
                value={selectedItemType}
                onChange={(val) => setSelectedItemType(val)}
                style={{ width: 175 }}
                options={[
                  { value: 'FINISHED_GOOD', label: 'Finished Goods (FG)' },
                  { value: 'SEMI_FINISHED', label: 'Semi-Finished (WIP)' },
                  { value: 'RAW_MATERIAL', label: 'Raw Material (RM)' },
                  { value: 'ALL', label: 'All Item Types' },
                ]}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── LINE ITEMS TABLE ─────────────────────────────────────────────────── */}
      <Table
        size="small"
        columns={columns as ColumnsType<ERPLine>}
        dataSource={value}
        rowKey="id"
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'No line items. Scan a barcode above or click "+ Add Line" to add items.' }}
      />

      {/* ── FOOTER: + ADD LINE (LEFT) & FINANCIAL SUMMARY (RIGHT) ────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginTop: 14,
        gap: 16,
        flexWrap: 'wrap',
      }}>
        {/* Left Side: + Add Line button matching Reference Image 2 */}
        <div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={addLine}
            disabled={disabled}
            style={{
              backgroundColor: '#475569',
              borderColor: '#475569',
              borderRadius: 4,
              fontWeight: 600,
              height: 36,
              padding: '0 16px',
              boxShadow: 'none',
            }}
          >
            + Add Line
          </Button>
        </div>

        {/* Right Side: Financial Summary Box matching Reference Image 2 */}
        <div
          style={{
            minWidth: 280,
            maxWidth: 380,
            background: 'var(--inv-filter-card-bg, #ffffff)',
            border: '1px solid var(--inv-card-border, #e2e8f0)',
            borderRadius: 6,
            padding: '12px 18px',
            fontSize: 13,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginLeft: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>Subtotal</Typography.Text>
            <Typography.Text strong style={{ fontSize: 13 }}>
              {currency} {totals.baseAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Typography.Text>
          </div>

          {totals.packageCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>Total Coils / Pkg</Typography.Text>
              <Typography.Text strong style={{ fontSize: 13, color: '#10b981' }}>
                {totals.packageCount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {totals.packagingUnit || 'Coils'}
              </Typography.Text>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>Total Qty ({totals.baseUom || 'Meters'})</Typography.Text>
            <Typography.Text strong style={{ fontSize: 13 }}>
              {totals.quantity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {totals.baseUom || 'M'}
            </Typography.Text>
          </div>

          <div style={{ borderTop: '1px solid var(--inv-card-border, #cbd5e1)', margin: '4px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text strong style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Grand Total
            </Typography.Text>
            <Typography.Text strong style={{ fontSize: 16, color: '#10b981' }}>
              {currency} {totals.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Typography.Text>
          </div>
        </div>
      </div>

      {/* ── LIVE CAMERA SCANNER MODAL ────────────────────────────────────────── */}
      <BarcodeScanner
        open={scannerModalOpen}
        onClose={() => setScannerModalOpen(false)}
        onScan={(scannedCode) => {
          handleBarcodeSubmit(scannedCode);
          setScannerModalOpen(false);
        }}
        title="Scan Barcode / QR Label"
      />
    </div>
  );
};

export default ERPLineItems;