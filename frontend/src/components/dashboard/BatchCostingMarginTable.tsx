import React, { useState, useEffect } from 'react';
import {
  Table,
  Tag,
  Button,
  Input,
  Modal,
  Progress,
  Tooltip,
  Typography,
  message,
  Tabs,
  Form,
  InputNumber,
  Row,
  Col,
  Select,
} from 'antd';
import {
  DollarOutlined,
  ReloadOutlined,
  SearchOutlined,
  RiseOutlined,
  ThunderboltOutlined,
  ExperimentOutlined,
  InboxOutlined,
  ToolOutlined,
  SaveOutlined,
  CalculatorOutlined,
  FileTextOutlined,
  CompassOutlined,
} from '@ant-design/icons';
import batchCostingService, {
  RealTimeMarginRow,
  CostingDashboardSummary,
  MonthlyUtilityCostSheet,
  MonthlyUtilityItemAllocation,
  SaveMonthlyUtilitySheetDto,
} from '../../services/batchCostingService';
import './BatchCostingMarginTable.css';

const { Text, Title } = Typography;
const { Option } = Select;

interface BatchCostingMarginTableProps {
  summary: CostingDashboardSummary | null;
  loading: boolean;
  onRefresh: () => void;
  onRecalculate?: () => Promise<void>;
}

