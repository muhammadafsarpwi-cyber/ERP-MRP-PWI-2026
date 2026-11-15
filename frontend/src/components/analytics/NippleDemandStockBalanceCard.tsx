import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Space, Table, Tag, Button, theme } from 'antd';
import { BuildOutlined, ReloadOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';

export interface NippleDemandStockBalanceCardProps {
  /** Pre-computed rows (used by SalesAnalyticsDashboard). When omitted, fetches live from /sales/analytics/dashboard. */
  dataSource?: any[];
  /** Optional external loading flag when dataSource is provided. */
  loading?: boolean;
  /** Optional top margin override. */
  marginTop?: number;
}

const FALLBACK_STOCK_MAP: Record<string, { code: string; name: string; stockGrs: number; stockPcs: number }> = {
  '125s9': { code: 'FG-NP-005', name: '125-S9 Nipple', stockGrs: 8961, stockPcs: 1290320 },
  rm250: { code: 'FG-NP-004', name: 'RM-250*17 Nipple', stockGrs: 9336, stockPcs: 1344352 },
  '225x17': { code: 'FG-NP-001', name: '225X17 Front Wheel Nipple', stockGrs: 500, stockPcs: 72000 },
  cd250: { code: 'FG-NP-002', name: 'CD-250X17 Nipple', stockGrs: 7000, stockPcs: 1008000 },
  '125300': { code: 'FG-NP-003', name: '125-300X17 Nipple', stockGrs: 15020, stockPcs: 2162880 },
};

/**
 * Shared Nipple Demand & Stock Balance calculation used identically by both
 * Sales Intelligence and Inventory Reports.
 */
export function computeNippleDemandRows(nippleAnalytics: any[], topItems: any[] = []): any[] {
  let rawList: any[] = [];
  if (nippleAnalytics && nippleAnalytics.length > 0) {
    rawList = nippleAnalytics;
  } else {
    const results: Record<string, any> = {};

    Object.entries(FALLBACK_STOCK_MAP).forEach(([key, info]) => {
      results[key] = {
        itemCode: info.code,
        itemName: info.name,
        uom: 'GRS',
        fgStock: info.stockGrs,
        baseQuantity: info.stockPcs,
        baseUom: 'PCS',
        totalDemand: 0,
        totalPackedInSpokes: 0,
        netPendingDemand: 0,
        linkedSpokeSets: [],
      };
    });

    (topItems || []).forEach((item: any) => {
      const name = item.itemName || '';
      if (!name.includes('_')) return;
      const [spokePart, ...rest] = name.split('_');
      const spec = rest.join('_').toLowerCase();

      let matchedKey: string | null = null;
      if (spec.includes('125s9') || spec.includes('125-s9')) matchedKey = '125s9';
      else if (spec.includes('rm250') || spec.includes('rm-250')) matchedKey = 'rm250';
      else if (spec.includes('225x17')) matchedKey = '225x17';
      else if (spec.includes('cd250') || spec.includes('cd-250')) matchedKey = 'cd250';
      else if (spec.includes('125-300') || spec.includes('300x17')) matchedKey = '125300';

      if (matchedKey && results[matchedKey]) {
        const ordQty = Number(item.orderedQuantity) || 0;
        const packedQty = Number(item.finishedGoodsAvailable) || 0;
        const pendingQty = Math.max(0, ordQty - packedQty);

        results[matchedKey].totalDemand += ordQty;
        results[matchedKey].totalPackedInSpokes += packedQty;
        results[matchedKey].netPendingDemand += pendingQty;
        results[matchedKey].linkedSpokeSets.push({
          spokeName: spokePart.trim(),
          orderedQuantity: ordQty,
          packedQuantity: packedQty,
          pendingQuantity: pendingQty,
          uom: item.uom || 'GRS',
        });
      }
    });

    rawList = Object.values(results);
  }

  return rawList
    .map((r: any) => {
      const grossDemand = Number(r.totalDemand ?? 0);
      let packed = Number(r.packedInCartonsFgr ?? r.totalPackedInSpokes ?? 0);

      if (packed === 0 && r.linkedSpokeSets && r.linkedSpokeSets.length > 0) {
        packed = r.linkedSpokeSets.reduce((sum: number, s: any) => {
          if (s.packedQuantity !== undefined) return sum + Number(s.packedQuantity);
          const matchItem = (topItems || []).find((ti: any) => (ti.itemName || '').includes(s.spokeName));
          return sum + Number(matchItem?.finishedGoodsAvailable || 0);
        }, 0);
      }

      const netPending =
        r.netPendingDemand !== undefined && Number(r.netPendingDemand) > 0
          ? Number(r.netPendingDemand)
          : Math.max(0, grossDemand - packed);

      const fgStock = Number(r.currentFgStock ?? r.fgStock ?? 0);

      // Step 1 (Sum Available Stock): Total Available Stock = [Packed in Cartons (FGR)] + [Current FG Stock]
      const totalAvailableStock = Math.round((packed + fgStock) * 100) / 100;

      // Step 2 (Deduct from Pending Demand): Final Balance / Shortage = Net Pending Demand - Total Available Stock
      const finalBalanceShortage = Math.round((netPending - totalAvailableStock) * 100) / 100;
      const netDeficitRequired = Math.max(0, finalBalanceShortage);
      const stockSurplus = Math.max(0, Math.round((totalAvailableStock - netPending) * 100) / 100);

      // Step 3 (Advanced 3-Month Sales Forecasting & Safety Stock Buffer)
      const rolling3MonthVolume = Number(r.rolling3MonthVolume ?? Math.max(grossDemand, fgStock));
      const monthlyAvgConsumption = Number(r.monthlyAvgConsumption ?? Math.round((rolling3MonthVolume / 3) * 100) / 100);
      const trendMinMonthly = Number(r.trendMinMonthly ?? Math.round(monthlyAvgConsumption * 0.85));
      const trendMaxMonthly = Number(r.trendMaxMonthly ?? Math.round(monthlyAvgConsumption * 1.15));
      const threeMonthForecast = Number(
        r.threeMonthForecast ?? Math.round(Math.max(rolling3MonthVolume * 1.1, netPending + monthlyAvgConsumption)),
      );
      const safetyStockBuffer = Number(
        r.safetyStockBuffer ??
          Math.round(Math.max(monthlyAvgConsumption * 0.75, threeMonthForecast * 0.25, rolling3MonthVolume > 0 ? 500 : 0)),
      );
      const recommendedOrderQty = Number(r.recommendedOrderQty ?? Math.round(netDeficitRequired + safetyStockBuffer));

      return {
        ...r,
        totalDemand: grossDemand,
        totalPackedInSpokes: packed,
        packedInCartonsFgr: packed,
        netPendingDemand: netPending,
        fgStock,
        currentFgStock: fgStock,
        totalAvailableStock,
        balance: finalBalanceShortage,
        finalBalanceShortage,
        netDeficitRequired,
        stockSurplus,
        rolling3MonthVolume,
        monthlyAvgConsumption,
        trendMinMonthly,
        trendMaxMonthly,
        threeMonthForecast,
        safetyStockBuffer,
        recommendedOrderQty,
        status: finalBalanceShortage > 0 ? 'SHORTAGE' : finalBalanceShortage === 0 && netPending > 0 ? 'EXACT' : 'SUFFICIENT',
      };
    })
    .filter((r: any) => r.totalDemand > 0 || r.fgStock > 0);
}

export const NippleDemandStockBalanceCard: React.FC<NippleDemandStockBalanceCardProps> = ({
  dataSource,
  loading: externalLoading = false,
  marginTop = 16,
}) => {
  const { token } = theme.useToken();
  const isControlled = dataSource !== undefined;
  const [internalLoading, setInternalLoading] = useState(false);
  const [nippleAnalytics, setNippleAnalytics] = useState<any[]>([]);
  const [topItems, setTopItems] = useState<any[]>([]);

  const fetchLive = useCallback(async () => {
    setInternalLoading(true);
    try {
      const res = await apiService.get<any>('/sales/analytics/dashboard', { period: 'all' });
      const d = res?.data;
      if (d) {
        if (d.itemSection?.topSellingFinishedGoods) setTopItems(d.itemSection.topSellingFinishedGoods);
        if (d.nippleAnalytics || d.itemSection?.nippleAnalytics) {
          setNippleAnalytics(d.nippleAnalytics || d.itemSection?.nippleAnalytics || []);
        }
      }
    } catch {
      // keep existing state on transient error
    } finally {
      setInternalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isControlled) {
      fetchLive();
    }
  }, [isControlled, fetchLive]);

  const computedInternal = useMemo(
    () => (isControlled ? [] : computeNippleDemandRows(nippleAnalytics, topItems)),
    [isControlled, nippleAnalytics, topItems],
  );

  const rows = isControlled ? dataSource : computedInternal;
  const isLoading = isControlled ? externalLoading : internalLoading;

  return (
    <Card
      style={{ marginTop }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Space>
            <BuildOutlined style={{ color: '#0284c7', fontSize: 18 }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: token.colorText }}>
              Nipple Demand &amp; Stock Balance
            </span>
            <Tag color="cyan" style={{ fontWeight: 700, borderRadius: 12 }}>
              All in GRS
            </Tag>
          </Space>
          <Space size={8} wrap>
            <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
              Auto-calculated from Spoke Set Sales Orders &amp; Finished Goods Inventory (Net of Packed Cartons)
            </span>
            {!isControlled && (
              <Button size="small" icon={<ReloadOutlined />} onClick={fetchLive} loading={isLoading}>
                Refresh
              </Button>
            )}
          </Space>
        </div>
      }
    >
      <Table
        size="small"
        loading={isLoading}
        dataSource={rows}
        rowKey="itemCode"
        pagination={false}
        scroll={{ x: 1540 }}
        columns={[
          {
            title: 'Item Name',
            key: 'itemName',
            width: 220,
            render: (_, r: any) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, whiteSpace: 'nowrap' }}>
                <div style={{ fontWeight: 700, color: token.colorText, fontSize: 13 }}>{r.itemName}</div>
                <div>
                  <Tag color="cyan" style={{ fontSize: 10.5, fontWeight: 700, margin: 0, padding: '0.5px 6px', borderRadius: 4, letterSpacing: 0.5 }}>
                    {r.itemCode}
                  </Tag>
                </div>
              </div>
            ),
          },
          {
            title: 'Required in Spoke Sets',
            key: 'linkedSpokeSets',
            width: 320,
            render: (_, r: any) => (
              <Space wrap size={[6, 6]}>
                {r.linkedSpokeSets && r.linkedSpokeSets.length > 0 ? (
                  r.linkedSpokeSets.map((s: any, idx: number) => {
                    const packed = Number(s.packedQuantity || 0);
                    const pending =
                      s.pendingQuantity !== undefined
                        ? Number(s.pendingQuantity)
                        : Math.max(0, Number(s.orderedQuantity) - packed);
                    return (
                      <Tag
                        key={idx}
                        color="purple"
                        style={{ padding: '3px 8px', borderRadius: 6, margin: '2px 0', border: '1px solid rgba(168, 85, 247, 0.3)' }}
                      >
                        <div style={{ fontWeight: 700, color: token.colorText, fontSize: 12 }}>{s.spokeName}</div>
                        <div style={{ fontSize: 11, marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ color: token.colorTextSecondary }}>
                            Order: <strong>{formatDecimal(s.orderedQuantity, 0)}</strong>
                          </span>
                          {packed > 0 && (
                            <span style={{ color: '#0284c7' }}>
                              · Packed: <strong>{formatDecimal(packed, 0)}</strong>
                            </span>
                          )}
                          <span style={{ color: pending > 0 ? '#d97706' : '#16a34a', fontWeight: 600 }}>
                            · Net: <strong>{formatDecimal(pending, 0)} {s.uom || 'GRS'}</strong>
                          </span>
                        </div>
                      </Tag>
                    );
                  })
                ) : (
                  <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>No Active Spoke Orders</span>
                )}
              </Space>
            ),
          },
          {
            title: 'Order Demand (Total / Pending)',
            key: 'orderDemandStacked',
            width: 200,
            render: (_, r: any) => {
              const totalOrd = Number(r.totalDemand || 0);
              const netPending = Number(
                r.netPendingDemand !== undefined
                  ? r.netPendingDemand
                  : Math.max(0, totalOrd - Number(r.totalPackedInSpokes || 0)),
              );
              const uom = r.uom || 'GRS';
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 600 }}>
                      Total Order Demand:
                    </span>
                    <span style={{ fontWeight: 800, fontSize: 13.5, color: '#3b82f6' }}>
                      {formatDecimal(totalOrd, 0)} {uom}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      borderTop: `1px dashed ${token.colorBorderSecondary}`,
                      paddingTop: 5,
                    }}
                  >
                    <span style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 600 }}>
                      Net Pending Demand:
                    </span>
                    <span style={{ fontWeight: 800, fontSize: 13.5, color: '#ef4444' }}>
                      {formatDecimal(netPending, 0)} {uom}
                    </span>
                  </div>
                </div>
              );
            },
          },
          {
            title: 'Available Stock (FGR + FG)',
            key: 'availableStockStacked',
            width: 210,
            render: (_, r: any) => {
              const packedFgr = Number(r.packedInCartonsFgr ?? r.totalPackedInSpokes ?? 0);
              const currentFg = Number(r.currentFgStock ?? r.fgStock ?? 0);
              const totalAvail = Number(r.totalAvailableStock ?? packedFgr + currentFg);
              const uom = r.uom || 'GRS';
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 600 }}>
                      Packed in Cartons (FGR):
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#06b6d4' }}>
                      {formatDecimal(packedFgr, 0)} {uom}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 600 }}>
                      Current FG Stock:
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#22c55e' }}>
                      {formatDecimal(currentFg, 0)} {uom}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      borderTop: '1px solid rgba(56, 189, 248, 0.25)',
                      paddingTop: 5,
                    }}
                  >
                    <span style={{ fontSize: 10.5, color: token.colorTextSecondary, fontWeight: 700 }}>
                      Total Available Stock:
                    </span>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: 13.5,
                        color: token.colorText,
                        textDecoration: 'underline',
                        textUnderlineOffset: 3,
                      }}
                    >
                      {formatDecimal(totalAvail, 0)} {uom}
                    </span>
                  </div>
                </div>
              );
            },
          },
          {
            title: 'Balance / Shortage',
            dataIndex: 'balance',
            key: 'balance',
            width: 240,
            render: (_, r: any) => {
              const packedFgr = Number(r.packedInCartonsFgr ?? r.totalPackedInSpokes ?? 0);
              const currentFg = Number(r.currentFgStock ?? r.fgStock ?? 0);
              const totalAvail = Number(r.totalAvailableStock ?? packedFgr + currentFg);
              const netPending = Number(
                r.netPendingDemand !== undefined
                  ? r.netPendingDemand
                  : Math.max(0, Number(r.totalDemand || 0) - packedFgr),
              );
              const finalShortage = Number(
                r.finalBalanceShortage !== undefined ? r.finalBalanceShortage : netPending - totalAvail,
              );
              const isShortage = finalShortage > 0;
              const uom = r.uom || 'GRS';
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 600 }}>
                      Deficit Status:
                    </span>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: 14,
                        color: isShortage ? '#ef4444' : '#22c55e',
                      }}
                    >
                      {isShortage
                        ? `${formatDecimal(finalShortage, 0)} ${uom} Deficit`
                        : `0 ${uom} Shortage (Sufficient)`}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      borderTop: `1px dashed ${token.colorBorderSecondary}`,
                      paddingTop: 5,
                    }}
                  >
                    <span style={{ fontSize: 10.5, color: token.colorTextSecondary, fontWeight: 600 }}>
                      Output Req:
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: isShortage ? '#ef4444' : '#16a34a',
                        lineHeight: 1.4,
                      }}
                    >
                      {isShortage
                        ? `Output Req: ${formatDecimal(finalShortage, 0)} ${uom} | Pending (${formatDecimal(netPending, 0)}) - Avail (${formatDecimal(totalAvail, 0)})`
                        : `Surplus Stock: +${formatDecimal(Math.abs(finalShortage), 0)} ${uom} | Pending (${formatDecimal(netPending, 0)}) - Avail (${formatDecimal(totalAvail, 0)})`}
                    </span>
                  </div>
                </div>
              );
            },
          },
          {
            title: '3-Month Forecast & Safety Stock',
            key: 'forecastAndSafetyStock',
            width: 210,
            render: (_, r: any) => {
              const uom = r.uom || 'GRS';
              const forecast3M = Number(r.threeMonthForecast || 0);
              const safetyBuffer = Number(r.safetyStockBuffer || 0);
              const recOrder = Number(r.recommendedOrderQty || 0);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 600 }}>
                      3M Sales Forecast:
                    </span>
                    <span style={{ fontWeight: 800, fontSize: 13, color: '#a855f7' }}>
                      {formatDecimal(forecast3M, 0)} {uom}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 600 }}>
                      Safety Stock Buffer:
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 12.5, color: '#f59e0b' }}>
                      {formatDecimal(safetyBuffer, 0)} {uom}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      borderTop: `1px dashed ${token.colorBorderSecondary}`,
                      paddingTop: 5,
                    }}
                  >
                    <span style={{ fontSize: 10.5, color: token.colorTextSecondary, fontWeight: 600 }}>
                      Order Target:
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 12.5, color: '#0284c7' }}>
                      Order Target: {formatDecimal(recOrder, 0)} {uom}
                    </span>
                  </div>
                </div>
              );
            },
          },
          {
            title: 'Status',
            key: 'status',
            align: 'center',
            width: 140,
            render: (_, r: any) => {
              const isShort = Number(r.finalBalanceShortage ?? r.balance ?? 0) > 0;
              return (
                <Tag color={isShort ? 'error' : 'success'} style={{ fontWeight: 700, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                  {isShort ? 'Production Required' : 'Stock Sufficient'}
                </Tag>
              );
            },
          },
        ]}
      />
    </Card>
  );
};

export default NippleDemandStockBalanceCard;
