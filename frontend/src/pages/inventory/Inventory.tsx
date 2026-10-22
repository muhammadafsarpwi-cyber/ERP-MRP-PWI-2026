import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Typography, Card, Row, Col, Statistic, Alert, Button, Empty, Select, Input, Space, Tag } from 'antd';
import {
  InboxOutlined, AlertOutlined, SwapOutlined, BarChartOutlined, ReloadOutlined,
  SearchOutlined, DatabaseOutlined, FilterOutlined, CheckCircleOutlined,
  AppstoreOutlined, HistoryOutlined,
} from '@ant-design/icons';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable, ItemStockLedgerModal } from '../../components/shared';
import { useThemeStore } from '../../theme/themeStore';

const getPcsGrossCarton = (
  quantity: number,
  uomCode?: string,
  itemType?: string,
  itemCode?: string
) => {
  const type = (itemType || '').trim().toUpperCase();
  const codeStr = (itemCode || '').trim().toUpperCase();

  // Gross & Carton packaging strictly applies ONLY to FINISHED_GOOD items.
  // Work-in-Progress (WIP), Semi-Finished, and Raw Materials (RM) do NOT use Gross/Carton.
  if (
    type === 'WORK_IN_PROGRESS' ||
    type === 'WORK_IN_PROCESS' ||
    type === 'SEMI_FINISHED' ||
    type === 'RAW_MATERIAL' ||
    type.includes('WIP') ||
    codeStr.startsWith('WIP-') ||
    codeStr.startsWith('RM-')
  ) {
    return null;
  }

  const code = (uomCode || '').trim().toUpperCase();
  const isPcs = ['PCS', 'PC', 'EA', 'NOS', 'PIECE', 'PIECES', 'BKTS'].includes(code);
  const isGross = ['GRS', 'GR', 'GROSS'].includes(code);
  const isCtn = ['CTN', 'CARTON', 'BOX', 'CS'].includes(code);

  if (!isPcs && !isGross && !isCtn) {
    return null;
  }

  let pcs = 0;
  let gross = 0;
  let ctn = 0;

  const isCS = codeStr.includes('011') || codeStr.includes('012') || codeStr.includes('(CS)') || codeStr.includes(' CS');
  const grossPerCarton = isCS ? 10.555556 : 10;

  if (isPcs) {
    pcs = quantity;
    gross = quantity / 144;
    ctn = Math.round(gross / grossPerCarton);
  } else if (isGross) {
    gross = quantity;
    pcs = quantity * 144;
    ctn = Math.round(gross / grossPerCarton);
  } else if (isCtn) {
    ctn = Math.round(quantity);
    gross = ctn * grossPerCarton;
    pcs = gross * 144;
  }

  return {
    pcs: Math.round(pcs),
    gross: Math.round(gross * 100) / 100,
    ctn: Math.round(ctn), // Cartons are physical whole boxes; never fractional/decimal
  };
};

interface StockBalance {
  id: string;
  item?: {
    id: string;
    name: string;
    itemCode: string;
    itemType?: string;
    uom?: { code: string };
    division?: { name: string };
  };
  warehouse?: { id: string; name: string; warehouseCode?: string; division?: { name: string } };
  onHand: number;
  reserved: number;
  available: number;
  uom?: { id: string; code: string; name: string };
  uomCode?: string;
}

interface WarehouseOption {
  id: string;
  warehouseCode: string;
  name: string;
  division?: { name: string };
}

