import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Modal, Table, Tag, Typography, Row, Col, Card, Spin, Alert, Button, Space, Input, Tooltip, Select } from 'antd';
import {
  InboxOutlined, RollbackOutlined, DatabaseOutlined, HistoryOutlined,
  ReloadOutlined, DownloadOutlined, ArrowUpOutlined, ArrowDownOutlined,
  SearchOutlined, FileTextOutlined, ApartmentOutlined,
  MinusOutlined, FullscreenOutlined, FullscreenExitOutlined, CloseOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { formatApiError } from '../../utils/apiError';
import { useThemeStore } from '../../theme/themeStore';

const { Text } = Typography;

export interface StockLedgerMovement {
  id: string;
  date: string;
  createdAt?: string;
  transactionType: string;
  direction: 'IN' | 'OUT';
  quantity: number;
  inQuantity: number;
  outQuantity: number;
  runningBalance: number;
  referenceType?: string;
  referenceNumber: string;
  notes?: string;
  customerName?: string | null;
  customerCode?: string | null;
  poNumber?: string | null;
  socNumber?: string | null;
  warehouse?: { id: string; name: string; code?: string } | null;
  division?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
}

export interface ItemStockLedgerData {
  item: {
    id: string;
    itemCode: string;
    name: string;
    uomCode: string;
  };
  summary: {
    totalIn: number;
    totalOut: number;
    totalDispatched?: number;
    currentBalance: number;
    totalMovements: number;
  };
  movements: StockLedgerMovement[];
}

interface ItemStockLedgerModalProps {
  open: boolean;
  itemId: string | null;
  itemCode?: string;
  itemName?: string;
  warehouseId?: string;
  warehouseName?: string;
  onClose: () => void;
}

export const ItemStockLedgerModal: React.FC<ItemStockLedgerModalProps> = ({
  open,
  itemId,
  itemCode,
  itemName,
  warehouseId,
  warehouseName,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ItemStockLedgerData | null>(null);
  const [filterText, setFilterText] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | undefined>(warehouseId);

  useEffect(() => {
    setSelectedWarehouseId(warehouseId);
  }, [warehouseId]);

  const isDark = useThemeStore((state) => state.draft.mode === 'dark');

  const themeColors = useMemo(() => ({
    modalBg: isDark ? '#0b1329' : '#ffffff',
    modalBorder: isDark ? 'rgba(56, 189, 248, 0.25)' : '#cbd5e1',
    headerBorder: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
    titleColor: isDark ? '#f8fafc' : '#0f172a',
    subtitleColor: isDark ? '#94a3b8' : '#475569',
    bannerBg: isDark
      ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)'
      : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    bannerBorder: isDark ? 'rgba(56, 189, 248, 0.22)' : '#cbd5e1',
    itemDescColor: isDark ? '#f8fafc' : '#0f172a',
    cardBg: isDark ? '#131d35' : '#ffffff',
    cardBorderIn: isDark ? 'rgba(52, 211, 153, 0.35)' : 'rgba(16, 185, 129, 0.4)',
    cardBorderOut: isDark ? 'rgba(248, 113, 113, 0.35)' : 'rgba(239, 68, 68, 0.4)',
    cardBorderBal: isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.4)',
    cardBorderMov: isDark ? 'rgba(192, 132, 252, 0.35)' : 'rgba(147, 51, 234, 0.4)',
    tableWrapBg: isDark ? '#090e1f' : '#ffffff',
    tableBorder: isDark ? 'rgba(56, 189, 248, 0.18)' : '#e2e8f0',
    thBg: isDark ? '#111c38' : '#f1f5f9',
    thColor: isDark ? '#cbd5e1' : '#0f172a',
    tdBg: isDark ? '#090e1f' : '#ffffff',
    tdBorder: isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0',
    tdHover: isDark ? '#132147' : '#f8fafc',
    searchBg: isDark ? '#131d35' : '#ffffff',
    searchBorder: isDark ? '#334155' : '#cbd5e1',
    searchColor: isDark ? '#f8fafc' : '#0f172a',
    rowTextColor: isDark ? '#f8fafc' : '#0f172a',
    flowSubTextColor: isDark ? '#cbd5e1' : '#1e293b',
    footerBtnBg: isDark ? '#1e293b' : '#f8fafc',
    footerBtnBorder: isDark ? '#334155' : '#cbd5e1',
    footerBtnColor: isDark ? '#e2e8f0' : '#1e293b',
    actionBtnBg: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9',
    actionBtnBorder: isDark ? 'rgba(255, 255, 255, 0.2)' : '#94a3b8',
    actionBtnColor: isDark ? '#f8fafc' : '#0f172a',
    closeBtnBg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
    closeBtnBorder: isDark ? 'rgba(239, 68, 68, 0.35)' : '#fca5a5',
    closeBtnColor: isDark ? '#f87171' : '#dc2626',
  }), [isDark]);

  const fetchLedger = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (selectedWarehouseId) params.warehouseId = selectedWarehouseId;
      
      let res: any;
      try {
        res = await apiService.get<{ success: boolean; data: ItemStockLedgerData }>(
          `/inventory/balances/items/${itemId}/ledger`,
          params,
        );
      } catch {
        res = await apiService.get<{ success: boolean; data: ItemStockLedgerData }>(
          `/inventory/receipts/items/${itemId}/ledger`,
          params,
        );
      }
      setData(res?.data || res);
    } catch (err) {
      setError(formatApiError(err, 'Failed to load item movement history.'));
    } finally {
      setLoading(false);
    }
  }, [itemId, selectedWarehouseId]);

  useEffect(() => {
    if (open && itemId) {
      setFilterText('');
      setIsMinimized(false);
      void fetchLedger();
    } else {
      setData(null);
      setError(null);
      setIsMinimized(false);
    }
  }, [open, itemId, fetchLedger]);

  const activeItemCode = data?.item?.itemCode || itemCode || '';
  const currentUom = (data?.item?.uomCode || 'PCS').toUpperCase();
  const isFgItem = currentUom === 'PCS' || currentUom === 'GRS' || activeItemCode.toUpperCase().startsWith('SPI-FG');

  const formatUnitBreakdown = useCallback((rawQty: number) => {
    if (!isFgItem) return null;
    const isPcs = currentUom === 'PCS';
    let pcs = 0;
    let gross = 0;
    if (isPcs) {
      pcs = rawQty;
      gross = rawQty / 144;
    } else {
      gross = rawQty;
      pcs = rawQty * 144;
    }

    const isCS = activeItemCode.toUpperCase().includes('011') ||
                 activeItemCode.toUpperCase().includes('012') ||
                 activeItemCode.toUpperCase().includes('CS');
    const grossPerCarton = isCS ? 10.555556 : 10;
    const cartons = gross / grossPerCarton;

    const absGross = Math.abs(gross);
    const roundCartons = Math.round(cartons);
    const fmtGrs = absGross % 1 === 0 ? formatNumber(gross, 0) : formatNumber(gross, 2);
    const fmtCtn = formatNumber(roundCartons, 0);
    const fmtPcs = formatNumber(pcs, 0);

    return {
      gross,
      cartons: roundCartons,
      pcs,
      fmtGrs: `${fmtGrs} GRS`,
      fmtCtn: `${fmtCtn} CTN`,
      fmtPcs: `${fmtPcs} PCS`,
    };
  }, [isFgItem, currentUom, activeItemCode]);

  const filteredMovements = useMemo(() => {
    if (!data?.movements) return [];
    if (!filterText.trim()) return data.movements;
    const q = filterText.toLowerCase().trim();
    return data.movements.filter((m) => {
      const type = (m.transactionType || '').toLowerCase();
      const ref = (m.referenceNumber || '').toLowerCase();
      const notes = (m.notes || '').toLowerCase();
      const wh = (m.warehouse?.name || '').toLowerCase();
      const dept = (m.department?.name || '').toLowerCase();
      return type.includes(q) || ref.includes(q) || notes.includes(q) || wh.includes(q) || dept.includes(q);
    });
  }, [data?.movements, filterText]);

  const exportCsv = () => {
    if (!data || !data.movements.length) return;
    const headers = [
      'Date & Time',
      'Transaction Type',
      'Direction',
      'Doc / Reference No',
      'Flow (Where From / Where To)',
      ...(isFgItem ? ['Gross (GRS)', 'Cartons (CTN)', 'Pieces (PCS)'] : []),
      'Received (+ IN)',
      'Issued (- OUT)',
      'Running Balance',
      'UOM',
      'Warehouse',
      'Department',
      'Notes & Remarks',
    ];

    const rows = data.movements.map((m) => {
      const flow = m.direction === 'IN'
        ? `Received from ${m.department?.name || m.referenceNumber || 'Vendor/Receipt'}`
        : `Issued to ${m.department?.name || m.referenceNumber || 'Production/Issue'}`;
      const qtyConv = formatUnitBreakdown(m.quantity);
      return [
        dayjs(m.date).format('YYYY-MM-DD HH:mm:ss'),
        m.transactionType,
        m.direction,
        m.referenceNumber,
        `"${flow.replace(/"/g, '""')}"`,
        ...(isFgItem ? [
          qtyConv ? qtyConv.gross : '',
          qtyConv ? qtyConv.cartons : '',
          qtyConv ? qtyConv.pcs : '',
        ] : []),
        m.inQuantity > 0 ? m.inQuantity : '',
        m.outQuantity > 0 ? m.outQuantity : '',
        m.runningBalance,
        data.item.uomCode,
        m.warehouse?.name || warehouseName || '',
        m.department?.name || '',
        `"${(m.notes || '').replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Ledger_${data.item.itemCode}_${dayjs().format('YYYYMMDD_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getBadgeForType = (type: string, direction: 'IN' | 'OUT') => {
    const isDirIn = direction === 'IN';
    let label = type.replace(/_/g, ' ');
    let color = isDark ? '#38bdf8' : '#0284c7';
    let bg = isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.08)';
    let border = isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(2, 132, 199, 0.25)';

    if (type === 'SALES_DELIVERY' || type.includes('DELIVERY') || type.includes('DISPATCH')) {
      label = 'SALES DISPATCH (OUT)';
      color = isDark ? '#f87171' : '#dc2626';
      bg = isDark ? 'rgba(248, 113, 113, 0.15)' : 'rgba(239, 68, 68, 0.08)';
      border = isDark ? 'rgba(248, 113, 113, 0.35)' : 'rgba(239, 68, 68, 0.25)';
    } else if (type === 'PRODUCTION_REVERSAL') {
      label = isDirIn ? 'REVERSAL (IN)' : 'REVERSAL (OUT)';
      color = isDark ? '#f59e0b' : '#d97706';
      bg = isDark ? 'rgba(245, 158, 11, 0.14)' : 'rgba(217, 119, 6, 0.08)';
      border = isDark ? 'rgba(245, 158, 11, 0.35)' : 'rgba(217, 119, 6, 0.25)';
    } else if (type.includes('RECEIPT') || type === 'PRODUCTION_RECEIPT') {
      label = 'PRODUCTION RECEIPT (IN)';
      color = isDark ? '#34d399' : '#059669';
      bg = isDark ? 'rgba(52, 211, 153, 0.14)' : 'rgba(16, 185, 129, 0.08)';
      border = isDark ? 'rgba(52, 211, 153, 0.35)' : 'rgba(16, 185, 129, 0.25)';
    } else if (type.includes('PRODUCTION_OUTPUT')) {
      label = 'PROD OUTPUT (IN)';
      color = isDark ? '#a78bfa' : '#7c3aed';
      bg = isDark ? 'rgba(167, 139, 250, 0.14)' : 'rgba(124, 58, 237, 0.08)';
      border = isDark ? 'rgba(167, 139, 250, 0.35)' : 'rgba(124, 58, 237, 0.25)';
    } else if (type.includes('PRODUCTION_CONSUMPTION') || type.includes('CONSUMPTION')) {
      label = 'PROD CONSUMPTION (OUT)';
      color = isDark ? '#fb923c' : '#c2410c';
      bg = isDark ? 'rgba(251, 146, 60, 0.14)' : 'rgba(194, 65, 12, 0.08)';
      border = isDark ? 'rgba(251, 146, 60, 0.35)' : 'rgba(194, 65, 12, 0.25)';
    } else if (type.includes('RETURN')) {
      label = 'RETURN (OUT)';
      color = isDark ? '#f87171' : '#dc2626';
      bg = isDark ? 'rgba(248, 113, 113, 0.14)' : 'rgba(220, 38, 38, 0.08)';
      border = isDark ? 'rgba(248, 113, 113, 0.35)' : 'rgba(220, 38, 38, 0.25)';
    } else if (type.includes('TRANSFER')) {
      label = isDirIn ? 'TRANSFER IN' : 'TRANSFER OUT';
      color = isDark ? '#38bdf8' : '#0284c7';
      bg = isDark ? 'rgba(56, 189, 248, 0.14)' : 'rgba(2, 132, 199, 0.08)';
      border = isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.25)';
    } else if (type.includes('ADJUSTMENT')) {
      label = isDirIn ? 'ADJUSTMENT (+)' : 'ADJUSTMENT (-)';
      color = isDark ? '#fbbf24' : '#b45309';
      bg = isDark ? 'rgba(251, 191, 36, 0.14)' : 'rgba(180, 83, 9, 0.08)';
      border = isDark ? 'rgba(251, 191, 36, 0.35)' : 'rgba(180, 83, 9, 0.25)';
    }

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 700,
          color,
          background: bg,
          border: `1px solid ${border}`,
          whiteSpace: 'nowrap',
        }}
      >
        {isDirIn ? <ArrowUpOutlined style={{ fontSize: 10 }} /> : <ArrowDownOutlined style={{ fontSize: 10 }} />}
        <span>{label}</span>
      </span>
    );
  };

  const uom = data?.item?.uomCode || 'UOM';

  const columns: ColumnsType<StockLedgerMovement> = [
    {
      title: '#',
      key: 'idx',
      width: 45,
      align: 'center',
      render: (_: any, __: any, idx: number) => (
        <span style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 12, fontWeight: 600 }}>{idx + 1}</span>
      ),
    },
    {
      title: 'Date & Time',
      dataIndex: 'date',
      key: 'date',
      width: 135,
      render: (v: string, r: StockLedgerMovement) => {
        let d = v ? dayjs(v) : (r.createdAt ? dayjs(r.createdAt) : null);
        if (d && d.hour() === 0 && d.minute() === 0 && r.createdAt) {
          const ct = dayjs(r.createdAt);
          d = d.hour(ct.hour()).minute(ct.minute());
        }
        return (
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontWeight: 700, color: themeColors.rowTextColor, fontSize: 12, whiteSpace: 'nowrap' }}>
              {d ? d.format('DD-MMM-YYYY') : '—'}
            </div>
            <div style={{ fontWeight: 700, color: isDark ? '#38bdf8' : '#0284c7', fontSize: 11, fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
              {d ? d.format('HH:mm') : ''}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Transaction Type & Ref #',
      dataIndex: 'transactionType',
      key: 'transactionType',
      width: 180,
      render: (type: string, r: StockLedgerMovement) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          {getBadgeForType(type, r.direction)}
          {r.referenceNumber && r.referenceNumber !== '-' && (
            <span
              style={{
                fontFamily: 'monospace, var(--theme-font-mono, sans-serif)',
                fontSize: 11,
                fontWeight: 800,
                color: isDark ? '#38bdf8' : '#0284c7',
                background: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.08)',
                padding: '1px 6px',
                borderRadius: 4,
                border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(2, 132, 199, 0.25)'}`,
                display: 'inline-block',
              }}
            >
              {r.referenceNumber}
            </span>
          )}
        </div>
      ),
    },
    {
      title: (
        <div>
          <div style={{ color: isDark ? '#38bdf8' : '#0284c7', fontSize: 11, fontWeight: 700 }}>PO #</div>
          <div style={{ color: isDark ? '#c084fc' : '#7e22ce', fontSize: 10, fontWeight: 600 }}>SOC #</div>
        </div>
      ),
      key: 'orderRef',
      width: 150,
      render: (_, r: StockLedgerMovement) => {
        const soc = r.socNumber || r.notes?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i)?.[1];
        const po = r.poNumber || r.notes?.match(/PO[:\s]+([A-Za-z0-9-]+)/i)?.[1];

        return (
          <div style={{ lineHeight: 1.35 }}>
            {/* 1. PO # (Top / اوپر) */}
            <div style={{ fontSize: 11, fontWeight: 700, color: po ? (isDark ? '#38bdf8' : '#0284c7') : (isDark ? '#64748b' : '#94a3b8'), fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ fontSize: 10, color: themeColors.subtitleColor, marginRight: 4 }}>PO:</span>
              {po || '—'}
            </div>
            {/* 2. SOC # (Bottom / نیچے) */}
            <div style={{ fontSize: 11, fontWeight: 700, color: soc ? (isDark ? '#c084fc' : '#7e22ce') : (isDark ? '#64748b' : '#94a3b8'), fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              <span style={{ fontSize: 10, color: themeColors.subtitleColor, marginRight: 4 }}>SOC:</span>
              {soc || '—'}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Movement Flow (Origin / Destination)',
      key: 'flow',
      width: 250,
      render: (_, r: StockLedgerMovement) => {
        const isSalesDelivery = r.referenceType === 'SALES_DELIVERY' || r.transactionType === 'SALES_DELIVERY';
        const isIncoming = r.direction === 'IN';
        const custName = r.customerName || (r.notes?.match(/to\s+([^(]+)/i)?.[1]?.trim());

        return (
          <div style={{ fontSize: 12, lineHeight: 1.45 }}>
            {isSalesDelivery ? (
              <div>
                <span style={{ color: isDark ? '#f87171' : '#dc2626', fontWeight: 800 }}>
                  🚚 Sales Delivery / Dispatch (OUT)
                </span>
                <div style={{ marginTop: 4 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 800,
                      color: isDark ? '#38bdf8' : '#0369a1',
                      background: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.1)',
                      border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.3)'}`,
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    🏢 Customer: {custName || 'CROWN FIT PAKISTAN'}
                  </span>
                </div>
              </div>
            ) : isIncoming ? (
              <div>
                <span style={{ color: isDark ? '#34d399' : '#059669', fontWeight: 700 }}>
                  ↳ Received (IN)
                </span>
                <span style={{ color: themeColors.flowSubTextColor, marginLeft: 6 }}>
                  {r.referenceType === 'MATERIAL_RECEIPT'
                    ? `Gate Pass / Vendor (${r.referenceNumber})`
                    : r.department?.name || r.notes || 'Inflow'}
                </span>
                {custName && (
                  <div style={{ marginTop: 4 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        color: isDark ? '#38bdf8' : '#0369a1',
                        background: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.08)',
                        border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(2, 132, 199, 0.25)'}`,
                        padding: '1px 6px',
                        borderRadius: 4,
                      }}
                    >
                      🏢 Customer: {custName}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <span style={{ color: isDark ? '#f87171' : '#dc2626', fontWeight: 700 }}>
                  ↱ Issued / Consumed (OUT)
                </span>
                <span style={{ color: themeColors.flowSubTextColor, marginLeft: 6 }}>
                  {r.referenceType === 'PRODUCTION_ENTRY'
                    ? `Production (${r.referenceNumber})`
                    : r.department?.name || r.notes || 'Outflow'}
                </span>
              </div>
            )}
            {r.warehouse?.name && (
              <div style={{ fontSize: 11, color: themeColors.subtitleColor, marginTop: 3 }}>
                📍 {r.warehouse.name}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Received (+ IN)',
      dataIndex: 'inQuantity',
      key: 'inQuantity',
      width: 140,
      align: 'right',
      render: (v: number) => {
        if (!v || v <= 0) return <span style={{ color: isDark ? '#475569' : '#94a3b8' }}>—</span>;
        const conv = formatUnitBreakdown(v);
        if (conv) {
          return (
            <div style={{ textAlign: 'right', lineHeight: 1.25 }}>
              <div style={{ color: isDark ? '#34d399' : '#059669', fontWeight: 800, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                +{conv.fmtGrs}
              </div>
              <div style={{ color: isDark ? '#6ee7b7' : '#047857', fontWeight: 700, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                +{conv.fmtCtn}
              </div>
              <div style={{ color: isDark ? '#94a3b8' : '#0f172a', fontWeight: 600, fontSize: 10, fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                +{conv.fmtPcs}
              </div>
            </div>
          );
        }
        return (
          <span style={{ color: isDark ? '#34d399' : '#059669', fontWeight: 800, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            +{formatNumber(v, 2)}
          </span>
        );
      },
    },
    {
      title: 'Issued (- OUT)',
      dataIndex: 'outQuantity',
      key: 'outQuantity',
      width: 140,
      align: 'right',
      render: (v: number) => {
        if (!v || v <= 0) return <span style={{ color: isDark ? '#475569' : '#94a3b8' }}>—</span>;
        const conv = formatUnitBreakdown(v);
        if (conv) {
          return (
            <div style={{ textAlign: 'right', lineHeight: 1.25 }}>
              <div style={{ color: isDark ? '#f87171' : '#dc2626', fontWeight: 800, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                -{conv.fmtGrs}
              </div>
              <div style={{ color: isDark ? '#fca5a5' : '#b91c1c', fontWeight: 700, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                -{conv.fmtCtn}
              </div>
              <div style={{ color: isDark ? '#94a3b8' : '#0f172a', fontWeight: 600, fontSize: 10, fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                -{conv.fmtPcs}
              </div>
            </div>
          );
        }
        return (
          <span style={{ color: isDark ? '#f87171' : '#dc2626', fontWeight: 800, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            -{formatNumber(v, 2)}
          </span>
        );
      },
    },
    {
      title: 'Running Balance',
      dataIndex: 'runningBalance',
      key: 'runningBalance',
      width: 175,
      align: 'right',
      render: (v: number) => {
        const conv = formatUnitBreakdown(v);
        if (conv) {
          return (
            <div style={{ textAlign: 'right', lineHeight: 1.25 }}>
              <div
                style={{
                  color: isDark ? '#38bdf8' : '#0284c7',
                  fontWeight: 800,
                  fontSize: 12,
                  fontVariantNumeric: 'tabular-nums',
                  background: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.08)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.28)' : 'rgba(2, 132, 199, 0.25)'}`,
                  display: 'inline-block',
                }}
              >
                {conv.fmtGrs} • {conv.fmtCtn}
              </div>
              <div style={{ color: isDark ? '#94a3b8' : '#0f172a', fontWeight: 600, fontSize: 10, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {conv.fmtPcs}
              </div>
            </div>
          );
        }
        return (
          <span
            style={{
              color: isDark ? '#38bdf8' : '#0284c7',
              fontWeight: 800,
              fontSize: 13,
              fontVariantNumeric: 'tabular-nums',
              background: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.08)',
              padding: '3px 8px',
              borderRadius: 4,
              border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.28)' : 'rgba(2, 132, 199, 0.25)'}`,
              display: 'inline-block',
            }}
          >
            {formatNumber(v, 2)} {uom}
          </span>
        );
      },
    },
    {
      title: 'Notes & Remarks',
      dataIndex: 'notes',
      key: 'notes',
      width: 220,
      render: (v?: string) => (
        <span style={{ color: themeColors.subtitleColor, fontSize: 11, wordBreak: 'break-word' }}>
          {v || '—'}
        </span>
      ),
    },
  ];

  return (
    <>
      <Modal
      open={open && !isMinimized}
      closeIcon={null}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 4, paddingBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(2, 132, 199, 0.25)'}`,
                flexShrink: 0,
              }}
            >
              <HistoryOutlined style={{ color: isDark ? '#38bdf8' : '#0284c7', fontSize: 20 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: themeColors.titleColor, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Stock Movement History &amp; Item Ledger
              </div>
              <div style={{ fontSize: 12, color: themeColors.subtitleColor, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Complete chronological audit trail showing where stock came from (+ IN), where it went (- OUT), and live running balances
              </div>
            </div>
          </div>

          {/* Header Action Buttons (Minimize, Maximize, Close) inside header bounds */}
          <div
            className="stock-ledger-modal-controls"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
              marginLeft: 16,
            }}
          >
            <Tooltip title="Minimize to bottom dock">
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="ledger-ctrl-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: themeColors.actionBtnBg,
                  border: `1px solid ${themeColors.actionBtnBorder}`,
                  color: themeColors.actionBtnColor,
                  cursor: 'pointer',
                  fontSize: 13,
                  outline: 'none',
                  padding: 0,
                  transform: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#38bdf8';
                  e.currentTarget.style.borderColor = '#38bdf8';
                  e.currentTarget.style.background = isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = themeColors.actionBtnColor;
                  e.currentTarget.style.borderColor = themeColors.actionBtnBorder;
                  e.currentTarget.style.background = themeColors.actionBtnBg;
                }}
              >
                <MinusOutlined style={{ transform: 'none' }} />
              </button>
            </Tooltip>
            <Tooltip title={isMaximized ? 'Restore standard size' : 'Maximize window'}>
              <button
                type="button"
                onClick={() => setIsMaximized(!isMaximized)}
                className="ledger-ctrl-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: themeColors.actionBtnBg,
                  border: `1px solid ${themeColors.actionBtnBorder}`,
                  color: themeColors.actionBtnColor,
                  cursor: 'pointer',
                  fontSize: 13,
                  outline: 'none',
                  padding: 0,
                  transform: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#38bdf8';
                  e.currentTarget.style.borderColor = '#38bdf8';
                  e.currentTarget.style.background = isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = themeColors.actionBtnColor;
                  e.currentTarget.style.borderColor = themeColors.actionBtnBorder;
                  e.currentTarget.style.background = themeColors.actionBtnBg;
                }}
              >
                {isMaximized ? <FullscreenExitOutlined style={{ transform: 'none' }} /> : <FullscreenOutlined style={{ transform: 'none' }} />}
              </button>
            </Tooltip>
            <Tooltip title="Close">
              <button
                type="button"
                onClick={onClose}
                className="ledger-ctrl-btn ledger-ctrl-close"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: themeColors.closeBtnBg,
                  border: `1px solid ${themeColors.closeBtnBorder}`,
                  color: themeColors.closeBtnColor,
                  cursor: 'pointer',
                  fontSize: 13,
                  outline: 'none',
                  padding: 0,
                  transform: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.background = '#dc2626';
                  e.currentTarget.style.borderColor = '#dc2626';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = themeColors.closeBtnColor;
                  e.currentTarget.style.background = themeColors.closeBtnBg;
                  e.currentTarget.style.borderColor = themeColors.closeBtnBorder;
                }}
              >
                <CloseOutlined style={{ transform: 'none' }} />
              </button>
            </Tooltip>
          </div>
        </div>
      }
      width={isMaximized ? '98vw' : 'min(92vw, 1180px)'}
      footer={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={fetchLedger} loading={loading} style={{ background: themeColors.footerBtnBg, borderColor: themeColors.footerBtnBorder, color: themeColors.footerBtnColor, fontWeight: 600 }}>
          Refresh
        </Button>,
        <Button key="csv" icon={<DownloadOutlined />} onClick={exportCsv} disabled={!data || !data.movements.length} style={{ background: themeColors.footerBtnBg, borderColor: themeColors.footerBtnBorder, color: themeColors.footerBtnColor, fontWeight: 600 }}>
          Export CSV
        </Button>,
        <Button key="close" type="primary" onClick={onClose} style={{ background: '#0284c7', borderColor: '#0ea5e9', fontWeight: 700 }}>
          Close
        </Button>,
      ]}
      onCancel={onClose}
      destroyOnHidden
      style={{
        top: isMaximized ? 10 : 20,
        maxWidth: isMaximized ? '98vw' : 'min(92vw, 1180px)',
        margin: '0 auto',
      }}
      styles={{
        content: {
          background: themeColors.modalBg,
          border: `1px solid ${themeColors.modalBorder}`,
          borderRadius: 12,
          boxShadow: isDark ? '0 25px 60px rgba(0, 0, 0, 0.65)' : '0 20px 45px rgba(0, 0, 0, 0.12)',
        },
        header: {
          background: 'transparent',
          borderBottom: `1px solid ${themeColors.headerBorder}`,
          paddingBottom: 14,
        },
        body: {
          background: 'transparent',
          padding: '16px 0',
        },
        footer: {
          background: 'transparent',
          borderTop: `1px solid ${themeColors.headerBorder}`,
          paddingTop: 12,
        },
      }}
    >
      {/* ━━━ ITEM PROFILE BANNER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        style={{
          background: themeColors.bannerBg,
          border: `1px solid ${themeColors.bannerBorder}`,
          borderRadius: 10,
          padding: '12px 18px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          boxShadow: isDark ? 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' : 'none',
        }}
      >
        <Space size="large" wrap align="center">
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: themeColors.subtitleColor, fontWeight: 700, letterSpacing: '0.5px' }}>
              ITEM CODE
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: isDark ? '#38bdf8' : '#0284c7', fontFamily: 'monospace', marginTop: 2 }}>
              {data?.item?.itemCode || itemCode || '—'}
            </div>
          </div>

          <div style={{ borderLeft: `1px solid ${themeColors.headerBorder}`, paddingLeft: 16 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: themeColors.subtitleColor, fontWeight: 700, letterSpacing: '0.5px' }}>
              ITEM DESCRIPTION
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: themeColors.itemDescColor, marginTop: 2 }}>
              {data?.item?.name || itemName || '—'}
            </div>
          </div>
        </Space>

        <Space size="middle" wrap>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              background: isDark ? 'rgba(192, 132, 252, 0.15)' : 'rgba(147, 51, 234, 0.1)',
              border: `1px solid ${isDark ? 'rgba(192, 132, 252, 0.3)' : 'rgba(147, 51, 234, 0.25)'}`,
              color: isDark ? '#c084fc' : '#7e22ce',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Unit: {uom}
          </span>
          <Space size="small" align="center">
            <span style={{ fontSize: 11, fontWeight: 700, color: themeColors.subtitleColor }}>Warehouse:</span>
            <Select
              size="small"
              value={selectedWarehouseId || ''}
              onChange={(val) => setSelectedWarehouseId(val || undefined)}
              style={{ minWidth: 230 }}
              options={[
                { value: '', label: '🌐 All Warehouses' },
                { value: '2f6aabde-69c1-4068-a0ea-b0fe1b8fb0b5', label: '📍 SPI FG Dispatch Warehouse' },
                { value: 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d', label: '📍 SPI Nipple Packing Warehouse' },
                { value: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', label: '📍 SPL Spoke Plating Dept' },
              ]}
            />
          </Space>
        </Space>
      </div>

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 14, color: isDark ? '#94a3b8' : '#64748b', fontSize: 13, fontWeight: 600 }}>
            Retrieving real-time stock ledger movements from database…
          </div>
        </div>
      ) : error ? (
        <Alert
          type="error"
          showIcon
          message="Failed to Load Ledger History"
          description={error}
          action={
            <Button size="small" danger onClick={fetchLedger}>
              Retry
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      ) : (
        <>
          {/* ━━━ EXECUTIVE METRIC CARDS ━━━━━━━━━━━━━━━━━━━━━━━ */}
          {(() => {
            const inConv = formatUnitBreakdown(data?.summary.totalIn || 0);
            const outConv = formatUnitBreakdown(data?.summary.totalOut || 0);
            const balConv = formatUnitBreakdown(data?.summary.currentBalance || 0);

            return (
              <Row gutter={[14, 14]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={6}>
                  <div
                    style={{
                      background: themeColors.cardBg,
                      border: `1px solid ${themeColors.cardBorderIn}`,
                      borderRadius: 8,
                      padding: '12px 16px',
                      boxShadow: isDark ? '0 4px 14px rgba(16, 185, 129, 0.1)' : '0 2px 8px rgba(0, 0, 0, 0.04)',
                      minHeight: 96,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', color: themeColors.subtitleColor, fontWeight: 700 }}>
                        Total Received (+ IN)
                      </div>
                      {inConv ? (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: isDark ? '#34d399' : '#059669', lineHeight: 1.2 }}>
                            +{inConv.fmtGrs}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#6ee7b7' : '#047857', marginTop: 2 }}>
                            +{inConv.fmtCtn}
                          </div>
                          <div style={{ fontSize: 11, color: isDark ? '#cbd5e1' : '#0f172a', fontWeight: 600, marginTop: 2 }}>
                            (+{inConv.fmtPcs})
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 19, fontWeight: 800, color: isDark ? '#34d399' : '#059669', marginTop: 4 }}>
                          +{formatNumber(data?.summary.totalIn || 0, 2)}
                          <span style={{ fontSize: 12, color: isDark ? '#6ee7b7' : '#047857', marginLeft: 4 }}>{uom}</span>
                        </div>
                      )}
                    </div>
                    <InboxOutlined style={{ fontSize: 28, color: isDark ? '#34d399' : '#059669', opacity: 0.85 }} />
                  </div>
                </Col>

                <Col xs={24} sm={6}>
                  <div
                    style={{
                      background: themeColors.cardBg,
                      border: `1px solid ${themeColors.cardBorderOut}`,
                      borderRadius: 8,
                      padding: '12px 16px',
                      boxShadow: isDark ? '0 4px 14px rgba(239, 68, 68, 0.1)' : '0 2px 8px rgba(0, 0, 0, 0.04)',
                      minHeight: 96,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', color: themeColors.subtitleColor, fontWeight: 700 }}>
                        Total Issued / Dispatched (- OUT)
                      </div>
                      {outConv ? (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: isDark ? '#f87171' : '#dc2626', lineHeight: 1.2 }}>
                            -{outConv.fmtGrs}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#fca5a5' : '#b91c1c', marginTop: 2 }}>
                            -{outConv.fmtCtn}
                          </div>
                          <div style={{ fontSize: 11, color: isDark ? '#cbd5e1' : '#0f172a', fontWeight: 600, marginTop: 2 }}>
                            (-{outConv.fmtPcs})
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 19, fontWeight: 800, color: isDark ? '#f87171' : '#dc2626', marginTop: 4 }}>
                          -{formatNumber(data?.summary.totalOut || 0, 2)}
                          <span style={{ fontSize: 12, color: isDark ? '#fca5a5' : '#b91c1c', marginLeft: 4 }}>{uom}</span>
                        </div>
                      )}
                    </div>
                    <RollbackOutlined style={{ fontSize: 28, color: isDark ? '#f87171' : '#dc2626', opacity: 0.85 }} />
                  </div>
                </Col>

                <Col xs={24} sm={6}>
                  <div
                    style={{
                      background: themeColors.cardBg,
                      border: `1px solid ${themeColors.cardBorderBal}`,
                      borderRadius: 8,
                      padding: '12px 16px',
                      boxShadow: isDark ? '0 4px 14px rgba(56, 189, 248, 0.12)' : '0 2px 8px rgba(0, 0, 0, 0.04)',
                      minHeight: 96,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', color: themeColors.subtitleColor, fontWeight: 700 }}>
                        Current Balance
                      </div>
                      {balConv ? (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: isDark ? '#38bdf8' : '#0284c7', lineHeight: 1.2 }}>
                            ={balConv.fmtGrs}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#7dd3fc' : '#0369a1', marginTop: 2 }}>
                            +{balConv.fmtCtn}
                          </div>
                          <div style={{ fontSize: 11, color: isDark ? '#cbd5e1' : '#0f172a', fontWeight: 600, marginTop: 2 }}>
                            (={balConv.fmtPcs})
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 19, fontWeight: 800, color: isDark ? '#38bdf8' : '#0284c7', marginTop: 4 }}>
                          ={formatNumber(data?.summary.currentBalance || 0, 2)}
                          <span style={{ fontSize: 12, color: isDark ? '#7dd3fc' : '#0369a1', marginLeft: 4 }}>{uom}</span>
                        </div>
                      )}
                    </div>
                    <DatabaseOutlined style={{ fontSize: 28, color: isDark ? '#38bdf8' : '#0284c7', opacity: 0.85 }} />
                  </div>
                </Col>

                <Col xs={24} sm={6}>
                  <div
                    style={{
                      background: themeColors.cardBg,
                      border: `1px solid ${themeColors.cardBorderMov}`,
                      borderRadius: 8,
                      padding: '12px 16px',
                      boxShadow: isDark ? '0 4px 14px rgba(192, 132, 252, 0.1)' : '0 2px 8px rgba(0, 0, 0, 0.04)',
                      minHeight: 96,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', color: themeColors.subtitleColor, fontWeight: 700 }}>
                        Total Movements
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: isDark ? '#c084fc' : '#7e22ce', marginTop: 4 }}>
                        {data?.summary.totalMovements || 0} <span style={{ fontSize: 12, color: themeColors.subtitleColor }}>entries</span>
                      </div>
                    </div>
                    <ApartmentOutlined style={{ fontSize: 28, color: isDark ? '#c084fc' : '#7e22ce', opacity: 0.85 }} />
                  </div>
                </Col>
              </Row>
            );
          })()}

          {/* ━━━ FILTER SEARCH BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Input
              placeholder="Search movements by doc #, type, flow, or notes…"
              prefix={<SearchOutlined style={{ color: themeColors.subtitleColor }} />}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              allowClear
              style={{
                width: 380,
                background: themeColors.searchBg,
                borderColor: themeColors.searchBorder,
                color: themeColors.searchColor,
              }}
            />
            <span style={{ fontSize: 12, color: themeColors.subtitleColor }}>
              Showing {filteredMovements.length} of {data?.movements.length || 0} transactions
            </span>
          </div>

          {/* ━━━ MOVEMENTS TABLE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div
            style={{
              background: themeColors.tableWrapBg,
              border: `1px solid ${themeColors.tableBorder}`,
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <style>{`
              .stock-ledger-modal-controls button,
              .stock-ledger-modal-controls span,
              .stock-ledger-modal-controls .anticon,
              .ledger-ctrl-btn,
              .ledger-ctrl-btn:hover {
                transform: none !important;
                animation: none !important;
                box-shadow: none !important;
              }
              .ledger-ctrl-btn .anticon,
              .ledger-ctrl-btn:hover .anticon {
                transform: none !important;
                animation: none !important;
              }
              .ledger-table-theme .ant-table {
                background: ${themeColors.tdBg} !important;
                color: ${themeColors.rowTextColor} !important;
              }
              .ledger-table-theme .ant-table-container {
                background: ${themeColors.tdBg} !important;
              }
              .ledger-table-theme .ant-table-thead > tr > th {
                background: ${themeColors.thBg} !important;
                color: ${themeColors.thColor} !important;
                border-bottom: 1px solid ${themeColors.tdBorder} !important;
                font-weight: 700 !important;
              }
              .ledger-table-theme .ant-table-tbody > tr > td {
                background: ${themeColors.tdBg} !important;
                color: ${themeColors.rowTextColor} !important;
                border-bottom: 1px solid ${themeColors.tdBorder} !important;
              }
              .ledger-table-theme .ant-table-tbody > tr:hover > td {
                background: ${themeColors.tdHover} !important;
              }
              .ledger-table-theme .ant-table-placeholder .ant-table-cell {
                background: ${themeColors.tdBg} !important;
              }
              .ledger-table-theme .ant-pagination,
              .ledger-table-theme .ant-pagination-item,
              .ledger-table-theme .ant-pagination-prev,
              .ledger-table-theme .ant-pagination-next {
                color: ${themeColors.rowTextColor} !important;
              }
              .ledger-table-theme .ant-pagination-item {
                background: ${themeColors.footerBtnBg} !important;
                border-color: ${themeColors.footerBtnBorder} !important;
              }
              .ledger-table-theme .ant-pagination-item a {
                color: ${themeColors.rowTextColor} !important;
              }
              .ledger-table-theme .ant-pagination-item-active {
                background: #0284c7 !important;
                border-color: #0ea5e9 !important;
              }
              .ledger-table-theme .ant-pagination-item-active a {
                color: #ffffff !important;
              }
              /* Prominent, smooth horizontal & vertical scrollbars */
              .ledger-table-theme .ant-table-body::-webkit-scrollbar,
              .ledger-table-theme .ant-table-content::-webkit-scrollbar {
                height: 11px !important;
                width: 9px !important;
              }
              .ledger-table-theme .ant-table-body::-webkit-scrollbar-track,
              .ledger-table-theme .ant-table-content::-webkit-scrollbar-track {
                background: ${isDark ? 'rgba(15, 23, 42, 0.7)' : '#e2e8f0'} !important;
                border-radius: 6px !important;
              }
              .ledger-table-theme .ant-table-body::-webkit-scrollbar-thumb,
              .ledger-table-theme .ant-table-content::-webkit-scrollbar-thumb {
                background: ${isDark ? '#38bdf8' : '#0284c7'} !important;
                border-radius: 6px !important;
              }
              .ledger-table-theme .ant-table-body::-webkit-scrollbar-thumb:hover,
              .ledger-table-theme .ant-table-content::-webkit-scrollbar-thumb:hover {
                background: ${isDark ? '#0ea5e9' : '#0369a1'} !important;
              }
            `}</style>
            <Table
              className="ledger-table-theme"
              dataSource={filteredMovements}
              columns={columns}
              rowKey="id"
              size="small"
              tableLayout="fixed"
              pagination={{
                pageSize: 15,
                showSizeChanger: true,
                pageSizeOptions: ['15', '30', '50', '100'],
                showTotal: (total, range) => (
                  <span style={{ color: themeColors.subtitleColor, fontSize: 12 }}>
                    Showing {range[0]}–{range[1]} of {total} ledger entries
                  </span>
                ),
              }}
              locale={{ emptyText: <span style={{ color: themeColors.subtitleColor }}>No stock movements found matching filter.</span> }}
              scroll={{ x: 1440, y: isMaximized ? 'calc(85vh - 350px)' : 380 }}
            />
          </div>
        </>
      )}
    </Modal>

    {/* ━━━ FLOATING MINIMIZED DOCK PILL (BOTTOM-RIGHT) ━━━━━━━━━━━━━━━━━━━━ */}
    {open && isMinimized && (
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 28,
          zIndex: 99999,
          background: isDark
            ? 'linear-gradient(135deg, #090e1f 0%, #172554 100%)'
            : 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
          border: isDark ? '1.5px solid #38bdf8' : '1.5px solid #0284c7',
          borderRadius: 12,
          boxShadow: isDark
            ? '0 12px 32px rgba(0, 0, 0, 0.65), 0 0 16px rgba(56, 189, 248, 0.35)'
            : '0 12px 32px rgba(0, 0, 0, 0.15), 0 0 16px rgba(2, 132, 199, 0.2)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          cursor: 'pointer',
          animation: 'fadeIn 0.25s ease-in-out',
        }}
        onClick={() => setIsMinimized(false)}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: isDark ? 'rgba(56, 189, 248, 0.2)' : 'rgba(2, 132, 199, 0.12)',
            border: isDark ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(2, 132, 199, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <HistoryOutlined style={{ color: isDark ? '#38bdf8' : '#0284c7', fontSize: 16 }} />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: isDark ? '#38bdf8' : '#0284c7', letterSpacing: '-0.01em' }}>
            Stock Ledger: {data?.item?.itemCode || itemCode || 'Item'}
          </div>
          <div style={{ fontSize: 11, color: themeColors.subtitleColor }}>
            Click to restore window
          </div>
        </div>
        <Space onClick={(e) => e.stopPropagation()} style={{ marginLeft: 6 }}>
          <Button
            size="small"
            type="primary"
            icon={<FullscreenOutlined />}
            onClick={() => setIsMinimized(false)}
            style={{ background: '#0284c7', borderColor: '#0ea5e9', fontWeight: 600, fontSize: 11 }}
          >
            Restore
          </Button>
          <Button
            size="small"
            danger
            icon={<CloseOutlined />}
            onClick={onClose}
            style={{ fontSize: 11 }}
          />
        </Space>
      </div>
    )}
    </>
  );
};

export default ItemStockLedgerModal;
