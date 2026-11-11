import React, { useState, useEffect } from 'react';
import { Table, Button, Select, InputNumber, Space, Typography, Tooltip, Tag, Alert, Card, Row, Col, theme } from 'antd';
import { PlusOutlined, DeleteOutlined, InfoCircleOutlined, AppstoreOutlined, WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../../services/api';

export interface StoreLineItem {
  key: string;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  itemType?: string;
  uomId?: string;
  uomCode?: string;
  requestedQuantity?: number;
  quantity?: number;
  availableStock?: number;
  minimumStock?: number;
  maximumStock?: number;
  reorderLevel?: number;
  currentShortage?: number;
  requiredDate?: string;
  conditionCode?: string;
  remarks?: string;
  poLineId?: string;
  unitPrice?: number;
}

interface ItemOption {
  id: string;
  itemCode: string;
  name: string;
  itemType?: string;
  divisionId?: string;
  baseUomId?: string;
  uomId?: string;
  baseUom?: { id: string; code?: string; name?: string };
  uomCode?: string;
  availableStock?: number;
  minimumStock?: number;
  maximumStock?: number;
  reorderLevel?: number;
}

interface UomOption {
  id: string;
  code?: string;
  name?: string;
  symbol?: string;
}

export interface StoreLineItemsEditorProps {
  mode: 'request' | 'issue' | 'return';
  value: StoreLineItem[];
  onChange: (lines: StoreLineItem[]) => void;
  disabled?: boolean;
  label?: string;
  storeId?: string;
  divisionId?: string;
  divisionName?: string;
  excludeFinishedGoods?: boolean;
}

let lineIdCounter = 0;
const nextKey = () => `sl-${++lineIdCounter}-${Date.now()}`;

const emptyLine = (mode: 'request' | 'issue' | 'return'): StoreLineItem => {
  const line: StoreLineItem = { key: nextKey() };
  if (mode === 'request') {
    line.requestedQuantity = 1;
    line.availableStock = 0;
    line.minimumStock = 0;
    line.maximumStock = 0;
    line.currentShortage = 0;
  } else {
    line.quantity = 1;
  }
  if (mode === 'return') line.conditionCode = 'GOOD';
  return line;
};

const getItemTypeTagColor = (type?: string) => {
  switch (type) {
    case 'SPARE_PART': return 'orange';
    case 'TOOLING': return 'purple';
    case 'CONSUMABLE': return 'cyan';
    case 'RAW_MATERIAL': return 'blue';
    case 'PACKAGING_MATERIAL': return 'gold';
    default: return 'default';
  }
};

const StoreLineItemsEditor: React.FC<StoreLineItemsEditorProps> = ({
  mode,
  value,
  onChange,
  disabled = false,
  label = 'Line Items',
  storeId,
  divisionId,
  divisionName,
  excludeFinishedGoods = false,
}) => {
  const { token } = theme.useToken();
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [uomOptions, setUomOptions] = useState<UomOption[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  // Monitor window resize for responsive layout
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch Items & UOMs scoped strictly to Division & Store
  useEffect(() => {
    let active = true;
    (async () => {
      // 1. Load UOMs
      try {
        const uomRes = await apiService.get<any>('/master-data/uom', { limit: 200 });
        if (active) {
          const uData = Array.isArray(uomRes) ? uomRes : uomRes?.data || [];
          setUomOptions(uData);
        }
      } catch {
        if (active) setUomOptions([]);
      }

      // If no division AND no store is selected yet, do NOT load items
      if (!divisionId && !storeId) {
        if (active) {
          setItemOptions([]);
          setLoadingItems(false);
        }
        return;
      }

      setLoadingItems(true);

      try {
        let storeItemsList: ItemOption[] = [];

        // If a specific store is provided, load its items and stock
        if (storeId) {
          try {
            const storeRes = await apiService.get<any>(`/store/stores/${storeId}/items`, { limit: 1000 });
            const sData = Array.isArray(storeRes) ? storeRes : storeRes?.data || [];
            storeItemsList = sData.map((si: any) => ({
              id: si.itemId || si.item?.id,
              itemCode: si.item?.itemCode || si.itemCode || '—',
              name: si.item?.name || si.itemName || '—',
              itemType: si.item?.itemType || si.itemType,
              divisionId: si.item?.divisionId || si.divisionId,
              baseUomId: si.item?.baseUomId || si.item?.uomId,
              uomCode: si.item?.baseUom?.code || si.item?.uomCode,
              availableStock: Number(si.availableStock !== undefined ? si.availableStock : 0),
              minimumStock: si.minimumStock !== null && si.minimumStock !== undefined ? Number(si.minimumStock) : undefined,
              maximumStock: si.maximumStock !== null && si.maximumStock !== undefined ? Number(si.maximumStock) : undefined,
              reorderLevel: si.reorderLevel !== null && si.reorderLevel !== undefined ? Number(si.reorderLevel) : undefined,
            })).filter((x: ItemOption) => Boolean(x.id));
          } catch {
            // fallback
          }
        }

        // Fetch master items strictly filtered by divisionId
        const queryParams: any = { limit: 1000 };
        if (divisionId) {
          queryParams.divisionId = divisionId;
        }

        const res = await apiService.get<any>('/master-data/items', queryParams);
        const list: any[] = Array.isArray(res) ? res : res?.data || [];

        const mergedMap = new Map<string, ItemOption>();

        // Add division-scoped items
        list.forEach((it: any) => {
          if (!it.id) return;
          // Strict division filter if divisionId is specified
          if (divisionId && it.divisionId && it.divisionId !== divisionId) {
            return;
          }
          const isFg = it.itemType === 'FINISHED_GOOD';
          if ((mode === 'issue' || excludeFinishedGoods) && isFg) {
            return; // Finished goods must NOT be issued from general/raw stores
          }
          mergedMap.set(it.id, {
            id: it.id,
            itemCode: it.itemCode,
            name: it.name,
            itemType: it.itemType,
            divisionId: it.divisionId,
            baseUomId: it.baseUomId || it.uomId,
            uomCode: it.baseUom?.code || it.uomCode,
            availableStock: storeId ? 0 : undefined,
          });
        });

        // Overlay store-specific stock and limits
        storeItemsList.forEach((si) => {
          if (divisionId && si.divisionId && si.divisionId !== divisionId) return;
          if ((mode === 'issue' || excludeFinishedGoods) && si.itemType === 'FINISHED_GOOD') return;
          const existing = mergedMap.get(si.id);
          mergedMap.set(si.id, {
            ...(existing || si),
            availableStock: si.availableStock,
            minimumStock: si.minimumStock,
            maximumStock: si.maximumStock,
            reorderLevel: si.reorderLevel,
          });
        });

        if (active) {
          setItemOptions(Array.from(mergedMap.values()));
        }
      } catch {
        if (active) setItemOptions([]);
      } finally {
        if (active) setLoadingItems(false);
      }
    })();

    return () => { active = false; };
  }, [divisionId, storeId, mode, excludeFinishedGoods]);

  const addLine = () => onChange([...value, emptyLine(mode)]);

  const updateLine = (key: string, patch: Partial<StoreLineItem>) => {
    onChange(
      value.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (mode === 'request') {
          const requested = Number(next.requestedQuantity || 0);
          const available = Number(next.availableStock || 0);
          next.currentShortage = Math.max(requested - available, 0);
        }
        return next;
      }),
    );
  };

  const selectItem = (key: string, itemId: string) => {
    const item = itemOptions.find((o) => o.id === itemId);
    if (!item) return;
    updateLine(key, {
      itemId: item.id,
      itemCode: item.itemCode,
      itemName: item.name,
      itemType: item.itemType,
      uomId: item.baseUomId || item.uomId,
      uomCode: item.uomCode,
      availableStock: item.availableStock ?? 0,
      minimumStock: item.minimumStock,
      maximumStock: item.maximumStock,
      reorderLevel: item.reorderLevel,
    });
  };

  const removeLine = (key: string) => onChange(value.filter((l) => l.key !== key));

  const count = value.reduce((acc, l) => {
    const qty = mode === 'request' ? Number(l.requestedQuantity || 0) : Number(l.quantity || 0);
    return acc + qty;
  }, 0);

  // Check if any line has an stock deficit
  const hasStockDeficit = value.some((l) => {
    if (!l.itemId || mode !== 'issue') return false;
    const avail = Number(l.availableStock ?? 0);
    const qty = Number(l.quantity || 0);
    return avail <= 0 || qty > avail;
  });

  // Desktop Table Columns
  const itemColumn = {
    title: 'Store Item (Code & Description)',
    key: 'item',
    width: 380,
    render: (_: unknown, record: StoreLineItem) => (
      <div>
        <Select
          showSearch
          popupMatchSelectWidth={false}
          dropdownStyle={{ minWidth: isMobile ? 320 : 680, maxWidth: 880, padding: 6 }}
          placeholder={divisionId || storeId ? "Search item code or description..." : "Select Division first"}
          value={record.itemId}
          style={{ width: '100%' }}
          disabled={disabled || (!divisionId && !storeId)}
          loading={loadingItems}
          filterOption={(input, option) => {
            const label = String(option?.searchValue || option?.label || '');
            return label.toLowerCase().includes(input.toLowerCase());
          }}
          onChange={(v) => selectItem(record.key, v)}
          options={itemOptions.map((o) => ({
            value: o.id,
            label: `${o.itemCode} — ${o.name}`,
            searchValue: `${o.itemCode} ${o.name} ${o.itemType || ''}`,
            itemCode: o.itemCode,
            name: o.name,
            itemType: o.itemType,
            availableStock: o.availableStock,
            uomCode: o.uomCode,
          }))}
          optionRender={(option) => {
            const stock = option.data.availableStock;
            const isOut = stock !== undefined && stock <= 0;
            const hasStock = stock !== undefined && stock > 0;
            return (
              <div style={{ padding: '6px 4px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                {/* Line 1: Item Code & Full Name */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.4, color: token.colorText }}>
                    <span style={{ fontWeight: 700, color: token.colorPrimary, marginRight: 8, fontFamily: 'monospace' }}>
                      {option.data.itemCode}
                    </span>
                    <span style={{ fontWeight: 500 }}>{option.data.name}</span>
                  </div>
                  {option.data.itemType && (
                    <Tag
                      color={getItemTypeTagColor(option.data.itemType)}
                      style={{ margin: 0, fontSize: 10, flexShrink: 0, fontWeight: 500 }}
                    >
                      {option.data.itemType.replace(/_/g, ' ')}
                    </Tag>
                  )}
                </div>

                {/* Line 2: Stock Availability & UOM Metadata */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  {hasStock && (
                    <Tag color="success" style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>
                      In Stock: {stock.toLocaleString()} {option.data.uomCode || ''}
                    </Tag>
                  )}
                  {isOut && (
                    <Tag color="error" style={{ margin: 0, fontSize: 11 }}>
                      Out of Stock (0 Available)
                    </Tag>
                  )}
                  {option.data.uomCode && (
                    <span style={{ fontSize: 11, color: token.colorTextTertiary }}>
                      Base UOM: <strong>{option.data.uomCode}</strong>
                    </span>
                  )}
                </div>
              </div>
            );
          }}
          notFoundContent={
            loadingItems
              ? 'Loading division items...'
              : !divisionId && !storeId
              ? 'Please select a Division or Store first'
              : 'No items found in this division'
          }
        />
        {record.itemId && record.itemName && (
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4, lineHeight: 1.3 }}>
            {record.itemName}
          </div>
        )}
      </div>
    ),
  };

  const stockColumn = {
    title: 'Stock In Store',
    key: 'stock',
    width: 150,
    render: (_: unknown, record: StoreLineItem) => {
      if (!record.itemId) {
        return <Typography.Text type="secondary" style={{ fontSize: 12 }}>—</Typography.Text>;
      }
      const avail = Number(record.availableStock ?? 0);
      const isOut = avail <= 0;
      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Typography.Text strong style={{ color: isOut ? token.colorError : token.colorSuccess, fontSize: 13 }}>
              {avail.toLocaleString()} {record.uomCode || ''}
            </Typography.Text>
            {isOut ? (
              <Tag color="error" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>Out of Stock</Tag>
            ) : (
              <Tag color="success" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>In Stock</Tag>
            )}
          </div>
          {(record.minimumStock !== undefined || record.maximumStock !== undefined) && (
            <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 2 }}>
              {record.minimumStock !== undefined && `Min: ${record.minimumStock}`}
              {record.minimumStock !== undefined && record.maximumStock !== undefined && ' | '}
              {record.maximumStock !== undefined && `Max: ${record.maximumStock}`}
            </div>
          )}
        </div>
      );
    },
  };

  const qtyColumn = {
    title: mode === 'request' ? 'Req Qty' : 'Issue Qty',
    key: 'qty',
    width: 120,
    render: (_: unknown, record: StoreLineItem) => {
      const avail = Number(record.availableStock ?? 0);
      const qty = Number(record.quantity || 0);
      const isExceeded = record.itemId && avail > 0 && qty > avail;
      const isZero = record.itemId && avail <= 0;
      return (
        <div>
          <InputNumber
            min={0.01}
            step={1}
            status={isExceeded || isZero ? 'error' : undefined}
            value={mode === 'request' ? record.requestedQuantity : record.quantity}
            disabled={disabled}
            onChange={(v) => updateLine(record.key, mode === 'request' ? { requestedQuantity: Number(v || 0) } : { quantity: Number(v || 0) })}
            style={{ width: '100%' }}
          />
          {isExceeded && (
            <div style={{ color: token.colorError, fontSize: 10, marginTop: 2 }}>
              Max: {avail}
            </div>
          )}
        </div>
      );
    },
  };

  const remainingColumn = {
    title: 'Remaining Stock',
    key: 'remaining',
    width: 160,
    render: (_: unknown, record: StoreLineItem) => {
      if (!record.itemId) {
        return <Typography.Text type="secondary" style={{ fontSize: 12 }}>—</Typography.Text>;
      }
      const avail = Number(record.availableStock ?? 0);
      const qty = Number(record.quantity || 0);
      const rem = avail - qty;
      const min = record.minimumStock;

      if (avail <= 0) {
        return <Tag color="error">❌ Zero Stock in Store</Tag>;
      }
      if (rem < 0) {
        return (
          <Tooltip title={`Issue quantity (${qty}) exceeds available store stock (${avail})`}>
            <Tag color="error" style={{ fontWeight: 600 }}>
              ⚠️ Deficit: {Math.abs(rem).toLocaleString()} {record.uomCode}
            </Tag>
          </Tooltip>
        );
      }
      if (min !== undefined && rem < min) {
        return (
          <Tooltip title={`Remaining balance (${rem}) is below configured minimum stock level (${min})`}>
            <Tag color="warning" style={{ fontWeight: 500 }}>
              ⚠️ {rem.toLocaleString()} {record.uomCode} (Below Min)
            </Tag>
          </Tooltip>
        );
      }
      return (
        <Tag color="success" style={{ fontWeight: 600 }}>
          ✅ {rem.toLocaleString()} {record.uomCode} left
        </Tag>
      );
    },
  };

  const uomColumn = {
    title: 'UOM',
    key: 'uom',
    width: 90,
    render: (_: unknown, record: StoreLineItem) => (
      <Select
        placeholder="UOM"
        value={record.uomId}
        disabled={disabled}
        style={{ width: '100%' }}
        onChange={(v) => updateLine(record.key, { uomId: v })}
        options={uomOptions.map((u) => ({ value: u.id, label: u.code || u.symbol || u.name }))}
      />
    ),
  };

  const remarksColumn = {
    title: 'Part Use / Purpose',
    key: 'remarks',
    width: 160,
    render: (_: unknown, record: StoreLineItem) => (
      <Select
        placeholder="Select Reason"
        value={record.remarks}
        disabled={disabled}
        allowClear
        style={{ width: '100%' }}
        onChange={(v) => updateLine(record.key, { remarks: v })}
        options={[
          { value: 'NORMAL', label: 'Normal Issue' },
          { value: 'URGENT', label: 'Urgent Maintenance' },
          { value: 'SPECIAL', label: 'Special Replacement' },
          { value: 'ROUTINE', label: 'Routine Changeover' },
        ]}
      />
    ),
  };

  const actionColumn = {
    title: '',
    key: 'actions',
    width: 45,
    render: (_: unknown, record: StoreLineItem) => (
      <Tooltip title="Remove item">
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          disabled={disabled}
          onClick={() => removeLine(record.key)}
          aria-label="Remove line"
        />
      </Tooltip>
    ),
  };

  const desktopColumns: ColumnsType<StoreLineItem> = [
    itemColumn,
    stockColumn,
    qtyColumn,
    remainingColumn,
    uomColumn,
    remarksColumn,
    actionColumn,
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <Space size={6} wrap>
          <AppstoreOutlined style={{ color: token.colorPrimary }} />
          <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>{label}</Typography.Text>
          {divisionName ? (
            <Tag color="blue" style={{ marginLeft: 6 }}>
              Filtered by: {divisionName} ({itemOptions.length} items)
            </Tag>
          ) : (
            <Tag color="orange" style={{ marginLeft: 6 }}>
              Select Division / Store to load items
            </Tag>
          )}
        </Space>
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addLine}
          disabled={disabled || (!divisionId && !storeId)}
        >
          Add Item Line
        </Button>
      </div>

      {!divisionId && !storeId && (
        <Alert
          type="warning"
          showIcon
          icon={<InfoCircleOutlined />}
          message="Division Scope Required"
          description="Please select a Division or Source Store above. The item catalog contains thousands of items and will automatically filter to show only items belonging to your selected division."
          style={{ marginBottom: 12 }}
        />
      )}

      {hasStockDeficit && (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          message="Insufficient Store Inventory"
          description="One or more selected items have zero stock or the issue quantity exceeds the available stock in the store. Please adjust the quantities or replenish stock before submitting."
          style={{ marginBottom: 12 }}
        />
      )}

      {/* MOBILE RESPONSIVE CARD VIEW */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {value.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                border: `1px dashed ${token.colorBorder}`,
                borderRadius: 8,
                color: token.colorTextSecondary,
              }}
            >
              No items added yet. Tap <strong>"Add Item Line"</strong> to select a part.
            </div>
          ) : (
            value.map((record, index) => {
              const avail = Number(record.availableStock ?? 0);
              const qty = Number(record.quantity || 0);
              const rem = avail - qty;
              const isOut = record.itemId && avail <= 0;
              const isExceeded = record.itemId && avail > 0 && qty > avail;

              return (
                <Card
                  key={record.key}
                  size="small"
                  style={{
                    border: `1px solid ${isOut || isExceeded ? token.colorError : token.colorBorderSecondary}`,
                    borderRadius: 8,
                    background: token.colorBgContainer,
                  }}
                  styles={{ body: { padding: 12 } }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Typography.Text strong style={{ fontSize: '13px', color: token.colorPrimary }}>
                      Line #{index + 1}
                    </Typography.Text>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => removeLine(record.key)}
                    >
                      Remove
                    </Button>
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: '11px', display: 'block', marginBottom: 2 }}>
                      Store Item
                    </Typography.Text>
                    <Select
                      showSearch
                      popupMatchSelectWidth={false}
                      dropdownStyle={{ minWidth: '88vw', maxWidth: '94vw', padding: 4 }}
                      placeholder="Search item code or name..."
                      value={record.itemId}
                      style={{ width: '100%' }}
                      loading={loadingItems}
                      disabled={!divisionId && !storeId}
                      filterOption={(input, option) => {
                        const label = String(option?.searchValue || option?.label || '');
                        return label.toLowerCase().includes(input.toLowerCase());
                      }}
                      onChange={(v) => selectItem(record.key, v)}
                      options={itemOptions.map((o) => ({
                        value: o.id,
                        label: `${o.itemCode} — ${o.name}`,
                        searchValue: `${o.itemCode} ${o.name} ${o.itemType || ''}`,
                        itemCode: o.itemCode,
                        name: o.name,
                        itemType: o.itemType,
                        availableStock: o.availableStock,
                        uomCode: o.uomCode,
                      }))}
                      optionRender={(opt) => {
                        const stock = opt.data.availableStock;
                        const isOptOut = stock !== undefined && stock <= 0;
                        const hasOptStock = stock !== undefined && stock > 0;
                        return (
                          <div style={{ padding: '6px 2px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                              <div style={{ fontSize: 13, lineHeight: 1.3, color: token.colorText }}>
                                <span style={{ fontWeight: 700, color: token.colorPrimary, marginRight: 6 }}>
                                  {opt.data.itemCode}
                                </span>
                                <span style={{ fontWeight: 500 }}>{opt.data.name}</span>
                              </div>
                              {opt.data.itemType && (
                                <Tag color={getItemTypeTagColor(opt.data.itemType)} style={{ fontSize: 9, margin: 0, flexShrink: 0 }}>
                                  {opt.data.itemType.replace(/_/g, ' ')}
                                </Tag>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                              {hasOptStock && (
                                <Tag color="success" style={{ margin: 0, fontSize: 10, fontWeight: 600 }}>
                                  Stock: {stock} {opt.data.uomCode || ''}
                                </Tag>
                              )}
                              {isOptOut && (
                                <Tag color="error" style={{ margin: 0, fontSize: 10 }}>
                                  Out of Stock (0)
                                </Tag>
                              )}
                            </div>
                          </div>
                        );
                      }}
                    />
                  </div>

                  {/* Stock Metrics Card */}
                  {record.itemId && (
                    <div
                      style={{
                        padding: '8px 10px',
                        background: token.colorFillAlter,
                        borderRadius: 6,
                        marginBottom: 8,
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: token.colorTextSecondary }}>Available in Store:</span>
                        <strong style={{ color: isOut ? token.colorError : token.colorSuccess }}>
                          {avail.toLocaleString()} {record.uomCode || ''} {isOut ? '(Out of Stock)' : ''}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: token.colorTextSecondary }}>Remaining Balance:</span>
                        {isOut ? (
                          <Tag color="error" style={{ margin: 0 }}>❌ Zero Stock</Tag>
                        ) : rem < 0 ? (
                          <Tag color="error" style={{ margin: 0, fontWeight: 600 }}>⚠️ Deficit: {Math.abs(rem)}</Tag>
                        ) : record.minimumStock !== undefined && rem < record.minimumStock ? (
                          <Tag color="warning" style={{ margin: 0 }}>⚠️ {rem} (Below Min)</Tag>
                        ) : (
                          <Tag color="success" style={{ margin: 0, fontWeight: 600 }}>✅ {rem} left</Tag>
                        )}
                      </div>
                      {(record.minimumStock !== undefined || record.maximumStock !== undefined) && (
                        <div style={{ fontSize: '11px', color: token.colorTextTertiary, marginTop: 4 }}>
                          Thresholds: Min {record.minimumStock ?? '—'} | Max {record.maximumStock ?? '—'}
                        </div>
                      )}
                    </div>
                  )}

                  <Row gutter={8} style={{ marginBottom: 8 }}>
                    <Col span={12}>
                      <Typography.Text type="secondary" style={{ fontSize: '11px', display: 'block', marginBottom: 2 }}>
                        Issue Quantity
                      </Typography.Text>
                      <InputNumber
                        min={0.01}
                        step={1}
                        status={isExceeded || isOut ? 'error' : undefined}
                        value={record.quantity}
                        onChange={(v) => updateLine(record.key, { quantity: Number(v || 0) })}
                        style={{ width: '100%' }}
                      />
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary" style={{ fontSize: '11px', display: 'block', marginBottom: 2 }}>
                        UOM
                      </Typography.Text>
                      <Select
                        placeholder="UOM"
                        value={record.uomId}
                        style={{ width: '100%' }}
                        onChange={(v) => updateLine(record.key, { uomId: v })}
                        options={uomOptions.map((u) => ({ value: u.id, label: u.code || u.symbol || u.name }))}
                      />
                    </Col>
                  </Row>

                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: '11px', display: 'block', marginBottom: 2 }}>
                      Reason / Purpose
                    </Typography.Text>
                    <Select
                      placeholder="Select Reason"
                      value={record.remarks}
                      allowClear
                      style={{ width: '100%' }}
                      onChange={(v) => updateLine(record.key, { remarks: v })}
                      options={[
                        { value: 'NORMAL', label: 'Normal Issue' },
                        { value: 'URGENT', label: 'Urgent Maintenance' },
                        { value: 'SPECIAL', label: 'Special Replacement' },
                        { value: 'ROUTINE', label: 'Routine Changeover' },
                      ]}
                    />
                  </div>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        /* DESKTOP TABLE VIEW */
        <Table
          size="middle"
          columns={desktopColumns}
          dataSource={value}
          rowKey="key"
          pagination={false}
          locale={{
            emptyText: !divisionId && !storeId
              ? 'Select a Division or Source Store first to view items.'
              : 'No items added. Click "Add Item Line" to select a part or material.',
          }}
          scroll={{ x: 1100 }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, alignItems: 'center' }}>
        <Typography.Text type="secondary">Total Line Items: </Typography.Text>
        <Typography.Text strong style={{ marginLeft: 6, marginRight: 16 }}>{value.length}</Typography.Text>
        <Typography.Text type="secondary">Total Quantity: </Typography.Text>
        <Typography.Text strong style={{ marginLeft: 6, color: token.colorPrimary, fontSize: '15px' }}>
          {count.toLocaleString()}
        </Typography.Text>
      </div>
    </div>
  );
};

export default StoreLineItemsEditor;
