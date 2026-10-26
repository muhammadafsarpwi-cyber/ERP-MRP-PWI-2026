import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Space } from 'antd';
import {
  ApartmentOutlined,
  AimOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  FieldTimeOutlined,
  CarryOutOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { formatNumber } from '../../utils/numberFormat';
import type { ProductionSummary } from '../../services/dashboardService';
import '../../pages/production/productionDashboard.css';

interface DepartmentPerformanceProps {
  data: ProductionSummary | null;
  loading: boolean;
  nav?: (path: string, state?: any) => void;
  divisionId?: string;
  divisionCode?: string;
}

interface ScorecardDeptRow {
  id: string;
  name: string;
  divisionId?: string | null;
  reportingUom: string;
  secondaryUom: string;
  enableConversionBridge: boolean;
  avgWeightPerMeter: number;
  avgWeightPerPiece: number;
  target: number;
  actual: number;
  scrapKg: number;
  scrapPct: number;
  runningHours: number;
  downHours: number;
  totalHours: number;
  runningPct: number;
  downPct: number;
  otHours: number;
  eff: number;
}

const CANONICAL_SPOKE_DEPARTMENTS = [
  { name: 'Raw Material (RM)', id: 'f8312f0c-ba1e-401a-80cd-43d6b5cc8c05' },
  { name: 'Straightener', id: 'd3000000-0000-0000-0000-000000000001' },
  { name: 'Swagging', id: 'd3000000-0000-0000-0000-000000000002' },
  { name: 'Spoke', id: 'd3000000-0000-0000-0000-000000000003' },
  { name: 'Spoke Plating', id: 'd3000000-0000-0000-0000-000000000006' },
  { name: 'Spoke Packing', id: 'd3000000-0000-0000-0000-000000000008' },
  { name: 'Nipple Packing', id: 'fd474329-e796-4343-831b-f95a9add41f0' },
];

const SPOKE_DIV_ID = 'd1000000-0000-0000-0000-000000000001';

/**
 * Dynamic Multi-Unit Conversion Engine
 * Resolves Primary and Sub-values strictly based on the Department Master registry
 * and Item Master weight properties.
 */
function resolveDynamicUnits(
  qty: number,
  reportingUom: string,
  secondaryUom: string,
  enableConversionBridge: boolean,
  weightPerMeter: number,
  weightPerPiece: number,
): { primaryText: string; primaryBadge: string; secondaryText: string | null } {
  const rep = (reportingUom || 'PCS').toUpperCase();
  const sec = (secondaryUom || 'NONE').toUpperCase();
  const wMeter = Number(weightPerMeter) > 0 ? Number(weightPerMeter) : 0.035;
  const wPiece = Number(weightPerPiece) > 0 ? Number(weightPerPiece) : 0.008;

  // 1. Spoke Division Standard Macro: reporting_uom = 'GRS' & secondary_uom = 'PCS'
  if (rep === 'GRS' && sec === 'PCS') {
    const grossVal = Math.round(qty / 144);
    return {
      primaryText: formatNumber(grossVal, 0),
      primaryBadge: 'GRS',
      secondaryText: `${formatNumber(qty, 0)} PCS`,
    };
  }

  // 2. Continuous Wire / Strip Macro: reporting_uom = 'KG' & secondary_uom = 'METER'
  // Case 1: Flattening / Raw Material Departments (primary_uom = 'KG')
  if (rep === 'KG' && sec === 'METER') {
    const kgVal = Math.round(qty * 10) / 10;
    const meterVal = wMeter > 0 ? Math.round(kgVal / wMeter) : 0;
    return {
      primaryText: formatNumber(kgVal, 1),
      primaryBadge: 'KG',
      secondaryText: `${formatNumber(meterVal, 0)} MTR`,
    };
  }

  // 3. Extrusion / Cable Macro: reporting_uom = 'METER' & secondary_uom = 'KG'
  if (rep === 'METER' && sec === 'KG') {
    const meterVal = qty;
    const kgVal = Math.round(meterVal * wMeter * 10) / 10;
    return {
      primaryText: formatNumber(meterVal, 0),
      primaryBadge: 'MTR',
      secondaryText: `${formatNumber(kgVal, 1)} KG`,
    };
  }

  // 4. Heavy / Chemical / Plating Profile: reporting_uom = 'KG' & secondary_uom = 'NONE'
  if (rep === 'KG') {
    const kgVal = Math.round(qty * 10) / 10;
    return {
      primaryText: formatNumber(kgVal, 1),
      primaryBadge: 'KG',
      secondaryText: null,
    };
  }

  // 5. Piece / Unit Profile: reporting_uom = 'PCS' & secondary_uom = 'NONE'
  if (rep === 'PCS') {
    return {
      primaryText: formatNumber(qty, 0),
      primaryBadge: 'PCS',
      secondaryText: null,
    };
  }

  // Fallback: Generic dynamic display
  return {
    primaryText: formatNumber(qty, 0),
    primaryBadge: rep,
    secondaryText: sec !== 'NONE' ? `${formatNumber(qty, 0)} ${sec}` : null,
  };
}

const DepartmentPerformance: React.FC<DepartmentPerformanceProps> = ({
  data,
  loading: _loading,
  nav,
  divisionId,
  divisionCode,
}) => {
  const defaultNavigate = useNavigate();
  const doNavigate = nav ?? defaultNavigate;

  const deptMatrix = useMemo<ScorecardDeptRow[]>(() => {
    const rawDepts = data?.departments ?? [];

    const mapRow = (d: any): ScorecardDeptRow => {
      const name = d.departmentName || d.name || 'Unknown';
      const nameLower = name.toLowerCase();
      let reportingUom = d.reportingUom || 'PCS';
      let secondaryUom = d.secondaryUom || 'NONE';
      if (nameLower.includes('plat') && (nameLower.includes('spoke') || !nameLower.includes('nipple'))) {
        reportingUom = 'GRS';
        secondaryUom = 'PCS';
      } else if (nameLower.includes('raw material') || nameLower.includes('rm') || nameLower.includes('spi stores')) {
        reportingUom = 'KG';
        secondaryUom = 'NONE';
      }
      const enableConversionBridge = Boolean(d.enableConversionBridge);
      const avgWeightPerMeter = Number(d.avgWeightPerMeter) || 0.035;
      const avgWeightPerPiece = Number(d.avgWeightPerPiece) || 0.008;

      const target = Number(d.targetQuantity || 0);
      const actual = Number(d.actualQuantity || 0);
      const scrapKg = Math.round(Number(d.scrapQuantity || 0) * 10) / 10;

      // Output weight in KG for scrap calculation
      const outputKg =
        reportingUom.toUpperCase() === 'KG'
          ? (actual > 1000 && enableConversionBridge ? Math.round(actual * avgWeightPerPiece * 10) / 10 : actual)
          : Math.round(actual * avgWeightPerPiece * 10) / 10;
      const scrapPct = outputKg > 0 ? Math.round((scrapKg / outputKg) * 10000) / 100 : 0.0;

      const runningHours = Math.round(Number(d.runningHours || 0) * 10) / 10;
      const downHours = Math.round(Number(d.downtimeHours || 0) * 10) / 10;
      const totalHours = Math.round((runningHours + downHours) * 10) / 10;
      const runningPct = totalHours > 0 ? Math.round((runningHours / totalHours) * 1000) / 10 : 0.0;
      const downPct = totalHours > 0 ? Math.round((downHours / totalHours) * 1000) / 10 : 0.0;
      const otHours = Math.round(Number(d.overtimeHours || 0) * 10) / 10;
      const eff = target > 0 ? Math.round((actual / target) * 1000) / 10 : 0.0;

      return {
        id: d.departmentId || d.id,
        name,
        divisionId: d.divisionId,
        reportingUom,
        secondaryUom,
        enableConversionBridge,
        avgWeightPerMeter,
        avgWeightPerPiece,
        target,
        actual,
        scrapKg,
        scrapPct,
        runningHours,
        downHours,
        totalHours,
        runningPct,
        downPct,
        otHours,
        eff,
      };
    };

    const isSpokeDivision =
      divisionId === SPOKE_DIV_ID ||
      divisionCode === 'DIV-SPD' ||
      (divisionCode && divisionCode.toUpperCase().includes('SPD'));

    if (isSpokeDivision) {
      // STRICT ALLOCATION: Render ONLY the canonical Spoke Division stages in strict manufacturing order
      const resultRows: ScorecardDeptRow[] = [];

      for (const c of CANONICAL_SPOKE_DEPARTMENTS) {
        const cLower = c.name.toLowerCase();
        const match = rawDepts.find((d) => {
          const dName = (d.departmentName || '').trim().toLowerCase();
          if (d.departmentId === c.id) return true;
          if (dName === cLower) return true;
          if (cLower.includes('raw') && (dName.includes('raw') || dName.includes('rm') || dName.includes('spi stores') || d.departmentId === 'f8312f0c-ba1e-401a-80cd-43d6b5cc8c05')) return true;
          if (cLower === 'swagging' && (dName === 'swaging' || dName.includes('swag'))) return true;
          if (cLower === 'nipple packing' && dName.includes('nipple pack')) return true;
          if (cLower === 'spoke packing' && (dName.includes('spoke pack') || dName === 'packing' || dName === 'hand packing')) return true;
          return false;
        });

        if (match) {
          resultRows.push(mapRow(match));
        } else {
          resultRows.push(
            mapRow({
              departmentId: c.id,
              departmentName: c.name,
              divisionId: SPOKE_DIV_ID,
              reportingUom: c.name.toLowerCase().includes('raw') ? 'KG' : 'GRS',
              secondaryUom: c.name.toLowerCase().includes('raw') ? 'NONE' : 'PCS',
              enableConversionBridge: true,
              targetQuantity: 0,
              actualQuantity: 0,
              scrapQuantity: 0,
              runningHours: 0,
              downtimeHours: 0,
              achievementPercentage: 0,
            }),
          );
        }
      }

      // Hide all unmapped department rows instantly!
      return resultRows;
    }

    if (divisionId) {
      // Specific other division (e.g., CCD): Strictly filter where division_id matches
      const filtered = rawDepts.filter((d) => d.divisionId === divisionId);
      return filtered.map(mapRow);
    }

    // All Divisions: Show canonical Spoke operations first, then append other active divisions
    const resultRows: ScorecardDeptRow[] = [];
    for (const c of CANONICAL_SPOKE_DEPARTMENTS) {
      const cLower = c.name.toLowerCase();
      const match = rawDepts.find((d) => {
        const dName = (d.departmentName || '').trim().toLowerCase();
        return d.departmentId === c.id || dName === cLower || (cLower === 'swagging' && dName.includes('swag'));
      });
      if (match) resultRows.push(mapRow(match));
    }
    for (const d of rawDepts) {
      const dName = (d.departmentName || '').trim().toLowerCase();
      const alreadyIn = resultRows.some((r) => r.id === d.departmentId || r.name.toLowerCase() === dName);
      if (!alreadyIn) {
        resultRows.push(mapRow(d));
      }
    }
    return resultRows;
  }, [data, divisionId, divisionCode]);

  return (
    <div className="pwi-panel" style={{ margin: 0, border: '1px solid var(--theme-border)', borderRadius: 6, background: 'var(--theme-surface)' }}>
      <div className="pwi-panel__header" style={{ padding: '12px 16px', borderBottom: '1px solid var(--theme-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span className="pwi-panel__title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--theme-text)' }}>
          <ApartmentOutlined style={{ color: '#0ea5e9', fontSize: 16 }} />
          <span>Department Operations Scorecard &amp; Drill-Down Matrix</span>
        </span>
        <span className="pwi-panel__subtitle" style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', fontWeight: 500 }}>
          Click any action badge to jump directly into filtered department records
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="pwi-scorecard-table">
          <thead>
            <tr>
              <th>
                <ApartmentOutlined className="th-icon" style={{ color: 'var(--theme-primary, #0ea5e9)' }} /> Department
              </th>
              <th style={{ textAlign: 'right' }}>
                <AimOutlined className="th-icon" style={{ color: '#0ea5e9' }} /> Target Quantity
              </th>
              <th style={{ textAlign: 'right' }}>
                <CheckCircleOutlined className="th-icon" style={{ color: '#10b981' }} /> Good Production
              </th>
              <th style={{ textAlign: 'right' }}>
                <ThunderboltOutlined className="th-icon" style={{ color: '#3b82f6' }} /> Plant Efficiency (OEE)
              </th>
              <th style={{ textAlign: 'right' }}>
                <DeleteOutlined className="th-icon" style={{ color: '#ef4444' }} /> Scrap (KG / %)
              </th>
              <th style={{ textAlign: 'right' }}>
                <ClockCircleOutlined className="th-icon" style={{ color: '#f59e0b' }} /> Plant Time (Running vs Down)
              </th>
              <th style={{ textAlign: 'right' }}>
                <FieldTimeOutlined className="th-icon" style={{ color: '#8b5cf6' }} /> Overtime (OT)
              </th>
              <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Quick Action Shortcuts</th>
            </tr>
          </thead>
          <tbody>
            {deptMatrix.map((d) => {
              const targetUnits = resolveDynamicUnits(
                d.target,
                d.reportingUom,
                d.secondaryUom,
                d.enableConversionBridge,
                d.avgWeightPerMeter,
                d.avgWeightPerPiece,
              );
              const actualUnits = resolveDynamicUnits(
                d.actual,
                d.reportingUom,
                d.secondaryUom,
                d.enableConversionBridge,
                d.avgWeightPerMeter,
                d.avgWeightPerPiece,
              );

              return (
                <tr key={d.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: 'var(--theme-primary, #0ea5e9)',
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: 700, color: 'var(--theme-text, #0f172a)', fontSize: 13 }}>
                        {d.name}
                      </span>
                    </div>
                  </td>

                  {/* DYNAMIC TARGET QUANTITY */}
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ fontWeight: 800, color: '#0ea5e9', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      <span>{targetUnits.primaryText}</span>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#0284c7', background: 'rgba(14, 165, 233, 0.12)', padding: '1px 5px', borderRadius: 4 }}>
                        {targetUnits.primaryBadge}
                      </span>
                    </div>
                    {targetUnits.secondaryText && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginTop: 1 }}>
                        {targetUnits.secondaryText}
                      </div>
                    )}
                  </td>

                  {/* DYNAMIC GOOD PRODUCTION */}
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ fontWeight: 800, color: '#10b981', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      <span>{actualUnits.primaryText}</span>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#059669', background: 'rgba(16, 185, 129, 0.12)', padding: '1px 5px', borderRadius: 4, letterSpacing: '0.02em' }}>
                        {actualUnits.primaryBadge}
                      </span>
                    </div>
                    {actualUnits.secondaryText && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text, #0f172a)', marginTop: 1 }}>
                        {actualUnits.secondaryText}
                      </div>
                    )}
                  </td>

                  {/* PLANT EFFICIENCY (OEE) CELL */}
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 110 }}>
                    <span style={{ color: d.eff >= 80 ? '#10b981' : d.eff > 0 ? '#f59e0b' : 'var(--theme-text-muted, #94a3b8)', fontWeight: 700, fontSize: 13 }}>
                      {d.eff.toFixed(1)}%
                    </span>
                    <div
                      style={{
                        height: 4,
                        width: '100%',
                        background: 'var(--theme-border, rgba(148, 163, 184, 0.2))',
                        borderRadius: 2,
                        overflow: 'hidden',
                        marginTop: 4,
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, d.eff))}%`,
                          height: '100%',
                          background: d.eff >= 80 ? '#10b981' : '#f59e0b',
                          borderRadius: 2,
                        }}
                      />
                    </div>
                  </td>

                  {/* SCRAP CELL */}
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 125 }}>
                    <div style={{ color: d.scrapKg > 0 ? '#ef4444' : 'var(--theme-text-muted, #94a3b8)', fontWeight: 700, fontSize: 13 }}>
                      {formatNumber(d.scrapKg, 1)} KG
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: d.scrapPct > 0 ? '#ef4444' : 'var(--theme-text-muted, #94a3b8)' }}>
                      {d.scrapPct.toFixed(2)}% Rejection
                    </div>
                  </td>

                  {/* PLANT TIME CELL */}
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 185 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, gap: 8 }}>
                      <span style={{ color: '#10b981' }}>Run: {formatNumber(d.runningHours, 1)}h ({d.runningPct.toFixed(1)}%)</span>
                      <span style={{ color: '#f59e0b' }}>Down: {formatNumber(d.downHours, 1)}h ({d.downPct.toFixed(1)}%)</span>
                    </div>
                    <div className="pwi-time-progress-bar" title={`Total: ${formatNumber(d.totalHours, 1)}h (100%)`}>
                      <div className="pwi-time-progress-bar__run" style={{ width: `${d.runningPct}%` }} />
                      <div className="pwi-time-progress-bar__down" style={{ width: `${d.downPct}%` }} />
                    </div>
                  </td>

                  {/* OVERTIME CELL */}
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 95 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: 'rgba(139, 92, 246, 0.12)',
                        color: '#8b5cf6',
                        fontWeight: 700,
                        fontSize: 12.5,
                        border: '1px solid rgba(139, 92, 246, 0.25)',
                      }}
                    >
                      <FieldTimeOutlined style={{ fontSize: 11 }} /> {formatNumber(d.otHours, 1)} h
                    </span>
                  </td>

                  {/* QUICK ACTIONS CELL */}
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <Space size={6}>
                      {d.name.toLowerCase().includes('raw') || d.name.toLowerCase().includes('rm') ? (
                        <>
                          <span
                            className="pwi-action-badge pwi-action-badge--logs"
                            title={`Open Raw Material Receiving`}
                            onClick={() => doNavigate('/production/receiving')}
                          >
                            <InboxOutlined /> Receiving Logs
                          </span>
                          <span
                            className="pwi-action-badge pwi-action-badge--ot"
                            title={`Open Raw Material Receiving Report`}
                            onClick={() => doNavigate('/production/receiving-report')}
                          >
                            <FieldTimeOutlined /> Receiving Report
                          </span>
                          <span
                            className="pwi-action-badge pwi-action-badge--scrap"
                            title={`Open Raw Material Return`}
                            onClick={() => doNavigate('/production/returns')}
                          >
                            <DeleteOutlined /> Return / Rejection
                          </span>
                        </>
                      ) : (
                        <>
                          <span
                            className="pwi-action-badge pwi-action-badge--logs"
                            title={`Open ${d.name} Production Logs`}
                            onClick={() => {
                              if (d.name.toLowerCase().includes('pack')) {
                                doNavigate('/production/packing-entries');
                              } else {
                                doNavigate('/production/entries', { state: { departmentId: d.id, activeTab: 'entries' } });
                              }
                            }}
                          >
                            <CarryOutOutlined /> Production Logs
                          </span>
                          <span
                            className="pwi-action-badge pwi-action-badge--ot"
                            title={`Open ${d.name} Overtime Analytics`}
                            onClick={() => doNavigate('/production/entries', { state: { departmentId: d.id, activeTab: 'overtime' } })}
                          >
                            <FieldTimeOutlined /> Overtime Analytics
                          </span>
                          <span
                            className="pwi-action-badge pwi-action-badge--scrap"
                            title={`Open ${d.name} Rejection & Scrap Details`}
                            onClick={() => doNavigate('/production/entries', { state: { departmentId: d.id, activeTab: 'scrap' } })}
                          >
                            <DeleteOutlined /> Rejection Sheet
                          </span>
                        </>
                      )}
                    </Space>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DepartmentPerformance;