const Inventory: React.FC = () => {
  const isDark = useThemeStore((state) => state.draft.mode === 'dark');
  const [summary, setSummary] = useState<StockBalance[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ledgerModalItem, setLedgerModalItem] = useState<{
    itemId: string;
    itemCode?: string;
    itemName?: string;
    warehouseId?: string;
    warehouseName?: string;
  } | null>(null);

  // Fetch warehouse list for dropdown
  useEffect(() => {
    apiService.get<{ data: WarehouseOption[] }>('/warehouses', { limit: 100 })
      .then((res: any) => {
        const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
        setWarehouses(list);
      })
      .catch((err) => console.error('Failed to load warehouses list:', err));
  }, []);

  const fetchSummary = useCallback(async (warehouseId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { limit: 1000 };
      if (warehouseId) params.warehouseId = warehouseId;
      const res = await apiService.get<{ data: StockBalance[]; total: number }>('/inventory/balances', params);
      const records = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      
      // Group by itemId and warehouseId so each item appears EXACTLY ONCE per warehouse
      const map = new Map<string, StockBalance>();
      for (const r of records) {
        const itemId = r.item?.id || (r as any).itemId;
        if (!itemId) continue;
        const whId = r.warehouse?.id || (r as any).warehouseId || '';
        const key = `${itemId}_${whId}`;
        if (!map.has(key)) {
          map.set(key, {
            ...r,
            id: key, // Use stable composite key for React rows
            onHand: Number(r.onHand || 0),
            reserved: Number(r.reserved || 0),
            available: Number(r.available || 0),
          });
        } else {
          const existing = map.get(key)!;
          existing.onHand += Number(r.onHand || 0);
          existing.reserved += Number(r.reserved || 0);
          existing.available += Number(r.available || 0);
        }
      }
      const aggregatedRecords = Array.from(map.values());
      aggregatedRecords.sort((a, b) => {
        const codeA = (a.item?.itemCode || (a as any).itemCode || '').trim();
        const codeB = (b.item?.itemCode || (b as any).itemCode || '').trim();
        return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
      });
      setSummary(aggregatedRecords);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to fetch inventory balances';
      setError(Array.isArray(msg) ? msg[0] : String(msg));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary(selectedWarehouse);
  }, [fetchSummary, selectedWarehouse]);

  // Client-side text search filter with natural ascending sort
  const filteredBalances = useMemo(() => {
    let list = summary;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = summary.filter((s) => {
        const code = (s.item?.itemCode || (s as any).itemCode || '').toLowerCase();
        const name = (s.item?.name || (s as any).itemName || '').toLowerCase();
        const whName = (s.warehouse?.name || (s as any).warehouseName || '').toLowerCase();
        const whCode = (s.warehouse?.warehouseCode || '').toLowerCase();
        return code.includes(q) || name.includes(q) || whName.includes(q) || whCode.includes(q);
      });
    }
    return [...list].sort((a, b) => {
      const codeA = (a.item?.itemCode || (a as any).itemCode || '').trim();
      const codeB = (b.item?.itemCode || (b as any).itemCode || '').trim();
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [summary, searchQuery]);

  const negativeDeficits = filteredBalances.filter((s) => Number(s.available || 0) < -0.0001).length;
  const inStockCount = filteredBalances.filter((s) => Number(s.available || 0) > 0.0001).length;
  const zeroStockCount = filteredBalances.filter((s) => Math.abs(Number(s.available || 0)) <= 0.0001).length;

  const totalPieces = useMemo(() => {
    return filteredBalances.reduce((sum, s) => {
      const uom = (s.uom?.code || s.uomCode || s.item?.uom?.code || '').trim().toUpperCase();
      const isPcs = ['PCS', 'PC', 'EA', 'NOS', 'PIECE', 'PIECES', 'BKTS'].includes(uom);
      return isPcs ? sum + Number(s.onHand || 0) : sum;
    }, 0);
  }, [filteredBalances]);

  const totalGross = useMemo(() => {
    return filteredBalances.reduce((sum, s) => {
      const conv = getPcsGrossCarton(
        Number(s.onHand || 0),
        s.uom?.code || s.uomCode || s.item?.uom?.code,
        s.item?.itemType || (s as any).itemType,
        s.item?.itemCode || (s as any).itemCode
      );
      return conv ? sum + conv.gross : sum;
    }, 0);
  }, [filteredBalances]);

  const totalCartons = useMemo(() => {
    return filteredBalances.reduce((sum, s) => {
      const conv = getPcsGrossCarton(
        Number(s.onHand || 0),
        s.uom?.code || s.uomCode || s.item?.uom?.code,
        s.item?.itemType || (s as any).itemType,
        s.item?.itemCode || (s as any).itemCode
      );
      return conv ? sum + conv.ctn : sum;
    }, 0);
  }, [filteredBalances]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>Inventory Management</Typography.Title>
          <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
            Overview of stock balances, low inventory alerts, and warehouse levels
          </span>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => fetchSummary(selectedWarehouse)} loading={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Failed to Load Inventory"
          description={error}
          action={
            <Button size="small" danger onClick={() => fetchSummary(selectedWarehouse)}>
              Retry
            </Button>
          }
          style={{ marginBottom: 24 }}
        />
      )}

      {totalGross > 0 ? (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic title="Total Items in Warehouse" value={filteredBalances.length} prefix={<InboxOutlined />} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Pieces (PCs)"
                value={formatNumber(totalPieces, 0)}
                prefix={<InboxOutlined style={{ color: '#0ea5e9' }} />}
                valueStyle={{ color: '#0ea5e9', fontWeight: 700 }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Gross (GR)"
                value={`${formatNumber(totalGross, totalGross % 1 === 0 ? 0 : 2)} GR`}
                prefix={<AppstoreOutlined style={{ color: '#c084fc' }} />}
                valueStyle={{ color: '#c084fc', fontWeight: 700 }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Cartons (CTN)"
                value={`${formatNumber(Math.round(totalCartons), 0)} CTN`}
                prefix={<CheckCircleOutlined style={{ color: '#38bdf8' }} />}
                valueStyle={{ color: '#38bdf8', fontWeight: 700 }}
              />
            </Card>
          </Col>
        </Row>
      ) : totalPieces > 0 ? (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic title="Total Items in Warehouse" value={filteredBalances.length} prefix={<InboxOutlined />} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Pieces (PCs)"
                value={formatNumber(totalPieces, 0)}
                prefix={<InboxOutlined style={{ color: '#0ea5e9' }} />}
                valueStyle={{ color: '#0ea5e9', fontWeight: 700 }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="In Stock"
                value={inStockCount}
                prefix={<CheckCircleOutlined style={{ color: '#22c55e' }} />}
                valueStyle={{ color: '#22c55e' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Zero Balance"
                value={zeroStockCount}
                prefix={<InboxOutlined style={{ color: 'var(--theme-text-muted)' }} />}
                valueStyle={{ color: 'var(--theme-text-muted)' }}
              />
            </Card>
          </Col>
        </Row>
      ) : (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic title="Total Items in Warehouse" value={filteredBalances.length} prefix={<InboxOutlined />} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="In Stock"
                value={inStockCount}
                prefix={<CheckCircleOutlined style={{ color: '#22c55e' }} />}
                valueStyle={{ color: '#22c55e' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Zero Balance"
                value={zeroStockCount}
                prefix={<InboxOutlined style={{ color: 'var(--theme-text-muted)' }} />}
                valueStyle={{ color: 'var(--theme-text-muted)' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Negative Deficits"
                value={negativeDeficits}
                prefix={<AlertOutlined style={{ color: negativeDeficits > 0 ? '#ef4444' : undefined }} />}
                valueStyle={{ color: negativeDeficits > 0 ? '#ef4444' : undefined }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* ━━━ WAREHOUSE FILTER & SEARCH BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        style={{
          marginBottom: 16,
          padding: '12px 16px',
          background: 'var(--theme-surface, #1e293b)',
          border: '1px solid var(--theme-border, #334155)',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--theme-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatabaseOutlined style={{ color: '#0ea5e9' }} />
            <span>Current Stock Balances</span>
          </h3>
          <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)' }}>
            {selectedWarehouse ? (
              <span>Filtered by Warehouse: <strong>{warehouses.find(w => w.id === selectedWarehouse)?.name || selectedWarehouse}</strong></span>
            ) : (
              <span>Showing all warehouses across division</span>
            )}
            {' · '}{filteredBalances.length} items found
          </span>
        </div>

        <Space size={10} wrap align="center">
          <Select
            placeholder="Select Warehouse"
            allowClear
            style={{ width: 280 }}
            value={selectedWarehouse}
            onChange={(val) => setSelectedWarehouse(val)}
            prefix={<DatabaseOutlined style={{ color: 'var(--theme-text-muted)' }} />}
            options={[
              { label: '🏢 All Warehouses', value: '' },
              ...warehouses.map((w) => ({
                label: `${w.warehouseCode} — ${w.name}${w.division?.name ? ` (${w.division.name})` : ''}`,
                value: w.id,
              })),
            ]}
          />

          <Input
            placeholder="Search item code or name…"
            prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted)' }} />}
            allowClear
            style={{ width: 240 }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {(selectedWarehouse || searchQuery) && (
            <Button
              size="middle"
              onClick={() => {
                setSelectedWarehouse(undefined);
                setSearchQuery('');
              }}
            >
              Reset Filters
            </Button>
          )}

          <Button size="middle" icon={<ReloadOutlined />} onClick={() => fetchSummary(selectedWarehouse)} loading={loading}>
            Reload
          </Button>
        </Space>
      </div>

      <ERPTable
        loading={loading}
        dataSource={filteredBalances}
        rowKey="id"
        pagination={{ pageSize: 25, showSizeChanger: true, showTotal: (t) => `Total ${t} balance records` }}
        onRow={(record) => ({
          onClick: () => {
            const itemId = record.item?.id || (record as any).itemId;
            if (itemId) {
              setLedgerModalItem({
                itemId,
                itemCode: record.item?.itemCode || (record as any).itemCode,
                itemName: record.item?.name || (record as any).itemName,
                warehouseId: record.warehouse?.id || selectedWarehouse,
                warehouseName: record.warehouse?.name,
              });
            }
          },
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={error ? 'Unable to load data' : 'No inventory balances found in database'}
            />
          ),
        }}
        columns={[
          {
            title: (
              <div>
                <div style={{ color: isDark ? '#38bdf8' : '#0284c7', fontSize: 11, fontWeight: 700, letterSpacing: '0.4px' }}>ITEM CODE</div>
                <div style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 10, fontWeight: 600 }}>ITEM NAME</div>
              </div>
            ),
            key: 'itemName',
            width: 340,
            sorter: (a, b) => {
              const codeA = (a.item?.itemCode || (a as any).itemCode || '').trim();
              const codeB = (b.item?.itemCode || (b as any).itemCode || '').trim();
              return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
            },
            defaultSortOrder: 'ascend',
            render: (_, r) => {
              const code = r.item?.itemCode || (r as any).itemCode || '—';
              const name = r.item?.name || (r as any).itemName;
              const itemId = r.item?.id || (r as any).itemId;
              return (
                <div
                  style={{ padding: '4px 0', minWidth: 260 }}
                  onClick={(e) => {
                    if (itemId) {
                      e.stopPropagation();
                      setLedgerModalItem({
                        itemId,
                        itemCode: code,
                        itemName: name,
                        warehouseId: r.warehouse?.id || selectedWarehouse,
                        warehouseName: r.warehouse?.name,
                      });
                    }
                  }}
                  title={itemId ? 'Click to view stock ledger history' : undefined}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: isDark ? '#38bdf8' : '#0284c7',
                        letterSpacing: '0.4px',
                        fontFamily: 'monospace, var(--theme-font-mono, sans-serif)',
                        textDecoration: `underline dotted ${isDark ? 'rgba(56, 189, 248, 0.45)' : 'rgba(2, 132, 199, 0.45)'}`,
                      }}
                    >
                      {code}
                    </span>
                    {itemId && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: isDark ? '#38bdf8' : '#0284c7',
                          background: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.08)',
                          padding: '1px 6px',
                          borderRadius: 4,
                          border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(2, 132, 199, 0.25)'}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <HistoryOutlined style={{ fontSize: 10 }} /> Ledger
                      </span>
                    )}
                  </div>
                  {name && (
                    <div
                      style={{
                        color: isDark ? '#f1f5f9' : '#0f172a',
                        fontSize: 12,
                        fontWeight: 500,
                        marginTop: 4,
                        lineHeight: 1.45,
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                      }}
                    >
                      {name}
                    </div>
                  )}
                </div>
              );
            },
          },
          {
            title: 'Warehouse',
            key: 'warehouseName',
            width: 220,
            render: (_, r) => (
              <div>
                <span style={{ fontWeight: 600, color: 'var(--theme-text, #0f172a)' }}>
                  {r.warehouse?.name || (r as any).warehouseName || '—'}
                </span>
                {r.warehouse?.warehouseCode && (
                  <span style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginTop: 2 }}>
                    {r.warehouse.warehouseCode}
                  </span>
                )}
              </div>
            ),
          },
          {
            title: (
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: isDark ? '#38bdf8' : '#0284c7', fontSize: 11, fontWeight: 700, letterSpacing: '0.4px' }}>
                  ON HAND STOCK
                </div>
                <div style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 10, fontWeight: 600 }}>
                  GROSS · CARTON · PCS
                </div>
              </div>
            ),
            key: 'onHand',
            width: 170,
            align: 'right' as const,
            sorter: (a, b) => Number(a.onHand || 0) - Number(b.onHand || 0),
            render: (_, r) => {
              const num = Number(r.onHand || 0);
              const isNegative = num < -0.0001;
              const isZero = Math.abs(num) <= 0.0001;

              if (isZero) {
                return (
                  <span style={{ color: isDark ? '#64748b' : '#94a3b8', fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                    0
                  </span>
                );
              }

              const conv = getPcsGrossCarton(
                num,
                r.uom?.code || r.uomCode || r.item?.uom?.code,
                r.item?.itemType || (r as any).itemType,
                r.item?.itemCode || (r as any).itemCode
              );

              if (!conv) {
                return (
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      fontVariantNumeric: 'tabular-nums',
                      color: isNegative ? '#ef4444' : (isDark ? '#f8fafc' : '#0f172a'),
                    }}
                  >
                    {isNegative && <span style={{ marginRight: 4 }}>⚠️</span>}
                    {formatNumber(num, 0)} {r.uom?.code || r.uomCode || 'PCS'}
                  </span>
                );
              }

              // 1. Gross -> 2. Carton (Whole Number) -> 3. Pieces (NO BOXES)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, lineHeight: 1.35 }}>
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      color: isNegative ? '#ef4444' : (isDark ? '#c084fc' : '#7e22ce'),
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {isNegative && <span style={{ marginRight: 4 }}>⚠️</span>}
                    {formatNumber(conv.gross, conv.gross % 1 === 0 ? 0 : 2)} GR
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 12,
                      color: isDark ? '#38bdf8' : '#0284c7',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatNumber(conv.ctn, 0)} CTN
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 11,
                      color: isDark ? '#cbd5e1' : '#475569',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatNumber(conv.pcs, 0)} PCS
                  </span>
                </div>
              );
            },
          },
          {
            title: 'Reserved',
            dataIndex: 'reserved',
            key: 'reserved',
            width: 110,
            align: 'right' as const,
            render: (v: unknown) => (
              <span style={{ fontVariantNumeric: 'tabular-nums', color: Number(v) > 0 ? 'var(--theme-warning)' : 'var(--theme-text-muted, #64748b)' }}>
                {formatNumber(v, 0)}
              </span>
            ),
          },
          {
            title: (
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: isDark ? '#4ade80' : '#15803d', fontSize: 11, fontWeight: 700, letterSpacing: '0.4px' }}>
                  AVAILABLE
                </div>
                <div style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 10, fontWeight: 600 }}>
                  GROSS · CARTON · PCS
                </div>
              </div>
            ),
            dataIndex: 'available',
            key: 'available',
            width: 170,
            align: 'right' as const,
            sorter: (a, b) => Number(a.available || 0) - Number(b.available || 0),
            render: (v: unknown, r) => {
              const num = Number(v || 0);
              const isNegative = num < -0.0001;
              const isZero = Math.abs(num) <= 0.0001;

              if (isZero) {
                return (
                  <span style={{ color: isDark ? '#64748b' : '#94a3b8', fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                    0
                  </span>
                );
              }

              const conv = getPcsGrossCarton(
                num,
                r.uom?.code || r.uomCode || r.item?.uom?.code,
                r.item?.itemType || (r as any).itemType,
                r.item?.itemCode || (r as any).itemCode
              );

              if (!conv) {
                return (
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      fontVariantNumeric: 'tabular-nums',
                      color: isNegative ? '#ef4444' : (isDark ? '#4ade80' : '#15803d'),
                    }}
                  >
                    {isNegative && <span style={{ marginRight: 4 }}>⚠️</span>}
                    {formatNumber(num, 0)} {r.uom?.code || r.uomCode || 'PCS'}
                  </span>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, lineHeight: 1.35 }}>
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      color: isNegative ? '#ef4444' : (isDark ? '#c084fc' : '#7e22ce'),
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {isNegative && <span style={{ marginRight: 4 }}>⚠️</span>}
                    {formatNumber(conv.gross, conv.gross % 1 === 0 ? 0 : 2)} GR
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 12,
                      color: isDark ? '#38bdf8' : '#0284c7',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatNumber(conv.ctn, 0)} CTN
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 11,
                      color: isDark ? '#4ade80' : '#15803d',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatNumber(conv.pcs, 0)} PCS
                  </span>
                </div>
              );
            },
          },
          {
            title: 'UOM',
            key: 'uomCode',
            width: 80,
            render: (_, r) => (
              <span style={{ color: 'var(--theme-text-muted)', fontSize: 12 }}>
                {r.uom?.code || r.uomCode || r.item?.uom?.code || '—'}
              </span>
            ),
          },
          {
            title: 'Action',
            key: 'action',
            width: 100,
            align: 'center' as const,
            render: (_, r) => {
              const itemId = r.item?.id || (r as any).itemId;
              return (
                <Button
                  size="small"
                  icon={<HistoryOutlined style={{ color: isDark ? '#38bdf8' : '#0284c7' }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (itemId) {
                      setLedgerModalItem({
                        itemId,
                        itemCode: r.item?.itemCode || (r as any).itemCode,
                        itemName: r.item?.name || (r as any).itemName,
                        warehouseId: r.warehouse?.id || selectedWarehouse,
                        warehouseName: r.warehouse?.name,
                      });
                    }
                  }}
                  style={{
                    background: isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(2, 132, 199, 0.08)',
                    borderColor: isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(2, 132, 199, 0.3)',
                    color: isDark ? '#38bdf8' : '#0284c7',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  Ledger
                </Button>
              );
            },
          },
        ]}
      />

      <ItemStockLedgerModal
        open={Boolean(ledgerModalItem)}
        itemId={ledgerModalItem?.itemId || null}
        itemCode={ledgerModalItem?.itemCode}
        itemName={ledgerModalItem?.itemName}
        warehouseId={ledgerModalItem?.warehouseId}
        warehouseName={ledgerModalItem?.warehouseName}
        onClose={() => setLedgerModalItem(null)}
      />
    </div>
  );
};

export default Inventory;