export const BatchCostingMarginTable: React.FC<BatchCostingMarginTableProps> = ({
  summary,
  loading,
  onRefresh,
  onRecalculate,
}) => {
  const [activeTab, setActiveTab] = useState<string>('batches');
  const [searchText, setSearchText] = useState('');
  const [selectedBatch, setSelectedBatch] = useState<RealTimeMarginRow | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Monthly Utility Cost Sheet state
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-10');
  const [utilitySheet, setUtilitySheet] = useState<MonthlyUtilityCostSheet | null>(null);
  const [allocations, setAllocations] = useState<MonthlyUtilityItemAllocation[]>([]);
  const [utilityLoading, setUtilityLoading] = useState(false);
  const [utilitySaving, setUtilitySaving] = useState(false);
  const [utilityForm] = Form.useForm();

  // Load Monthly Utility Sheet on mount or period change
  const loadUtilitySheet = async (period: string) => {
    try {
      setUtilityLoading(true);
      const res = await batchCostingService.getUtilitySheet(period);
      if (res && res.data) {
        setUtilitySheet(res.data.sheet);
        setAllocations(res.data.allocations || []);
        utilityForm.setFieldsValue({
          electricityBill: Number(res.data.sheet.electricityBill || 0),
          gasFuelBill: Number(res.data.sheet.gasFuelBill || 0),
          waterCharges: Number(res.data.sheet.waterCharges || 0),
          factoryMaintenanceOverhead: Number(res.data.sheet.factoryMaintenanceOverhead || 0),
          indirectLaborAdmin: Number(res.data.sheet.indirectLaborAdmin || 0),
          notes: res.data.sheet.notes || '',
        });
      }
    } catch (err: any) {
      console.warn('Could not fetch utility sheet, using local baseline:', err.message);
    } finally {
      setUtilityLoading(false);
    }
  };

  useEffect(() => {
    loadUtilitySheet(selectedPeriod);
  }, [selectedPeriod]);

  const handleOpenDetail = (row: RealTimeMarginRow) => {
    setSelectedBatch(row);
    setIsModalOpen(true);
  };

  const handleRecalculateClick = async () => {
    if (!onRecalculate) return;
    try {
      setRecalculating(true);
      await onRecalculate();
      message.success('Live batch costing ledger recalculated successfully');
    } catch (err: any) {
      message.error(err.message || 'Failed to recalculate batch costing');
    } finally {
      setRecalculating(false);
    }
  };

  const handleSaveUtilitySheet = async (values: any) => {
    try {
      setUtilitySaving(true);
      const dto: SaveMonthlyUtilitySheetDto = {
        billingPeriod: selectedPeriod,
        electricityBill: Number(values.electricityBill) || 0,
        gasFuelBill: Number(values.gasFuelBill) || 0,
        waterCharges: Number(values.waterCharges) || 0,
        factoryMaintenanceOverhead: Number(values.factoryMaintenanceOverhead) || 0,
        indirectLaborAdmin: Number(values.indirectLaborAdmin) || 0,
        notes: values.notes,
      };

      const res = await batchCostingService.saveUtilitySheet(dto);
      if (res.success) {
        message.success(res.message || 'Monthly utility bills saved and allocated across batches');
        setUtilitySheet(res.sheet);
        await loadUtilitySheet(selectedPeriod);
        onRefresh();
      }
    } catch (err: any) {
      message.error(err.message || 'Failed to save utility sheet');
    } finally {
      setUtilitySaving(false);
    }
  };

  const filteredRows = (summary?.rows || []).filter((r) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return (
      r.batchNumber.toLowerCase().includes(q) ||
      r.contractNumber.toLowerCase().includes(q) ||
      r.customerName.toLowerCase().includes(q) ||
      r.itemCode.toLowerCase().includes(q) ||
      r.itemName.toLowerCase().includes(q)
    );
  });

  const getMarginBadge = (pct: number, status: string) => {
    if (pct >= 25.0) {
      return (
        <Tag
          style={{
            background: 'rgba(16, 185, 129, 0.25)',
            border: '1px solid #10b981',
            color: '#10b981',
            fontWeight: 800,
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 6,
          }}
        >
          {pct.toFixed(1)}% EXCELLENT
        </Tag>
      );
    }
    if (pct >= 15.0) {
      return (
        <Tag
          style={{
            background: 'rgba(245, 158, 11, 0.25)',
            border: '1px solid #f59e0b',
            color: '#fbbf24',
            fontWeight: 800,
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 6,
          }}
        >
          {pct.toFixed(1)}% MODERATE
        </Tag>
      );
    }
    if (pct >= 0) {
      return (
        <Tag
          style={{
            background: 'rgba(239, 68, 68, 0.25)',
            border: '1px solid #ef4444',
            color: '#f87171',
            fontWeight: 800,
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 6,
          }}
        >
          {pct.toFixed(1)}% AT RISK
        </Tag>
      );
    }
    return (
      <Tag
        style={{
          background: 'rgba(220, 38, 38, 0.35)',
          border: '1px solid #dc2626',
          color: '#fca5a5',
          fontWeight: 900,
          fontSize: 12,
          padding: '2px 8px',
          borderRadius: 6,
        }}
      >
        {pct.toFixed(1)}% LOSS ALERT
      </Tag>
    );
  };

  // Main Batch Production Ledger Columns
  const columns = [
    {
      title: 'Batch & Contract',
      key: 'batchNumber',
      render: (_: any, r: RealTimeMarginRow) => (
        <div>
          <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: 13.5, letterSpacing: 0.3 }}>
            {r.batchNumber}
          </div>
          <div className="erp-cell-secondary">
            Contract: <span style={{ color: '#ffffff', fontWeight: 700 }}>{r.contractNumber}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Customer Name',
      dataIndex: 'customerName',
      key: 'customerName',
      render: (val: string) => (
        <div className="erp-cell-primary">
          {val}
        </div>
      ),
    },
    {
      title: 'Manufactured Item',
      key: 'item',
      render: (_: any, r: RealTimeMarginRow) => (
        <div style={{ maxWidth: 220 }}>
          <Tag color="cyan" style={{ fontSize: 11, padding: '0 6px', fontWeight: 700, border: '1px solid #0284c7' }}>
            {r.itemCode}
          </Tag>
          <div
            className="erp-cell-primary"
            style={{
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={r.itemName}
          >
            {r.itemName}
          </div>
        </div>
      ),
    },
    {
      title: (
        <div>
          <div style={{ color: '#ffffff', fontWeight: 700 }}>Batch Units</div>
          <div style={{ fontSize: 10, color: '#93c5fd', fontWeight: 600 }}>Shop Floor (PCS)</div>
        </div>
      ),
      key: 'qty',
      align: 'right' as const,
      render: (_: any, r: RealTimeMarginRow) => {
        const pcs = Number(r.quantityPieces || r.quantityProcessed || 0);
        const gross = Number(r.quantityGross || (pcs / 144));
        return (
          <div style={{ textAlign: 'right' }}>
            <span className="erp-cell-primary" style={{ fontSize: 14 }}>
              {pcs.toLocaleString()} PCS
            </span>
            <div className="erp-cell-accent-blue" style={{ fontSize: 11.5, marginTop: 2 }}>
              {gross.toFixed(1)} GRS
            </div>
          </div>
        );
      },
    },
    {
      title: (
        <div>
          <div style={{ color: '#ffffff', fontWeight: 700 }}>Contract Rate</div>
          <div style={{ fontSize: 10, color: '#93c5fd', fontWeight: 600 }}>Sales Order (GRS)</div>
        </div>
      ),
      key: 'contractRate',
      align: 'right' as const,
      render: (_: any, r: RealTimeMarginRow) => {
        const rateGross = Number(r.contractRatePerGross || ((r.invoiceUnitPrice || 0) * 144) || 1200);
        const ratePiece = Number(r.effectiveRatePerPiece || (rateGross / 144));
        return (
          <div style={{ textAlign: 'right' }}>
            <div className="erp-cell-primary">
              PKR {rateGross.toLocaleString()} / GRS
            </div>
            <div className="erp-cell-secondary">
              (PKR {ratePiece.toFixed(2)} / PC)
            </div>
          </div>
        );
      },
    },
    {
      title: '4-Stage Value Chain Waterfall (PKR)',
      key: 'waterfall',
      render: (_: any, r: RealTimeMarginRow) => (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Tooltip title={`Stage 1 Raw Material Entry (Wire WAC): PKR ${r.stage1RawMaterialCost.toLocaleString()}`}>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(2, 132, 199, 0.25)',
                color: '#38bdf8',
                border: '1px solid rgba(2, 132, 199, 0.6)',
              }}
            >
              S1: {Math.round(r.stage1RawMaterialCost / 1000)}k
            </span>
          </Tooltip>
          <span style={{ color: '#94a3b8', fontSize: 10 }}>➔</span>
          <Tooltip title={`Stage 2 Conversion (Swaging & Heading): PKR ${r.stage2ConversionCost.toLocaleString()}`}>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(245, 158, 11, 0.25)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.6)',
              }}
            >
              S2: {Math.round(r.stage2ConversionCost / 1000)}k
            </span>
          </Tooltip>
          <span style={{ color: '#94a3b8', fontSize: 10 }}>➔</span>
          <Tooltip title={`Stage 3 Chemical Plating & Power: PKR ${r.stage3ChemicalElectricityCost.toLocaleString()}`}>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(16, 185, 129, 0.25)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.6)',
              }}
            >
              S3: {Math.round(r.stage3ChemicalElectricityCost / 1000)}k
            </span>
          </Tooltip>
          <span style={{ color: '#94a3b8', fontSize: 10 }}>➔</span>
          <Tooltip title={`Stage 4 Finished Goods Valuation (Packing & FGR): PKR ${r.stage4PackingCost.toLocaleString()}`}>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(236, 72, 153, 0.25)',
                color: '#f472b6',
                border: '1px solid rgba(236, 72, 153, 0.6)',
              }}
            >
              S4: {Math.round(r.stage4PackingCost / 1000)}k
            </span>
          </Tooltip>
        </div>
      ),
    },
    {
      title: (
        <div>
          <div style={{ color: '#ffffff', fontWeight: 700 }}>Accumulated COGM</div>
          <div style={{ fontSize: 10, color: '#fcd34d', fontWeight: 600 }}>Floor + Utility Share</div>
        </div>
      ),
      key: 'accumulatedCost',
      align: 'right' as const,
      render: (_: any, r: RealTimeMarginRow) => {
        const unitPc = r.unitCostPerPiece || r.unitAccumulatedCost || 0;
        const unitGrs = r.unitCostPerGross || (unitPc * 144);
        return (
          <div style={{ textAlign: 'right' }}>
            <div className="erp-cell-accent-amber" style={{ fontSize: 13.5 }}>
              PKR {Number(r.accumulatedBatchCost).toLocaleString()}
            </div>
            <div className="erp-cell-secondary" style={{ marginTop: 2 }}>
              PKR {unitPc.toFixed(2)}/PC <span style={{ color: '#ffffff', fontWeight: 600 }}>({unitGrs.toFixed(0)}/GRS)</span>
            </div>
            {Number(r.allocatedUtilityCost || 0) > 0 && (
              <div className="erp-cell-accent-purple" style={{ fontSize: 11, marginTop: 2 }}>
                + Util: PKR {Math.round(Number(r.allocatedUtilityCost)).toLocaleString()}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: (
        <div>
          <div style={{ color: '#ffffff', fontWeight: 700 }}>Net Invoice Value</div>
          <div style={{ fontSize: 10, color: '#93c5fd', fontWeight: 600 }}>Dynamic Billing (GRS)</div>
        </div>
      ),
      key: 'invoiceValue',
      align: 'right' as const,
      render: (_: any, r: RealTimeMarginRow) => {
        const gross = Number(r.quantityGross || ((r.quantityProcessed || r.quantityPieces || 0) / 144));
        return (
          <div style={{ textAlign: 'right' }}>
            <div className="erp-cell-accent-blue" style={{ fontSize: 13.5 }}>
              PKR {Number(r.netInvoiceValue).toLocaleString()}
            </div>
            <div className="erp-cell-secondary" style={{ marginTop: 2 }}>
              Formula: ({gross.toFixed(1)} GRS × Rate)
            </div>
          </div>
        );
      },
    },
    {
      title: 'Real-Time Margin %',
      key: 'grossMarginPercent',
      align: 'center' as const,
      render: (_: any, r: RealTimeMarginRow) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {getMarginBadge(r.grossMarginPercent, r.marginStatus)}
          <span style={{ fontSize: 11, color: '#34d399', fontWeight: 700, marginTop: 4 }}>
            Profit: PKR {Number(r.grossProfit).toLocaleString()}
          </span>
        </div>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      align: 'center' as const,
      render: (_: any, r: RealTimeMarginRow) => (
        <Button
          size="small"
          type="primary"
          ghost
          style={{ borderColor: '#38bdf8', color: '#ffffff', background: 'rgba(56, 189, 248, 0.15)', fontWeight: 700, fontSize: 11 }}
          onClick={() => handleOpenDetail(r)}
        >
          Cost Cascade ➔
        </Button>
      ),
    },
  ];

  // Item Allocation Table Columns (Tab 2)
  const allocationColumns = [
    {
      title: 'Finished Item',
      key: 'item',
      render: (_: any, a: MonthlyUtilityItemAllocation) => (
        <div>
          <Tag color="cyan" style={{ fontSize: 11, fontWeight: 700, border: '1px solid #0284c7' }}>
            {a.itemCode}
          </Tag>
          <div className="erp-cell-primary" style={{ marginTop: 3 }}>
            {a.itemName}
          </div>
        </div>
      ),
    },
    {
      title: 'Monthly Output',
      key: 'output',
      align: 'right' as const,
      render: (_: any, a: MonthlyUtilityItemAllocation) => (
        <div style={{ textAlign: 'right' }}>
          <div className="erp-cell-primary">
            {Number(a.monthlyProducedPieces || a.monthlyProductionPieces || 0).toLocaleString()} PCS
          </div>
          <div className="erp-cell-accent-blue" style={{ fontSize: 11.5, marginTop: 1 }}>
            {Number(a.monthlyProducedGross || a.monthlyProductionGross || 0).toFixed(1)} GRS
          </div>
        </div>
      ),
    },
    {
      title: 'Manufactured Weight',
      key: 'weight',
      align: 'right' as const,
      render: (_: any, a: MonthlyUtilityItemAllocation) => (
        <div style={{ textAlign: 'right' }}>
          <div className="erp-cell-accent-amber" style={{ fontSize: 13.5 }}>
            {Number(a.monthlyProducedKg || a.monthlyProductionWeightKg || 0).toLocaleString()} KG
          </div>
          <div className="erp-cell-secondary">
            {Number(a.unitWeightKg || 0.0125).toFixed(4)} kg/pc
          </div>
        </div>
      ),
    },
    {
      title: 'Weight Share %',
      key: 'share',
      width: 140,
      render: (_: any, a: MonthlyUtilityItemAllocation) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#ffffff', fontWeight: 600 }}>
            <span>Volume Share:</span>
            <strong style={{ color: '#34d399' }}>{Number(a.weightSharePercent).toFixed(2)}%</strong>
          </div>
          <Progress
            percent={Number(a.weightSharePercent)}
            showInfo={false}
            strokeColor="#10b981"
            trailColor="rgba(255,255,255,0.15)"
            size="small"
          />
        </div>
      ),
    },
    {
      title: 'Allocated Power (K-Electric)',
      key: 'elec',
      align: 'right' as const,
      render: (_: any, a: MonthlyUtilityItemAllocation) => (
        <div className="erp-cell-accent-blue" style={{ textAlign: 'right' }}>
          PKR {Number(a.allocatedElectricity || a.allocatedElectricityCost || 0).toLocaleString()}
        </div>
      ),
    },
    {
      title: 'Water & Maintenance',
      key: 'waterMaint',
      align: 'right' as const,
      render: (_: any, a: MonthlyUtilityItemAllocation) => {
        const water = Number(a.allocatedWater || a.allocatedWaterGasCost || 0);
        const maint = Number(a.allocatedOverhead || a.allocatedMaintenanceCost || 0);
        return (
          <div className="erp-cell-primary" style={{ textAlign: 'right' }}>
            PKR {(water + maint).toLocaleString()}
          </div>
        );
      },
    },
    {
      title: 'Total Allocated Utility',
      key: 'totalAlloc',
      align: 'right' as const,
      render: (_: any, a: MonthlyUtilityItemAllocation) => (
        <div className="erp-cell-accent-amber" style={{ textAlign: 'right', fontSize: 13.5 }}>
          PKR {Number(a.totalAllocatedUtilityCost || a.totalAllocatedUtility || 0).toLocaleString()}
        </div>
      ),
    },
    {
      title: (
        <div>
          <div style={{ color: '#ffffff', fontWeight: 700 }}>Allocated Surcharge</div>
          <div style={{ fontSize: 10, color: '#c084fc', fontWeight: 600 }}>Per Item Unit</div>
        </div>
      ),
      key: 'unitSurcharge',
      align: 'right' as const,
      render: (_: any, a: MonthlyUtilityItemAllocation) => (
        <div style={{ textAlign: 'right' }}>
          <div className="erp-cell-accent-purple" style={{ fontSize: 13.5 }}>
            PKR {Number(a.allocatedCostPerPiece || a.allocatedUtilityPerPiece || 0).toFixed(2)} / PC
          </div>
          <div className="erp-cell-secondary" style={{ color: '#ffffff' }}>
            PKR {Number(a.allocatedCostPerGross || a.allocatedUtilityPerGross || 0).toFixed(2)} / GRS
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="erp-batch-costing-card">
      {/* Header and Executive Strip */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
          gap: 12,
          borderBottom: '2px solid #334155',
          paddingBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              color: '#ffffff',
              fontSize: 22,
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
            }}
          >
            <DollarOutlined />
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 className="erp-batch-costing-title">
                Batch Production Costing Ledger & Real-Time Margin Analytics
              </h2>
              <Tag color="blue" style={{ fontSize: 11, fontWeight: 800, border: '1px solid #38bdf8' }}>
                DUAL UOM: PCS ⇄ GROSS
              </Tag>
            </div>
            <span className="erp-batch-costing-subtitle">
              Multi-stage value chain tracking (S1-S4) synchronized with Monthly Utility & Overhead Allocations
            </span>
          </div>
        </div>

        {/* Global Action Buttons & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {activeTab === 'batches' && (
            <Input
              placeholder="Search Batch / Contract / Item..."
              prefix={<SearchOutlined style={{ color: '#38bdf8' }} />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{
                width: 260,
                background: '#0a0f1d',
                border: '1px solid #475569',
                color: '#ffffff',
                fontWeight: 600,
              }}
              allowClear
            />
          )}

          {activeTab === 'utility_sheet' && (
            <Select
              value={selectedPeriod}
              onChange={(val) => setSelectedPeriod(val)}
              style={{ width: 180 }}
              dropdownStyle={{ background: '#1e293b' }}
            >
              <Option value="2026-10">October 2026</Option>
              <Option value="2026-09">September 2026</Option>
              <Option value="2026-08">August 2026</Option>
            </Select>
          )}

          {onRecalculate && activeTab === 'batches' && (
            <Button
              icon={<ReloadOutlined spin={recalculating} />}
              onClick={handleRecalculateClick}
              loading={recalculating}
              style={{
                background: 'rgba(56, 189, 248, 0.2)',
                borderColor: '#38bdf8',
                color: '#ffffff',
                fontWeight: 700,
              }}
            >
              Recalculate Margins
            </Button>
          )}

          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              onRefresh();
              loadUtilitySheet(selectedPeriod);
            }}
            style={{
              background: '#1e293b',
              borderColor: '#475569',
              color: '#ffffff',
              fontWeight: 700,
            }}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Navigation Tabs: Batch Ledger vs Monthly Utility Cost Sheet */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        className="erp-batch-costing-tabs"
        items={[
          {
            key: 'batches',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                <RiseOutlined />
                Live Batch Production Costing Ledger
                <Tag color="cyan" style={{ marginLeft: 6, fontSize: 11, fontWeight: 800 }}>
                  {summary?.totalBatchesTracked || 0} Batches
                </Tag>
              </span>
            ),
            children: (
              <div>
                {/* Financial Metric Cards Ribbon */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                    marginBottom: 20,
                  }}
                >
                  <div className="erp-costing-kpi-card">
                    <div className="erp-costing-kpi-label">
                      Floor Batches
                    </div>
                    <div className="erp-costing-kpi-value" style={{ color: '#38bdf8' }}>
                      {summary?.totalBatchesTracked || 0} Batches
                    </div>
                    <div className="erp-costing-kpi-subtext">
                      {summary?.totalManufacturedPieces ? Number(summary.totalManufacturedPieces).toLocaleString() : '0'} PCS
                    </div>
                  </div>

                  <div className="erp-costing-kpi-card">
                    <div className="erp-costing-kpi-label">
                      Floor Process Cost (S1-S4)
                    </div>
                    <div className="erp-costing-kpi-value" style={{ color: '#fbbf24' }}>
                      PKR {Number(summary?.totalFloorProcessCost || summary?.totalAccumulatedCost || 0).toLocaleString()}
                    </div>
                    <div className="erp-costing-kpi-subtext">
                      Direct shop-floor conversion
                    </div>
                  </div>

                  <div className="erp-costing-kpi-card">
                    <div className="erp-costing-kpi-label" style={{ color: '#c084fc' }}>
                      Allocated Utilities
                    </div>
                    <div className="erp-costing-kpi-value" style={{ color: '#c084fc' }}>
                      PKR {Number(summary?.totalAllocatedUtilityCost || 0).toLocaleString()}
                    </div>
                    <div className="erp-costing-kpi-subtext">
                      Monthly weight allocation
                    </div>
                  </div>

                  <div className="erp-costing-kpi-card">
                    <div className="erp-costing-kpi-label" style={{ color: '#fbbf24' }}>
                      True Accumulated COGM
                    </div>
                    <div className="erp-costing-kpi-value" style={{ color: '#f59e0b' }}>
                      PKR {Number(summary?.totalAccumulatedCost || 0).toLocaleString()}
                    </div>
                    <div className="erp-costing-kpi-subtext">
                      Floor Cost + Utility Overheads
                    </div>
                  </div>

                  <div className="erp-costing-kpi-card">
                    <div className="erp-costing-kpi-label" style={{ color: '#38bdf8' }}>
                      Net Invoice Value
                    </div>
                    <div className="erp-costing-kpi-value" style={{ color: '#38bdf8' }}>
                      PKR {Number(summary?.totalNetInvoiceValue || 0).toLocaleString()}
                    </div>
                    <div className="erp-costing-kpi-subtext">
                      (Batch Units / 144) × Rate/Gross
                    </div>
                  </div>

                  <div className="erp-costing-kpi-card">
                    <div className="erp-costing-kpi-label" style={{ color: '#34d399' }}>
                      Gross Profit & Margin
                    </div>
                    <div className="erp-costing-kpi-value" style={{ color: '#10b981' }}>
                      {summary?.weightedAverageMarginPercent?.toFixed(1) || '0.0'}%
                    </div>
                    <div className="erp-costing-kpi-subtext" style={{ color: '#34d399', fontWeight: 700 }}>
                      Profit: PKR {Number(summary?.totalGrossProfit || 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Main Batch Financial Table */}
                <Table
                  dataSource={filteredRows}
                  columns={columns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 8, showSizeChanger: false }}
                  className="erp-batch-costing-table"
                />
              </div>
            ),
          },
          {
            key: 'utility_sheet',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                <ThunderboltOutlined style={{ color: '#fbbf24' }} />
                Monthly Utility & Overhead Cost Sheet
                <Tag color="gold" style={{ marginLeft: 6, fontSize: 11, fontWeight: 800 }}>
                  NEW MODULE
                </Tag>
              </span>
            ),
            children: (
              <div>
                {/* Utility Pool Metric Cards */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 12,
                    marginBottom: 20,
                  }}
                >
                  <div className="erp-costing-kpi-card" style={{ borderLeft: '4px solid #fbbf24' }}>
                    <div className="erp-costing-kpi-label" style={{ color: '#fbbf24' }}>
                      Total Monthly Utility Pool
                    </div>
                    <div className="erp-costing-kpi-value" style={{ color: '#ffffff' }}>
                      PKR {Number(utilitySheet?.totalUtilityPool || 1435000).toLocaleString()}
                    </div>
                    <div className="erp-costing-kpi-subtext">
                      K-Electric, Water, Maintenance, Admin
                    </div>
                  </div>

                  <div className="erp-costing-kpi-card" style={{ borderLeft: '4px solid #38bdf8' }}>
                    <div className="erp-costing-kpi-label" style={{ color: '#38bdf8' }}>
                      Manufactured Output Weight
                    </div>
                    <div className="erp-costing-kpi-value" style={{ color: '#38bdf8' }}>
                      {Number(utilitySheet?.totalManufacturedWeightKg || 12500).toLocaleString()} KG
                    </div>
                    <div className="erp-costing-kpi-subtext">
                      Monthly plant volume baseline
                    </div>
                  </div>

                  <div className="erp-costing-kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
                    <div className="erp-costing-kpi-label" style={{ color: '#34d399' }}>
                      Factory Overhead Rate / KG
                    </div>
                    <div className="erp-costing-kpi-value" style={{ color: '#10b981' }}>
                      PKR {Number(utilitySheet?.utilityRatePerKg || 114.8).toFixed(2)} / KG
                    </div>
                    <div className="erp-costing-kpi-subtext">
                      Formula: Total Bill / Monthly Weight
                    </div>
                  </div>

                  <div className="erp-costing-kpi-card" style={{ borderLeft: '4px solid #c084fc' }}>
                    <div className="erp-costing-kpi-label" style={{ color: '#c084fc' }}>
                      Factory Overhead / Gross
                    </div>
                    <div className="erp-costing-kpi-value" style={{ color: '#c084fc' }}>
                      PKR {Number(utilitySheet?.utilityRatePerGross || 206.64).toFixed(2)} / GRS
                    </div>
                    <div className="erp-costing-kpi-subtext">
                      PKR {Number(utilitySheet?.utilityRatePerKg ? utilitySheet.utilityRatePerGross / 144 : 1.44).toFixed(2)} / PC
                    </div>
                  </div>
                </div>

                {/* Section 1: The Accountant Manual Input Gateway */}
                <div className="erp-utility-gateway-box">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CalculatorOutlined style={{ color: '#38bdf8', fontSize: 20 }} />
                        <h3 style={{ margin: 0, color: '#ffffff', fontWeight: 800, fontSize: 16 }}>
                          The Manual Input Gateway (Accountant Monthly Logging)
                        </h3>
                      </div>
                      <p style={{ fontSize: 13, color: '#cbd5e1', margin: '4px 0 0 0' }}>
                        Input cumulative monthly utility and factory overhead bills. The allocation hook automatically cascades these costs to finished items and floor batches based on manufacturing weights.
                      </p>
                    </div>
                    <Tag color="cyan" style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px', border: '1px solid #0284c7' }}>
                      Period: {selectedPeriod}
                    </Tag>
                  </div>

                  <Form
                    form={utilityForm}
                    layout="vertical"
                    onFinish={handleSaveUtilitySheet}
                    initialValues={{
                      electricityBill: 850000,
                      gasFuelBill: 120000,
                      waterCharges: 65000,
                      factoryMaintenanceOverhead: 180000,
                      indirectLaborAdmin: 220000,
                      notes: 'Monthly utility and fixed factory overhead allocation sheet',
                    }}
                  >
                    <Row gutter={[16, 14]}>
                      <Col xs={24} sm={12} md={8}>
                        <Form.Item
                          label={<span className="erp-utility-form-label">K-Electric Bill (PKR)</span>}
                          name="electricityBill"
                          rules={[{ required: true, message: 'Please enter K-Electric bill' }]}
                        >
                          <InputNumber
                            className="erp-utility-input"
                            style={{ width: '100%' }}
                            formatter={(value) => `PKR ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={(value) => value!.replace(/PKR\s?|(,*)/g, '')}
                          />
                        </Form.Item>
                      </Col>

                      <Col xs={24} sm={12} md={8}>
                        <Form.Item
                          label={<span className="erp-utility-form-label">Gas & Generator Fuel (PKR)</span>}
                          name="gasFuelBill"
                        >
                          <InputNumber
                            className="erp-utility-input"
                            style={{ width: '100%' }}
                            formatter={(value) => `PKR ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={(value) => value!.replace(/PKR\s?|(,*)/g, '')}
                          />
                        </Form.Item>
                      </Col>

                      <Col xs={24} sm={12} md={8}>
                        <Form.Item
                          label={<span className="erp-utility-form-label">Water Supply Charges (PKR)</span>}
                          name="waterCharges"
                        >
                          <InputNumber
                            className="erp-utility-input"
                            style={{ width: '100%' }}
                            formatter={(value) => `PKR ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={(value) => value!.replace(/PKR\s?|(,*)/g, '')}
                          />
                        </Form.Item>
                      </Col>

                      <Col xs={24} sm={12} md={8}>
                        <Form.Item
                          label={<span className="erp-utility-form-label">Fixed Factory Maintenance (PKR)</span>}
                          name="factoryMaintenanceOverhead"
                        >
                          <InputNumber
                            className="erp-utility-input"
                            style={{ width: '100%' }}
                            formatter={(value) => `PKR ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={(value) => value!.replace(/PKR\s?|(,*)/g, '')}
                          />
                        </Form.Item>
                      </Col>

                      <Col xs={24} sm={12} md={8}>
                        <Form.Item
                          label={<span className="erp-utility-form-label">Indirect Labor & Admin (PKR)</span>}
                          name="indirectLaborAdmin"
                        >
                          <InputNumber
                            className="erp-utility-input"
                            style={{ width: '100%' }}
                            formatter={(value) => `PKR ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={(value) => value!.replace(/PKR\s?|(,*)/g, '')}
                          />
                        </Form.Item>
                      </Col>

                      <Col xs={24} sm={12} md={8}>
                        <Form.Item
                          label={<span className="erp-utility-form-label">Accounting Notes / Audit Reference</span>}
                          name="notes"
                        >
                          <Input
                            placeholder="e.g. October 2026 K-Electric consumer #1402859"
                            className="erp-utility-input"
                            style={{ height: 32 }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                      <Button
                        type="primary"
                        htmlType="submit"
                        icon={<SaveOutlined />}
                        loading={utilitySaving}
                        style={{
                          background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                          borderColor: '#38bdf8',
                          fontWeight: 800,
                          height: 40,
                          padding: '0 28px',
                          boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                        }}
                      >
                        Save Bills & Allocate Across Items
                      </Button>
                    </div>
                  </Form>
                </div>

                {/* Section 2: Item-Wise Cost Breakdown Table */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileTextOutlined style={{ color: '#10b981', fontSize: 20 }} />
                        <h3 style={{ margin: 0, color: '#ffffff', fontWeight: 800, fontSize: 16 }}>
                          Item-Wise Overhead & Utility Allocation Breakdown
                        </h3>
                      </div>
                      <p style={{ fontSize: 13, color: '#cbd5e1', margin: '4px 0 0 0' }}>
                        Distributed proportionally via manufacturing weight formula: <span style={{ color: '#fbbf24', fontWeight: 700 }}>Allocated Utility = (Total Bill / Total Weight) × Item Batch Weight</span>
                      </p>
                    </div>
                  </div>

                  <Table
                    dataSource={allocations}
                    columns={allocationColumns}
                    rowKey="id"
                    loading={utilityLoading}
                    pagination={{ pageSize: 8, showSizeChanger: false }}
                    className="erp-batch-costing-table"
                  />
                </div>
              </div>
            ),
          },
        ]}
      />

      {/* 4-Stage Value Chain Waterfall + Monthly Utility Drill-Down Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ffffff' }}>
            <RiseOutlined style={{ color: '#38bdf8' }} />
            <span style={{ fontWeight: 800 }}>Multi-Stage Value Chain Waterfall: {selectedBatch?.batchNumber}</span>
          </div>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setIsModalOpen(false)} style={{ fontWeight: 700 }}>
            Close Overview
          </Button>,
        ]}
        width={800}
        bodyStyle={{ background: '#0a0f1d', color: '#ffffff', padding: '24px' }}
      >
        {selectedBatch && (
          <div>
            {/* Header info with UOM Reconciliation Matrix */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
                background: '#111827',
                padding: 16,
                borderRadius: 8,
                marginBottom: 20,
                border: '1px solid #334155',
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 600 }}>Contract / Customer</div>
                <div style={{ fontWeight: 800, color: '#ffffff', fontSize: 14 }}>
                  {selectedBatch.contractNumber} — {selectedBatch.customerName}
                </div>
                <div style={{ fontSize: 12, color: '#38bdf8', marginTop: 4, fontWeight: 700 }}>
                  Contract Rate: PKR {selectedBatch.contractRatePerGross ? selectedBatch.contractRatePerGross.toLocaleString() : (((selectedBatch.invoiceUnitPrice || 0) * 144)).toLocaleString()} / GRS <span style={{ color: '#cbd5e1', fontWeight: 500 }}>(PKR {selectedBatch.effectiveRatePerPiece ? selectedBatch.effectiveRatePerPiece.toFixed(2) : (selectedBatch.invoiceUnitPrice || 0).toFixed(2)}/PC)</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 600 }}>Finished Item & Dual UOM Volume</div>
                <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: 14 }}>
                  {selectedBatch.itemCode}
                </div>
                <div style={{ fontSize: 13, color: '#ffffff', marginTop: 4 }}>
                  Floor Units: <strong style={{ color: '#ffffff' }}>{selectedBatch.quantityPieces ? selectedBatch.quantityPieces.toLocaleString() : (selectedBatch.quantityProcessed || 0).toLocaleString()} PCS</strong>
                  <span style={{ color: '#38bdf8', marginLeft: 8, fontWeight: 700 }}>
                    ({(selectedBatch.quantityGross || ((selectedBatch.quantityProcessed || selectedBatch.quantityPieces || 0) / 144)).toFixed(1)} GRS)
                  </span>
                </div>
              </div>
            </div>

            {/* 4-Stage Sequential Cards + Stage 5 Overhead Share */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {/* Stage 1 */}
              <div
                style={{
                  background: 'rgba(2, 132, 199, 0.15)',
                  border: '1px solid #0284c7',
                  borderRadius: 8,
                  padding: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ToolOutlined style={{ fontSize: 20, color: '#38bdf8' }} />
                  <div>
                    <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: 13.5 }}>
                      Stage 1: Raw Material Entry (Wire Straightening)
                    </div>
                    <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 2 }}>
                      Base material cost injected from wire inventory ledger via Weighted Average Cost (WAC)
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: '#ffffff', fontSize: 15 }}>
                    PKR {selectedBatch.stage1RawMaterialCost.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Stage 2 */}
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid #f59e0b',
                  borderRadius: 8,
                  padding: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ThunderboltOutlined style={{ fontSize: 20, color: '#fbbf24' }} />
                  <div>
                    <div style={{ fontWeight: 800, color: '#fbbf24', fontSize: 13.5 }}>
                      Stage 2: Intermediate Conversion (Swaging & Heading)
                    </div>
                    <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 2 }}>
                      Direct labor rates + machine overhead allocation per shift processing interval
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: '#ffffff', fontSize: 15 }}>
                    PKR {selectedBatch.stage2ConversionCost.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Stage 3 */}
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid #10b981',
                  borderRadius: 8,
                  padding: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ExperimentOutlined style={{ fontSize: 20, color: '#34d399' }} />
                  <div>
                    <div style={{ fontWeight: 800, color: '#34d399', fontSize: 13.5 }}>
                      Stage 3: Chemical Treatment (Plating Plant)
                    </div>
                    <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 2 }}>
                      Recipe chemical surcharge + electricity power factor metric based on batch weight
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: '#ffffff', fontSize: 15 }}>
                    PKR {selectedBatch.stage3ChemicalElectricityCost.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Stage 4 */}
              <div
                style={{
                  background: 'rgba(236, 72, 153, 0.15)',
                  border: '1px solid #ec4899',
                  borderRadius: 8,
                  padding: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <InboxOutlined style={{ fontSize: 20, color: '#f472b6' }} />
                  <div>
                    <div style={{ fontWeight: 800, color: '#f472b6', fontSize: 13.5 }}>
                      Stage 4: Finished Goods Valuation (Packing & FGR)
                    </div>
                    <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 2 }}>
                      Packaging cost + writeback comprehensive baseline cost into item valuation record
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: '#ffffff', fontSize: 15 }}>
                    PKR {selectedBatch.stage4PackingCost.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Stage 5: Monthly Overhead & Utility Allocation (NEW MODULE) */}
              <div
                style={{
                  background: 'rgba(167, 139, 250, 0.15)',
                  border: '1px solid #a855f7',
                  borderRadius: 8,
                  padding: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CompassOutlined style={{ fontSize: 20, color: '#c084fc' }} />
                  <div>
                    <div style={{ fontWeight: 800, color: '#c084fc', fontSize: 13.5 }}>
                      Monthly Utility & Fixed Overhead Allocation (NEW MODULE)
                    </div>
                    <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 2 }}>
                      K-Electric bill, water charges, factory maintenance distributed via batch manufactured weight
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: '#ffffff', fontSize: 15 }}>
                    PKR {Number(selectedBatch.allocatedUtilityCost || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: '#c084fc', fontWeight: 700 }}>
                    True overhead absorption
                  </div>
                </div>
              </div>
            </div>

            {/* Final Margin Summary Box */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                border: '1.5px solid #10b981',
                borderRadius: 8,
                padding: '18px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>
                  True Gross Margin Performance
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
                  <span style={{ fontSize: 28, fontWeight: 900, color: '#10b981' }}>
                    {selectedBatch.grossMarginPercent.toFixed(2)}%
                  </span>
                  <span style={{ fontSize: 13.5, color: '#ffffff' }}>
                    Net Profit: <strong style={{ color: '#38bdf8' }}>PKR {selectedBatch.grossProfit.toLocaleString()}</strong>
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 600 }}>True Unit COGM (Floor + Overheads)</div>
                <div style={{ fontSize: 16.5, fontWeight: 800, color: '#fbbf24', marginTop: 2 }}>
                  PKR {Number(selectedBatch.unitCostPerPiece || selectedBatch.unitAccumulatedCost || 0).toFixed(4)} / PC
                </div>
                <div style={{ fontSize: 12, color: '#ffffff', fontWeight: 600 }}>
                  PKR {Number(selectedBatch.unitCostPerGross || ((selectedBatch.unitCostPerPiece || selectedBatch.unitAccumulatedCost || 0) * 144)).toFixed(2)} / GRS
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BatchCostingMarginTable;
